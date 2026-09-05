/*
 * Vdear — Nhật ký lệnh.
 *
 * MỌI THỐNG KÊ TÍNH BẰNG R, KHÔNG BẰNG TIỀN.
 * R = bội số rủi ro: khoảng cách từ entry tới stop-loss được coi là 1 đơn vị.
 * Lệnh chạm TP ở đúng tỉ lệ 1:2 thì lãi +2R dù bạn vào 10 đô hay 10.000 đô.
 * Đây là lựa chọn có chủ đích: đếm bằng tiền thì trang biến thành chỗ khoe lãi,
 * mà con số tiền lại chẳng nói được gì về chất lượng của quyết định. R nói.
 *
 * Đòn bẩy và khối lượng VẪN được ghi lại — chúng là một phần của quyết định —
 * nhưng không đi vào bất kỳ phép thống kê nào.
 *
 * LƯU Ở ĐÂU
 *   - Đã đăng nhập: bảng `journal` trên Supabase, tách theo user_id bằng RLS.
 *   - Chưa đăng nhập: localStorage, ngay trên máy người dùng.
 * Không có tài khoản vẫn dùng được đủ tính năng; đăng nhập chỉ thêm việc đồng
 * bộ giữa các máy. Xem supabase/journal.sql cho lược đồ bảng.
 *
 * Tệp này chia hai phần rõ rệt:
 *   - PHẦN THUẦN (tính R, thống kê, nhóm theo chiều, rút bài học): không đụng
 *     tới mạng hay DOM, và được kiểm bằng tests/journal.test.ts.
 *   - PHẦN LƯU TRỮ: localStorage + Supabase.
 */
(function () {
  var KEY = 'vdear_journal_v1';

  /* =====================================================================
   * PHẦN THUẦN — tính toán
   * ===================================================================*/

  // Number(null) === 0 và Number('') === 0. Không chặn hai giá trị đó thì một
  // lệnh KHÔNG có stop-loss sẽ được đọc thành "stop ở giá 0", và R tính ra là
  // một con số trông rất hợp lý mà hoàn toàn bịa.
  function fin(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /*
   * R thực hiện của một lệnh đã đóng.
   *
   * risk = |entry − sl| là MỘT đơn vị R. Không có SL thì không có mẫu số, và
   * R không định nghĩa được — trả null chứ không lấy đại một con số khác làm
   * mẫu số, vì như vậy là lặng lẽ đổi ý nghĩa của cả bảng thống kê.
   */
  function rOf(t) {
    var entry = fin(t && t.entry), sl = fin(t && t.sl), exit = fin(t && t.closePrice);
    if (entry == null || sl == null || exit == null) return null;
    var risk = Math.abs(entry - sl);
    if (!(risk > 0)) return null;
    var move = t.side === 'SHORT' ? (entry - exit) : (exit - entry);
    return move / risk;
  }

  // R:R theo KẾ HOẠCH lúc vào lệnh (không phải kết quả).
  function plannedRR(t) {
    var entry = fin(t && t.entry), sl = fin(t && t.sl), tp = fin(t && t.tp);
    if (entry == null || sl == null || tp == null) return null;
    var risk = Math.abs(entry - sl);
    if (!(risk > 0)) return null;
    return Math.abs(tp - entry) / risk;
  }

  function isClosed(t) { return t && t.status && t.status !== 'open'; }

  /*
   * Chuỗi thắng/thua dài nhất, tính theo THỨ TỰ ĐÓNG LỆNH chứ không theo thứ
   * tự mở: hai lệnh mở cùng lúc mà đóng cách nhau ba ngày thì chuỗi phải theo
   * lúc đóng, đó mới là trình tự người ta thật sự trải qua.
   */
  function streaks(closed) {
    var byClose = closed.slice().sort(function (a, b) {
      return (a.closedAt || a.at || 0) - (b.closedAt || b.at || 0);
    });
    var bestWin = 0, bestLoss = 0, w = 0, l = 0;
    for (var i = 0; i < byClose.length; i++) {
      var r = rOf(byClose[i]);
      if (r == null || r === 0) { w = 0; l = 0; continue; }
      if (r > 0) { w++; l = 0; if (w > bestWin) bestWin = w; }
      else { l++; w = 0; if (l > bestLoss) bestLoss = l; }
    }
    return { win: bestWin, loss: bestLoss };
  }

  /*
   * Đường vốn theo R: cộng dồn R của các lệnh đã đóng, theo thứ tự đóng.
   * Điểm đầu luôn là 0 để đường bắt đầu từ gốc.
   */
  function equityCurve(trades) {
    var closed = trades.filter(function (t) { return isClosed(t) && rOf(t) != null; })
      .sort(function (a, b) { return (a.closedAt || a.at || 0) - (b.closedAt || b.at || 0); });
    var acc = 0;
    var pts = [{ at: closed.length ? (closed[0].closedAt || closed[0].at) : Date.now(), r: 0, cum: 0 }];
    for (var i = 0; i < closed.length; i++) {
      var r = rOf(closed[i]);
      acc += r;
      pts.push({ at: closed[i].closedAt || closed[i].at, r: r, cum: acc, coin: closed[i].coin });
    }
    return pts;
  }

  function stats(trades) {
    var all = Array.isArray(trades) ? trades : [];
    var open = all.filter(function (t) { return !isClosed(t); });
    var closed = all.filter(function (t) { return isClosed(t) && rOf(t) != null; });

    var wins = 0, losses = 0, totalR = 0, sumWinR = 0, sumLossR = 0;
    for (var i = 0; i < closed.length; i++) {
      var r = rOf(closed[i]);
      totalR += r;
      if (r > 0) { wins++; sumWinR += r; } else if (r < 0) { losses++; sumLossR += r; }
    }

    var rrs = all.map(plannedRR).filter(function (v) { return v != null; });
    var st = streaks(closed);

    return {
      total: all.length,
      open: open.length,
      closed: closed.length,
      wins: wins,
      losses: losses,
      // Không có lệnh nào đóng thì winrate KHÔNG phải 0% — nó là chưa có. Trả
      // null để giao diện hiện "—"; 0% đọc ra là "thua sạch".
      winRate: closed.length ? (wins / closed.length) * 100 : null,
      totalR: closed.length ? totalR : null,
      avgR: closed.length ? totalR / closed.length : null,
      avgWinR: wins ? sumWinR / wins : null,
      avgLossR: losses ? sumLossR / losses : null,
      avgPlannedRR: rrs.length ? rrs.reduce(function (a, b) { return a + b; }, 0) / rrs.length : null,
      bestStreak: st.win,
      worstStreak: st.loss,
    };
  }

  /* ------------------------- nhóm theo chiều ---------------------------- */

  function groupBy(trades, keyFn, labelFn) {
    var m = Object.create(null);
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      if (!isClosed(t) || rOf(t) == null) continue;
      var k = keyFn(t);
      if (k == null) continue;
      k = String(k);
      if (!m[k]) m[k] = { key: k, label: labelFn ? labelFn(t, k) : k, n: 0, wins: 0, totalR: 0 };
      var r = rOf(t);
      m[k].n++; m[k].totalR += r;
      if (r > 0) m[k].wins++;
    }
    return Object.keys(m).map(function (k) {
      var g = m[k];
      g.winRate = g.n ? (g.wins / g.n) * 100 : null;
      g.avgR = g.n ? g.totalR / g.n : null;
      return g;
    }).sort(function (a, b) { return b.n - a.n; });
  }

  // Giờ trong ngày theo MÚI GIỜ MÁY NGƯỜI DÙNG: "tôi hay thua lúc mấy giờ" chỉ
  // có nghĩa với giờ mà chính họ sống, không phải giờ UTC.
  function hourOf(t) { return new Date(t.at).getHours(); }

  // Gộp confluence thành ba mức thay vì để rời 0..5: chia nhỏ quá thì mỗi ô
  // còn hai ba lệnh và tỉ lệ thắng của nó là nhiễu chứ không phải thông tin.
  function confBucket(t) {
    var c = fin(t.confluence);
    if (c == null) return null;
    return c <= 1 ? 'low' : c <= 3 ? 'mid' : 'high';
  }

  function byDimension(trades) {
    return {
      coin: groupBy(trades, function (t) { return t.coin; }),
      side: groupBy(trades, function (t) { return t.side; }),
      hour: groupBy(trades, hourOf).sort(function (a, b) { return Number(a.key) - Number(b.key); }),
      confluence: groupBy(trades, confBucket),
    };
  }

  /* ---------------------------- bài học --------------------------------- */

  /*
   * Rút "bài học" từ các lệnh THUA.
   *
   * Đây là chỗ dễ bịa nhất trong cả tính năng, nên có ba chốt chặn cứng:
   *
   *  1. Cần tối thiểu MIN_LOSSES lệnh thua. Ba lệnh thua thì mọi "quy luật"
   *     rút ra đều là ngẫu nhiên.
   *  2. Yếu tố phải phủ ít nhất COVER phần các lệnh thua.
   *  3. Và quan trọng nhất: tỉ lệ xuất hiện của yếu tố đó trong nhóm THUA phải
   *     CAO HƠN HẲN tỉ lệ của nó trong toàn bộ lệnh (chênh EDGE điểm phần
   *     trăm). Thiếu chốt này thì "70% lệnh thua là lệnh LONG" nghe như một
   *     phát hiện, trong khi sự thật chỉ là 70% lệnh của bạn vốn đã là LONG.
   *
   * Không đủ ba điều kiện thì KHÔNG trả về bài học nào. Im lặng tốt hơn là một
   * kết luận nghe có vẻ sâu sắc mà rỗng.
   */
  var MIN_LOSSES = 5, COVER = 0.6, EDGE = 15;

  function lessons(trades) {
    var closed = trades.filter(function (t) { return isClosed(t) && rOf(t) != null; });
    var losing = closed.filter(function (t) { return rOf(t) < 0; });
    if (losing.length < MIN_LOSSES) {
      return { enough: false, need: MIN_LOSSES, have: losing.length, items: [] };
    }

    var factors = [
      { key: 'journal.lesson.lowConf', test: function (t) { return confBucket(t) === 'low'; } },
      { key: 'journal.lesson.noPa', test: function (t) { return t.paMatch === false; } },
      { key: 'journal.lesson.long', test: function (t) { return t.side === 'LONG'; } },
      { key: 'journal.lesson.short', test: function (t) { return t.side === 'SHORT'; } },
      { key: 'journal.lesson.thinRR', test: function (t) { var v = plannedRR(t); return v != null && v < 1.5; } },
      { key: 'journal.lesson.highLev', test: function (t) { var v = fin(t.leverage); return v != null && v >= 20; } },
      { key: 'journal.lesson.rsiMid', test: function (t) { var v = fin(t.rsi); return v != null && v > 40 && v < 60; } },
    ];

    var items = [];
    for (var i = 0; i < factors.length; i++) {
      var f = factors[i];
      var inLoss = losing.filter(f.test).length;
      var inAll = closed.filter(f.test).length;
      if (!inLoss) continue;
      var lossShare = (inLoss / losing.length) * 100;
      var allShare = (inAll / closed.length) * 100;
      if (lossShare < COVER * 100) continue;
      if (lossShare - allShare < EDGE) continue;
      items.push({
        key: f.key,
        lossShare: lossShare,
        allShare: allShare,
        lossCount: inLoss,
        lossTotal: losing.length,
      });
    }
    items.sort(function (a, b) { return (b.lossShare - b.allShare) - (a.lossShare - a.allShare); });
    return { enough: true, have: losing.length, items: items.slice(0, 3) };
  }

  /* ------------------------------- CSV ---------------------------------- */

  var CSV_COLS = ['id', 'at', 'coin', 'side', 'tf', 'entry', 'tp', 'sl', 'leverage',
    'size', 'confluence', 'rsi', 'paMatch', 'support', 'resistance',
    'status', 'closedAt', 'closePrice', 'r', 'note'];

  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    // Bọc mọi ô có dấu phẩy, nháy kép hoặc xuống dòng. Ghi chú của người dùng
    // rất hay có dấu phẩy, không bọc là lệch cột từ đó trở đi.
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(trades) {
    var lines = [CSV_COLS.join(',')];
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      var r = rOf(t);
      lines.push(CSV_COLS.map(function (c) {
        if (c === 'r') return r == null ? '' : r.toFixed(4);
        if (c === 'at' || c === 'closedAt') return t[c] ? new Date(t[c]).toISOString() : '';
        return csvCell(t[c]);
      }).join(','));
    }
    // \r\n vì Excel trên Windows là nơi tệp này hay được mở nhất.
    return lines.join('\r\n');
  }

  /* =====================================================================
   * PHẦN LƯU TRỮ
   * ===================================================================*/

  function readLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      var a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function writeLocal(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }   // chế độ riêng tư / hết dung lượng
  }

  // Supabase (nếu auth.js đã dựng client). Không có thì im lặng dùng localStorage.
  function sb() {
    return (window.VdearAuth && window.VdearAuth.supabase) || null;
  }

  function newId() {
    return 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  async function list() {
    var s = sb();
    if (s) {
      try {
        var res = await s.from('journal').select('*').order('at', { ascending: false });
        if (!res.error && Array.isArray(res.data)) return res.data.map(fromRow);
      } catch (e) { /* rơi về localStorage */ }
    }
    return readLocal().sort(function (a, b) { return b.at - a.at; });
  }

  // Supabase dùng snake_case, phần còn lại của trang dùng camelCase.
  function toRow(t) {
    return {
      id: t.id, at: t.at, coin: t.coin, symbol: t.symbol, side: t.side, tf: t.tf,
      entry: t.entry, tp: t.tp, sl: t.sl, leverage: t.leverage, size: t.size,
      confluence: t.confluence, rsi: t.rsi, pa_match: t.paMatch,
      support: t.support, resistance: t.resistance,
      status: t.status, closed_at: t.closedAt, close_price: t.closePrice, note: t.note,
    };
  }
  function fromRow(r) {
    return {
      id: r.id, at: Number(r.at), coin: r.coin, symbol: r.symbol, side: r.side, tf: r.tf,
      entry: fin(r.entry), tp: fin(r.tp), sl: fin(r.sl),
      leverage: fin(r.leverage), size: fin(r.size),
      confluence: fin(r.confluence), rsi: fin(r.rsi), paMatch: r.pa_match,
      support: fin(r.support), resistance: fin(r.resistance),
      status: r.status, closedAt: r.closed_at ? Number(r.closed_at) : null,
      closePrice: fin(r.close_price), note: r.note || '',
    };
  }

  async function add(entry) {
    var t = Object.assign({
      id: newId(), at: Date.now(), status: 'open',
      closedAt: null, closePrice: null, note: '',
    }, entry);

    var s = sb();
    if (s) {
      try {
        var res = await s.from('journal').insert(toRow(t));
        if (!res.error) return t;
      } catch (e) { /* rơi về localStorage */ }
    }
    var l = readLocal(); l.unshift(t); writeLocal(l);
    return t;
  }

  async function update(id, patch) {
    var s = sb();
    if (s) {
      try {
        var res = await s.from('journal').update(toRow(Object.assign({ id: id }, patch))).eq('id', id);
        if (!res.error) return true;
      } catch (e) { /* rơi về localStorage */ }
    }
    var l = readLocal();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) l[i] = Object.assign(l[i], patch);
    return writeLocal(l);
  }

  async function remove(id) {
    var s = sb();
    if (s) {
      try {
        var res = await s.from('journal').delete().eq('id', id);
        if (!res.error) return true;
      } catch (e) { /* rơi về localStorage */ }
    }
    return writeLocal(readLocal().filter(function (t) { return t.id !== id; }));
  }

  /* --------------------- theo dõi giá: chạm TP hay SL ------------------- */

  /*
   * Quyết định trạng thái từ giá HIỆN TẠI.
   *
   * Đây là một phép xấp xỉ và phải nói thẳng: chỉ nhìn giá tại thời điểm kiểm
   * tra, nên một cây nến quét qua TP rồi quay đầu giữa hai lần kiểm sẽ không
   * được ghi nhận. Muốn chính xác thì phải soi từng cây nến kể từ lúc vào
   * lệnh — sẽ làm sau; hiện tại người dùng luôn có thể tự đóng lệnh với giá
   * mình muốn, và đó mới là con số họ tin.
   */
  function hitOf(t, price) {
    if (!t || isClosed(t) || !(price > 0)) return null;
    var tp = fin(t.tp), sl = fin(t.sl);
    if (t.side === 'SHORT') {
      if (tp != null && price <= tp) return 'tp';
      if (sl != null && price >= sl) return 'sl';
    } else {
      if (tp != null && price >= tp) return 'tp';
      if (sl != null && price <= sl) return 'sl';
    }
    return null;
  }

  window.VdearJournal = {
    // phần thuần (được kiểm bằng tests/journal.test.ts)
    rOf: rOf, plannedRR: plannedRR, isClosed: isClosed,
    stats: stats, byDimension: byDimension, lessons: lessons,
    equityCurve: equityCurve, toCSV: toCSV, hitOf: hitOf,
    confBucket: confBucket,
    MIN_LOSSES: MIN_LOSSES,
    // phần lưu trữ
    list: list, add: add, update: update, remove: remove,
    _local: readLocal, _writeLocal: writeLocal, _key: KEY,
  };
})();

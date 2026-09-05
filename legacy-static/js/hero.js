/*
 * Hero — thẻ Signal Radar và Trading Plan.
 *
 * MỌI CON SỐ Ở ĐÂY LÀ SỐ THẬT. Bản thiết kế có cho sẵn giá trị mẫu (RSI 27.4,
 * support $108,420, entry $108,650...) nhưng chính bản đó cũng ghi "không tạo
 * mock data nếu website đã có real data" — mà trang này có. Nên lấy bố cục của
 * thiết kế, còn số thì tính từ nến thật qua VdearTA.combatSignal().
 *
 * Chưa lấy được nến -> để "—" và ghi rõ chưa có dữ liệu. Không điền số mẫu.
 *
 * Chọn coin và khung thời gian: mọi ô trong thẻ (điểm, hướng, RSI, hỗ trợ/kháng
 * cự, price action, hội tụ, entry/TP/SL, R:R, sparkline, giá) đều tính lại từ
 * CÙNG một mảng nến của lựa chọn hiện tại. Không có ô nào giữ lại giá trị của
 * coin trước — đổi coin mà số cũ còn nằm đó là kiểu sai nguy hiểm nhất ở đây.
 */
(function () {
  // Chữ hiển thị lấy qua i18n. t() tự rơi về tiếng Việt khi thiếu bản dịch;
  // i18n.js được nạp trước mọi module nên nhánh dự phòng dưới đây gần như
  // không bao giờ chạy, để đó cho chắc.
  const T = (k, v) => (window.VdearI18n ? window.VdearI18n.t(k, v) : k);

  const $ = (id) => document.getElementById(id);
  const API = window.VdearAPI, TA = window.VdearTA, CFG = window.VDEAR_CONFIG;
  const R = 52;                                   // bán kính vòng cung
  const CIRC = 2 * Math.PI * R;                   // 326.7
  const STORE = 'vdear.hero.pick';
  const REFRESH_MS = 90000;

  // Khung thời gian cho hero: bỏ những khung mà config đánh dấu `note`, tức là
  // sàn KHÔNG có nến đúng độ dài đó và đang mượn tạm khung khác ('10h' dùng nến
  // 12h). Hiện hai nút cho ra y hệt một kết quả thì người đọc sẽ tin là hai
  // khung khác nhau — đó là nói dối bằng giao diện.
  const TFS = (CFG && CFG.timeframes ? CFG.timeframes : []).filter((t) => !t.note);

  let state = { base: 'BTC', symbol: 'BTCUSDT', tfId: (CFG && CFG.defaultTimeframe) || '4h' };
  let market = null;      // danh sách coin cho ô tìm kiếm
  let seq = 0;            // chống kết quả về trễ đè lên lựa chọn mới
  let timer = null;

  /* ------------------------------ tiện ích ------------------------------ */

  function money(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return '$' + n.toLocaleString('en-US', {
      minimumFractionDigits: n < 1 ? 6 : 2, maximumFractionDigits: n < 1 ? 6 : 2,
    });
  }

  function pct(n) {
    if (n == null || !Number.isFinite(n)) return '';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  /* Đếm từ giá trị đang hiện tới giá trị mới. Máy đặt giảm chuyển động -> gán
     thẳng. Trả về hàm huỷ để lần cập nhật sau dừng được vòng đang chạy. */
  const running = new WeakMap();
  function countTo(el, to, fmt, ms) {
    if (!el) return;
    const prev = running.get(el);
    if (prev) cancelAnimationFrame(prev);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = parseFloat(String(el.textContent).replace(/[^0-9.-]/g, ''));
    const a = Number.isFinite(from) ? from : 0;
    if (reduce || a === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = ms || 700;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(a + (to - a) * eased);
      if (k < 1) running.set(el, requestAnimationFrame(step));
      else running.delete(el);
    })(t0);
  }

  /* Đường giá thu nhỏ, vẽ từ chính những nến đã dùng để tính tín hiệu. */
  function sparkline(svg, candles) {
    if (!svg) return;
    if (!candles || candles.length < 4) { svg.innerHTML = ''; return; }
    const pts = candles.slice(-48).map((c) => c.close);
    const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    const span = hi - lo || 1;
    const W = 280, H = 44, pad = 3;
    const xy = pts.map((v, i) => [
      (i / (pts.length - 1)) * W,
      H - pad - ((v - lo) / span) * (H - pad * 2),
    ]);
    const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    svg.innerHTML = '<path class="hx-spark-fill" d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z"/>'
                  + '<path d="' + d + '"/>';
  }

  /* Xoá sạch mọi ô số. Gọi trước mỗi lần đổi coin/khung để không còn số cũ. */
  function clearAll() {
    ['hxRsi', 'hxSup', 'hxRes', 'hxPa', 'hxConf', 'hxEntry', 'hxTp', 'hxSl', 'hxRr', 'hxPrice']
      .forEach((id) => { const e = $(id); if (e) { e.textContent = '—'; e.className = e.id === 'hxTp' ? 'up' : e.id === 'hxSl' ? 'down' : ''; } });
    const sc = $('hxScore'); if (sc) sc.textContent = '—';
    const arc = $('hxArc'); if (arc) { arc.classList.remove('up', 'down'); arc.style.strokeDashoffset = String(CIRC); }
    sparkline($('hxSpark'), null);
    rain('setTrend', '');
  }

  /* Mưa nền là trang trí: thiếu module hay lỗi thì thẻ vẫn chạy như thường. */
  function rain(fn, arg) {
    const r = window.VdearRadarRain;
    if (r && typeof r[fn] === 'function') { try { r[fn](arg); } catch (e) { /* bỏ qua */ } }
  }

  // Nhận KHOÁ chứ không nhận câu đã dựng sẵn, để đổi ngôn ngữ là dịch lại được
  // đúng câu đang hiện — thẻ có thể đứng ở trạng thái lỗi rất lâu.
  function fail(key, vars) {
    const radar = $('hxRadar');
    if (radar) radar.setAttribute('aria-busy', 'false');
    last = { fail: key, vars: vars || null };
    const side = $('hxSide');
    if (side) { side.textContent = T(key, vars); side.className = ''; }
  }

  /* ----------------------------- vẽ tín hiệu ---------------------------- */

  // Giữ lại tín hiệu vừa vẽ để đổi ngôn ngữ là vẽ lại được ngay, không phải
  // gọi lại API — nhãn Bullish/Bearish và "Chưa xác nhận" nằm trong đó.
  let last = null;

  function paint(sig, candles) {
    const dir = sig.side === 'LONG' ? 'up' : sig.side === 'SHORT' ? 'down' : '';
    const label = T(sig.side === 'LONG' ? 'radar.bullish' : sig.side === 'SHORT' ? 'radar.bearish' : 'radar.neutral');
    rain('setTrend', dir);
    const score = Math.max(0, Math.min(100, Math.round(sig.score || 0)));

    countTo($('hxScore'), score, (v) => String(Math.round(v)));
    const sideEl = $('hxSide');
    sideEl.textContent = label;
    sideEl.className = dir;

    const arc = $('hxArc');
    arc.classList.remove('up', 'down');
    if (dir) arc.classList.add(dir);
    // Đặt ở khung sau để trình duyệt kịp ghi nhận trạng thái đầu, nếu không
    // transition bị bỏ qua và vòng cung nhảy thẳng tới đích.
    requestAnimationFrame(() => { arc.style.strokeDashoffset = String(CIRC * (1 - score / 100)); });

    const rsiEl = $('hxRsi');
    rsiEl.textContent = sig.rsi == null ? '—' : sig.rsi.toFixed(1);
    rsiEl.className = sig.rsi >= 70 ? 'down' : sig.rsi <= 30 ? 'up' : '';

    const sr = TA.supportResistance(candles, sig.price) || { supports: [], resistances: [] };
    $('hxSup').textContent = sr.supports[0] ? money(sr.supports[0].price) : '—';
    $('hxRes').textContent = sr.resistances[0] ? money(sr.resistances[0].price) : '—';

    const pa = $('hxPa');
    pa.textContent = T(sig.paMatch ? 'sig.confirmed' : 'sig.unconfirmed');
    pa.className = sig.paMatch ? 'up' : '';

    // combatSignal đếm 5 điều kiện hội tụ (RSI đảo chiều, gần S&R, price action
    // cùng hướng, breakout, volume) nên thang là /5. Trước đây ô này ghi "/100"
    // — cùng một con số 2 mà mẫu số sai thì đọc ra hai nghĩa hoàn toàn khác.
    const conf = Math.max(0, Math.min(5, Math.round(sig.confluence || 0)));
    countTo($('hxConf'), conf, (v) => Math.round(v) + '/5');

    const plan = sig.plan || null;
    if (plan) {
      $('hxEntry').textContent = money(plan.entry);
      $('hxTp').textContent = money(plan.tp);
      $('hxSl').textContent = money(plan.sl);
      // R:R tính từ chính entry/tp/sl vừa hiện — không gõ sẵn tỉ lệ.
      const reward = Math.abs(plan.tp - plan.entry);
      const risk = Math.abs(plan.entry - plan.sl);
      $('hxRr').textContent = risk > 0 ? '1 : ' + (reward / risk).toFixed(1) : '—';
    } else {
      // Tín hiệu trung tính thì KHÔNG có kế hoạch vào lệnh. Để trống, không
      // giữ lại kế hoạch của coin/khung trước.
      ['hxEntry', 'hxTp', 'hxSl', 'hxRr'].forEach((id) => { $(id).textContent = '—'; });
    }

    $('hxPrice').textContent = money(sig.price);
    sparkline($('hxSpark'), candles);
  }

  /* Nạp nến cho lựa chọn hiện tại rồi vẽ lại toàn bộ thẻ. */
  // quiet = làm mới nền (hẹn giờ, quay lại tab): không làm mờ thẻ, không đổi
  // chữ trạng thái, vì nhấp nháy mỗi 90 giây là thứ gây khó chịu vô cớ.
  async function load(quiet) {
    const radar = $('hxRadar');
    if (!radar || !API || !TA || !TA.combatSignal) return;
    const my = ++seq;
    if (!quiet) {
      radar.setAttribute('aria-busy', 'true');
      $('hxSide').textContent = T('st.calculating');
      $('hxSide').className = '';
    }

    const coin = (market && market.find((c) => c.base === state.base)) || state.base;
    let candles = null;
    try { candles = await API.klinesMulti(coin, state.tfId, 200); } catch (e) { candles = null; }
    if (my !== seq) return;                       // đã đổi lựa chọn, bỏ kết quả này

    // Nạp nền hỏng thì GIỮ NGUYÊN số đang hiện, chỉ ghi lại ở lần sau; xoá sạch
    // một thẻ đang đúng chỉ vì một request rớt mạng là làm hỏng thứ đang tốt.
    if (!candles || candles.length < 60) {
      if (!quiet) { clearAll(); fail('sig.notEnough', { tf: tfLabel() }); }
      return;
    }

    let sig = null;
    try { sig = TA.combatSignal(candles); } catch (e) { sig = null; }
    if (my !== seq) return;
    if (!sig) { if (!quiet) { clearAll(); fail('sig.noSignal'); } return; }

    radar.setAttribute('aria-busy', 'false');
    last = { sig: sig, candles: candles };
    paint(sig, candles);
  }

  function tfLabel() {
    const tf = TFS.find((t) => t.id === state.tfId);
    return tf ? tf.id.toUpperCase() : String(state.tfId).toUpperCase();
  }

  /* ------------------------- khung thời gian ---------------------------- */

  function buildTfs() {
    const box = $('hxTfs');
    if (!box) return;
    box.innerHTML = '';
    TFS.forEach((tf) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = tf.id.toUpperCase();
      b.title = tf.label;
      b.dataset.tf = tf.id;
      b.setAttribute('aria-pressed', String(tf.id === state.tfId));
      b.addEventListener('click', () => {
        if (state.tfId === tf.id) return;
        state.tfId = tf.id;
        save();
        markTfs();
        load();
      });
      box.appendChild(b);
    });
  }

  function markTfs() {
    const box = $('hxTfs');
    if (!box) return;
    [].forEach.call(box.children, (b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tf === state.tfId));
    });
  }

  /* ---------------------------- chọn coin ------------------------------- */

  let popOpen = false, cursor = -1, shown = [];

  function setSymbol(coin) {
    state.base = coin.base || coin;
    state.symbol = coin.symbol || (state.base + 'USDT');
    $('hxSymTxt').textContent = state.symbol;
    save();
    clearAll();
    rain('setCoin', state.base);
    load();
  }

  function renderList(q) {
    const ul = $('hxList'), empty = $('hxEmpty');
    if (!ul) return;
    const query = String(q || '').trim().toUpperCase();
    const src = market || [];
    if (query) {
      // Khớp từ đầu trước, rồi mới khớp giữa chuỗi: gõ "SOL" thì SOL đứng trên
      // RESOLV, chứ không phải theo thứ tự khối lượng.
      shown = src.filter((c) => c.base.indexOf(query) === 0)
        .concat(src.filter((c) => c.base.indexOf(query) > 0)).slice(0, 60);
    } else {
      // Danh sách trống query bị cắt còn 60 dòng, mà thứ tự là theo khối lượng
      // — coin đang xem hoàn toàn có thể nằm ngoài 60 dòng đó và người dùng mở
      // bảng ra không thấy mình đang ở đâu. Ghim nó lên đầu.
      const cur = src.find((c) => c.base === state.base);
      const rest = src.filter((c) => c !== cur).slice(0, cur ? 59 : 60);
      shown = cur ? [cur].concat(rest) : rest;
    }
    ul.innerHTML = '';
    shown.forEach((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === cursor));
      if (c.base === state.base) li.className = 'on';
      const b = document.createElement('span');
      b.className = 'hx-po-b'; b.textContent = c.base;
      const p = document.createElement('span');
      p.className = 'hx-po-p'; p.textContent = money(c.price);
      const ch = document.createElement('span');
      ch.className = 'hx-po-c ' + (c.change > 0 ? 'up' : c.change < 0 ? 'down' : '');
      ch.textContent = pct(c.change);
      li.appendChild(b); li.appendChild(p); li.appendChild(ch);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); setSymbol(c); closePop(); });
      ul.appendChild(li);
    });
    const none = shown.length === 0;
    if (empty) {
      empty.hidden = !none;
      empty.textContent = market ? 'Không có coin nào khớp.' : 'Đang nạp danh sách coin…';
      if (!market) empty.hidden = false;
    }
  }

  function moveCursor(d) {
    if (!shown.length) return;
    cursor = (cursor + d + shown.length) % shown.length;
    const ul = $('hxList');
    [].forEach.call(ul.children, (li, i) => li.setAttribute('aria-selected', String(i === cursor)));
    const el = ul.children[cursor];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function openPop() {
    const pop = $('hxPop'), btn = $('hxSymBtn');
    if (!pop || popOpen) return;
    popOpen = true; cursor = -1;
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    $('hxQ').value = '';
    renderList('');
    $('hxQ').focus();
    if (!market) ensureMarket();
  }

  function closePop() {
    const pop = $('hxPop'), btn = $('hxSymBtn');
    if (!pop || !popOpen) return;
    popOpen = false;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  async function ensureMarket() {
    if (market || !API.getMarket) return;
    try { market = await API.getMarket(); } catch (e) { market = null; }
    if (market && popOpen) renderList($('hxQ').value);
    syncStats();
    // Ký hiệu cặp lấy đúng theo sàn (vài coin không phải base+USDT).
    if (market) {
      const c = market.find((x) => x.base === state.base);
      if (c && c.symbol) { state.symbol = c.symbol; $('hxSymTxt').textContent = c.symbol; }
    }
  }

  /* Thanh số liệu bên trái phải nói đúng cái hero bên phải đang cho dùng.
     "11 timeframes" trong khi bộ chọn có 10 nút là một câu sai ngay trên cùng
     một màn hình. Số coin và số sàn cũng lấy từ chính danh sách đã nạp.
     Ba ô này KHÔNG dùng data-countup của fx.js: fx đọc mốc đích một lần lúc
     khởi động rồi giữ trong closure, nên sửa thuộc tính sau khi dữ liệu về vừa
     không có tác dụng vừa bị hiệu ứng đang chạy ghi đè ngược lại. */
  function setStat(id, value) {
    const el = $(id);
    if (!el || !Number.isFinite(value) || value <= 0) return;
    countTo(el, value, (v) => Math.round(v).toLocaleString('en-US'), 900);
  }

  function syncStats() {
    setStat('hxStTf', TFS.length);
    // Số sàn lấy từ cấu hình, không đếm số sàn vừa trả lời: một sàn lỗi mạng
    // trong 30 giây không làm sản phẩm bớt đi một sàn, mà câu dưới tiêu đề vẫn
    // đang kể tên đủ bốn cái.
    if (CFG && CFG.exchanges) setStat('hxStEx', Object.keys(CFG.exchanges).length);
    if (market && market.length) setStat('hxStCoins', market.length);
  }

  function wirePicker() {
    const btn = $('hxSymBtn'), q = $('hxQ'), pop = $('hxPop');
    if (!btn || !q || !pop) return;
    btn.addEventListener('click', () => (popOpen ? closePop() : openPop()));
    q.addEventListener('input', () => { cursor = -1; renderList(q.value); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = shown[cursor >= 0 ? cursor : 0];
        if (pick) { setSymbol(pick); closePop(); btn.focus(); }
      } else if (e.key === 'Escape') { e.preventDefault(); closePop(); btn.focus(); }
    });
    document.addEventListener('mousedown', (e) => {
      if (!popOpen) return;
      if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closePop();
    });
  }

  /* ----------------------------- ghi nhớ -------------------------------- */

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ base: state.base, tfId: state.tfId })); }
    catch (e) { /* chế độ riêng tư: bỏ qua, không phải lỗi */ }
  }

  function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { saved = null; }
    if (!saved) return;
    if (typeof saved.base === 'string' && /^[A-Z0-9]{2,12}$/.test(saved.base)) {
      state.base = saved.base; state.symbol = saved.base + 'USDT';
    }
    if (TFS.some((t) => t.id === saved.tfId)) state.tfId = saved.tfId;
  }

  /* ---------------------------- làm mới --------------------------------- */

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) load(true); }, REFRESH_MS);
  }

  function init() {
    if (!$('hxRadar') || !API || !TA || !TA.combatSignal) return;
    if (!TFS.length) { const b = $('hxTfs'); if (b) b.hidden = true; }
    restore();
    $('hxSymTxt').textContent = state.symbol;
    buildTfs();
    syncStats();
    wirePicker();
    rain('setCoin', state.base);
    load();
    ensureMarket();
    schedule();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
    window.addEventListener('vdear:langchange', () => {
      if (!last) return;
      if (last.fail) fail(last.fail, last.vars);
      else paint(last.sig, last.candles);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

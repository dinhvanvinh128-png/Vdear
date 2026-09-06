/*
 * Vdearypto — PHIÊN BẢN TÍN HIỆU VÀ CHẾ ĐỘ CHẠY NGẦM (shadow mode).
 *
 * Mục 6 của docs/INFRA-SCALING.md.
 *
 * VẤN ĐỀ NÓ GIẢI
 * --------------
 * Đổi logic tín hiệu là đổi ý nghĩa của MỌI con số winrate lịch sử. Bảng ở
 * /stats nói "chiến lược Hội tụ thắng 47% trong trend tăng" — câu đó chỉ đúng
 * với đúng bộ điều kiện đã sinh ra 47% ấy. Sửa một ngưỡng rồi vẫn hiện 47% là
 * nói về một chiến lược không còn tồn tại.
 *
 * CÁCH LÀM
 * --------
 * Mỗi bộ logic có một `version`. Khi có bản mới, chạy SONG SONG cả hai: bản cũ
 * vẫn là bản hiện ra cho người dùng, bản mới chạy ngầm và chỉ GHI SỔ. Sau đủ
 * thời gian và đủ mẫu thì so, rồi mới chuyển.
 *
 * BA RÀNG BUỘC KHÔNG ĐƯỢC NỚI
 * ---------------------------
 * 1. Bản chạy ngầm KHÔNG BAO GIỜ hiện ra cho người dùng. Hàm `visible()` là
 *    nơi duy nhất quyết định điều đó.
 * 2. Không so hai bản trước khi đủ mẫu tối thiểu VÀ đủ thời gian tối thiểu.
 *    Hai tuần với 12 tín hiệu không phải một phép so sánh.
 * 3. Chuyển bản là một hành động CÓ CHỦ Ý của con người. Module này trả về
 *    "đủ điều kiện để cân nhắc chuyển", không tự chuyển.
 *
 * Thuần tính: không DOM, không mạng.
 */
(function (root) {
  'use strict';

  // Hai tuần theo yêu cầu.
  var MIN_SHADOW_MS = 14 * 24 * 3600 * 1000;
  // Dưới ngần này thì mọi so sánh chỉ là nhiễu — cùng ngưỡng với ma trận
  // winrate ở js/regime.js, cố ý giữ một con số duy nhất cho cả hệ thống.
  var MIN_SAMPLE = 30;

  function num(x) {
    if (x == null || x === '') return null;
    var n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  /*
   * Sổ đăng ký phiên bản.
   *
   * `active`  — bản đang hiện ra cho người dùng.
   * `shadow`  — bản chạy ngầm, có thể null.
   */
  function createRegistry(opts) {
    var o = opts || {};
    var versions = {};
    var active = null;
    var shadow = null;

    function register(version, fn, meta) {
      if (!version || typeof fn !== 'function') return false;
      versions[version] = { version: version, fn: fn, meta: meta || {} };
      if (!active) active = version;
      return true;
    }

    function setActive(v) {
      if (!versions[v]) return false;
      active = v;
      if (shadow === v) shadow = null;   // không thể vừa hiện vừa chạy ngầm
      return true;
    }

    function setShadow(v) {
      if (v == null) { shadow = null; return true; }
      if (!versions[v] || v === active) return false;
      shadow = v;
      return true;
    }

    /*
     * Chạy cả hai bản trên cùng một đầu vào.
     *
     * Trả về { visible, shadow } — `visible` là thứ giao diện được phép dùng.
     * Bản ngầm hỏng thì KHÔNG được làm hỏng bản hiện: nó chạy trong try riêng
     * và lỗi được ghi lại chứ không ném ra ngoài.
     */
    function run(input) {
      var out = { version: active, visible: null, shadow: null, shadowVersion: shadow, errors: [] };
      if (versions[active]) {
        out.visible = versions[active].fn(input);
      }
      if (shadow && versions[shadow]) {
        try { out.shadow = versions[shadow].fn(input); }
        catch (e) { out.errors.push(String((e && e.message) || e)); }
      }
      return out;
    }

    return {
      register: register,
      setActive: setActive,
      setShadow: setShadow,
      active: function () { return active; },
      shadow: function () { return shadow; },
      list: function () { return Object.keys(versions); },
      meta: function (v) { return versions[v] ? versions[v].meta : null; },
      run: run,
      // Tên hàm cố ý dài: nơi duy nhất được phép quyết định cái gì hiện ra.
      visible: function (result) { return result ? result.visible : null; },
    };
  }

  /* ---------------------------- sổ tín hiệu ----------------------------- */

  /*
   * Một bản ghi tín hiệu, có `version` để về sau còn tách được.
   * `shadow: true` nghĩa là tín hiệu này CHƯA từng hiện ra cho ai.
   */
  function record(version, signal, opts) {
    var o = opts || {};
    return {
      version: version,
      at: num(o.at) != null ? num(o.at) : Date.now(),
      coin: o.coin || null,
      tf: o.tf || null,
      shadow: !!o.shadow,
      side: signal ? signal.side : null,
      confluence: signal ? signal.confluence : null,
      score: signal ? signal.score : null,
      // Kết quả điền sau khi lệnh dứt. null = chưa biết, KHÁC với thua.
      outcome: null,
      r: null,
    };
  }

  /*
   * So hai phiên bản trên cùng một khoảng thời gian.
   *
   * Chỉ so những bản ghi ĐÃ CÓ KẾT QUẢ. Bản ghi chưa dứt mà tính vào thì bản
   * nào sinh ít tín hiệu hơn sẽ trông tốt hơn một cách giả tạo, vì phần chưa
   * dứt của nó chiếm tỉ trọng nhỏ hơn.
   */
  function compare(records, versionA, versionB, opts) {
    var o = opts || {};
    var minSample = num(o.minSample) || MIN_SAMPLE;
    var minMs = num(o.minMs) != null ? num(o.minMs) : MIN_SHADOW_MS;

    function side(v) {
      var rows = (records || []).filter(function (r) {
        return r && r.version === v && r.outcome != null;
      });
      var wins = 0, rSum = 0, first = null, last = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].outcome === 'win') wins++;
        var rr = num(rows[i].r);
        if (rr != null) rSum += rr;
        if (first == null || rows[i].at < first) first = rows[i].at;
        if (last == null || rows[i].at > last) last = rows[i].at;
      }
      return {
        version: v, trades: rows.length, wins: wins,
        winRate: rows.length ? wins / rows.length * 100 : null,
        expectancyR: rows.length ? rSum / rows.length : null,
        firstAt: first, lastAt: last,
        spanMs: (first != null && last != null) ? last - first : 0,
      };
    }

    var a = side(versionA), b = side(versionB);
    var enoughSample = a.trades >= minSample && b.trades >= minSample;
    var enoughTime = a.spanMs >= minMs && b.spanMs >= minMs;

    return {
      a: a, b: b,
      minSample: minSample, minMs: minMs,
      enoughSample: enoughSample,
      enoughTime: enoughTime,
      // "Đủ điều kiện để CÂN NHẮC chuyển" — không phải "hãy chuyển".
      readyToCompare: enoughSample && enoughTime,
      // Chênh lệch chỉ có nghĩa khi đã đủ điều kiện; chưa đủ thì trả null chứ
      // không trả một con số để người ta lỡ đọc.
      winRateDelta: (enoughSample && enoughTime && a.winRate != null && b.winRate != null)
        ? b.winRate - a.winRate : null,
      expectancyDelta: (enoughSample && enoughTime && a.expectancyR != null && b.expectancyR != null)
        ? b.expectancyR - a.expectancyR : null,
    };
  }

  root.VdearSignalVersion = {
    MIN_SHADOW_MS: MIN_SHADOW_MS,
    MIN_SAMPLE: MIN_SAMPLE,
    createRegistry: createRegistry,
    record: record,
    compare: compare,
  };
})(typeof self !== 'undefined' ? self : this);

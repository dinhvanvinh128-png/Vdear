/*
 * Vdear — "Tạo ảnh chia sẻ": vẽ một tấm PNG tóm tắt tín hiệu.
 *
 * Hai tỉ lệ: 1080×1920 (dọc, cho Story/Reels) và 1200×630 (ngang, cho OG image).
 *
 * VỀ FONT TIẾNG VIỆT
 * ------------------
 * Canvas không chờ font: gọi fillText trước khi font tải xong thì trình duyệt
 * vẽ bằng font dự phòng, và chữ có dấu ra sai hoặc thành ô vuông. Nên trước
 * mỗi lần vẽ, hàm này gọi document.fonts.load() cho ĐÚNG các cỡ chữ sẽ dùng
 * rồi await document.fonts.ready.
 *
 * Không nhúng font dạng base64 vào tệp: một bộ Inter đủ dấu tiếng Việt nặng
 * vài trăm KB, nhúng vào là mọi người tải trang đều phải cõng nó dù không bao
 * giờ bấm nút này. Trang vốn đã nạp Inter (có dải Vietnamese) từ Google Fonts;
 * việc cần làm là CHỜ nó, không phải chép lại nó. Nếu vì lý do gì font ngoài
 * không tải được, chuỗi dự phòng vẫn toàn font hệ thống có dấu tiếng Việt.
 *
 * MỌI SỐ TRÊN ẢNH ĐỀU DO NGƯỜI GỌI TRUYỀN VÀO. Tệp này không tính lại chỉ báo
 * nào — ảnh phải khớp đúng thứ người dùng vừa nhìn thấy trên màn hình.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };

  var STACK = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  var MONO = "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace";

  /*
   * Ba nền để đăng nhiều ngày không bị nhìn ra là một cái khuôn. Chỉ đổi nền và
   * sắc độ, KHÔNG đổi màu xanh/đỏ của hướng lệnh — màu đó mang nghĩa.
   */
  var PRESETS = [
    { id: 'night', bg: ['#0A0906', '#141019'], line: 'rgba(216,163,43,0.16)', ink: '#EDE7D6', dim: '#9A9078', gold: '#D8A32B' },
    { id: 'ink', bg: ['#07090E', '#0E1A22'], line: 'rgba(78,168,196,0.16)', ink: '#E6EEF2', dim: '#8FA3AD', gold: '#4EA8C4' },
    { id: 'paper', bg: ['#F6F4EC', '#E9E4D6'], line: 'rgba(20,16,6,0.14)', ink: '#161309', dim: '#6B644F', gold: '#A9772A' },
  ];
  var UP = '#4FB477', DOWN = '#E0574F';

  var SIZES = {
    portrait: { w: 1080, h: 1920 },
    landscape: { w: 1200, h: 630 },
  };

  function fmtPrice(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    var a = Math.abs(v);
    var d = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
    return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: d });
  }

  /* --------------------------- chuẩn bị font --------------------------- */

  async function ensureFonts(specs) {
    if (!document.fonts || !document.fonts.load) return;
    try {
      // Nạp kèm CHÍNH chuỗi sẽ vẽ: Google Fonts cắt font theo unicode-range,
      // nên phải nói rõ có chữ tiếng Việt thì dải Vietnamese mới được tải.
      var probe = 'ĂÂĐÊÔƠƯăâđêôơư ếốệ 0123456789';
      await Promise.all(specs.map(function (s) {
        return document.fonts.load(s, probe).catch(function () { return null; });
      }));
      await document.fonts.ready;
    } catch (e) { /* vẫn vẽ, chỉ là có thể rơi về font hệ thống */ }
  }

  /* ------------------------------- vẽ ---------------------------------- */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Cắt chữ theo BỀ RỘNG THẬT đo trên canvas, không cắt theo số ký tự: tên coin
  // dài ngắn khác nhau, cắt theo ký tự thì chỗ tràn chỗ hụt.
  function ellipsis(ctx, text, max) {
    var s = String(text == null ? '' : text);
    if (ctx.measureText(s).width <= max) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }

  function miniChart(ctx, candles, x, y, w, h, P) {
    if (!candles || candles.length < 2) return;
    var n = Math.min(60, candles.length);
    var slice = candles.slice(candles.length - n);
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < slice.length; i++) {
      if (slice[i].low < lo) lo = slice[i].low;
      if (slice[i].high > hi) hi = slice[i].high;
    }
    if (!(hi > lo)) return;
    var bw = w / n, yFor = function (v) { return y + h - ((v - lo) / (hi - lo)) * h; };

    for (var j = 0; j < slice.length; j++) {
      var c = slice[j];
      var cx = x + j * bw + bw / 2;
      var up = c.close >= c.open;
      ctx.strokeStyle = up ? UP : DOWN;
      ctx.fillStyle = up ? UP : DOWN;
      ctx.lineWidth = Math.max(1, bw * 0.10);
      ctx.beginPath(); ctx.moveTo(cx, yFor(c.high)); ctx.lineTo(cx, yFor(c.low)); ctx.stroke();
      var top = yFor(Math.max(c.open, c.close));
      var bh = Math.max(1, Math.abs(yFor(c.open) - yFor(c.close)));
      ctx.fillRect(cx - bw * 0.32, top, Math.max(1, bw * 0.64), bh);
    }
    ctx.strokeStyle = P.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  /*
   * `d` là ảnh chụp tín hiệu do người gọi truyền vào:
   *   { coin, symbol, side, price, rsi, support, resistance, confluence,
   *     entry, tp, sl, tf, candles, logo (HTMLImageElement | null) }
   *
   * HAI BỐ CỤC KHÁC HẲN NHAU, không phải một bố cục co giãn.
   * 1080×1920 cao gấp ba lần rộng, 1200×630 thì rộng gấp đôi cao. Dùng chung
   * một cột dọc cho cả hai thì bản ngang tràn hết nội dung ra ngoài mép dưới —
   * đúng lỗi đã gặp ở lần vẽ đầu.
   */
  async function draw(canvas, d, opts) {
    var size = SIZES[(opts && opts.ratio) || 'portrait'];
    var P = PRESETS[Math.max(0, Math.min(PRESETS.length - 1, (opts && opts.preset) || 0))];
    var tall = size.h > size.w;
    var S = size.w / 1080;

    canvas.width = size.w; canvas.height = size.h;
    var ctx = canvas.getContext('2d');
    var f = function (weight, px, mono) {
      return weight + ' ' + Math.round(px * S) + 'px ' + (mono ? MONO : STACK);
    };
    await ensureFonts([f(700, 62), f(600, 28), f(500, 22), f(700, 76, true), f(700, 34, true)]);

    var g = ctx.createLinearGradient(0, 0, size.w, size.h);
    g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size.w, size.h);
    ctx.textBaseline = 'top';

    var ui = { ctx: ctx, P: P, S: S, f: f, tall: tall, w: size.w, h: size.h };
    if (tall) layoutTall(ui, d); else layoutWide(ui, d);
    return canvas;
  }

  /* ---- những khối dùng chung cho cả hai bố cục ---- */

  function header(ui, d, x, y, maxW) {
    var ctx = ui.ctx, P = ui.P, S = ui.S, f = ui.f;
    var logoSize = Math.round((ui.tall ? 92 : 76) * S);
    if (d.logo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + logoSize / 2, y + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      try { ctx.drawImage(d.logo, x, y, logoSize, logoSize); } catch (e) { /* ảnh hỏng */ }
      ctx.restore();
    }
    var tx = x + (d.logo ? logoSize + Math.round(24 * S) : 0);
    ctx.fillStyle = P.ink; ctx.font = f(700, ui.tall ? 62 : 54);
    ctx.fillText(ellipsis(ctx, (d.coin || '') + '/USDT', maxW - (tx - x)), tx, y + Math.round(4 * S));
    ctx.fillStyle = P.dim; ctx.font = f(600, ui.tall ? 28 : 25);
    ctx.fillText(T('share.tf', { tf: String(d.tf || '').toUpperCase() }), tx, y + Math.round((ui.tall ? 78 : 66) * S));
    return Math.round((ui.tall ? 150 : 120) * S);
  }

  function sideBadge(ui, d, rightX, y) {
    var ctx = ui.ctx, S = ui.S, f = ui.f;
    var txt = d.side === 'LONG' ? T('sig.long') : d.side === 'SHORT' ? T('sig.short') : T('sig.neutral');
    var colr = d.side === 'LONG' ? UP : d.side === 'SHORT' ? DOWN : ui.P.dim;
    ctx.font = f(700, ui.tall ? 34 : 32);
    var bw = ctx.measureText(txt).width + Math.round(48 * S);
    var bh = Math.round((ui.tall ? 62 : 58) * S);
    ctx.fillStyle = colr;
    roundRect(ctx, rightX - bw, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0A0906'; ctx.textAlign = 'center';
    ctx.fillText(txt, rightX - bw / 2, y + Math.round((ui.tall ? 15 : 13) * S));
    ctx.textAlign = 'left';
  }

  function price(ui, d, x, y, maxW) {
    var ctx = ui.ctx, P = ui.P, S = ui.S, f = ui.f;
    ctx.fillStyle = P.dim; ctx.font = f(600, ui.tall ? 26 : 24);
    ctx.fillText(T('share.price'), x, y);
    ctx.fillStyle = P.ink; ctx.font = f(700, ui.tall ? 76 : 64, true);
    ctx.fillText(ellipsis(ctx, fmtPrice(d.price), maxW), x, y + Math.round((ui.tall ? 38 : 34) * S));
    return Math.round((ui.tall ? 150 : 130) * S);
  }

  function cellBox(ui, x, y, w, h, labelKey, value, valueCol, filled) {
    var ctx = ui.ctx, P = ui.P, S = ui.S, f = ui.f;
    if (filled) { ctx.fillStyle = P.line; roundRect(ctx, x, y, w, h, Math.round(16 * S)); ctx.fill(); }
    else { ctx.strokeStyle = P.line; ctx.lineWidth = Math.max(1, 2 * S);
           roundRect(ctx, x, y, w, h, Math.round(16 * S)); ctx.stroke(); }
    ctx.fillStyle = P.dim; ctx.font = f(600, ui.tall ? 22 : 20);
    ctx.fillText(ellipsis(ctx, T(labelKey), w - Math.round(36 * S)), x + Math.round(18 * S), y + Math.round(16 * S));
    /*
     * Con số CO CHỮ trước khi bị cắt. Giá BTC có 9 ký tự ("$63,200.50") mà ô
     * kế hoạch ở bản ngang chỉ rộng ~140px: cắt bằng "…" thì người xem mất
     * đúng phần quan trọng nhất. Hạ cỡ chữ tới sàn rồi mới cắt.
     */
    var maxW = w - Math.round(36 * S);
    var vs = ui.tall ? 36 : 30, floorSize = ui.tall ? 24 : 19;
    ctx.font = f(700, vs, true);
    while (vs > floorSize && ctx.measureText(value).width > maxW) {
      vs -= 1; ctx.font = f(700, vs, true);
    }
    ctx.fillStyle = valueCol || P.ink;
    ctx.fillText(ellipsis(ctx, value, maxW), x + Math.round(18 * S),
      y + Math.round((ui.tall ? 58 : 50) * S));
  }

  function footer(ui, d, x, y, maxW) {
    var ctx = ui.ctx, P = ui.P, S = ui.S, f = ui.f;
    ctx.fillStyle = P.gold; ctx.font = f(700, ui.tall ? 30 : 26);
    ctx.fillText('vdearypto.vercel.app', x, y);
    ctx.fillStyle = P.dim; ctx.font = f(500, ui.tall ? 22 : 19);
    ctx.fillText(ellipsis(ctx, T('share.disclaimer'), maxW), x, y + Math.round((ui.tall ? 42 : 34) * S));
  }

  function metrics(d) {
    return [
      { k: 'share.rsi', v: d.rsi == null ? '—' : Number(d.rsi).toFixed(1) },
      { k: 'share.conf', v: d.confluence == null ? '—' : d.confluence + '/5' },
      { k: 'share.support', v: fmtPrice(d.support) },
      { k: 'share.resistance', v: fmtPrice(d.resistance) },
    ];
  }
  function planCells(d) {
    return [
      { k: 'plan.entry', v: fmtPrice(d.entry), c: null },
      { k: 'plan.tp', v: fmtPrice(d.tp), c: UP },
      { k: 'plan.sl', v: fmtPrice(d.sl), c: DOWN },
    ];
  }

  /* ---- 1080×1920: một cột, biểu đồ ăn hết chỗ trống ---- */

  function layoutTall(ui, d) {
    var S = ui.S, pad = Math.round(72 * S), col = ui.w - pad * 2, y = pad;
    sideBadge(ui, d, ui.w - pad, y + Math.round(6 * S));
    y += header(ui, d, pad, y, col - Math.round(300 * S));
    y += price(ui, d, pad, y, col);

    var gap = Math.round(18 * S), cellH = Math.round(128 * S), planH = Math.round(132 * S);
    var footH = Math.round(118 * S);
    var after = Math.round(46 * S) + 2 * (cellH + gap) + Math.round(26 * S) + planH;
    var chartH = Math.max(Math.round(150 * S), ui.h - pad - footH - y - after);
    miniChart(ui.ctx, d.candles, pad, y, col, chartH, ui.P);
    y += chartH + Math.round(46 * S);

    var cw = (col - gap) / 2;
    metrics(d).forEach(function (c, i) {
      cellBox(ui, pad + (i % 2) * (cw + gap), y + Math.floor(i / 2) * (cellH + gap), cw, cellH, c.k, c.v);
    });
    y += 2 * (cellH + gap) + Math.round(26 * S);

    var pw = (col - gap * 2) / 3;
    planCells(d).forEach(function (c, i) {
      cellBox(ui, pad + i * (pw + gap), y, pw, planH, c.k, c.v, c.c, true);
    });

    footer(ui, d, pad, ui.h - pad - Math.round(76 * S), col);
  }

  /* ---- 1200×630: HAI CỘT. Trái là giá + biểu đồ, phải là chỉ số + kế hoạch ---- */

  function layoutWide(ui, d) {
    var S = ui.S, pad = Math.round(52 * S), gap = Math.round(20 * S);
    var footH = Math.round(88 * S);
    var right = Math.round(470 * S);
    var left = ui.w - pad * 2 - right - gap;
    var lx = pad, rx = pad + left + gap;
    var y = pad;

    sideBadge(ui, d, ui.w - pad, y);
    var hH = header(ui, d, lx, y, left);
    var pH = price(ui, d, lx, y + hH, left);
    // Biểu đồ lấp phần còn lại của CỘT TRÁI, không phải của cả tấm ảnh.
    var chartY = y + hH + pH;
    var chartH = Math.max(Math.round(90 * S), ui.h - pad - footH - chartY);
    miniChart(ui.ctx, d.candles, lx, chartY, left, chartH, ui.P);

    // Cột phải: 2×2 chỉ số rồi ba ô kế hoạch xếp ngang, cùng kết thúc ngang
    // mép dưới của biểu đồ để hai cột nhìn cân nhau.
    var ry = y + Math.round(72 * S);
    var avail = (chartY + chartH) - ry;
    var cellH = Math.round((avail - gap * 2) * 0.31);
    var planH = avail - gap * 2 - cellH * 2;
    var cw = (right - gap) / 2;
    metrics(d).forEach(function (c, i) {
      cellBox(ui, rx + (i % 2) * (cw + gap), ry + Math.floor(i / 2) * (cellH + gap), cw, cellH, c.k, c.v);
    });
    var py = ry + 2 * (cellH + gap);
    var pw = (right - gap) / 3;
    planCells(d).forEach(function (c, i) {
      cellBox(ui, rx + i * (pw + gap / 2), py, pw, planH, c.k, c.v, c.c, true);
    });

    footer(ui, d, lx, ui.h - pad - Math.round(58 * S), ui.w - pad * 2);
  }

  /* ------------------------------ caption ------------------------------- */

  function caption(d) {
    var side = d.side === 'LONG' ? T('sig.long') : d.side === 'SHORT' ? T('sig.short') : T('sig.neutral');
    var lines = [
      T('share.cap.head', { coin: d.coin, tf: String(d.tf || '').toUpperCase(), side: side }),
      T('share.cap.price', { price: fmtPrice(d.price) }),
      T('share.cap.rsi', {
        rsi: d.rsi == null ? '—' : Number(d.rsi).toFixed(1),
        conf: d.confluence == null ? '—' : d.confluence + '/5',
      }),
      T('share.cap.sr', { sup: fmtPrice(d.support), res: fmtPrice(d.resistance) }),
    ];
    if (d.entry != null && d.tp != null && d.sl != null) {
      lines.push(T('share.cap.plan', { entry: fmtPrice(d.entry), tp: fmtPrice(d.tp), sl: fmtPrice(d.sl) }));
    }
    lines.push('');
    lines.push(T('share.cap.foot'));
    return lines.join('\n');
  }

  window.VdearShare = {
    PRESETS: PRESETS, SIZES: SIZES,
    draw: draw, caption: caption,
    _ellipsis: ellipsis, _fmtPrice: fmtPrice,
  };
})();

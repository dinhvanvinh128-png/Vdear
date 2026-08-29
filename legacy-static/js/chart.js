/*
 * Vdear — Canvas chart engine (tự viết, không phụ thuộc thư viện ngoài)
 * Nến + EMA + vùng hỗ trợ/kháng cự + kế hoạch DCA + sub-chart RSI.
 * Hỗ trợ: HiDPI, ZOOM (lăn chuột / nút +−), PAN (kéo), tooltip, chống đè nhãn.
 */
(function () {
  const TA = window.VdearTA;

  const COLORS = {
    // Black + gold. The two EMAs are tonal steps of the same gold rather than
    // two different hues, so the only non-gold colours on the chart are the
    // ones that carry meaning: price direction and its S/R bands.
    up: '#4FB477', down: '#E0574F',
    grid: 'rgba(216,163,43,0.07)', axis: '#6B644F', text: '#9A9078',
    ema20: '#D8A32B', ema50: '#9C7A22',
    support: 'rgba(79,180,119,0.12)', supportLine: '#4FB477',
    resistance: 'rgba(224,87,79,0.12)', resistanceLine: '#E0574F',
    rsiLine: '#F0C55A', ob: 'rgba(224,87,79,0.12)', os: 'rgba(79,180,119,0.12)',
    highlight: 'rgba(216,163,43,0.20)', crosshair: 'rgba(237,231,214,0.28)',
    gold: '#D8A32B',
  };

  function fmt(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.1) return p.toFixed(4);
    if (p >= 0.01) return p.toFixed(5);
    if (p >= 0.0001) return p.toFixed(7);
    return p.toPrecision(4);
  }

  class VdearChart {
    constructor(priceCanvas, rsiCanvas) {
      this.pc = priceCanvas; this.rc = rsiCanvas;
      this.pctx = priceCanvas.getContext('2d');
      this.rctx = rsiCanvas.getContext('2d');
      this.candles = [];
      this.highlightZone = null;
      this.padL = 8; this.padR = 72; this.padT = 12; this.padB = 22;
      this.hoverX = null;
      this.viewStart = 0;   // chỉ số nến bắt đầu (float)
      this.viewCount = 0;   // số nến hiển thị
      this.priceView = null; // null = tự vừa khung; {lo,hi} = người dùng tự chỉnh
      this.onScaleChange = null;
      this._drag = null;
      this._bind();
    }

    setData(candles) {
      const keepView = this.candles.length === candles.length && this.viewCount;
      this.candles = candles;
      this.closes = candles.map((c) => c.close);
      this.ema20 = TA.emaSeries(this.closes, 20);
      this.ema50 = TA.emaSeries(this.closes, 50);
      this.rsi = TA.rsiSeries(this.closes);
      if (!keepView) { const d = this._defaultView(); this.viewCount = d.count; this.viewStart = d.start; }
      this.render();
    }

    // Lề phải giữ chỗ cho trục giá. 72px trên màn 345px là hơn 20% bề ngang,
    // nến bị dồn hết sang trái; màn hẹp thì thu lại.
    _padRFor(w) { return w < 560 ? 52 : 72; }

    // Cửa sổ mặc định: đủ rộng để mỗi nến CÒN RA HÌNH NẾN. Mở ra 400 nến trên
    // một màn điện thoại thì mỗi nến chưa tới 1px — là vệt màu, không phải nến.
    // Và khi viewCount = toàn bộ thì không còn gì để kéo qua lại, nên trang
    // trông như bị đơ. Neo về bên phải: nến mới nhất sát mép, như mọi phần mềm
    // biểu đồ; muốn xem hết thì thu nhỏ ra.
    _defaultView() {
      const n = this.candles.length;
      if (!n) return { start: 0, count: 0 };
      const w = this.pc.clientWidth || this.pc.parentElement.clientWidth || 900;
      const plotW = Math.max(80, w - this.padL - this._padRFor(w));
      const count = Math.max(30, Math.min(n, Math.floor(plotW / 6)));
      return { start: Math.max(0, n - count), count };
    }

    setZones(sr) { this.sr = sr; this.render(); }
    setHighlight(zone) {
      this.highlightZone = zone;
      // Chọn một vùng là yêu cầu "cho tôi xem chỗ này": trả khung giá về tự
      // vừa khung để vùng đó chắc chắn lọt vào, kể cả khi trước đó người dùng
      // đã tự kéo trục giá đi chỗ khác.
      if (zone) { this.priceView = null; this._scaleChanged(); }
      this.render();
    }
    setPlan(plan) { this.plan = plan; this.render(); }
    resetView() {
      const d = this._defaultView();
      this.viewCount = d.count; this.viewStart = d.start;
      this.priceView = null; this._scaleChanged(); this.render();
    }
    fitAll() { this.viewCount = this.candles.length; this.viewStart = 0; this.priceView = null; this._scaleChanged(); this.render(); }
    zoomBy(factor, anchorPx) {
      const n = this.candles.length; if (!n) return;
      const w = this.pc.clientWidth || this.pc.parentElement.clientWidth;
      const plotW = w - this.padL - this.padR;
      const bw = plotW / this.viewCount;
      const anchor = anchorPx == null ? this.padL + plotW / 2 : anchorPx;
      const idxAtAnchor = this.viewStart + (anchor - this.padL) / bw;
      let nc = Math.round(this.viewCount * factor);
      nc = Math.max(12, Math.min(n, nc));
      const bw2 = plotW / nc;
      let vs = idxAtAnchor - (anchor - this.padL) / bw2;
      this.viewCount = nc;
      this.viewStart = this._clampStart(vs, nc);
      this.render();
    }

    // Cho phép kéo VƯỢT QUA cây nến cuối, để lại khoảng trống bên phải — và
    // vượt qua cây đầu tiên về phía trái. Kẹp cứng ở mép làm biểu đồ như bị
    // chặn tường: không đẩy được giá sang trái để nhìn chỗ trống phía trước.
    // Điều kiện duy nhất: luôn còn ít nhất vài cây nến trong khung, nếu không
    // sẽ kéo tới một màn hình trống trơn không biết đường về.
    _clampStart(vs, count) {
      const n = this.candles.length;
      const c = count || this.viewCount || 1;
      const keep = Math.max(6, Math.round(c * 0.15));
      const min = -(c - keep);        // trống bên trái
      const max = n - keep;           // trống bên phải
      return Math.max(min, Math.min(max, vs));
    }

    // Kéo ngang bao nhiêu pixel thì cửa sổ xem dịch bấy nhiêu nến.
    _panTo(baseVs, dxPx) {
      const n = this.candles.length; if (!n) return;
      const w = this.pc.clientWidth || this.pc.parentElement.clientWidth;
      const bw = (w - this.padL - this.padR) / this.viewCount;
      if (!(bw > 0)) return;
      this.viewStart = this._clampStart(baseVs - dxPx / bw, this.viewCount);
    }

    _bind() {
      const rect = () => this.pc.getBoundingClientRect();

      // Dải trục giá bên phải (rộng padR) là vùng điều khiển THANG GIÁ, giống
      // TradingView: kéo ở đó thì khoảng giá co/giãn chứ không trượt thời gian.
      const onAxis = (x) => x >= (this.pc.clientWidth || 0) - this.padR - 6;

      /* ------------------------------ chuột ----------------------------- */
      this.pc.addEventListener('mousemove', (e) => {
        const r = rect(); const x = e.clientX - r.left, y = e.clientY - r.top;
        if (this._scale) {
          // Kéo XUỐNG = nới khoảng giá ra (nến nhỏ lại, thấy tổng quát);
          // kéo LÊN = bó lại. 190px kéo ~ gấp/chia đôi khoảng giá.
          const dy = y - this._scale.y;
          this.priceView = this._scale.base;          // luôn tính từ mốc lúc bấm
          this.zoomPrice(Math.pow(2, dy / 190), 0.5);
        } else if (this._drag) {
          this._panTo(this._drag.vs, x - this._drag.x);
          // Kéo lệch dọc đủ nhiều thì kéo luôn cả khung giá — nhưng chỉ sau
          // 12px, để cú kéo ngang hơi rung tay không tự nhảy sang thang thủ công.
          const dy = y - this._drag.y;
          if (this._drag.vert || Math.abs(dy) > 12) {
            this._drag.vert = true;
            this.panPrice(y - this._drag.ly);
            }
          this._drag.ly = y;
        }
        this.hoverX = x; this.render();
        if (!this._drag && !this._scale) this.pc.style.cursor = onAxis(x) ? 'ns-resize' : 'crosshair';
      });
      this.pc.addEventListener('mouseleave', () => { this.hoverX = null; this._drag = this._scale = null; this.render(); });
      this.pc.addEventListener('mousedown', (e) => {
        const r = rect(); const x = e.clientX - r.left, y = e.clientY - r.top;
        if (onAxis(x)) {
          this._scale = { y, base: { ...this._priceRange() } };
          this.pc.style.cursor = 'ns-resize';
        } else {
          this._drag = { x, y, ly: y, vs: this.viewStart, vert: false };
          this.pc.style.cursor = 'grabbing';
        }
      });
      window.addEventListener('mouseup', () => { this._drag = this._scale = null; this.pc.style.cursor = 'crosshair'; });
      // Nháy đúp trên trục giá: chỉ trả thang giá về tự vừa khung, giữ nguyên
      // khung thời gian đang xem. Nháy đúp trong biểu đồ: trả cả hai.
      this.pc.addEventListener('dblclick', (e) => {
        const x = e.clientX - rect().left;
        if (onAxis(x)) this.autoPrice(); else this.resetView();
      });
      this.pc.style.cursor = 'crosshair';

      // Lăn chuột phóng to/thu nhỏ, neo tại vị trí con trỏ: nến đang chỉ vào
      // đứng yên còn phần còn lại giãn ra quanh nó. Lăn TRÊN TRỤC GIÁ thì
      // co/giãn thang giá thay vì thời gian.
      const onWheel = (e) => {
        e.preventDefault();
        const r = rect(); const x = e.clientX - r.left;
        if (e.currentTarget === this.pc && onAxis(x)) {
          const h = (this.pc.parentElement.clientHeight || 400);
          const frac = 1 - ((e.clientY - r.top) - this.padT) / Math.max(1, h - this.padT - this.padB);
          this.zoomPrice(e.deltaY > 0 ? 1.15 : 0.87, frac);
          return;
        }
        this.zoomBy(e.deltaY > 0 ? 1.18 : 0.85, x);
      };
      this.pc.addEventListener('wheel', onWheel, { passive: false });

      // Khung RSI nằm dưới cùng trục thời gian, nên kéo/lăn ở đó cũng phải
      // điều khiển cùng cửa sổ xem — người dùng không phân biệt hai canvas.
      if (this.rc) {
        this.rc.addEventListener('wheel', onWheel, { passive: false });
        this.rc.addEventListener('mousedown', (e) => {
          this._drag = { x: e.clientX - rect().left, vs: this.viewStart };
          this.rc.style.cursor = 'grabbing';
        });
        this.rc.addEventListener('mousemove', (e) => {
          if (!this._drag) return;
          this._panTo(this._drag.vs, (e.clientX - rect().left) - this._drag.x);
          this.render();
        });
        window.addEventListener('mouseup', () => { this.rc.style.cursor = 'grab'; });
        this.rc.style.cursor = 'grab';
      }

      /* ------------------------------ cảm ứng --------------------------- */
      // Một ngón: kéo ngang = di chuyển biểu đồ, kéo dọc = cuộn trang. Phải
      // chọn theo hướng chứ không nuốt hết mọi cú chạm, nếu không người dùng
      // điện thoại chạm trúng biểu đồ là không cuộn qua được nữa.
      let touch = null, pinch = null;
      const pos = (t) => { const r = rect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
      const mid = (a, b) => (a.clientX + b.clientX) / 2 - rect().left;

      const gap = (t) => ({ dx: Math.abs(t[0].clientX - t[1].clientX), dy: Math.abs(t[0].clientY - t[1].clientY) });

      const onStart = (e) => {
        if (e.touches.length === 2) {
          touch = null;
          const g = gap(e.touches);
          pinch = { dx: g.dx, dy: g.dy, x: mid(e.touches[0], e.touches[1]),
                    axis: null, base: { ...this._priceRange() } };
        } else if (e.touches.length === 1) {
          pinch = null;
          const p = pos(e.touches[0]);
          // Chạm vào dải trục giá = chỉnh thang giá, giống kéo bằng chuột.
          touch = { x: p.x, y: p.y, vs: this.viewStart,
                    mode: onAxis(p.x) ? 'scale' : null,
                    base: { ...this._priceRange() } };
        }
      };
      const onMove = (e) => {
        if (e.touches.length === 2 && pinch) {
          const g = gap(e.touches);
          const x = mid(e.touches[0], e.touches[1]);
          // Hai ngón tách nhau theo chiều nào thì zoom theo chiều đó: dọc =
          // thang giá, ngang = thời gian. Chốt trục ở cú di đầu tiên để giữa
          // chừng không nhảy qua nhảy lại.
          if (pinch.axis === null) {
            const cdx = Math.abs(g.dx - pinch.dx), cdy = Math.abs(g.dy - pinch.dy);
            if (cdx > 12 || cdy > 12) pinch.axis = cdy > cdx ? 'price' : 'time';
          }
          if (pinch.axis === 'price') {
            if (g.dy > 0 && pinch.dy > 0) { this.priceView = pinch.base; this.zoomPrice(pinch.dy / g.dy, 0.5); }
          } else if (pinch.axis === 'time') {
            if (g.dx > 0 && pinch.dx > 0) this.zoomBy(pinch.dx / g.dx, x);
          }
          if (pinch.axis === 'time') { pinch.dx = g.dx; pinch.dy = g.dy; }
          pinch.x = x;
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (e.touches.length !== 1 || !touch) return;
        const p = pos(e.touches[0]);
        const dx = p.x - touch.x, dy = p.y - touch.y;
        if (touch.mode === 'scale') {
          this.priceView = touch.base;
          this.zoomPrice(Math.pow(2, dy / 190), 0.5);
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (touch.mode === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;   // chưa rõ ý định
          touch.mode = Math.abs(dx) > Math.abs(dy) ? 'pan' : 'scroll';
        }
        if (touch.mode !== 'pan') return;                     // nhường cho cuộn trang
        this._panTo(touch.vs, dx);
        this.hoverX = p.x; this.render();
        if (e.cancelable) e.preventDefault();
      };
      const onEnd = () => { touch = null; pinch = null; this.hoverX = null; this.render(); };

      [this.pc, this.rc].forEach((el) => {
        if (!el) return;
        el.addEventListener('touchstart', onStart, { passive: true });
        el.addEventListener('touchmove', onMove, { passive: false });
        el.addEventListener('touchend', onEnd);
        el.addEventListener('touchcancel', onEnd);
      });

      window.addEventListener('resize', () => this.render());
    }

    _prep(canvas, ctx, cssH) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      canvas.width = w * dpr; canvas.height = cssH * dpr;
      canvas.style.height = cssH + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, cssH);
      return { w, h: cssH };
    }

    _plotW(w) { return w - this.padL - this.padR; }
    _barW(w) { return this._plotW(w) / Math.max(1, this.viewCount); }
    _xForIndex(i, w) {
      const bw = this._barW(w);
      return this.padL + (i - this.viewStart + 0.5) * bw;
    }
    _visRange() {
      const i0 = Math.max(0, Math.floor(this.viewStart));
      const i1 = Math.min(this.candles.length - 1, Math.ceil(this.viewStart + this.viewCount));
      return { i0, i1 };
    }

    render() {
      if (!this.candles.length) return;
      if (!this.viewCount) this.viewCount = this.candles.length;
      this._renderPrice();
      this._renderRSI();
    }

    _priceRange() {
      const { i0, i1 } = this._visRange();
      let lo = Infinity, hi = -Infinity;
      for (let i = i0; i <= i1; i++) {
        const c = this.candles[i]; if (!c) continue;
        if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high;
      }
      const price = this.candles[i1] ? this.candles[i1].close : hi;
      if (this.sr) {
        [...(this.sr.supports || []), ...(this.sr.resistances || [])].forEach((z) => {
          if (Math.abs(z.price - price) / price < 0.06) { lo = Math.min(lo, z.low); hi = Math.max(hi, z.high); }
        });
      }
      // Vùng đang được chọn thì LUÔN phải nằm trong khung giá, kể cả khi nó xa
      // giá hiện tại hơn 6% và bị lọc ra ở trên. Không có dòng này thì bấm vào
      // một vùng ở xa xong biểu đồ trống trơn — mà giờ các vùng khác cũng đã
      // ẩn đi nên không còn gì để nhìn cả.
      if (this.highlightZone) {
        lo = Math.min(lo, this.highlightZone.low);
        hi = Math.max(hi, this.highlightZone.high);
      }
      if (this.plan) {
        [this.plan.tp, this.plan.sl, this.plan.entry].forEach((p) => {
          if (p != null && Math.abs(p - this.plan.entry) / this.plan.entry < 0.1) {
            lo = Math.min(lo, p); hi = Math.max(hi, p);
          }
        });
      }
      if (!isFinite(lo) || !isFinite(hi) || lo === hi) { lo = lo * 0.99; hi = hi * 1.01; }
      const pad = (hi - lo) * 0.08;
      const auto = { lo: lo - pad, hi: hi + pad };
      this._autoRange = auto;
      // Người dùng đã tự chỉnh trục giá thì GIỮ NGUYÊN khoảng đó, kể cả khi
      // trượt ngang — đó mới là "kéo ra xem tổng quát": nến co lại trong một
      // khung giá rộng hơn thay vì lúc nào cũng bị kéo giãn vừa khít.
      return this.priceView ? { lo: this.priceView.lo, hi: this.priceView.hi } : auto;
    }

    // Nới/thu khoảng giá quanh một điểm neo (0..1 tính từ đáy khung vẽ).
    _scaleChanged() { if (this.onScaleChange) this.onScaleChange(this.isPriceManual()); }

    zoomPrice(factor, anchorFrac) {
      const cur = this._priceRange();
      const span = cur.hi - cur.lo;
      if (!(span > 0)) return;
      const a = anchorFrac == null ? 0.5 : Math.max(0, Math.min(1, anchorFrac));
      const anchorPrice = cur.lo + span * a;
      const ns = Math.max(span * 1e-4, Math.min(span * 400, span * factor));
      this.priceView = { lo: anchorPrice - ns * a, hi: anchorPrice + ns * (1 - a) };
      this._scaleChanged(); this.render();
    }

    // Dời khoảng giá lên/xuống theo pixel.
    panPrice(dyPx) {
      const cur = this._priceRange();
      const h = (this.pc.parentElement.clientHeight || 400) - this.padT - this.padB;
      if (!(h > 0)) return;
      const d = ((cur.hi - cur.lo) / h) * dyPx;   // kéo xuống = xem giá thấp hơn
      this.priceView = { lo: cur.lo + d, hi: cur.hi + d };
      this._scaleChanged(); this.render();
    }

    autoPrice() { this.priceView = null; this._scaleChanged(); this.render(); }
    isPriceManual() { return !!this.priceView; }

    // Bộ chống đè nhãn: trả y không chồng các nhãn đã đặt (mỗi bên trái/phải).
    _placeLabel(used, y, h, top, bottom) {
      let ny = y;
      const overlaps = (yy) => used.some((u) => Math.abs(u - yy) < h);
      let guard = 0;
      while (overlaps(ny) && guard++ < 40) ny += h;
      if (ny > bottom) { ny = y; guard = 0; while (overlaps(ny) && guard++ < 40) ny -= h; }
      ny = Math.max(top + h / 2, Math.min(bottom - h / 2, ny));
      used.push(ny);
      return ny;
    }

    _renderPrice() {
      const ctx = this.pctx;
      const { w, h } = this._prep(this.pc, ctx, this.pc.parentElement.clientHeight || 400);
      this.padR = this._padRFor(w);
      const { lo, hi } = this._priceRange();
      const plotT = this.padT, plotB = h - this.padB, plotH = plotB - plotT;
      const yFor = (p) => plotB - ((p - lo) / (hi - lo)) * plotH;
      const usedRight = [], usedLeft = [];

      // grid + trục giá (8 mốc để "đầy đủ giá")
      ctx.font = '11px Inter, Arial';
      const GN = 8;
      for (let g = 0; g <= GN; g++) {
        const p = lo + ((hi - lo) * g) / GN;
        const y = yFor(p);
        ctx.strokeStyle = COLORS.grid; ctx.beginPath();
        ctx.moveTo(this.padL, y); ctx.lineTo(w - this.padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
        ctx.fillText(fmt(p), w - this.padR + 6, y + 3);
      }

      // vùng S/R (nền + đường + nhãn LONG/SHORT chống đè)
      const drawZone = (z) => {
        const y1 = yFor(z.high), y2 = yFor(z.low);
        ctx.fillStyle = z.kind === 'support' ? COLORS.support : COLORS.resistance;
        ctx.fillRect(this.padL, Math.min(y1, y2), this._plotW(w), Math.abs(y2 - y1) || 1);
        const yl = yFor(z.price);
        ctx.strokeStyle = z.kind === 'support' ? COLORS.supportLine : COLORS.resistanceLine;
        ctx.setLineDash([4, 4]); ctx.beginPath();
        ctx.moveTo(this.padL, yl); ctx.lineTo(w - this.padR, yl); ctx.stroke(); ctx.setLineDash([]);
        // nhãn LONG/SHORT ở mép trái, chống đè
        ctx.font = 'bold 10px Inter, Arial';
        const tag = z.side, tw = ctx.measureText(tag).width + 10;
        const ly = this._placeLabel(usedLeft, yl, 15, plotT, plotB);
        ctx.fillStyle = z.kind === 'support' ? COLORS.supportLine : COLORS.resistanceLine;
        ctx.fillRect(this.padL + 2, ly - 7, tw, 14);
        ctx.fillStyle = '#0b0e14'; ctx.textAlign = 'left';
        ctx.fillText(tag, this.padL + 7, ly + 3);
      };
      if (this.sr) {
        // Chọn một vùng thì CHỈ vẽ vùng đó, các vùng còn lại ẩn hẳn — nhìn một
        // mức giá giữa chín đường kẻ khác thì không đọc được gì.
        const all = (this.sr.supports || []).concat(this.sr.resistances || []);
        const z = this.highlightZone;
        let list = all;
        if (z) {
          list = all.filter((q) => q === z);
          // Phòng khi nơi gọi dựng một object mới thay vì truyền chính vùng đó.
          if (!list.length) list = all.filter((q) => q.price === z.price && q.low === z.low && q.high === z.high);
        }
        list.forEach(drawZone);
      }
      if (this.highlightZone) {
        const z = this.highlightZone;
        const y1 = yFor(z.high), y2 = yFor(z.low);
        ctx.fillStyle = COLORS.highlight;
        ctx.fillRect(this.padL, Math.min(y1, y2), this._plotW(w), Math.abs(y2 - y1) || 2);
      }

      // Với thang giá tự chỉnh, nến có thể nằm ngoài khung vẽ. Cắt theo vùng
      // biểu đồ để không tràn lên trục giá và nhãn ở lề.
      ctx.save();
      ctx.beginPath(); ctx.rect(this.padL, plotT, this._plotW(w), plotH); ctx.clip();

      // nến (chỉ vẽ phần hiển thị)
      const { i0, i1 } = this._visRange();
      const cw = Math.max(1, this._barW(w) * 0.66);
      for (let i = i0; i <= i1; i++) {
        const c = this.candles[i]; if (!c) continue;
        const x = this._xForIndex(i, w);
        if (x < this.padL - cw || x > w - this.padR + cw) continue;
        const up = c.close >= c.open;
        ctx.strokeStyle = up ? COLORS.up : COLORS.down;
        ctx.fillStyle = up ? COLORS.up : COLORS.down;
        ctx.beginPath(); ctx.moveTo(x, yFor(c.high)); ctx.lineTo(x, yFor(c.low)); ctx.stroke();
        const yo = yFor(c.open), yc = yFor(c.close);
        ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
      }

      // EMA
      const drawLine = (series, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath();
        let started = false;
        for (let i = i0; i <= i1; i++) {
          if (series[i] == null) continue;
          const x = this._xForIndex(i, w), y = yFor(series[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.lineWidth = 1;
      };
      drawLine(this.ema20, COLORS.ema20);
      drawLine(this.ema50, COLORS.ema50);
      ctx.restore();   // hết vùng cắt: từ đây là nhãn ở lề, phải vẽ ra ngoài được

      // Kế hoạch thực chiến (nhãn bên phải, chống đè)
      if (this.plan) {
        const P = this.plan;
        const line = (price, color, label) => {
          if (price == null) return;
          const y = yFor(price);
          if (y < plotT - 2 || y > plotB + 2) return;
          ctx.strokeStyle = color; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(this.padL, y); ctx.lineTo(w - this.padR, y); ctx.stroke();
          ctx.setLineDash([]); ctx.lineWidth = 1;
          ctx.font = 'bold 9px Inter, Arial'; ctx.textAlign = 'right';
          const tw = ctx.measureText(label).width + 8;
          const ly = this._placeLabel(usedRight, y, 14, plotT, plotB);
          ctx.fillStyle = color; ctx.fillRect(w - this.padR - tw, ly - 7, tw, 13);
          ctx.fillStyle = '#04121a'; ctx.fillText(label, w - this.padR - 4, ly + 2);
        };
        line(P.tp, COLORS.up, 'TP +100%');
        line(P.entry, '#e7ebf2', 'ENTRY');
        line(P.sl, COLORS.down, 'SL −50%');
      }

      // giá hiện tại (nhãn trên trục phải)
      const last = this.candles[this.candles.length - 1];
      const yl = yFor(last.close);
      if (yl >= plotT && yl <= plotB) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(this.padL, yl); ctx.lineTo(w - this.padR, yl); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = last.close >= last.open ? COLORS.up : COLORS.down;
        ctx.fillRect(w - this.padR, yl - 8, this.padR, 16);
        ctx.fillStyle = '#04121a'; ctx.font = 'bold 10px Inter, Arial'; ctx.textAlign = 'left';
        ctx.fillText(fmt(last.close), w - this.padR + 4, yl + 3);
      }

      this._crosshair(ctx, w, h, yFor, plotT, plotB);

      // Canvas không có nội dung nào đọc được: với trình đọc màn hình nó là một
      // ô trống. Mô tả cửa sổ đang xem để ít nhất còn biết đang nhìn cái gì.
      const n = this.candles.length;
      const a = Math.max(1, Math.round(this.viewStart) + 1);
      const b = Math.min(n, Math.round(this.viewStart + this.viewCount));
      this.pc.setAttribute('role', 'img');
      this.pc.setAttribute('aria-label',
        `Biểu đồ nến: đang xem nến ${a}–${b} trên ${n}, `
        + `giá từ ${fmt(lo)} đến ${fmt(hi)}`
        + (this.priceView ? ' (khung giá tự chỉnh)' : ''));

      // legend EMA + hướng dẫn zoom
      ctx.textAlign = 'left'; ctx.font = '11px Inter, Arial';
      ctx.fillStyle = COLORS.ema20; ctx.fillText('EMA20', this.padL + 4, plotT + 12);
      ctx.fillStyle = COLORS.ema50; ctx.fillText('EMA50', this.padL + 54, plotT + 12);
      ctx.fillStyle = COLORS.axis; ctx.font = '10px Inter, Arial';
      // Màn hẹp: bỏ dòng hướng dẫn trên canvas — nó chạy thẳng vào cụm nút zoom
      // và bị cắt cụt. Nội dung đó đã có đủ ở phần chú thích dưới biểu đồ.
      if (w >= 620) ctx.fillText('Lăn chuột / chụm 2 ngón để zoom · kéo để di chuyển · nháy đúp để xem toàn bộ', this.padL + 108, plotT + 12);
    }

    _crosshair(ctx, w, h, yFor, plotT, plotB) {
      if (this.hoverX == null) return;
      const bw = this._barW(w);
      let i = Math.round(this.viewStart + (this.hoverX - this.padL) / bw - 0.5);
      i = Math.max(0, Math.min(this.candles.length - 1, i));
      const x = this._xForIndex(i, w);
      const c = this.candles[i]; if (!c) return;
      ctx.strokeStyle = COLORS.crosshair; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, plotT); ctx.lineTo(x, plotB); ctx.stroke(); ctx.setLineDash([]);
      const d = new Date(c.time * 1000);
      const lines = [
        d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        'O ' + fmt(c.open) + '  H ' + fmt(c.high),
        'L ' + fmt(c.low) + '  C ' + fmt(c.close),
      ];
      if (this.rsi[i] != null) lines.push('RSI ' + this.rsi[i].toFixed(1));
      ctx.font = '10px Inter, Arial';
      const bwid = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
      let bx = x + 8; if (bx + bwid > w - this.padR) bx = x - bwid - 8;
      ctx.fillStyle = 'rgba(12,16,24,0.94)';
      ctx.fillRect(bx, plotT + 4, bwid, lines.length * 13 + 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(bx, plotT + 4, bwid, lines.length * 13 + 6);
      ctx.fillStyle = '#d5dae3'; ctx.textAlign = 'left';
      lines.forEach((l, k) => ctx.fillText(l, bx + 6, plotT + 18 + k * 13));
    }

    _renderRSI() {
      const ctx = this.rctx;
      const { w, h } = this._prep(this.rc, ctx, this.rc.parentElement.clientHeight || 130);
      const padT = 8, padB = 14, plotH = h - padT - padB;
      const yFor = (v) => padT + (1 - v / 100) * plotH;

      ctx.fillStyle = COLORS.ob;
      ctx.fillRect(this.padL, yFor(100), this._plotW(w), yFor(70) - yFor(100));
      ctx.fillStyle = COLORS.os;
      ctx.fillRect(this.padL, yFor(30), this._plotW(w), yFor(0) - yFor(30));

      [80, 70, 50, 30, 20].forEach((lvl) => {
        const y = yFor(lvl);
        ctx.strokeStyle = lvl === 50 ? 'rgba(255,255,255,0.08)' : COLORS.grid;
        ctx.beginPath(); ctx.moveTo(this.padL, y); ctx.lineTo(w - this.padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.text; ctx.font = '10px Inter, Arial'; ctx.textAlign = 'left';
        ctx.fillText(String(lvl), w - this.padR + 6, y + 3);
      });

      const { i0, i1 } = this._visRange();
      ctx.strokeStyle = COLORS.rsiLine; ctx.lineWidth = 1.6; ctx.beginPath();
      let started = false;
      for (let i = i0; i <= i1; i++) {
        if (this.rsi[i] == null) continue;
        const x = this._xForIndex(i, w), y = yFor(this.rsi[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.lineWidth = 1;

      let lastRsi = 50;
      for (let i = this.rsi.length - 1; i >= 0; i--) if (this.rsi[i] != null) { lastRsi = this.rsi[i]; break; }
      const zone = TA.rsiZone(lastRsi);
      ctx.fillStyle = zone.color; ctx.font = 'bold 10px Inter, Arial'; ctx.textAlign = 'left';
      ctx.fillText('RSI ' + lastRsi.toFixed(1), this.padL + 4, padT + 10);
    }
  }

  window.VdearChart = VdearChart;
})();

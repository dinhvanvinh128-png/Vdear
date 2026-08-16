/*
 * Vdear — Canvas chart engine (tự viết, không phụ thuộc thư viện ngoài)
 * Nến + EMA + vùng hỗ trợ/kháng cự + kế hoạch DCA + sub-chart RSI.
 * Hỗ trợ: HiDPI, ZOOM (lăn chuột / nút +−), PAN (kéo), tooltip, chống đè nhãn.
 */
(function () {
  const TA = window.VdearTA;

  const COLORS = {
    up: '#00d68f', down: '#ff3b57',
    grid: 'rgba(255,255,255,0.05)', axis: '#5a6474', text: '#8a94a6',
    ema20: '#2f81f7', ema50: '#f0b90b',
    support: 'rgba(0,214,143,0.12)', supportLine: '#00d68f',
    resistance: 'rgba(255,59,87,0.12)', resistanceLine: '#ff3b57',
    rsiLine: '#c792ea', ob: 'rgba(255,59,87,0.12)', os: 'rgba(0,214,143,0.12)',
    highlight: 'rgba(240,185,11,0.20)', crosshair: 'rgba(255,255,255,0.25)',
    gold: '#f0b90b',
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
      if (!keepView) { this.viewCount = candles.length; this.viewStart = 0; }
      this.render();
    }

    setZones(sr) { this.sr = sr; this.render(); }
    setHighlight(zone) { this.highlightZone = zone; this.render(); }
    setPlan(plan) { this.plan = plan; this.render(); }
    resetView() { this.viewCount = this.candles.length; this.viewStart = 0; this.render(); }
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
      this.viewStart = Math.max(0, Math.min(n - nc, vs));
      this.render();
    }

    _bind() {
      const rect = () => this.pc.getBoundingClientRect();
      this.pc.addEventListener('mousemove', (e) => {
        const r = rect(); const x = e.clientX - r.left;
        if (this._drag) {
          const n = this.candles.length;
          const plotW = (this.pc.clientWidth) - this.padL - this.padR;
          const bw = plotW / this.viewCount;
          let vs = this._drag.vs - (x - this._drag.x) / bw;
          this.viewStart = Math.max(0, Math.min(n - this.viewCount, vs));
        }
        this.hoverX = x; this.render();
      });
      this.pc.addEventListener('mouseleave', () => { this.hoverX = null; this._drag = null; this.render(); });
      this.pc.addEventListener('mousedown', (e) => {
        const r = rect(); this._drag = { x: e.clientX - r.left, vs: this.viewStart }; this.pc.style.cursor = 'grabbing';
      });
      window.addEventListener('mouseup', () => { this._drag = null; this.pc.style.cursor = 'crosshair'; });
      this.pc.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = rect();
        this.zoomBy(e.deltaY > 0 ? 1.18 : 0.85, e.clientX - r.left);
      }, { passive: false });
      this.pc.addEventListener('dblclick', () => this.resetView());
      this.pc.style.cursor = 'crosshair';
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
      if (this.plan) {
        [this.plan.tp0, this.plan.dca, this.plan.slAfterDca, this.plan.entry].forEach((p) => {
          if (p != null && Math.abs(p - this.plan.entry) / this.plan.entry < 0.1) {
            lo = Math.min(lo, p); hi = Math.max(hi, p);
          }
        });
      }
      if (!isFinite(lo) || !isFinite(hi) || lo === hi) { lo = lo * 0.99; hi = hi * 1.01; }
      const pad = (hi - lo) * 0.08;
      return { lo: lo - pad, hi: hi + pad };
    }

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
        (this.sr.supports || []).forEach(drawZone);
        (this.sr.resistances || []).forEach(drawZone);
      }
      if (this.highlightZone) {
        const z = this.highlightZone;
        const y1 = yFor(z.high), y2 = yFor(z.low);
        ctx.fillStyle = COLORS.highlight;
        ctx.fillRect(this.padL, Math.min(y1, y2), this._plotW(w), Math.abs(y2 - y1) || 2);
      }

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
        line(P.tp0, COLORS.up, 'TP +100%');
        line(P.entry, '#e7ebf2', 'ENTRY');
        line(P.dca, COLORS.gold, 'DCA −50%');
        line(P.slAfterDca, COLORS.down, 'SL sau DCA');
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

      // legend EMA + hướng dẫn zoom
      ctx.textAlign = 'left'; ctx.font = '11px Inter, Arial';
      ctx.fillStyle = COLORS.ema20; ctx.fillText('EMA20', this.padL + 4, plotT + 12);
      ctx.fillStyle = COLORS.ema50; ctx.fillText('EMA50', this.padL + 54, plotT + 12);
      ctx.fillStyle = COLORS.axis; ctx.font = '10px Inter, Arial';
      ctx.fillText('Lăn chuột để zoom · kéo để di chuyển · nháy đúp để reset', this.padL + 108, plotT + 12);
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

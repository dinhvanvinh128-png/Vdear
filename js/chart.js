/*
 * Vdear — Canvas chart engine (tự viết, không phụ thuộc thư viện ngoài)
 * Vẽ biểu đồ nến + EMA + overlay vùng hỗ trợ/kháng cự, và sub-chart RSI với
 * dải quá mua/quá bán. Hỗ trợ HiDPI, tooltip, và highlight 1 vùng S/R.
 */
(function () {
  const TA = window.VdearTA;

  const COLORS = {
    up: '#00d68f', down: '#ff3b57',
    grid: 'rgba(255,255,255,0.05)', axis: '#5a6474', text: '#8a94a6',
    ema20: '#2f81f7', ema50: '#f0b90b',
    support: 'rgba(0,214,143,0.16)', supportLine: '#00d68f',
    resistance: 'rgba(255,59,87,0.16)', resistanceLine: '#ff3b57',
    rsiLine: '#c792ea', ob: 'rgba(255,59,87,0.12)', os: 'rgba(0,214,143,0.12)',
    highlight: 'rgba(240,185,11,0.20)', crosshair: 'rgba(255,255,255,0.25)',
  };

  function fmt(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(5);
    return p.toPrecision(4);
  }

  class VdearChart {
    constructor(priceCanvas, rsiCanvas) {
      this.pc = priceCanvas; this.rc = rsiCanvas;
      this.pctx = priceCanvas.getContext('2d');
      this.rctx = rsiCanvas.getContext('2d');
      this.candles = [];
      this.highlightZone = null;
      this.padL = 8; this.padR = 66; this.padT = 12; this.padB = 20;
      this.hoverX = null;
      this._bind();
    }

    setData(candles) {
      this.candles = candles;
      this.closes = candles.map((c) => c.close);
      this.ema20 = TA.emaSeries(this.closes, 20);
      this.ema50 = TA.emaSeries(this.closes, 50);
      this.rsi = TA.rsiSeries(this.closes);
      this.render();
    }

    setZones(sr) { this.sr = sr; this.render(); }
    setHighlight(zone) { this.highlightZone = zone; this.render(); }

    _bind() {
      const move = (e) => {
        const r = this.pc.getBoundingClientRect();
        this.hoverX = e.clientX - r.left;
        this.render();
      };
      this.pc.addEventListener('mousemove', move);
      this.pc.addEventListener('mouseleave', () => { this.hoverX = null; this.render(); });
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

    _xForIndex(i, w) {
      const n = this.candles.length;
      const plotW = w - this.padL - this.padR;
      return this.padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    }

    render() {
      if (!this.candles.length) return;
      this._renderPrice();
      this._renderRSI();
    }

    _priceRange() {
      let lo = Infinity, hi = -Infinity;
      for (const c of this.candles) { if (c.low < lo) lo = c.low; if (c.high > hi) hi = c.high; }
      if (this.sr) {
        [...(this.sr.supports || []), ...(this.sr.resistances || [])].forEach((z) => {
          if (z.distancePct < 8) { lo = Math.min(lo, z.low); hi = Math.max(hi, z.high); }
        });
      }
      const pad = (hi - lo) * 0.06;
      return { lo: lo - pad, hi: hi + pad };
    }

    _renderPrice() {
      const ctx = this.pctx;
      const { w, h } = this._prep(this.pc, ctx, this.pc.parentElement.clientHeight || 380);
      const { lo, hi } = this._priceRange();
      const plotT = this.padT, plotB = h - this.padB, plotH = plotB - plotT;
      const yFor = (p) => plotB - ((p - lo) / (hi - lo)) * plotH;

      // grid + trục giá
      ctx.font = '11px Inter, Arial';
      for (let g = 0; g <= 5; g++) {
        const p = lo + ((hi - lo) * g) / 5;
        const y = yFor(p);
        ctx.strokeStyle = COLORS.grid; ctx.beginPath();
        ctx.moveTo(this.padL, y); ctx.lineTo(w - this.padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.text; ctx.textAlign = 'left';
        ctx.fillText(fmt(p), w - this.padR + 6, y + 3);
      }

      // vùng S/R
      const drawZone = (z) => {
        const y1 = yFor(z.high), y2 = yFor(z.low);
        ctx.fillStyle = z.kind === 'support' ? COLORS.support : COLORS.resistance;
        ctx.fillRect(this.padL, Math.min(y1, y2), w - this.padL - this.padR, Math.abs(y2 - y1) || 1);
        ctx.strokeStyle = z.kind === 'support' ? COLORS.supportLine : COLORS.resistanceLine;
        ctx.setLineDash([4, 4]); ctx.beginPath();
        ctx.moveTo(this.padL, yFor(z.price)); ctx.lineTo(w - this.padR, yFor(z.price));
        ctx.stroke(); ctx.setLineDash([]);
        // nhãn LONG/SHORT
        const tag = z.side;
        ctx.font = 'bold 10px Inter, Arial';
        const tw = ctx.measureText(tag).width + 10;
        ctx.fillStyle = z.kind === 'support' ? COLORS.supportLine : COLORS.resistanceLine;
        ctx.fillRect(this.padL + 2, yFor(z.price) - 7, tw, 14);
        ctx.fillStyle = '#0b0e14'; ctx.textAlign = 'left';
        ctx.fillText(tag, this.padL + 7, yFor(z.price) + 3);
      };
      if (this.sr) {
        (this.sr.supports || []).forEach(drawZone);
        (this.sr.resistances || []).forEach(drawZone);
      }
      // highlight vùng được chọn
      if (this.highlightZone) {
        const z = this.highlightZone;
        const y1 = yFor(z.high), y2 = yFor(z.low);
        ctx.fillStyle = COLORS.highlight;
        ctx.fillRect(this.padL, Math.min(y1, y2), w - this.padL - this.padR, Math.abs(y2 - y1) || 2);
      }

      // nến
      const n = this.candles.length;
      const plotW = w - this.padL - this.padR;
      const cw = Math.max(1.5, (plotW / n) * 0.62);
      for (let i = 0; i < n; i++) {
        const c = this.candles[i];
        const x = this._xForIndex(i, w);
        const up = c.close >= c.open;
        ctx.strokeStyle = up ? COLORS.up : COLORS.down;
        ctx.fillStyle = up ? COLORS.up : COLORS.down;
        ctx.beginPath();
        ctx.moveTo(x, yFor(c.high)); ctx.lineTo(x, yFor(c.low)); ctx.stroke();
        const yo = yFor(c.open), yc = yFor(c.close);
        ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
      }

      // EMA
      const drawLine = (series, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          if (series[i] == null) continue;
          const x = this._xForIndex(i, w), y = yFor(series[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke(); ctx.lineWidth = 1;
      };
      drawLine(this.ema20, COLORS.ema20);
      drawLine(this.ema50, COLORS.ema50);

      // giá hiện tại
      const last = this.candles[n - 1];
      const yl = yFor(last.close);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(this.padL, yl); ctx.lineTo(w - this.padR, yl); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = last.close >= last.open ? COLORS.up : COLORS.down;
      ctx.fillRect(w - this.padR, yl - 8, this.padR, 16);
      ctx.fillStyle = '#04121a'; ctx.font = 'bold 10px Inter, Arial'; ctx.textAlign = 'left';
      ctx.fillText(fmt(last.close), w - this.padR + 4, yl + 3);

      // crosshair + tooltip
      this._crosshair(ctx, w, h, yFor, plotT, plotB);
      // legend EMA
      ctx.textAlign = 'left'; ctx.font = '11px Inter, Arial';
      ctx.fillStyle = COLORS.ema20; ctx.fillText('EMA20', this.padL + 4, plotT + 12);
      ctx.fillStyle = COLORS.ema50; ctx.fillText('EMA50', this.padL + 54, plotT + 12);
    }

    _crosshair(ctx, w, h, yFor, plotT, plotB) {
      if (this.hoverX == null) return;
      const n = this.candles.length;
      const plotW = w - this.padL - this.padR;
      let i = Math.round(((this.hoverX - this.padL) / plotW) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      const x = this._xForIndex(i, w);
      const c = this.candles[i];
      ctx.strokeStyle = COLORS.crosshair; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, plotT); ctx.lineTo(x, plotB); ctx.stroke(); ctx.setLineDash([]);
      // tooltip
      const d = new Date(c.time * 1000);
      const lines = [
        d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        'O ' + fmt(c.open) + '  H ' + fmt(c.high),
        'L ' + fmt(c.low) + '  C ' + fmt(c.close),
      ];
      if (this.rsi[i] != null) lines.push('RSI ' + this.rsi[i].toFixed(1));
      ctx.font = '10px Inter, Arial';
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
      let bx = x + 8; if (bx + bw > w - this.padR) bx = x - bw - 8;
      ctx.fillStyle = 'rgba(12,16,24,0.92)';
      ctx.fillRect(bx, plotT + 4, bw, lines.length * 13 + 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.strokeRect(bx, plotT + 4, bw, lines.length * 13 + 6);
      ctx.fillStyle = '#d5dae3'; ctx.textAlign = 'left';
      lines.forEach((l, k) => ctx.fillText(l, bx + 6, plotT + 18 + k * 13));
    }

    _renderRSI() {
      const ctx = this.rctx;
      const { w, h } = this._prep(this.rc, ctx, this.rc.parentElement.clientHeight || 120);
      const padT = 8, padB = 14, plotH = h - padT - padB;
      const yFor = (v) => padT + (1 - v / 100) * plotH;

      // dải quá mua (70-100) & quá bán (0-30)
      ctx.fillStyle = COLORS.ob;
      ctx.fillRect(this.padL, yFor(100), w - this.padL - this.padR, yFor(70) - yFor(100));
      ctx.fillStyle = COLORS.os;
      ctx.fillRect(this.padL, yFor(30), w - this.padL - this.padR, yFor(0) - yFor(30));

      // đường mốc 80/70/50/30/20
      [80, 70, 50, 30, 20].forEach((lvl) => {
        const y = yFor(lvl);
        ctx.strokeStyle = lvl === 50 ? 'rgba(255,255,255,0.08)' : COLORS.grid;
        ctx.beginPath(); ctx.moveTo(this.padL, y); ctx.lineTo(w - this.padR, y); ctx.stroke();
        ctx.fillStyle = COLORS.text; ctx.font = '10px Inter, Arial'; ctx.textAlign = 'left';
        ctx.fillText(String(lvl), w - this.padR + 6, y + 3);
      });

      // đường RSI
      ctx.strokeStyle = COLORS.rsiLine; ctx.lineWidth = 1.6; ctx.beginPath();
      let started = false;
      for (let i = 0; i < this.candles.length; i++) {
        if (this.rsi[i] == null) continue;
        const x = this._xForIndex(i, w), y = yFor(this.rsi[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.lineWidth = 1;

      // chấm RSI hiện tại
      let lastRsi = 50;
      for (let i = this.rsi.length - 1; i >= 0; i--) if (this.rsi[i] != null) { lastRsi = this.rsi[i]; break; }
      const lx = this._xForIndex(this.candles.length - 1, w), ly = yFor(lastRsi);
      const zone = TA.rsiZone(lastRsi);
      ctx.fillStyle = zone.color; ctx.beginPath(); ctx.arc(lx, ly, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = zone.color; ctx.font = 'bold 10px Inter, Arial'; ctx.textAlign = 'left';
      ctx.fillText('RSI ' + lastRsi.toFixed(1), this.padL + 4, padT + 10);
    }
  }

  window.VdearChart = VdearChart;
})();

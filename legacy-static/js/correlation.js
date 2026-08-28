/*
 * Mạng tương quan — module dùng chung.
 *
 * Tách khỏi terminal.js để trang chủ và trang terminal chạy CÙNG MỘT bản cài
 * đặt. Chép đôi thì sớm muộn hai bên lệch nhau, và lúc đó không ai biết con số
 * nào mới đúng.
 *
 * Màu đọc từ biến CSS của chính canvas (--corr-up/--corr-down/--corr-edge),
 * nên mỗi trang tự áp bảng màu của mình mà không phải sửa file này.
 */
(function () {
  const API = window.VdearAPI;

  /* Lợi suất log theo ngày. Giá <= 0 -> null, không tính bừa. */
  function logReturns(candles) {
    const out = [];
    for (let i = 1; i < candles.length; i++) {
      const a = candles[i - 1].close, b = candles[i].close;
      out.push(a > 0 && b > 0 ? Math.log(b / a) : null);
    }
    return out;
  }

  /*
   * Hệ số tương quan Pearson. Dưới 10 ngày chung, hoặc một chuỗi phương sai
   * bằng 0 (giá đứng im) -> null. Ép ra một con số ở hai trường hợp đó là bịa.
   */
  function pearson(a, b) {
    let n = 0, sa = 0, sb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] == null || b[i] == null) continue;
      n++; sa += a[i]; sb += b[i];
    }
    if (n < 10) return null;
    const ma = sa / n, mb = sb / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < len; i++) {
      if (a[i] == null || b[i] == null) continue;
      const da = a[i] - ma, db = b[i] - mb;
      cov += da * db; va += da * da; vb += db * db;
    }
    if (va <= 0 || vb <= 0) return null;
    return cov / Math.sqrt(va * vb);
  }

  /* Lưới Fibonacci: rải điểm đều trên mặt cầu, không bị dồn ở hai cực. */
  function fib(i, n) {
    const off = 2 / n, y = i * off - 1 + off / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const ph = i * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(ph) * r, y, Math.sin(ph) * r];
  }

  /*
   * Lấy nến ngày rồi tính ma trận tương quan.
   * Trả { assets, edges, meanAbs } — assets đã gắn thêm rsi và rhoBtc.
   */
  async function compute(coins, opts) {
    const o = opts || {};
    const limit = o.limit || 24, days = o.days || 60;
    const top = coins.slice(0, limit);
    const series = await API.pool(top, async (c) => {
      try {
        const k = await API.klinesMulti(c, '1d', days);
        return { c, candles: k && k.length ? k : null };
      } catch (e) { return { c, candles: null }; }
    }, 5);

    const ok = series.filter((s) => s.candles && s.candles.length > 20);
    const TA = window.VdearTA;
    ok.forEach((s) => {
      if (TA && TA.lastRSI) s.c.rsi = TA.lastRSI(s.candles.map((k) => k.close), 14);
      s.rets = logReturns(s.candles);
    });
    if (ok.length < 3) return { assets: [], edges: [], meanAbs: null };

    const edges = [];
    let sum = 0, cnt = 0;
    const btc = ok.findIndex((s) => s.c.base === 'BTC');
    for (let i = 0; i < ok.length; i++) {
      for (let j = i + 1; j < ok.length; j++) {
        const rho = pearson(ok[i].rets, ok[j].rets);
        if (rho == null) continue;
        sum += Math.abs(rho); cnt++;
        if (Math.abs(rho) > 0.34) edges.push({ i, j, rho });
      }
      if (btc >= 0 && i !== btc) ok[i].c.rhoBtc = pearson(ok[i].rets, ok[btc].rets);
    }
    return { assets: ok.map((s) => s.c), edges, meanAbs: cnt ? sum / cnt : null };
  }

  /* ---------------------------------------------------------------- */

  function readVar(el, name, fallback) {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }

  /*
   * Vẽ và xử lý di chuột. Trả về hàm dừng, để trang gỡ được khi vẽ lại.
   */
  function render(canvas, tip, assets, edges, fmt) {
    const nodes = assets.map((c, i) => {
      const [x, y, z] = fib(i, assets.length);
      const mc = c.marketCap || 0;
      return { c, x, y, z, r: 4 + Math.pow(Math.max(mc, 1) / 1e9, 0.33) * 1.5 };
    });
    let rot = 0.5, raf = 0, paused = false, proj = [];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) { raf = requestAnimationFrame(draw); return; }
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const up = readVar(canvas, '--corr-up', '70,201,139');
      const dn = readVar(canvas, '--corr-down', '229,89,95');
      const ed = readVar(canvas, '--corr-edge', '145,132,217');
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
      const p = nodes.map((n) => {
        const x = n.x * Math.cos(rot) - n.z * Math.sin(rot);
        const z = n.x * Math.sin(rot) + n.z * Math.cos(rot);
        const s = 1 / (2.6 - z);
        return { n, sx: cx + x * R * s * 2.4, sy: cy - n.y * R * s * 2.4, s, z };
      });
      proj = p;
      g.lineWidth = 1;
      for (const e of edges) {
        const a = p[e.i], b = p[e.j];
        if (!a || !b) continue;
        const dep = (a.z + b.z) / 2;
        const al = e.rho * e.rho * 0.3 * (0.35 + 0.65 * (dep + 1) / 2);
        g.strokeStyle = 'rgba(' + ed + ',' + al.toFixed(3) + ')';
        g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke();
      }
      p.sort((a, b) => a.z - b.z);
      for (const q of p) {
        const col = q.n.c.change >= 0 ? up : dn;
        const rr = q.n.r * q.s * 1.15, dim = 0.4 + 0.6 * (q.z + 1) / 2;
        const gr = g.createRadialGradient(q.sx, q.sy, 0, q.sx, q.sy, rr * 2.6);
        gr.addColorStop(0, 'rgba(' + col + ',' + (0.5 * dim).toFixed(2) + ')');
        gr.addColorStop(1, 'rgba(' + col + ',0)');
        g.fillStyle = gr; g.beginPath(); g.arc(q.sx, q.sy, rr * 2.6, 0, 6.284); g.fill();
        g.fillStyle = 'rgba(' + col + ',' + (0.85 * dim).toFixed(2) + ')';
        g.beginPath(); g.arc(q.sx, q.sy, rr, 0, 6.284); g.fill();
        g.strokeStyle = 'rgba(255,255,255,' + (0.3 * dim).toFixed(2) + ')';
        g.lineWidth = 0.8; g.stroke();
      }
      if (!reduce && !paused) rot += 0.0016;
      raf = requestAnimationFrame(draw);
    }
    draw();

    function hit(mx, my) {
      let best = null, bd = 1e9;
      for (const q of proj) {
        const d = Math.hypot(q.sx - mx, q.sy - my);
        if (d < Math.max(11, q.n.r * q.s * 1.6) && d < bd) { bd = d; best = q.n; }
      }
      return best;
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const n = hit(mx, my);
      if (!n) { tip.hidden = true; paused = false; return; }
      paused = true;                       // dừng xoay để còn đọc được
      tip.hidden = false;
      tip.style.left = Math.max(6, Math.min(mx + 16, r.width - 226)) + 'px';
      tip.style.top = Math.max(6, my - 40) + 'px';
      tip.innerHTML = fmt(n.c);
    }
    function onLeave() { tip.hidden = true; paused = false; }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    return function stop() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }

  window.VdearCorr = { logReturns, pearson, compute, render };
})();

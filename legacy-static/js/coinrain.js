/*
 * Vdear — Coin Rain (hiệu ứng nghịch coin cuối trang)
 * Engine vật lý 2D tự viết: coin rơi theo trọng lực, va chạm & bật nhau,
 * kéo chuột/chạm để cầm 1 coin và hất văng các coin khác (như đá banh).
 * Không dùng thư viện ngoài, không nhúng code của site khác.
 */
(function () {
  const API = window.VdearAPI;

  function startRain(canvas, bases) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // ---- Tạo coin ----
    const coins = bases.map((b) => {
      const r = 20 + Math.random() * 16;
      const c = {
        base: b, r,
        x: r + Math.random() * Math.max(1, (W || 800) - 2 * r),
        y: -r - Math.random() * 500,
        vx: (Math.random() - 0.5) * 80, vy: 0,
        angle: Math.random() * 6.28, va: (Math.random() - 0.5) * 1.5,
        img: null,
      };
      loadLogo(c);
      return c;
    });

    function loadLogo(c) {
      const srcs = (API.logoSources ? API.logoSources(c.base) : []).slice();
      srcs.push(API.letterAvatar(c.base)); // fallback cuối luôn tải được (data-URI)
      const img = new Image();
      let i = 0;
      const tryNext = () => { if (i >= srcs.length) return; img.src = srcs[i++]; };
      img.onload = () => { if (img.naturalWidth > 1) c.img = img; else tryNext(); };
      img.onerror = tryNext;
      tryNext();
    }

    // ---- Vật lý ----
    const G = 1100, REST = 0.5, WALL = 0.6, FRICT = 0.9, E = 0.5;
    let dragging = null, mx = 0, my = 0, pmx = 0, pmy = 0, mt = 0, hovering = false;

    function clampV(c) {
      const max = 2600;
      c.vx = Math.max(-max, Math.min(max, c.vx));
      c.vy = Math.max(-max, Math.min(max, c.vy));
    }

    function step(dt) {
      for (const c of coins) {
        if (c === dragging) continue;
        c.vy += G * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.angle += c.va * dt;
        if (c.x - c.r < 0) { c.x = c.r; c.vx = -c.vx * WALL; }
        if (c.x + c.r > W) { c.x = W - c.r; c.vx = -c.vx * WALL; }
        if (c.y + c.r > H) { c.y = H - c.r; c.vy = -c.vy * REST; c.vx *= FRICT; c.va *= FRICT; if (Math.abs(c.vy) < 25) c.vy = 0; }
        if (c.y - c.r < 0 && c.vy < 0) { c.y = c.r; c.vy = -c.vy * WALL; }
        clampV(c);
      }
      // va chạm cặp (vài vòng lặp cho ổn định)
      for (let it = 0; it < 4; it++) {
        for (let i = 0; i < coins.length; i++)
          for (let j = i + 1; j < coins.length; j++) resolve(coins[i], coins[j]);
      }
    }

    function resolve(a, b) {
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy); const min = a.r + b.r;
      if (d >= min) return;
      if (d === 0) { d = 0.01; dx = 0.01; dy = 0; }
      const nx = dx / d, ny = dy / d, overlap = min - d;
      const invA = a === dragging ? 0 : 1, invB = b === dragging ? 0 : 1;
      const denom = invA + invB; if (denom === 0) return;
      // tách chồng lấn
      a.x -= nx * overlap * (invA / denom); a.y -= ny * overlap * (invA / denom);
      b.x += nx * overlap * (invB / denom); b.y += ny * overlap * (invB / denom);
      // xung lực theo pháp tuyến
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
      if (vn > 0) return;
      const jimp = -(1 + E) * vn / denom;
      a.vx -= jimp * nx * invA; a.vy -= jimp * ny * invA;
      b.vx += jimp * nx * invB; b.vy += jimp * ny * invB;
      clampV(a); clampV(b);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const c of coins) {
        ctx.save(); ctx.translate(c.x, c.y);
        ctx.beginPath(); ctx.arc(0, 0, c.r + 1, 0, 6.2832);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
        ctx.rotate(c.angle);
        ctx.beginPath(); ctx.arc(0, 0, c.r, 0, 6.2832); ctx.closePath();
        ctx.fillStyle = '#1B1810'; ctx.fill();
        if (c.img) { ctx.save(); ctx.clip(); ctx.drawImage(c.img, -c.r, -c.r, c.r * 2, c.r * 2); ctx.restore(); }
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(216,163,43,0.38)';  // gold rim: the discs read as struck coins ctx.stroke();
        ctx.restore();
      }
    }

    let last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000; last = now; if (dt > 0.045) dt = 0.045;
      step(dt); draw();
      requestAnimationFrame(frame);
    }

    // ---- Tương tác chuột/chạm ----
    function pos(e) {
      const r = canvas.getBoundingClientRect();
      const t = (e.touches && e.touches[0]) || e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    }
    function pick(p) {
      // chọn coin gần con trỏ nhất trong bán kính
      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        if (Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 4) return c;
      }
      return null;
    }
    function down(e) {
      const p = pos(e); const c = pick(p);
      if (c) { dragging = c; c.vx = c.vy = 0; mx = pmx = p.x; my = pmy = p.y; mt = performance.now(); e.preventDefault && e.preventDefault(); }
    }
    function move(e) {
      const p = pos(e);
      if (!dragging) { hovering = !!pick(p); canvas.style.cursor = hovering ? 'grab' : 'default'; return; }
      pmx = mx; pmy = my; mx = p.x; my = p.y;
      const now = performance.now(); const dt = Math.max(0.001, (now - mt) / 1000); mt = now;
      dragging.x = Math.max(dragging.r, Math.min(W - dragging.r, mx));
      dragging.y = Math.max(dragging.r, Math.min(H - dragging.r, my));
      dragging.vx = (mx - pmx) / dt; dragging.vy = (my - pmy) / dt;
      dragging.angle += 0.2; clampV(dragging);
      canvas.style.cursor = 'grabbing';
    }
    function up() { dragging = null; canvas.style.cursor = hovering ? 'grab' : 'default'; }

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', (e) => { move(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', up);

    // Bắt đầu rơi khi cuộn tới cuối trang (tiết kiệm CPU + đúng "kéo xuống mới rơi").
    let started = false;
    function begin() {
      if (started) return; started = true;
      resize();
      coins.forEach((c) => { c.x = c.r + Math.random() * Math.max(1, W - 2 * c.r); c.y = -c.r - Math.random() * H; c.vy = 0; });
      last = performance.now();
      requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { begin(); io.disconnect(); } }, { threshold: 0.15 });
      io.observe(canvas);
    } else { begin(); }
  }

  async function init(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    let bases = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'TON', 'TRX', 'DOT', 'LTC', 'UNI', 'ATOM', 'NEAR'];
    try { const m = await API.getMarket(); if (m && m.length) bases = m.slice(0, 16).map((c) => c.base); } catch (e) { /* dùng mặc định */ }
    startRain(canvas, bases);
  }

  window.VdearCoinRain = { init };
  const boot = () => init('coinRain');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

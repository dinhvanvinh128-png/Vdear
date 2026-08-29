/*
 * Bản đồ thị trường 3D — cột dựng trên mặt lưới, xoay và phóng được.
 *
 * KHÔNG dùng thư viện. Repo này không có bước build và không cài được package,
 * nên three.js chỉ có thể nạp qua CDN — mà CDN hỏng hoặc bị chặn là trắng cả
 * trang. Phép chiếu phối cảnh viết tay chỉ tốn vài chục dòng và không bao giờ
 * hỏng vì mạng.
 *
 * Đây là 3D THẬT chứ không phải isometric: có tâm nhìn, có phối cảnh (vật xa
 * nhỏ lại), xoay quanh hai trục. Mặt khuất bị loại bằng dấu diện tích chiếu,
 * và các cột vẽ từ xa tới gần.
 *
 * Dữ liệu: chiều cao cột = |biến động 24h|, hướng lên/xuống = tăng/giảm, độ
 * rộng chân cột = tỉ trọng khối lượng. Tất cả từ dữ liệu thật của 4 sàn; không
 * có đường nào ở đây sinh ra số.
 */
(function () {
  const TAU = Math.PI * 2;

  /* ---------------- phép chiếu ---------------- */
  function makeCam() {
    return { yaw: -0.62, pitch: 0.48, dist: 54, fov: 620 };
  }

  /*
   * (x,y,z) -> (sx, sy, depth).
   * Xoay quanh trục Y (yaw) rồi trục X (pitch), sau đó chia phối cảnh.
   * depth càng lớn càng xa; dùng để sắp thứ tự vẽ.
   */
  function project(p, cam, cx, cy) {
    const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw);
    const x1 = p[0] * cyaw - p[2] * syaw;
    const z1 = p[0] * syaw + p[2] * cyaw;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const y2 = p[1] * cp - z1 * sp;
    const z2 = p[1] * sp + z1 * cp;
    const d = cam.dist + z2;
    if (d < 1) return null;                       // sau lưng camera -> bỏ
    const s = cam.fov / d;
    return [cx + x1 * s, cy - y2 * s, d];
  }

  /* Diện tích có dấu của đa giác chiếu: âm = mặt quay lưng lại -> không vẽ. */
  function signedArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function inPoly(pts, x, y) {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y)
        && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }

  /* Sáu mặt của khối hộp, theo chỉ số 8 đỉnh. */
  const FACES = [
    [4, 5, 6, 7], [0, 3, 2, 1], [0, 1, 5, 4],
    [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7],
  ];
  // Mặt trên/dưới sáng nhất, hai mặt bên tối dần — thứ tạo ra cảm giác khối.
  const SHADE = [1, 0.55, 0.82, 0.66, 0.74, 0.74];

  function boxCorners(x, z, w, y0, y1) {
    const h = w / 2;
    return [
      [x - h, y0, z - h], [x + h, y0, z - h], [x + h, y0, z + h], [x - h, y0, z + h],
      [x - h, y1, z - h], [x + h, y1, z - h], [x + h, y1, z + h], [x - h, y1, z + h],
    ];
  }

  function mix(rgb, k) {
    return 'rgb(' + rgb.map((c) => Math.round(Math.min(255, c * k))).join(',') + ')';
  }
  function parseRgb(s, fb) {
    const m = String(s).trim().match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : fb;
  }

  /* ---------------- dựng cảnh ---------------- */

  function build(coins, opts) {
    const n = Math.min(coins.length, opts.count || 36);
    const list = coins.slice(0, n);
    const cols = Math.ceil(Math.sqrt(n));
    const gap = 5.4;
    const maxAbs = list.reduce((m, c) => Math.max(m, Math.abs(c.change || 0)), 0) || 1;
    const maxVol = list.reduce((m, c) => Math.max(m, c.quoteVolume || 0), 0) || 1;
    const off = ((cols - 1) * gap) / 2;
    return list.map((c, i) => {
      const gx = (i % cols) * gap - off;
      const gz = Math.floor(i / cols) * gap - off;
      const chg = c.change || 0;
      // Chiều cao theo |biến động|; nhân căn để cột nhỏ vẫn nhìn thấy.
      const h = Math.max(0.6, Math.sqrt(Math.abs(chg) / maxAbs) * 17);
      const share = (c.quoteVolume || 0) / maxVol;
      const w = 2.0 + Math.sqrt(share) * 2.2;
      return { c, gx, gz, w, up: chg >= 0, y0: 0, y1: chg >= 0 ? h : -h };
    });
  }

  /* ---------------- vẽ ---------------- */

  function mount(canvas, tip, coins, fmt, opts) {
    const cam = makeCam();
    const home = { ...cam };
    let bars = build(coins, opts || {});
    let raf = 0, dirty = true, onScreen = true, hover = null, drag = null;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let spin = !reduce;

    // Đọc màu MỘT LẦN; đọc lại khi đổi nền sáng/tối.
    let pal = readPal();
    function readPal() {
      const cs = getComputedStyle(canvas);
      return {
        up: parseRgb(cs.getPropertyValue('--m3-up'), [79, 180, 119]),
        down: parseRgb(cs.getPropertyValue('--m3-down'), [224, 87, 79]),
        grid: cs.getPropertyValue('--m3-grid').trim() || 'rgba(216,163,43,.16)',
        ink: cs.getPropertyValue('--m3-ink').trim() || '#EDE7D6',
      };
    }
    const themeObs = new MutationObserver(() => { pal = readPal(); dirty = true; });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    function draw() {
      raf = 0;
      if (!onScreen || document.hidden) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) { raf = requestAnimationFrame(draw); return; }
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); dirty = true;
      }
      if (spin && !drag && !hover) { cam.yaw += 0.0022; dirty = true; }
      if (!dirty) { raf = requestAnimationFrame(draw); return; }   // đứng yên -> không vẽ lại
      dirty = false;

      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2 + h * 0.04;

      // Lưới nền
      const span = 3 + Math.ceil(Math.sqrt(bars.length)) * 5.4 / 2;
      g.strokeStyle = pal.grid; g.lineWidth = 1;
      for (let i = -span; i <= span; i += 5.4) {
        const segs = [[[i, 0, -span], [i, 0, span]], [[-span, 0, i], [span, 0, i]]];
        for (const [a, b] of segs) {
          const pa = project(a, cam, cx, cy), pb = project(b, cam, cx, cy);
          if (!pa || !pb) continue;
          g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
        }
      }

      // Chiếu mọi khối, rồi vẽ TỪ XA TỚI GẦN.
      const drawn = [];
      for (const b of bars) {
        const pts = boxCorners(b.gx, b.gz, b.w, b.y0, b.y1).map((p) => project(p, cam, cx, cy));
        if (pts.some((p) => !p)) continue;
        let dsum = 0; for (const p of pts) dsum += p[2];
        drawn.push({ b, pts, depth: dsum / 8 });
      }
      drawn.sort((a, b) => b.depth - a.depth);

      for (const item of drawn) {
        const base = item.b.up ? pal.up : pal.down;
        const isHover = hover && hover.b === item.b;
        const faces = [];
        for (let f = 0; f < FACES.length; f++) {
          const quad = FACES[f].map((k) => item.pts[k]);
          if (signedArea(quad) <= 0) continue;            // mặt quay lưng -> bỏ
          let d = 0; for (const p of quad) d += p[2];
          faces.push({ quad, shade: SHADE[f], depth: d / 4 });
        }
        faces.sort((a, b) => b.depth - a.depth);
        for (const f of faces) {
          g.fillStyle = mix(base, f.shade * (isHover ? 1.25 : 1));
          g.beginPath();
          g.moveTo(f.quad[0][0], f.quad[0][1]);
          for (let i = 1; i < f.quad.length; i++) g.lineTo(f.quad[i][0], f.quad[i][1]);
          g.closePath(); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 0.7; g.stroke();
        }
        item.top = FACES[item.b.up ? 0 : 1].map((k) => item.pts[k]);
      }
      canvas.__hitmap = drawn;

      // Nhãn: chỉ cột đang trỏ vào, để 36 nhãn không chồng lên nhau.
      if (hover) {
        const t = hover.top;
        if (t) {
          let mx = 0, my = 0; for (const p of t) { mx += p[0]; my += p[1]; }
          g.fillStyle = pal.ink;
          g.font = '700 12px "JetBrains Mono", monospace';
          g.textAlign = 'center';
          g.fillText(hover.b.c.base, mx / 4, my / 4 - 9);
        }
      }
      raf = requestAnimationFrame(draw);
    }

    function wake() { dirty = true; if (!raf && onScreen && !document.hidden) raf = requestAnimationFrame(draw); }

    /* --- tương tác --- */
    function pick(mx, my) {
      const map = canvas.__hitmap || [];
      for (let i = map.length - 1; i >= 0; i--) {          // gần nhất trước
        if (map[i].top && inPoly(map[i].top, mx, my)) return map[i];
      }
      return null;
    }
    function onMove(e) {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      if (drag) {
        cam.yaw += (mx - drag.x) * 0.008;
        cam.pitch = Math.max(0.08, Math.min(1.35, cam.pitch + (my - drag.y) * 0.006));
        drag = { x: mx, y: my };
        wake(); return;
      }
      const h = pick(mx, my);
      if (h !== hover) { hover = h; wake(); }
      if (!h) { tip.hidden = true; canvas.style.cursor = 'grab'; return; }
      canvas.style.cursor = 'pointer';
      tip.hidden = false;
      tip.style.left = Math.max(6, Math.min(mx + 16, r.width - 216)) + 'px';
      tip.style.top = Math.max(6, my - 30) + 'px';
      tip.innerHTML = fmt(h.b.c);
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => { hover = null; drag = null; tip.hidden = true; wake(); });
    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      canvas.style.cursor = 'grabbing'; tip.hidden = true;
    });
    window.addEventListener('mouseup', () => { if (drag) { drag = null; canvas.style.cursor = 'grab'; } });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.dist = Math.max(26, Math.min(130, cam.dist + Math.sign(e.deltaY) * 5));
      wake();
    }, { passive: false });

    /* Ngủ khi khuất tầm nhìn hoặc tab bị ẩn. */
    const io = new IntersectionObserver((es) => {
      onScreen = es.some((x) => x.isIntersecting);
      if (onScreen) wake();
    }, { rootMargin: '150px' });
    io.observe(canvas);
    const onVis = () => { if (!document.hidden) wake(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', wake);

    wake();

    return {
      reset() { Object.assign(cam, home); wake(); },
      toggleSpin() { spin = !spin; wake(); return spin; },
      setData(next) { bars = build(next, opts || {}); wake(); },
      stop() {
        cancelAnimationFrame(raf); raf = 0;
        io.disconnect(); themeObs.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  window.VdearMarket3D = { mount, project, signedArea, inPoly, build };
})();

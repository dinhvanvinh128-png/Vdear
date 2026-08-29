/*
 * Vdear — mưa nền cho thẻ Signal Radar.
 *
 * Logo của ĐÚNG coin đang chọn rơi liên tục ở nền thẻ, kèm mũi tên chỉ xu
 * hướng: lên/xanh khi tín hiệu LONG, xuống/đỏ khi SHORT. Trung tính thì không
 * có mũi tên — vẽ mũi tên khi chưa biết hướng là bịa ra một phát biểu về thị
 * trường.
 *
 * Về hiệu năng (trang này từng bị giật trên PC vì lớp nền động):
 *  - một canvas duy nhất, không filter/blur, không shadowBlur trên từng hạt;
 *  - dừng hẳn vòng lặp khi thẻ ra khỏi màn hình hoặc tab bị ẩn;
 *  - prefers-reduced-motion: vẽ MỘT khung tĩnh rồi thôi;
 *  - devicePixelRatio giới hạn 2.
 *
 * Về độ tương phản: hạt vẽ ở alpha rất thấp vì chữ mờ (--hx-dim) nằm trực tiếp
 * trên nền thẻ, không có ô nền đục che. Trần alpha ở đây được chốt bằng phép ĐO
 * pixel thật dưới từng đoạn chữ rồi tính lại tỉ lệ tương phản, chứ không phải
 * ước lượng — tăng số hạt và kích thước thì hiệu ứng rõ hơn mà không phải đẩy
 * alpha lên tới mức nuốt mất chữ.
 */
(function () {
  const API = window.VdearAPI;
  // Trần alpha tách riêng theo màu: vàng của logo sáng hơn xanh/đỏ nên phải
  // dè hơn. Con số này được kiểm bằng cách đo pixel thật dưới từng đoạn chữ,
  // không phải ước lượng bằng mắt (xem test tương phản).
  const A_LOGO = 0.10, A_ARROW = 0.13;
  const N_LOGO = 16, N_ARROW = 12;

  function make(card) {
    const canvas = document.createElement('canvas');
    canvas.className = 'hx-rain';
    canvas.setAttribute('aria-hidden', 'true');
    card.insertBefore(canvas, card.firstChild);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, raf = 0, last = 0, visible = true, onScreen = true;
    let img = null, trend = '';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ---------------------------- hạt rơi ------------------------------- */

    const parts = [];
    function spawn(kind, atTop) {
      const size = kind === 'logo' ? 18 + Math.random() * 16 : 14 + Math.random() * 12;
      return {
        kind, size,
        x: Math.random() * Math.max(1, W),
        y: atTop ? -size - Math.random() * H : Math.random() * Math.max(1, H),
        vy: (kind === 'logo' ? 16 : 24) + Math.random() * 22,   // px/giây
        drift: (Math.random() - 0.5) * 12,
        rot: Math.random() * Math.PI * 2,
        vrot: kind === 'logo' ? (Math.random() - 0.5) * 0.5 : 0,
        alpha: (0.55 + Math.random() * 0.45) * (kind === 'logo' ? A_LOGO : A_ARROW),
        phase: Math.random() * Math.PI * 2,
      };
    }
    function build() {
      parts.length = 0;
      for (let i = 0; i < N_LOGO; i++) parts.push(spawn('logo', false));
      for (let i = 0; i < N_ARROW; i++) parts.push(spawn('arrow', false));
    }

    function step(dt, t) {
      for (const p of parts) {
        p.y += p.vy * dt;
        p.x += (p.drift + Math.sin(t / 1400 + p.phase) * 5) * dt;
        p.rot += p.vrot * dt;
        if (p.y - p.size > H) {
          const n = spawn(p.kind, false);
          n.y = -n.size; n.x = Math.random() * W;
          Object.assign(p, n);
        }
        if (p.x < -p.size) p.x = W + p.size;
        else if (p.x > W + p.size) p.x = -p.size;
      }
    }

    function arrowPath(s, up) {
      // Mũi tên đơn giản: thân + đầu. Vẽ trong hộp s×s, gốc ở tâm.
      const h = s / 2, w = s * 0.32;
      ctx.beginPath();
      if (up) {
        ctx.moveTo(0, -h); ctx.lineTo(w, -h + w * 1.5); ctx.moveTo(0, -h);
        ctx.lineTo(-w, -h + w * 1.5); ctx.moveTo(0, -h); ctx.lineTo(0, h);
      } else {
        ctx.moveTo(0, h); ctx.lineTo(w, h - w * 1.5); ctx.moveTo(0, h);
        ctx.lineTo(-w, h - w * 1.5); ctx.moveTo(0, h); ctx.lineTo(0, -h);
      }
    }

    function draw() {
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);
      const cs = getComputedStyle(card);
      const up = trend === 'up';
      const col = up ? (cs.getPropertyValue('--hx-up').trim() || '#3FB950')
                     : (cs.getPropertyValue('--hx-down').trim() || '#F85149');
      for (const p of parts) {
        if (p.kind === 'arrow' && !trend) continue;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        if (p.kind === 'logo') {
          if (img) {
            ctx.rotate(p.rot);
            ctx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
          }
        } else {
          ctx.strokeStyle = col;
          ctx.lineWidth = Math.max(1.6, p.size * 0.18);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          arrowPath(p.size, up);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function frame(t) {
      raf = 0;
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      step(dt, t);
      draw();
      if (running()) raf = requestAnimationFrame(frame);
    }

    function running() { return visible && onScreen && !reduce.matches; }

    function kick() {
      if (!running()) { if (raf) { cancelAnimationFrame(raf); raf = 0; } draw(); return; }
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    /* --------------------------- vòng đời ------------------------------- */

    function onResize() { resize(); if (!parts.length) build(); draw(); }

    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(card);
    else window.addEventListener('resize', onResize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        onScreen = es.some((e) => e.isIntersecting);
        kick();
      }, { threshold: 0 }).observe(card);
    }
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; kick(); });
    if (reduce.addEventListener) reduce.addEventListener('change', kick);

    resize(); build(); kick();

    /* ---------------------------- điều khiển ---------------------------- */

    // Đổi coin -> đổi ảnh. Thử lần lượt các nguồn logo, cuối cùng là avatar
    // chữ dạng data-URI (luôn tải được) nên không bao giờ rơi ra nền trống.
    let logoSeq = 0;
    function setCoin(base) {
      if (!base || !API) return;
      const my = ++logoSeq;
      const srcs = (API.logoSources ? API.logoSources(base) : []).slice();
      if (API.letterAvatar) srcs.push(API.letterAvatar(base));
      let i = 0;
      // KHÔNG đặt crossOrigin: vài CDN logo không trả header CORS, bật lên là
      // ảnh thật hỏng và rơi về avatar chữ dù ảnh vẫn tải được bình thường.
      const im = new Image();
      const next = () => {
        if (my !== logoSeq) return;                 // đã đổi coin lần nữa
        if (i >= srcs.length) return;
        im.src = srcs[i++];
      };
      im.onload = () => {
        if (my !== logoSeq) return;
        if (im.naturalWidth > 1) { img = im; draw(); } else next();
      };
      im.onerror = next;
      next();
    }

    function setTrend(t) { trend = (t === 'up' || t === 'down') ? t : ''; draw(); }

    return { setCoin, setTrend };
  }

  let inst = null;
  function init() {
    const card = document.getElementById('hxRadar');
    if (!card || inst) return;
    inst = make(card);
    window.VdearRadarRain = inst;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/*
 * Vdear — mưa nền cho thẻ Signal Radar.
 *
 * Logo của ĐÚNG coin đang chọn rơi liên tục ở nền thẻ. Kèm theo là mũi tên xu
 * hướng dạng gấp khúc như biểu đồ giá: dự đoán TĂNG thì mũi tên xanh BAY LÊN,
 * dự đoán GIẢM thì mũi tên đỏ RƠI XUỐNG — chiều chuyển động chính là nội dung
 * chứ không phải trang trí. Trung tính thì không có mũi tên: vẽ mũi tên khi
 * chưa biết hướng là bịa ra một phát biểu về thị trường.
 *
 * Về hiệu năng (trang này từng bị giật trên PC vì lớp nền động):
 *  - một canvas duy nhất, không filter/blur, không shadowBlur trên từng hạt;
 *  - dừng hẳn vòng lặp khi thẻ ra khỏi màn hình hoặc tab bị ẩn;
 *  - prefers-reduced-motion: vẽ MỘT khung tĩnh rồi thôi;
 *  - chỉ tô lại ~30 lần/giây và ở độ phân giải 1.5× thay vì 2×.
 *
 * Chi phí đo được (A/B xen kẽ 3 vòng, chỉ khác nhau ở việc chặn tệp này):
 * bản đầu với 46 hạt tốn khoảng 2 fps. Tôi đoán thủ phạm là ctx.clip() gọi cho
 * từng hạt mỗi khung, cắt sẵn logo vào một tấm sprite — đo lại thì KHÔNG đổi
 * gì cả, nên chỗ tốn là việc tô lại toàn bộ tấm canvas mỗi khung. Hai thay đổi
 * thật sự có tác dụng là hạ nhịp vẽ và hạ độ phân giải.
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
  const N_LOGO = 34, N_ARROW = 12;

  function make(card) {
    const canvas = document.createElement('canvas');
    canvas.className = 'hx-rain';
    canvas.setAttribute('aria-hidden', 'true');
    card.insertBefore(canvas, card.firstChild);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, raf = 0, last = 0, visible = true, onScreen = true;
    let sprite = null, trend = '';

    // Nhiều logo trên CDN là ảnh VUÔNG (nền đặc, góc vuông). Cắt tròn MỘT LẦN
    // vào một canvas phụ, rồi mỗi khung chỉ việc vẽ lại tấm đã cắt.
    //
    // (Cắt sẵn cũng đỡ hơn là gọi ctx.clip() cho từng hạt mỗi khung, dù đo A/B
    // cho thấy đó KHÔNG phải chỗ tốn — xem ghi chú về FPS ở đầu tệp.)
    const SPRITE = 128;
    function makeSprite(image) {
      const off = document.createElement('canvas');
      off.width = off.height = SPRITE;
      const g = off.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.beginPath();
      g.arc(SPRITE / 2, SPRITE / 2, SPRITE / 2, 0, Math.PI * 2);
      g.clip();
      g.drawImage(image, 0, 0, SPRITE, SPRITE);
      return off;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Vùng lặng quanh đồng hồ: điểm số và chữ Bullish/Bearish nằm giữa đồng hồ,
    // ngay trên mặt thẻ chứ không có ô nền đục nào che. Nhiều hạt chồng lên nhau
    // thì alpha cộng dồn — đo được là chữ Bearish tụt xuống 3.74:1. Nên hạt nào
    // đi vào vùng này sẽ mờ dần đi, thay vì phải giảm alpha của cả thẻ.
    let qx = 0, qy = 0, qr = 0;
    function quietZone() {
      const g = card.querySelector('.hx-gauge');
      if (!g) { qr = 0; return; }
      const a = g.getBoundingClientRect(), b = canvas.getBoundingClientRect();
      qx = a.left - b.left + a.width / 2;
      qy = a.top - b.top + a.height / 2;
      qr = Math.max(a.width, a.height) / 2 + 10;
    }
    function quietMul(x, y) {
      if (!qr) return 1;
      const d = Math.hypot(x - qx, y - qy);
      if (d >= qr) return 1;
      const k = d / qr;               // 0 ở tâm -> 1 ở mép vùng lặng
      return 0.14 + 0.86 * k * k;     // mờ mạnh ở giữa, hoà dần ra ngoài
    }

    function resize() {
      // Lớp nền trang trí vẽ ở alpha ≤ 0.13; hạ độ phân giải xuống 1.5 lần thì
      // mắt không thấy khác mà số pixel phải tô mỗi khung giảm gần một nửa.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      quietZone();
    }

    /* ---------------------------- hạt rơi ------------------------------- */

    const parts = [];

    // Logo luôn RƠI XUỐNG. Mũi tên đi theo dự đoán: tăng thì BAY LÊN, giảm thì
    // rơi xuống — hướng chuyển động chính là nội dung, không phải trang trí.
    function dirOf(kind) { return kind === 'arrow' && trend === 'up' ? -1 : 1; }

    function spawn(kind) {
      return {
        kind, size: 18 + Math.random() * 16, dir: dirOf(kind),
        x: Math.random() * Math.max(1, W),
        y: Math.random() * Math.max(1, H),
        vy: (kind === 'logo' ? 16 : 26) + Math.random() * 22,   // px/giây
        drift: (Math.random() - 0.5) * 12,
        rot: Math.random() * Math.PI * 2,
        vrot: kind === 'logo' ? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.1) : 0,
        alpha: (0.55 + Math.random() * 0.45) * (kind === 'logo' ? A_LOGO : A_ARROW),
        phase: Math.random() * Math.PI * 2,
      };
    }
    function build() {
      parts.length = 0;
      for (let i = 0; i < N_LOGO; i++) parts.push(spawn('logo'));
      for (let i = 0; i < N_ARROW; i++) parts.push(spawn('arrow'));
    }

    // Ra khỏi khung thì vào lại từ mép ĐỐI DIỆN với chiều đang đi.
    function recycle(p) {
      const n = spawn(p.kind);
      n.x = Math.random() * W;
      n.y = n.dir > 0 ? -n.size : H + n.size;
      Object.assign(p, n);
    }

    function step(dt, t) {
      for (const p of parts) {
        p.y += p.vy * p.dir * dt;
        p.x += (p.drift + Math.sin(t / 1400 + p.phase) * 5) * dt;
        p.rot += p.vrot * dt;
        if (p.dir > 0 ? p.y - p.size > H : p.y + p.size < 0) recycle(p);
        if (p.x < -p.size) p.x = W + p.size;
        else if (p.x > W + p.size) p.x = -p.size;
      }
    }

    // Mũi tên xu hướng dạng gấp khúc như biểu đồ giá: đuôi dưới-trái, vọt lên,
    // hụt một nhịp, rồi vọt tiếp tới đầu nhọn trên-phải. Bản "giảm" là chính
    // hình này xoay 180°, đúng như cặp icon xanh/đỏ quen thuộc.
    const ZIG = [[-0.50, 0.45], [-0.18, -0.02], [-0.02, 0.16], [0.34, -0.34]];
    const TIP = [0.50, -0.50];

    function drawArrow(s, up) {
      ctx.save();
      if (!up) ctx.rotate(Math.PI);
      ctx.lineWidth = Math.max(2, s * 0.21);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < ZIG.length; i++) {
        const x = ZIG[i][0] * s, y = ZIG[i][1] * s;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      // Đầu nhọn: tam giác hướng đúng theo đoạn cuối (45° lên-phải).
      const last = ZIG[ZIG.length - 1];
      const dx = TIP[0] - last[0], dy = TIP[1] - last[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;          // véc-tơ dọc trục
      const px = -uy, py = ux;                     // véc-tơ vuông góc
      const hl = s * 0.38, hw = s * 0.23;          // dài / nửa rộng đầu nhọn
      const bx = TIP[0] * s - ux * hl, by = TIP[1] * s - uy * hl;
      ctx.beginPath();
      ctx.moveTo(TIP[0] * s, TIP[1] * s);
      ctx.lineTo(bx + px * hw, by + py * hw);
      ctx.lineTo(bx - px * hw, by - py * hw);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
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
        const a = p.alpha * quietMul(p.x, p.y);
        if (a < 0.004) continue;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        if (p.kind === 'logo') {
          if (sprite) {
            ctx.rotate(p.rot);
            ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
          }
        } else {
          ctx.strokeStyle = col; ctx.fillStyle = col;
          drawArrow(p.size, up);
        }
        ctx.restore();
      }
    }

    // Hạt rơi chậm nên 30 hình/giây là thừa mượt, mà số lần tô lại cả tấm canvas
    // giảm một nửa. Vẫn bám requestAnimationFrame để đồng bộ với nhịp màn hình.
    const MIN_DT = 1 / 32;
    function frame(t) {
      raf = 0;
      const dt = (t - last) / 1000;
      if (dt >= MIN_DT) {
        last = t;
        step(Math.min(0.05, dt), t);
        draw();
      }
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
    // Dải khung thời gian xuống dòng thì đồng hồ dịch chỗ, phải đo lại vùng lặng.
    window.addEventListener('resize', quietZone);

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

    ctx.imageSmoothingQuality = 'high';
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
        if (im.naturalWidth > 1) { sprite = makeSprite(im); draw(); } else next();
      };
      im.onerror = next;
      next();
    }

    function setTrend(t) {
      const next = (t === 'up' || t === 'down') ? t : '';
      if (next === trend) return;
      trend = next;
      // Quay đầu đàn mũi tên ngay. Con nào đang ở sát mép sai chiều thì thả lại
      // từ mép đối diện, không thì nó bay ra ngoài rồi kẹt luôn ở đó.
      for (const p of parts) {
        if (p.kind !== 'arrow') continue;
        p.dir = dirOf('arrow');
        if (p.dir > 0 ? p.y > H : p.y < 0) { p.y = p.dir > 0 ? -p.size : H + p.size; p.x = Math.random() * W; }
      }
      draw();
    }

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

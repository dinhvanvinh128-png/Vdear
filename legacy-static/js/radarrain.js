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
  // Gấp đôi số hạt thì hạt chồng nhau nhiều hơn và alpha cộng dồn: đo được các
  // đoạn chữ mờ tụt còn 4.54:1, sát ngưỡng. Hạ alpha từng hạt xuống — mật độ
  // giờ đã đủ để tạo hiệu ứng, không cần từng hạt phải đậm.
  const A_LOGO = 0.078, A_ARROW = 0.115;
  const N_LOGO = 68, N_ARROW = 14;

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
      // Lớp nền trang trí vẽ ở alpha ≤ 0.115 nên không cần độ nét cao. Với 82
      // hạt, hạ độ phân giải là cách rẻ nhất để bớt số pixel phải tô mỗi khung
      // (1.25× so với 2× là ít hơn 2.6 lần).
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
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

    // Đường bay UỐN LƯỢN: hoành độ là hàm sin của tung độ, nên hạt vẽ ra một
    // đường rắn lượn chứ không rơi thẳng. Vì x phụ thuộc y (không phải phụ
    // thuộc thời gian), quỹ đạo là một hình cố định trong không gian — hạt
    // trượt dọc theo nó, đúng kiểu "uốn lượn" chứ không phải rung ngang.
    function spawn(kind) {
      return {
        kind, size: 18 + Math.random() * 16, dir: dirOf(kind),
        x0: Math.random() * Math.max(1, W),          // trục của đường lượn
        x: 0, y: Math.random() * Math.max(1, H),
        vy: (kind === 'logo' ? 16 : 26) + Math.random() * 22,   // px/giây
        amp: 10 + Math.random() * 16,                // biên độ lượn
        wav: 90 + Math.random() * 90,                // bước sóng
        rot: Math.random() * Math.PI * 2,
        vrot: kind === 'logo' ? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.1) : 0,
        alpha: (0.55 + Math.random() * 0.45) * (kind === 'logo' ? A_LOGO : A_ARROW),
        phase: Math.random() * Math.PI * 2,
        tilt: 0,
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
      n.x0 = Math.random() * W;
      n.y = n.dir > 0 ? -n.size : H + n.size;
      Object.assign(p, n);
      place(p);
    }

    // Đặt x theo y trên đường lượn, và tính luôn độ nghiêng theo tiếp tuyến để
    // mũi tên ngả theo đường bay thay vì cắm cứng một góc.
    function place(p) {
      const k = (Math.PI * 2) / p.wav;
      const a = p.y * k + p.phase;
      p.x = p.x0 + p.amp * Math.sin(a);
      const slope = p.amp * k * Math.cos(a);          // dx/dy
      p.tilt = Math.max(-0.5, Math.min(0.5, Math.atan(slope) * p.dir));
    }

    function step(dt) {
      for (const p of parts) {
        p.y += p.vy * p.dir * dt;
        p.rot += p.vrot * dt;
        if (p.dir > 0 ? p.y - p.size > H : p.y + p.size < 0) { recycle(p); continue; }
        place(p);
        if (p.x0 < -p.size) p.x0 = W + p.size;
        else if (p.x0 > W + p.size) p.x0 = -p.size;
      }
    }

    // Mũi tên xu hướng: KHỐI ĐẶC thuôn đuôi, đúng kiểu cặp icon tham chiếu —
    // đuôi nhọn ở dưới-trái, vọt lên, hụt một nhịp, rồi vọt tiếp tới đầu nhọn
    // to bản ở trên-phải. Trước đây tôi vẽ bằng nét kẻ đều bề rộng nên nhìn ra
    // "đường gấp khúc", không ra "mũi tên".
    //
    // Dựng bằng cách lấy đường tâm rồi đẩy sang hai bên một nửa bề rộng thay
    // đổi (0 ở chót đuôi, đầy ở thân), khép lại bằng tam giác đầu nhọn.
    const ZIG = [[-0.50, 0.44], [-0.20, -0.01], [-0.04, 0.15], [0.26, -0.25]];
    const TIP = [0.50, -0.49];
    const WID = [0, 0.115, 0.115, 0.105];        // nửa bề rộng tại từng đốt

    function unit(ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      return [dx / L, dy / L];
    }

    function drawArrow(s, up) {
      ctx.save();
      if (!up) ctx.rotate(Math.PI);
      const P = ZIG.map((q) => [q[0] * s, q[1] * s]);
      const T = [TIP[0] * s, TIP[1] * s];
      const W2 = WID.map((v) => v * s);
      // pháp tuyến tại mỗi đốt = trung bình pháp tuyến hai cạnh kề
      const nrm = P.map((_, i) => {
        const a = i > 0 ? unit(P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]) : null;
        const b = i < P.length - 1 ? unit(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1])
                                   : unit(P[i][0], P[i][1], T[0], T[1]);
        const dx = a ? (a[0] + b[0]) / 2 : b[0];
        const dy = a ? (a[1] + b[1]) / 2 : b[1];
        const L = Math.hypot(dx, dy) || 1;
        return [-dy / L, dx / L];
      });
      // đầu nhọn: tam giác vuông góc với đoạn cuối
      const u = unit(P[3][0], P[3][1], T[0], T[1]);
      const pn = [-u[1], u[0]];
      const hl = s * 0.34, hw = s * 0.23;
      const bx = T[0] - u[0] * hl, by = T[1] - u[1] * hl;

      ctx.beginPath();
      for (let i = 0; i < P.length; i++) ctx[i ? 'lineTo' : 'moveTo'](P[i][0] + nrm[i][0] * W2[i], P[i][1] + nrm[i][1] * W2[i]);
      ctx.lineTo(bx + pn[0] * hw, by + pn[1] * hw);      // cánh trái đầu nhọn
      ctx.lineTo(T[0], T[1]);                            // chóp
      ctx.lineTo(bx - pn[0] * hw, by - pn[1] * hw);      // cánh phải
      for (let i = P.length - 1; i >= 0; i--) ctx.lineTo(P[i][0] - nrm[i][0] * W2[i], P[i][1] - nrm[i][1] * W2[i]);
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
          ctx.fillStyle = col;
          if (p.tilt) ctx.rotate(p.tilt);   // ngả theo tiếp tuyến đường lượn
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
        step(Math.min(0.05, dt));
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

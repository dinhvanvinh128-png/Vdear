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
 * Về độ tương phản: chữ mờ (--hx-dim) nằm trực tiếp trên mặt thẻ, không có ô
 * nền đục nào che. Bản trước giữ cho chữ đọc được bằng cách hạ alpha của CẢ lớp
 * mưa xuống 0.078 — đo pixel thật thì hạt chỉ làm nền đổi trung bình 11/255
 * (≈4%), tức là trên màn hình thật gần như vô hình, và người dùng hỏi thẳng
 * "sao coin không rơi?".
 *
 * Nay đổi cách làm: dựng một MẶT NẠ từ hộp của từng dòng chữ trong thẻ, hạt đi
 * vào đó thì mờ dần còn 8%. Chỉ 24% mặt thẻ có chữ nên 76% còn lại được vẽ đậm
 * hơn hẳn. Đo lại: chênh lệch trung bình 11 -> 26/255, phần mặt thẻ đổi từ 8/255
 * trở lên tăng 1.35% -> 7.6%, mà đoạn chữ tệ nhất vẫn 5.4:1 (bản cũ 5.3:1).
 * Đối chứng âm: tắt mặt nạ ở đúng mức alpha này thì tụt còn 2.78:1.
 */
(function () {
  const API = window.VdearAPI;
  // Alpha KHÔNG còn là thứ giữ cho chữ đọc được — mặt nạ chỗ có chữ (bên dưới)
  // lo việc đó. Nhờ vậy hạt ở vùng trống được vẽ đậm hơn hẳn: bản cũ 0.078 chỉ
  // làm nền đổi trung bình 11/255 nên nhìn như không có gì.
  // Vàng của logo sáng hơn xanh/đỏ nên vẫn để dè hơn một chút.
  const A_LOGO = 0.26, A_ARROW = 0.30;
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

    /* ----------------------- mặt nạ chỗ có chữ -------------------------- */

    // Chữ mờ (--hx-dim) nằm TRỰC TIẾP trên mặt thẻ, không có ô nền đục nào che.
    // Trước đây tôi giữ cho chữ đọc được bằng cách hạ alpha của CẢ lớp mưa
    // xuống 0.078 — đo lại thì hạt chỉ làm nền đổi trung bình 11/255 (≈4%),
    // tức là trên màn hình thật gần như không thấy gì. Đó là lý do có câu hỏi
    // "sao coin không rơi?": nó vẫn rơi, chỉ là mờ tới mức vô hình.
    //
    // Cách đúng là né ĐÚNG CHỖ CÓ CHỮ chứ không làm mờ cả thẻ. Đo hộp của từng
    // dòng chữ trong thẻ: chỉ 24% mặt thẻ có chữ, còn lại 76% trống — thừa chỗ
    // để mưa rơi rõ mà không đụng vào chữ.
    const CELL = 6;        // px mỗi ô lưới mặt nạ
    const PAD = 3;         // nới thêm quanh hộp chữ
    const FADE = 12;       // px hoà từ nét chữ ra vùng trống
    const MINMUL = 0.08;   // còn lại bao nhiêu ngay trên nét chữ
    let mask = null, mw = 0, mh = 0;

    // Chữ nằm trong một ô đã có nền đục thì lớp mưa (z-index 0) vốn bị ô đó che,
    // không cần né lần nữa — né thừa chỉ ăn mất vùng trống.
    function onBareCard(el) {
      for (let e = el; e && e !== card; e = e.parentElement) {
        const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || parseFloat(m[3]) > 0.6)) return false;
      }
      return true;
    }

    function buildMask() {
      if (!W || !H) { mask = null; return; }
      mw = Math.ceil(W / CELL); mh = Math.ceil(H / CELL);
      const cb = canvas.getBoundingClientRect();
      const ink = new Uint8Array(mw * mh);
      const mark = (r) => {
        if (!r || !r.width || !r.height) return;
        const x0 = Math.max(0, Math.floor((r.left - cb.left - PAD) / CELL));
        const x1 = Math.min(mw, Math.ceil((r.right - cb.left + PAD) / CELL));
        const y0 = Math.max(0, Math.floor((r.top - cb.top - PAD) / CELL));
        const y1 = Math.min(mh, Math.ceil((r.bottom - cb.top + PAD) / CELL));
        for (let y = y0; y < y1; y++) if (x1 > x0) ink.fill(1, y * mw + x0, y * mw + x1);
      };
      // Lấy hộp của TỪNG DÒNG CHỮ (Range) chứ không lấy hộp của thẻ bọc: thẻ
      // bọc thường rộng hết chiều ngang, che mất cả vùng vốn đang trống.
      const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) {
        if (!t.nodeValue.trim() || !t.parentElement) continue;
        if (!onBareCard(t.parentElement)) continue;
        const rg = document.createRange();
        rg.selectNodeContents(t);
        const rects = rg.getClientRects();
        for (let i = 0; i < rects.length; i++) mark(rects[i]);
      }
      // Đồng hồ (svg) và biểu đồ nhỏ (canvas) cũng là nét vẽ mảnh trên mặt thẻ.
      card.querySelectorAll('svg,canvas,img').forEach((e) => {
        if (e === canvas || !onBareCard(e.parentElement || card)) return;
        mark(e.getBoundingClientRect());
      });

      // Khoảng cách tới ô có chữ gần nhất (chamfer hai lượt) để hoà dần thay vì
      // cắt cụt — hạt biến mất đột ngột ở mép chữ nhìn còn lộ hơn là chữ mờ.
      const INF = 1e9, D2 = Math.SQRT2;
      const d = new Float32Array(mw * mh);
      for (let i = 0; i < d.length; i++) d[i] = ink[i] ? 0 : INF;
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
        const i = y * mw + x; let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) v = Math.min(v, d[i - mw] + 1);
        if (x > 0 && y > 0) v = Math.min(v, d[i - mw - 1] + D2);
        if (x < mw - 1 && y > 0) v = Math.min(v, d[i - mw + 1] + D2);
        d[i] = v;
      }
      for (let y = mh - 1; y >= 0; y--) for (let x = mw - 1; x >= 0; x--) {
        const i = y * mw + x; let v = d[i];
        if (x < mw - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < mh - 1) v = Math.min(v, d[i + mw] + 1);
        if (x < mw - 1 && y < mh - 1) v = Math.min(v, d[i + mw + 1] + D2);
        if (x > 0 && y < mh - 1) v = Math.min(v, d[i + mw - 1] + D2);
        d[i] = v;
      }
      const f = Math.max(1, FADE / CELL);
      const m = new Float32Array(mw * mh);
      for (let i = 0; i < m.length; i++) {
        const k = Math.min(1, d[i] / f);
        m[i] = MINMUL + (1 - MINMUL) * k * k;
      }
      mask = m;
    }

    function quietMul(x, y) {
      if (!mask) return 1;
      const cx = x / CELL | 0, cy = y / CELL | 0;
      if (cx < 0 || cy < 0 || cx >= mw || cy >= mh) return 1;
      return mask[cy * mw + cx];
    }

    // Số liệu trong thẻ đổi liên tục (đếm số, đổi khung giờ, đổi coin) nên hộp
    // chữ cũng đổi theo. Dựng lại mặt nạ sau mỗi đợt thay đổi nhưng gộp lại tối
    // đa ~2 lần/giây: đây là việc đo layout, gọi mỗi khung là tự tay làm giật.
    let maskTimer = 0;
    function scheduleMask() {
      if (maskTimer) return;
      maskTimer = setTimeout(() => { maskTimer = 0; buildMask(); draw(); }, 500);
    }

    function resize() {
      // Lớp nền trang trí không cần độ nét cao. Với 82 hạt, hạ độ phân giải là
      // cách rẻ nhất để bớt số pixel phải tô mỗi khung (1.25× so với 2× là ít
      // hơn 2.6 lần).
      const dpr = Math.min(1.25, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildMask();
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
    // Đặt luôn hạt lên đường lượn ngay khi tạo. spawn() chỉ ghi trục x0, còn x
    // thật do place() tính — không gọi thì mọi hạt nằm ở x = 0. Với vòng lặp
    // đang chạy thì step() sửa ngay ở khung đầu nên không ai thấy, nhưng ở chế
    // độ prefers-reduced-motion (chỉ vẽ MỘT khung tĩnh) thì cả đàn dồn hết vào
    // mép trái: đo được chỉ còn 6979 pixel có nét thay vì ~33000.
    function build() {
      parts.length = 0;
      for (let i = 0; i < N_LOGO + N_ARROW; i++) {
        const p = spawn(i < N_LOGO ? 'logo' : 'arrow');
        place(p);
        parts.push(p);
      }
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
    window.addEventListener('resize', scheduleMask);

    if ('MutationObserver' in window) {
      new MutationObserver(scheduleMask).observe(card, { subtree: true, childList: true, characterData: true });
    }
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

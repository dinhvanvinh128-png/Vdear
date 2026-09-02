/*
 * Vdear — mưa nền cho thẻ Signal Radar.
 *
 * Logo của ĐÚNG coin đang chọn trôi liên tục ở nền thẻ, và hướng trôi CHÍNH LÀ
 * nội dung của tín hiệu chứ không phải trang trí:
 *
 *   TĂNG        logo + mũi tên xanh BAY LÊN
 *   GIẢM        logo + mũi tên đỏ  RƠI XUỐNG
 *   TRUNG TÍNH  logo ĐI NGANG (trái -> phải), KHÔNG có mũi tên
 *
 * Đi ngang là cách thị trường tự gọi trạng thái chưa ngã ngũ, nên nó nói đúng
 * thứ đang có. Và không vẽ mũi tên khi chưa biết hướng: mũi tên là một phát
 * biểu về hướng thị trường, vẽ nó lúc này là bịa ra một tín hiệu không tồn tại.
 *
 * Về hiệu năng (trang này từng bị giật trên PC vì lớp nền động):
 *  - một canvas duy nhất, không filter/blur, không shadowBlur trên từng hạt;
 *  - dừng hẳn vòng lặp khi thẻ ra khỏi màn hình hoặc tab bị ẩn;
 *  - prefers-reduced-motion: trôi chậm còn 45%, không quay, ~15 hình/giây;
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
  // Số hạt tính theo DIỆN TÍCH thẻ, không gõ cứng: cùng một lớp mưa nhưng thẻ
  // Trading plan thấp hơn thẻ Signal Radar khoảng bốn lần, đổ đủ 68 logo vào đó
  // thì thành một đám đặc kín. Mật độ dưới đây chính là mật độ đang có ở thẻ
  // radar (68 logo trên 528×515), nên thẻ radar không đổi gì.
  const DENSITY = 68 / (528 * 515);
  const ARROW_RATIO = 14 / 68;

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

    // Hướng bay CHÍNH LÀ nội dung của tín hiệu:
    //   tăng   -> bay lên      giảm -> rơi xuống      trung tính -> đi ngang
    // Trước đây chỉ mũi tên quay đầu còn logo thì lúc nào cũng rơi xuống, nên
    // phần lớn thứ đang chuyển động nói ngược lại với tín hiệu đang hiện.
    //
    // Nên hạt không còn "trục x, trục y" mà có TRỤC BAY (along) và TRỤC LƯỢN
    // (across) vuông góc với nó; đổi tín hiệu chỉ là đổi xem trục nào ứng với
    // x, trục nào ứng với y. Nhờ vậy đường lượn, cách tái sinh và cách bọc mép
    // dùng chung một đoạn mã cho cả ba hướng.
    function horiz() { return trend === ''; }
    function dirOf() { return trend === 'up' ? -1 : 1; }   // đi ngang: trái -> phải

    // Đường bay UỐN LƯỢN: độ lệch khỏi trục lượn là hàm sin của quãng đã đi,
    // KHÔNG phải hàm của thời gian. Nhờ vậy quỹ đạo là một hình cố định trong
    // không gian và hạt trượt dọc theo nó — đúng kiểu "uốn lượn" chứ không phải
    // rung ngang tại chỗ.
    function spawn(kind) {
      const h = horiz();
      return {
        kind, size: 18 + Math.random() * 16, horiz: h, dir: dirOf(),
        along: Math.random() * Math.max(1, h ? W : H),   // toạ độ trên trục bay
        across: Math.random() * Math.max(1, h ? H : W),  // trục của đường lượn
        x: 0, y: 0,
        // Tốc độ cũ 16–38 px/giây: một hạt mất gần nửa phút mới đi hết chiều cao
        // thẻ, nhìn hai giây chỉ nhích khoảng 40px — nhìn ra là đứng chứ không
        // ra là bay. Đo thẳng bằng cách đọc ma trận biến đổi lúc vẽ từng hạt:
        // trung vị 20.5 px/giây. Nâng lên còn 49 px/giây, tức hạt đi hết chiều
        // cao thẻ trong khoảng 6–12 giây.
        vel: (kind === 'logo' ? 42 : 62) + Math.random() * (kind === 'logo' ? 46 : 58),
        amp: 10 + Math.random() * 16,                // biên độ lượn
        wav: 90 + Math.random() * 90,                // bước sóng
        rot: Math.random() * Math.PI * 2,
        vrot: kind === 'logo' ? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.1) : 0,
        alpha: (0.55 + Math.random() * 0.45) * (kind === 'logo' ? A_LOGO : A_ARROW),
        phase: Math.random() * Math.PI * 2,
        tilt: 0,
      };
    }
    function runway(p) { return p.horiz ? W : H; }   // chiều dài trục bay
    function sideway(p) { return p.horiz ? H : W; }  // chiều dài trục lượn

    // Đặt luôn hạt lên đường lượn ngay khi tạo. spawn() chỉ ghi along/across,
    // còn (x, y) thật do place() tính — không gọi thì mọi hạt nằm ở gốc. Vòng lặp
    // đang chạy thì step() sửa ngay ở khung đầu nên không ai thấy, nhưng ở chế
    // độ prefers-reduced-motion (chỉ vẽ MỘT khung tĩnh) thì cả đàn dồn hết vào
    // mép trái: đo được chỉ còn 6979 pixel có nét thay vì ~33000.
    function counts() {
      const logos = Math.max(6, Math.min(120, Math.round(W * H * DENSITY)));
      return { logos, arrows: Math.max(2, Math.round(logos * ARROW_RATIO)) };
    }
    let want = { logos: 0, arrows: 0 };
    function build() {
      parts.length = 0;
      want = counts();
      const total = want.logos + want.arrows;
      for (let i = 0; i < total; i++) {
        const p = spawn(i < want.logos ? 'logo' : 'arrow');
        place(p);
        parts.push(p);
      }
    }

    // Ra khỏi khung thì vào lại từ mép ĐỐI DIỆN với chiều đang đi.
    function recycle(p) {
      const n = spawn(p.kind);
      n.across = Math.random() * sideway(n);
      n.along = n.dir > 0 ? -n.size : runway(n) + n.size;
      Object.assign(p, n);
      place(p);
    }

    // Quy toạ độ trên đường lượn về (x, y) thật, và tính luôn độ nghiêng theo
    // tiếp tuyến để mũi tên ngả theo đường bay thay vì cắm cứng một góc.
    function place(p) {
      const k = (Math.PI * 2) / p.wav;
      const a = p.along * k + p.phase;
      const off = p.amp * Math.sin(a);
      if (p.horiz) { p.x = p.along; p.y = p.across + off; }
      else { p.x = p.across + off; p.y = p.along; }
      const slope = p.amp * k * Math.cos(a);          // độ lệch trên mỗi bước đi
      p.tilt = Math.max(-0.5, Math.min(0.5, Math.atan(slope) * p.dir));
    }

    // prefers-reduced-motion: CHẬM LẠI chứ không đứng im.
    // Bản trước dừng hẳn vòng lặp và chỉ vẽ MỘT khung tĩnh. Ai bật "giảm chuyển
    // động" — rất hay gặp trên máy yếu, mà trang này từng bị giật trên PC —
    // sẽ thấy một đống logo đứng chết ở nền và hỏi đúng câu "coin nó không rơi?".
    // Ý của prefers-reduced-motion là bớt chuyển động gây chóng mặt, không phải
    // cấm mọi thứ nhúc nhích: nên ở chế độ đó hạt trôi còn 45% tốc độ (đo được
    // 15.1 px/giây), không quay tròn, và chỉ vẽ ~16 hình/giây.
    const SLOW = 0.45;

    function step(dt) {
      const calm = reduce.matches;
      if (calm) dt *= SLOW;
      for (const p of parts) {
        p.along += p.vel * p.dir * dt;
        if (!calm) p.rot += p.vrot * dt;
        const L = runway(p);
        if (p.dir > 0 ? p.along - p.size > L : p.along + p.size < 0) { recycle(p); continue; }
        place(p);
        const S = sideway(p);
        if (p.across < -p.size) p.across = S + p.size;
        else if (p.across > S + p.size) p.across = -p.size;
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
    function minDt() { return reduce.matches ? 1 / 16 : 1 / 32; }
    function frame(t) {
      raf = 0;
      const dt = (t - last) / 1000;
      if (dt >= minDt()) {
        last = t;
        step(Math.min(0.05, dt));
        draw();
      }
      if (running()) raf = requestAnimationFrame(frame);
    }

    function running() { return visible && onScreen; }

    function kick() {
      if (!running()) { if (raf) { cancelAnimationFrame(raf); raf = 0; } draw(); return; }
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    /* --------------------------- vòng đời ------------------------------- */

    // Dựng lại đàn hạt là một cú nhảy nhìn thấy được (mọi hạt về chỗ mới), nên
    // chỉ làm khi số hạt cần có lệch quá 25% — xoay ngang màn hình thì đáng,
    // còn thanh địa chỉ trên mobile trượt lên xuống vài chục pixel thì không.
    function onResize() {
      resize();
      const n = counts();
      if (!parts.length || Math.abs(n.logos - want.logos) > want.logos * 0.25) build();
      draw();
    }
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

    // Chốt chặn: nếu đáng lẽ phải chạy mà vòng lặp không còn khung nào đang hẹn
    // (rAF bị nuốt, IntersectionObserver báo hụt sau khi thẻ đổi bố cục) thì bật
    // lại. Hai giây một lần, chỉ khi tab đang mở — một getBoundingClientRect,
    // rẻ hơn nhiều so với việc để cả lớp nền đứng im mà không ai biết vì sao.
    setInterval(() => {
      if (document.hidden) return;
      const r = card.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      onScreen = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      if (running() && !raf) kick();
    }, 2000);
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
      // Quay đầu cả đàn ngay, không đợi hạt đi hết vòng.
      const h = horiz(), d = dirOf();
      for (const p of parts) {
        if (p.horiz !== h) {
          // Đổi trục bay mà giữ NGUYÊN chỗ hạt đang đứng: trừ sẵn độ lệch của
          // đường lượn ra khỏi trục lượn mới, để place() dựng lại đúng (x, y)
          // cũ. Không trừ thì cả đàn giật ngang một cái tới ±26px ngay lúc tín
          // hiệu đổi — mắt bắt được ngay vì 82 hạt cùng giật một lượt.
          const x = p.x, y = p.y;
          const off = p.amp * Math.sin((h ? x : y) * ((Math.PI * 2) / p.wav) + p.phase);
          p.horiz = h;
          p.along = h ? x : y;
          p.across = (h ? y : x) - off;
        }
        p.dir = d;
        // Con nào đang ở sát mép sai chiều thì thả lại từ mép đối diện, không
        // thì nó bay ra ngoài rồi kẹt luôn ở đó — với 82 hạt thì chỗ kẹt đó
        // thấy rõ là một mảng trống.
        const L = runway(p);
        if (p.dir > 0 ? p.along > L : p.along < 0) {
          p.along = p.dir > 0 ? -p.size : L + p.size;
          p.across = Math.random() * sideway(p);
        }
        place(p);
      }
      draw();
    }

    return { setCoin, setTrend };
  }

  // Các thẻ cùng nhận một lớp mưa. Thẻ nào cũng nói về CÙNG một coin và CÙNG
  // một tín hiệu, nên chúng phải chuyển động cùng hướng — hai thẻ cạnh nhau mà
  // một cái rơi xuống, một cái bay lên thì tự mâu thuẫn.
  const CARDS = ['hxRadar', 'hxPlan'];

  let insts = null;
  function init() {
    if (insts) return;
    insts = CARDS.map((id) => document.getElementById(id)).filter(Boolean).map(make);
    if (!insts.length) { insts = null; return; }
    // Giữ nguyên giao diện cũ: hero.js gọi setCoin/setTrend một lần, ở đây toả
    // ra hết các thẻ. Thẻ nào lỗi thì không được kéo theo các thẻ còn lại.
    const fan = (fn) => (arg) => {
      for (const it of insts) { try { it[fn](arg); } catch (e) { /* bỏ qua */ } }
    };
    window.VdearRadarRain = { setCoin: fan('setCoin'), setTrend: fan('setTrend') };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

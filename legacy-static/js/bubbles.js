/*
 * Vdear — Bong bóng thị trường (market bubbles)
 *
 * Mỗi coin là một bong bóng: MÀU = chiều biến động 24h (xanh tăng / đỏ giảm),
 * CỠ = biên độ biến động (hoặc khối lượng, tuỳ chế độ). Dữ liệu lấy từ chính
 * `VdearAPI.getMarket()` mà bảng biến động đang dùng — không có số liệu riêng,
 * không có số liệu bịa; coin nào sàn không trả về thì không có bong bóng.
 *
 * Engine vật lý 2D tự viết (không thư viện ngoài): va chạm đàn hồi + trôi nhẹ,
 * kéo chuột để hất bong bóng, bấm để mở trang phân tích coin.
 */
(function () {
  const CFG = window.VDEAR_CONFIG;
  const API = window.VdearAPI;

  const FILL = 0.50;        // tổng diện tích bong bóng / diện tích khung
  const MAXFILL = 0.72;     // trần an toàn sau khi kẹp bán kính
  const PAGE_SIZE = 100;    // mỗi trang 100 coin, giống cryptobubbles
  const DAMP = 0.982;       // ma sát mỗi frame (tính theo 60fps)
  const E = 0.55;           // độ nảy khi va chạm
  const WALL = 0.72;        // độ nảy khi chạm biên
  const DRIFT = 26;         // lực trôi ngẫu nhiên (px/s²)

  function hex(v, fallback) {
    v = (v || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
  }
  function rgba(h, a) {
    let s = h.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // Trộn màu về trắng (nền tối) hoặc đen (nền sáng). Dùng để lấy biến thể chữ
  // của --up/--down thay vì viết hex mới: bảng màu đổi thì nhãn đổi theo.
  function mix(h, toward, f) {
    let s = h.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s.slice(0, 6), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return '#' + c.map((v) => Math.round(v + (toward - v) * f).toString(16).padStart(2, '0')).join('');
  }
  function shortNum(n) {
    if (!(n > 0)) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(0);
  }
  function fmtPrice(p) {
    if (!(p > 0)) return '—';
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(5);
    return p.toPrecision(4);
  }

  function init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !API) return;
    const ctx = canvas.getContext('2d');
    const tip = document.getElementById('bubTip');
    const empty = document.getElementById('bubEmpty');
    const stat = document.getElementById('bubStat');

    let W = 0, H = 0;
    let market = [];
    let bubbles = [];
    let byBase = {};
    let opts = { filter: 'all', size: 'change', page: 0, per: PAGE_SIZE, sector: 'all' };
    let theme = readTheme();
    let running = false, visible = false, rafId = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function readTheme() {
      const cs = getComputedStyle(document.documentElement);
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      return {
        up: hex(cs.getPropertyValue('--up'), '#4FB477'),
        down: hex(cs.getPropertyValue('--down'), '#E0574F'),
        text: hex(cs.getPropertyValue('--text'), '#EDE7D6'),
        // Cùng một alpha cho hai nền sẽ hỏng: trên nền tối màu pha loãng vẫn
        // sáng lên, trên nền giấy nó nhạt thành gần trắng. Nền sáng cần ruột
        // đặc hơn và viền đậm hơn để bong bóng còn ra hình.
        fill: light ? [0.30, 0.20, 0.13] : [0.46, 0.16, 0.07],
        ring: light ? [0.55, 0.90] : [0.62, 0.95],
        // % vẽ NGAY TRÊN ruột bong bóng cùng màu -> chữ --down nguyên bản chỉ
        // đạt 2.6:1 ở chỗ đậm nhất. Sáng/tối thêm 45% đưa mọi vị trí lên >=4.8:1
        // mà vẫn giữ được sắc xanh/đỏ.
        pctUp: mix(hex(cs.getPropertyValue('--up'), '#4FB477'), light ? 0 : 255, 0.45),
        pctDown: mix(hex(cs.getPropertyValue('--down'), '#E0574F'), light ? 0 : 255, 0.45),
      };
    }

    /* ------------------------------ layout ------------------------------ */
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeBubbles();
    }

    // Cỡ bong bóng: r ~ căn bậc hai của trọng số, rồi chuẩn hoá để TỔNG DIỆN
    // TÍCH bằng một tỉ lệ cố định của khung. Nhờ vậy 50 hay 200 coin đều lấp
    // vừa khung, không bị tràn ra ngoài hay lọt thỏm ở giữa.
    // Trọng số quyết định DIỆN TÍCH bong bóng.
    //  · Theo %: diện tích tỉ lệ thẳng với biên độ — mắt so diện tích, nên đó
    //    là cách đọc trực tiếp nhất.
    //  · Theo KLGD: khối lượng trải sáu bậc mười (chục nghìn → chục tỉ USD).
    //    Cho diện tích tỉ lệ thẳng thì BTC chiếm trọn khung còn lại là một đám
    //    hạt bằng nhau, không đọc được gì. Nên BÁN KÍNH đi theo log khối lượng,
    //    chuẩn hoá trong tập đang hiện: chênh lệch bán kính tối đa 10 lần.
    function weights() {
      if (opts.size !== 'vol') {
        return bubbles.map((b) => Math.max(0.12, Math.abs(b.coin.change || 0)));
      }
      const ls = bubbles.map((b) => Math.log10(Math.max(1, b.coin.quoteVolume || 0)));
      let lo = Infinity, hi = -Infinity;
      for (const l of ls) { if (l < lo) lo = l; if (l > hi) hi = l; }
      const span = hi - lo || 1;
      return ls.map((l) => Math.pow(0.10 + 0.90 * ((l - lo) / span), 2));
    }
    function sizeBubbles() {
      if (!bubbles.length || !W || !H) return;
      const w = weights();
      const sum = w.reduce((a, b) => a + b, 0) || 1;
      const k = Math.sqrt((FILL * W * H) / (Math.PI * sum));
      // Trần bán kính 12% cạnh ngắn. Để rộng hơn thì một coin bơm 170% trong
      // ngày sẽ chiếm gần một phần tư khung và bóp mọi coin còn lại thành hạt
      // đậu; kẹp lại cho cỡ bóng đều tay, con số thật vẫn nằm trên nhãn.
      const rMin = 12, rMax = Math.max(rMin + 4, Math.min(W, H) * 0.12);
      let area = 0;
      bubbles.forEach((b, i) => {
        b.tr = Math.max(rMin, Math.min(rMax, k * Math.sqrt(w[i])));
        area += Math.PI * b.tr * b.tr;
      });
      // Sau khi kẹp min/max tổng diện tích có thể vượt trần -> thu nhỏ đều.
      const cap = MAXFILL * W * H;
      if (area > cap) {
        const s = Math.sqrt(cap / area);
        for (const b of bubbles) b.tr = Math.max(6, b.tr * s);
      }
      for (const b of bubbles) if (!b.r) b.r = b.tr;
    }

    /* ------------------------------- data ------------------------------- */
    // Toàn bộ coin của danh mục đang chọn, đã bỏ stablecoin, xếp theo KLGD.
    // Đây là "vũ trụ" dùng để chia trang.
    function pool() {
      const sec = CFG.sectors.find((s) => s.id === opts.sector);
      let list = market;
      if (sec && sec.coins) list = list.filter((c) => sec.coins.includes(c.base));
      return list.filter((c) => !CFG.stableCoins.includes(c.base));
    }
    // opts.per = 0 nghĩa là "tất cả trong một nhóm".
    function perPage(total) { return opts.per > 0 ? opts.per : Math.max(1, total); }
    function pageCount(total) { return Math.max(1, Math.ceil(total / perPage(total))); }

    // Cắt nhóm TRƯỚC rồi mới lọc tăng/giảm. Làm ngược lại thì số thứ tự nhóm
    // sẽ nhảy mỗi lần thị trường đảo chiều — nhóm "101-200" hôm nay là những
    // coin khác hẳn hôm qua, không còn là một mốc để quay lại.
    function selection() {
      const all = pool();
      const per = perPage(all.length);
      const pages = pageCount(all.length);
      if (opts.page >= pages) opts.page = pages - 1;
      const block = all.slice(opts.page * per, (opts.page + 1) * per);
      let list = block;
      if (opts.filter === 'up') list = block.filter((c) => c.change > 0);
      if (opts.filter === 'down') list = block.filter((c) => c.change < 0);
      return { list, block, total: all.length, from: opts.page * per + 1, to: opts.page * per + block.length };
    }

    // Dropdown trang: mỗi mục là một khối 100 coin kèm mức biến động trung bình
    // của chính khối đó, để thấy ngay vùng nào của thị trường đang xanh.
    const pageSel = document.getElementById('bubPage');
    function renderPages() {
      if (!pageSel) return;
      const all = pool();
      const per = perPage(all.length);
      const n = pageCount(all.length);
      const labels = [];
      for (let i = 0; i < n; i++) {
        const block = all.slice(i * per, (i + 1) * per);
        const avg = block.length ? block.reduce((a, c) => a + (c.change || 0), 0) / block.length : 0;
        const span = n === 1 ? `Tất cả ${block.length} coin` : `${i * per + 1}–${i * per + block.length}`;
        labels.push(`${span} · ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%`);
      }
      // Dựng lại cả danh sách sẽ đóng dropdown người dùng đang mở, mà nhãn thì
      // đổi sau mỗi lần làm mới 30s. Chỉ thay chữ khi số trang không đổi.
      if (pageSel.options.length === n) {
        for (let i = 0; i < n; i++) pageSel.options[i].textContent = labels[i];
      } else {
        pageSel.innerHTML = labels.map((l, i) => `<option value="${i}">${l}</option>`).join('');
      }
      pageSel.value = String(opts.page);
    }

    function rebuild() {
      const { list, block, total, from, to } = selection();
      const next = [];
      const seen = {};
      for (const c of list) {
        seen[c.base] = 1;
        let b = byBase[c.base];
        if (!b) {
          b = byBase[c.base] = {
            base: c.base, coin: c, r: 0, tr: 0,
            x: Math.random() * (W || 800), y: Math.random() * (H || 500),
            vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
            img: null,
          };
          loadLogo(b);
        } else b.coin = c;
        next.push(b);
      }
      for (const k in byBase) if (!seen[k]) delete byBase[k];
      // Bong bóng lớn vẽ trước, nhỏ vẽ sau -> nhãn coin nhỏ không bị che.
      bubbles = next;
      sizeBubbles();
      bubbles.sort((a, b) => b.tr - a.tr);
      renderPages();
      if (empty) empty.hidden = bubbles.length > 0;
      if (stat) {
        // Nói rõ ĐANG XEM ĐOẠN NÀO. Ghi mỗi "100 coin" thì chọn nhóm 301–400
        // xong lại tưởng máy chỉ tải được 100 coin đầu.
        const up = block.filter((c) => c.change > 0).length;
        const span = `Coin ${from}–${to} / ${total}`;
        stat.textContent = !block.length ? 'Không có coin nào'
          : opts.filter === 'up' ? `${span} · hiện ${list.length} coin tăng`
          : opts.filter === 'down' ? `${span} · hiện ${list.length} coin giảm`
          : `${span} · ${up} tăng · ${block.length - up} giảm`;
      }
      if (reduced) settleStatic();
    }

    function loadLogo(b) {
      const srcs = (API.logoSources ? API.logoSources(b.base) : []).slice();
      srcs.push(API.letterAvatar(b.base)); // data-URI, luôn tải được
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let i = 0;
      const tryNext = () => { if (i >= srcs.length) return; img.src = srcs[i++]; };
      img.onload = () => { if (img.naturalWidth > 1) b.img = img; else tryNext(); };
      img.onerror = tryNext;
      tryNext();
    }

    /* ----------------------------- physics ------------------------------ */
    let dragging = null, dragMoved = 0, mx = 0, my = 0, pmx = 0, pmy = 0, mt = 0, hover = null;

    function step(dt) {
      const damp = Math.pow(DAMP, dt * 60);
      for (const b of bubbles) {
        b.r += (b.tr - b.r) * Math.min(1, dt * 6); // đổi cỡ mượt khi giá cập nhật
        if (b === dragging) continue;
        b.vx += (Math.random() - 0.5) * DRIFT * dt * 60 * 0.5;
        b.vy += (Math.random() - 0.5) * DRIFT * dt * 60 * 0.5;
        b.vx *= damp; b.vy *= damp;
        const max = 900;
        b.vx = Math.max(-max, Math.min(max, b.vx));
        b.vy = Math.max(-max, Math.min(max, b.vy));
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * WALL; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * WALL; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * WALL; }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * WALL; }
      }
      for (let it = 0; it < 2; it++) resolveAll();
    }

    // Va chạm qua lưới ô vuông thay vì so từng cặp. So từng cặp là O(n²): 100
    // bong bóng tốn ~1.3ms/frame còn 900 tốn ~42ms — quá ngân sách 16.7ms, và
    // điện thoại còn chậm hơn vài lần. Cạnh ô bằng đường kính lớn nhất nên hai
    // bong bóng chạm nhau chắc chắn nằm cùng ô hoặc ô kề; mỗi ô chỉ xét ô phải
    // và ba ô dưới để không lặp cặp.
    const grid = new Map();
    function resolveAll() {
      const n = bubbles.length;
      if (n < 2) return;
      let rmax = 0;
      for (const b of bubbles) if (b.r > rmax) rmax = b.r;
      const cell = Math.max(8, rmax * 2);
      grid.clear();
      for (let i = 0; i < n; i++) {
        const b = bubbles[i];
        const key = (Math.floor(b.x / cell) << 16) ^ (Math.floor(b.y / cell) & 0xffff);
        let bucket = grid.get(key);
        if (!bucket) grid.set(key, (bucket = []));
        bucket.push(b);
      }
      const NEIGH = [[0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
      for (const [key, bucket] of grid) {
        const cx = key >> 16, cy = (key << 16) >> 16;
        for (const [dx, dy] of NEIGH) {
          const other = dx === 0 && dy === 0
            ? bucket
            : grid.get(((cx + dx) << 16) ^ ((cy + dy) & 0xffff));
          if (!other) continue;
          if (other === bucket) {
            for (let i = 0; i < bucket.length; i++)
              for (let j = i + 1; j < bucket.length; j++) collide(bucket[i], bucket[j]);
          } else {
            for (const a of bucket) for (const b of other) collide(a, b);
          }
        }
      }
    }

    function collide(a, b) {
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = a.r + b.r;
      if (d >= min) return;
      if (d === 0) { d = 0.01; dx = 0.01; dy = 0; }
      const nx = dx / d, ny = dy / d, over = min - d;
      const ia = a === dragging ? 0 : 1, ib = b === dragging ? 0 : 1;
      const den = ia + ib; if (!den) return;
      a.x -= nx * over * (ia / den); a.y -= ny * over * (ia / den);
      b.x += nx * over * (ib / den); b.y += ny * over * (ib / den);
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn > 0) return;
      const jimp = -(1 + E) * vn / den;
      a.vx -= jimp * nx * ia; a.vy -= jimp * ny * ia;
      b.vx += jimp * nx * ib; b.vy += jimp * ny * ib;
    }

    /* ------------------------------- draw ------------------------------- */
    const SANS = "'Chakra Petch',Inter,sans-serif";
    const MONO = "'JetBrains Mono',monospace";
    // Ticker dài (1000BONK, FARTCOIN…) tràn ra ngoài bong bóng và chồng lên coin
    // bên cạnh. Thu cỡ chữ cho tới khi nằm gọn trong ~86% đường kính.
    function label(text, x, y, size, cap, r, color, family) {
      let px = Math.min(size, cap);
      const maxW = r * 1.72;
      ctx.font = `700 ${px.toFixed(1)}px ${family}`;
      while (px > 6 && ctx.measureText(text).width > maxW) {
        px -= 0.5;
        ctx.font = `700 ${px.toFixed(1)}px ${family}`;
      }
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const b of bubbles) {
        const c = b.coin, r = b.r;
        if (r < 3) continue;
        const upward = (c.change || 0) >= 0;
        const col = upward ? theme.up : theme.down;
        const pctCol = upward ? theme.pctUp : theme.pctDown;
        const g = ctx.createRadialGradient(b.x - r * 0.34, b.y - r * 0.38, r * 0.12, b.x, b.y, r);
        g.addColorStop(0, rgba(col, theme.fill[0]));
        g.addColorStop(0.72, rgba(col, theme.fill[1]));
        g.addColorStop(1, rgba(col, theme.fill[2]));
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.2832);
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = b === hover ? 2.2 : 1.4;
        ctx.strokeStyle = rgba(col, theme.ring[b === hover ? 1 : 0]);
        ctx.stroke();

        const pct = (c.change >= 0 ? '+' : '') + (c.change || 0).toFixed(2) + '%';
        if (r >= 26 && b.img) {
          const s = r * 0.5;
          ctx.save();
          ctx.beginPath(); ctx.arc(b.x, b.y - r * 0.38, s / 2, 0, 6.2832); ctx.clip();
          ctx.drawImage(b.img, b.x - s / 2, b.y - r * 0.38 - s / 2, s, s);
          ctx.restore();
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (r >= 26) {
          label(c.base, b.x, b.y + r * 0.16, r * 0.32, 16, r, theme.text, SANS);
          label(pct, b.x, b.y + r * 0.53, r * 0.29, 14, r, pctCol, MONO);
        } else if (r >= 17) {
          label(c.base, b.x, b.y - r * 0.16, r * 0.42, 13, r, theme.text, SANS);
          label(pct, b.x, b.y + r * 0.36, r * 0.36, 11, r, pctCol, MONO);
        } else if (r >= 11) {
          label(c.base, b.x, b.y, r * 0.52, 11, r, theme.text, SANS);
        }
      }
    }

    /* ------------------------------- loop ------------------------------- */
    let last = 0;
    function frame(now) {
      if (!running) return;
      let dt = (now - last) / 1000; last = now;
      if (!(dt > 0) || dt > 0.05) dt = 0.016;
      step(dt); draw();
      rafId = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduced || !visible) return;
      running = true; last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

    // Chế độ giảm chuyển động: chạy mô phỏng trong bộ nhớ cho tới khi xếp xong
    // rồi vẽ MỘT lần — vẫn thấy đủ dữ liệu, không có gì nhấp nháy trên màn hình.
    function settleStatic() {
      // Vòng lặp này chạy đồng bộ, khoá giao diện cho tới khi xong. 260 bước ở
      // 619 bong bóng là ~0.6 giây đứng hình, nên số bước giảm dần theo số
      // lượng: đông thì xếp nhanh hơn (chật nên chạm nhau sớm) và cũng phải
      // dừng sớm hơn. Trần chi phí khoảng 0.2 giây.
      const steps = Math.max(90, Math.min(260, Math.round(26000 / bubbles.length)));
      for (let i = 0; i < steps; i++) step(0.016);
      draw();
    }

    /* ---------------------------- tương tác ----------------------------- */
    function pos(e) {
      const rc = canvas.getBoundingClientRect();
      const t = (e.touches && e.touches[0]) || e;
      return { x: t.clientX - rc.left, y: t.clientY - rc.top };
    }
    function pick(p) {
      // Duyệt ngược: bong bóng vẽ sau (nhỏ, nằm trên) được ưu tiên chọn.
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r) return b;
      }
      return null;
    }
    function showTip(b, p) {
      if (!tip) return;
      const c = b.coin;
      const up = (c.change || 0) >= 0;
      tip.innerHTML = `<b>${c.base}<small>USDT</small></b>
        <span>Giá <i>$${fmtPrice(c.price)}</i></span>
        <span>24h <i class="${up ? 'up' : 'down'}">${up ? '+' : ''}${(c.change || 0).toFixed(2)}%</i></span>
        <span>KLGD <i>$${shortNum(c.quoteVolume)}</i></span>
        <em>Bấm để mở phân tích ${c.base}</em>`;
      tip.hidden = false;
      const tw = tip.offsetWidth || 170, th = tip.offsetHeight || 90;
      tip.style.left = Math.max(4, Math.min(W - tw - 4, p.x + 14)) + 'px';
      tip.style.top = Math.max(4, Math.min(H - th - 4, p.y + 14)) + 'px';
    }
    function hideTip() { if (tip) tip.hidden = true; }

    function down(e) {
      const p = pos(e); const b = pick(p);
      if (!b) return;
      dragging = b; dragMoved = 0;
      b.vx = b.vy = 0;
      mx = pmx = p.x; my = pmy = p.y; mt = performance.now();
      if (e.cancelable) e.preventDefault();
    }
    function move(e) {
      const p = pos(e);
      if (!dragging) {
        const b = pick(p);
        hover = b;
        canvas.style.cursor = b ? 'pointer' : 'default';
        if (b) showTip(b, p); else hideTip();
        return;
      }
      pmx = mx; pmy = my; mx = p.x; my = p.y;
      dragMoved += Math.hypot(mx - pmx, my - pmy);
      const now = performance.now(), dt = Math.max(0.004, (now - mt) / 1000); mt = now;
      dragging.x = Math.max(dragging.r, Math.min(W - dragging.r, mx));
      dragging.y = Math.max(dragging.r, Math.min(H - dragging.r, my));
      dragging.vx = (mx - pmx) / dt; dragging.vy = (my - pmy) / dt;
      canvas.style.cursor = 'grabbing';
      hideTip();
    }
    function up() {
      // Kéo rồi thả = hất bong bóng; bấm tại chỗ (<6px) = mở trang coin.
      if (dragging && dragMoved < 6) {
        const base = dragging.base;
        dragging = null;
        window.location.href = 'coin.html?c=' + encodeURIComponent(base);
        return;
      }
      dragging = null;
      canvas.style.cursor = 'default';
    }

    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseleave', () => { hover = null; hideTip(); });
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', (e) => { move(e); if (e.cancelable) e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', up);

    /* ------------------------------ controls ---------------------------- */
    function seg(id, key, cast) {
      const box = document.getElementById(id);
      if (!box) return;
      box.addEventListener('click', (e) => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        box.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        opts[key] = cast(b.dataset.v);
        rebuild();
      });
    }
    seg('bubFilter', 'filter', String);
    seg('bubSize', 'size', String);

    const secSel = document.getElementById('bubSector');
    if (secSel) {
      secSel.innerHTML = CFG.sectors.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
      // Đổi danh mục thì số coin đổi hẳn -> quay về trang đầu.
      secSel.addEventListener('change', () => { opts.sector = secSel.value; opts.page = 0; rebuild(); });
    }
    if (pageSel) pageSel.addEventListener('change', () => { opts.page = +pageSel.value || 0; rebuild(); });

    // Đổi cỡ nhóm thì ranh giới nhóm đổi hẳn -> quay về nhóm đầu.
    const perSel = document.getElementById('bubPer');
    if (perSel) perSel.addEventListener('change', () => { opts.per = +perSel.value || 0; opts.page = 0; rebuild(); });

    // Bảng màu đổi khi bật/tắt nền sáng -> đọc lại token và vẽ lại ngay.
    new MutationObserver(() => { theme = readTheme(); if (reduced) draw(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    window.addEventListener('resize', () => { resize(); if (reduced) settleStatic(); });

    // Chỉ chạy vòng lặp khi khung nằm trong màn hình -> không đốt CPU khi cuộn xa.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => {
        visible = es.some((x) => x.isIntersecting);
        if (visible) start(); else stop();
      }, { threshold: 0.05 }).observe(canvas);
    } else { visible = true; start(); }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    /* ------------------------------- boot ------------------------------- */
    async function load(force) {
      try {
        market = await API.getMarket(force);
        rebuild();
        start();
      } catch (e) {
        if (empty) { empty.hidden = false; empty.textContent = 'Không tải được dữ liệu thị trường. Kiểm tra kết nối mạng.'; }
      }
    }
    resize();
    load(false);
    // Không dùng force: bảng biến động đã làm mới mỗi 30s, gọi không-force sẽ
    // dùng chung lượt tải đó thay vì bắn thêm một lượt tới cả 4 sàn.
    setInterval(() => load(false), 30000);

    return { reload: () => load(true) };
  }

  window.VdearBubbles = { init };
  const boot = () => init('bubbleCanvas');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

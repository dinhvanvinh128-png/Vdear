/*
 * Vdear — ETF giao ngay BTC/ETH
 *
 *   DÒNG TIỀN  (net creations/redemptions) là tiền thực chảy vào/ra quỹ. Nó
 *              tính từ số chứng chỉ quỹ phát hành thêm hoặc mua lại trong ngày,
 *              KHÔNG suy ra được từ giá hay khối lượng khớp lệnh. Không nguồn
 *              miễn phí nào công bố; cần SoSoValue có API key, mà key
 *              phải nằm ở server. Bản tĩnh không có server, nên phần dòng tiền
 *              hiển thị "chưa cấu hình nguồn" thay vì một con số ước lượng.
 *
 * Nguồn hỏng hoặc bị CORS chặn -> báo không lấy được. Không có đường nào trong
 * file này sinh ra số liệu thị trường.
 */
(function () {
  const CFG = window.VDEAR_CONFIG;

  /*
   * n phải là số dương đã lấy trị tuyệt đối. SỐ 0 LÀ MỘT GIÁ TRỊ THẬT — ngày
   * không có quỹ nào tạo/huỷ chứng chỉ thì dòng tiền đúng bằng 0. Trả '—' cho
   * số 0 (lỗi cũ) là nói dối: người xem đọc thành "không có dữ liệu".
   */
  function fmtUsd(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (n === 0) return '$0';
    return '$' + n.toFixed(2);
  }

  /*
   * Dòng tiền ròng đi qua hàm server /api/etf-flow, nơi API key được giữ lại.
   * Trình duyệt không bao giờ thấy key. Hàm chưa được triển khai (404) hoặc
   * chưa cấu hình key -> trả null, cột dòng tiền để trống.
   */
  async function fetchFlow() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch('/api/etf-flow', { signal: ctrl.signal });
      if (!res.ok) return null;
      const j = await res.json();
      // Trả nguyên payload khi ĐÃ cấu hình, kể cả lúc available:false — mảng
      // errors là thứ duy nhất giải thích được vì sao trống, nuốt nó đi thì
      // người xem không biết là chưa có key hay là nguồn đang hỏng.
      return j && j.configured ? j : null;
    } catch (e) { return null; }
    finally { clearTimeout(t); }
  }

  async function load() {
    return { flow: await fetchFlow() };
  }

  function fmtFlow(v) {
    if (v == null || !Number.isFinite(v)) return '—';   // thiếu dữ liệu
    if (v === 0) return '$0';                           // có dữ liệu, và bằng 0
    return (v > 0 ? '+' : '−') + fmtUsd(Math.abs(v));
  }

  /*
   * BIỂU ĐỒ KHỐI 3D (isometric) — dòng tiền từng quỹ.
   *
   * Phép chiếu thật, không dùng CSS 3D transform: transform vỡ khi phóng to,
   * và không kiểm soát được thứ tự che khuất giữa các khối.
   *
   *   sx = (x - y) * CX          +x đi phải-xuống, +y đi trái-xuống
   *   sy = (x + y) * CY - z      z đi THẲNG LÊN, nên cạnh đứng luôn thẳng đứng
   *
   * (x + y) lớn hơn = gần người xem hơn, nên mặt thấy được là mặt ở x lớn nhất
   * (phải) và y lớn nhất (trái), cộng mặt trên.
   *
   * Xếp một hàng duy nhất: khoảng cách giữa hai khối đúng bằng bề rộng chiếu
   * của một khối, nên KHÔNG khối nào che khối nào — hai hàng thì khối trước
   * che khối sau và không đọc được nữa.
   */
  const ISO = { CX: 32, CY: 18, BW: 1, STEP: 2, MAXH: 172, MINH: 7 };

  function isoChart(asset, d) {
    const funds = d.funds || [];
    if (!funds.length) return '';
    const { CX, CY, BW, STEP, MAXH, MINH } = ISO;
    const P = (x, y, z) => [(x - y) * CX, (x + y) * CY - z];
    const pts = (a) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const max = funds.reduce((m, f) => Math.max(m, Math.abs(f.flow)), 0);

    /*
     * XẾP THÀNH CỤM trên lưới isometric, như ảnh mẫu — không phải một hàng.
     *
     * Hàng 0 ở SAU, hàng cuối ở TRƯỚC. funds đã sắp giảm dần nên khối CAO nằm
     * hàng sau, khối thấp nằm hàng trước: khối trước chỉ che phần chân của
     * khối sau, còn đỉnh — chỗ mang thông tin — vẫn nhìn thấy hết.
     *
     * Trong cùng một hàng, khoảng cách đúng bằng bề rộng chiếu của một khối
     * (2·BW·CX = STEP·CX) nên không khối nào chồng khối nào theo chiều ngang.
     */
    const n = funds.length;
    const rows = n <= 4 ? 1 : n <= 8 ? 2 : 3;
    const cols = Math.ceil(n / rows);
    const cell = (i) => ({ c: i % cols, r: Math.floor(i / cols) });

    // Bệ: hình chữ nhật thẳng trục trong không gian, nên chiếu ra đúng hình
    // thoi như tấm nền trong ảnh.
    const m = 0.55, slab = 15;
    const px0 = -m, px1 = (cols - 1) * STEP + BW + m;
    const py0 = -m, py1 = (rows - 1) * STEP + BW + m;
    const bTop = [P(px0, py0, 0), P(px1, py0, 0), P(px1, py1, 0), P(px0, py1, 0)];
    const bRight = [P(px1, py0, 0), P(px1, py1, 0), P(px1, py1, -slab), P(px1, py0, -slab)];
    const bLeft = [P(px0, py1, 0), P(px1, py1, 0), P(px1, py1, -slab), P(px0, py1, -slab)];

    const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const note = (p) => {
      bounds.x0 = Math.min(bounds.x0, p[0]); bounds.x1 = Math.max(bounds.x1, p[0]);
      bounds.y0 = Math.min(bounds.y0, p[1]); bounds.y1 = Math.max(bounds.y1, p[1]);
    };
    [bTop, bRight, bLeft].forEach((f) => f.forEach(note));

    /*
     * Vẽ từ SAU ra TRƯỚC (thuật toán hoạ sĩ). (x + y) lớn hơn = gần người xem
     * hơn, nên phải vẽ sau để nằm đè lên.
     */
    const order = funds.map((f, i) => i).sort((a, b) => {
      const A = cell(a), B = cell(b);
      return (A.c + A.r) - (B.c + B.r);
    });

    let bars = '';
    order.forEach((i) => {
      const f = funds[i];
      const { c, r } = cell(i);
      const h = max > 0 ? Math.max(MINH, (Math.abs(f.flow) / max) * MAXH) : MINH;
      const dir = f.flow === 0 ? 'flat' : f.flow > 0 ? 'up' : 'down';
      const x0 = c * STEP, x1 = x0 + BW, y0 = r * STEP, y1 = y0 + BW;
      const fTop = [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)];
      const fRight = [P(x1, y0, h), P(x1, y1, h), P(x1, y1, 0), P(x1, y0, 0)];
      const fLeft = [P(x0, y1, h), P(x1, y1, h), P(x1, y1, 0), P(x0, y1, 0)];
      [fTop, fRight, fLeft].forEach((fc) => fc.forEach(note));
      const cap = P(x0 + BW / 2, y0 + BW / 2, h);
      note([cap[0] - 36, cap[1] - 26]); note([cap[0] + 36, cap[1]]);
      /*
       * Mã quỹ nằm ÚP TRÊN MẶT TRÊN của khối, nghiêng theo đúng mặt phẳng nền:
       * ma trận (CX, CY, −CX, CY) chính là phép chiếu của hai trục x và y, nên
       * chữ trông như được in lên mặt khối chứ không phải dán nổi lên trên.
       * Cỡ chữ tính bằng đơn vị không gian rồi để ma trận phóng ra.
       */
      const mtx = `matrix(${CX} ${CY} ${-CX} ${CY} ${cap[0].toFixed(1)} ${cap[1].toFixed(1)})`;
      bars += `<g class="iso-bar ${dir}">
        <polygon class="iso-face left" points="${pts(fLeft)}"/>
        <polygon class="iso-face right" points="${pts(fRight)}"/>
        <polygon class="iso-face top" points="${pts(fTop)}"/>
        <text class="iso-tick" transform="${mtx}" font-size="0.30" y="0.10">${f.ticker}</text>
        <text class="iso-val" x="${cap[0].toFixed(1)}" y="${(cap[1] - 12).toFixed(1)}">${fmtFlow(f.flow)}</text>
      </g>`;
    });

    const pad = 14;
    const vb = [bounds.x0 - pad, bounds.y0 - pad,
      bounds.x1 - bounds.x0 + pad * 2, bounds.y1 - bounds.y0 + pad * 2];
    /*
     * Hình vẽ để aria-hidden, kèm danh sách chỉ dành cho trình đọc màn hình.
     * Nhồi 12 con số vào một aria-label thì nghe không ra gì.
     */
    return `<div class="iso-wrap"><svg class="iso" aria-hidden="true" role="presentation"
        viewBox="${vb.map((v) => v.toFixed(1)).join(' ')}"
        width="${Math.round(vb[2])}" height="${Math.round(vb[3])}">
        <polygon class="iso-base left" points="${pts(bLeft)}"/>
        <polygon class="iso-base right" points="${pts(bRight)}"/>
        <polygon class="iso-base top" points="${pts(bTop)}"/>
        ${bars}
      </svg></div>
      <ul class="sr-only">${funds.map((f) => `<li>${f.ticker}: ${fmtFlow(f.flow)}</li>`).join('')}</ul>`;
  }

  /*
   * DÒNG CHI TIẾT: mở ra khi bấm vào tài sản. Liệt kê ĐỦ các quỹ kèm dòng tiền
   * của riêng từng quỹ — thứ dựng nên con số tổng ở dòng trên.
   *
   * Thanh bar dài theo TRỊ TUYỆT ĐỐI so với quỹ lớn nhất, nên quỹ rút tiền ra
   * cũng nhìn thấy được độ lớn chứ không tụt về 0. Chiều dài chỉ để so sánh
   * tương đối; con số thật luôn ghi bên cạnh.
   */
  function detailRow(id, asset, d) {
    const funds = d.funds || [];
    const items = isoChart(asset, d);
    // Nguồn nói có bao nhiêu quỹ, mà chi tiết chỉ về được ít hơn -> nói ra.
    const short = d.fundCount && funds.length < d.fundCount
      ? `<p class="efd-note">Nguồn ghi ${d.fundCount} quỹ nhưng chỉ trả về chi tiết của ${funds.length}.</p>`
      : '';
    return `<tr class="etf-detail" id="${id}" hidden><td colspan="6">
      <div class="efd">
        <h4>${asset.symbol} · dòng tiền từng quỹ <span class="muted small">ngày ${d.date || '—'}</span></h4>
        ${items}${short}
      </div></td></tr>`;
  }

  /*
   * BẢNG CHÍNH: một dòng cho mỗi tài sản, số lấy thẳng từ /api/etf-flow.
   * Tài sản nào nguồn không trả về thì ghi rõ là không lấy được — cách này cho
   * phép hiển thị đủ các tài sản mà không phải đoán mã niêm yết của từng quỹ.
   */
  function flowTable(flow) {
    const assets = CFG.etf.assets;
    if (!flow) {
      return `<p class="hint">Dòng tiền ETF <b>chưa cấu hình nguồn</b>. Số này chỉ nhà cung cấp
        có API mới công bố; cần đặt <code>SOSOVALUE_API_KEY</code>
        ở biến môi trường phía server. Chừng nào chưa có, ở đây để trống — trang này không ước lượng dòng tiền.</p>`;
    }
    const got = assets.filter((a) => flow.assets && flow.assets[a.symbol]);
    if (!got.length) {
      const why = (flow.errors || []).slice(0, 4).join(' · ');
      return `<p class="hint">Đã cấu hình <code>SOSOVALUE_API_KEY</code> nhưng lần gọi này nguồn
        không trả về tài sản nào.${why ? ' Lý do: ' + why + '.' : ''} Không có số thật thì để trống.</p>`;
    }
    const rows = assets.map((a) => {
      const d = flow.assets && flow.assets[a.symbol];
      if (!d) {
        // Phân biệt rõ hai chuyện khác hẳn nhau: nguồn KHÔNG CÓ tài sản này,
        // với nguồn có mà lần gọi này hỏng. Gộp làm một là để người xem tưởng
        // đợi thêm sẽ có.
        // notCovered = nguồn trả lời được nhưng không có ETF cho tài sản này.
        // supported = nguồn có, chỉ lần gọi này hỏng.
        const supported = (flow.notCovered || []).indexOf(a.symbol) < 0
          && (flow.supported || []).indexOf(a.symbol) >= 0;
        // Nhãn ngắn: câu giải thích đầy đủ nằm một lần ở dưới bảng. Lặp lại
        // nguyên câu trên 8 dòng vừa rối vừa kéo bảng rộng ra trên điện thoại.
        return `<tr class="etf-na"><td class="etf-name"><b>${a.symbol}</b><small>${a.label}</small></td>
          <td colspan="5" class="muted small">${supported ? 'Lần gọi này không lấy được' : 'Nguồn không công bố'}</td></tr>`;
      }
      const net = d.netInflow;
      // 0 không phải tiền vào cũng không phải tiền ra -> chip trung tính.
      const cls = net == null || net === 0 ? '' : net > 0 ? 'up' : 'down';
      // Nguồn ghi một ngày cho cả bảng, bản ghi từng tài sản có thể không kèm
      // ngày riêng. Thiếu thì lấy ngày chung, đừng bỏ trống.
      const day = d.date || flow.date || null;
      const funds = d.funds || [];
      const top = funds.slice(0, 3)
        .map((f) => `<span class="etf-fund ${f.flow === 0 ? '' : f.flow > 0 ? 'up' : 'down'}">${f.ticker} ${fmtFlow(f.flow)}</span>`)
        .join('');
      // Bấm vào tài sản để xem ĐỦ các quỹ, không chỉ 3 quỹ đầu. Không có dữ
      // liệu quỹ thì không dựng nút — nút bấm ra chỗ trống là nút lừa người.
      const id = 'etfd-' + a.symbol;
      const name = `<b>${a.symbol}</b><small>${a.label}</small>${
        d.fundCount ? `<span class="etf-count">×${d.fundCount} quỹ</span>` : ''}`;
      const head = funds.length
        ? `<button type="button" class="etf-toggle" aria-expanded="false" aria-controls="${id}"
             data-sym="${a.symbol}"><span class="etf-caret" aria-hidden="true">▸</span><span>${name}</span></button>`
        : name;
      return `<tr class="etf-main${funds.length ? ' has-detail' : ''}" data-sym="${a.symbol}">
        <td class="etf-name">${head}</td>
        <td><span class="mv-pill ${cls}">${fmtFlow(net)}</span></td>
        <td class="mv-price">${fmtUsd(d.totalNetAssets)}</td>
        <td class="muted small">${fmtUsd(d.traded)}</td>
        <td class="etf-funds">${top || '<span class="muted small">—</span>'}</td>
        <td class="muted small${d.offDate ? ' etf-off' : ''}">${day || '—'}${d.offDate ? ' ⚠' : ''}</td>
      </tr>${funds.length ? detailRow(id, a, d) : ''}`;
    }).join('');
    const sup = flow.supported || [];
    const supported = sup.length || got.length;
    const miss = (flow.errors || []).length;
    // Nguồn phủ hết danh sách; giữ nhánh này phòng khi nguồn rút bớt tài sản.
    const outside = assets.filter((a) => sup.length && sup.indexOf(a.symbol) < 0).map((a) => a.symbol);
    return `<div class="table-wrap"><table class="movers etf-table">
        <thead><tr><th>Tài sản</th><th>Dòng tiền ròng ngày</th><th>Tài sản ròng</th><th>GT giao dịch</th><th>Quỹ đóng góp nhiều nhất</th><th>Ngày</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="hint">Số liệu ngày <b>${flow.date || '—'}</b> · ${got.length}/${supported} tài sản đã lấy được dữ liệu${miss ? ` · ${miss} lỗi` : ''}.
        ${flow.sameValue ? `<br><b>⚠ Mọi tài sản đang ra cùng một con số.</b> Gần như chắc chắn nguồn
        không dùng tham số phân biệt tài sản, nên trả cùng một bản ghi cho mọi lần gọi. <b>Đừng tin
        bảng này</b> cho tới khi sửa xong — gọi <code>/api/etf-flow?diag=1</code> để xem nguồn thực sự trả gì.` : ''}
        ${flow.mixedDates ? '<b>⚠ Có dòng lệch ngày</b> — nguồn chưa chốt xong ngày này cho tài sản đó; dòng lệch được đánh dấu ⚠ ở cột ngày. Đừng cộng cả bảng lại thành một con số.' : ''}
        ${outside.length ? `<b>Nguồn không công bố</b> ETF của ${outside.join(', ')} — đó là giới hạn của
        nguồn, không phải đang chờ dữ liệu.` : ''}</p>`;
  }


  function render(mountId, payload) {
    const el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML = flowTable(payload.flow);
    wireToggles(el);
  }

  /*
   * Đóng/mở dòng chi tiết. Gắn MỘT handler ở gốc thay vì mỗi nút một cái, để
   * vẽ lại bảng (mỗi 15 phút) không phải gỡ handler cũ.
   *
   * Vẽ lại làm mất trạng thái đang mở, nên nhớ lại và mở lại — người đang đọc
   * chi tiết một quỹ mà tự dưng bị đóng sập là rất khó chịu.
   */
  const openRows = new Set();

  function setOpen(el, sym, open) {
    const btn = el.querySelector(`.etf-toggle[data-sym="${sym}"]`);
    const detail = document.getElementById('etfd-' + sym);
    if (!btn || !detail) return;
    detail.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.closest('tr').classList.toggle('open', open);
    if (open) openRows.add(sym); else openRows.delete(sym);
  }

  function wireToggles(el) {
    if (!el.dataset.wired) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.etf-toggle');
        if (!btn || !el.contains(btn)) return;
        setOpen(el, btn.dataset.sym, btn.getAttribute('aria-expanded') !== 'true');
      });
      el.dataset.wired = '1';
    }
    // Sau khi vẽ lại: khôi phục những dòng đang mở.
    openRows.forEach((sym) => setOpen(el, sym, true));
  }

  /*
   * Dữ liệu này đổi mỗi ngày một lần, nên không cần nhịp 30s như bảng coin.
   * Nhưng KHÔNG làm mới lần nào thì tab mở qua đêm sẽ hiện số hôm qua mà không
   * báo gì — đó mới là vấn đề. 15 phút là đủ, và hàm server đã cache ở CDN 5
   * phút nên phần lớn lần gọi không chạm tới nhà cung cấp.
   */
  const REFRESH_MS = 15 * 60000;
  const STALE_MS = 5 * 60000;      // quay lại tab sau ngần này thì lấy lại
  let lastAt = 0;
  let hadFlow = false;             // đã từng có bảng dòng tiền tử tế chưa
  let busy = false;

  async function refresh(mountId) {
    if (busy) return;
    busy = true;
    try {
      const payload = await load();
      /*
       * fetchFlow KHÔNG ném lỗi khi hàm server hỏng — nó trả null. Vẽ lại với
       * null sẽ thay bảng đang đúng bằng câu "chưa cấu hình nguồn", vừa xoá mất
       * dữ liệu người ta đang đọc, vừa nói sai: key vẫn cấu hình đủ, chỉ là lần
       * gọi này hỏng. Đang có số tử tế mà lấy lại không ra thì giữ nguyên.
       */
      if (!payload.flow && hadFlow) return;
      lastAt = Date.now();
      hadFlow = !!payload.flow;
      render(mountId, { ...payload, at: lastAt });
    } catch (e) {
      // Hỏng hẳn cũng giữ nguyên bảng đang có, vì lý do trên.
    } finally { busy = false; }
  }

  async function init(mountId) {
    const el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML = '<p class="hint">Đang tải báo giá ETF…</p>';
    try {
      const payload = await load();
      lastAt = Date.now();
      hadFlow = !!payload.flow;
      render(mountId, { ...payload, at: lastAt });
    } catch (e) {
      el.innerHTML = '<p class="hint">Không lấy được báo giá ETF. Trang này không hiển thị số liệu ước lượng.</p>';
    }
    setInterval(() => { if (!document.hidden) refresh(mountId); }, REFRESH_MS);
    // Quan trọng hơn cả nhịp định kỳ: người ta mở lại tab hôm sau. Trình duyệt
    // hay bóp nghẹt setInterval ở tab ẩn, nên phải bắt cả lúc tab hiện lại.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastAt > STALE_MS) refresh(mountId);
    });
  }

  window.VdearETF = { init, load, refresh };
})();

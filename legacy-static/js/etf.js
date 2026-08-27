/*
 * Vdear — ETF giao ngay BTC/ETH
 *
 * Module này cố ý tách bạch hai thứ mà người ta hay gộp:
 *
 *   GIÁ        lấy được từ nguồn báo giá miễn phí (Stooq, CSV, không cần key).
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
    if (!Number.isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    if (n === 0) return '$0';
    return '$' + n.toFixed(2);
  }

  // Stooq trả CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
  function parseCsv(text) {
    const lines = String(text).trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const head = lines[0].toLowerCase().split(',');
    const row = lines[1].split(',');
    const get = (k) => { const i = head.indexOf(k); return i < 0 ? null : row[i]; };
    const close = parseFloat(get('close'));
    const open = parseFloat(get('open'));
    const vol = parseFloat(get('volume'));
    if (!Number.isFinite(close) || close <= 0) return null;   // "N/D" -> bỏ
    return {
      price: close,
      // % trong phiên, tính từ mở cửa. KHÔNG phải % so với phiên trước — nói
      // đúng tên để không ai đọc nhầm thành biến động 24h.
      changeIntraday: Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : null,
      volume: Number.isFinite(vol) ? vol : null,
      date: get('date'), time: get('time'),
    };
  }

  async function fetchQuote(ticker) {
    const url = CFG.etf.quoteBase + encodeURIComponent(ticker.toLowerCase() + '.us');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return parseCsv(await res.text());
    } finally { clearTimeout(t); }
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
    const funds = CFG.etf.funds;
    const [rows, flow] = await Promise.all([
      Promise.all(funds.map(async (f) => {
        try { return { ...f, quote: await fetchQuote(f.ticker) }; }
        catch (e) { return { ...f, quote: null }; }
      })),
      fetchFlow(),
    ]);
    return { rows, flow };
  }

  function fmtFlow(v) {
    if (v == null || !Number.isFinite(v)) return '—';   // thiếu dữ liệu
    if (v === 0) return '$0';                           // có dữ liệu, và bằng 0
    return (v > 0 ? '+' : '−') + fmtUsd(Math.abs(v));
  }

  /*
   * BẢNG CHÍNH: một dòng cho mỗi tài sản, số lấy thẳng từ /api/etf-flow.
   * Tài sản nào nguồn không trả về thì ghi rõ là không lấy được — cách này cho
   * phép hiển thị đủ 12 tài sản mà không phải đoán mã niêm yết của từng quỹ.
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
        const supported = (flow.supported || []).indexOf(a.symbol) >= 0;
        // Nhãn ngắn: câu giải thích đầy đủ nằm một lần ở dưới bảng. Lặp lại
        // nguyên câu trên 8 dòng vừa rối vừa kéo bảng rộng ra trên điện thoại.
        return `<tr class="etf-na"><td class="etf-name"><b>${a.symbol}</b><small>${a.label}</small></td>
          <td colspan="3" class="muted small">${supported ? 'Lần gọi này không lấy được' : 'Nguồn không công bố'}</td></tr>`;
      }
      const net = d.netInflow;
      // 0 không phải tiền vào cũng không phải tiền ra -> chip trung tính.
      const cls = net == null || net === 0 ? '' : net > 0 ? 'up' : 'down';
      const top = (d.funds || []).slice(0, 3)
        .map((f) => `<span class="etf-fund ${f.flow === 0 ? '' : f.flow > 0 ? 'up' : 'down'}">${f.ticker} ${fmtFlow(f.flow)}</span>`)
        .join('');
      return `<tr>
        <td class="etf-name"><b>${a.symbol}</b><small>${a.label}</small></td>
        <td><span class="mv-pill ${cls}">${fmtFlow(net)}</span></td>
        <td class="etf-funds">${top || '<span class="muted small">—</span>'}</td>
        <td class="muted small${d.offDate ? ' etf-off' : ''}">${d.date || '—'}${d.offDate ? ' ⚠' : ''}</td>
      </tr>`;
    }).join('');
    const sup = flow.supported || [];
    const supported = sup.length || got.length;
    const miss = (flow.errors || []).length;
    // Nguồn phủ cả 12; giữ nhánh này phòng khi nguồn rút bớt tài sản.
    const outside = assets.filter((a) => sup.length && sup.indexOf(a.symbol) < 0).map((a) => a.symbol);
    return `<div class="table-wrap"><table class="movers etf-table">
        <thead><tr><th>Tài sản</th><th>Dòng tiền ròng ngày</th><th>Quỹ đóng góp nhiều nhất</th><th>Ngày</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="hint">Số liệu ngày <b>${flow.date || '—'}</b> · ${got.length}/${supported} tài sản đã lấy được dữ liệu${miss ? ` · ${miss} lỗi` : ''}.
        ${flow.sameValue ? `<br><b>⚠ Mọi tài sản đang ra cùng một con số.</b> Gần như chắc chắn nguồn
        không dùng tham số phân biệt tài sản, nên trả cùng một bản ghi cho cả 12 lần gọi. <b>Đừng tin
        bảng này</b> cho tới khi sửa xong — gọi <code>/api/etf-flow?diag=1</code> để xem nguồn thực sự trả gì.` : ''}
        ${flow.mixedDates ? '<b>⚠ Có dòng lệch ngày</b> — nguồn chưa chốt xong ngày này cho tài sản đó; dòng lệch được đánh dấu ⚠ ở cột ngày. Đừng cộng cả bảng lại thành một con số.' : ''}
        Nguồn: <b>SoSoValue</b>.
        ${outside.length ? `<b>Nguồn không công bố</b> ETF của ${outside.join(', ')} — đó là giới hạn của
        nguồn, không phải đang chờ dữ liệu.` : ''}</p>`;
  }

  /* BẢNG PHỤ: giá cổ phiếu quỹ, chỉ những quỹ đã biết chắc mã niêm yết. */
  function quoteTable(rows) {
    const ok = rows.filter((r) => r.quote);
    if (!ok.length) {
      return `<p class="hint">Không lấy được báo giá cổ phiếu quỹ (nguồn miễn phí có thể bị chặn
        từ trình duyệt). Không có số liệu thì để trống.</p>`;
    }
    const group = (asset, label) => {
      const list = rows.filter((r) => r.asset === asset);
      if (!list.length) return '';
      return `<h4>${label}</h4><div class="table-wrap"><table class="movers etf-table">
        <thead><tr><th>Quỹ</th><th>Giá</th><th>Trong phiên</th><th>KL khớp lệnh</th></tr></thead>
        <tbody>${list.map((r) => {
          const q = r.quote;
          if (!q) return `<tr><td class="etf-name"><b>${r.ticker}</b><small>${r.issuer}</small></td>
            <td colspan="3" class="muted small">Chưa lấy được</td></tr>`;
          const c = q.changeIntraday;
          const cls = c == null ? '' : c >= 0 ? 'up' : 'down';
          const ctxt = c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
          return `<tr>
            <td class="etf-name"><b>${r.ticker}</b><small>${r.name}</small></td>
            <td class="mv-price">$${q.price.toFixed(2)}</td>
            <td><span class="mv-pill ${cls}">${ctxt}</span></td>
            <td class="mv-klgd">${q.volume == null ? '—' : q.volume.toLocaleString('en-US')}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    };
    const stamp = ok[0].quote.date ? `${ok[0].quote.date} ${ok[0].quote.time || ''}`.trim() : '';
    return group('BTC', 'Quỹ Bitcoin') + group('ETH', 'Quỹ Ethereum')
      + (stamp ? `<p class="hint">Báo giá tính đến <b>${stamp}</b> (giờ nguồn).</p>` : '');
  }

  function render(mountId, payload) {
    const el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML = `<div class="etf-group"><h3>Dòng tiền ròng theo tài sản</h3>${flowTable(payload.flow)}</div>
      <div class="etf-group"><h3>Giá cổ phiếu quỹ</h3>${quoteTable(payload.rows)}</div>`;
  }

  async function init(mountId) {
    const el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML = '<p class="hint">Đang tải báo giá ETF…</p>';
    try { render(mountId, await load()); }
    catch (e) {
      el.innerHTML = '<p class="hint">Không lấy được báo giá ETF. Trang này không hiển thị số liệu ước lượng.</p>';
    }
  }

  window.VdearETF = { init, load };
})();

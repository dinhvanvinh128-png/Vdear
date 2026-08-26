/*
 * Vdear — ETF giao ngay BTC/ETH
 *
 * Module này cố ý tách bạch hai thứ mà người ta hay gộp:
 *
 *   GIÁ        lấy được từ nguồn báo giá miễn phí (Stooq, CSV, không cần key).
 *   DÒNG TIỀN  (net creations/redemptions) là tiền thực chảy vào/ra quỹ. Nó
 *              tính từ số chứng chỉ quỹ phát hành thêm hoặc mua lại trong ngày,
 *              KHÔNG suy ra được từ giá hay khối lượng khớp lệnh. Không nguồn
 *              miễn phí nào công bố; cần CoinGlass/SoSoValue có API key, mà key
 *              phải nằm ở server. Bản tĩnh không có server, nên phần dòng tiền
 *              hiển thị "chưa cấu hình nguồn" thay vì một con số ước lượng.
 *
 * Nguồn hỏng hoặc bị CORS chặn -> báo không lấy được. Không có đường nào trong
 * file này sinh ra số liệu thị trường.
 */
(function () {
  const CFG = window.VDEAR_CONFIG;

  function fmtUsd(n) {
    if (!(n > 0)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
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

  async function load() {
    const funds = CFG.etf.funds;
    const rows = await Promise.all(funds.map(async (f) => {
      try { return { ...f, quote: await fetchQuote(f.ticker) }; }
      catch (e) { return { ...f, quote: null }; }
    }));
    return rows;
  }

  function render(mountId, rows) {
    const el = document.getElementById(mountId);
    if (!el) return;
    const ok = rows.filter((r) => r.quote);
    if (!ok.length) {
      el.innerHTML = '<p class="hint">Không lấy được báo giá ETF (nguồn miễn phí có thể bị chặn từ trình duyệt). '
        + 'Không có số liệu thì để trống — trang này không tự sinh ra giá.</p>';
      return;
    }
    const group = (asset) => rows.filter((r) => r.asset === asset);
    const table = (asset, label) => {
      const list = group(asset);
      if (!list.length) return '';
      return `<div class="etf-group">
        <h3>${label}</h3>
        <div class="table-wrap"><table class="movers etf-table">
          <thead><tr><th>Quỹ</th><th>Giá</th><th>Trong phiên</th><th>KL khớp lệnh</th><th>Dòng tiền ròng</th></tr></thead>
          <tbody>${list.map((r) => {
            const q = r.quote;
            if (!q) return `<tr><td class="etf-name"><b>${r.ticker}</b><small>${r.issuer}</small></td>
              <td colspan="4" class="muted">Chưa lấy được</td></tr>`;
            const c = q.changeIntraday;
            const cls = c == null ? '' : c >= 0 ? 'up' : 'down';
            const ctxt = c == null ? '—' : (c >= 0 ? '+' : '') + c.toFixed(2) + '%';
            return `<tr>
              <td class="etf-name"><b>${r.ticker}</b><small>${r.name}</small></td>
              <td class="mv-price">$${q.price.toFixed(2)}</td>
              <td><span class="mv-pill ${cls}">${ctxt}</span></td>
              <td class="mv-klgd">${q.volume == null ? '—' : q.volume.toLocaleString('en-US')}</td>
              <td class="muted small">chưa cấu hình nguồn</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>`;
    };
    const stamp = ok[0].quote.date ? `${ok[0].quote.date} ${ok[0].quote.time || ''}`.trim() : '';
    el.innerHTML = table('BTC', 'ETF Bitcoin giao ngay') + table('ETH', 'ETF Ethereum giao ngay')
      + (stamp ? `<p class="hint">Báo giá tính đến <b>${stamp}</b> (giờ nguồn) · ${ok.length}/${rows.length} quỹ lấy được dữ liệu.</p>` : '');
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

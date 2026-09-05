/*
 * Vdear — Menu điều hướng (nút 3 gạch cạnh logo)
 *
 * Nút nằm sẵn trong HTML của mọi trang (để vẫn thấy được khi JS lỗi); file này
 * chỉ dựng ngăn kéo (drawer) và xử lý mở/đóng. Danh sách mục khai báo một chỗ
 * duy nhất ở đây — thêm trang mới chỉ cần thêm một dòng, không phải sửa 8 file.
 */
(function () {
  // Icon vẽ bằng SVG nét mảnh thay vì emoji: emoji đổi hình theo hệ điều hành
  // và không nhận màu vàng của giao diện.
  const I = {
    market: '<path d="M3 13l4-4 3 3 6-7"/><path d="M13 5h4v4"/>',
    bubble: '<circle cx="7" cy="12" r="4"/><circle cx="14.5" cy="7.5" r="3"/><circle cx="16" cy="15" r="2.2"/>',
    coin:   '<circle cx="10" cy="10" r="7"/><path d="M10 6.2v7.6M12.2 8.1a2.4 2.4 0 0 0-4.4 1.2c0 2.4 4.4 1.2 4.4 3.4a2.4 2.4 0 0 1-4.4-1.2"/>',
    star:   '<path d="M10 3l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4L5.5 16.7l.9-5L2.8 8.2l5-.7z"/>',
    bank:   '<path d="M3 8l7-4 7 4"/><path d="M5 8v7M10 8v7M15 8v7M3 17h14"/>',
    info:   '<circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.6v.6"/>',
    doc:    '<path d="M5 3h6l4 4v10H5z"/><path d="M11 3v4h4M7.5 11h5M7.5 13.6h5"/>',
    lock:   '<rect x="4.5" y="9" width="11" height="7.5" rx="1.6"/><path d="M7.2 9V7a2.8 2.8 0 0 1 5.6 0v2"/>',
    warn:   '<path d="M10 3.4l7 12.2H3z"/><path d="M10 8v3.4M10 13.4v.6"/>',
    mail:   '<rect x="3" y="5" width="14" height="10" rx="1.6"/><path d="M3.6 6l6.4 4.6L16.4 6"/>',
    radar:  '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/><path d="M10 10l4.8-4.8"/>',
    table:  '<rect x="3" y="4" width="14" height="12" rx="1.6"/><path d="M3 8.4h14M8 8.4V16"/>',
    spot:   '<path d="M3 14.5l4-4 3 2.4 3.4-4.6 3.6 3"/><circle cx="7" cy="10.5" r="1.3"/><circle cx="13.4" cy="8.3" r="1.3"/>',
    sector: '<path d="M10 3a7 7 0 1 1-6.9 8.2"/><path d="M10 3v7l6.2 3.2"/>',
    flow:   '<path d="M3 6.5c2.4 0 2.4 3 4.8 3s2.4-3 4.8-3 2.4 3 4.4 3"/><path d="M3 12.5c2.4 0 2.4 3 4.8 3s2.4-3 4.8-3 2.4 3 4.4 3"/>',
    whale:  '<path d="M2.6 11.5c2.6 3.4 6 4.6 9 3.4 2.6-1 4-3.4 4.4-6.4-2.6.4-4.6 1.4-6 3"/><path d="M16 8.5c.8-1.4 1.4-2.4 1.4-3.4-1.4.2-2.4.8-3 1.6"/><circle cx="6.4" cy="10.4" r=".7"/>',
    chain:  '<path d="M8.4 11.6a3 3 0 0 1 0-4.2l2-2a3 3 0 0 1 4.2 4.2l-1 1"/><path d="M11.6 8.4a3 3 0 0 1 0 4.2l-2 2a3 3 0 0 1-4.2-4.2l1-1"/>',
    drop:   '<path d="M10 3.2S5.4 8 5.4 11.2a4.6 4.6 0 0 0 9.2 0C14.6 8 10 3.2 10 3.2z"/>',
    breadth:'<path d="M3 16V9M7 16V5M11 16v-4M15 16V7"/>',
  etf:    '<rect x="2.6" y="4.4" width="14.8" height="11.2" rx="1.8"/><path d="M6.2 12.6V9.4M10 12.6V7.2M13.8 12.6v-2.2"/>',
    layers: '<path d="M10 3l7 3.6-7 3.6-7-3.6z"/><path d="M3 11l7 3.6 7-3.6"/>',
    percent:'<circle cx="6.6" cy="6.6" r="2.1"/><circle cx="13.4" cy="13.4" r="2.1"/><path d="M15 5L5 15"/>',
    scale:  '<path d="M10 3.4v13M4 6.6h12"/><path d="M4 6.6L1.8 11h4.4zM16 6.6L13.8 11h4.4z"/>',
  };

  // Cấu trúc theo bản thiết kế "Crypto Intelligence Terminal".
  // Đường dẫn bắt đầu bằng "/" là route của app Next.js (module dòng tiền,
  // on-chain, whale, thanh khoản, độ rộng, phái sinh...). Đường dẫn .html là
  // các trang tĩnh vẫn giữ nguyên. Mục nào chưa có trang thì đặt `soon: true`
  // để hiện ra mà không bấm được — gắn link vào trang chưa tồn tại chỉ để menu
  // trông đầy đủ là đẩy người dùng vào 404.
  // `k` là khoá i18n; nhãn tiếng Việt vẫn nằm ngay đây vì đó là bản gốc và là
  // thứ đọc được khi mở tệp. Thiếu khoá hay thiếu bản dịch thì rơi về nhãn
  // tiếng Việt, không bao giờ hiện mã khoá ra menu (xem js/i18n.js).
  const GROUPS = [
    {
      title: 'Thị trường', k: 'nav.g.market',
      items: [
        { href: '/', label: 'Tổng quan thị trường', k: 'nav.i.overview', icon: 'market' },
        { href: '/#movers', label: 'Biến động 24h', k: 'nav.i.movers', icon: 'table' },
        { href: '/#etf', label: 'Dòng tiền ETF', k: 'nav.i.etf', icon: 'etf' },
        { href: 'bubbles.html', label: 'Bong bóng thị trường', k: 'nav.i.bubbles', icon: 'bubble' },
        { href: '/#futures-radar', label: 'Futures Radar', k: 'nav.i.radar', icon: 'radar' },
        { label: 'Spot Radar', k: 'nav.i.spot', icon: 'spot', soon: true },
        { label: 'Sector Rotation', k: 'nav.i.sector', icon: 'sector', soon: true },
      ],
    },
    {
      title: 'Phân tích', k: 'nav.g.analysis',
      items: [
        { href: 'coin.html?c=BTC', label: 'Phân tích coin', k: 'nav.i.coin', icon: 'coin' },
        { label: 'Dòng tiền', k: 'nav.i.flow', icon: 'flow', soon: true },
        { label: 'Whale & Exchange Flow', k: 'nav.i.whale', icon: 'whale', soon: true },
        { label: 'On-chain', k: 'nav.i.onchain', icon: 'chain', soon: true },
        { label: 'Thanh khoản', k: 'nav.i.liquidity', icon: 'drop', soon: true },
        { label: 'Độ rộng thị trường', k: 'nav.i.breadth', icon: 'breadth', soon: true },
      ],
    },
    {
      title: 'Phái sinh', k: 'nav.g.derivatives',
      items: [
        { label: 'Open Interest', k: 'nav.i.oi', icon: 'layers', soon: true },
        { label: 'Funding', k: 'nav.i.funding', icon: 'percent', soon: true },
        { label: 'Thanh lý', k: 'nav.i.liquidation', icon: 'drop', soon: true },
        { label: 'Long / Short', k: 'nav.i.ls', icon: 'scale', soon: true },
      ],
    },
    {
      title: 'Của bạn', k: 'nav.g.yours',
      items: [
        { href: '/?view=fav', label: 'Coin yêu thích', k: 'nav.i.fav', icon: 'star' },
      ],
    },
    {
      title: 'Thông tin', k: 'nav.g.info',
      items: [
        { href: 'about.html', label: 'Giới thiệu', k: 'nav.i.about', icon: 'info' },
        { href: 'contact.html', label: 'Liên hệ', k: 'nav.i.contact', icon: 'mail' },
      ],
    },
    {
      title: 'Pháp lý', k: 'nav.g.legal',
      items: [
        { href: 'terms.html', label: 'Điều khoản sử dụng', k: 'nav.i.terms', icon: 'doc' },
        { href: 'privacy.html', label: 'Chính sách bảo mật', k: 'nav.i.privacy', icon: 'lock' },
        { href: 'risk.html', label: 'Khuyến cáo rủi ro', k: 'nav.i.risk', icon: 'warn' },
      ],
    },
  ];

  // So khớp mục đang mở: chỉ so tên file + tham số view, bỏ hash và query khác,
  // để "coin.html?c=SOL" vẫn sáng đúng mục "Phân tích coin".
  function currentKey() {
    const file = (location.pathname.split('/').pop() || 'index.html').replace(/^$/, 'index.html');
    const view = new URLSearchParams(location.search).get('view');
    return file + (view ? '?view=' + view : '');
  }
  function itemKey(href) {
    const [path, q] = href.split('#')[0].split('?');
    const view = q ? new URLSearchParams(q).get('view') : null;
    return path + (view ? '?view=' + view : '');
  }
  // Link có #hash trỏ tới một khu vực BÊN TRONG trang, không phải cả trang, nên
  // không được coi là "đang mở" — nếu không thì "Bảng thị trường" và "Bong bóng
  // coin" cùng sáng và có hai aria-current trên một trang.
  function isCurrent(href, here) { return href.indexOf('#') < 0 && itemKey(href) === here; }

  function build() {
    const btn = document.querySelector('[data-nav-open]');
    if (!btn || document.getElementById('siteNav')) return;

    const here = currentKey();
    const body = GROUPS.map((g) => `
      <div class="nd-group">
        <h3 data-i18n="${g.k}">${g.title}</h3>
        ${g.items.map((it) => {
          const ico = `<svg class="nd-ico" viewBox="0 0 20 20" aria-hidden="true">${I[it.icon] || ''}</svg>`;
          const txt = `<span class="nd-txt"><b data-i18n="${it.k}">${it.label}</b></span>`;
          if (it.soon || !it.href) {
            return `<div class="nd-item soon" aria-disabled="true">${ico}${txt}<span class="nd-soon" data-i18n="nav.soon">sắp có</span></div>`;
          }
          const cur = isCurrent(it.href, here);
          return `<a class="nd-item${cur ? ' current' : ''}" href="${it.href}"${cur ? ' aria-current="page"' : ''}>${ico}${txt}</a>`;
        }).join('')}
      </div>`).join('');

    const wrap = document.createElement('div');
    wrap.className = 'nd-root';
    wrap.innerHTML = `
      <div class="nd-scrim" data-nav-close></div>
      <nav id="siteNav" class="nd-panel" aria-label="Menu chính" data-i18n-attr="aria-label:nav.menuLabel" aria-hidden="true">
        <div class="nd-head">
          <span class="nd-brand">Vdearypto</span>
          <button class="nd-close" data-nav-close aria-label="Đóng menu" data-i18n-attr="aria-label:nav.close">✕</button>
        </div>
        ${body}
        <p class="nd-foot" data-i18n="nav.foot">Dữ liệu chỉ mang tính tham khảo, không phải lời khuyên đầu tư.</p>
      </nav>`;
    document.body.appendChild(wrap);
    // Menu dựng bằng JS nên nằm ngoài lượt dịch đầu tiên của i18n (cả hai cùng
    // chạy ở DOMContentLoaded). Dịch ngay phần vừa dựng; các lần đổi ngôn ngữ
    // sau thì apply(document) của i18n đã với tới rồi.
    if (window.VdearI18n) window.VdearI18n.apply(wrap);

    /*
     * Chiều cao thanh đầu, đo THẬT chứ không gán số cố định: header bọc dòng
     * khi màn hẹp nên cao thấp khác nhau, đoán một con số là dải bên sẽ chui
     * lên dưới logo hoặc hở một khoảng.
     */
    /*
     * Mép dưới thanh đầu, tính theo khung nhìn — và nó ĐỔI KHI CUỘN.
     *
     * Trang có dải giá chạy cao 50px nằm trên, KHÔNG sticky; thanh đầu thì
     * sticky top:0. Nên ở đầu trang mép dưới header là 117px, cuộn xuống còn
     * 67px. Lấy chiều CAO của thanh đầu (cách cũ) là sai ngay từ đầu trang:
     * dải bên chồng lên header đúng 50px.
     */
    let topRaf = 0;
    function syncTop() {
      const bar = document.querySelector('.topbar');
      const b = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
      document.documentElement.style.setProperty('--nd-top', b + 'px');
    }
    function queueTop() {
      if (topRaf) return;
      topRaf = requestAnimationFrame(() => { topRaf = 0; syncTop(); });
    }
    /*
     * Dải icon chỉ hợp với thiết bị RÊ CHUỘT ĐƯỢC: nhãn của nó hiện ra khi
     * hover, mà máy cảm ứng thì không hover được — chạm vào icon là đi luôn,
     * người dùng không kịp đọc nhãn nào cả. Máy như vậy giữ nguyên drawer.
     *
     * Đặt bằng class chứ không viết @media (hover:hover) trong CSS, vì như thế
     * mới kiểm tra được: trình duyệt headless báo hover:none nên nhánh này sẽ
     * không bao giờ chạy trong bài kiểm.
     */
    const mq = window.matchMedia('(hover:hover) and (pointer:fine)');
    const syncHover = () => document.documentElement.classList.toggle('nd-hoverable', mq.matches);
    syncHover();
    if (mq.addEventListener) mq.addEventListener('change', syncHover);

    syncTop();
    window.addEventListener('resize', queueTop);
    window.addEventListener('scroll', queueTop, { passive: true });
    if (window.ResizeObserver) {
      const bar = document.querySelector('.topbar');
      if (bar) new ResizeObserver(queueTop).observe(bar);
    }

    const panel = wrap.querySelector('.nd-panel');
    let lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      wrap.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('nd-locked');
      // Ép tính lại style trước khi focus: drawer vừa đổi từ visibility:hidden
      // sang visible, mà focus() vào phần tử còn ẩn thì trình duyệt bỏ qua.
      const first = panel.querySelector('a.nd-item');
      if (first) { void panel.offsetWidth; first.focus(); }
    }
    function close() {
      wrap.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nd-locked');
      // Trả tiêu điểm về chỗ cũ; nếu chỗ cũ không nhận được focus (body) thì trả
      // về chính nút 3 gạch để người dùng bàn phím không bị mất vị trí.
      const back = lastFocus && lastFocus.focus && lastFocus !== document.body ? lastFocus : btn;
      back.focus();
    }
    function isOpen() { return wrap.classList.contains('open'); }

    btn.addEventListener('click', () => (isOpen() ? close() : open()));
    wrap.querySelectorAll('[data-nav-close]').forEach((el) => el.addEventListener('click', close));
    // Bấm vào một mục ngay trên trang hiện tại (link #hash) thì đóng menu luôn,
    // vì trang không tải lại nên drawer sẽ nằm mãi trên màn hình.
    wrap.querySelectorAll('a.nd-item').forEach((a) => a.addEventListener('click', () => setTimeout(close, 0)));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); }
      // Giữ tiêu điểm bàn phím trong drawer khi đang mở.
      if (e.key === 'Tab' && isOpen()) {
        const f = panel.querySelectorAll('a[href],button');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();

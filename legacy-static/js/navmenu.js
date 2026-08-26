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
  };

  const GROUPS = [
    {
      title: 'Thị trường',
      items: [
        { href: 'index.html', label: 'Bảng thị trường', icon: 'market', desc: 'Biến động 24h · 4 sàn' },
        { href: 'bubbles.html', label: 'Bong bóng thị trường', icon: 'bubble', desc: 'Cả thị trường trong một khung' },
        { href: 'coin.html?c=BTC', label: 'Phân tích coin', icon: 'coin', desc: 'Chart · RSI · S&R · kế hoạch lệnh' },
        { href: 'index.html?view=fav', label: 'Coin yêu thích', icon: 'star', desc: 'Danh mục bạn đang theo dõi' },
        { href: 'index.html?view=tradfi', label: 'TradFi', icon: 'bank', desc: 'Vàng · Bạc · Dầu' },
      ],
    },
    {
      title: 'Thông tin',
      items: [
        { href: 'about.html', label: 'Giới thiệu', icon: 'info', desc: 'Vdearypto làm gì và không làm gì' },
        { href: 'contact.html', label: 'Liên hệ', icon: 'mail', desc: 'Góp ý, báo lỗi dữ liệu' },
      ],
    },
    {
      title: 'Pháp lý',
      items: [
        { href: 'terms.html', label: 'Điều khoản sử dụng', icon: 'doc' },
        { href: 'privacy.html', label: 'Chính sách bảo mật', icon: 'lock' },
        { href: 'risk.html', label: 'Khuyến cáo rủi ro', icon: 'warn' },
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
        <h3>${g.title}</h3>
        ${g.items.map((it) => `
          <a class="nd-item${isCurrent(it.href, here) ? ' current' : ''}" href="${it.href}"${isCurrent(it.href, here) ? ' aria-current="page"' : ''}>
            <svg class="nd-ico" viewBox="0 0 20 20" aria-hidden="true">${I[it.icon] || ''}</svg>
            <span class="nd-txt"><b>${it.label}</b>${it.desc ? `<small>${it.desc}</small>` : ''}</span>
          </a>`).join('')}
      </div>`).join('');

    const wrap = document.createElement('div');
    wrap.className = 'nd-root';
    wrap.innerHTML = `
      <div class="nd-scrim" data-nav-close></div>
      <nav id="siteNav" class="nd-panel" aria-label="Menu chính" aria-hidden="true">
        <div class="nd-head">
          <span class="nd-brand">Vdearypto</span>
          <button class="nd-close" data-nav-close aria-label="Đóng menu">✕</button>
        </div>
        ${body}
        <p class="nd-foot">Dữ liệu chỉ mang tính tham khảo, không phải lời khuyên đầu tư.</p>
      </nav>`;
    document.body.appendChild(wrap);

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
      const first = panel.querySelector('.nd-item');
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
    wrap.querySelectorAll('.nd-item').forEach((a) => a.addEventListener('click', () => setTimeout(close, 0)));

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

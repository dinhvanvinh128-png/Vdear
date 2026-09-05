/*
 * Vdear — Command palette (⌘K / Ctrl+K)
 * Tìm nhanh & nhảy tới bất kỳ coin nào, cùng vài lối tắt điều hướng.
 */
(function () {
  // Chữ hiển thị lấy qua i18n. t() tự rơi về tiếng Việt khi thiếu bản dịch;
  // i18n.js được nạp trước mọi module nên nhánh dự phòng dưới đây gần như
  // không bao giờ chạy, để đó cho chắc.
  const T = (k, v) => (window.VdearI18n ? window.VdearI18n.t(k, v) : k);

  const API = window.VdearAPI;
  let market = [];
  let overlay, input, results, items = [], active = 0;

  const NAV = [
    { type: 'nav', k: 'cmd.markets', ks: 'cmd.home', label: 'Thị trường', sub: 'Trang chủ', href: 'index.html' },
    { type: 'nav', k: null, ks: 'cmd.analysis', label: 'BTC · Bitcoin', sub: 'Phân tích', href: 'coin.html?c=BTC' },
    { type: 'nav', k: null, ks: 'cmd.analysis', label: 'ETH · Ethereum', sub: 'Phân tích', href: 'coin.html?c=ETH' },
  ];

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'cmd-overlay';
    overlay.innerHTML = `
      <div class="cmd-box" role="dialog" aria-label="Tìm kiếm">
        <div class="cmd-input-row">
          <span class="cmd-ico">🔍</span>
          <input type="text" placeholder="Tìm coin hoặc trang… (vd BTC, SOL)" data-i18n-attr="placeholder:cmd.placeholder" autocomplete="off" spellcheck="false">
          <span class="cmd-esc">ESC</span>
        </div>
        <div class="cmd-results"></div>
      </div>`;
    document.body.appendChild(overlay);
    // Bảng lệnh dựng bằng JS nên nằm ngoài lượt dịch đầu tiên của i18n.
    if (window.VdearI18n) window.VdearI18n.apply(overlay);
    input = overlay.querySelector('input');
    results = overlay.querySelector('.cmd-results');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', onKey);
  }

  async function open() {
    if (!overlay) build();
    overlay.classList.add('open');
    input.value = ''; active = 0;
    render();
    setTimeout(() => input.focus(), 20);
    if (!market.length) { try { market = await API.getMarket(); render(); } catch (e) {} }
  }
  function close() { overlay && overlay.classList.remove('open'); }

  function render() {
    const q = input.value.trim().toUpperCase();
    let list;
    if (!q) {
      list = NAV.concat(market.slice(0, 8).map(coinItem));
    } else {
      const coins = market.filter((c) => c.base.includes(q)).slice(0, 30).map(coinItem);
      const nav = NAV.filter((n) => n.label.toUpperCase().includes(q));
      list = coins.concat(nav);
    }
    items = list; active = 0;
    if (!list.length) { results.innerHTML = '<div class="cmd-empty">' + T('cmd.empty') + '</div>'; return; }
    results.innerHTML =
      '<div class="cmd-section">' + T('cmd.results') + '</div>' +
      list.map((it, i) => it.type === 'coin'
        ? `<div class="cmd-item ${i === 0 ? 'active' : ''}" data-i="${i}">
             <img alt="" data-logo="${it.base}">
             <span class="ci-sym">${it.base}</span><span class="ci-sub">${it.sub}</span></div>`
        : `<div class="cmd-item ${i === 0 ? 'active' : ''}" data-i="${i}">
             <span class="ci-sym">${it.k ? T(it.k) : it.label}</span><span class="ci-sub">${it.ks ? T(it.ks) : it.sub}</span></div>`
      ).join('');
    results.querySelectorAll('[data-logo]').forEach((img) => API.applyLogo(img, img.dataset.logo));
    results.querySelectorAll('.cmd-item').forEach((el) => {
      el.addEventListener('mousemove', () => setActive(+el.dataset.i));
      el.addEventListener('click', () => go(items[+el.dataset.i]));
    });
  }

  function coinItem(c) {
    return { type: 'coin', base: c.base, sub: '$' + fmt(c.price), href: 'coin.html?c=' + c.base };
  }
  function fmt(p) { return p >= 1 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : (p || 0).toPrecision(4); }

  function setActive(i) {
    active = i;
    results.querySelectorAll('.cmd-item').forEach((el) => el.classList.toggle('active', +el.dataset.i === i));
  }
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(items.length - 1, active + 1)); scroll(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); scroll(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) go(items[active]); }
    else if (e.key === 'Escape') close();
  }
  function scroll() {
    const el = results.querySelector('.cmd-item.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function go(it) { if (it && it.href) window.location.href = it.href; }

  // phím tắt toàn cục
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    else if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); open(); }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-cmd-open]')) { e.preventDefault(); open(); } });

  window.VdearCommand = { open, close };
})();

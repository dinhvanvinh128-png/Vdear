/*
 * Vdear — Custom ticker bar (không dùng widget TradingView)
 * Nền đen, cao 50px, coin chạy ngang liên tục, logo + giá + % xanh/đỏ.
 * Cuộn bằng CSS transform + requestAnimationFrame để mượt và không "màn hình đen".
 */
(function () {
  const CFG = window.VDEAR_CONFIG;
  const API = window.VdearAPI;

  function fmtPrice(p) {
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(3);
    if (p >= 0.01) return p.toFixed(5);
    return p.toPrecision(4);
  }

  function buildItem(coin) {
    const up = coin.change >= 0;
    const el = document.createElement('a');
    el.className = 'tk-item';
    el.href = 'coin.html?c=' + encodeURIComponent(coin.base);
    el.innerHTML =
      `<img class="tk-logo" alt="">` +
      `<span class="tk-sym">${coin.base}</span>` +
      `<span class="tk-price">$${fmtPrice(coin.price)}</span>` +
      `<span class="tk-chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(coin.change).toFixed(2)}%</span>`;
    API.applyLogo(el.querySelector('.tk-logo'), coin.base);
    return el;
  }

  async function initTicker(mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    let coins;
    try {
      const market = await API.getMarket();
      coins = market.slice(0, CFG.scan.tickerCount);
    } catch (e) {
      mount.innerHTML = '<div class="tk-fallback">Đang kết nối dữ liệu thị trường…</div>';
      return;
    }
    if (!coins.length) return;

    const track = document.createElement('div');
    track.className = 'tk-track';
    // Nhân đôi danh sách để cuộn vô tận liền mạch.
    const items = coins.map(buildItem);
    items.forEach((it) => track.appendChild(it));
    items.forEach((it) => track.appendChild(it.cloneNode(true)));
    // gắn lại logo cho bản clone
    track.querySelectorAll('.tk-item').forEach((node) => {
      const sym = node.querySelector('.tk-sym').textContent;
      API.applyLogo(node.querySelector('.tk-logo'), sym);
    });

    mount.innerHTML = '';
    mount.appendChild(track);

    // Animation cuộn: tốc độ ~60px/s, dừng khi hover.
    let x = 0, paused = false, last = performance.now();
    const speed = 60; // px/giây — "tốc độ chạy" giống ảnh
    const halfWidth = () => track.scrollWidth / 2;
    mount.addEventListener('mouseenter', () => (paused = true));
    mount.addEventListener('mouseleave', () => (paused = false));

    function step(now) {
      const dt = (now - last) / 1000; last = now;
      if (!paused) {
        x -= speed * dt;
        if (Math.abs(x) >= halfWidth()) x += halfWidth();
        track.style.transform = `translate3d(${x}px,0,0)`;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    // Cập nhật giá mỗi 15s (không dựng lại DOM để tránh giật).
    setInterval(async () => {
      try {
        const market = await API.getMarket(true);
        const map = {};
        market.forEach((c) => (map[c.base] = c));
        track.querySelectorAll('.tk-item').forEach((node) => {
          const sym = node.querySelector('.tk-sym').textContent;
          const c = map[sym];
          if (!c) return;
          const up = c.change >= 0;
          node.querySelector('.tk-price').textContent = '$' + fmtPrice(c.price);
          const chg = node.querySelector('.tk-chg');
          chg.textContent = (up ? '▲ ' : '▼ ') + Math.abs(c.change).toFixed(2) + '%';
          chg.className = 'tk-chg ' + (up ? 'up' : 'down');
        });
      } catch (e) { /* giữ nguyên hiển thị cũ */ }
    }, 15000);
  }

  window.VdearTicker = { initTicker };
})();

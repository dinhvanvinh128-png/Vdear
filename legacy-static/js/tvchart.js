/*
 * Vdear — Biểu đồ TradingView (Advanced Chart widget)
 *
 * Nhúng biểu đồ gốc của TradingView cho trang coin. Đây là script CỦA BÊN THỨ
 * BA: trình duyệt người xem sẽ kết nối tới tradingview.com. Vì vậy nó chỉ được
 * nạp khi người dùng thật sự xem chế độ TradingView, không nạp sẵn lúc mở
 * trang, và trang Chính sách bảo mật có nói rõ điều này.
 *
 * Nếu script bị chặn (mạng công ty, chặn quảng cáo, offline) thì module tự báo
 * hỏng để trang quay về biểu đồ tự vẽ, chứ không để lại một ô trống.
 */
(function () {
  const SRC = 'https://s3.tradingview.com/tv.js';
  const READY_MS = 9000; // chờ iframe hiện ra trước khi coi là hỏng

  // Sàn của ta -> tiền tố sàn trên TradingView. Hậu tố .P là hợp đồng vĩnh cửu
  // (perpetual), đúng thị trường mà cả site đang hiển thị.
  const VENUE = { binance: 'BINANCE', bybit: 'BYBIT', okx: 'OKX', bitget: 'BITGET' };
  const VENUE_LABEL = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', bitget: 'Bitget' };

  // Khung của ta -> mã interval của TradingView.
  const INTERVAL = {
    '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240',
    '10h': '720', '12h': '720', '1d': 'D', '1w': 'W', '1M': 'M',
  };

  function tvSymbol(base, venue) {
    const ex = VENUE[venue] || 'BINANCE';
    return ex + ':' + String(base).toUpperCase() + 'USDT.P';
  }
  function tvInterval(tf) { return INTERVAL[tf] || '240'; }
  function isLight() { return document.documentElement.getAttribute('data-theme') === 'light'; }

  let scriptPromise = null;
  function loadScript() {
    if (window.TradingView && window.TradingView.widget) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = SRC; el.async = true;
      el.onload = () => (window.TradingView && window.TradingView.widget
        ? resolve() : reject(new Error('tv.js loaded but no widget')));
      el.onerror = () => reject(new Error('tv.js blocked'));
      document.head.appendChild(el);
    });
    // Hỏng thì cho phép thử lại ở lần bật chế độ sau.
    scriptPromise.catch(() => { scriptPromise = null; });
    return scriptPromise;
  }

  function create(containerId, opts) {
    const host = document.getElementById(containerId);
    if (!host) return Promise.reject(new Error('no container'));
    host.innerHTML = '';
    return loadScript().then(() => {
      /* global TradingView */
      new TradingView.widget({
        container_id: containerId,
        autosize: true,
        symbol: tvSymbol(opts.base, opts.venue),
        interval: tvInterval(opts.tf),
        timezone: 'Asia/Ho_Chi_Minh',
        locale: 'vi_VN',
        theme: isLight() ? 'light' : 'dark',
        style: '1',                 // nến Nhật
        withdateranges: true,
        allow_symbol_change: false, // đổi coin đi qua thanh tìm kiếm của site
        save_image: false,
        details: false,
        studies: ['RSI@tv-basicstudies'],
        // Khớp nền của widget với nền panel để không có một khối xám lạc lõng.
        backgroundColor: isLight() ? '#F6F4EC' : '#12100A',
        gridColor: isLight() ? 'rgba(60,48,18,0.10)' : 'rgba(216,163,43,0.07)',
      });
      // Widget dựng iframe bên trong. Không có iframe sau READY_MS nghĩa là bị
      // chặn ở tầng khác (CSP, extension) -> báo hỏng để trang có đường lui.
      return new Promise((resolve, reject) => {
        const t0 = Date.now();
        (function poll() {
          if (host.querySelector('iframe')) return resolve();
          if (Date.now() - t0 > READY_MS) return reject(new Error('tv iframe never appeared'));
          setTimeout(poll, 250);
        })();
      });
    });
  }

  window.VdearTV = { create, tvSymbol, tvInterval, VENUE, VENUE_LABEL };
})();

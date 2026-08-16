/*
 * Vdear — Global configuration
 * Danh sách sàn, danh mục coin (sector), tradfi và các tham số hiển thị.
 */
window.VDEAR_CONFIG = {
  brand: {
    name: 'Vdear',
    tagline: 'Crypto Intelligence Terminal',
  },

  // Public REST endpoints — tất cả đều hỗ trợ CORS gọi trực tiếp từ trình duyệt.
  exchanges: {
    binance: {
      label: 'Binance',
      color: '#F0B90B',
      ticker24h: 'https://api.binance.com/api/v3/ticker/24hr',
      klines: 'https://api.binance.com/api/v3/klines', // ?symbol=BTCUSDT&interval=4h&limit=200
    },
    bybit: {
      label: 'Bybit',
      color: '#F7A600',
      tickers: 'https://api.bybit.com/v5/market/tickers?category=spot',
    },
    okx: {
      label: 'OKX',
      color: '#20C997',
      tickers: 'https://www.okx.com/api/v5/market/tickers?instType=SPOT',
    },
    bitget: {
      label: 'Bitget',
      color: '#00E0C7',
      tickers: 'https://api.bitget.com/api/v2/spot/market/tickers',
    },
  },

  // Binance kline intervals theo yêu cầu (5m → 1M). "rate" = trọng số ưu tiên
  // khung có khả năng cho tín hiệu đảo chiều mạnh (khung lớn được ưu tiên hơn).
  timeframes: [
    { id: '5m', label: '5 phút', binance: '5m', weight: 0.4 },
    { id: '15m', label: '15 phút', binance: '15m', weight: 0.6 },
    { id: '30m', label: '30 phút', binance: '30m', weight: 0.75 },
    { id: '1h', label: '1 giờ', binance: '1h', weight: 1.0 },
    { id: '2h', label: '2 giờ', binance: '2h', weight: 1.2 },
    { id: '4h', label: '4 giờ', binance: '4h', weight: 1.5 },
    { id: '10h', label: '10 giờ', binance: '12h', weight: 1.7, note: 'gần 10h' },
    { id: '12h', label: '12 giờ', binance: '12h', weight: 1.8 },
    { id: '1d', label: '1 ngày', binance: '1d', weight: 2.0 },
    { id: '1w', label: '1 tuần', binance: '1w', weight: 2.4 },
    { id: '1M', label: '1 tháng', binance: '1M', weight: 2.8 },
  ],

  defaultTimeframe: '4h',
  scanTimeframe: '4h', // Khung quét gợi ý Long/Short khi mới vào trang

  // Phân loại các mảng coin (sector)
  sectors: [
    { id: 'all', label: 'Tất cả', icon: '🌐' },
    { id: 'l1', label: 'Layer 1', icon: '⛓️', coins: ['BTC','ETH','SOL','BNB','ADA','AVAX','DOT','NEAR','APT','SUI','TON','TRX','ATOM','ICP','SEI'] },
    { id: 'l2', label: 'Layer 2', icon: '🧩', coins: ['ARB','OP','MATIC','STRK','ZK','MANTA','METIS','IMX'] },
    { id: 'defi', label: 'DeFi', icon: '🏦', coins: ['UNI','AAVE','MKR','LDO','CRV','SNX','COMP','PENDLE','DYDX','GMX','CAKE'] },
    { id: 'meme', label: 'Meme', icon: '🐶', coins: ['DOGE','SHIB','PEPE','WIF','BONK','FLOKI','BOME','MEME','ORDI'] },
    { id: 'ai', label: 'AI & Data', icon: '🤖', coins: ['FET','RENDER','TAO','WLD','AGIX','OCEAN','GRT','AKT','ARKM'] },
    { id: 'gaming', label: 'Gaming', icon: '🎮', coins: ['AXS','SAND','MANA','GALA','IMX','APE','PIXEL','GMT','MAGIC'] },
    { id: 'exchange', label: 'Sàn (CEX)', icon: '💠', coins: ['BNB','OKB','CRO','KCS','GT','MX'] },
    { id: 'payments', label: 'Thanh toán', icon: '💸', coins: ['XRP','LTC','BCH','XLM','TRX','ALGO'] },
    { id: 'rwa', label: 'RWA', icon: '🏛️', coins: ['ONDO','POLYX','OM','PENDLE'] },
    { id: 'privacy', label: 'Privacy', icon: '🕶️', coins: ['XMR','ZEC','DASH','SCRT'] },
  ],

  // TradFi — vàng, bạc, dầu WTI, dầu Brent. Không niêm yết trên sàn crypto nên
  // được lấy từ nguồn miễn phí (best-effort) + fallback mô phỏng có nhãn rõ ràng.
  tradfi: [
    { symbol: 'XAU', label: 'Vàng (Gold)', unit: 'USD/oz', icon: '🥇', base: 2380 },
    { symbol: 'XAG', label: 'Bạc (Silver)', unit: 'USD/oz', icon: '🥈', base: 30.2 },
    { symbol: 'CL', label: 'Dầu WTI', unit: 'USD/bbl', icon: '🛢️', base: 78.5 },
    { symbol: 'BZ', label: 'Dầu Brent', unit: 'USD/bbl', icon: '🛢️', base: 82.3 },
  ],

  // Số coin quét & hiển thị
  scan: {
    universeSize: 80,     // top coin theo volume để quét
    concurrency: 6,       // số request klines song song
    klineLimit: 120,      // số nến để tính chỉ báo
    initialShow: 12,      // hiển thị ban đầu, còn lại ẩn sau "Xem thêm"
    targetSignals: 30,    // mục tiêu ~30 coin gợi ý
    moversShow: 15,       // số coin ở bảng biến động
    tickerCount: 28,      // số coin chạy trên thanh ticker
  },

  // Ngưỡng RSI
  rsi: {
    period: 14,
    overbought: 70,
    overboughtStrong: 80,
    oversold: 30,
    oversoldStrong: 20,
  },

  // Nguồn logo coin (raw github), fallback = avatar chữ tự sinh
  logoBase: 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/',

  // Coin ổn định để loại khỏi bảng biến động
  stableCoins: ['USDT','USDC','FDUSD','TUSD','DAI','BUSD','USDP','USDD','PYUSD','EURT','EUR','USTC'],
};

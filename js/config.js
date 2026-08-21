/*
 * Vdear — Global configuration
 * Danh sách sàn, danh mục coin (sector), tradfi và các tham số hiển thị.
 */
window.VDEAR_CONFIG = {
  brand: {
    name: 'Vdear',
    tagline: 'Crypto Intelligence Terminal',
  },

  // Chế độ FUTURES (perpetual, USDT-margined). Tất cả endpoint đều hỗ trợ CORS.
  market: 'futures',
  exchanges: {
    binance: {
      label: 'Binance',
      color: '#F0B90B',
      // Binance USDⓈ-M Futures
      ticker24h: 'https://fapi.binance.com/fapi/v1/ticker/24hr',
      klines: 'https://fapi.binance.com/fapi/v1/klines', // ?symbol=BTCUSDT&interval=4h&limit=200
    },
    bybit: {
      label: 'Bybit',
      color: '#F7A600',
      tickers: 'https://api.bybit.com/v5/market/tickers?category=linear',
    },
    okx: {
      label: 'OKX',
      color: '#20C997',
      tickers: 'https://www.okx.com/api/v5/market/tickers?instType=SWAP',
    },
    bitget: {
      label: 'Bitget',
      color: '#00E0C7',
      tickers: 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES',
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
    { symbol: 'XAU', label: 'Vàng (Gold)', unit: 'USD/oz', icon: '🥇', base: 2380,
      logo: 'https://s3-symbol-logo.tradingview.com/metal/gold.svg' },
    { symbol: 'XAG', label: 'Bạc (Silver)', unit: 'USD/oz', icon: '🥈', base: 30.2,
      logo: 'https://s3-symbol-logo.tradingview.com/metal/silver.svg' },
    { symbol: 'CL', label: 'Dầu WTI', unit: 'USD/bbl', icon: '🛢️', base: 78.5,
      logo: 'https://s3-symbol-logo.tradingview.com/crude-oil.svg' },
    { symbol: 'BZ', label: 'Dầu Brent', unit: 'USD/bbl', icon: '🛢️', base: 82.3,
      logo: 'https://s3-symbol-logo.tradingview.com/crude-oil.svg' },
  ],

  // Số coin quét & hiển thị
  scan: {
    universeSize: 'all',  // 'all' = quét TOÀN BỘ coin futures; hoặc đặt 1 số để giới hạn
    maxUniverse: 600,      // trần an toàn (tránh quá tải nếu sàn trả quá nhiều symbol)
    concurrency: 10,       // số request klines song song
    klineLimit: 120,       // số nến để tính chỉ báo
    initialShow: 4,        // chỉ hiện 4 tín hiệu, còn lại ẩn sau "Xem thêm"
    targetSignals: 30,     // mục tiêu ~30 coin gợi ý
    volIconTop: 15,        // 15 coin volume cao nhất được gắn icon 🔥
    moversPageSize: 16,    // số coin mỗi trang ở bảng biến động (phân trang)
    tickerCount: 28,       // số coin chạy trên thanh ticker
  },

  // Chiến lược "thực chiến" (mô phỏng theo backtest confluence):
  // RSI H4 đảo chiều -> hướng; hợp tụ S&R + xác nhận Price Action -> vào lệnh.
  strategy: {
    confirmTfs: ['4h', '1h', '15m'], // khung xác nhận S&R + PA
    rsiTf: '4h',                     // khung RSI xác định hướng
    swingWindow: 5,                  // cửa sổ tìm swing high/low
    srTolerance: 0.006,              // % coi là "chạm" vùng S&R
    rsiLookback: 5,                  // số nến nhìn lại để bắt đảo chiều RSI
    minSRMatch: 2,                   // tối thiểu số khung khớp S&R
    minPAMatch: 1,                   // tối thiểu số khung xác nhận PA
    // Xác nhận BREAKOUT: chỉ vào lệnh khi nến đóng cửa vượt hẳn vùng vài nến gần
    // nhất theo hướng lệnh (LONG phá lên / SHORT phá xuống) -> lọc tín hiệu giả.
    breakout: { enabled: true, lookback: 3 },
  },

  // Quản lý vốn (giống hệt backtest): TP +100% margin, DCA khi -50%, sau DCA SL/TP mới.
  money: {
    leverage: 20,         // đòn bẩy mặc định = x20 cho mọi coin
    minLeverage: 1,
    maxLeverage: 100,
    tpMarginPct: 100,     // TP gốc = +100% margin
    dcaTriggerPct: 50,    // DCA khi lỗ -50% margin
    postDcaSlPct: 50,     // sau DCA: SL -50% trên tổng vốn
    postDcaTpPct: 100,    // sau DCA: TP +100% trên tổng vốn
    takerFeePct: 0.05,    // phí taker mỗi chiều
    forwardScan: 1000,    // số nến quét tới khi mô phỏng 1 lệnh (giống backtest)
    // cố định đề xuất ở x20 (mọi coin x20)
    leverageSamples: [20],
  },

  // Trang coin tải nhiều nến hơn để mô phỏng backtest có đủ mẫu.
  coinKlineLimit: 400,

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

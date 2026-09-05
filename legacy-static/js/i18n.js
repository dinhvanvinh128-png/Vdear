/*
 * Vdear — hai ngôn ngữ: Tiếng Việt (mặc định) và English.
 *
 * Tiếng Việt là bản GỐC. Mọi chuỗi mới viết tiếng Việt trước rồi mới dịch, vì
 * đây là trang của người Việt; tiếng Anh là bản thêm vào chứ không phải bản
 * chuẩn. Thiếu bản dịch thì rơi về tiếng Việt chứ KHÔNG hiện mã khoá — người
 * đọc thấy một câu tiếng Việt lạc lõng còn hơn thấy "home.sentiment.title".
 *
 * Cách dùng trong HTML (dịch ngay lúc tải, không chờ module nào khác):
 *   <h2 data-i18n="home.sentiment.title">Tâm lý thị trường…</h2>
 *   <p  data-i18n-html="home.movers.hint">… có thẻ <b> bên trong …</p>
 *   <input data-i18n-attr="placeholder:home.movers.search">
 * Chữ tiếng Việt vẫn nằm nguyên trong HTML: đó là nội dung thật để máy tìm
 * kiếm đọc được, và là bản dự phòng nếu tệp này không tải được.
 *
 * Cách dùng trong JS:
 *   const t = window.VdearI18n.t;  t('scan.status.scanning')
 * Module nào vẽ lại theo dữ liệu thì nghe sự kiện 'vdear:langchange' để vẽ lại.
 */
(function () {
  var KEY = 'vdear_lang';
  var DEFAULT = 'vi';
  var SUPPORTED = ['vi', 'en'];

  /* --------------------------- từ điển -------------------------------- */
  // Chỉ chứa bản dịch tiếng Anh. Tiếng Việt lấy thẳng từ HTML (data-i18n giữ
  // nguyên chữ có sẵn) hoặc từ bảng VI bên dưới cho các chuỗi sinh trong JS.
  var VI = {
    /* thanh trên + điều hướng */
    'nav.open': 'Mở menu',
    'nav.close': 'Đóng menu',
    'nav.search': '🔍 Tìm nhanh',
    'nav.theme': 'Đổi nền',
    'nav.lang': 'Ngôn ngữ',
    'nav.login': 'Đăng nhập',
    'nav.logout': 'Đăng xuất',
    'nav.realtime': 'Realtime',
    'nav.ticker': 'Bảng giá chạy',

    /* trạng thái chung */
    'st.loading': 'Đang tải…',
    'st.calculating': 'đang tính…',
    'st.scanning': 'Đang quét…',
    'st.rescan': '↻ Quét lại',
    'st.rescanTitle': 'Quét lại',
    'st.none': '—',
    'st.error': 'Không tải được dữ liệu',
    'st.retry': 'Thử lại',
    'st.more': '▼ Xem thêm',
    'st.less': '▲ Thu gọn',
    'st.empty': 'Không có dữ liệu',

    /* tâm lý thị trường */
    'sent.long': 'Nghiêng LONG',
    'sent.short': 'Nghiêng SHORT',
    'sent.neutral': 'Trung tính',

    /* bảng biến động */
    'movers.searchPlaceholder': 'Tìm coin (VD: BTC, SOL…)',
    'movers.clear': 'Xoá',
    'movers.favTitle': 'Chỉ hiện coin đã đánh dấu sao',
    'movers.noMatch': 'Không có coin nào khớp.',
    'movers.noFav': 'Chưa có coin nào trong Yêu thích.',
    'movers.prev': 'Trước',
    'movers.next': 'Sau',

    /* tín hiệu */
    'sig.long': 'LONG',
    'sig.short': 'SHORT',
    'sig.neutral': 'Trung tính',
    'sig.confluence': 'Hội tụ',
    'sig.confirmed': '✓ Confirmed',
    'sig.unconfirmed': 'Chưa xác nhận',
    'sig.notEnough': 'chưa đủ nến {tf}',
    'sig.noSignal': 'chưa tính được tín hiệu',

    /* ngày giờ */

    /* chuỗi sinh trong JS — đây là BẢN GỐC của chúng */
    'ticker.connecting': 'Đang kết nối dữ liệu thị trường…',
    'theme.toDark': 'Chuyển nền tối',
    'theme.toLight': 'Chuyển nền sáng',

    'cmd.markets': 'Thị trường',
    'cmd.home': 'Trang chủ',
    'cmd.analysis': 'Phân tích',
    'cmd.placeholder': 'Tìm coin hoặc trang… (vd BTC, SOL)',
    'cmd.empty': 'Không tìm thấy. Thử mã khác…',
    'cmd.results': 'Kết quả',

    'scan.confluence': 'HỘI TỤ ✓',
    'scan.oversoldHard': 'QUÁ BÁN MẠNH',
    'scan.overboughtHard': 'QUÁ MUA MẠNH',
    'scan.oversold': 'QUÁ BÁN',
    'scan.overbought': 'QUÁ MUA',
    'scan.moreN': '▼ Xem thêm ({n})',
    'scan.loadFailed': 'Không tải được dữ liệu thị trường. Kiểm tra kết nối mạng và thử lại.',

    'vol.veryHigh': 'Volume rất cao',
    'vol.high': 'Volume cao',
    'vol.decent': 'Volume khá',

    'movers.favStar': 'Yêu thích',
    'movers.noFavMatch': 'Chưa có coin yêu thích nào khớp. Bấm ⭐ ở cột đầu để thêm.',
    'movers.noneInGroup': 'Không có coin trong nhóm này.',
    'movers.count': '{n} coin',

    'sent.greed': 'Tham lam · thiên LONG',
    'sent.fear': 'Sợ hãi · thiên SHORT',

    'radar.bullish': 'Bullish',
    'radar.bearish': 'Bearish',
    'radar.neutral': 'Trung tính',

    'sector.all': 'Tất cả',
    'sector.exchange': 'Sàn (CEX)',
    'sector.payments': 'Thanh toán',

    'tf.5m': '5 phút', 'tf.15m': '15 phút', 'tf.30m': '30 phút',
    'tf.1h': '1 giờ', 'tf.2h': '2 giờ', 'tf.4h': '4 giờ', 'tf.10h': '10 giờ',
    'tf.12h': '12 giờ', 'tf.1d': '1 ngày', 'tf.1w': '1 tuần', 'tf.1M': '1 tháng',

    'st.calculatingCap': 'Đang tính…',
    'scan.done': 'Đã quét · {n} tín hiệu',

    'etf.short': 'Nguồn ghi {said} quỹ nhưng chỉ trả về chi tiết của {got}.',
    'etf.perFund': '{sym} · dòng tiền từng quỹ',
    'etf.onDate': 'ngày {d}',
    'etf.notConfigured': 'Dòng tiền ETF <b>chưa cấu hình nguồn</b>. Số này chỉ nhà cung cấp có API mới công bố; cần đặt <code>SOSOVALUE_API_KEY</code> ở biến môi trường phía server. Chừng nào chưa có, ở đây để trống — trang này không ước lượng dòng tiền.',
    'etf.emptyResponse': 'Đã cấu hình <code>SOSOVALUE_API_KEY</code> nhưng lần gọi này nguồn không trả về tài sản nào.',
    'etf.reason': 'Lý do: {why}.',
    'etf.blankIfNoReal': 'Không có số thật thì để trống.',
    'etf.missedThisCall': 'Lần gọi này không lấy được',
    'etf.notPublished': 'Nguồn không công bố',
    'etf.fundCount': '×{n} quỹ',
    'etf.th.asset': 'Tài sản',
    'etf.th.netFlow': 'Dòng tiền ròng ngày',
    'etf.th.netAssets': 'Tài sản ròng',
    'etf.th.traded': 'GT giao dịch',
    'etf.th.topFunds': 'Quỹ đóng góp nhiều nhất',
    'etf.th.date': 'Ngày',
    'etf.summary': 'Số liệu ngày <b>{date}</b> · {got}/{total} tài sản đã lấy được dữ liệu',
    'etf.errCount': ' · {n} lỗi',
    'etf.sameValue': '<b>⚠ Mọi tài sản đang ra cùng một con số.</b> Gần như chắc chắn nguồn không dùng tham số phân biệt tài sản, nên trả cùng một bản ghi cho mọi lần gọi. <b>Đừng tin bảng này</b> cho tới khi sửa xong — gọi <code>/api/etf-flow?diag=1</code> để xem nguồn thực sự trả gì.',
    'etf.mixedDates': '<b>⚠ Có dòng lệch ngày</b> — nguồn chưa chốt xong ngày này cho tài sản đó; dòng lệch được đánh dấu ⚠ ở cột ngày. Đừng cộng cả bảng lại thành một con số.',
    'etf.outside': '<b>Nguồn không công bố</b> ETF của {list} — đó là giới hạn của nguồn, không phải đang chờ dữ liệu.',
    'etf.loadingQuotes': 'Đang tải báo giá ETF…',
    'etf.quotesFailed': 'Không lấy được báo giá ETF. Trang này không hiển thị số liệu ước lượng.',

    /* ngày giờ */
    'time.justNow': 'vừa xong',
    'time.minAgo': '{n} phút trước',
    'time.hourAgo': '{n} giờ trước',
  };

  var EN = {
    /* top bar + navigation */
    'nav.open': 'Open menu',
    'nav.close': 'Close menu',
    'nav.search': '🔍 Quick search',
    'nav.theme': 'Toggle theme',
    'nav.lang': 'Language',
    'nav.login': 'Sign in',
    'nav.logout': 'Sign out',
    'nav.realtime': 'Realtime',
    'nav.ticker': 'Live price ticker',
    'nav.markets': 'Markets',
    'nav.bubbles': 'Market bubbles',
    'nav.etf': 'ETF flows',
    'nav.coin': 'Coin analysis',
    'nav.about': 'About',
    'nav.legal': 'Legal',
    'nav.terms': 'Terms',
    'nav.privacy': 'Privacy',
    'nav.risk': 'Risk disclosure',
    'nav.contact': 'Contact',
    'nav.product': 'Product',
    'nav.menuLabel': 'Main menu',
    'nav.soon': 'soon',
    'nav.foot': 'Data is for reference only, not investment advice.',
    'nav.g.market': 'Markets',
    'nav.g.analysis': 'Analysis',
    'nav.g.derivatives': 'Derivatives',
    'nav.g.yours': 'Yours',
    'nav.g.info': 'Info',
    'nav.g.legal': 'Legal',
    'nav.i.overview': 'Market overview',
    'nav.i.movers': '24h movers',
    'nav.i.etf': 'ETF flows',
    'nav.i.bubbles': 'Market bubbles',
    'nav.i.radar': 'Futures Radar',
    'nav.i.spot': 'Spot Radar',
    'nav.i.sector': 'Sector Rotation',
    'nav.i.coin': 'Coin analysis',
    'nav.i.flow': 'Money flow',
    'nav.i.whale': 'Whale & Exchange Flow',
    'nav.i.onchain': 'On-chain',
    'nav.i.liquidity': 'Liquidity',
    'nav.i.breadth': 'Market breadth',
    'nav.i.oi': 'Open Interest',
    'nav.i.funding': 'Funding',
    'nav.i.liquidation': 'Liquidations',
    'nav.i.ls': 'Long / Short',
    'nav.i.fav': 'Favourite coins',
    'nav.i.about': 'About',
    'nav.i.contact': 'Contact',
    'nav.i.terms': 'Terms of use',
    'nav.i.privacy': 'Privacy policy',
    'nav.i.risk': 'Risk disclosure',

    /* shared states */
    'st.loading': 'Loading…',
    'st.calculating': 'calculating…',
    'st.scanning': 'Scanning…',
    'st.rescan': '↻ Rescan',
    'st.rescanTitle': 'Rescan',
    'st.none': '—',
    'st.error': 'Could not load data',
    'st.retry': 'Retry',
    'st.more': '▼ Show more',
    'st.less': '▲ Show less',
    'st.empty': 'No data',

    /* hero */
    'hero.eyebrow': 'FUTURES INTELLIGENCE · REALTIME',
    // Giữ <em> như bản tiếng Việt: chữ trong <em> được tô vàng, bỏ đi thì tiêu
    // đề tiếng Anh mất hẳn điểm nhấn mà bản tiếng Việt có.
    'hero.h1': '<em>Futures</em> signal radar<br>for crypto traders',
    'hero.h1.em': 'Futures',
    'hero.sub': 'Scans every futures market on Binance · Bybit · OKX · Bitget for RSI reversals converging with support/resistance and price action across multiple timeframes.',
    'hero.chip.realtime': 'Realtime, 4 venues',
    'hero.chip.confluence': 'Confluence signals',
    'hero.chip.rsi': 'RSI + Support/Resistance',
    'hero.chip.backtest': 'Backtest on the chart',
    'hero.stat.coins': 'Coins',
    'hero.stat.exchanges': 'Exchanges',
    'hero.stat.timeframes': 'Timeframes',
    'hero.stat.realtime': 'Realtime',
    'hero.stat.data': 'Data',
    'hero.risk.label': 'Risk disclosure',
    'hero.risk.body': '— Not investment advice. Signals are computed from public market data. No signal guarantees a profit.',
    'hero.risk.more': 'Details',
    'hero.risk.full': '⚠ <b>Risk disclosure</b> — Not investment advice. Signals are computed from public market data. No signal guarantees a profit. <a href="risk.html">Details</a>',

    /* signal radar card */
    'radar.kicker': 'Signal Radar',
    'radar.symTitle': 'Change coin — click to search',
    'radar.popLabel': 'Choose a coin',
    'radar.searchPlaceholder': 'Search coin…',
    'radar.searchLabel': 'Search coin',
    'radar.results': 'Results',
    'radar.noMatch': 'No coin matches.',
    'radar.timeframes': 'Timeframe',
    'radar.rsi': 'RSI',
    'radar.support': 'Support',
    'radar.resistance': 'Resistance',
    'radar.priceAction': 'Price action',
    'radar.confluence': 'Confluence',
    'radar.confluenceTitle': 'Conditions confirming together: RSI reversal, near support/resistance, price action in the same direction, breakout, volume',
    'radar.bullish': 'Bullish',
    'radar.bearish': 'Bearish',
    'radar.neutral': 'Neutral',

    /* trading plan */
    'plan.kicker': 'Trading plan',
    'plan.demo': 'derived from the signal · not advice',
    'plan.entry': 'Entry',
    'plan.tp': 'TP',
    'plan.sl': 'SL',
    'plan.rr': 'R:R',

    /* pipeline */
    'flow.label': 'Signal pipeline',
    'flow.rsi': 'RSI reversal',
    'flow.sr': 'Support / Resistance',
    'flow.pa': 'Price action',
    'flow.confluence': 'Confluence',
    'flow.plan': 'Entry / TP / SL',

    /* market sentiment */
    'home.sentiment.title': 'Market sentiment — LONG or SHORT?',
    'home.sentiment.tickLow': '0 · SHORT',
    'home.sentiment.tickHigh': '100 · LONG',
    'sent.long': 'Leaning LONG',
    'sent.short': 'Leaning SHORT',
    'sent.neutral': 'Neutral',

    /* futures radar panel */
    'home.scan.title': '🎯 Futures Radar · Battle-tested signals · 4H',
    'home.scan.tag': 'Confluence',
    'home.scan.hint': 'A <b>battle-tested</b> approach: an H4 RSI reversal (overbought/oversold, then turning back) sets the direction; <b>support/resistance</b> and <b>price action</b> confirm it. Coins reaching <b>confluence ✓</b> (RSI + S&R + PA) are listed first.',

    /* 24h movers */
    'home.movers.title': '📊 24h movers · Volume & Price',
    'home.movers.fav': '⭐ Favourites',
    'home.movers.favTitle': 'Show starred coins only',
    'home.movers.searchPlaceholder': 'Search coin (e.g. BTC, SOL…)',
    'home.movers.clear': 'Clear',
    'home.movers.th.name': 'Name',
    'home.movers.th.price': 'Entry price',
    'home.movers.th.change': '24H %',
    'home.movers.th.vol': 'Volume',
    'home.movers.hint': '🔥 = the 15 highest-volume coins (deeper flame, larger volume). <b>Funding/8h</b>: positive → LONGs pay, negative → SHORTs pay. Click ⭐ to add to Favourites · click a row to open the coin page.',
    'movers.searchPlaceholder': 'Search coin (e.g. BTC, SOL…)',
    'movers.clear': 'Clear',
    'movers.favTitle': 'Show starred coins only',
    'movers.noMatch': 'No coin matches.',
    'movers.noFav': 'No coins in Favourites yet.',
    'movers.prev': 'Prev',
    'movers.next': 'Next',

    /* ETF */
    'home.etf.title': '🏛️ Spot ETF · Fund flows',

    /* signals */
    'sig.long': 'LONG',
    'sig.short': 'SHORT',
    'sig.neutral': 'Neutral',
    'sig.confluence': 'Confluence',
    'sig.confirmed': '✓ Confirmed',
    'sig.unconfirmed': 'Not confirmed',
    'sig.notEnough': 'not enough {tf} candles',
    'sig.noSignal': 'could not compute a signal',

    /* footer */
    'foot.tagline': 'Futures signal radar — scan the whole market, enter with a plan. Data from Binance · Bybit · OKX · Bitget.',
    'foot.product': 'Product',
    'foot.markets': 'Markets',
    'foot.bubbles': 'Market bubbles',
    'foot.etf': 'ETF flows',
    'foot.coin': 'Coin analysis',
    'foot.about': 'About',
    'foot.legal': 'Legal',
    'foot.terms': 'Terms',
    'foot.privacy': 'Privacy',
    'foot.risk': 'Risk disclosure',
    'foot.contact': 'Contact',
    'foot.copy': '© 2026 Vdearypto · Data is for reference only, not investment advice.',

    /* head */
    'meta.title': 'Vdearypto — Crypto Intelligence Terminal',
    'meta.description': 'Futures signal radar — scans the whole market across 4 venues (Binance · Bybit · OKX · Bitget), multi-timeframe RSI + support/resistance, and clear Entry/TP/SL/DCA plans.',

    /* dates */

    /* strings generated in JS */
    'ticker.connecting': 'Connecting to market data…',
    'theme.toDark': 'Switch to dark',
    'theme.toLight': 'Switch to light',

    'cmd.markets': 'Markets',
    'cmd.home': 'Home',
    'cmd.analysis': 'Analysis',
    'cmd.placeholder': 'Search a coin or a page… (e.g. BTC, SOL)',
    'cmd.empty': 'Nothing found. Try another ticker…',
    'cmd.results': 'Results',

    'scan.confluence': 'CONFLUENCE ✓',
    'scan.oversoldHard': 'DEEPLY OVERSOLD',
    'scan.overboughtHard': 'DEEPLY OVERBOUGHT',
    'scan.oversold': 'OVERSOLD',
    'scan.overbought': 'OVERBOUGHT',
    'scan.moreN': '▼ Show more ({n})',
    'scan.loadFailed': 'Could not load market data. Check your connection and try again.',

    'vol.veryHigh': 'Very high volume',
    'vol.high': 'High volume',
    'vol.decent': 'Decent volume',

    'movers.favStar': 'Favourite',
    'movers.noFavMatch': 'No favourite coin matches. Click ⭐ in the first column to add one.',
    'movers.noneInGroup': 'No coins in this group.',
    'movers.count': '{n} coins',

    'sent.greed': 'Greed · leaning LONG',
    'sent.fear': 'Fear · leaning SHORT',

    'sector.all': 'All',
    'sector.exchange': 'Exchange (CEX)',
    'sector.payments': 'Payments',

    'tf.5m': '5 min', 'tf.15m': '15 min', 'tf.30m': '30 min',
    'tf.1h': '1 hour', 'tf.2h': '2 hours', 'tf.4h': '4 hours', 'tf.10h': '10 hours',
    'tf.12h': '12 hours', 'tf.1d': '1 day', 'tf.1w': '1 week', 'tf.1M': '1 month',

    'st.calculatingCap': 'Calculating…',
    'scan.done': 'Scanned · {n} signals',

    'etf.short': 'The source reports {said} funds but returned details for only {got}.',
    'etf.perFund': '{sym} · flows per fund',
    'etf.onDate': 'for {d}',
    'etf.notConfigured': 'ETF flows have <b>no source configured</b>. Only providers with an API publish these numbers; set <code>SOSOVALUE_API_KEY</code> as a server-side environment variable. Until then this stays blank — this page does not estimate flows.',
    'etf.emptyResponse': '<code>SOSOVALUE_API_KEY</code> is configured but the source returned no assets on this call.',
    'etf.reason': 'Reason: {why}.',
    'etf.blankIfNoReal': 'Without real numbers this stays blank.',
    'etf.missedThisCall': 'Not returned on this call',
    'etf.notPublished': 'Source does not publish it',
    'etf.fundCount': '×{n} funds',
    'etf.th.asset': 'Asset',
    'etf.th.netFlow': 'Daily net flow',
    'etf.th.netAssets': 'Net assets',
    'etf.th.traded': 'Traded value',
    'etf.th.topFunds': 'Largest contributing funds',
    'etf.th.date': 'Date',
    'etf.summary': 'Data for <b>{date}</b> · {got}/{total} assets returned data',
    'etf.errCount': ' · {n} errors',
    'etf.sameValue': '<b>⚠ Every asset is returning the same number.</b> Almost certainly the source is ignoring the asset parameter and returning one record for every call. <b>Do not trust this table</b> until that is fixed — call <code>/api/etf-flow?diag=1</code> to see what the source actually returns.',
    'etf.mixedDates': '<b>⚠ Some rows are on a different date</b> — the source has not settled this date for that asset; those rows are marked ⚠ in the date column. Do not add the table up into one number.',
    'etf.outside': '<b>The source does not publish</b> ETFs for {list} — that is a limit of the source, not data still loading.',
    'etf.loadingQuotes': 'Loading ETF quotes…',
    'etf.quotesFailed': 'Could not load ETF quotes. This page does not show estimated figures.',

    /* dates */
    'time.justNow': 'just now',
    'time.minAgo': '{n} min ago',
    'time.hourAgo': '{n} h ago',
  };

  var DICT = { vi: VI, en: EN };

  /* --------------------------- trạng thái ----------------------------- */

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return SUPPORTED.indexOf(v) >= 0 ? v : DEFAULT;
    } catch (e) { return DEFAULT; }
  }

  var lang = read();

  // Bản tiếng Việt trong HTML là bản gốc, nên lần đầu gặp một phần tử ta CHÉP
  // lại nguyên văn của nó. Nhờ vậy đổi sang tiếng Anh rồi quay về tiếng Việt
  // vẫn ra đúng câu ban đầu mà không cần chép câu đó vào từ điển lần nữa.
  var ORIGINAL = new WeakMap();
  function original(el, slot, current) {
    var m = ORIGINAL.get(el);
    if (!m) { m = {}; ORIGINAL.set(el, m); }
    if (!(slot in m)) m[slot] = current;
    return m[slot];
  }

  function fill(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  /* Thiếu bản dịch -> rơi về tiếng Việt -> cuối cùng mới trả chính khoá. */
  function t(key, vars) {
    var d = DICT[lang] || {};
    var s = d[key];
    if (s == null) s = VI[key];
    if (s == null) s = key;
    return fill(s, vars);
  }

  /* --------------------------- dịch DOM ------------------------------- */

  function applyTo(el) {
    var key = el.getAttribute('data-i18n');
    if (key) {
      var base = original(el, 'text', el.textContent);
      el.textContent = lang === DEFAULT ? base : t(key);
    }
    var hkey = el.getAttribute('data-i18n-html');
    if (hkey) {
      var hbase = original(el, 'html', el.innerHTML);
      el.innerHTML = lang === DEFAULT ? hbase : t(hkey);
    }
    var spec = el.getAttribute('data-i18n-attr');
    if (spec) {
      spec.split(';').forEach(function (pair) {
        var i = pair.indexOf(':');
        if (i < 0) return;
        var attr = pair.slice(0, i).trim(), k = pair.slice(i + 1).trim();
        if (!attr || !k) return;
        var abase = original(el, 'attr:' + attr, el.getAttribute(attr) || '');
        el.setAttribute(attr, lang === DEFAULT ? abase : t(k));
      });
    }
  }

  function apply(root) {
    var scope = root || document;
    if (scope.nodeType === 1 && scope.hasAttribute && (
      scope.hasAttribute('data-i18n') || scope.hasAttribute('data-i18n-html') ||
      scope.hasAttribute('data-i18n-attr'))) applyTo(scope);
    var list = scope.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-attr]');
    for (var i = 0; i < list.length; i++) applyTo(list[i]);
  }

  function set(next) {
    if (SUPPORTED.indexOf(next) < 0 || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* chế độ riêng tư */ }
    document.documentElement.setAttribute('lang', lang);
    apply(document);
    syncButtons();
    // Module nào vẽ nội dung theo dữ liệu (bảng, thẻ tín hiệu, chart) thì tự
    // vẽ lại ở đây — dịch DOM sẵn có không với tới thứ chúng sắp vẽ ra.
    window.dispatchEvent(new CustomEvent('vdear:langchange', { detail: { lang: lang } }));
  }

  /* --------------------------- nút đổi -------------------------------- */

  // Nút hiện ngôn ngữ SẼ CHUYỂN SANG chứ không phải ngôn ngữ đang dùng: đang
  // đọc tiếng Việt thì nút ghi "EN". Nhãn ghi ngôn ngữ hiện tại thì người dùng
  // phải đoán bấm vào sẽ ra gì.
  function syncButtons() {
    var next = lang === 'vi' ? 'en' : 'vi';
    var btns = document.querySelectorAll('[data-lang-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = next.toUpperCase();
      btns[i].setAttribute('title', lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt');
      btns[i].setAttribute('aria-label', btns[i].getAttribute('title'));
    }
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-lang-toggle]');
      if (!b) return;
      e.preventDefault();
      set(lang === 'vi' ? 'en' : 'vi');
    });
  }

  function boot() {
    document.documentElement.setAttribute('lang', lang);
    apply(document);
    syncButtons();
  }

  window.VdearI18n = {
    get lang() { return lang; },
    t: t, set: set, apply: apply,
    is: function (l) { return lang === l; },
  };

  bind();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

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

    /* kế hoạch vào lệnh — bản tiếng Việt của các nhãn vốn nằm trong HTML.
       Ảnh chia sẻ vẽ trên canvas nên không đọc được data-i18n, nó gọi t() thẳng;
       thiếu mấy khoá này là ảnh in ra nguyên chữ "plan.entry". */
    'plan.entry': 'Entry',
    'plan.tp': 'TP',
    'plan.sl': 'SL',
    'plan.rr': 'R:R',

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

    /* trang coin — chuỗi sinh trong JS */
    'coin.combat.title': '⚔️ Chiến lược thực chiến',
    'coin.combat.titleTf': '⚔️ Chiến lược thực chiến · {tf}',
    'coin.combat.noSignal': 'CHƯA CÓ TÍN HIỆU',
    'coin.combat.noSignalWhy': 'Khung {tf} chưa xuất hiện đảo chiều RSI rõ ràng. Chờ giá về vùng quá mua/quá bán rồi quay đầu.',
    'coin.refOnly': 'Chỉ tham khảo, không phải lời khuyên đầu tư.',
    'coin.cf.rsi': 'RSI đảo chiều',
    'coin.cf.sr': 'Hợp tụ S&R',
    'coin.cf.pa': 'Price Action',
    'coin.cf.nTf': '{n}/{total} khung',
    'coin.cf.breakout': 'Breakout',
    'coin.cf.confirmed': 'đã xác nhận ✓',
    'coin.cf.notYet': 'chưa',
    'coin.cf.volume': 'Volume giá',
    'coin.cf.surge': 'bùng nổ ✓',
    'coin.cf.weak': 'yếu',
    'coin.lev': 'Đòn bẩy',
    'coin.levBest': 'Đề xuất <b>x{lev}</b> · win cao nhất {win}%',
    'coin.notEnoughSamples': 'chưa đủ mẫu',
    'coin.plan.entry': 'Vào lệnh (Entry)',
    'coin.plan.tp': 'TP chốt lời +100% margin',
    'coin.plan.sl': 'SL cắt lỗ −50% margin',
    'coin.goLong': 'NÊN LONG',
    'coin.goShort': 'NÊN SHORT',
    'coin.goNeutral': 'TRUNG TÍNH',
    'coin.winEstimate': 'Ước tính win-rate {n}%',
    'coin.cta.short': '→ Đang QUÁ MUA nên cân nhắc <b>SHORT</b>',
    'coin.cta.long': '→ Đang QUÁ BÁN nên cân nhắc <b>LONG</b>',
    'coin.sr.support': 'Hỗ trợ',
    'coin.sr.resistance': 'Kháng cự',
    'coin.sr.safety': 'Độ an toàn vào lệnh',
    'coin.sr.th.kind': 'Loại',
    'coin.sr.th.zone': 'Vùng',
    'coin.sr.th.price': 'Giá',
    'coin.sr.th.band': 'Vùng đảo chiều mạnh',
    'coin.sr.th.dist': 'K.cách',
    'coin.sr.th.safe': 'An toàn',
    'coin.sr.current': '◈ Giá hiện tại',
    'coin.sr.rowTitle': 'Bấm để chỉ hiện vùng này trên chart; bấm lại để hiện tất cả',
    'coin.tf.scanning': 'Đang quét các khung thời gian…',
    'coin.chartFailed': 'Không tải được dữ liệu chart cho {base}. Thử lại sau.',

    /* vùng RSI + chart */
    'rsi.obStrong': 'Quá mua MẠNH',
    'rsi.obStrong.note': 'RSI > 80 — tín hiệu quá mua mạnh, khả năng đảo chiều GIẢM cao. Cân nhắc SHORT.',
    'rsi.ob': 'Quá mua',
    'rsi.ob.note': 'RSI 70–80 — vùng quá mua, chú ý khả năng đảo chiều GIẢM. Ưu tiên SHORT.',
    'rsi.osStrong': 'Quá bán MẠNH',
    'rsi.osStrong.note': 'RSI < 20 — tín hiệu quá bán mạnh, khả năng đảo chiều TĂNG cao. Cân nhắc LONG.',
    'rsi.os': 'Quá bán',
    'rsi.os.note': 'RSI 20–30 — vùng quá bán, chú ý khả năng đảo chiều TĂNG. Ưu tiên LONG.',
    'rsi.neutral': 'Trung tính',
    'rsi.neutral.note': 'RSI trung tính (30–70) — chưa có tín hiệu đảo chiều rõ ràng.',
    'rsi.n.osStrong': 'quá bán mạnh (<20)',
    'rsi.n.os': 'quá bán (20–30)',
    'rsi.n.obStrong': 'quá mua mạnh (>80)',
    'rsi.n.ob': 'quá mua (70–80)',
    'chart.aria': 'Biểu đồ nến: đang xem nến {a}–{b} trên {n}, giá từ {lo} đến {hi}',
    'chart.ariaCustomRange': ' (khung giá tự chỉnh)',
    'chart.hint': 'Lăn chuột / chụm 2 ngón để zoom · kéo để di chuyển · nháy đúp để xem toàn bộ',

    /* trang bong bóng — chuỗi sinh trong JS */
    'bub.allN': 'Tất cả {n} coin',
    'bub.range': 'Coin {from}–{to} / {total}',
    'bub.missing': ' · {n} coin thiếu dữ liệu',
    'bub.noData': 'Không có coin nào có đủ dữ liệu cho lựa chọn này',
    'bub.statUp': '{span} · hiện {n} coin tăng',
    'bub.statDown': '{span} · hiện {n} coin giảm',
    'bub.statBoth': '{span} · {up} tăng · {down} giảm',
    'bub.loadingCg': 'Đang tải vốn hoá & biến động đa khung…',
    'bub.loadFailed': 'Không tải được dữ liệu thị trường. Kiểm tra kết nối mạng.',

    /* Open Interest + Long/Short */
    'oi.label': 'Open Interest',
    'oi.short': 'OI',
    'oi.none': 'Nguồn không có dữ liệu OI cho khung này',
    'oi.noSymbol': 'Coin này không có hợp đồng futures trên Binance',
    'oi.delta': 'OI {n}',
    'oi.st.longsIn': 'Tiền mới vào long',
    'oi.st.longsIn.why': 'Giá tăng và OI tăng: vị thế mới đang mở theo chiều lên, xu hướng đang được nuôi bằng tiền mới nên thường khoẻ hơn.',
    'oi.st.shortCover': 'Short cover',
    'oi.st.shortCover.why': 'Giá tăng nhưng OI giảm: phần lớn lực đẩy đến từ short đóng vị thế chứ không phải tiền mới, nên đà tăng thường yếu và dễ hụt hơi.',
    'oi.st.shortsIn': 'Tiền mới vào short',
    'oi.st.shortsIn.why': 'Giá giảm và OI tăng: vị thế mới đang mở theo chiều xuống, áp lực bán đang được nuôi bằng tiền mới.',
    'oi.st.longsOut': 'Long thanh lý',
    'oi.st.longsOut.why': 'Giá giảm và OI giảm: long đang bị đóng/thanh lý. Khi lớp long cuối cùng ra hết, lực bán có thể cạn dần.',
    'oi.st.flat': 'Đi ngang',
    'oi.st.flat.why': 'Cả giá lẫn OI đều đổi dưới {dead}% — quá nhỏ để kết luận hướng, nên không gán trạng thái nào.',
    'oi.tip.head': 'Giá và OI đang nói gì',
    'oi.tip.foot': 'Tính trên khung đang chọn, so với nến liền trước. Không phải khuyến nghị.',
    'ls.label': 'Long / Short',
    'ls.top': 'Vị thế top trader',
    'ls.global': 'Tài khoản toàn thị trường',
    'ls.long': 'Long',
    'ls.short': 'Short',
    'ls.crowd': 'Đám đông đang nghiêng bên nào',
    'ls.leanLong': 'Đám đông nghiêng LONG',
    'ls.leanShort': 'Đám đông nghiêng SHORT',
    'ls.balanced': 'Hai bên gần cân',
    'ls.none': 'Nguồn không có tỉ lệ long/short cho coin này',

    /* nhật ký lệnh */
    'journal.title': '📓 Nhật ký lệnh',
    'journal.title2': 'Nhật ký lệnh',
    'journal.nav': 'Nhật ký lệnh',
    'journal.save': '📓 Ghi vào nhật ký',
    'journal.saved': '✓ Đã ghi vào nhật ký',
    'journal.saveFailed': 'Không ghi được. Thử lại sau.',
    'journal.export': '⇩ Xuất CSV',
    'journal.filterStatus': 'Lọc theo trạng thái',
    'journal.filterCoin': 'Lọc theo coin',
    'journal.allCoins': 'Tất cả coin',
    'journal.f.all': 'Tất cả trạng thái',
    'journal.f.open': 'Đang mở',
    'journal.f.tp': 'Chạm TP',
    'journal.f.sl': 'Chạm SL',
    'journal.f.closed': 'Tự đóng',
    'journal.s.open': 'Đang mở',
    'journal.s.tp': 'Chạm TP',
    'journal.s.sl': 'Chạm SL',
    'journal.s.closed': 'Đã đóng',
    'journal.th.time': 'Thời điểm',
    'journal.th.coin': 'Coin',
    'journal.th.side': 'Hướng',
    'journal.th.entry': 'Entry',
    'journal.th.tp': 'TP',
    'journal.th.sl': 'SL',
    'journal.th.conf': 'Hội tụ',
    'journal.th.status': 'Trạng thái',
    'journal.th.r': 'R',
    'journal.closeBtn': 'Đóng lệnh',
    'journal.delete': 'Xoá lệnh',
    'journal.confirmDelete': 'Xoá lệnh này khỏi nhật ký?',
    'journal.closePrompt': 'Đóng lệnh {coin} (vào ở {entry}) — nhập giá đóng:',
    'journal.notePrompt': 'Ghi chú lý do đóng (để trống cũng được):',
    'journal.badPrice': 'Giá không hợp lệ.',
    'journal.noMatch': 'Không có lệnh nào khớp bộ lọc.',
    'journal.emptyAll': 'Chưa có lệnh nào. Bấm "Ghi vào nhật ký" ở một kế hoạch vào lệnh để bắt đầu.',
    'journal.stats.title': '📈 Thống kê cá nhân',
    'journal.st.total': 'Tổng lệnh',
    'journal.st.open': 'Đang mở',
    'journal.st.closed': 'Đã đóng',
    'journal.st.winRate': 'Winrate',
    'journal.st.totalR': 'Tổng R',
    'journal.st.avgR': 'R trung bình',
    'journal.st.avgRR': 'R:R kế hoạch',
    'journal.st.bestStreak': 'Chuỗi thắng dài nhất',
    'journal.st.worstStreak': 'Chuỗi thua dài nhất',
    'journal.curve.title': 'Đường vốn theo R',
    'journal.curve.aria': 'Đường vốn cộng dồn theo R',
    'journal.curve.note': 'Cộng dồn R của các lệnh đã đóng, theo thứ tự đóng lệnh.',
    'journal.curve.empty': 'Chưa có lệnh nào đóng để vẽ đường vốn.',
    'journal.dim.title': '🔍 Phân tích theo chiều',
    'journal.dim.coin': 'Theo coin',
    'journal.dim.side': 'Theo hướng lệnh',
    'journal.dim.hour': 'Theo giờ vào lệnh',
    'journal.dim.conf': 'Theo mức hội tụ lúc vào',
    'journal.dim.group': 'Nhóm',
    'journal.dim.n': 'Số lệnh',
    'journal.dim.win': 'Winrate',
    'journal.dim.avgR': 'R t.bình',
    'journal.dim.empty': 'Chưa đủ lệnh đã đóng để chia nhóm.',
    'journal.dim.thin': 'ít mẫu',
    'journal.conf.low': 'Thấp (0–1)',
    'journal.conf.mid': 'Vừa (2–3)',
    'journal.conf.high': 'Cao (4–5)',
    'journal.lesson.title': '🧠 Bài học',
    'journal.lesson.needMore': 'Cần ít nhất {need} lệnh thua mới rút ra được điều gì; hiện có {have}. Dưới mức đó thì mọi "quy luật" tìm thấy đều là ngẫu nhiên.',
    'journal.lesson.nothing': 'Chưa thấy yếu tố nào đậm hơn hẳn trong nhóm lệnh thua so với toàn bộ lệnh. Đó là một kết quả tốt: nghĩa là chưa có thói quen xấu nào lặp lại đủ rõ để chỉ ra.',
    'journal.lesson.detail': '{lossPct}% số lệnh thua ({n}/{total}) có đặc điểm này, trong khi nó chỉ chiếm {allPct}% tổng số lệnh đã đóng.',
    'journal.lesson.foot': 'Đây là quan sát trên dữ liệu của chính bạn, không phải quy luật thị trường. Số lệnh còn ít thì đọc cho biết thôi.',
    'journal.lesson.lowConf': 'Vào lệnh khi hội tụ còn thấp (0–1/5)',
    'journal.lesson.noPa': 'Vào lệnh khi price action chưa xác nhận',
    'journal.lesson.long': 'Lệnh LONG',
    'journal.lesson.short': 'Lệnh SHORT',
    'journal.lesson.thinRR': 'Kế hoạch có R:R dưới 1.5',
    'journal.lesson.highLev': 'Đòn bẩy từ x20 trở lên',
    'journal.lesson.rsiMid': 'Vào lệnh khi RSI đang ở vùng giữa (40–60)',
    'journal.intro': 'Mọi thống kê ở đây tính bằng <b>R</b> — bội số rủi ro, tức khoảng cách từ giá vào lệnh tới stop-loss. Lệnh lãi gấp đôi mức rủi ro là <b>+2R</b>, dù bạn vào 10 đô hay 10.000 đô. Cố ý không tính bằng tiền: con số tiền không nói lên chất lượng của quyết định, và một trang toàn số lãi thì thành chỗ khoe.',

    /* ảnh chia sẻ */
    'share.open': '🖼️ Tạo ảnh chia sẻ',
    'share.title': 'Tạo ảnh chia sẻ',
    'share.close': 'Đóng',
    'share.ratio': 'Tỉ lệ',
    'share.portrait': 'Dọc 1080×1920',
    'share.landscape': 'Ngang 1200×630',
    'share.preset': 'Nền',
    'share.preset.night': 'Đêm vàng',
    'share.preset.ink': 'Mực xanh',
    'share.preset.paper': 'Giấy sáng',
    'share.caption': 'Chú thích sinh sẵn',
    'share.copyCaption': 'Chép chú thích',
    'share.download': '⇩ Tải ảnh về',
    'share.copyImage': 'Chép ảnh vào clipboard',
    'share.copied': '✓ Đã chép',
    'share.copyFailed': 'Không chép được',
    'share.copyUnsupported': 'Trình duyệt không hỗ trợ — hãy tải về',
    'share.selectManually': 'Đã bôi đen — nhấn Ctrl+C',
    'share.note': 'Ảnh vẽ ngay trên máy bạn, không gửi gì lên máy chủ. Số liệu là ảnh chụp tại thời điểm bấm nút.',
    'share.tf': 'Khung {tf}',
    'share.price': 'Giá hiện tại',
    'share.rsi': 'RSI',
    'share.conf': 'Hội tụ',
    'share.support': 'Hỗ trợ gần nhất',
    'share.resistance': 'Kháng cự gần nhất',
    'share.disclaimer': 'Dữ liệu tham khảo · không phải lời khuyên đầu tư',
    'share.cap.head': '{coin} · khung {tf} — tín hiệu {side}',
    'share.cap.price': 'Giá hiện tại: {price}',
    'share.cap.rsi': 'RSI {rsi} · hội tụ {conf}',
    'share.cap.sr': 'Hỗ trợ {sup} · kháng cự {res}',
    'share.cap.plan': 'Entry {entry} · TP {tp} · SL {sl}',
    'share.cap.foot': 'Nguồn: vdearypto.vercel.app — dữ liệu tham khảo, không phải lời khuyên đầu tư.',

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
    'nav.backToApp': '← Back to the app',
    'foot.copyShort': '© 2026 Vdearypto. For reference only, not investment advice.',
    'bub.title2': 'Market bubbles',
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
    'home.movers.th.oi': 'OI 24h',
    'home.movers.th.oiTitle': 'Change in Open Interest over 24 hours',
    'home.movers.th.ls': 'L/S',
    'home.movers.th.lsTitle': 'Share of accounts currently long, out of all accounts',
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

    /* coin page */
    'coin.backToMarkets': '← Markets',
    'coin.high24': '24h High',
    'coin.low24': '24h Low',
    'coin.gauge.title': 'Signal score (selected timeframe)',
    'coin.chart.title': 'Chart',
    'coin.chart.resetTitle': 'Reset the chart view',
    'coin.chart.resetLabel': 'Reset chart',
    'coin.menu.reset': 'Reset chart',
    'coin.menu.fit': 'Fit all candles',
    'coin.menu.autoPrice': 'Fit price range',
    'coin.rsiLegend.high': '<i class="sw" style="background:#E0574F"></i> RSI 70–80 overbought · &gt;80 deeply overbought (watch for SHORT)',
    'coin.rsiLegend.low': '<i class="sw" style="background:#4FB477"></i> RSI 20–30 oversold · &lt;20 deeply oversold (watch for LONG)',
    'coin.chart.controls': '<b>Chart controls</b> — <u>Time (horizontal)</u>: scroll to zoom, hold and drag sideways to pan; on a phone pinch horizontally, and drag with one finger to pan (dragging vertically still scrolls the page). <u>Price range (vertical)</u>: <b>drag vertically on the price scale at the right</b> to widen or tighten the range — widening shrinks the candles and gives you the wider picture, exactly like dragging the price axis on TradingView; a vertical pinch does the same. Dragging diagonally inside the chart moves the price range up and down. Double-click the price scale to reset just the range, double-click inside the chart to reset both. Dragging or scrolling in the RSI pane below drives the same time window.',
    'coin.chart.defaultView': 'The chart opens at a <b>comfortable view</b> — only the most recent candles, wide enough that each candle still looks like a candle, anchored to the right edge like every charting app. To get back to that view, <b>right-click inside the chart</b> and choose <i>Reset chart</i>, or press <b>Alt + R</b>; on a phone use the ↺ button next to the heading.',
    'coin.tf.title': '⏱️ Signal by timeframe',
    'coin.tf.note': '⭐ = the timeframe most likely to reverse',
    'coin.sr.title': '🧱 Support & resistance zones',
    'coin.sr.note': 'Click a zone to show only that one on the chart',
    'coin.sr.showAll': 'Show all zones',
    'coin.sr.hint': 'More ★ = a safer zone to enter on. <span class="sr-tag long">LONG</span> at support · <span class="sr-tag short">SHORT</span> at resistance. A price band is a zone where a strong reversal can happen.',

    /* coin page — strings generated in JS */
    'coin.combat.title': '⚔️ Battle-tested strategy',
    'coin.combat.titleTf': '⚔️ Battle-tested strategy · {tf}',
    'coin.combat.noSignal': 'NO SIGNAL YET',
    'coin.combat.noSignalWhy': 'The {tf} timeframe shows no clear RSI reversal yet. Wait for price to reach overbought/oversold and turn back.',
    'coin.refOnly': 'For reference only, not investment advice.',
    'coin.cf.rsi': 'RSI reversal',
    'coin.cf.sr': 'S&R agreement',
    'coin.cf.pa': 'Price Action',
    'coin.cf.nTf': '{n}/{total} timeframes',
    'coin.cf.breakout': 'Breakout',
    'coin.cf.confirmed': 'confirmed ✓',
    'coin.cf.notYet': 'not yet',
    'coin.cf.volume': 'Volume',
    'coin.cf.surge': 'surging ✓',
    'coin.cf.weak': 'weak',
    'coin.lev': 'Leverage',
    'coin.levBest': 'Suggested <b>x{lev}</b> · highest win {win}%',
    'coin.notEnoughSamples': 'not enough samples',
    'coin.plan.entry': 'Entry',
    'coin.plan.tp': 'TP, +100% of margin',
    'coin.plan.sl': 'SL, −50% of margin',
    'coin.goLong': 'FAVOURS LONG',
    'coin.goShort': 'FAVOURS SHORT',
    'coin.goNeutral': 'NEUTRAL',
    'coin.winEstimate': 'Estimated win rate {n}%',
    'coin.cta.short': '→ Currently OVERBOUGHT, consider <b>SHORT</b>',
    'coin.cta.long': '→ Currently OVERSOLD, consider <b>LONG</b>',
    'coin.sr.support': 'Support',
    'coin.sr.resistance': 'Resistance',
    'coin.sr.safety': 'How safe this entry is',
    'coin.sr.th.kind': 'Type',
    'coin.sr.th.zone': 'Zone',
    'coin.sr.th.price': 'Price',
    'coin.sr.th.band': 'Strong reversal band',
    'coin.sr.th.dist': 'Dist.',
    'coin.sr.th.safe': 'Safety',
    'coin.sr.current': '◈ Current price',
    'coin.sr.rowTitle': 'Click to show only this zone on the chart; click again to show all',
    'coin.tf.scanning': 'Scanning the timeframes…',
    'coin.chartFailed': 'Could not load chart data for {base}. Try again later.',

    /* RSI zones + chart */
    'rsi.obStrong': 'DEEPLY overbought',
    'rsi.obStrong.note': 'RSI > 80 — deeply overbought, a DOWNWARD reversal is likely. Consider SHORT.',
    'rsi.ob': 'Overbought',
    'rsi.ob.note': 'RSI 70–80 — overbought territory, watch for a DOWNWARD reversal. SHORT preferred.',
    'rsi.osStrong': 'DEEPLY oversold',
    'rsi.osStrong.note': 'RSI < 20 — deeply oversold, an UPWARD reversal is likely. Consider LONG.',
    'rsi.os': 'Oversold',
    'rsi.os.note': 'RSI 20–30 — oversold territory, watch for an UPWARD reversal. LONG preferred.',
    'rsi.neutral': 'Neutral',
    'rsi.neutral.note': 'RSI is neutral (30–70) — no clear reversal signal yet.',
    'rsi.n.osStrong': 'deeply oversold (<20)',
    'rsi.n.os': 'oversold (20–30)',
    'rsi.n.obStrong': 'deeply overbought (>80)',
    'rsi.n.ob': 'overbought (70–80)',
    'chart.aria': 'Candlestick chart: showing candles {a}–{b} of {n}, price from {lo} to {hi}',
    'chart.ariaCustomRange': ' (custom price range)',
    'chart.hint': 'Scroll / pinch to zoom · drag to pan · double-click to fit everything',

    /* bubbles page */
    'bub.title': '🫧 Market bubbles',
    'bub.back': '← Back to the market table',
    'bub.all': 'All',
    'bub.up': 'Up',
    'bub.down': 'Down',
    'bub.sectorLabel': 'Coin category',
    'bub.perLabel': 'Coins per group',
    'bub.per100': '100 coins/group',
    'bub.per200': '200 coins/group',
    'bub.per500': '500 coins/group',
    'bub.perAll': 'All at once',
    'bub.pageLabel': 'Coin group by volume rank',
    'bub.settings': 'Display options',
    'bub.g.period': 'Timeframe',
    'bub.g.size': 'Bubble size',
    'bub.g.content': 'Text inside the bubble',
    'bub.g.color': 'Bubble colour',
    'bub.p.24h': '24 hours',
    'bub.p.7d': '7 days',
    'bub.p.30d': '30 days',
    'bub.p.1y': '1 year',
    'bub.v.perf': 'Change',
    'bub.v.mcap': 'Market cap',
    'bub.v.vol': '24h volume',
    'bub.v.rank': 'Rank',
    'bub.v.price': 'Price',
    'bub.v.name': 'Coin name only',
    'bub.v.byPerf': 'By change',
    'bub.v.neutral': 'Neutral',
    'bub.canvasLabel': 'Bubble map of 24h change across the crypto market',
    'bub.empty': 'No coin matches this filter.',
    'bub.note': '<b>24 hours</b> comes straight from the 4 venues, so it covers every listed coin. <b>1 hour · 7 days · 30 days · 1 year</b>, along with <b>market cap</b> and <b>rank</b>, come from CoinGecko — that source only covers roughly the 750 largest coins by market cap, so a coin it does not carry is dropped from the view and counted in the status line rather than being given a made-up number. Your choices are remembered for next time.',
    'bub.hint1': 'A <b class="up">green</b> bubble is up, a <b class="down">red</b> one is down over 24h. The bigger the bubble, the bigger the move (or the volume, depending on the mode). Hover to see price &amp; volume · <b>click</b> to open the coin page · <b>drag</b> to fling a bubble. Figures are pooled from Binance · Bybit · OKX · Bitget, stablecoins excluded.',
    'bub.hint2': '<b>Every coin</b> on the venues is here, split into groups ordered by volume: group <b>1–100</b> holds the most heavily traded coins, and later groups get smaller and thinner on liquidity. Group <b>301–400</b> means coins 301 through 400 — exactly 100 coins. To see more on one screen, raise <b>coins/group</b> to 200, 500 or <b>All at once</b>. The more coins, the smaller the bubbles, and name labels hide themselves as space runs out.',
    'bub.hint3': 'The number next to each group is that group\'s average change — one glance tells you which part of the market money is flowing into. Pick a <b>category</b> (Layer 1, Meme, AI…) to group within that sector only.',
    'bub.hint4': 'Size only tells you the <b>magnitude</b> of a move, not its quality: a small-cap that jumps 40% in a day will be the biggest bubble on screen and can still be a thin, slippage-prone market. Switch to <b>Size by volume</b> to see where real money is moving.',

    /* bubbles page — strings generated in JS */
    'bub.allN': 'All {n} coins',
    'bub.range': 'Coins {from}–{to} of {total}',
    'bub.missing': ' · {n} coins missing data',
    'bub.noData': 'No coin has enough data for this selection',
    'bub.statUp': '{span} · showing {n} coins up',
    'bub.statDown': '{span} · showing {n} coins down',
    'bub.statBoth': '{span} · {up} up · {down} down',
    'bub.loadingCg': 'Loading market cap & multi-timeframe changes…',
    'bub.loadFailed': 'Could not load market data. Check your connection.',

    /* Open Interest + Long/Short */
    'oi.label': 'Open Interest',
    'oi.short': 'OI',
    'oi.none': 'The source has no OI data for this timeframe',
    'oi.noSymbol': 'This coin has no futures contract on Binance',
    'oi.delta': 'OI {n}',
    'oi.st.longsIn': 'New longs entering',
    'oi.st.longsIn.why': 'Price up and OI up: new positions are opening on the upside, so the move is being funded by fresh money and tends to be the healthier kind.',
    'oi.st.shortCover': 'Short covering',
    'oi.st.shortCover.why': 'Price up but OI down: most of the push comes from shorts closing rather than new money, so the rally tends to be weaker and runs out of steam more easily.',
    'oi.st.shortsIn': 'New shorts entering',
    'oi.st.shortsIn.why': 'Price down and OI up: new positions are opening on the downside, so selling pressure is being funded by fresh money.',
    'oi.st.longsOut': 'Longs being liquidated',
    'oi.st.longsOut.why': 'Price down and OI down: longs are being closed or liquidated. Once the last layer of longs is out, selling pressure can dry up.',
    'oi.st.flat': 'Flat',
    'oi.st.flat.why': 'Both price and OI moved less than {dead}% — too small to call a direction, so no state is assigned.',
    'oi.tip.head': 'What price and OI are saying',
    'oi.tip.foot': 'Computed on the selected timeframe against the previous candle. Not a recommendation.',
    'ls.label': 'Long / Short',
    'ls.top': 'Top traders\' positions',
    'ls.global': 'All accounts',
    'ls.long': 'Long',
    'ls.short': 'Short',
    'ls.crowd': 'Which way the crowd is leaning',
    'ls.leanLong': 'The crowd leans LONG',
    'ls.leanShort': 'The crowd leans SHORT',
    'ls.balanced': 'Roughly balanced',
    'ls.none': 'The source has no long/short ratio for this coin',

    /* trade journal */
    'journal.title': '📓 Trade journal',
    'journal.title2': 'Trade journal',
    'journal.nav': 'Trade journal',
    'journal.save': '📓 Save to journal',
    'journal.saved': '✓ Saved to journal',
    'journal.saveFailed': 'Could not save. Try again later.',
    'journal.export': '⇩ Export CSV',
    'journal.filterStatus': 'Filter by status',
    'journal.filterCoin': 'Filter by coin',
    'journal.allCoins': 'All coins',
    'journal.f.all': 'All statuses',
    'journal.f.open': 'Open',
    'journal.f.tp': 'Hit TP',
    'journal.f.sl': 'Hit SL',
    'journal.f.closed': 'Closed manually',
    'journal.s.open': 'Open',
    'journal.s.tp': 'Hit TP',
    'journal.s.sl': 'Hit SL',
    'journal.s.closed': 'Closed',
    'journal.th.time': 'Opened',
    'journal.th.coin': 'Coin',
    'journal.th.side': 'Side',
    'journal.th.entry': 'Entry',
    'journal.th.tp': 'TP',
    'journal.th.sl': 'SL',
    'journal.th.conf': 'Confluence',
    'journal.th.status': 'Status',
    'journal.th.r': 'R',
    'journal.closeBtn': 'Close',
    'journal.delete': 'Delete trade',
    'journal.confirmDelete': 'Remove this trade from the journal?',
    'journal.closePrompt': 'Close {coin} (entered at {entry}) — enter the exit price:',
    'journal.notePrompt': 'Note why you closed (optional):',
    'journal.badPrice': 'That price is not valid.',
    'journal.noMatch': 'No trade matches the filter.',
    'journal.emptyAll': 'No trades yet. Hit "Save to journal" on a trading plan to start.',
    'journal.stats.title': '📈 Your statistics',
    'journal.st.total': 'Total trades',
    'journal.st.open': 'Open',
    'journal.st.closed': 'Closed',
    'journal.st.winRate': 'Win rate',
    'journal.st.totalR': 'Total R',
    'journal.st.avgR': 'Average R',
    'journal.st.avgRR': 'Planned R:R',
    'journal.st.bestStreak': 'Longest win streak',
    'journal.st.worstStreak': 'Longest losing streak',
    'journal.curve.title': 'Equity curve in R',
    'journal.curve.aria': 'Cumulative equity curve measured in R',
    'journal.curve.note': 'Cumulative R of closed trades, in the order they were closed.',
    'journal.curve.empty': 'No closed trades yet to draw a curve.',
    'journal.dim.title': '🔍 Breakdown',
    'journal.dim.coin': 'By coin',
    'journal.dim.side': 'By side',
    'journal.dim.hour': 'By hour of entry',
    'journal.dim.conf': 'By confluence at entry',
    'journal.dim.group': 'Group',
    'journal.dim.n': 'Trades',
    'journal.dim.win': 'Win rate',
    'journal.dim.avgR': 'Avg R',
    'journal.dim.empty': 'Not enough closed trades to break down.',
    'journal.dim.thin': 'few',
    'journal.conf.low': 'Low (0–1)',
    'journal.conf.mid': 'Medium (2–3)',
    'journal.conf.high': 'High (4–5)',
    'journal.lesson.title': '🧠 Lessons',
    'journal.lesson.needMore': 'At least {need} losing trades are needed before anything can be read into them; you have {have}. Below that, every "pattern" found is chance.',
    'journal.lesson.nothing': 'No factor stands out in your losing trades compared with all your trades. That is a good result: no bad habit is repeating clearly enough to point at.',
    'journal.lesson.detail': '{lossPct}% of losing trades ({n}/{total}) share this, while it covers only {allPct}% of all closed trades.',
    'journal.lesson.foot': 'These are observations on your own data, not market rules. With few trades, read them lightly.',
    'journal.lesson.lowConf': 'Entering while confluence is still low (0–1/5)',
    'journal.lesson.noPa': 'Entering before price action confirms',
    'journal.lesson.long': 'LONG trades',
    'journal.lesson.short': 'SHORT trades',
    'journal.lesson.thinRR': 'Plans with R:R below 1.5',
    'journal.lesson.highLev': 'Leverage of x20 or more',
    'journal.lesson.rsiMid': 'Entering while RSI sits mid-range (40–60)',
    'journal.intro': 'Every statistic here is measured in <b>R</b> — the risk multiple, meaning the distance from your entry to your stop-loss. A trade that gains twice what it risked is <b>+2R</b>, whether you put in $10 or $10,000. Deliberately not measured in money: the money figure says nothing about the quality of a decision, and a page full of profit numbers becomes a place to show off.',

    /* share image */
    'share.open': '🖼️ Make a share image',
    'share.title': 'Make a share image',
    'share.close': 'Close',
    'share.ratio': 'Ratio',
    'share.portrait': 'Portrait 1080×1920',
    'share.landscape': 'Landscape 1200×630',
    'share.preset': 'Background',
    'share.preset.night': 'Gold night',
    'share.preset.ink': 'Blue ink',
    'share.preset.paper': 'Light paper',
    'share.caption': 'Ready-made caption',
    'share.copyCaption': 'Copy caption',
    'share.download': '⇩ Download image',
    'share.copyImage': 'Copy image to clipboard',
    'share.copied': '✓ Copied',
    'share.copyFailed': 'Could not copy',
    'share.copyUnsupported': 'Browser does not support it — download instead',
    'share.selectManually': 'Selected — press Ctrl+C',
    'share.note': 'The image is drawn on your own device; nothing is sent to a server. The figures are a snapshot from the moment you pressed the button.',
    'share.tf': '{tf} timeframe',
    'share.price': 'Current price',
    'share.rsi': 'RSI',
    'share.conf': 'Confluence',
    'share.support': 'Nearest support',
    'share.resistance': 'Nearest resistance',
    'share.disclaimer': 'Reference data · not investment advice',
    'share.cap.head': '{coin} · {tf} timeframe — {side} signal',
    'share.cap.price': 'Current price: {price}',
    'share.cap.rsi': 'RSI {rsi} · confluence {conf}',
    'share.cap.sr': 'Support {sup} · resistance {res}',
    'share.cap.plan': 'Entry {entry} · TP {tp} · SL {sl}',
    'share.cap.foot': 'Source: vdearypto.vercel.app — reference data, not investment advice.',

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

  // Trang tĩnh (giới thiệu, điều khoản, bảo mật, rủi ro) có hàng nghìn ký tự
  // văn xuôi mà trang chủ không bao giờ dùng tới. Chúng nạp thêm từ điển riêng
  // qua extend() thay vì nhét hết vào tệp này — nếu không thì mỗi lần mở trang
  // chủ đều phải tải kèm toàn bộ điều khoản sử dụng.
  function extend(l, obj) {
    if (!DICT[l]) DICT[l] = {};
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) DICT[l][k] = obj[k];
    if (l === lang || l === DEFAULT) apply(document);
  }

  window.VdearI18n = {
    get lang() { return lang; },
    t: t, set: set, apply: apply, extend: extend,
    is: function (l) { return lang === l; },
  };

  bind();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

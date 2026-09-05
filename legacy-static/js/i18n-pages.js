/*
 * Vdear — bản tiếng Anh cho các trang tĩnh (giới thiệu, liên hệ, 404, rủi ro,
 * bảo mật, điều khoản).
 *
 * Tách riêng khỏi js/i18n.js vì đây là hàng nghìn ký tự văn xuôi mà trang chủ
 * và trang coin không bao giờ đụng tới — nhét chung thì mỗi lần mở trang chủ
 * đều phải tải kèm toàn bộ điều khoản sử dụng. Chỉ sáu trang tĩnh nạp tệp này.
 *
 * Mỗi trang là MỘT khoá chứa nguyên phần thân <main>. Cắt nhỏ theo từng đoạn
 * thì dịch ra tiếng Anh phải bám sát cấu trúc câu tiếng Việt, mà văn xuôi pháp
 * lý dịch như vậy đọc rất gượng; giữ nguyên cả khối cho phép viết lại câu cho
 * tự nhiên miễn là nói đúng cùng một điều.
 *
 * Bản tiếng Việt vẫn là BẢN GỐC: nó nằm trong HTML, và i18n.js chép lại nguyên
 * văn trước khi thay, nên bấm về Tiếng Việt là ra đúng bản gốc.
 */
(function () {
  var I = window.VdearI18n;
  if (!I || !I.extend) return;

  I.extend('en', {

    'page.about': `
    <a class="back" href="/">← Back to the app</a>
    <h1>About Vdearypto</h1>
    <div class="doc-meta">A tool for tracking and analysing digital-asset markets</div>

<p class="doc-lead">Vdearypto reads market data from several venues at once, normalises it, and lays it out
so you can see what is happening without keeping five tabs open.</p>

<h2>What Vdearypto does</h2>
<ul>
  <li><b>Pools data from several venues.</b> The same coin is read from Binance, OKX, Bybit and Bitget, then
  merged. When venues disagree on price, you see that gap instead of a single number.</li>
  <li><b>Scans the whole market.</b> Rather than checking coins one by one, the same criteria run across the
  entire list and push the notable ones to the top.</li>
  <li><b>Multi-timeframe technicals.</b> RSI, support and resistance zones, candle patterns and volume,
  computed across several timeframes.</li>
  <li><b>Derivatives data.</b> Funding, open interest and long/short ratios where the venue publishes them.</li>
  <li><b>States its sources and timing.</b> Every figure carries where it came from and how fresh it is, so
  you know what you are looking at.</li>
</ul>

<h2>What Vdearypto does not do</h2>
<ul>
  <li>It does not hold money, does not hold assets, and does not connect to your wallet.</li>
  <li>It does not place orders and does not trade on your behalf.</li>
  <li>It does not ask for your exchange API keys or private keys — and never will.</li>
  <li>It does not give investment advice, and promises no profit.</li>
</ul>

<h2>How the method works</h2>
<p>A "battle-tested" signal does not come from one indicator, but from several independent conditions
happening together:</p>
<ul>
  <li><b>An RSI reversal</b> out of an extreme — this sets the direction being considered;</li>
  <li><b>Price near a support or resistance zone</b> that formed earlier;</li>
  <li><b>A confirming candle</b> in the same direction (engulfing or a long wick);</li>
  <li><b>A breakout confirmed by the close</b>, not just a touch and a bounce;</li>
  <li><b>Volume large enough</b> against the recent average, to filter out false breakouts.</li>
</ul>
<p>The more conditions that hold, the higher the signal ranks. That does <b>not</b> mean it will be right.</p>

<h2>What Vdearypto cannot see</h2>
<p>Being honest about the limits matters more than looking omniscient:</p>
<ul>
  <li>Real liquidation figures need a paid data source. Without one, the levels shown are <b>estimates</b>
  derived from open interest, and they are labelled as such.</li>
  <li>On-chain flows and large-wallet activity need their own sources; until those are enabled, they show as
  unavailable.</li>
  <li>News, regulation and macro events — often the things that actually move the market — sit outside every
  technical indicator.</li>
  <li>Data comes from third parties, so it can lag or be wrong.</li>
</ul>

<h2>Principles</h2>
<ul>
  <li><b>Missing data is called missing.</b> No default number gets substituted to make a table look full.</li>
  <li><b>An estimate is called an estimate.</b> Inferred numbers are never presented as measured ones.</li>
  <li><b>No promised profits.</b> No "certainty", no guaranteed win rate.</li>
  <li><b>One broken source does not take the page down.</b> The rest keeps working and says which source is
  missing.</li>
</ul>

<div class="callout">Vdearypto is a reference tool, not a financial adviser. Before using any number here to
make a decision, read the <a href="risk.html">Risk disclosure</a>.</div>
`,

    'page.contact': `
    <a class="back" href="/">← Back to the app</a>
    <h1>Contact</h1>
    <div class="doc-meta">Get in touch with the Vdearypto team.</div>

<p>We are always glad to hear from you — feedback, bug reports, partnerships or questions.</p>
<h2>Email</h2>
<p><a href="mailto:support@vdear.io">support@vdear.io</a></p>
<h2>Social</h2>
<p>Official channels will be listed here once they are ready (X · Telegram · Discord).</p>
<div class="callout">Tip: when reporting a bug, include a screenshot plus the coin and timeframe so we can
get to it faster.</div>
`,

    'page.404': `
    <a class="back" href="/">← Back to the app</a>
    <h1>Page not found</h1>
    <div class="doc-meta">Error 404</div>

<p style="font-size:60px;margin:10px 0">🧭</p>
<p>The page you are looking for does not exist, or it has moved.</p>
<p><a class="btn-primary" href="/" style="margin-top:12px">← Back to the market page</a></p>
`,

    'page.risk': `
    <a class="back" href="/">← Back to the app</a>
    <h1>Risk disclosure</h1>
    <div class="doc-meta">Last updated: 2026</div>

<div class="callout"><b>Read this carefully before using any number on Vdearypto.</b> Trading digital assets
can cost you <b>everything you put in</b>. With leverage, you can lose all of it in minutes. Vdearypto gives
no investment advice and takes no responsibility for any loss of yours.</div>

<h2>1. This is not investment advice</h2>
<p>Everything on Vdearypto is information and a reference tool. We do not know your finances, your goals,
your risk tolerance or your circumstances, so nothing here is designed for you specifically. A "LONG" signal
or a score of 82/100 does <b>not</b> mean you should buy.</p>

<h2>2. Volatility risk</h2>
<p>Digital-asset prices can move tens of percent in a day, large caps included. The market runs 24/7, with no
daily limits and none of the circuit breakers traditional equities have. Big moves overnight while you sleep
are normal.</p>

<h2>3. Leverage risk, in numbers</h2>
<p>Leverage magnifies both the gain and the loss. Here is how far price has to move against you to
<b>wipe out your entire margin</b>, before fees and funding:</p>
<ul>
  <li><b>x5</b> — roughly <b>20%</b> against you</li>
  <li><b>x10</b> — roughly <b>10%</b></li>
  <li><b>x20</b> — roughly <b>5%</b></li>
  <li><b>x50</b> — roughly <b>2%</b></li>
  <li><b>x100</b> — roughly <b>1%</b></li>
</ul>
<p>At x100, a single 1% candle against you is enough to lose it all. In this market, 1% moves happen
constantly during the day. The higher the leverage, the less room you have to be wrong.</p>
<p>There is also <b>cascading liquidation</b>: when price reaches an area thick with orders, forced closes
push it further, taking out the next layer. Price can overshoot what you expected within seconds.</p>

<h2>4. Costs eat capital</h2>
<p>Even when you get the direction right you can still lose money to: <b>trading fees</b> on the way in and
out; <b>funding</b> paid periodically while holding a derivatives position; <b>slippage</b> in thin
liquidity; and the <b>bid/ask spread</b>. The more you trade, the deeper these cut.</p>

<h2>5. A backtest is not a promise</h2>
<p>Every win rate, statistic and simulation on Vdearypto is computed on <b>historical data</b>. Past results
do <b>not</b> guarantee future results. Backtests always look better than reality because they:</p>
<ul>
  <li>cannot simulate real slippage and order-book depth;</li>
  <li>assume you enter at the right price, at the right moment, without hesitating;</li>
  <li>ignore that you may lose connection, oversleep, or change your mind halfway;</li>
  <li>will always find a "beautiful" parameter set by chance alone if you try enough of them.</li>
</ul>

<h2>6. Data can be wrong or late</h2>
<p>Vdearypto reads data from the venues' public APIs. That data can be wrong, seconds behind, incomplete, or
stop updating before the interface notices. Estimated liquidation levels, shown when no paid source is
configured, <b>are estimates</b>, clearly labelled, not measured figures. <b>Do not place an order based on
a single number shown here without checking it on the exchange.</b></p>

<h2>7. Technical risk</h2>
<p>The website, your browser, your phone, your connection and the exchange itself can all fail or overload
exactly when the market moves hardest. Be prepared for not being able to close a position when you need to.</p>

<h2>8. Counterparty risk</h2>
<p>Your money sits with the exchange, not with Vdearypto. An exchange can be hacked, become insolvent, freeze
withdrawals or shut down. Vdearypto has no agency relationship with any venue and cannot intervene.</p>

<h2>9. Legal and tax risk</h2>
<p>Digital-asset rules differ between countries and change fast. Holding or trading may be restricted or
banned where you live. Profits may be taxable. Finding out and complying is your responsibility; consult a
legal or tax professional where needed.</p>

<h2>10. The risk that is you</h2>
<p>Most losses come from behaviour, not tools: entering out of fear of missing out, holding a loser because
you will not admit being wrong, sizing up to win it back, trading while tired or tilted. No indicator fixes
any of that.</p>

<h2>11. Minimum rules</h2>
<ul>
  <li>Only use money you could lose entirely and still be fine.</li>
  <li>Do not borrow to trade.</li>
  <li>Decide your stop <b>before</b> entering, not after you are down.</li>
  <li>Cross-check every important number on the exchange before acting.</li>
  <li>If you do not understand why a signal appeared, do not follow it.</li>
</ul>

<h2>12. You are responsible</h2>
<p>By using Vdearypto you confirm that you have read and understood the risks above, and accept that
<b>every trading decision and every financial consequence of it is yours alone</b>. See also the
<a href="terms.html">Terms of use</a>.</p>
`,

    'page.privacy': `
    <a class="back" href="/">← Back to the app</a>
    <h1>Privacy policy</h1>
    <div class="doc-meta">Last updated: 2026</div>

<div class="callout"><b>In short:</b> viewing prices and analysis needs no account, and we collect nothing
that identifies you. Only if you choose to sign up do we store an email, to sync your favourites. We
<b>do not sell</b> your data to anyone.</div>

<h2>1. Using it without signing up</h2>
<p>You can use almost all of Vdearypto without an account. In that mode we collect no name, email, phone
number or any other identifying information.</p>
<p>The only data stored is <b>on your own device</b>, in browser storage (localStorage):</p>
<ul>
  <li>your list of favourite coins;</li>
  <li>your light or dark theme choice;</li>
  <li>a few display preferences.</li>
</ul>
<p>None of it <b>is sent to a server</b>. Clearing your browsing data removes it completely.</p>

<h2>2. When you create an account</h2>
<p>If you sign up to sync favourites across devices, we store:</p>
<ul>
  <li><b>Your email</b> — to identify the account and to recover a password;</li>
  <li><b>An account identifier</b> generated by the system;</li>
  <li><b>The coins you starred</b>.</li>
</ul>
<p>We do <b>not</b> store passwords in readable form, do <b>not</b> ask for identity documents, do
<b>not</b> ask for financial information, and <b>never</b> ask for your exchange API keys or wallet keys.
Vdearypto does not need any of that to work, and never will.</p>

<h2>3. Technical data</h2>
<p>Like any website, the server infrastructure records basic technical information with each request (IP
address, browser type, timestamp, page requested). It is used for operations, abuse prevention and
troubleshooting, not to build a profile of you.</p>

<h2>4. Third parties</h2>
<p>To function, Vdearypto interacts with:</p>
<ul>
  <li><b>Exchanges</b> (Binance, OKX, Bybit, Bitget and other data sources) — we only read public market
  data. <b>None of your personal information is sent to them.</b></li>
  <li><b>Hosting and database providers</b> — they host the site, and your account data if you sign up.</li>
  <li><b>A font provider</b> — your browser loads fonts from their service.</li>
</ul>
<p>We run no advertising and share no data with ad networks.</p>

<h2>5. What we do not do</h2>
<ul>
  <li>We do not sell, rent or trade your personal data.</li>
  <li>We do not send marketing email unless you asked for it.</li>
  <li>We do not track you across other websites.</li>
</ul>

<h2>6. Retention</h2>
<p>Account data is kept while the account is active. When you ask us to delete it, we delete the account
data and the favourites attached to it.</p>

<h2>7. Your rights</h2>
<p>You may ask to see, correct or delete the personal data we hold, and withdraw consent at any time by
deleting your account. Send requests to <a href="mailto:support@vdear.io">support@vdear.io</a> from the
email address you registered with.</p>

<h2>8. Security</h2>
<p>Connections to Vdearypto are encrypted (HTTPS) and account data is separated per user at the database
layer. Even so, no system is perfectly secure; we cannot guarantee data sent over the Internet is safe in
every circumstance.</p>

<h2>9. Children</h2>
<p>The service is not intended for anyone under the age of majority. We do not knowingly collect children's
data.</p>

<h2>10. Changes and contact</h2>
<p>This policy may be updated; a new version takes effect when published. Questions go to
<a href="mailto:support@vdear.io">support@vdear.io</a>.</p>
`,

    'page.terms': `
    <a class="back" href="/">← Back to the app</a>
    <h1>Terms of use</h1>
    <div class="doc-meta">Last updated: 2026</div>

<div class="callout"><b>In one sentence:</b> Vdearypto is a tool for looking up and analysing market data.
It does <b>not</b> take money, does <b>not</b> hold assets, does <b>not</b> place orders for you, and does
<b>not</b> give investment advice. Every trading decision, and every consequence of it, is yours alone.</div>

<h2>1. Scope and acceptance</h2>
<p>By accessing or using Vdearypto (the "Service") you confirm that you have read, understood and agree to
all of these terms. If you disagree with any part of them, stop using the Service.</p>

<h2>2. What the Service is</h2>
<p>Vdearypto aggregates public market data from exchanges and presents it as tables, charts and technical
indicators. To be unmistakably clear, Vdearypto is <b>not</b>, and does <b>not</b> act as:</p>
<ul>
  <li>an exchange, a broker, or an order-matching venue;</li>
  <li>a party that receives, holds, manages or transfers users' money or digital assets;</li>
  <li>an investment adviser, a fund manager, or a licensed financial advisory firm;</li>
  <li>a provider of investment, legal, accounting or tax advice.</li>
</ul>
<p>Every number, ranking, score, signal, support/resistance level and entry plan shown on Vdearypto is the
<b>automated result of a computation over historical data</b>, offered for reference and education. None of
it is a recommendation to buy, sell or hold any asset.</p>

<h2>3. Eligibility</h2>
<p>You confirm on your own account that you:</p>
<ul>
  <li>are of the age of majority where you live;</li>
  <li>are not in a country or on a sanctions list where providing the service would be unlawful;</li>
  <li>are responsible for finding out whether trading digital assets is legal where you live;</li>
  <li>use the Service for lawful, personal purposes.</li>
</ul>
<p>Vdearypto does not verify users' legal status and is not responsible if you use the Service contrary to
the rules that apply to you.</p>

<h2>4. Accounts</h2>
<p>Some features (favourites, syncing across devices) require an account. You are responsible for keeping
your credentials safe and for everything done under your account. Tell us immediately if you suspect
unauthorised access.</p>

<h2>5. Acceptable use</h2>
<p>You agree not to: scrape at a scale that overloads the system; interfere with, reverse-engineer or damage
the system; use the Service for fraud, market manipulation or any unlawful act; or resell or redistribute
the Service's data as your own product without an agreement.</p>

<h2>6. Data sources and accuracy</h2>
<p>Data on Vdearypto comes from third-party public APIs (Binance, OKX, Bybit, Bitget and others). We
<b>do not control</b> and <b>do not warrant</b> its accuracy, completeness or timeliness. It can be wrong,
late, incomplete or interrupted through a source failure, a network failure or a processing error.</p>
<p>When a source does not respond, Vdearypto shows what it could retrieve and says which source is missing.
Aggregate figures in that case reflect only the sources still working.</p>

<h2>7. Availability</h2>
<p>Vdearypto is provided on a reasonable-effort basis. We <b>do not undertake</b> that the Service will run
continuously, uninterrupted or error-free, and we may change, suspend or discontinue any feature at any
time without notice.</p>

<h2>8. Third-party links and services</h2>
<p>The Service may link to third-party websites or services. We do not control and are not responsible for
their content, policies or conduct. Any dealing you have with a third party is between you and them.</p>

<h2>9. Intellectual property</h2>
<p>Vdearypto's interface, source code, presentation and brand elements are ours. The raw market data belongs
to the respective publishing sources.</p>

<h2>10. Disclaimer of warranties</h2>
<p>The Service is provided <b>"as is"</b> and <b>"as available"</b>, without warranty of any kind, express or
implied, including but not limited to merchantability, fitness for a particular purpose, or accuracy of
results.</p>

<h2>11. Limitation of liability</h2>
<p>To the maximum extent permitted by law, Vdearypto and the people operating the Service are <b>not
liable</b> for any damages arising out of or connected with your use of the Service, including but not
limited to: trading losses, lost opportunity, lost profit, lost data, and indirect or consequential damages,
even if warned that such damages were possible.</p>
<p>You understand that you use the Service entirely at your own risk.</p>

<h2>12. Indemnity</h2>
<p>You agree to defend and indemnify Vdearypto against any claim, damage or cost arising from your breach of
these terms or from breaking the law while using the Service.</p>

<h2>13. Changes to these terms</h2>
<p>We may update these terms. A new version takes effect when published. Continuing to use the Service
afterwards means you accept the update.</p>

<h2>14. Termination</h2>
<p>We may suspend or end your access if you breach these terms. You may stop using the Service at any
time.</p>

<h2>15. Governing law and contact</h2>
<p>These terms are governed by the law of the place where the operator of the Service is established, unless
mandatory law gives consumers where you live something more favourable. Questions go to
<a href="mailto:support@vdear.io">support@vdear.io</a>.</p>
`,

  });
})();

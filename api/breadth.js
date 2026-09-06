/*
 * Độ rộng thị trường — HÀM SERVER (Vercel).
 *
 * VÌ SAO Ở SERVER
 * ---------------
 * Một lượt tính cần nến ngày của hàng trăm coin. Để trình duyệt tự gọi thì mỗi
 * người mở trang lại bắn vài trăm request từ IP của họ tới Binance — đúng vấn
 * đề mà api/oi-scan.js đã phải sinh ra để tránh. Một máy gọi, CDN phục vụ tất
 * cả. Không có khoá bí mật nào ở đây, toàn bộ là dữ liệu công khai.
 *
 * BA CHỈ SỐ, MỖI CHỈ SỐ MỘT CÂU HỎI KHÁC NHAU
 * -------------------------------------------
 *   aboveMa200  — bao nhiêu % coin đang nằm trên MA200 của CHÍNH NÓ.
 *                 Trả lời "xu hướng dài hạn còn nguyên ở bao nhiêu phần thị
 *                 trường", chậm và ít nhiễu.
 *   newHigh30   — bao nhiêu % coin vừa lập đỉnh 30 ngày. Trả lời "sức mạnh có
 *                 đang lan ra không", nhanh và nhạy.
 *   up24h       — bao nhiêu % coin đóng cửa cao hơn hôm trước. Chỉ là ảnh chụp
 *                 một ngày, KHÔNG phải chỉ báo xu hướng.
 * Ba con số này không thay thế nhau và không được cộng trung bình lại thành
 * một "điểm độ rộng" — cộng chúng lại là bịa ra một chỉ số không có định nghĩa.
 *
 * PHÂN KỲ
 * -------
 * "BTC tăng nhưng độ rộng thu hẹp" chỉ có nghĩa khi nói rõ đo trên cửa sổ nào
 * và thu hẹp theo nghĩa gì. Định nghĩa dùng ở đây, không đổi ngầm:
 *   · BTC đóng cửa hôm nay CAO HƠN đóng cửa N ngày trước, VÀ
 *   · tỉ lệ coin trên MA200 GIẢM ở từng ngày một, liên tiếp đủ N ngày.
 * "Trung bình N ngày thấp đi" là một phát biểu khác và yếu hơn nhiều.
 */

const envelope = require('./_envelope');

const BINANCE = process.env.BINANCE_FAPI_BASE || 'https://fapi.binance.com';
const TIMEOUT_MS = 9000;
const REFRESH_MS = 30 * 60 * 1000;
const TOP = Number(process.env.BREADTH_TOP || 150);
const CONCURRENCY = 6;
const DAYS_OUT = 45;          // số ngày trả về cho giao diện
const MA = 200;
const HIGH_WINDOW = 30;
const DIVERGE_DAYS = 5;

const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'DAI', 'BUSD', 'USDP', 'USDD', 'PYUSD', 'EUR', 'EURI']);

function num(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* --------------------------- phần thuần tính --------------------------- */

// Trung bình động đơn giản. Trả null khi chưa đủ `period` phần tử — chưa đủ dữ
// liệu là chưa đủ dữ liệu, không phải "trung bình của những gì đang có".
function smaAt(closes, i, period) {
  if (i + 1 < period) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const v = num(closes[k]);
    if (v == null) return null;
    sum += v;
  }
  return sum / period;
}

// Nến i có phải đỉnh `window` ngày không (tính CẢ chính nó).
function isNewHigh(highs, i, window) {
  if (i + 1 < window) return null;
  const v = num(highs[i]);
  if (v == null) return null;
  for (let k = i - window + 1; k < i; k++) {
    const x = num(highs[k]);
    if (x == null) return null;
    if (x >= v) return false;
  }
  return true;
}

/*
 * Gom ba tỉ lệ cho từng ngày.
 *
 * `series` = [{ base, closes, highs }] đã cắt cùng độ dài và cùng mốc thời
 * gian. Coin nào chưa đủ 200 nến thì KHÔNG được tính vào mẫu số của
 * aboveMa200 — coi nó là "không nằm trên MA200" sẽ kéo tỉ lệ xuống một cách
 * bịa đặt. Mỗi chỉ số vì thế có mẫu số riêng, và mẫu số đó được trả ra.
 */
function breadthSeries(series, days) {
  if (!series || !series.length) return [];
  const n = series[0].closes.length;
  // Các mảng phải cùng độ dài VÀ cùng mốc thời gian, nếu không thì chỉ số i
  // của coin này là một ngày khác với chỉ số i của coin kia, và mọi tỉ lệ tính
  // ra đều vô nghĩa. Báo lỗi to thay vì trả về một con số trông vẫn hợp lý:
  // build() đã cắt về cùng độ dài trước khi gọi, nên lọt vào đây là có lỗi
  // lập trình ở chỗ khác.
  for (const s of series) {
    if (s.closes.length !== n || s.highs.length !== n) {
      throw new Error('breadthSeries: các chuỗi không cùng độ dài ('
        + n + ' vs ' + s.closes.length + ' ở ' + s.base + ')');
    }
  }
  const out = [];
  const from = Math.max(1, n - days);
  for (let i = from; i < n; i++) {
    let maUp = 0, maTotal = 0;
    let hiUp = 0, hiTotal = 0;
    let upDay = 0, upTotal = 0;
    for (const s of series) {
      const ma = smaAt(s.closes, i, MA);
      const c = num(s.closes[i]);
      if (ma != null && c != null) { maTotal++; if (c > ma) maUp++; }

      const nh = isNewHigh(s.highs, i, HIGH_WINDOW);
      if (nh != null) { hiTotal++; if (nh) hiUp++; }

      const p = num(s.closes[i - 1]);
      if (c != null && p != null) { upTotal++; if (c > p) upDay++; }
    }
    out.push({
      t: series.length ? series[0].times[i] : null,
      aboveMa200: maTotal ? maUp / maTotal * 100 : null,
      aboveMa200N: maTotal,
      newHigh30: hiTotal ? hiUp / hiTotal * 100 : null,
      newHigh30N: hiTotal,
      up24h: upTotal ? upDay / upTotal * 100 : null,
      up24hN: upTotal,
    });
  }
  return out;
}

/*
 * Phân kỳ: BTC lên trong khi độ rộng đi xuống từng ngày một.
 *
 * Trả về `days` = độ dài chuỗi giảm liên tiếp thật sự đo được, kể cả khi chưa
 * đủ ngưỡng — để giao diện nói "đã thu hẹp 3/5 ngày" thay vì im lặng.
 */
function divergence(rows, btcCloses, needDays) {
  const need = needDays || DIVERGE_DAYS;
  const vals = rows.map((r) => r.aboveMa200);
  const n = vals.length;
  if (n < 2 || btcCloses.length < 2) return { enough: false, streak: 0, need };

  let streak = 0;
  for (let i = n - 1; i >= 1; i--) {
    const a = num(vals[i]), b = num(vals[i - 1]);
    if (a == null || b == null || !(a < b)) break;
    streak++;
  }

  const last = num(btcCloses[btcCloses.length - 1]);
  const backIdx = btcCloses.length - 1 - need;
  const back = backIdx >= 0 ? num(btcCloses[backIdx]) : null;
  const btcUp = last != null && back != null && last > back;
  const btcPct = (last != null && back != null && back > 0)
    ? (last - back) / back * 100 : null;

  return {
    enough: true,
    streak, need,
    btcUp, btcChangePct: btcPct,
    breadthChangePts: (num(vals[n - 1]) != null && num(vals[Math.max(0, n - 1 - need)]) != null)
      ? num(vals[n - 1]) - num(vals[Math.max(0, n - 1 - need)]) : null,
    // Cả hai điều kiện phải cùng đúng. Chỉ một vế thì KHÔNG phải phân kỳ.
    diverging: !!btcUp && streak >= need,
  };
}

/* ---------------------------- lấy dữ liệu ------------------------------ */

async function universe() {
  const rows = await getJSON(BINANCE + '/fapi/v1/ticker/24hr');
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => typeof r.symbol === 'string' && r.symbol.endsWith('USDT'))
    .filter((r) => !STABLE.has(r.symbol.replace(/USDT$/, '')))
    .map((r) => ({ symbol: r.symbol, quoteVolume: num(r.quoteVolume) || 0 }))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, TOP);
}

async function candles(symbol) {
  const j = await getJSON(`${BINANCE}/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=${MA + DAYS_OUT + 10}`);
  if (!Array.isArray(j) || !j.length) return null;
  return {
    times: j.map((k) => Number(k[0])),
    closes: j.map((k) => num(k[4])),
    highs: j.map((k) => num(k[2])),
  };
}

async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(new Array(Math.min(size, items.length)).fill(0).map(async () => {
    for (;;) {
      const k = i++;
      if (k >= items.length) return;
      try { out[k] = await worker(items[k]); } catch (e) { out[k] = null; }
    }
  }));
  return out;
}

async function build() {
  const uni = await universe();
  const raw = await pool(uni, (u) => candles(u.symbol).then((c) => (c ? { base: u.symbol.replace(/USDT$/, ''), ...c } : null)), CONCURRENCY);

  // Cắt về cùng độ dài và bỏ coin quá ngắn. Ghép hai coin lệch số nến là gán
  // giá của ngày này cho ngày khác.
  const ok = raw.filter((r) => r && r.closes.length >= MA + 2);
  if (!ok.length) throw new Error('không lấy được nến của coin nào');
  const minLen = Math.min(...ok.map((r) => r.closes.length));
  const cut = ok.map((r) => ({
    base: r.base,
    times: r.times.slice(-minLen),
    closes: r.closes.slice(-minLen),
    highs: r.highs.slice(-minLen),
  }));

  const rows = breadthSeries(cut, DAYS_OUT);
  const btc = cut.find((r) => r.base === 'BTC');
  const div = divergence(rows, btc ? btc.closes.slice(-DAYS_OUT) : [], DIVERGE_DAYS);

  return {
    ok: true,
    coins: cut.length,
    requested: uni.length,
    days: rows.length,
    rows,
    btc: btc ? btc.closes.slice(-DAYS_OUT) : null,
    divergence: div,
    ma: MA, highWindow: HIGH_WINDOW,
    generatedAt: new Date().toISOString(),
  };
}

/* --------------------------- đệm của instance -------------------------- */

let cache = null, running = null;

async function get() {
  if (cache && Date.now() - cache.at < REFRESH_MS) return { payload: cache.payload, cached: true };
  if (!running) {
    running = build()
      .then((p) => { cache = { at: Date.now(), payload: p }; return p; })
      // Lượt dựng hỏng thì GIỮ bản cũ: số của nửa tiếng trước vẫn đọc được,
      // xoá đi thì cả khối trống vì một lần mạng chập.
      .catch(() => (cache ? cache.payload : { ok: false, rows: [], errors: ['build failed'] }))
      .then((p) => { running = null; return p; });
  }
  if (cache) return { payload: cache.payload, cached: true, revalidating: true };
  return { payload: await running, cached: false };
}

module.exports = async function handler(req, res) {
  try {
    const { payload, cached, revalidating } = await get();
    // Vỏ bọc chung: thêm ageSeconds/stale để giao diện biết số này bao nhiêu
    // tuổi. Xem api/_envelope.js.
    envelope.send(res, { ...payload, cached: !!cached, revalidating: !!revalidating },
      { sMaxAge: 1800, maxAgeSeconds: 3600 });
  } catch (e) {
    envelope.fail(res, e);
  }
};

// để test — không phải API công khai
module.exports._pure = {
  smaAt, isNewHigh, breadthSeries, divergence,
  MA, HIGH_WINDOW, DIVERGE_DAYS,
};
module.exports._reset = function () { cache = null; running = null; };

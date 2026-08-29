/*
 * Hero — thẻ Signal Radar và Trading Plan.
 *
 * MỌI CON SỐ Ở ĐÂY LÀ SỐ THẬT. Bản thiết kế có cho sẵn giá trị mẫu (RSI 27.4,
 * support $108,420, entry $108,650...) nhưng chính bản đó cũng ghi "không tạo
 * mock data nếu website đã có real data" — mà trang này có. Nên lấy bố cục của
 * thiết kế, còn số thì tính từ nến BTC 4H qua VdearTA.combatSignal().
 *
 * Chưa lấy được nến -> để "—" và ghi rõ chưa có dữ liệu. Không điền số mẫu.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const API = window.VdearAPI, TA = window.VdearTA;
  const R = 52;                                   // bán kính vòng cung
  const CIRC = 2 * Math.PI * R;                   // 326.7

  function money(n) {
    if (n == null || !Number.isFinite(n)) return '—';
    return '$' + n.toLocaleString('en-US', {
      minimumFractionDigits: n < 1 ? 6 : 2, maximumFractionDigits: n < 1 ? 6 : 2,
    });
  }

  /* Đếm tăng dần tới giá trị đích. Máy đặt giảm chuyển động -> gán thẳng. */
  function countTo(el, to, fmt, ms) {
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = ms || 900;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(to * eased);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* Đường giá thu nhỏ, vẽ từ chính những nến đã dùng để tính tín hiệu. */
  function sparkline(svg, candles) {
    if (!svg || !candles || candles.length < 4) return;
    const pts = candles.slice(-48).map((c) => c.close);
    const lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    const span = hi - lo || 1;
    const W = 280, H = 44, pad = 3;
    const xy = pts.map((v, i) => [
      (i / (pts.length - 1)) * W,
      H - pad - ((v - lo) / span) * (H - pad * 2),
    ]);
    const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    svg.innerHTML = `<path class="hx-spark-fill" d="${d} L${W} ${H} L0 ${H} Z"/><path d="${d}"/>`;
  }

  function fail(msg) {
    const radar = $('hxRadar');
    if (radar) radar.setAttribute('aria-busy', 'false');
    const side = $('hxSide');
    if (side) side.textContent = msg;
  }

  async function init() {
    const radar = $('hxRadar');
    if (!radar || !API || !TA || !TA.combatSignal) return;
    let candles = null;
    try {
      candles = await API.binanceKlines('BTCUSDT', '4h', 200);
    } catch (e) { candles = null; }
    if (!candles || candles.length < 60) { fail('chưa lấy được nến'); return; }

    let sig;
    try { sig = TA.combatSignal(candles); } catch (e) { fail('chưa tính được tín hiệu'); return; }
    if (!sig) { fail('chưa tính được tín hiệu'); return; }

    radar.setAttribute('aria-busy', 'false');

    const bull = sig.side === 'bullish' || sig.side === 'LONG';
    const dirCls = bull ? 'up' : 'down';
    const score = Math.max(0, Math.min(100, Math.round(sig.score || 0)));

    countTo($('hxScore'), score, (v) => String(Math.round(v)));
    const sideEl = $('hxSide');
    sideEl.textContent = bull ? 'Bullish' : 'Bearish';
    sideEl.className = dirCls;

    const arc = $('hxArc');
    arc.classList.add(dirCls);
    // Đặt ở khung sau để trình duyệt kịp ghi nhận trạng thái đầu, nếu không
    // transition bị bỏ qua và vòng cung nhảy thẳng tới đích.
    requestAnimationFrame(() => { arc.style.strokeDashoffset = String(CIRC * (1 - score / 100)); });

    $('hxRsi').textContent = sig.rsi == null ? '—' : sig.rsi.toFixed(1);
    $('hxRsi').className = sig.rsi >= 70 ? 'down' : sig.rsi <= 30 ? 'up' : '';

    const sr = TA.supportResistance(candles, sig.price) || { supports: [], resistances: [] };
    $('hxSup').textContent = sr.supports[0] ? money(sr.supports[0].price) : '—';
    $('hxRes').textContent = sr.resistances[0] ? money(sr.resistances[0].price) : '—';

    const pa = $('hxPa');
    pa.textContent = sig.paMatch ? '✓ Confirmed' : 'Chưa xác nhận';
    pa.className = sig.paMatch ? 'up' : '';

    const conf = Math.max(0, Math.min(100, Math.round(sig.confluence || 0)));
    countTo($('hxConf'), conf, (v) => Math.round(v) + '/100');

    const plan = sig.plan || (TA.tradePlan ? TA.tradePlan(sig.price, sig.side) : null);
    if (plan) {
      $('hxEntry').textContent = money(plan.entry);
      $('hxTp').textContent = money(plan.tp);
      $('hxSl').textContent = money(plan.sl);
      // R:R tính từ chính entry/tp/sl vừa hiện — không gõ sẵn tỉ lệ.
      const reward = Math.abs(plan.tp - plan.entry);
      const risk = Math.abs(plan.entry - plan.sl);
      $('hxRr').textContent = risk > 0 ? '1 : ' + (reward / risk).toFixed(1) : '—';
    }

    $('hxPair').textContent = 'BTCUSDT · 4H · ' + money(sig.price);
    sparkline($('hxSpark'), candles);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

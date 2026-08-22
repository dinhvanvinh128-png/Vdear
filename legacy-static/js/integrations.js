/*
 * Vdear — Integrations (env-guarded)
 * Đọc window.VDEAR_ENV (từ env.js). Chỉ dùng KHOÁ CÔNG KHAI phía client:
 *   POSTHOG_KEY, POSTHOG_HOST, SENTRY_DSN, SUPABASE_URL, SUPABASE_ANON_KEY,
 *   CLERK_PUBLISHABLE_KEY, SIGN_IN_URL.
 * KHÔNG đặt secret (service_role, clerk secret, resend, upstash, pinecone, openai)
 * ở đây — chúng chỉ chạy phía server (Cloudflare/Next.js) sau này.
 * Thiếu khoá nào thì phần đó tự bỏ qua, không gây lỗi.
 */
(function () {
  const ENV = window.VDEAR_ENV || {};

  /* ------------------------------ PostHog ------------------------------ */
  if (ENV.POSTHOG_KEY) {
    try {
      !function (t, e) { var o, n, p, r; e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) { function g(t, e) { var o = e.split("."); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } } (p = t.createElement("script")).type = "text/javascript", p.async = !0, p.src = s.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js", (r = t.getElementsByTagName("script")[0]).parentNode.insertBefore(p, r); var u = e; for (void 0 !== a ? u = e[a] = [] : a = "posthog", u.people = u.people || [], u.toString = function (t) { var e = "posthog"; return "posthog" !== a && (e += "." + a), t || (e += " (stub)"), e }, u.people.toString = function () { return u.toString(1) + ".people (stub)" }, o = "capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "), n = 0; n < o.length; n++)g(u, o[n]); e._i.push([i, s, a]) }, e.__SV = 1) }(document, window.posthog || []);
      window.posthog.init(ENV.POSTHOG_KEY, { api_host: ENV.POSTHOG_HOST || 'https://us.i.posthog.com', capture_pageview: true, persistence: 'localStorage' });
    } catch (e) { /* bỏ qua */ }
  }

  /* ------------------------------- Sentry ------------------------------ */
  if (ENV.SENTRY_DSN) {
    try {
      const s = document.createElement('script');
      s.src = 'https://browser.sentry-cdn.com/7.120.0/bundle.tracing.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        if (window.Sentry) window.Sentry.init({ dsn: ENV.SENTRY_DSN, tracesSampleRate: 0.1, replaysSessionSampleRate: 0 });
      };
      document.head.appendChild(s);
    } catch (e) { /* bỏ qua */ }
  }

  /* --------------------------- Nút đăng nhập --------------------------- */
  // Hiện nút "Đăng nhập" khi Clerk đã cấu hình; trỏ tới trang đăng nhập.
  function wireAuth() {
    const btns = document.querySelectorAll('[data-auth-login]');
    if (!btns.length) return;
    if (ENV.CLERK_PUBLISHABLE_KEY) {
      btns.forEach((b) => { b.hidden = false; b.href = ENV.SIGN_IN_URL || '/sign-in'; });
    } else {
      btns.forEach((b) => { b.hidden = true; });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireAuth);
  else wireAuth();

  // Cờ tiện dụng cho các module khác (vd đồng bộ watchlist lên Supabase).
  window.VdearIntegrations = {
    hasSupabase: !!(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY),
    hasAuth: !!ENV.CLERK_PUBLISHABLE_KEY,
    env: ENV,
  };
})();

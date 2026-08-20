/*
 * Vdear — Đăng nhập thật (Clerk) + đồng bộ Yêu thích (Supabase), CHẠY CLIENT-SIDE.
 * Chỉ dùng KHOÁ CÔNG KHAI: CLERK_PUBLISHABLE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
 * Thiếu khoá / chặn mạng -> tự bỏ qua, Yêu thích vẫn dùng localStorage bình thường.
 *
 * Yêu cầu phía Supabase (xem supabase/schema.sql + SUPABASE-SETUP.md):
 *  - Bảng public.watchlist(user_id text default auth.jwt()->>'sub', symbol text)
 *  - Bật RLS + policy theo user_id = auth.jwt()->>'sub'
 *  - Clerk: tạo JWT template tên "supabase" (ký bằng JWT secret của Supabase)
 */
(function () {
  var ENV = window.VDEAR_ENV || {};
  if (!ENV.CLERK_PUBLISHABLE_KEY) return; // chưa cấu hình -> giữ nguyên localStorage

  var clerk = null, supa = null;

  async function boot() {
    try {
      var mod = await import('https://esm.sh/@clerk/clerk-js@5');
      var Clerk = mod.Clerk || mod.default;
      clerk = new Clerk(ENV.CLERK_PUBLISHABLE_KEY);
      await clerk.load({ /* dùng component mặc định */ });
    } catch (e) { console.warn('Clerk chưa tải được:', e); return; }

    // Supabase client dùng token của Clerk (nếu có cấu hình)
    if (ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY) {
      try {
        var sb = await import('https://esm.sh/@supabase/supabase-js@2');
        supa = sb.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
          accessToken: async function () {
            try { return clerk.session ? await clerk.session.getToken({ template: 'supabase' }) : null; }
            catch (e) { return null; }
          },
        });
      } catch (e) { console.warn('Supabase chưa tải được:', e); }
    }

    wireUI();
    clerk.addListener(function () { wireUI(); syncFavorites(); });
    syncFavorites();
  }

  function loginEls() { return document.querySelectorAll('[data-auth-login]'); }
  function userEls() { return document.querySelectorAll('[data-auth-user]'); }

  function wireUI() {
    var signedIn = !!(clerk && clerk.user);
    loginEls().forEach(function (b) {
      b.hidden = signedIn;
      if (!b._bound) {
        b._bound = true;
        b.addEventListener('click', function (e) { e.preventDefault(); if (clerk) clerk.openSignIn(); });
      }
    });
    userEls().forEach(function (u) {
      u.hidden = !signedIn;
      if (signedIn && clerk && !u._mounted) { u._mounted = true; try { clerk.mountUserButton(u, { afterSignOutUrl: location.href }); } catch (e) {} }
    });
  }

  // Đồng bộ Yêu thích giữa localStorage và Supabase khi đăng nhập.
  async function syncFavorites() {
    var Fav = window.VdearFav;
    if (!Fav) return;
    if (!(clerk && clerk.user && supa)) { Fav.setBackend(null); return; }

    // backend cloud: mỗi thay đổi ghi lên Supabase
    Fav.setBackend({
      write: async function (symbol, added) {
        try {
          if (added) await supa.from('watchlist').upsert({ symbol: symbol }, { onConflict: 'user_id,symbol' });
          else await supa.from('watchlist').delete().eq('symbol', symbol);
        } catch (e) { /* offline: giữ local */ }
      },
    });

    // nạp danh sách cloud, gộp với local rồi đẩy phần local còn thiếu lên cloud
    try {
      var res = await supa.from('watchlist').select('symbol');
      var cloud = (res && res.data ? res.data : []).map(function (r) { return r.symbol; });
      var localOnly = Fav.list().filter(function (s) { return cloud.indexOf(s) < 0; });
      Fav.merge(cloud); // hiển thị cloud + local
      for (var i = 0; i < localOnly.length; i++) {
        try { await supa.from('watchlist').upsert({ symbol: localOnly[i] }, { onConflict: 'user_id,symbol' }); } catch (e) {}
      }
    } catch (e) { /* để nguyên local */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

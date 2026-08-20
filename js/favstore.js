/*
 * Vdear — Kho "Yêu thích" tách lớp.
 * Mặc định lưu localStorage; khi đăng nhập (auth.js) sẽ gắn backend cloud
 * (Supabase) để đồng bộ đa thiết bị. Có pub/sub để UI tự cập nhật.
 */
(function () {
  var KEY = 'vdear_fav';
  function load() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); } }
  var set = load(), subs = [], backend = null;

  function persistLocal() { try { localStorage.setItem(KEY, JSON.stringify(Array.from(set))); } catch (e) {} }
  function emit() { subs.forEach(function (f) { try { f(set); } catch (e) {} }); }

  window.VdearFav = {
    has: function (b) { return set.has(b); },
    list: function () { return Array.from(set); },
    count: function () { return set.size; },
    toggle: function (b) {
      var added = !set.has(b);
      if (added) set.add(b); else set.delete(b);
      persistLocal();
      if (backend && backend.write) { try { backend.write(b, added); } catch (e) {} }
      emit();
    },
    onChange: function (cb) { subs.push(cb); return function () { var i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); }; },
    // dùng bởi auth.js khi đồng bộ cloud
    merge: function (arr) { (arr || []).forEach(function (b) { set.add(b); }); persistLocal(); emit(); },
    replace: function (arr) { set = new Set(arr || []); persistLocal(); emit(); },
    setBackend: function (b) { backend = b; },
  };
})();

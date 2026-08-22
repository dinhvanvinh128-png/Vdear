/*
 * Vdear — Theme toggle (sáng/tối), lưu vào localStorage.
 * data-theme được đặt sớm bằng đoạn inline ở <head> để tránh nháy màu.
 */
(function () {
  function current() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('vdear_theme', t); } catch (e) {}
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.textContent = t === 'light' ? '🌙' : '☀️';
      b.title = t === 'light' ? 'Chuyển nền tối' : 'Chuyển nền sáng';
    });
  }
  function bind() {
    document.querySelectorAll('[data-theme-toggle]').forEach((b) =>
      b.addEventListener('click', () => apply(current() === 'light' ? 'dark' : 'light')));
    apply(current());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

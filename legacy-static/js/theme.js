/*
 * Vdear — Theme toggle (sáng/tối), lưu vào localStorage.
 * data-theme được đặt sớm bằng đoạn inline ở <head> để tránh nháy màu.
 */
(function () {
  // Chữ hiển thị lấy qua i18n. t() tự rơi về tiếng Việt khi thiếu bản dịch;
  // i18n.js được nạp trước mọi module nên nhánh dự phòng dưới đây gần như
  // không bao giờ chạy, để đó cho chắc.
  const T = (k, v) => (window.VdearI18n ? window.VdearI18n.t(k, v) : k);

  function current() { return document.documentElement.getAttribute('data-theme') || 'dark'; }
  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('vdear_theme', t); } catch (e) {}
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.textContent = t === 'light' ? '🌙' : '☀️';
      b.title = T(t === 'light' ? 'theme.toDark' : 'theme.toLight');
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

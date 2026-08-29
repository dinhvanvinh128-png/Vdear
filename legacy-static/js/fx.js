/*
 * Vdear — FX: reveal khi cuộn, spotlight theo chuột, đếm số động.
 * Tất cả đều "an toàn": nếu lỗi thì nội dung vẫn hiển thị bình thường.
 */
(function () {
  function reveal() {
    if (!('IntersectionObserver' in window)) return;
    var els = Array.prototype.slice.call(
      document.querySelectorAll('.panel, .hero-inner, .coinrain-section, .foot-wrap'));
    if (!els.length) return;
    els.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (el) { io.observe(el); });
    // an toàn: sau 1.6s hiện hết dù có chuyện gì
    setTimeout(function () { els.forEach(function (el) { el.classList.add('in'); }); }, 1600);
  }

  function spotlight() {
    var SEL = '.panel,.scan-card,.plan-cell,.hero-inner,.combat-panel';
    window.addEventListener('pointermove', function (e) {
      var c = e.target.closest ? e.target.closest(SEL) : null;
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  function countup() {
    var els = document.querySelectorAll('[data-countup]');
    els.forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-countup')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1300, t0 = performance.now();
      function step(t) {
        var p = Math.min(1, (t - t0) / dur);
        var v = Math.round(target * (1 - Math.pow(1 - p, 3)));
        el.textContent = v.toLocaleString('en-US') + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function init() { try { reveal(); } catch (e) {} try { spotlight(); } catch (e) {} try { countup(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

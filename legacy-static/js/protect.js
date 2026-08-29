/*
 * Vdear — lớp chống sao chép nội dung phía trình duyệt.
 *
 * NÓI THẲNG VỀ GIỚI HẠN: đây là lớp CẢN, không phải lớp chặn. Bất cứ ai tắt
 * JavaScript, dùng "View Source" từ menu, gọi thẳng API, hay chụp màn hình
 * bằng điện thoại/công cụ hệ điều hành đều lấy được nội dung. Thứ thật sự bảo
 * vệ dữ liệu là phía máy chủ: khoá API nằm trong biến môi trường, dữ liệu
 * riêng tư chặn bằng RLS và kiểm quyền ở từng route. File này chỉ làm việc sao
 * chép hàng loạt trở nên phiền, và để lại dấu vết (watermark) nếu ảnh chụp bị
 * phát tán.
 *
 * Ba nguyên tắc khi viết:
 *  1. KHÔNG được cản trở ô nhập liệu, form, tìm kiếm — mọi handler đều thoát
 *     sớm khi thao tác nằm trong input/textarea/select/contenteditable.
 *  2. KHÔNG dùng vòng lặp debugger, không hẹn giờ dày, không tự tải lại trang.
 *     Nhận nhầm (false positive) chỉ được làm mờ tạm thời và TỰ HỒI PHỤC.
 *  3. KHÔNG ảnh hưởng trình đọc màn hình: user-select không đụng tới cây trợ
 *     năng, và không có nội dung nào bị gỡ khỏi DOM.
 */
(function () {
  'use strict';

  var EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  var doc = document, root = doc.documentElement;

  function inEditable(node) {
    if (!node) return false;
    var el = node.nodeType === 3 ? node.parentElement : node;
    return !!(el && el.closest && el.closest(EDITABLE));
  }
  function selectionInEditable() {
    var s = window.getSelection && window.getSelection();
    if (!s || s.rangeCount === 0) return false;
    return inEditable(s.anchorNode) || inEditable(s.focusNode);
  }

  /* ------------------------- 1. chặn sao chép ------------------------- */

  var NOTICE = 'Nội dung từ Vdearypto — vui lòng dẫn nguồn https://vdearypto.vercel.app';

  function onCopy(e) {
    if (selectionInEditable()) return;               // trong ô nhập thì cho copy
    // Chặn VÔ ĐIỀU KIỆN ở ngoài ô nhập. Trước đây tôi chỉ chặn khi có chữ đang
    // bôi đen — nhưng chính user-select:none làm getSelection() luôn trả chuỗi
    // rỗng (đo được: rangeCount = 1 mà toString().length = 0), nên nhánh chặn
    // không bao giờ chạy. Chặn thẳng vừa đúng ý vừa kiểm chứng được.
    e.preventDefault();
    // Thay vì để clipboard rỗng (người dùng tưởng máy hỏng), đặt một dòng ghi
    // nguồn: vẫn không mang nội dung site đi, mà hành vi thì rõ ràng.
    try { (e.clipboardData || window.clipboardData).setData('text/plain', NOTICE); } catch (err) {}
  }

  doc.addEventListener('copy', onCopy, true);
  doc.addEventListener('cut', onCopy, true);

  doc.addEventListener('contextmenu', function (e) {
    if (inEditable(e.target)) return;
    e.preventDefault();
  });

  doc.addEventListener('dragstart', function (e) {
    if (inEditable(e.target)) return;
    // Ảnh và chữ không kéo đi được; link vẫn kéo thả bình thường thì không sao,
    // nhưng chặn luôn cho nhất quán vì kéo link cũng mang theo tiêu đề.
    e.preventDefault();
  });

  /* --------------------- 2. phím tắt sao chép / xem mã ---------------- */

  var BLOCK_CTRL = { c: 1, x: 1, u: 1, s: 1, p: 1 };   // copy, cut, view-source, save, print

  function onKeyDown(e) {
    var k = (e.key || '').toLowerCase();

    // F12 và bộ ba mở DevTools
    var devtools = k === 'f12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c'));
    if (devtools) { e.preventDefault(); flagSuspicious('phím tắt DevTools'); return; }

    // PrintScreen: không chặn được ảnh chụp, nhưng dọn clipboard là có ích thật
    if (k === 'printscreen' || e.code === 'PrintScreen') {
      wipeClipboard();
      flagSuspicious('PrintScreen');
      return;
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (inEditable(e.target)) return;                 // Ctrl+C trong ô nhập vẫn chạy
    if (BLOCK_CTRL[k]) e.preventDefault();
  }
  doc.addEventListener('keydown', onKeyDown, true);

  function wipeClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(NOTICE).catch(function () {});
      }
    } catch (e) {}
  }

  /* -------------------- 3. dò DevTools (nhẹ, tự hồi phục) ------------- */

  var suspicious = false, suspectTimer = 0;

  function setSuspicious(on, why) {
    if (suspicious === on) return;
    suspicious = on;
    root.classList.toggle('vd-guard', on);
    banner(on, why);
  }

  // Nhận nhầm KHÔNG được làm hỏng trang: chỉ mờ tạm, và tự gỡ sau 8 giây nếu
  // dấu hiệu không còn.
  function flagSuspicious(why) {
    setSuspicious(true, why);
    clearTimeout(suspectTimer);
    suspectTimer = setTimeout(function () { if (!dockedDevtools()) setSuspicious(false); }, 8000);
  }

  // Chỉ bắt được DevTools GẮN TRONG cửa sổ. Mở ra cửa sổ riêng thì cách này
  // không thấy — nói rõ để không ai tưởng là kín.
  function dockedDevtools() {
    var dw = window.outerWidth - window.innerWidth;
    var dh = window.outerHeight - window.innerHeight;
    return dw > 170 || dh > 170;
  }

  var pollTimer = 0;
  function poll() {
    if (!doc.hidden) {
      var on = dockedDevtools();
      if (on !== suspicious) setSuspicious(on, 'DevTools');
    }
  }
  // 2 giây/lần, dừng hẳn khi tab ẩn — không phải vòng lặp chiếm CPU.
  function startPoll() { if (!pollTimer) pollTimer = setInterval(poll, 2000); }
  function stopPoll() { clearInterval(pollTimer); pollTimer = 0; }
  doc.addEventListener('visibilitychange', function () { doc.hidden ? stopPoll() : (poll(), startPoll()); });

  var resizeRaf = 0;
  window.addEventListener('resize', function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () { resizeRaf = 0; poll(); });
  }, { passive: true });

  /* ------------------------- băng cảnh báo ---------------------------- */

  var bar = null;
  function banner(show, why) {
    if (!show) { if (bar) { bar.hidden = true; } return; }
    if (!bar) {
      bar = doc.createElement('div');
      bar.className = 'vd-guard-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<b>Chế độ bảo vệ nội dung</b> — dữ liệu phân tích đang được làm mờ. ' +
        'Đóng công cụ nhà phát triển để xem lại.<button type="button" aria-label="Đóng">✕</button>';
      bar.querySelector('button').addEventListener('click', function () { setSuspicious(false); });
      doc.body.appendChild(bar);
    }
    bar.hidden = false;
    bar.dataset.why = why || '';
  }

  /* ------------------------- 4. watermark ----------------------------- */

  /*
   * Mã truy vết: id người dùng nếu đã đăng nhập, không thì một mã ngẫu nhiên
   * theo trình duyệt. Đây KHÔNG phải secret — nó chỉ để truy nguồn ảnh chụp bị
   * phát tán — nên để trong localStorage là đúng chỗ.
   */
  function traceId() {
    var id = '';
    try { id = (window.Clerk && window.Clerk.user && window.Clerk.user.id) || ''; } catch (e) {}
    if (!id) {
      try {
        id = localStorage.getItem('vdear.trace') || '';
        if (!id) {
          var b = new Uint8Array(8);
          (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.set([1,2,3,4,5,6,7,8]);
          id = Array.from(b).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
          localStorage.setItem('vdear.trace', id);
        }
      } catch (e) { id = 'anon'; }
    }
    return id;
  }
  // Che bớt: đủ để đối chiếu khi cần, không phơi nguyên id ra ảnh.
  function maskId(id) {
    if (id.length <= 6) return id;
    return id.slice(0, 4) + '…' + id.slice(-2);
  }

  var wmUrl = '', wmAt = 0;
  function wmTile() {
    var now = Date.now();
    if (wmUrl && now - wmAt < 60000) return wmUrl;    // dựng lại mỗi phút, không hơn
    wmAt = now;
    var d = new Date(now);
    var stamp = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0') + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' +
      String(d.getUTCMinutes()).padStart(2, '0') + 'Z';
    var text = 'vdearypto · ' + maskId(traceId()) + ' · ' + stamp;
    var S = 340;
    var c = doc.createElement('canvas');
    c.width = S; c.height = S;
    var g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    g.rotate(-Math.PI / 6);
    g.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    var light = root.getAttribute('data-theme') === 'light';
    g.fillStyle = light ? 'rgba(20,16,6,.085)' : 'rgba(255,255,255,.075)';
    // Lệch nhẹ theo phút -> ảnh chụp hai thời điểm không trùng lưới, khó ghép
    // để xoá bằng cách chồng ảnh.
    var jitter = (d.getUTCMinutes() % 5) * 12;
    g.fillText(text, jitter - 40, -60);
    g.fillText(text, jitter + 20, 60);
    wmUrl = c.toDataURL('image/png');
    return wmUrl;
  }

  function paintWatermarks() {
    var url = wmTile();
    var list = doc.querySelectorAll('[data-watermark]');
    for (var i = 0; i < list.length; i++) {
      var host = list[i];
      var layer = host.querySelector(':scope > .vd-wm');
      if (!layer) {
        layer = doc.createElement('div');
        layer.className = 'vd-wm';
        layer.setAttribute('aria-hidden', 'true');
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(layer);
      }
      layer.style.backgroundImage = 'url(' + url + ')';
    }
  }

  /* ---------------------------- khởi động ----------------------------- */

  function init() {
    root.classList.add('vd-protect');
    paintWatermarks();
    setInterval(paintWatermarks, 60000);   // 1 phút/lần: không đáng kể về hiệu năng
    startPoll();
    poll();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();

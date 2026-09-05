/*
 * Vdear — hộp thoại "Tạo ảnh chia sẻ".
 *
 * Việc vẽ nằm ở js/share.js. Tệp này lo phần người dùng chạm vào: mở hộp thoại,
 * đổi tỉ lệ, đổi nền, tải về, chép vào clipboard, và ô caption chép được.
 *
 * Nút bấm KHÔNG tự tính lại chỉ báo: nó nhận một hàm snapshot() do trang cung
 * cấp, trả về đúng những con số đang hiện trên màn hình. Tính lại lúc bấm thì
 * ảnh có thể khác thứ người dùng vừa nhìn thấy.
 */
(function () {
  var T = function (k, v) { return window.VdearI18n ? window.VdearI18n.t(k, v) : k; };
  var state = { ratio: 'portrait', preset: 0, snap: null };
  var root = null, canvas = null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function build() {
    if (root) return root;
    root = el('div', 'sh-root');
    root.hidden = true;
    root.innerHTML =
      '<div class="sh-scrim" data-sh-close></div>'
      + '<div class="sh-box" role="dialog" aria-modal="true" aria-labelledby="shTitle">'
      + '  <div class="sh-head"><b id="shTitle"></b>'
      + '    <button type="button" class="sh-x" data-sh-close aria-label="">✕</button></div>'
      + '  <div class="sh-body">'
      + '    <div class="sh-preview"><canvas id="shCanvas"></canvas></div>'
      + '    <div class="sh-side">'
      + '      <div class="sh-group"><span class="sh-lab" data-sh="ratio"></span>'
      + '        <div class="sh-segs" id="shRatio"></div></div>'
      + '      <div class="sh-group"><span class="sh-lab" data-sh="preset"></span>'
      + '        <div class="sh-segs" id="shPreset"></div></div>'
      + '      <div class="sh-group"><span class="sh-lab" data-sh="caption"></span>'
      + '        <textarea id="shCap" class="sh-cap" rows="8" spellcheck="false"></textarea>'
      + '        <button type="button" class="jr-btn sh-w" id="shCopyCap"></button></div>'
      + '      <div class="sh-actions">'
      + '        <button type="button" class="btn-primary sh-w" id="shDownload"></button>'
      + '        <button type="button" class="jr-btn sh-w" id="shCopyImg"></button>'
      + '      </div>'
      + '      <p class="sh-note" id="shNote"></p>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(root);
    canvas = root.querySelector('#shCanvas');

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-sh-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root && !root.hidden) close();
    });
    root.querySelector('#shDownload').addEventListener('click', download);
    root.querySelector('#shCopyImg').addEventListener('click', copyImage);
    root.querySelector('#shCopyCap').addEventListener('click', copyCaption);
    window.addEventListener('vdear:langchange', function () { if (root && !root.hidden) refresh(); });
    return root;
  }

  function segs(id, items, cur, onPick) {
    var box = root.querySelector('#' + id);
    box.innerHTML = '';
    items.forEach(function (it, i) {
      var b = el('button', 'sh-seg' + (i === cur ? ' on' : ''), it.label);
      b.type = 'button';
      b.addEventListener('click', function () { onPick(i); });
      box.appendChild(b);
    });
  }

  function labels() {
    root.querySelector('#shTitle').textContent = T('share.title');
    root.querySelector('.sh-x').setAttribute('aria-label', T('share.close'));
    root.querySelector('[data-sh="ratio"]').textContent = T('share.ratio');
    root.querySelector('[data-sh="preset"]').textContent = T('share.preset');
    root.querySelector('[data-sh="caption"]').textContent = T('share.caption');
    root.querySelector('#shCopyCap').textContent = T('share.copyCaption');
    root.querySelector('#shDownload').textContent = T('share.download');
    root.querySelector('#shCopyImg').textContent = T('share.copyImage');
    root.querySelector('#shNote').textContent = T('share.note');
  }

  async function refresh() {
    labels();
    segs('shRatio', [
      { label: T('share.portrait') }, { label: T('share.landscape') },
    ], state.ratio === 'portrait' ? 0 : 1, function (i) {
      state.ratio = i === 0 ? 'portrait' : 'landscape'; refresh();
    });
    segs('shPreset', window.VdearShare.PRESETS.map(function (p, i) {
      return { label: T('share.preset.' + p.id) || String(i + 1) };
    }), state.preset, function (i) { state.preset = i; refresh(); });

    root.querySelector('#shCap').value = window.VdearShare.caption(state.snap || {});
    await window.VdearShare.draw(canvas, state.snap || {}, { ratio: state.ratio, preset: state.preset });
    // Khung xem trước co theo tỉ lệ ảnh thật, không kéo giãn: người dùng phải
    // thấy đúng bố cục sẽ tải về.
    canvas.style.aspectRatio = canvas.width + ' / ' + canvas.height;
  }

  function fileName() {
    var s = state.snap || {};
    return 'vdear-' + (s.coin || 'signal').toLowerCase() + '-' + state.ratio + '.png';
  }

  function toBlob() {
    return new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
  }

  async function download() {
    var b = await toBlob();
    if (!b) return;
    var url = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function flash(btn, key) {
    var old = btn.textContent;
    btn.textContent = T(key);
    setTimeout(function () { btn.textContent = old; }, 1800);
  }

  async function copyImage() {
    var btn = root.querySelector('#shCopyImg');
    // Chép ẢNH vào clipboard cần ClipboardItem — Safari cũ và Firefox mặc định
    // không có. Không im lặng thất bại: nói thẳng là hãy dùng nút Tải về.
    if (!(navigator.clipboard && window.ClipboardItem)) { flash(btn, 'share.copyUnsupported'); return; }
    try {
      var b = await toBlob();
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': b })]);
      flash(btn, 'share.copied');
    } catch (e) {
      flash(btn, 'share.copyFailed');
    }
  }

  async function copyCaption() {
    var btn = root.querySelector('#shCopyCap');
    var ta = root.querySelector('#shCap');
    try {
      await navigator.clipboard.writeText(ta.value);
      flash(btn, 'share.copied');
    } catch (e) {
      // Không có quyền clipboard thì bôi đen sẵn để người dùng Ctrl+C — vẫn
      // làm được việc, chỉ thêm một phím.
      ta.focus(); ta.select();
      flash(btn, 'share.selectManually');
    }
  }

  function close() { if (root) root.hidden = true; }

  async function open(snapshot) {
    build();
    state.snap = snapshot || {};
    root.hidden = false;
    await refresh();
  }

  /*
   * Gắn một nút vào chỗ có sẵn. `getSnap` được gọi LÚC BẤM để lấy đúng số đang
   * hiện, không phải lúc gắn nút.
   */
  function attach(host, getSnap) {
    if (!host) return null;
    var b = el('button', 'jr-save sh-open');
    b.type = 'button';
    b.setAttribute('data-i18n', 'share.open');
    b.textContent = T('share.open');
    b.addEventListener('click', function () {
      var s = null;
      try { s = getSnap(); } catch (e) { s = null; }
      if (s) open(s);
    });
    host.appendChild(b);
    return b;
  }

  window.VdearShareUI = { open: open, attach: attach, _state: state };
})();

/** Hàm thuần để hiển thị thư — không đụng DOM, kiểm thử được bằng node. */

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function senderLabel(from) {
  if (!from) return '(không rõ người gửi)';
  return from.name?.trim() || from.address || '(không rõ người gửi)';
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Hôm nay thì chỉ giờ:phút; ngày khác thì ngày/tháng. Ngày hỏng → "—". */
export function formatWhen(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameDay = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, '0');
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function linkify(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`);
}

/**
 * Dựng srcdoc cho iframe hiển thị thư.
 *
 * An toàn dựa vào hai lớp:
 *  1. iframe đặt sandbox KHÔNG có allow-scripts / allow-same-origin (ở app.js),
 *     nên script trong thư không chạy và không đọc được localStorage chứa mật khẩu.
 *  2. CSP ngay trong srcdoc: mặc định chặn ảnh từ xa (ảnh theo dõi báo cho người
 *     gửi biết bạn đã mở thư). Người dùng bấm "Hiện ảnh" thì mới cho phép.
 */
export function buildSrcdoc(message, { allowRemote = false } = {}) {
  const img = allowRemote ? "data: cid: https: http:" : "data: cid:";
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${img}; font-src data:`;
  const htmlParts = Array.isArray(message?.html) ? message.html : (typeof message?.html === 'string' ? [message.html] : []);
  const body = htmlParts.length
    ? htmlParts.join('\n')
    : `<pre class="plain">${linkify(escapeHtml(message?.text || '(thư trống)'))}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html,body{margin:0;padding:16px;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1d1d1f;background:#fff;word-wrap:break-word}
  img{max-width:100%;height:auto}
  pre.plain{white-space:pre-wrap;font:inherit;margin:0}
  a{color:#0b63ce}
</style></head><body>${body}</body></html>`;
}

/** Thư có ảnh từ xa không — để biết có nên hiện nút "Hiện ảnh". */
export function hasRemoteImages(message) {
  const html = Array.isArray(message?.html) ? message.html.join('') : String(message?.html || '');
  return /<img[^>]+src=["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
}

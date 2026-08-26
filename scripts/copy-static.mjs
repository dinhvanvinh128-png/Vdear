/*
 * Đưa toàn bộ trang tĩnh vào `public/` trước khi Next build.
 *
 * Bản tĩnh trong `legacy-static/` vẫn là NGUỒN DUY NHẤT để sửa. Chép lúc build
 * thay vì commit hai bản: hai bản sẽ lệch nhau, và lệch âm thầm.
 *
 * `index.html` được đổi tên thành `classic.html` vì Next đã sở hữu đường dẫn
 * `/` — đó là trang Crypto Market Intelligence mới. Bảng cũ không mất, chỉ
 * chuyển chỗ.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'legacy-static');
const OUT = path.join(ROOT, 'public');

let copied = 0;
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    // index.html va với route `/` của Next -> phát hành dưới tên classic.html
    const name = e.name === 'index.html' && from === SRC ? 'classic.html' : e.name;
    const d = path.join(to, name);
    if (e.isDirectory()) copyDir(s, d);
    else { fs.copyFileSync(s, d); copied++; }
  }
}

if (!fs.existsSync(SRC)) {
  console.error('[copy-static] không thấy legacy-static/, bỏ qua');
  process.exit(0);
}
copyDir(SRC, OUT);
console.log(`[copy-static] đã chép ${copied} file từ legacy-static/ vào public/`);

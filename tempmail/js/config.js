/**
 * Đường gọi API:
 *  - PROXY_BASE: hàm api/mailtm.js chạy trên Vercel, cùng tên miền với web
 *    (tránh CORS / trình chặn quảng cáo / nhà mạng chặn). null = không dùng.
 *  - DIRECT_FALLBACK: proxy hỏng thì trình duyệt gọi thẳng nhà cung cấp.
 *  - PROVIDERS_ORDER: thứ tự thử khi tạo hộp thư mới (mail.tm, rồi mail.gw).
 * Nhà cung cấp đổi địa chỉ: đặt MAILTM_UPSTREAM / MAILGW_UPSTREAM trên Vercel
 * và sửa PROVIDERS trong js/mailtm.js + connect-src trong vercel.json.
 */
export const PROXY_BASE = '/api/mailtm';
export const DIRECT_FALLBACK = true;
export const PROVIDERS_ORDER = ['tm', 'gw'];

/** Bao lâu kiểm tra thư mới một lần (ms), chỉ khi tab đang mở. */
export const POLL_MS = 10_000;

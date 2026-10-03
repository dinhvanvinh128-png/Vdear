/**
 * Địa chỉ API. Mặc định là API công khai của mail.tm (https://docs.mail.tm).
 * Nếu mail.tm đổi địa chỉ, sửa ở đây VÀ sửa `connect-src` trong vercel.json,
 * nếu không trình duyệt sẽ chặn lệnh gọi.
 */
export const API_BASE = 'https://api.mail.tm';

/** Bao lâu kiểm tra thư mới một lần (ms), chỉ khi tab đang mở. */
export const POLL_MS = 10_000;

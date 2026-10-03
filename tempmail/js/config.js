/**
 * Mặc định web gọi mail.tm QUA proxy cùng tên miền (api/mailtm.js chạy trên
 * Vercel), vì gọi thẳng api.mail.tm từ trình duyệt có thể bị CORS, trình chặn
 * quảng cáo hoặc nhà mạng chặn ("Failed to fetch").
 *
 * Muốn gọi thẳng (vd. host tĩnh không có serverless): đặt
 *   API_BASE = 'https://api.mail.tm', USE_PROXY = false
 * và thêm https://api.mail.tm vào connect-src trong vercel.json.
 * Nếu mail.tm đổi địa chỉ: đặt biến môi trường MAILTM_UPSTREAM trên Vercel.
 */
export const API_BASE = '/api/mailtm';
export const USE_PROXY = true;

/** Bao lâu kiểm tra thư mới một lần (ms), chỉ khi tab đang mở. */
export const POLL_MS = 10_000;

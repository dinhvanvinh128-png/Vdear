/*
 * Vdear — CẤU HÌNH CÔNG KHAI (an toàn để đưa lên web).
 * Chỉ điền KHOÁ CÔNG KHAI vào đây. TUYỆT ĐỐI KHÔNG đặt secret ở file này
 * (service_role, clerk secret, resend, upstash, pinecone, openai...) — chúng
 * chỉ chạy phía server (Cloudflare/Next.js) sau này.
 *
 * Cách điền: mở file, dán giá trị vào giữa hai dấu nháy "".
 * Chỗ nào để trống thì tính năng đó tự tắt (không gây lỗi).
 */
window.VDEAR_ENV = {
  SITE_URL: "",                    // vd "https://vdear.io"

  // Supabase (công khai) — để đồng bộ "Yêu thích" khi bật
  SUPABASE_URL: "",                // https://xxxx.supabase.co
  SUPABASE_ANON_KEY: "",           // anon / publishable key

  // Clerk (công khai) — hiện nút Đăng nhập khi có
  CLERK_PUBLISHABLE_KEY: "",       // pk_test_... hoặc pk_live_...
  SIGN_IN_URL: "/sign-in",

  // PostHog (khoá phc_ là công khai)
  POSTHOG_KEY: "",                 // phc_...
  POSTHOG_HOST: "https://us.i.posthog.com",

  // Sentry (DSN là công khai)
  SENTRY_DSN: "",                  // https://....ingest.sentry.io/....
};

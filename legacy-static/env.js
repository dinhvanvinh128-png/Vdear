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
  SITE_URL: "",                         // để trống cũng được (hoặc domain khi có)

  // Supabase (công khai)
  SUPABASE_URL: "https://bsazxdcoatwulmxbwyow.supabase.co",   // ← project của bạn (đã biết)
  SUPABASE_ANON_KEY: "sb_publishable_gNOF46lTsGF1abdfRNm5Hg_wlxr3KfY",   // Supabase → API Keys → Publishable (sb_publishable_...) hoặc anon

  // Clerk (công khai)
  CLERK_PUBLISHABLE_KEY: "pk_test_dG9wLWNyaWNrZXQtNzA1NC5jbGVyay5hY2NvdW50cy5kZXYk",   // Clerk → API keys → Publishable (pk_test_...)
  SIGN_IN_URL: "/sign-in",

  // PostHog (để trống nếu chưa dùng)
  POSTHOG_KEY: "phc_qfnACm84SNZ3UyDpVXcwZsCwncKHZ525XRG7VKsq7xSh",
  POSTHOG_HOST: "https://us.i.posthog.com",

  // Sentry (để trống nếu chưa dùng)
  SENTRY_DSN: "https://b1bdeefd98a7d0082f83e7a4b77e6a15@o4511943176749056.ingest.de.sentry.io/4511943199227984",
};

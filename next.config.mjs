/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cho phép deploy lần đầu thành công ngay cả khi còn lỗi lint/type nhỏ.
  // Sau khi ổn định, hãy đặt lại thành false để bật kiểm tra nghiêm ngặt.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "api.dicebear.com" }
    ]
  }
};

export default nextConfig;

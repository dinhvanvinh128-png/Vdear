import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/toast";
import { PWARegister } from "@/components/pwa-register";
import { CloudSync } from "@/components/cloud-sync";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});
const serif = Lora({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-serif"
});

const siteName = "Gia Phả Dòng Họ Lê";
const description =
  "Website gia phả dòng họ — lưu trữ, quản lý và trực quan hóa cây phả hệ, thành viên, chi họ, lịch sử, sự kiện và lịch giỗ của dòng họ.";

export const metadata: Metadata = {
  metadataBase: new URL("https://gia-pha.vercel.app"),
  title: {
    default: siteName,
    template: `%s · ${siteName}`
  },
  description,
  keywords: ["gia phả", "phả hệ", "dòng họ", "cây gia phả", "family tree", "dòng họ Lê"],
  openGraph: {
    title: siteName,
    description,
    type: "website",
    locale: "vi_VN",
    siteName
  },
  twitter: { card: "summary_large_image", title: siteName, description },
  robots: { index: true, follow: true },
  applicationName: "Gia Phả Lê",
  appleWebApp: { capable: true, title: "Gia Phả Lê", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  themeColor: "#7E1C1C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster />
        <PWARegister />
        <CloudSync />
      </body>
    </html>
  );
}

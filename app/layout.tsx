import type { Metadata } from "next";
import { Be_Vietnam_Pro, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});
const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

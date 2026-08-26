import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { BottomNav } from '@/components/layout/BottomNav';
import { Footer } from '@/components/layout/Footer';
import { TickerBar } from '@/components/TickerBar';
import { siteUrl } from '@/lib/site';

const SITE = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'Vdearypto — Crypto Intelligence Terminal',
    template: '%s · Vdearypto',
  },
  description:
    'Spot-flow-driven crypto market intelligence: cumulative volume delta, market breadth, '
    + 'stablecoin liquidity, on-chain activity, whale flow and market regime — scored from live '
    + 'Binance, OKX, Bybit and Bitget data with derivatives used only as confirmation.',
  keywords: [
    'crypto market intelligence', 'CVD', 'cumulative volume delta', 'spot flow',
    'market breadth', 'stablecoin liquidity', 'money flow', 'market regime',
    'accumulation distribution', 'on-chain', 'whale flow', 'Binance', 'OKX', 'Bybit', 'Bitget',
  ],
  openGraph: {
    title: 'Vdearypto — Crypto Intelligence Terminal',
    description:
      'Data to evidence to score to regime. Spot flow first; derivatives confirm.',
    url: SITE, siteName: 'Vdearypto', type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'Vdearypto — Crypto Intelligence Terminal' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0A0906',   // bằng --bg; giá trị cũ là màu của bảng màu trước
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" data-theme="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-text antialiased">
        <div className="flex">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopNav />
            <TickerBar />
            <main className="min-h-[calc(100vh-100px)] px-4 pb-24 pt-5 lg:pb-10">
              <div className="mx-auto max-w-7xl">{children}</div>
            </main>
            <Footer />
          </div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}

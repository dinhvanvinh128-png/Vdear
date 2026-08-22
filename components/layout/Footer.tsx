export function Footer() {
  return (
    <footer className="mt-10 border-t border-border px-4 py-6 text-xs text-muted">
      <div className="mx-auto max-w-7xl space-y-2">
        <p className="max-w-3xl">
          <span className="font-semibold text-text">VDEAR Crypto</span> cung cấp dữ liệu và công cụ
          phân tích thị trường nhằm mục đích thông tin, không phải lời khuyên đầu tư. VDEAR Crypto
          provides market data and analytics for informational purposes only — not financial advice.
        </p>
        <p>
          Market data aggregated from Binance, OKX, Bybit, and Bitget public APIs. Liquidation data is
          exchange-derived and estimated unless a CoinGlass integration is configured. Any AI-generated
          analysis is labelled as such and is not financial advice.
        </p>
        <p className="text-muted/70">© {new Date().getFullYear()} VDEAR Crypto.</p>
      </div>
    </footer>
  );
}

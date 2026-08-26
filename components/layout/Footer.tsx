export function Footer() {
  return (
    <footer className="mt-10 border-t border-border px-4 py-6 text-xs text-muted">
      <div className="mx-auto max-w-7xl space-y-2">
        <p className="max-w-3xl">
          <span className="font-semibold text-text">Vdearypto</span> cung cấp dữ liệu và công cụ
          phân tích thị trường nhằm mục đích thông tin, không phải lời khuyên đầu tư. VDEAR Crypto
          provides market data and analytics for informational purposes only — not financial advice.
        </p>
        <p>
          Market data aggregated from Binance, OKX, Bybit, and Bitget public APIs. Liquidation data is
          exchange-derived and estimated unless a CoinGlass integration is configured. Any AI-generated
          analysis is labelled as such and is not financial advice.
        </p>
        {/* Các trang pháp lý là HTML tĩnh trong public/, không phải route của app,
            nên dùng <a> chứ không dùng next/link — Link sẽ cố điều hướng phía
            client tới một route không tồn tại. */}
        <nav className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          <a className="hover:text-text" href="/about.html">Giới thiệu</a>
          <a className="hover:text-text" href="/terms.html">Điều khoản</a>
          <a className="hover:text-text" href="/privacy.html">Bảo mật</a>
          <a className="hover:text-text" href="/risk.html">Khuyến cáo rủi ro</a>
          <a className="hover:text-text" href="/contact.html">Liên hệ</a>
          <a className="hover:text-text" href="/classic.html">Bảng Futures (bản cũ)</a>
          <a className="hover:text-text" href="/bubbles.html">Bong bóng thị trường</a>
        </nav>
        <p className="text-muted/70">© {new Date().getFullYear()} Vdearypto.</p>
      </div>
    </footer>
  );
}

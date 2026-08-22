/**
 * Symbol helpers + the default coin universe VDEAR tracks by name.
 *
 * Canonical VDEAR symbol = BASE + QUOTE with no separator, e.g. "BTCUSDT".
 * Each adapter converts this to/from its own native symbol format.
 */

export const QUOTE = 'USDT';

/** Curated list shown across the app (ticker bar, futures table, quick nav). */
export const DEFAULT_BASES = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX',
  'SUI', 'LINK', 'TRX', 'DOT', 'TON', 'WLD', 'NEAR', 'APT',
  'LTC', 'BCH', 'ARB', 'OP', 'INJ', 'SEI', 'TIA', 'PEPE',
];

/** Coins pinned to the top ticker bar. */
export const TICKER_BASES = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'SUI', 'WLD', 'DOGE'];

/** Stablecoins excluded from movers/heatmap. */
export const STABLES = new Set([
  'USDT', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'BUSD', 'USDP', 'USDD', 'PYUSD', 'EURT', 'USTC',
]);

export function toCanonical(base: string, quote: string = QUOTE): string {
  return `${base.toUpperCase()}${quote.toUpperCase()}`;
}

/** Split a canonical symbol into base/quote for the common quote assets. */
export function splitSymbol(symbol: string): { base: string; quote: string } {
  const s = symbol.toUpperCase();
  for (const q of ['USDT', 'USDC', 'USD', 'FDUSD', 'BUSD']) {
    if (s.endsWith(q) && s.length > q.length) {
      return { base: s.slice(0, s.length - q.length), quote: q };
    }
  }
  return { base: s, quote: '' };
}

export function isStable(base: string): boolean {
  return STABLES.has(base.toUpperCase());
}

/** CoinGecko/TradingView logo URL for a base asset (best-effort). */
export function logoUrl(base: string): string {
  return `https://s3-symbol-logo.tradingview.com/crypto/XTVC${base.toUpperCase()}.svg`;
}

import type { Metadata } from 'next';
import { CoinHeader } from '@/components/coin/CoinHeader';
import { PriceChart } from '@/components/PriceChart';
import { ExchangeComparison } from '@/components/ExchangeComparison';
import { CoinDerivatives } from '@/components/coin/CoinDerivatives';
import { splitSymbol } from '@/lib/symbols';

function baseOf(raw: string) {
  const s = decodeURIComponent(raw).toUpperCase();
  return splitSymbol(s).quote ? splitSymbol(s).base : s;
}

export function generateMetadata({ params }: { params: { symbol: string } }): Metadata {
  const base = baseOf(params.symbol);
  return {
    title: `${base} price, futures & liquidations`,
    description: `${base}/USDT real-time price, multi-exchange comparison, funding rate, open interest and long/short — aggregated by VDEAR Crypto.`,
  };
}

export default function CoinPage({ params }: { params: { symbol: string } }) {
  const base = baseOf(params.symbol);
  return (
    <div className="space-y-4">
      <CoinHeader base={base} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><PriceChart base={base} /></div>
        <ExchangeComparison base={base} />
      </div>
      <CoinDerivatives base={base} />
      <p className="text-xs text-muted">
        Data aggregated from Binance · OKX · Bybit · Bitget. Informational only — not financial advice.
      </p>
    </div>
  );
}

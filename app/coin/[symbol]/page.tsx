import type { Metadata } from 'next';
import { CoinHeader } from '@/components/coin/CoinHeader';
import { PriceChart } from '@/components/PriceChart';
import { ExchangeComparison } from '@/components/ExchangeComparison';
import { CoinDerivatives } from '@/components/coin/CoinDerivatives';
import { CoinIntelligence } from '@/components/intelligence/CoinIntelligence';
import { splitSymbol } from '@/lib/symbols';

function baseOf(raw: string) {
  const s = decodeURIComponent(raw).toUpperCase();
  return splitSymbol(s).quote ? splitSymbol(s).base : s;
}

export function generateMetadata({ params }: { params: { symbol: string } }): Metadata {
  const base = baseOf(params.symbol);
  return {
    title: `${base} analysis — spot flow, CVD & market regime`,
    description: `${base}/USDT spot flow, cumulative volume delta, order book imbalance, market `
      + `regime and money flow score, built from live Binance, OKX, Bybit and Bitget data.`,
  };
}

export default function CoinPage({ params }: { params: { symbol: string } }) {
  const base = baseOf(params.symbol);
  return (
    <div className="space-y-4">
      <CoinHeader base={base} />

      {/* Intelligence first: flow and regime, then price, then derivatives as
          confirmation — the order the scoring model actually reasons in. */}
      <CoinIntelligence base={base} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><PriceChart base={base} /></div>
        <ExchangeComparison base={base} />
      </div>

      <CoinDerivatives base={base} />

      <p className="text-xs leading-relaxed text-muted">
        Data aggregated from Binance · OKX · Bybit · Bitget, with on-chain and liquidity data from
        Coin Metrics, DeFiLlama and GeckoTerminal. Vdearypto reports probability and confidence —
        informational analysis, not financial advice.
      </p>
    </div>
  );
}

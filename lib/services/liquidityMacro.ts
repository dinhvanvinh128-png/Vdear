/**
 * Market-wide liquidity: stablecoin supply and DeFi/DEX activity.
 *
 * Both providers are keyless. When one fails the other still produces its half,
 * and the unavailable side is returned as a REASON rather than a zero — the
 * scoring layer needs the reason to renormalise honestly.
 */
import type { Envelope } from '@/lib/types';
import { cached, TTL } from '@/lib/cache';
import { getStablecoinSupply, getTvl, getDexVolume } from '@/lib/providers/defillama/client';
import { getNetworkPools } from '@/lib/providers/geckoterminal/client';
import { computeStablecoinMetrics, type StablecoinMetrics } from '@/lib/engines/stablecoin';
import { computeDefiMetrics, type DefiMetrics } from '@/lib/engines/defi';

export interface MacroLiquidity {
  stablecoin: StablecoinMetrics | null;
  stablecoinReason: string | null;
  defi: DefiMetrics;
  /** Provider failures, safe to display. */
  unavailable: { source: string; reason: string }[];
}

/** Macro liquidity moves slowly; a 5-minute TTL is generous and kind to quotas. */
const MACRO_TTL = 5 * 60_000;

export async function getMacroLiquidity(): Promise<Envelope<MacroLiquidity>> {
  const res = await cached('macro-liquidity', MACRO_TTL, async (): Promise<MacroLiquidity> => {
    const [supply, tvl, dex, pools] = await Promise.all([
      getStablecoinSupply(), getTvl(), getDexVolume(), getNetworkPools('eth'),
    ]);

    const unavailable: { source: string; reason: string }[] = [];
    if (!supply.ok) unavailable.push({ source: 'DeFiLlama stablecoins', reason: supply.message });
    if (!tvl.ok) unavailable.push({ source: 'DeFiLlama TVL', reason: tvl.message });
    if (!dex.ok) unavailable.push({ source: 'DeFiLlama DEX volume', reason: dex.message });
    if (!pools.ok) unavailable.push({ source: 'GeckoTerminal pools', reason: pools.message });

    return {
      stablecoin: supply.ok ? computeStablecoinMetrics(supply.data) : null,
      stablecoinReason: supply.ok ? null : supply.message,
      defi: computeDefiMetrics(
        tvl.ok ? tvl.data : null,
        dex.ok ? dex.data : null,
        pools.ok ? pools.data : null,
      ),
      unavailable,
    };
  });

  return envelopeFrom(res);
}

function envelopeFrom(data: MacroLiquidity): Envelope<MacroLiquidity> {
  return {
    data,
    meta: {
      kind: data.stablecoin || data.defi.inputs.length > 0 ? 'live' : 'unavailable',
      sources: [],
      errors: [],
      generatedAt: Date.now(),
      cached: false,
    },
  };
}

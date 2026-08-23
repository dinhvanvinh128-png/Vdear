/**
 * DeFiLlama — the free backbone of VDEAR's liquidity view.
 *
 * Endpoints used (all public, no key required):
 *   GET https://stablecoins.llama.fi/stablecoins?includePrices=false   supply + prev day/week/month
 *   GET https://api.llama.fi/v2/chains                                  TVL per chain
 *   GET https://api.llama.fi/v2/historicalChainTvl                      TVL daily series (for deltas)
 *   GET https://api.llama.fi/overview/dexs                              DEX volume overview
 *
 * DEFI_LLAMA_API_KEY is optional: it switches to the Pro host, which raises the
 * rate limit. Everything works without it — that is the point of free-first.
 */
import { request } from '@/lib/net/request';
import { envKey, fail, fromError, ok, type ProviderResult } from '@/lib/providers/types';
import type { DexVolume, StablecoinSupply, TvlSnapshot } from '@/lib/providers/defillama/types';
import {
  mapDexVolume, mapStablecoins, mapTvl,
  type RawChain, type RawDexOverview, type RawHistoricalTvl, type RawStablecoin,
} from '@/lib/providers/defillama/mapper';

const STABLE_BASE = 'https://stablecoins.llama.fi';
const API_BASE = 'https://api.llama.fi';
const PRO_BASE = 'https://pro-api.llama.fi';

export function defillamaConfigured(): boolean {
  return !!envKey('DEFI_LLAMA_API_KEY');
}

/** Pro puts the key in the path; free needs nothing. */
function apiBase(): string {
  const key = envKey('DEFI_LLAMA_API_KEY');
  return key ? `${PRO_BASE}/${key}/api` : API_BASE;
}

export async function getStablecoinSupply(): Promise<ProviderResult<StablecoinSupply>> {
  try {
    const raw = await request<{ peggedAssets?: RawStablecoin[] }>(
      `${STABLE_BASE}/stablecoins?includePrices=false`, { timeoutMs: 12_000 },
    );
    const mapped = mapStablecoins(raw);
    if (!mapped) return fail('defillama', 'no_data', 'DeFiLlama: empty stablecoin response');
    return ok('defillama', 'aggregated_api', mapped, mapped.observedAt);
  } catch (e) {
    return fromError('defillama', e);
  }
}

export async function getTvl(): Promise<ProviderResult<TvlSnapshot>> {
  try {
    // The chain list is required; the history is a bonus that only adds deltas,
    // so a failure there degrades the result instead of losing it.
    const chains = await request<RawChain[]>(`${apiBase()}/v2/chains`, { timeoutMs: 12_000 });
    let history: RawHistoricalTvl[] = [];
    try {
      history = await request<RawHistoricalTvl[]>(
        `${apiBase()}/v2/historicalChainTvl`, { timeoutMs: 12_000 },
      );
    } catch {
      history = [];
    }
    const mapped = mapTvl(chains, history);
    if (!mapped) return fail('defillama', 'no_data', 'DeFiLlama: empty TVL response');
    return ok('defillama', 'aggregated_api', mapped, mapped.observedAt);
  } catch (e) {
    return fromError('defillama', e);
  }
}

export async function getDexVolume(): Promise<ProviderResult<DexVolume>> {
  try {
    const raw = await request<RawDexOverview>(
      `${apiBase()}/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`,
      { timeoutMs: 12_000 },
    );
    const mapped = mapDexVolume(raw);
    if (!mapped) return fail('defillama', 'no_data', 'DeFiLlama: empty DEX overview');
    return ok('defillama', 'aggregated_api', mapped, mapped.observedAt);
  } catch (e) {
    return fromError('defillama', e);
  }
}

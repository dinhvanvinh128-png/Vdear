/**
 * GeckoTerminal API v2 (https://www.geckoterminal.com/dex-api) — free, no key.
 *
 *   GET /api/v2/networks/{network}/pools          top pools by liquidity
 *   GET /api/v2/networks/trending_pools           cross-chain trending
 *
 * The API version is pinned via the Accept header exactly as the docs require;
 * without it GeckoTerminal may serve a different schema.
 */
import { request } from '@/lib/net/request';
import { fail, fromError, ok, type ProviderResult } from '@/lib/providers/types';
import type { DexActivity } from '@/lib/providers/geckoterminal/types';
import { mapActivity, type RawPool } from '@/lib/providers/geckoterminal/mapper';

const BASE = 'https://api.geckoterminal.com/api/v2';
const ACCEPT = 'application/json;version=20230302';

/** Networks VDEAR tracks by default; extend freely, nothing else changes. */
export const DEFAULT_NETWORKS = ['eth', 'solana', 'bsc', 'arbitrum', 'base'] as const;
export type DexNetwork = (typeof DEFAULT_NETWORKS)[number] | string;

export async function getNetworkPools(
  network: DexNetwork = 'eth', page = 1,
): Promise<ProviderResult<DexActivity>> {
  try {
    const raw = await request<{ data?: RawPool[] }>(
      `${BASE}/networks/${encodeURIComponent(network)}/pools?page=${page}`,
      { headers: { accept: ACCEPT }, timeoutMs: 12_000 },
    );
    const mapped = mapActivity(raw, network);
    if (!mapped) return fail('geckoterminal', 'no_data', `GeckoTerminal: no pools for ${network}`);
    return ok('geckoterminal', 'onchain_direct', mapped, mapped.observedAt);
  } catch (e) {
    return fromError('geckoterminal', e);
  }
}

export async function getTrendingPools(
  network?: DexNetwork,
): Promise<ProviderResult<DexActivity>> {
  const path = network
    ? `/networks/${encodeURIComponent(network)}/trending_pools`
    : '/networks/trending_pools';
  try {
    const raw = await request<{ data?: RawPool[] }>(`${BASE}${path}`, {
      headers: { accept: ACCEPT }, timeoutMs: 12_000,
    });
    const mapped = mapActivity(raw, network ?? 'all');
    if (!mapped) return fail('geckoterminal', 'no_data', 'GeckoTerminal: no trending pools');
    return ok('geckoterminal', 'onchain_direct', mapped, mapped.observedAt);
  } catch (e) {
    return fromError('geckoterminal', e);
  }
}

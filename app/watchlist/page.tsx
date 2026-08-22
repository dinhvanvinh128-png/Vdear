'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { CoinTable } from '@/components/CoinTable';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { useFavorites } from '@/hooks/useFavorites';
import { getSupabase } from '@/lib/supabase/client';

export default function WatchlistPage() {
  const { user, configured } = useUser();
  const { favs, setFavs } = useFavorites();
  const synced = useRef(false);

  // On sign-in: pull cloud watchlist and merge with local (one-time).
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user || synced.current) return;
    synced.current = true;
    (async () => {
      const { data } = await sb.from('watchlist').select('symbol');
      const cloud = (data ?? []).map((r: { symbol: string }) => r.symbol.toUpperCase());
      const union = Array.from(new Set([...favs, ...cloud]));
      setFavs(union);
    })();
  }, [user, favs, setFavs]);

  // Push local favorites to cloud whenever they change (signed-in only).
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    (async () => {
      const { data } = await sb.from('watchlist').select('symbol');
      const cloud = new Set((data ?? []).map((r: { symbol: string }) => r.symbol.toUpperCase()));
      const toAdd = favs.filter((f) => !cloud.has(f));
      const toRemove = [...cloud].filter((c) => !favs.includes(c));
      if (toAdd.length) await sb.from('watchlist').upsert(toAdd.map((symbol) => ({ symbol })));
      if (toRemove.length) await sb.from('watchlist').delete().in('symbol', toRemove);
    })();
  }, [favs, user]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Watchlist"
        subtitle={user ? 'Synced to your account' : 'Saved on this device — sign in to sync across devices'}
        right={!user && configured ? <Link href="/login"><Button variant="primary" size="sm">Sign in to sync</Button></Link> : undefined}
      />
      {favs.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-8 text-center text-sm text-muted">
          No coins yet. Tap the ⭐ on any coin to add it here.
          <div className="mt-3"><Link href="/coins"><Button variant="outline" size="sm">Browse coins</Button></Link></div>
        </div>
      ) : (
        <CoinTable endpoint="/api/coins?market=futures&limit=500" showFunding favoritesOnly pageSize={50} />
      )}
    </div>
  );
}

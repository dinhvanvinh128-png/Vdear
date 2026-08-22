'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const base = q.trim().toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
    if (base) router.push(`/coin/${base}`);
  };

  return (
    <form onSubmit={submit} className="relative hidden sm:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search coin (BTC, ETH…)"
        className="h-9 w-44 rounded-lg border border-border bg-panel-2 pl-8 pr-3 text-sm text-text placeholder:text-muted focus:w-56 focus:outline-none focus:ring-1 focus:ring-brand/40 transition-all"
      />
    </form>
  );
}

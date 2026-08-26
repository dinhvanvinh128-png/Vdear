'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-panel lg:flex">
      <Link href="/" className="flex items-center gap-2 px-5 py-4">
        <span
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px]
                     bg-gradient-to-br from-brand to-brand-2 shadow-[0_4px_14px_rgba(216,163,43,.35)]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 32 32" width="22" height="22" className="block">
            <path fill="#0A0906" d="M3 4 L16 27.5 L28 4 L24.2 4 L16 20 L7.2 4 Z" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block font-display text-[17px] font-bold tracking-[.5px]">Vdearypto</span>
          <span className="block text-[11px] text-muted">Crypto Intelligence Terminal</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((group) => (
          <div key={group.title}>
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const base = item.href.split('?')[0];
                const active = base === '/' ? pathname === '/' : pathname.startsWith(base);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 border-l-2 px-2.5 py-1.5 text-[12px] transition-colors',
                        active
                          ? 'border-brand bg-panel-2 text-text'
                          : 'border-transparent text-muted hover:border-border hover:text-text',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border px-4 py-3 text-[10px] leading-relaxed text-muted">
        Market data aggregated from Binance · OKX · Bybit · Bitget.
      </div>
    </aside>
  );
}

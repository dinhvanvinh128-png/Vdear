'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-panel/60 backdrop-blur lg:flex">
      <Link href="/" className="flex items-center gap-2 px-5 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-black text-white">V</span>
        <span className="text-[15px] font-extrabold tracking-tight">
          VDEAR<span className="text-brand"> Crypto</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((group) => (
          <div key={group.title}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
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
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                        active ? 'bg-brand/15 text-text ring-1 ring-brand/30' : 'text-muted hover:bg-panel-2 hover:text-text',
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

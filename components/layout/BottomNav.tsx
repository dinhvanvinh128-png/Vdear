'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BOTTOM_NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-border bg-panel lg:hidden">
      {BOTTOM_NAV.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
              active ? 'text-brand' : 'text-muted',
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

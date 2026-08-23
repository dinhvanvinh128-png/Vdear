import Link from 'next/link';
import { SearchBox } from './SearchBox';
import { ThemeToggle } from './ThemeToggle';
import { AuthButton } from '@/components/auth/AuthButton';

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg px-4">
      <div className="flex items-center gap-2 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center border border-brand/70 text-xs font-medium text-brand">V</span>
          <span className="text-xs font-medium uppercase tracking-[0.18em]">VDEAR<span className="text-muted"> CRYPTO</span></span>
        </Link>
      </div>
      <div className="hidden text-[10px] uppercase tracking-[0.18em] text-muted lg:block">
        Spot flow · liquidity · breadth · on-chain
      </div>
      <div className="flex items-center gap-2">
        <SearchBox />
        <ThemeToggle />
        <AuthButton />
      </div>
    </header>
  );
}

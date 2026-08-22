import Link from 'next/link';
import { SearchBox } from './SearchBox';
import { ThemeToggle } from './ThemeToggle';
import { AuthButton } from '@/components/auth/AuthButton';

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-black text-white">V</span>
          <span className="text-sm font-extrabold">VDEAR<span className="text-brand"> Crypto</span></span>
        </Link>
      </div>
      <div className="hidden text-xs text-muted lg:block">
        Real-Time Crypto Market Intelligence
      </div>
      <div className="flex items-center gap-2">
        <SearchBox />
        <ThemeToggle />
        <AuthButton />
      </div>
    </header>
  );
}

import Link from 'next/link';
import { SearchBox } from './SearchBox';
import { ThemeToggle } from './ThemeToggle';
import { AuthButton } from '@/components/auth/AuthButton';

/**
 * Khối thương hiệu lấy đúng theo header của bản tĩnh (legacy-static/index.html):
 * ô vuông vàng bo 10px chứa dấu V, tên Vdearypto, dòng phụ "Crypto Intelligence
 * Terminal", rồi huy hiệu Realtime. Trước đây chỗ này là chữ mono viết hoa giãn
 * cách — đúng gu terminal, nhưng nhìn không ra cùng một website với dashboard
 * chính, mà dashboard chính mới là cái người dùng thấy đầu tiên.
 */
export function TopNav() {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur">
      <Link href="/" className="flex min-w-0 items-center gap-[11px]">
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
          <span className="block truncate font-display text-[17px] font-bold tracking-[.5px]">Vdearypto</span>
          <span className="hidden text-[11px] text-muted sm:block">Crypto Intelligence Terminal</span>
        </span>
      </Link>

      <span className="ml-auto hidden items-center gap-[7px] rounded-[20px] border border-brand/40 bg-panel px-[11px] py-[6px] text-xs font-semibold md:inline-flex">
        <span className="h-2 w-2 rounded-full bg-up" />
        Realtime
      </span>

      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <SearchBox />
        <ThemeToggle />
        <AuthButton />
      </div>
    </header>
  );
}

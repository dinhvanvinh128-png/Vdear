'use client';
import Link from 'next/link';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { getSupabase } from '@/lib/supabase/client';

export function AuthButton() {
  const { user, ready, configured } = useUser();

  if (!configured) {
    return (
      <Button variant="outline" size="sm" title="Set NEXT_PUBLIC_SUPABASE_URL / ANON_KEY to enable sign-in" disabled>
        <LogIn className="h-4 w-4" /> Login
      </Button>
    );
  }
  if (!ready) return <div className="h-8 w-16 animate-pulse rounded-lg bg-panel-2" />;

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 text-xs text-muted md:flex">
          <UserIcon className="h-3.5 w-3.5" />
          {user.email ?? 'Account'}
        </span>
        <Button variant="outline" size="sm" onClick={() => getSupabase()?.auth.signOut()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <Link href="/login">
      <Button variant="primary" size="sm"><LogIn className="h-4 w-4" /> Login</Button>
    </Link>
  );
}

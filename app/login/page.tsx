'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSupabase, supabaseConfigured } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const configured = supabaseConfigured();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'signup') {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Check your email to confirm your account.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/watchlist');
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/watchlist` } });
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title={mode === 'signin' ? 'Sign in' : 'Create account'} subtitle="Watchlist, portfolio and alerts sync to your account." />
      <Card>
        <CardContent className="space-y-3 py-5">
          {!configured && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              Auth is not configured. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment.
            </div>
          )}
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email" required placeholder="Email" value={email} disabled={!configured}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-panel-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
            <input
              type="password" required placeholder="Password" value={password} disabled={!configured}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-panel-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
            <Button type="submit" variant="primary" className="w-full" disabled={!configured || busy}>
              {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            </Button>
          </form>
          <Button variant="outline" className="w-full" onClick={google} disabled={!configured}>Continue with Google</Button>
          {msg && <div className="text-center text-xs text-muted">{msg}</div>}
          <button
            className="w-full text-center text-xs text-muted hover:text-text"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

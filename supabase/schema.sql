-- =============================================================================
-- VDEAR Crypto — Supabase schema (Supabase Auth + RLS)
-- Run in Supabase → SQL Editor → New query → Run.
--
-- Every user-owned table keys on auth.uid() and enables Row Level Security so a
-- signed-in user can only read/write their own rows. The client never sends a
-- user_id — the column defaults to auth.uid() and the policies enforce it.
-- =============================================================================

-- ---------- Watchlist ----------
create table if not exists public.watchlist (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
alter table public.watchlist enable row level security;

drop policy if exists "watchlist_select_own" on public.watchlist;
drop policy if exists "watchlist_insert_own" on public.watchlist;
drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_select_own" on public.watchlist for select using (user_id = auth.uid());
create policy "watchlist_insert_own" on public.watchlist for insert with check (user_id = auth.uid());
create policy "watchlist_delete_own" on public.watchlist for delete using (user_id = auth.uid());

-- ---------- Portfolio ----------
create table if not exists public.portfolio_assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol      text not null,
  quantity    numeric not null check (quantity >= 0),
  avg_entry   numeric not null check (avg_entry >= 0),
  created_at  timestamptz not null default now()
);
alter table public.portfolio_assets enable row level security;

drop policy if exists "portfolio_select_own" on public.portfolio_assets;
drop policy if exists "portfolio_write_own" on public.portfolio_assets;
drop policy if exists "portfolio_update_own" on public.portfolio_assets;
drop policy if exists "portfolio_delete_own" on public.portfolio_assets;
create policy "portfolio_select_own" on public.portfolio_assets for select using (user_id = auth.uid());
create policy "portfolio_write_own"  on public.portfolio_assets for insert with check (user_id = auth.uid());
create policy "portfolio_update_own" on public.portfolio_assets for update using (user_id = auth.uid());
create policy "portfolio_delete_own" on public.portfolio_assets for delete using (user_id = auth.uid());

-- ---------- Price alerts ----------
create table if not exists public.price_alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol      text not null,
  operator    text not null check (operator in ('gt','lt')),
  target      numeric not null,
  triggered   boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.price_alerts enable row level security;

drop policy if exists "alerts_select_own" on public.price_alerts;
drop policy if exists "alerts_write_own" on public.price_alerts;
drop policy if exists "alerts_update_own" on public.price_alerts;
drop policy if exists "alerts_delete_own" on public.price_alerts;
create policy "alerts_select_own" on public.price_alerts for select using (user_id = auth.uid());
create policy "alerts_write_own"  on public.price_alerts for insert with check (user_id = auth.uid());
create policy "alerts_update_own" on public.price_alerts for update using (user_id = auth.uid());
create policy "alerts_delete_own" on public.price_alerts for delete using (user_id = auth.uid());

create index if not exists idx_watchlist_user on public.watchlist(user_id);
create index if not exists idx_portfolio_user on public.portfolio_assets(user_id);
create index if not exists idx_alerts_user on public.price_alerts(user_id);

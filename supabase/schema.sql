-- Vdear — bảng "Yêu thích" (watchlist) đồng bộ qua Clerk + Supabase RLS.
-- Chạy trong Supabase → SQL Editor → New query → Run.

create table if not exists public.watchlist (
  user_id    text not null default (auth.jwt() ->> 'sub'),
  symbol     text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.watchlist enable row level security;

-- Mỗi user chỉ thấy/sửa dòng của chính mình (user_id = Clerk user id trong JWT).
create policy "watchlist_select_own" on public.watchlist
  for select using (user_id = auth.jwt() ->> 'sub');
create policy "watchlist_insert_own" on public.watchlist
  for insert with check (user_id = auth.jwt() ->> 'sub');
create policy "watchlist_delete_own" on public.watchlist
  for delete using (user_id = auth.jwt() ->> 'sub');

-- ============================================================
--  GIA PHẢ — Lưu đám mây dùng chung (1 tài liệu JSON)
--  Chạy trong Supabase → SQL Editor. Chỉ cần file này cho tính năng
--  đăng nhập + đồng bộ (không cần chạy 0001_init.sql).
-- ============================================================

create table if not exists clan_data (
  id text primary key,
  data jsonb not null default '{"members":[],"branches":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table clan_data enable row level security;

-- Ai cũng XEM được dữ liệu dùng chung
drop policy if exists "clan read" on clan_data;
create policy "clan read" on clan_data for select using (true);

-- Chỉ người đã ĐĂNG NHẬP mới được ghi
drop policy if exists "clan insert" on clan_data;
create policy "clan insert" on clan_data for insert with check (auth.uid() is not null);

drop policy if exists "clan update" on clan_data;
create policy "clan update" on clan_data for update using (auth.uid() is not null);

grant select on clan_data to anon, authenticated;
grant insert, update on clan_data to authenticated;

-- Tạo sẵn 1 dòng dùng chung
insert into clan_data (id, data)
values ('main', '{"members":[],"branches":[]}'::jsonb)
on conflict (id) do nothing;

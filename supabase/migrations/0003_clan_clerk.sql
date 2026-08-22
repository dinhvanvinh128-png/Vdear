-- ============================================================
--  GIA PHẢ — Lưu đám mây dùng chung khi đăng nhập bằng CLERK
--  Chạy DUY NHẤT file này trong Supabase → SQL Editor.
--
--  Vì đăng nhập do Clerk quản lý (không phải Supabase Auth), Supabase không
--  biết người dùng là ai. Nên việc chặn "chỉ người đăng nhập mới sửa" được
--  làm ở TẦNG GIAO DIỆN (Clerk). Ở database, ta cho phép ghi bằng anon key.
--  (Phù hợp cho gia phả dòng họ nội bộ; không phải dữ liệu nhạy cảm.)
-- ============================================================

create table if not exists clan_data (
  id text primary key,
  data jsonb not null default '{"members":[],"branches":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table clan_data enable row level security;

drop policy if exists "clan read" on clan_data;
create policy "clan read" on clan_data for select using (true);

drop policy if exists "clan insert" on clan_data;
create policy "clan insert" on clan_data for insert with check (true);

drop policy if exists "clan update" on clan_data;
create policy "clan update" on clan_data for update using (true);

grant select, insert, update on clan_data to anon, authenticated;

insert into clan_data (id, data)
values ('main', '{"members":[],"branches":[]}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
--  GIA PHẢ — Schema khởi tạo (PostgreSQL / Supabase)
--  Chạy trong Supabase Dashboard → SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
do $$ begin
  create type gender_t as enum ('male','female','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type visibility_t as enum ('public','family','private');
exception when duplicate_object then null; end $$;

do $$ begin
  create type role_t as enum ('admin','member','guest');
exception when duplicate_object then null; end $$;

do $$ begin
  create type relation_t as enum ('father','mother','spouse','child');
exception when duplicate_object then null; end $$;

do $$ begin
  create type change_status_t as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES (gắn với auth.users) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role role_t not null default 'member',
  created_at timestamptz not null default now()
);

-- Trigger tạo profile khi có user mới
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: kiểm tra admin
create or replace function is_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- BRANCHES (chi họ) ----------
create table if not exists branches (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text,
  ancestor_id text,
  image_url text,
  created_at timestamptz not null default now()
);

-- ---------- MEMBERS ----------
create table if not exists members (
  id text primary key default gen_random_uuid()::text,
  full_name text not null,
  nickname text,
  gender gender_t not null default 'other',
  birth_date date,
  death_date date,
  birth_place text,
  hometown text,
  address text,
  occupation text,
  biography text,
  avatar_url text,
  generation int not null default 1,
  branch_id text references branches(id) on delete set null,
  is_alive boolean not null default true,
  visibility visibility_t not null default 'public',
  father_id text references members(id) on delete set null,
  mother_id text references members(id) on delete set null,
  spouse_id text references members(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_members_branch on members(branch_id);
create index if not exists idx_members_father on members(father_id);
create index if not exists idx_members_mother on members(mother_id);
create index if not exists idx_members_generation on members(generation);

-- Bảng quan hệ tường minh (mở rộng, tùy chọn)
create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  from_member_id text not null references members(id) on delete cascade,
  to_member_id text not null references members(id) on delete cascade,
  relationship_type relation_t not null,
  created_at timestamptz not null default now(),
  unique (from_member_id, to_member_id, relationship_type)
);

-- ---------- EVENTS ----------
create table if not exists events (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  description text,
  event_date date not null,
  location text,
  cover_image text,
  type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- MEMORIAL DAYS (lịch giỗ) ----------
create table if not exists memorial_days (
  id text primary key default gen_random_uuid()::text,
  member_id text references members(id) on delete cascade,
  member_name text not null,
  death_date date,
  lunar_date text,
  solar_date date,
  location text,
  note text
);

-- ---------- ALBUMS & PHOTOS ----------
create table if not exists albums (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  cover_url text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  album_id text references albums(id) on delete set null,
  member_id text references members(id) on delete set null,
  url text not null,
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  description text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- CHANGE REQUESTS (duyệt thay đổi) ----------
create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  member_id text references members(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  status change_status_t not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- ---------- NOTIFICATIONS ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- AUDIT LOGS ----------
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table branches enable row level security;
alter table members enable row level security;
alter table relationships enable row level security;
alter table events enable row level security;
alter table memorial_days enable row level security;
alter table albums enable row level security;
alter table photos enable row level security;
alter table documents enable row level security;
alter table change_requests enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- PROFILES: xem/sửa hồ sơ của chính mình; admin xem tất cả
create policy "profiles self read"  on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles self update" on profiles for update using (id = auth.uid());

-- Dữ liệu công khai: ai cũng đọc được bản ghi public; người đã đăng nhập đọc thêm 'family'
create policy "members read public" on members for select
  using (
    visibility = 'public'
    or (auth.uid() is not null and visibility = 'family')
    or is_admin()
  );
create policy "members admin write" on members for all
  using (is_admin()) with check (is_admin());

-- Các bảng công khai khác: đọc tự do, chỉ admin ghi
create policy "branches read" on branches for select using (true);
create policy "branches write" on branches for all using (is_admin()) with check (is_admin());

create policy "relationships read" on relationships for select using (true);
create policy "relationships write" on relationships for all using (is_admin()) with check (is_admin());

create policy "events read" on events for select using (true);
create policy "events write" on events for all using (is_admin()) with check (is_admin());

create policy "memorials read" on memorial_days for select using (true);
create policy "memorials write" on memorial_days for all using (is_admin()) with check (is_admin());

create policy "albums read" on albums for select using (true);
create policy "albums write" on albums for all using (is_admin()) with check (is_admin());

create policy "photos read" on photos for select using (true);
create policy "photos insert auth" on photos for insert with check (auth.uid() is not null);
create policy "photos admin manage" on photos for all using (is_admin()) with check (is_admin());

create policy "documents read" on documents for select using (true);
create policy "documents write" on documents for all using (is_admin()) with check (is_admin());

-- CHANGE REQUESTS: member tạo đề xuất & xem của mình; admin xem/sửa tất cả
create policy "cr insert own"  on change_requests for insert with check (user_id = auth.uid());
create policy "cr read own"    on change_requests for select using (user_id = auth.uid() or is_admin());
create policy "cr admin manage" on change_requests for update using (is_admin());

-- NOTIFICATIONS: chỉ chủ sở hữu
create policy "noti own" on notifications for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- AUDIT LOGS: chỉ admin đọc
create policy "audit admin read" on audit_logs for select using (is_admin());
create policy "audit insert" on audit_logs for insert with check (auth.uid() is not null);

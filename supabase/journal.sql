-- =============================================================================
-- VDEAR Crypto — Nhật ký lệnh (trade journal)
-- Chạy trong Supabase → SQL Editor → New query → Run.
--
-- Cùng nguyên tắc với public.watchlist: client KHÔNG BAO GIỜ gửi user_id lên.
-- Cột đó mặc định bằng auth.uid(), và policy chặn mọi thao tác trên hàng của
-- người khác. Nhờ vậy một khoá anon bị lộ cũng không đọc được nhật ký của ai.
--
-- Không có cột nào lưu số tiền tuyệt đối. Thống kê của trang tính bằng R (bội
-- số rủi ro) — xem đầu legacy-static/js/journal.js để biết vì sao.
-- =============================================================================

create table if not exists public.journal (
  -- id do client sinh để lệnh ghi khi CHƯA đăng nhập (lưu ở localStorage) vẫn
  -- giữ nguyên id khi được đồng bộ lên sau này.
  id           text not null,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,

  at           bigint not null,          -- thời điểm vào lệnh (ms)
  coin         text not null,
  symbol       text,
  side         text not null check (side in ('LONG', 'SHORT')),
  tf           text,

  entry        double precision,
  tp           double precision,
  sl           double precision,
  leverage     double precision,
  size         double precision,         -- ghi lại vì là một phần của quyết định,
                                         -- nhưng không đi vào thống kê nào

  -- Ảnh chụp tín hiệu LÚC VÀO LỆNH. Đây mới là thứ cho phép trả lời "mình hay
  -- thua khi vào lệnh trong hoàn cảnh nào"; tính lại về sau là dữ liệu khác.
  confluence   double precision,
  rsi          double precision,
  pa_match     boolean,
  support      double precision,
  resistance   double precision,

  status       text not null default 'open' check (status in ('open', 'tp', 'sl', 'closed')),
  closed_at    bigint,
  close_price  double precision,
  note         text default '',

  created_at   timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.journal enable row level security;

drop policy if exists "journal_select_own" on public.journal;
drop policy if exists "journal_insert_own" on public.journal;
drop policy if exists "journal_update_own" on public.journal;
drop policy if exists "journal_delete_own" on public.journal;

create policy "journal_select_own" on public.journal for select using (user_id = auth.uid());
create policy "journal_insert_own" on public.journal for insert with check (user_id = auth.uid());
create policy "journal_update_own" on public.journal for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "journal_delete_own" on public.journal for delete using (user_id = auth.uid());

-- Trang nhật ký luôn đọc theo thứ tự thời gian giảm dần của CHÍNH người dùng đó.
create index if not exists journal_user_at_idx on public.journal (user_id, at desc);

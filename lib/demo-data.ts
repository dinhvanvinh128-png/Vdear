import type { Member, Branch, ClanEvent, MemorialDay } from "@/types";

/**
 * KHÔNG có dữ liệu bịa sẵn.
 * Khi chưa cấu hình Supabase, website sẽ TRỐNG và hiển thị lời mời thêm dữ liệu.
 * Khi cấu hình Supabase, toàn bộ dữ liệu lấy từ database (do bạn tự nhập).
 *
 * Nếu muốn có dữ liệu MẪU để thử giao diện, hãy chạy file
 * `supabase/seed.sql` (tùy chọn) sau khi đã kết nối Supabase.
 */

export const demoBranches: Branch[] = [];
export const demoMembers: Member[] = [];
export const demoEvents: ClanEvent[] = [];
export const demoMemorials: MemorialDay[] = [];

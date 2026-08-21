import type { Member, Branch, ClanEvent, MemorialDay } from "@/types";

/**
 * Dữ liệu DEMO — chỉ dùng khi CHƯA cấu hình Supabase.
 * Khi Supabase được cấu hình, toàn bộ dữ liệu sẽ lấy từ database.
 * Dòng họ Nguyễn Phúc: 5 đời, 3 chi, 30 thành viên.
 */

export const demoBranches: Branch[] = [
  {
    id: "b1",
    name: "Chi Trưởng",
    description: "Chi trưởng do cụ Nguyễn Phúc An khởi lập, giữ việc thờ tự tổ tiên.",
    ancestor_id: "m3",
    image_url: null
  },
  {
    id: "b2",
    name: "Chi Hai",
    description: "Chi hai do cụ Nguyễn Phúc Bình khởi lập, phần lớn theo nghiệp nông và giáo.",
    ancestor_id: "m5",
    image_url: null
  },
  {
    id: "b3",
    name: "Chi Ba",
    description: "Chi ba do cụ Nguyễn Phúc Cường khởi lập, nhiều người làm nghề buôn bán.",
    ancestor_id: "m7",
    image_url: null
  }
];

function avatar(name: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
}

type Seed = Omit<Member, "is_alive" | "avatar_url"> & { avatar_url?: string };

const seed: Seed[] = [
  // ĐỜI 1 — Thủy tổ
  { id: "m1", full_name: "Nguyễn Phúc Nguyên", gender: "male", birth_date: "1890-01-01", death_date: "1960-03-12", generation: 1, branch_id: "b1", spouse_id: "m2", father_id: null, mother_id: null, occupation: "Hương chức", hometown: "Bắc Ninh", biography: "Thủy tổ của dòng họ Nguyễn Phúc, người khai cơ lập nghiệp tại làng." },
  { id: "m2", full_name: "Trần Thị Ngọc", gender: "female", birth_date: "1895-01-01", death_date: "1970-07-20", generation: 1, branch_id: "b1", spouse_id: "m1", father_id: null, mother_id: null, hometown: "Bắc Ninh" },

  // ĐỜI 2
  { id: "m3", full_name: "Nguyễn Phúc An", gender: "male", birth_date: "1915-02-10", death_date: "1985-09-01", generation: 2, branch_id: "b1", spouse_id: "m4", father_id: "m1", mother_id: "m2", occupation: "Thầy đồ", biography: "Con trưởng, khởi lập Chi Trưởng." },
  { id: "m4", full_name: "Lê Thị Hoa", gender: "female", birth_date: "1918-05-05", death_date: "1990-01-15", generation: 2, branch_id: "b1", spouse_id: "m3", father_id: null, mother_id: null },
  { id: "m5", full_name: "Nguyễn Phúc Bình", gender: "male", birth_date: "1918-06-06", death_date: "1992-11-30", generation: 2, branch_id: "b2", spouse_id: "m6", father_id: "m1", mother_id: "m2", occupation: "Nông dân", biography: "Khởi lập Chi Hai." },
  { id: "m6", full_name: "Phạm Thị Lan", gender: "female", birth_date: "1920-08-08", death_date: "1995-04-04", generation: 2, branch_id: "b2", spouse_id: "m5", father_id: null, mother_id: null },
  { id: "m7", full_name: "Nguyễn Phúc Cường", gender: "male", birth_date: "1921-09-09", death_date: "2001-12-12", generation: 2, branch_id: "b3", spouse_id: "m8", father_id: "m1", mother_id: "m2", occupation: "Thương nhân", biography: "Khởi lập Chi Ba." },
  { id: "m8", full_name: "Trần Thị Mai", gender: "female", birth_date: "1924-03-03", death_date: "2004-06-06", generation: 2, branch_id: "b3", spouse_id: "m7", father_id: null, mother_id: null },
  { id: "m9", full_name: "Nguyễn Thị Tâm", gender: "female", birth_date: "1925-10-10", death_date: "2010-02-02", generation: 2, branch_id: "b1", spouse_id: null, father_id: "m1", mother_id: "m2", occupation: "Nội trợ" },

  // ĐỜI 3
  { id: "m10", full_name: "Nguyễn Phúc Dũng", gender: "male", birth_date: "1945-01-20", death_date: null, generation: 3, branch_id: "b1", spouse_id: "m11", father_id: "m3", mother_id: "m4", occupation: "Kỹ sư", hometown: "Hà Nội" },
  { id: "m11", full_name: "Vũ Thị Hồng", gender: "female", birth_date: "1948-04-18", death_date: null, generation: 3, branch_id: "b1", spouse_id: "m10", father_id: null, mother_id: null },
  { id: "m12", full_name: "Nguyễn Thị Hạnh", gender: "female", birth_date: "1950-07-07", death_date: null, generation: 3, branch_id: "b1", spouse_id: null, father_id: "m3", mother_id: "m4", occupation: "Giáo viên" },
  { id: "m13", full_name: "Nguyễn Phúc Em", gender: "male", birth_date: "1948-02-02", death_date: "2020-08-08", generation: 3, branch_id: "b2", spouse_id: "m14", father_id: "m5", mother_id: "m6", occupation: "Bác sĩ" },
  { id: "m14", full_name: "Đỗ Thị Kim", gender: "female", birth_date: "1950-09-09", death_date: null, generation: 3, branch_id: "b2", spouse_id: "m13", father_id: null, mother_id: null },
  { id: "m15", full_name: "Nguyễn Phúc Giang", gender: "male", birth_date: "1952-11-11", death_date: null, generation: 3, branch_id: "b2", spouse_id: "m16", father_id: "m5", mother_id: "m6", occupation: "Nông dân" },
  { id: "m16", full_name: "Hoàng Thị Loan", gender: "female", birth_date: "1955-12-01", death_date: null, generation: 3, branch_id: "b2", spouse_id: "m15", father_id: null, mother_id: null },
  { id: "m17", full_name: "Nguyễn Phúc Hải", gender: "male", birth_date: "1950-03-15", death_date: null, generation: 3, branch_id: "b3", spouse_id: "m18", father_id: "m7", mother_id: "m8", occupation: "Doanh nhân" },
  { id: "m18", full_name: "Bùi Thị Nga", gender: "female", birth_date: "1953-06-25", death_date: null, generation: 3, branch_id: "b3", spouse_id: "m17", father_id: null, mother_id: null },
  { id: "m19", full_name: "Nguyễn Thị Oanh", gender: "female", birth_date: "1956-08-30", death_date: null, generation: 3, branch_id: "b3", spouse_id: null, father_id: "m7", mother_id: "m8", occupation: "Kế toán" },

  // ĐỜI 4
  { id: "m20", full_name: "Nguyễn Phúc Khoa", gender: "male", birth_date: "1972-05-05", death_date: null, generation: 4, branch_id: "b1", spouse_id: "m21", father_id: "m10", mother_id: "m11", occupation: "Lập trình viên", hometown: "TP. Hồ Chí Minh" },
  { id: "m21", full_name: "Trần Thị Phương", gender: "female", birth_date: "1975-10-10", death_date: null, generation: 4, branch_id: "b1", spouse_id: "m20", father_id: null, mother_id: null },
  { id: "m22", full_name: "Nguyễn Thị Quỳnh", gender: "female", birth_date: "1978-02-14", death_date: null, generation: 4, branch_id: "b1", spouse_id: null, father_id: "m10", mother_id: "m11", occupation: "Bác sĩ" },
  { id: "m23", full_name: "Nguyễn Phúc Sơn", gender: "male", birth_date: "1975-07-19", death_date: null, generation: 4, branch_id: "b2", spouse_id: "m24", father_id: "m13", mother_id: "m14", occupation: "Giảng viên" },
  { id: "m24", full_name: "Lý Thị Trang", gender: "female", birth_date: "1978-11-23", death_date: null, generation: 4, branch_id: "b2", spouse_id: "m23", father_id: null, mother_id: null },
  { id: "m25", full_name: "Nguyễn Phúc Tuấn", gender: "male", birth_date: "1980-01-01", death_date: null, generation: 4, branch_id: "b2", spouse_id: null, father_id: "m13", mother_id: "m14", occupation: "Kỹ sư" },
  { id: "m26", full_name: "Nguyễn Phúc Uy", gender: "male", birth_date: "1978-04-04", death_date: null, generation: 4, branch_id: "b3", spouse_id: null, father_id: "m17", mother_id: "m18", occupation: "Kiến trúc sư" },
  { id: "m27", full_name: "Nguyễn Thị Vân", gender: "female", birth_date: "1981-09-09", death_date: null, generation: 4, branch_id: "b3", spouse_id: null, father_id: "m17", mother_id: "m18", occupation: "Nhà báo" },
  { id: "m28", full_name: "Nguyễn Phúc Xuân", gender: "male", birth_date: "1979-03-21", death_date: null, generation: 4, branch_id: "b2", spouse_id: null, father_id: "m15", mother_id: "m16", occupation: "Nông dân" },

  // ĐỜI 5
  { id: "m29", full_name: "Nguyễn Phúc Yên", gender: "male", birth_date: "2001-05-05", death_date: null, generation: 5, branch_id: "b1", spouse_id: null, father_id: "m20", mother_id: "m21", occupation: "Sinh viên" },
  { id: "m30", full_name: "Nguyễn Thị Uyên", gender: "female", birth_date: "2004-08-08", death_date: null, generation: 5, branch_id: "b2", spouse_id: null, father_id: "m23", mother_id: "m24", occupation: "Học sinh" }
];

export const demoMembers: Member[] = seed.map((m) => ({
  ...m,
  is_alive: !m.death_date,
  avatar_url: m.avatar_url ?? avatar(m.full_name),
  visibility: "public"
}));

export const demoEvents: ClanEvent[] = [
  { id: "e1", title: "Giỗ Tổ dòng họ", description: "Lễ giỗ Thủy tổ Nguyễn Phúc Nguyên, con cháu tề tựu tại nhà thờ họ.", event_date: "2026-09-25", location: "Nhà thờ họ Nguyễn Phúc, Bắc Ninh", type: "giỗ", cover_image: null },
  { id: "e2", title: "Họp họ thường niên", description: "Tổng kết hoạt động dòng họ và bàn việc tu sửa nhà thờ.", event_date: "2026-10-15", location: "Hội trường làng", type: "họp họ", cover_image: null },
  { id: "e3", title: "Mừng thọ cụ Nguyễn Phúc Dũng", description: "Lễ mừng thọ 80 tuổi.", event_date: "2026-11-05", location: "Tư gia Chi Trưởng", type: "mừng thọ", cover_image: null },
  { id: "e4", title: "Lễ tảo mộ", description: "Con cháu tảo mộ tổ tiên cuối năm.", event_date: "2026-12-20", location: "Nghĩa trang dòng họ", type: "tảo mộ", cover_image: null }
];

export const demoMemorials: MemorialDay[] = [
  { id: "md1", member_id: "m1", member_name: "Nguyễn Phúc Nguyên", death_date: "1960-03-12", lunar_date: "15 tháng 2 ÂL", solar_date: "2026-09-25", location: "Nhà thờ họ", note: "Giỗ Tổ" },
  { id: "md2", member_id: "m2", member_name: "Trần Thị Ngọc", death_date: "1970-07-20", lunar_date: "10 tháng 6 ÂL", solar_date: "2026-07-24", location: "Nhà thờ họ" },
  { id: "md3", member_id: "m3", member_name: "Nguyễn Phúc An", death_date: "1985-09-01", lunar_date: "18 tháng 7 ÂL", solar_date: "2026-08-30", location: "Chi Trưởng" },
  { id: "md4", member_id: "m5", member_name: "Nguyễn Phúc Bình", death_date: "1992-11-30", lunar_date: "07 tháng 11 ÂL", solar_date: "2026-12-16", location: "Chi Hai" },
  { id: "md5", member_id: "m7", member_name: "Nguyễn Phúc Cường", death_date: "2001-12-12", lunar_date: "28 tháng 10 ÂL", solar_date: "2026-12-07", location: "Chi Ba" },
  { id: "md6", member_id: "m13", member_name: "Nguyễn Phúc Em", death_date: "2020-08-08", lunar_date: "19 tháng 6 ÂL", solar_date: "2026-08-02", location: "Chi Hai" }
];

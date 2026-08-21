-- ============================================================
--  GIA PHẢ — Dữ liệu DEMO (30 thành viên, 3 chi, 5 đời)
--  Chạy SAU 0001_init.sql. Có thể xóa toàn bộ để dùng dữ liệu thật.
-- ============================================================

-- ---------- Chi họ ----------
insert into branches (id, name, description, ancestor_id) values
  ('b1','Chi Trưởng','Chi trưởng do cụ Nguyễn Phúc An khởi lập, giữ việc thờ tự tổ tiên.','m3'),
  ('b2','Chi Hai','Chi hai do cụ Nguyễn Phúc Bình khởi lập, phần lớn theo nghiệp nông và giáo.','m5'),
  ('b3','Chi Ba','Chi ba do cụ Nguyễn Phúc Cường khởi lập, nhiều người làm nghề buôn bán.','m7')
on conflict (id) do nothing;

-- ---------- Thành viên (chưa gắn quan hệ) ----------
insert into members
  (id, full_name, gender, birth_date, death_date, hometown, occupation, biography, generation, branch_id, is_alive, avatar_url)
values
  ('m1','Nguyễn Phúc Nguyên','male','1890-01-01','1960-03-12','Bắc Ninh','Hương chức','Thủy tổ của dòng họ Nguyễn Phúc, người khai cơ lập nghiệp tại làng.',1,'b1',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m1'),
  ('m2','Trần Thị Ngọc','female','1895-01-01','1970-07-20','Bắc Ninh',null,null,1,'b1',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m2'),
  ('m3','Nguyễn Phúc An','male','1915-02-10','1985-09-01',null,'Thầy đồ','Con trưởng, khởi lập Chi Trưởng.',2,'b1',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m3'),
  ('m4','Lê Thị Hoa','female','1918-05-05','1990-01-15',null,null,null,2,'b1',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m4'),
  ('m5','Nguyễn Phúc Bình','male','1918-06-06','1992-11-30',null,'Nông dân','Khởi lập Chi Hai.',2,'b2',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m5'),
  ('m6','Phạm Thị Lan','female','1920-08-08','1995-04-04',null,null,null,2,'b2',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m6'),
  ('m7','Nguyễn Phúc Cường','male','1921-09-09','2001-12-12',null,'Thương nhân','Khởi lập Chi Ba.',2,'b3',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m7'),
  ('m8','Trần Thị Mai','female','1924-03-03','2004-06-06',null,null,null,2,'b3',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m8'),
  ('m9','Nguyễn Thị Tâm','female','1925-10-10','2010-02-02',null,'Nội trợ',null,2,'b1',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m9'),
  ('m10','Nguyễn Phúc Dũng','male','1945-01-20',null,'Hà Nội','Kỹ sư',null,3,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m10'),
  ('m11','Vũ Thị Hồng','female','1948-04-18',null,null,null,null,3,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m11'),
  ('m12','Nguyễn Thị Hạnh','female','1950-07-07',null,null,'Giáo viên',null,3,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m12'),
  ('m13','Nguyễn Phúc Em','male','1948-02-02','2020-08-08',null,'Bác sĩ',null,3,'b2',false,'https://api.dicebear.com/7.x/avataaars/svg?seed=m13'),
  ('m14','Đỗ Thị Kim','female','1950-09-09',null,null,null,null,3,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m14'),
  ('m15','Nguyễn Phúc Giang','male','1952-11-11',null,null,'Nông dân',null,3,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m15'),
  ('m16','Hoàng Thị Loan','female','1955-12-01',null,null,null,null,3,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m16'),
  ('m17','Nguyễn Phúc Hải','male','1950-03-15',null,null,'Doanh nhân',null,3,'b3',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m17'),
  ('m18','Bùi Thị Nga','female','1953-06-25',null,null,null,null,3,'b3',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m18'),
  ('m19','Nguyễn Thị Oanh','female','1956-08-30',null,null,'Kế toán',null,3,'b3',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m19'),
  ('m20','Nguyễn Phúc Khoa','male','1972-05-05',null,'TP. Hồ Chí Minh','Lập trình viên',null,4,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m20'),
  ('m21','Trần Thị Phương','female','1975-10-10',null,null,null,null,4,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m21'),
  ('m22','Nguyễn Thị Quỳnh','female','1978-02-14',null,null,'Bác sĩ',null,4,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m22'),
  ('m23','Nguyễn Phúc Sơn','male','1975-07-19',null,null,'Giảng viên',null,4,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m23'),
  ('m24','Lý Thị Trang','female','1978-11-23',null,null,null,null,4,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m24'),
  ('m25','Nguyễn Phúc Tuấn','male','1980-01-01',null,null,'Kỹ sư',null,4,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m25'),
  ('m26','Nguyễn Phúc Uy','male','1978-04-04',null,null,'Kiến trúc sư',null,4,'b3',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m26'),
  ('m27','Nguyễn Thị Vân','female','1981-09-09',null,null,'Nhà báo',null,4,'b3',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m27'),
  ('m28','Nguyễn Phúc Xuân','male','1979-03-21',null,null,'Nông dân',null,4,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m28'),
  ('m29','Nguyễn Phúc Yên','male','2001-05-05',null,null,'Sinh viên',null,5,'b1',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m29'),
  ('m30','Nguyễn Thị Uyên','female','2004-08-08',null,null,'Học sinh',null,5,'b2',true,'https://api.dicebear.com/7.x/avataaars/svg?seed=m30')
on conflict (id) do nothing;

-- ---------- Gắn quan hệ cha / mẹ / vợ chồng ----------
update members m set
  father_id = v.f, mother_id = v.mo, spouse_id = v.s
from (values
  ('m1', null::text, null::text, 'm2'::text),
  ('m2', null, null, 'm1'),
  ('m3', 'm1', 'm2', 'm4'),
  ('m4', null, null, 'm3'),
  ('m5', 'm1', 'm2', 'm6'),
  ('m6', null, null, 'm5'),
  ('m7', 'm1', 'm2', 'm8'),
  ('m8', null, null, 'm7'),
  ('m9', 'm1', 'm2', null),
  ('m10', 'm3', 'm4', 'm11'),
  ('m11', null, null, 'm10'),
  ('m12', 'm3', 'm4', null),
  ('m13', 'm5', 'm6', 'm14'),
  ('m14', null, null, 'm13'),
  ('m15', 'm5', 'm6', 'm16'),
  ('m16', null, null, 'm15'),
  ('m17', 'm7', 'm8', 'm18'),
  ('m18', null, null, 'm17'),
  ('m19', 'm7', 'm8', null),
  ('m20', 'm10', 'm11', 'm21'),
  ('m21', null, null, 'm20'),
  ('m22', 'm10', 'm11', null),
  ('m23', 'm13', 'm14', 'm24'),
  ('m24', null, null, 'm23'),
  ('m25', 'm13', 'm14', null),
  ('m26', 'm17', 'm18', null),
  ('m27', 'm17', 'm18', null),
  ('m28', 'm15', 'm16', null),
  ('m29', 'm20', 'm21', null),
  ('m30', 'm23', 'm24', null)
) as v(id, f, mo, s)
where m.id = v.id;

-- ---------- Sự kiện ----------
insert into events (id, title, description, event_date, location, type) values
  ('e1','Giỗ Tổ dòng họ','Lễ giỗ Thủy tổ Nguyễn Phúc Nguyên, con cháu tề tựu tại nhà thờ họ.','2026-09-25','Nhà thờ họ Nguyễn Phúc, Bắc Ninh','giỗ'),
  ('e2','Họp họ thường niên','Tổng kết hoạt động dòng họ và bàn việc tu sửa nhà thờ.','2026-10-15','Hội trường làng','họp họ'),
  ('e3','Mừng thọ cụ Nguyễn Phúc Dũng','Lễ mừng thọ 80 tuổi.','2026-11-05','Tư gia Chi Trưởng','mừng thọ'),
  ('e4','Lễ tảo mộ','Con cháu tảo mộ tổ tiên cuối năm.','2026-12-20','Nghĩa trang dòng họ','tảo mộ')
on conflict (id) do nothing;

-- ---------- Lịch giỗ ----------
insert into memorial_days (id, member_id, member_name, death_date, lunar_date, solar_date, location, note) values
  ('md1','m1','Nguyễn Phúc Nguyên','1960-03-12','15 tháng 2 ÂL','2026-09-25','Nhà thờ họ','Giỗ Tổ'),
  ('md2','m2','Trần Thị Ngọc','1970-07-20','10 tháng 6 ÂL','2026-07-24','Nhà thờ họ',null),
  ('md3','m3','Nguyễn Phúc An','1985-09-01','18 tháng 7 ÂL','2026-08-30','Chi Trưởng',null),
  ('md4','m5','Nguyễn Phúc Bình','1992-11-30','07 tháng 11 ÂL','2026-12-16','Chi Hai',null),
  ('md5','m7','Nguyễn Phúc Cường','2001-12-12','28 tháng 10 ÂL','2026-12-07','Chi Ba',null),
  ('md6','m13','Nguyễn Phúc Em','2020-08-08','19 tháng 6 ÂL','2026-08-02','Chi Hai',null)
on conflict (id) do nothing;

-- ---------- Album demo ----------
insert into albums (id, title, description) values
  ('al1','Nhà thờ họ','Ảnh nhà thờ họ qua các năm.'),
  ('al2','Họp họ thường niên','Ảnh các buổi họp họ.'),
  ('al3','Ảnh tổ tiên','Ảnh chân dung tổ tiên.')
on conflict (id) do nothing;

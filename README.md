# 🌳 Gia Phả Dòng Họ Lê

Website gia phả dòng họ — dựng và trực quan hóa **cây phả hệ** qua nhiều đời, nhiều chi.
**Không cần đăng nhập, không cần cấu hình gì.** Deploy phát là dùng được ngay.

**Công nghệ:** Next.js 14 · TypeScript · Tailwind CSS · React Flow · Zustand · Lucide.

## 💾 Dữ liệu lưu ở đâu?

Toàn bộ dữ liệu (thành viên, chi họ) được lưu **ngay trong trình duyệt của bạn**
(localStorage). Không có máy chủ, không tài khoản, không đăng nhập.

- ✅ Ưu điểm: chạy ngay, riêng tư, không lộ dữ liệu ra ngoài.
- ⚠️ Lưu ý: dữ liệu nằm trên **trình duyệt/máy này**. Đổi máy hay xóa dữ liệu
  trình duyệt sẽ mất. Dùng nút **Xuất** để sao lưu ra tệp `.json`, và **Nhập**
  để mở lại trên máy khác.

## 🚀 Dùng

Vào trang **Quản lý** (`/quan-ly`) để:
- Thêm chi họ (nên tạo chi trước).
- Thêm thủy tổ (đời 1, để trống cha/mẹ), rồi thêm con cháu và chọn cha/mẹ, vợ/chồng.
- Sửa / xóa thành viên. **Xuất / Nhập** để sao lưu.

Rồi xem **Cây gia phả** (`/tree`): phóng to, kéo, tìm người, thu gọn/mở rộng nhánh,
bấm vào người để mở hồ sơ.

Hệ thống tự **chống quan hệ vòng lặp** (không cho A là cha B rồi B là cha A) và
**đồng bộ vợ/chồng hai chiều**.

## 🗂 Các trang

| Đường dẫn | Nội dung |
|---|---|
| `/` | Trang chủ + thống kê |
| `/tree` | Cây gia phả tương tác |
| `/members` | Danh sách + tìm kiếm/lọc thành viên |
| `/member/[id]` | Hồ sơ từng người + QR |
| `/branches` | Các chi họ |
| `/history` | Lịch sử (lấy từ tiểu sử thủy tổ) |
| `/memorial` | Lịch giỗ (từ người đã mất) |
| `/quan-ly` | **Thêm/sửa/xóa** thành viên & chi họ, Xuất/Nhập |

## 🔐 Đăng nhập (Clerk) & lưu đám mây (Supabase)

Mặc định web chạy **cục bộ** (lưu trong máy), không cần đăng nhập. Muốn **nhiều
người cùng sửa, dữ liệu dùng chung** thì bật **đăng nhập bằng Clerk** + lưu **Supabase**.
Cả hai khóa đều là **khóa công khai**, nhúng thẳng vào `lib/config.ts` — **không cần
biến môi trường Vercel**.

1. **Clerk:** tạo tài khoản tại [clerk.com](https://clerk.com) → tạo Application →
   **API Keys** → copy **Publishable key** (`pk_...`).
2. **Supabase:** tạo project → **SQL Editor** → chạy `supabase/migrations/0003_clan_clerk.sql`
   → **Project Settings → API** lấy **Project URL** và **anon/publishable key**.
3. Mở `lib/config.ts`, điền 3 giá trị vào giữa hai dấu ngoặc kép:
   - `CLERK_PUBLISHABLE_KEY` = `pk_...`
   - `SUPABASE_URL` = `https://xxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = `sb_publishable_...` (hoặc anon key)
4. Commit & push → Vercel tự deploy. Xong.

Kết quả: nút **Đăng nhập** (Clerk) xuất hiện; ai cũng **xem** được; **đăng nhập mới
sửa**; dữ liệu lưu chung (bảng `clan_data`, 1 tài liệu JSON) tự đồng bộ giữa các máy.

> Ghi chú bảo mật: việc chặn sửa nằm ở **giao diện** (Clerk). Ở tầng database, khóa
> anon được phép ghi — phù hợp cho gia phả nội bộ dòng họ, không phải dữ liệu nhạy cảm.
> Cơ chế đồng bộ “ai lưu sau thắng”, hợp cho nhóm nhỏ biên tập.

## 📱 Cài như App (PWA)

Web đã là **PWA** — cài vào màn hình chính, mở toàn màn hình như app, **chạy offline**.

- **Android (Chrome):** mở web → menu ⋮ → **Cài đặt ứng dụng / Thêm vào màn hình chính**.
- **iPhone (Safari):** mở web → nút **Chia sẻ** → **Thêm vào MH chính**.
- **Máy tính (Chrome/Edge):** biểu tượng **Cài đặt** ở thanh địa chỉ.

Muốn ra **file APK / lên CH Play**: dùng [PWABuilder](https://www.pwabuilder.com)
→ dán URL web → **Package for stores** (Android). Không cần code thêm.

## 🛠 Chạy trên máy tính

```bash
npm install
npm run dev     # http://localhost:3000
```

## ☁️ Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project → Import** repo `Vdear`.
2. **Production Branch = `main`**.
3. Bấm **Deploy**. Xong — **không cần biến môi trường gì cả**.

## 🧩 Cấu trúc

```
app/          # Các trang (đều là client component, đọc từ store)
components/   # Navbar, Footer, MemberCard, tree/ (React Flow), ui/, manage/
lib/
  store.ts       # Zustand + localStorage (thêm/sửa/xóa, chống vòng lặp)
  genealogy.ts   # Hàm quan hệ thuần (cha/mẹ/con/anh em/vòng lặp)
  tree-layout.ts # Bố cục cây theo cặp vợ chồng
types/        # Kiểu TypeScript dùng chung
```

> Muốn nâng cấp thành nền tảng nhiều người dùng chung (đăng nhập, lưu đám mây),
> có thể gắn lại Supabase sau — nhưng bản hiện tại cố tình giữ đơn giản, chạy ngay.

# 🌳 Gia Phả — Web Cây Phả Hệ Dòng Họ

Ứng dụng web dựng **cây gia phả (family tree)** cho dòng họ. Chạy hoàn toàn trên
trình duyệt, không cần máy chủ, dữ liệu được lưu tự động trong trình duyệt
(`localStorage`).

## ✨ Tính năng

- **Thêm / sửa / xóa** thành viên: họ tên, giới tính, năm sinh, năm mất, ghi chú.
- **Quan hệ** cha/mẹ – con và vợ/chồng; cây tự động sắp xếp theo từng đời.
- **Trực quan hóa** dạng cây với đường nối vợ chồng và cha con.
- **Phóng to / thu nhỏ / kéo di chuyển** (kéo chuột hoặc `Ctrl` + lăn chuột).
- **Xuất / Nhập** dữ liệu ra tệp JSON để sao lưu và chia sẻ.
- **Dữ liệu mẫu** để xem thử ngay.
- Tự động lưu — mở lại trình duyệt vẫn còn dữ liệu.

## 🚀 Cách dùng

Chỉ cần mở tệp `index.html` bằng trình duyệt. Không cần cài đặt gì.

Hoặc chạy một máy chủ tĩnh cục bộ:

```bash
python3 -m http.server 8000
# rồi mở http://localhost:8000
```

## 📁 Cấu trúc

| Tệp | Vai trò |
|-----|---------|
| `index.html` | Giao diện và cấu trúc trang |
| `styles.css` | Toàn bộ kiểu dáng |
| `app.js` | Logic: dữ liệu, thuật toán sắp xếp cây, lưu trữ, xuất/nhập |

## 🧬 Mô hình dữ liệu

Mỗi thành viên là một đối tượng:

```json
{
  "id": "p1",
  "name": "Nguyễn Văn A",
  "gender": "male",       // male | female | other
  "birth": "1950",
  "death": "",
  "note": "Ghi chú",
  "parentId": "p0",        // id của cha hoặc mẹ (huyết thống), hoặc null
  "spouseId": "p2"          // id của vợ/chồng, hoặc null
}
```

- `parentId` trỏ tới **một** cha/mẹ huyết thống — con được xếp bên dưới cặp đó.
- `spouseId` là hai chiều: chọn vợ/chồng sẽ tự động cập nhật cho cả hai người.

## 🔒 Quyền riêng tư

Mọi dữ liệu chỉ nằm trên máy của bạn (trong trình duyệt). Không có gì được gửi
lên mạng. Dùng nút **Xuất** để sao lưu.

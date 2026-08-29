# Hướng dẫn cho agent lập trình (Antigravity · Cursor · Copilot · Claude Code)

Đọc hết file này trước khi sửa bất cứ thứ gì. Nó ngắn, và mỗi mục đều là thứ
đã từng gây hỏng thật.

---

## 1. CẢNH BÁO ĐẦU TIÊN — repo này chứa HAI dự án không liên quan nhau

    main                                    →  "Gia Phả Dòng Họ Lê"  (web gia phả, Next.js)
    claude/crypto-dashboard-redesign-pcgtbh →  "Vdearypto"           (dashboard crypto)

Hai nhánh **không có tổ tiên chung** (`git merge-base` trả về rỗng). Chúng là
hai cây lịch sử riêng biệt nằm chung một repo.

* Mở repo lên, mặc định bạn đang ở `main` — tức là **web gia phả**, không phải
  Vdearypto.
* **Tuyệt đối không merge, rebase hay force-push giữa hai nhánh.** Làm vậy là
  xoá sổ một trong hai website.
* Muốn sửa Vdearypto: `git checkout claude/crypto-dashboard-redesign-pcgtbh`.

---

## 2. Quy tắc dữ liệu — không thương lượng

Đây là trang tài chính. Một con số bịa nằm cạnh một con số thật thì **nguy hiểm
hơn là không có số nào**.

* **Không bịa số liệu thị trường.** Không hard-code giá, khối lượng, dòng tiền,
  thanh lý, giao dịch cá voi. Không `Math.random()` cho bất cứ thứ gì người dùng
  đọc như dữ liệu.
* **Không có nguồn thì nói thẳng là chưa có nguồn** — nêu rõ thiếu gì và vì sao.
  Xem `noSource()` cũ hoặc ô "Nguồn không công bố" trong `js/etf.js`.
* **Số 0 khác với không có dữ liệu.** `$0` là dữ liệu; `—` là thiếu dữ liệu.
  Gộp hai thứ này đã từng gây lỗi thật (xem lịch sử `js/etf.js`).
* **Không đoán endpoint API.** Sai thì phải sửa được bằng biến môi trường, và
  thông báo lỗi phải nói rõ *đã gọi gì* và *nhận được cấu trúc gì*.
* **API key chỉ nằm ở server.** Trình duyệt không bao giờ được thấy key. Cần key
  thì viết serverless function trong `api/`, như `api/etf-flow.js`.
* **Không tạo chỉ số mới nếu chưa xác định công thức.** Không có "điểm thị
  trường 68/100" nếu không nói được 68 tính từ đâu.
* Không hứa "chắc chắn thắng", không tạo tín hiệu "100% chính xác".

---

## 3. Kiến trúc

Bản đang chạy là **trang tĩnh**, không có bước build:

    legacy-static/          ← toàn bộ website (vercel.json trỏ vào đây)
      index.html            trang chủ
      coin.html             chi tiết coin
      bubbles.html          bóng bóng thị trường
      js/api.js             gọi 4 sàn + CoinGecko, gộp dữ liệu
      js/indicators.js      RSI, hỗ trợ/kháng cự, chấm điểm tín hiệu
      js/etf.js             dòng tiền ETF + biểu đồ khối 3D theo quỹ
      js/chart.js           chart nến tự vẽ trên canvas
      js/navmenu.js         menu 3 gạch / dải icon bên trái
    api/etf-flow.js         serverless function, giữ API key

Thư mục `app/`, `lib/`, `components/` là app Next.js **không được deploy**.
`vercel.json` đặt `outputDirectory: legacy-static`.

---

## 4. Trước khi push, phải chạy

    npm run test:fast        # 270 test, không cần node_modules

Không có network trong môi trường phát triển: registry npm và mọi CDN đều bị
chặn. Đừng thêm dependency; đừng dựa vào việc chạy được `npm install`.

---

## 5. Hiệu năng — bài học đã trả giá

Trang từng chạy **6 fps** trên PC. Nguyên nhân **không phải JavaScript** (hồ sơ
CPU cho thấy luồng chính 95.9% nhàn rỗi) mà là **chi phí vẽ và ghép lớp**:

* `filter: blur(30px)` trên một lớp `position:fixed` phủ 140% khung nhìn, lại
  chạy animation vô hạn.
* `backdrop-filter` đặt trên `.panel` — mà trang chủ có **14 panel**.

Bỏ hai thứ đó: **6.2 → 24.3 fps** khi đứng yên, **11.9 → 47.0 fps** khi cuộn
(đo xen kẽ ba vòng, chỉ tráo `styles.css`).

Nên:

* `backdrop-filter` chỉ dùng cho **một** phần tử nhỏ dính trên cùng (`.topbar`).
  Không rải lên danh sách hay thẻ lặp lại.
* Không `filter:` trên lớp phủ toàn màn hình đang chạy animation.
* Vòng `requestAnimationFrame` phải **ngủ** khi khuất tầm nhìn hoặc tab bị ẩn —
  xem `IntersectionObserver` + `visibilitychange`.
* Không gọi `getComputedStyle` trong vòng vẽ. Đọc một lần, đọc lại khi đổi theme.
* **Đo bằng phép xen kẽ**, đừng so hai lần chạy ở hai thời điểm: máy dùng chung,
  tải máy đổi liên tục. Đã có lần đo sai lệch 4 lần vì chuyện này.

---

## 6. Nếu định thêm giao diện 3D (WebGL / three.js)

Đọc mục 5 trước. Trang này đã từng giật nặng chỉ vì vài lớp mờ CSS; WebGL tốn
hơn nhiều lần.

* Không có bước build và không cài được package → thư viện phải nạp từ CDN qua
  `<script>`, hoặc chép thẳng file vào repo. Ưu tiên chép vào repo: CDN có thể
  bị chặn, và trang sẽ trắng nếu nó hỏng.
* Cảnh 3D phải **dừng render** khi khuất tầm nhìn / tab ẩn, và tôn trọng
  `prefers-reduced-motion`.
* Phải có đường lùi cho máy không có WebGL và cho điện thoại yếu.
* Đã có sẵn hai thứ 3D **không cần thư viện**, dùng lại được:
  `js/etf.js` (`isoChart`, chiếu isometric bằng SVG) và `js/bubbles.js` (canvas 2D).
* Số liệu trong cảnh 3D vẫn phải theo mục 2. Đẹp không phải lý do để bịa số.

/*
 * Vỏ bọc phản hồi dùng chung cho mọi hàm trong api/.
 *
 * Mục 5 của docs/INFRA-SCALING.md: "Trả về cả timestamp dữ liệu để web biết dữ
 * liệu cũ hay mới."
 *
 * VÌ SAO CẦN
 * ----------
 * Mọi hàm ở đây đều cache và đều phục vụ qua CDN. Người dùng vì thế thường
 * nhận số của vài phút trước — điều đó hoàn toàn bình thường và không sao,
 * MIỄN LÀ họ biết. Một con số funding của mười phút trước nằm cạnh một con số
 * giá thời gian thực mà không ghi gì là mời người ta đọc nhầm.
 *
 * `ageSeconds` là tuổi thật của dữ liệu, `stale` bật khi tuổi vượt ngưỡng của
 * chính endpoint đó. Giao diện có nghĩa vụ hiện tuổi ra, không giấu.
 */

function num(x) {
  if (x == null || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/*
 * Bọc payload. `generatedAt` là ISO string do chính hàm build() ghi lại.
 *
 * KHÔNG tự đặt generatedAt = bây giờ khi payload thiếu trường đó: làm vậy là
 * khẳng định dữ liệu vừa mới, trong khi thực tế ta không biết nó bao nhiêu
 * tuổi. Thiếu thì để null và bật cờ `unknownAge`.
 */
function wrap(payload, opts) {
  const o = opts || {};
  const now = num(o.now) != null ? num(o.now) : Date.now();
  const maxAge = num(o.maxAgeSeconds);

  let generatedMs = null;
  if (payload && payload.generatedAt) {
    const t = Date.parse(payload.generatedAt);
    if (Number.isFinite(t)) generatedMs = t;
  }

  const ageSeconds = generatedMs != null
    ? Math.max(0, Math.round((now - generatedMs) / 1000)) : null;

  return Object.assign({}, payload, {
    ageSeconds: ageSeconds,
    unknownAge: ageSeconds == null,
    // Thiếu tuổi thì KHÔNG được coi là tươi. "Không biết" nghiêng về phía thận
    // trọng, vì phía kia là hiện một con số cũ như thể nó vừa mới.
    stale: ageSeconds == null ? true : (maxAge != null && ageSeconds > maxAge),
    maxAgeSeconds: maxAge != null ? maxAge : null,
    servedAt: new Date(now).toISOString(),
  });
}

/*
 * Đặt header cache và trả JSON đã bọc. Một chỗ duy nhất để mọi endpoint có
 * cùng hành vi — mỗi hàm tự viết header là mỗi hàm một kiểu.
 */
function send(res, payload, opts) {
  const o = opts || {};
  const sMaxAge = num(o.sMaxAge) || 300;
  const swr = num(o.staleWhileRevalidate) || sMaxAge * 3;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control',
    'public, max-age=0, s-maxage=' + sMaxAge + ', stale-while-revalidate=' + swr);
  res.statusCode = 200;
  res.end(JSON.stringify(wrap(payload, {
    maxAgeSeconds: num(o.maxAgeSeconds) != null ? num(o.maxAgeSeconds) : sMaxAge * 2,
    now: o.now,
  })));
}

/*
 * Lỗi cũng trả 200 với `ok: false`.
 *
 * Trả 5xx thì CDN sẽ cache chính cái lỗi đó, và mọi người nhận lỗi cho tới khi
 * hết hạn. Quan trọng hơn: giao diện đọc `ok` rõ ràng hơn là đoán từ mã trạng
 * thái, và mọi trang ở đây đều đã biết cách hiện "không lấy được dữ liệu".
 */
function fail(res, error) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: false,
    errors: [String((error && error.message) || error)],
    servedAt: new Date().toISOString(),
    ageSeconds: null, unknownAge: true, stale: true,
  }));
}

module.exports = { wrap, send, fail, _num: num };

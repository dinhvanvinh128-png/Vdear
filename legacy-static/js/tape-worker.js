/*
 * Vdearypto — Web Worker tính CVD, phân kỳ và Volume Profile.
 *
 * Vì sao là worker: gộp vài nghìn bucket, dò pivot trên toàn chuỗi và dựng
 * profile theo giá là công việc chạy lại mỗi lần người dùng kéo hoặc phóng to
 * biểu đồ. Làm trên luồng chính thì thao tác kéo biểu đồ giật ngay.
 *
 * Worker KHÔNG giữ trạng thái tape. Luồng chính gửi sang đúng đống bucket cần
 * tính; giữ hai bản sao ở hai bên là cách chắc chắn nhất để chúng lệch nhau.
 */
self.window = self;
importScripts('tape.js', 'cvd.js', 'vp.js');

var T = self.VdearTape;
var C = self.VdearCVD;
var V = self.VdearVP;

self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type !== 'compute') return;

  var out = { type: 'result', id: m.id };
  try {
    var buckets = m.buckets || [];

    // Gộp lên khung đang xem. Bước giá được lượng tử hoá lại trong rollup().
    var rolled = m.targetMs && m.targetMs > 60000
      ? T.rollup(buckets, m.targetMs, { tickSize: m.tickSize, maxLevels: m.maxLevels })
      : buckets;

    var cvd = C.series(rolled, { bucketMs: m.targetMs });
    out.cvd = { rows: cvd.rows, startedAt: cvd.startedAt, last: cvd.last };

    if (m.candles && m.candles.length) {
      var det = C.detect(m.candles, alignToCandles(cvd.rows, m.candles), {
        left: m.pivotLeft, right: m.pivotRight,
        minBars: m.minBars, maxBars: m.maxBars,
      });
      out.divergences = det.divergences || [];
      out.enough = det.enough;
      out.unconfirmedBars = det.unconfirmedBars;
    }

    /*
     * Volume Profile. Nguồn 'tape' khi có bucket thật; nếu không thì dựng từ
     * nến và ĐÁNH DẤU xấp xỉ. Không bao giờ trộn hai nguồn vào một hình.
     */
    var prof = null;
    if (rolled.length) prof = V.fromTape(rolled, { tickSize: m.tickSize, maxLevels: m.vpLevels });
    if (!prof && m.candles && m.candles.length) {
      prof = V.fromCandles(m.candles, { buckets: m.vpBuckets || 90 });
    }
    out.profile = prof;
    out.ok = true;
  } catch (err) {
    out.ok = false;
    out.error = String((err && err.message) || err);
  }
  self.postMessage(out);
};

/*
 * Dóng chuỗi CVD sang đúng chỉ số nến. Bucket cách nến quá nửa khung thì để
 * null — nối bừa qua khoảng trống sẽ vẽ ra một đoạn đi ngang trông như thị
 * trường cân bằng, trong khi thực tế là ta không có dữ liệu.
 */
function alignToCandles(rows, candles) {
  var out = new Array(candles.length).fill(null);
  if (!rows || !rows.length) return out;
  var stepMs = candles.length > 1 ? (candles[1].time - candles[0].time) * 1000 : 60000;
  var tol = stepMs * 0.5;
  var j = 0;
  for (var i = 0; i < candles.length; i++) {
    var t = candles[i].time * 1000;
    while (j + 1 < rows.length && Math.abs(rows[j + 1].t - t) <= Math.abs(rows[j].t - t)) j++;
    out[i] = Math.abs(rows[j].t - t) <= tol ? rows[j] : null;
  }
  return out;
}

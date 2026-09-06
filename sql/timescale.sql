-- =====================================================================
-- Vdearypto — LƯỢC ĐỒ TIMESCALEDB
--
-- Mục 2 của docs/INFRA-SCALING.md, viết thành tệp chạy được thay vì chỉ mô tả.
-- Chạy trên Postgres đã bật extension TimescaleDB:
--
--     psql "$DATABASE_URL" -f sql/timescale.sql
--
-- Tệp này CHẠY LẠI ĐƯỢC (idempotent): mọi lệnh đều IF NOT EXISTS. Chạy hai
-- lần không hỏng gì.
--
-- BA QUYẾT ĐỊNH ĐÁNG GIẢI THÍCH
-- -----------------------------
-- 1. Nến 1 phút là ĐƠN VỊ GỐC duy nhất được ghi. Mọi khung lớn hơn là
--    continuous aggregate dựng từ nó. Ghi song song nhiều khung là mở đường
--    cho khung 1 giờ và khung 1 phút nói hai điều khác nhau về cùng một giờ.
--
-- 2. Khoá chính là (symbol, bucket) chứ không phải một id tự tăng. Nạp lại
--    cùng một đoạn dữ liệu là chuyện thường xuyên (bù sau khi mất kết nối), và
--    ON CONFLICT DO UPDATE biến việc đó thành vô hại.
--
-- 3. Số lưu bằng NUMERIC, không phải DOUBLE PRECISION. Giá và khối lượng ở đây
--    là tiền; cộng dồn hàng triệu dòng bằng số dấu phẩy động thì tổng sẽ lệch,
--    và lệch theo cách không lặp lại được.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------- nến 1m
CREATE TABLE IF NOT EXISTS candles_1m (
  symbol      TEXT        NOT NULL,
  bucket      TIMESTAMPTZ NOT NULL,
  open        NUMERIC     NOT NULL,
  high        NUMERIC     NOT NULL,
  low         NUMERIC     NOT NULL,
  close       NUMERIC     NOT NULL,
  volume      NUMERIC     NOT NULL,
  quote_volume NUMERIC,
  trades      INTEGER,
  -- Sàn nào cấp dòng này. Cùng một symbol có thể đến từ nhiều sàn và ta cần
  -- biết ai nói gì trước khi gộp.
  venue       TEXT        NOT NULL DEFAULT 'binance',
  PRIMARY KEY (symbol, venue, bucket)
);

SELECT create_hypertable('candles_1m', 'bucket',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS candles_1m_symbol_time
  ON candles_1m (symbol, bucket DESC);

-- --------------------------------------------------------- open interest
CREATE TABLE IF NOT EXISTS open_interest (
  symbol      TEXT        NOT NULL,
  venue       TEXT        NOT NULL,
  bucket      TIMESTAMPTZ NOT NULL,
  oi_contracts NUMERIC,
  oi_usd      NUMERIC,
  PRIMARY KEY (symbol, venue, bucket)
);
SELECT create_hypertable('open_interest', 'bucket',
  chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

-- --------------------------------------------------------------- funding
CREATE TABLE IF NOT EXISTS funding (
  symbol      TEXT        NOT NULL,
  venue       TEXT        NOT NULL,
  funding_time TIMESTAMPTZ NOT NULL,
  rate        NUMERIC     NOT NULL,
  -- Chu kỳ của CHÍNH sàn đó, tính bằng giờ. Không có cột này thì không cộng
  -- được funding của sàn 4h với sàn 8h — xem api/term-structure.js.
  interval_hours NUMERIC  NOT NULL,
  PRIMARY KEY (symbol, venue, funding_time)
);
SELECT create_hypertable('funding', 'funding_time',
  chunk_time_interval => INTERVAL '30 days', if_not_exists => TRUE);

-- ------------------------------------------------- bucket theo lệnh khớp
-- Tương ứng js/tape.js. `delta` và tổng khối lượng KHÔNG lưu — chúng là số
-- dẫn xuất và được tính khi đọc (xem view bên dưới).
CREATE TABLE IF NOT EXISTS tape_1m (
  symbol      TEXT        NOT NULL,
  bucket      TIMESTAMPTZ NOT NULL,
  buy_volume  NUMERIC     NOT NULL DEFAULT 0,
  sell_volume NUMERIC     NOT NULL DEFAULT 0,
  buy_quote   NUMERIC     NOT NULL DEFAULT 0,
  sell_quote  NUMERIC     NOT NULL DEFAULT 0,
  trades      INTEGER     NOT NULL DEFAULT 0,
  first_agg_id BIGINT,
  last_agg_id BIGINT,
  -- Bản đồ giá -> khối lượng. JSONB vì số mức thay đổi theo từng bucket.
  levels      JSONB,
  price_step  NUMERIC,
  PRIMARY KEY (symbol, bucket)
);
SELECT create_hypertable('tape_1m', 'bucket',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

CREATE OR REPLACE VIEW tape_1m_derived AS
  SELECT symbol, bucket, buy_volume, sell_volume,
         buy_volume - sell_volume            AS delta,
         buy_volume + sell_volume            AS total_volume,
         CASE WHEN buy_volume + sell_volume > 0
              THEN (buy_quote + sell_quote) / (buy_volume + sell_volume)
              ELSE NULL END                  AS vwap,
         trades, price_step
  FROM tape_1m;

-- --------------------------------------------------------------- tín hiệu
-- Mục 6: mỗi tín hiệu mang PHIÊN BẢN logic đã sinh ra nó. `shadow = true`
-- nghĩa là tín hiệu này chưa từng hiện ra cho ai — xem js/signal-version.js.
CREATE TABLE IF NOT EXISTS signals (
  id          BIGSERIAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  symbol      TEXT        NOT NULL,
  timeframe   TEXT        NOT NULL,
  version     TEXT        NOT NULL,
  shadow      BOOLEAN     NOT NULL DEFAULT FALSE,
  side        TEXT,
  confluence  SMALLINT,
  score       NUMERIC,
  regime      TEXT,
  entry       NUMERIC,
  take_profit NUMERIC,
  stop_loss   NUMERIC,
  -- NULL = chưa dứt. KHÁC với thua. Mọi phép thống kê phải loại NULL ra chứ
  -- không được coi là 0.
  outcome     TEXT,
  r_multiple  NUMERIC,
  resolved_at TIMESTAMPTZ,
  PRIMARY KEY (id, created_at)
);
SELECT create_hypertable('signals', 'created_at',
  chunk_time_interval => INTERVAL '30 days', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS signals_version_time
  ON signals (version, created_at DESC);
CREATE INDEX IF NOT EXISTS signals_symbol_time
  ON signals (symbol, created_at DESC);

-- --------------------------------------------------------------- quan trắc
CREATE TABLE IF NOT EXISTS metrics (
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metric      TEXT        NOT NULL,
  venue       TEXT,
  value       NUMERIC,
  detail      JSONB
);
SELECT create_hypertable('metrics', 'at',
  chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS metrics_name_time ON metrics (metric, at DESC);

-- ============================ khung lớn ==============================
-- Continuous aggregate: khung lớn dựng SẴN từ nến 1 phút, không tính lúc đọc.
--
-- `time_bucket` gộp theo mốc cố định nên nến 1 giờ luôn bắt đầu đúng đầu giờ.
-- first()/last() của TimescaleDB lấy theo THỜI GIAN chứ không theo thứ tự
-- dòng — đó là lý do dùng chúng thay vì min()/max() cho open/close.

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1h
WITH (timescaledb.continuous) AS
  SELECT symbol, venue,
         time_bucket(INTERVAL '1 hour', bucket) AS bucket,
         first(open, bucket)  AS open,
         max(high)            AS high,
         min(low)             AS low,
         last(close, bucket)  AS close,
         sum(volume)          AS volume,
         sum(quote_volume)    AS quote_volume,
         sum(trades)          AS trades
  FROM candles_1m
  GROUP BY symbol, venue, time_bucket(INTERVAL '1 hour', bucket)
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_4h
WITH (timescaledb.continuous) AS
  SELECT symbol, venue,
         time_bucket(INTERVAL '4 hours', bucket) AS bucket,
         first(open, bucket)  AS open,
         max(high)            AS high,
         min(low)             AS low,
         last(close, bucket)  AS close,
         sum(volume)          AS volume,
         sum(quote_volume)    AS quote_volume,
         sum(trades)          AS trades
  FROM candles_1m
  GROUP BY symbol, venue, time_bucket(INTERVAL '4 hours', bucket)
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1d
WITH (timescaledb.continuous) AS
  SELECT symbol, venue,
         time_bucket(INTERVAL '1 day', bucket) AS bucket,
         first(open, bucket)  AS open,
         max(high)            AS high,
         min(low)             AS low,
         last(close, bucket)  AS close,
         sum(volume)          AS volume,
         sum(quote_volume)    AS quote_volume,
         sum(trades)          AS trades
  FROM candles_1m
  GROUP BY symbol, venue, time_bucket(INTERVAL '1 day', bucket)
WITH NO DATA;

-- Làm mới tự động. `end_offset` để lại một khoảng chưa gộp: nến gần nhất còn
-- đang chạy và gộp nó vào là chốt một cây nến chưa đóng.
SELECT add_continuous_aggregate_policy('candles_1h',
  start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '5 minutes', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('candles_4h',
  start_offset => INTERVAL '10 days', end_offset => INTERVAL '4 hours',
  schedule_interval => INTERVAL '15 minutes', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('candles_1d',
  start_offset => INTERVAL '30 days', end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE);

-- ======================= nén và hạn lưu trữ ==========================
-- Nén sau 7 ngày: dữ liệu cũ hầu như chỉ đọc theo dải thời gian, và nén giảm
-- dung lượng khoảng một bậc. Đây là đòn bẩy chi phí lớn nhất của cả lược đồ
-- (xem bảng chi phí trong docs/INFRA-SCALING.md).

ALTER TABLE candles_1m SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol, venue',
  timescaledb.compress_orderby = 'bucket DESC'
);
SELECT add_compression_policy('candles_1m', INTERVAL '7 days', if_not_exists => TRUE);

ALTER TABLE tape_1m SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'symbol',
  timescaledb.compress_orderby = 'bucket DESC'
);
SELECT add_compression_policy('tape_1m', INTERVAL '3 days', if_not_exists => TRUE);

-- Hạn lưu trữ. Bucket theo lệnh khớp là thứ chiếm chỗ nhất và cũng là thứ mất
-- giá trị nhanh nhất — CVD của ba tháng trước gần như không ai xem.
SELECT add_retention_policy('tape_1m', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('metrics', INTERVAL '90 days', if_not_exists => TRUE);

-- Nến 1 phút GIỮ LÂU: mọi backtest đều dựng lại từ nó, và đây là thứ duy nhất
-- không mua lại được nếu xoá nhầm.
SELECT add_retention_policy('candles_1m', INTERVAL '400 days', if_not_exists => TRUE);

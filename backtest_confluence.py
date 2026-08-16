"""
BACKTEST: S&R (đa khung) + Price Action (đa khung) + RSI (H4) + DCA — 10 COIN

RSI H4  -> xác định HƯỚNG lệnh (quá mua/quá bán rồi quay đầu)
S&R đa khung -> xác nhận VÙNG GIÁ MẠNH (kiểm tra trên H4, H1, M15, M5)
PA đa khung  -> xác nhận NẾN ĐẢO CHIỀU (kiểm tra trên H4, H1, M15, M5)
Thực thi lệnh trên khung M5.
Chạy lần lượt qua 10 coin: WLD, HYPE, BCH, AVAX, TRX, ZEC, DOGE, NEAR, UNI, TAO.

QUẢN LÝ VỐN (không đổi so với bản trước):
• TP gốc: +100% margin
• Nếu lệnh xuống -50% margin TRƯỚC khi chạm TP -> DCA 1 lần (thêm đúng 1 lần vốn
  gốc), tính lại giá vào trung bình, tổng vốn = 2x ban đầu
• Sau DCA: SL mới = -50% trên TỔNG vốn mới, TP mới = +100% trên TỔNG vốn mới
• LƯU Ý: giai đoạn TRƯỚC DCA không có SL — chỉ có 2 khả năng: thắng +100%
  hoặc bị âm tới ngưỡng DCA. Rủi ro thật nằm ở SAU DCA (mất ~100% vốn gốc).

CÀI ĐẶT (Google Colab, KHÔNG chạy được trong sandbox này):
    !pip install ccxt pandas numpy

CHẠY:
    python backtest_confluence.py

LƯU Ý VỀ THỜI GIAN CHẠY: 10 coin × 4 khung dữ liệu là khối lượng lớn. Script đã
giảm BACKTEST_DAYS xuống 60 ngày (thay vì 180) để tổng thời gian chạy còn khả thi
trên Colab. Nếu 1 coin nào đó fetch lỗi (không có cặp SPOT trên OKX, tên symbol
khác...), script tự bỏ qua và chạy tiếp coin khác — không làm hỏng cả lần chạy.

LƯU Ý VỀ SÀN: HYPE (Hyperliquid) và TAO (Bittensor) có thể KHÔNG có cặp SPOT trên
OKX. Nếu bị bỏ qua, đổi EXCHANGE_ID sang "binance" hoặc "bybit", hoặc chuyển sang
cặp phái sinh (vd "HYPE/USDT:USDT") tuỳ sàn.
"""

import ccxt
import pandas as pd
import numpy as np

# ============================================================
# CONFIG
# ============================================================
EXCHANGE_ID = "okx"  # đổi "binance"/"bybit" nếu bị chặn IP (lỗi 451)

SYMBOLS = [
    "WLD/USDT", "HYPE/USDT", "BCH/USDT", "AVAX/USDT", "TRX/USDT",
    "ZEC/USDT", "DOGE/USDT", "NEAR/USDT", "UNI/USDT", "TAO/USDT",
]

TFS = ["4h", "1h", "15m", "5m"]  # các khung dùng để xác nhận S&R + Price Action
RSI_TF = "4h"                    # khung tính RSI để xác định hướng lệnh
EXEC_TF = "5m"                   # khung thực thi lệnh (entry + forward scan)

BACKTEST_UNTIL = "2026-08-01"
BACKTEST_DAYS = 60  # giảm từ 180 -> 60 vì chạy 10 coin cùng lúc (mỗi coin đều tải
#                     đủ 4 khung). Test 1 coin riêng lẻ thì có thể tăng lại 180.

SWING_WINDOW = 5
SR_TOUCH_TOLERANCE = 0.003

MIN_SR_TF_MATCH = 2
MIN_PA_TF_MATCH = 1

RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERBOUGHT_STRONG = 80
RSI_OVERSOLD = 30
RSI_OVERSOLD_STRONG = 20
RSI_LOOKBACK_CANDLES = 5

TP_MARGIN_PCT = 100
DCA_TRIGGER_PCT = 50
POST_DCA_SL_PCT = 50
POST_DCA_TP_PCT = 100

LEVERAGES = [50, 100]

TAKER_FEE_PCT_PER_SIDE = 0.05

FORWARD_SCAN_CANDLES = 1000


# ============================================================
# 1. LẤY DATA LỊCH SỬ
# ============================================================
def fetch_ohlcv_range(exchange, symbol, timeframe, since_str, until_str):
    since = int(pd.Timestamp(since_str, tz="UTC").timestamp() * 1000)
    until = int(pd.Timestamp(until_str, tz="UTC").timestamp() * 1000)
    all_rows = []
    last_since = None
    while since < until:
        batch = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1000)
        if not batch:
            break
        all_rows += batch
        new_since = batch[-1][0] + 1
        if last_since is not None and new_since <= last_since:
            break
        last_since = new_since
        since = new_since
    df = pd.DataFrame(all_rows, columns=["ts", "open", "high", "low", "close", "volume"])
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    df = df[df["ts"] <= pd.Timestamp(until_str, tz="UTC")].reset_index(drop=True)
    return df


# ============================================================
# 2. SUPPORT & RESISTANCE
# ============================================================
def find_swing_points(df, window=SWING_WINDOW):
    highs, lows = [], []
    for i in range(window, len(df) - window):
        seg_h = df["high"].iloc[i - window:i + window + 1]
        seg_l = df["low"].iloc[i - window:i + window + 1]
        if df["high"].iloc[i] == seg_h.max():
            highs.append((i, df["high"].iloc[i]))
        if df["low"].iloc[i] == seg_l.min():
            lows.append((i, df["low"].iloc[i]))
    return highs, lows


def near_sr_level(price, sr_levels, tolerance=SR_TOUCH_TOLERANCE):
    for _, level in sr_levels:
        if abs(price - level) / level <= tolerance:
            return True
    return False


# ============================================================
# 3. PRICE ACTION
# ============================================================
def detect_pa_signal(df, i):
    if i < 1:
        return None
    o, c, h, l = df["open"].iloc[i], df["close"].iloc[i], df["high"].iloc[i], df["low"].iloc[i]
    po, pc = df["open"].iloc[i - 1], df["close"].iloc[i - 1]
    body = abs(c - o)
    rng = h - l
    if rng == 0:
        return None
    if pc < po and c > o and c >= po and o <= pc:
        return "bullish"
    if pc > po and c < o and c <= po and o >= pc:
        return "bearish"
    lower_wick = min(o, c) - l
    upper_wick = h - max(o, c)
    if lower_wick > body * 2 and lower_wick > rng * 0.5:
        return "bullish"
    if upper_wick > body * 2 and upper_wick > rng * 0.5:
        return "bearish"
    return None


# ============================================================
# 4. RSI
# ============================================================
def compute_rsi(close, period=RSI_PERIOD):
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.where(avg_loss != 0, 100.0)
    rsi = rsi.where(~((avg_gain == 0) & (avg_loss == 0)), 50.0)
    return rsi


def rsi_reversal_direction(h4_idx, rsi_series):
    if h4_idx < RSI_PERIOD + RSI_LOOKBACK_CANDLES:
        return None, ""
    recent = rsi_series.iloc[h4_idx - RSI_LOOKBACK_CANDLES:h4_idx + 1]
    now = rsi_series.iloc[h4_idx]
    if recent.min() <= RSI_OVERSOLD and now > RSI_OVERSOLD:
        note = "quá bán mạnh (<20)" if recent.min() < RSI_OVERSOLD_STRONG else "quá bán (20-30)"
        return "bullish", note
    if recent.max() >= RSI_OVERBOUGHT and now < RSI_OVERBOUGHT:
        note = "quá mua mạnh (>80)" if recent.max() > RSI_OVERBOUGHT_STRONG else "quá mua (70-80)"
        return "bearish", note
    return None, ""


# ============================================================
# 5. MAP THỜI GIAN GIỮA CÁC KHUNG
# ============================================================
def map_time_to_tf_index(ts_ns, tf_ts_ns_array):
    return np.searchsorted(tf_ts_ns_array, ts_ns, side="right") - 1


# ============================================================
# 6. MÔ PHỎNG 1 LỆNH — TP gốc / DCA / SL+TP sau DCA
# ============================================================
def simulate_trade_dca(df_exec, entry_idx, direction, leverage):
    E1 = df_exec["close"].iloc[entry_idx]
    L = leverage
    fee_frac = TAKER_FEE_PCT_PER_SIDE / 100

    move_tp0 = (TP_MARGIN_PCT / 100) / L
    move_dca = (DCA_TRIGGER_PCT / 100) / L

    if direction == "bullish":
        P_tp0 = E1 * (1 + move_tp0)
        P_dca = E1 * (1 - move_dca)
    else:
        P_tp0 = E1 * (1 - move_tp0)
        P_dca = E1 * (1 + move_dca)

    units1 = L / E1
    fee_entry1 = units1 * E1 * fee_frac

    dca_done = False
    units_total = units1
    cost_total = units1 * E1
    P_sl_new = P_tp_new = None
    fee_dca = 0.0

    for j in range(entry_idx + 1, min(entry_idx + FORWARD_SCAN_CANDLES, len(df_exec))):
        hi, lo = df_exec["high"].iloc[j], df_exec["low"].iloc[j]

        if not dca_done:
            hit_dca = (lo <= P_dca) if direction == "bullish" else (hi >= P_dca)
            hit_tp0 = (hi >= P_tp0) if direction == "bullish" else (lo <= P_tp0)

            if hit_dca:
                entry2 = P_dca
                units2 = L / entry2
                units_total = units1 + units2
                cost_total = units1 * E1 + units2 * entry2
                fee_dca = units2 * entry2 * fee_frac
                dca_done = True

                margin_total = 2
                avg_entry = cost_total / units_total
                if direction == "bullish":
                    P_sl_new = avg_entry - (POST_DCA_SL_PCT / 100) * margin_total / units_total
                    P_tp_new = avg_entry + (POST_DCA_TP_PCT / 100) * margin_total / units_total
                else:
                    P_sl_new = avg_entry + (POST_DCA_SL_PCT / 100) * margin_total / units_total
                    P_tp_new = avg_entry - (POST_DCA_TP_PCT / 100) * margin_total / units_total
                continue

            if hit_tp0:
                exit_price = P_tp0
                fee_exit = units_total * exit_price * fee_frac
                total_fee_pct = (fee_entry1 + fee_exit) * 100
                return {
                    "outcome": "win_no_dca", "gross_pct": TP_MARGIN_PCT,
                    "net_pct": TP_MARGIN_PCT - total_fee_pct, "dca_used": False,
                }, j
        else:
            hit_sl = (lo <= P_sl_new) if direction == "bullish" else (hi >= P_sl_new)
            hit_tp = (hi >= P_tp_new) if direction == "bullish" else (lo <= P_tp_new)

            if hit_sl:
                exit_price = P_sl_new
                fee_exit = units_total * exit_price * fee_frac
                total_fee_pct = (fee_entry1 + fee_dca + fee_exit) * 100
                return {
                    "outcome": "loss_after_dca", "gross_pct": -POST_DCA_SL_PCT * 2,
                    "net_pct": -POST_DCA_SL_PCT * 2 - total_fee_pct, "dca_used": True,
                }, j
            if hit_tp:
                exit_price = P_tp_new
                fee_exit = units_total * exit_price * fee_frac
                total_fee_pct = (fee_entry1 + fee_dca + fee_exit) * 100
                return {
                    "outcome": "win_after_dca", "gross_pct": POST_DCA_TP_PCT * 2,
                    "net_pct": POST_DCA_TP_PCT * 2 - total_fee_pct, "dca_used": True,
                }, j

    return None, None


# ============================================================
# 7. TÌM TÍN HIỆU VÀO LỆNH
# ============================================================
def find_entry_signals(tf_dfs, sr_levels_by_tf, rsi_series):
    df_exec = tf_dfs[EXEC_TF]
    tf_ts_ns = {tf: tf_dfs[tf]["ts"].astype("int64").values for tf in TFS}
    rsi_tf_ts_ns = tf_dfs[RSI_TF]["ts"].astype("int64").values

    signals = []
    dir_found = 0
    warmup = RSI_PERIOD + RSI_LOOKBACK_CANDLES + SWING_WINDOW
    for i in range(warmup, len(df_exec)):
        ts_ns = df_exec["ts"].iloc[i].value
        rsi_idx = map_time_to_tf_index(ts_ns, rsi_tf_ts_ns)
        if rsi_idx < 0 or rsi_idx >= len(rsi_series):
            continue
        direction, rsi_note = rsi_reversal_direction(rsi_idx, rsi_series)
        if direction is None:
            continue
        dir_found += 1

        price = df_exec["close"].iloc[i]
        sr_matches = sum(1 for tf in TFS if near_sr_level(price, sr_levels_by_tf[tf]))

        pa_matches = 0
        for tf in TFS:
            tf_idx = map_time_to_tf_index(ts_ns, tf_ts_ns[tf])
            if tf_idx >= 1:
                pa = detect_pa_signal(tf_dfs[tf], tf_idx)
                if pa == direction:
                    pa_matches += 1

        if sr_matches >= MIN_SR_TF_MATCH and pa_matches >= MIN_PA_TF_MATCH:
            signals.append((i, direction, rsi_note, sr_matches, pa_matches))

    print(f"   Nến {EXEC_TF} quét: {len(df_exec)} | có hướng từ RSI H4: {dir_found} | "
          f"đủ điều kiện (S&R>={MIN_SR_TF_MATCH}, PA>={MIN_PA_TF_MATCH}): {len(signals)}")
    return signals


# ============================================================
# 8. CHẠY BACKTEST CHO 1 MỨC ĐÒN BẨY
# ============================================================
def run_backtest_for_leverage(df_exec, signals, leverage):
    trades = []
    next_available_idx = 0
    for i, direction, rsi_note, sr_m, pa_m in signals:
        if i < next_available_idx:
            continue
        result, resolve_idx = simulate_trade_dca(df_exec, i, direction, leverage)
        if result:
            trades.append(result)
            next_available_idx = resolve_idx + 1
        else:
            next_available_idx = i + 1
    return trades


def summarize(trades, leverage, symbol):
    if not trades:
        return None
    df_t = pd.DataFrame(trades)
    total = len(df_t)
    n_win_no_dca = (df_t["outcome"] == "win_no_dca").sum()
    n_win_dca = (df_t["outcome"] == "win_after_dca").sum()
    n_loss_dca = (df_t["outcome"] == "loss_after_dca").sum()
    dca_rate = df_t["dca_used"].sum() / total * 100
    win_rate = (n_win_no_dca + n_win_dca) / total * 100
    expectancy = df_t["net_pct"].mean()
    return {
        "symbol": symbol, "leverage": leverage, "total": total,
        "win_rate": win_rate, "expectancy": expectancy, "dca_rate": dca_rate,
        "win_no_dca": n_win_no_dca, "win_dca": n_win_dca, "loss_dca": n_loss_dca,
    }


# ============================================================
# MAIN — CHẠY LẦN LƯỢT QUA 10 COIN
# ============================================================
if __name__ == "__main__":
    exchange = getattr(ccxt, EXCHANGE_ID)()
    since_str = (pd.Timestamp(BACKTEST_UNTIL, tz="UTC") - pd.Timedelta(days=BACKTEST_DAYS)).strftime("%Y-%m-%d")

    all_summary = []

    for symbol in SYMBOLS:
        print(f"\n{'#'*60}\nCOIN: {symbol}\n{'#'*60}")
        try:
            tf_dfs = {}
            for tf in TFS:
                tf_dfs[tf] = fetch_ohlcv_range(exchange, symbol, tf, since_str, BACKTEST_UNTIL)
            if any(len(tf_dfs[tf]) < 100 for tf in TFS):
                print(f"   ⚠️ Dữ liệu quá ít cho {symbol} (có thể chưa niêm yết dạng SPOT trên {EXCHANGE_ID}), bỏ qua.")
                continue
            print("   Đã tải: " + ", ".join(f"{tf}={len(tf_dfs[tf])} nến" for tf in TFS))

            sr_levels_by_tf = {}
            for tf in TFS:
                highs, lows = find_swing_points(tf_dfs[tf])
                sr_levels_by_tf[tf] = highs + lows

            rsi_series = compute_rsi(tf_dfs[RSI_TF]["close"])
            signals = find_entry_signals(tf_dfs, sr_levels_by_tf, rsi_series)

            df_exec = tf_dfs[EXEC_TF]
            for lev in LEVERAGES:
                trades = run_backtest_for_leverage(df_exec, signals, lev)
                res = summarize(trades, lev, symbol)
                if res:
                    all_summary.append(res)
                    tag = "CÓ LỜI" if res["expectancy"] > 0 else "LỖ"
                    print(f"   x{lev}: {res['total']} lệnh | win rate {res['win_rate']:.1f}% | "
                          f"DCA {res['dca_rate']:.1f}% | expectancy {res['expectancy']:+.1f}%/lệnh | {tag}")
                else:
                    print(f"   x{lev}: không có lệnh nào resolve.")

        except Exception as e:
            print(f"   ❌ Lỗi với {symbol}: {e}")
            print(f"   -> Bỏ qua {symbol}, chạy tiếp coin khác.")
            continue

    # ============================================================
    # BẢNG TỔNG HỢP CUỐI CÙNG — 10 COIN × 2 ĐÒN BẨY
    # ============================================================
    print(f"\n\n{'='*70}\nTỔNG HỢP TẤT CẢ 10 COIN\n{'='*70}")
    if not all_summary:
        print("Không có coin nào chạy ra kết quả. Kiểm tra lại tên symbol / kết nối mạng.")
    else:
        print(f"{'Coin':<12}{'Đòn bẩy':<9}{'Lệnh':<7}{'Win%':<8}{'DCA%':<8}{'Expectancy':<14}{'Kết quả'}")
        for r in sorted(all_summary, key=lambda x: (x["symbol"], x["leverage"])):
            tag = "CÓ LỜI" if r["expectancy"] > 0 else "LỖ"
            print(f"{r['symbol']:<12}x{r['leverage']:<8}{r['total']:<7}{r['win_rate']:<8.1f}"
                  f"{r['dca_rate']:<8.1f}{r['expectancy']:+<14.1f}{tag}")

        profitable = sum(1 for r in all_summary if r["expectancy"] > 0)
        print(f"\n{profitable}/{len(all_summary)} cấu hình (coin × đòn bẩy) CÓ LỜI (expectancy dương).")
        print("Coin nào có SỐ LỆNH quá ít (< ~15-20) thì đừng tin con số win rate của coin đó —")
        print("mẫu quá nhỏ để kết luận, dù nhìn có vẻ đẹp hay xấu.")

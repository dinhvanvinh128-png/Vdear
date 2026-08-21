"""
BACKTEST — PHƯƠNG PHÁP TRADE CỦA WEB VDEAR (khớp đúng logic trong js/indicators.js)

TÓM TẮT PHƯƠNG PHÁP (1 khung thời gian, mặc định 4H, hàng futures):
  Vào lệnh khi HỘI TỤ ĐỦ 3 điều kiện cùng chiều:
    (1) RSI(14) ĐẢO CHIỀU khỏi vùng cực trị trong 5 nến gần nhất:
        - LONG : trong 5 nến min(RSI) <= 30 và RSI hiện tại > 30  (thoát quá bán)
        - SHORT: trong 5 nến max(RSI) >= 70 và RSI hiện tại < 70  (thoát quá mua)
        (RSI<20 / >80 = cực trị "mạnh")
    (2) GIÁ GẦN VÙNG HỖ TRỢ/KHÁNG CỰ: |giá - mức swing| / mức <= 0.6%
        (mức swing = đỉnh/đáy pivot, cửa sổ 5 nến hai bên)
    (3) NẾN PRICE ACTION cùng chiều: nến nhấn chìm (engulfing) HOẶC pin bar
        (bóng nến > 2x thân và > 50% biên độ)

  QUẢN LÝ VỐN (DCA) — giống hệt web:
    - TP gốc: +100% margin  -> giá đi 1/L
    - Nếu lỗ -50% margin (giá đi 0.5/L NGƯỢC chiều) TRƯỚC khi chạm TP -> DCA 1 lần
      (thêm đúng 1 lần vốn ở giá đó), tính giá vào trung bình, tổng vốn = 2x.
    - Sau DCA: SL = -50% / TP = +100% trên TỔNG vốn mới.
    - TRƯỚC DCA không có SL (chỉ thắng +100% hoặc chạm ngưỡng DCA).

CÀI ĐẶT (Colab): !pip install ccxt pandas numpy
CHẠY:            python backtest_vdear.py

LƯU Ý TRUNG THỰC:
  - Mặc định SR_NO_LOOKAHEAD = True: chỉ dùng các pivot ĐÃ XÁC NHẬN trước thời
    điểm vào lệnh (không nhìn tương lai) -> backtest sạch, sát thực tế.
  - Web hiện tính S/R trên toàn chuỗi nến (có chút "nhìn trước" nhỏ). Đặt
    SR_NO_LOOKAHEAD = False nếu muốn khớp CHÍNH XÁC con số win-rate web hiển thị.
  - Chưa tính funding fee. Đã tính phí taker mỗi chiều.
"""

import ccxt
import pandas as pd
import numpy as np

# ============================== CONFIG ==============================
EXCHANGE_ID = "binance"       # đổi "bybit"/"okx" nếu bị chặn
MARKET_TYPE = "swap"          # futures perpetual (giống web)

SYMBOLS = [
    "BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "BNB/USDT:USDT",
    "XRP/USDT:USDT", "DOGE/USDT:USDT", "ADA/USDT:USDT", "AVAX/USDT:USDT",
    "LINK/USDT:USDT", "SUI/USDT:USDT", "TRX/USDT:USDT", "DOT/USDT:USDT",
]

TIMEFRAME = "4h"              # khung phân tích & thực thi (web dùng 4H cho tín hiệu)
BACKTEST_UNTIL = "2026-08-01"
BACKTEST_DAYS = 180

# --- tham số CHỈ BÁO (khớp js/config.js + indicators.js) ---
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERBOUGHT_STRONG = 80
RSI_OVERSOLD = 30
RSI_OVERSOLD_STRONG = 20
RSI_LOOKBACK = 5
SWING_WINDOW = 5
SR_TOLERANCE = 0.006          # 0.6%
SR_NO_LOOKAHEAD = True        # True = sạch; False = khớp đúng số web

# --- QUẢN LÝ VỐN (khớp CFG.money) ---
TP_MARGIN_PCT = 100
DCA_TRIGGER_PCT = 50
POST_DCA_SL_PCT = 50
POST_DCA_TP_PCT = 100
LEVERAGES = [50, 100]
TAKER_FEE_PCT_PER_SIDE = 0.05
FORWARD_SCAN = 1000


# ============================ LẤY DATA =============================
def fetch_ohlcv_range(ex, symbol, tf, since_str, until_str):
    since = int(pd.Timestamp(since_str, tz="UTC").timestamp() * 1000)
    until = int(pd.Timestamp(until_str, tz="UTC").timestamp() * 1000)
    rows, last = [], None
    while since < until:
        batch = ex.fetch_ohlcv(symbol, tf, since=since, limit=1000)
        if not batch:
            break
        rows += batch
        nxt = batch[-1][0] + 1
        if last is not None and nxt <= last:
            break
        last = nxt; since = nxt
    df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"])
    df["ts"] = pd.to_datetime(df["ts"], unit="ms", utc=True)
    df = df[df["ts"] <= pd.Timestamp(until_str, tz="UTC")].reset_index(drop=True)
    return df


# =========================== CHỈ BÁO ==============================
def compute_rsi(close, period=RSI_PERIOD):
    """Wilder RSI — seed = trung bình đơn giản `period` thay đổi đầu (khớp JS)."""
    c = close.values
    n = len(c)
    out = np.full(n, np.nan)
    if n <= period:
        return out
    gain = loss = 0.0
    for i in range(1, period + 1):
        d = c[i] - c[i - 1]
        if d >= 0: gain += d
        else: loss -= d
    avg_g, avg_l = gain / period, loss / period
    out[period] = 100 - 100 / (1 + (100 if avg_l == 0 else avg_g / avg_l))
    for i in range(period + 1, n):
        d = c[i] - c[i - 1]
        g = d if d > 0 else 0.0
        l = -d if d < 0 else 0.0
        avg_g = (avg_g * (period - 1) + g) / period
        avg_l = (avg_l * (period - 1) + l) / period
        out[i] = 100 - 100 / (1 + (100 if avg_l == 0 else avg_g / avg_l))
    return out


def rsi_reversal(rsi, idx, lookback=RSI_LOOKBACK):
    """Trả 'bullish'/'bearish'/None — khớp indicators.js:rsiReversal."""
    if idx < RSI_PERIOD + lookback:
        return None
    seg = rsi[idx - lookback: idx + 1]
    seg = seg[~np.isnan(seg)]
    if seg.size == 0 or np.isnan(rsi[idx]):
        return None
    mn, mx, now = seg.min(), seg.max(), rsi[idx]
    if mn <= RSI_OVERSOLD and now > RSI_OVERSOLD:
        return "bullish"
    if mx >= RSI_OVERBOUGHT and now < RSI_OVERBOUGHT:
        return "bearish"
    return None


def price_action(o, h, l, c, po, pc):
    """Engulfing / pin bar — khớp indicators.js:priceAction."""
    body = abs(c - o); rng = h - l
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


def build_pivots(df, window=SWING_WINDOW):
    """Trả list (confirm_idx, price). pivot tại p được xác nhận ở p+window."""
    hi = df["high"].values; lo = df["low"].values; n = len(df)
    piv = []
    for p in range(window, n - window):
        hp, lp = hi[p], lo[p]
        is_h = all(hi[j] < hp for j in range(p - window, p + window + 1) if j != p)
        is_l = all(lo[j] > lp for j in range(p - window, p + window + 1) if j != p)
        if is_h: piv.append((p + window, hp))
        if is_l: piv.append((p + window, lp))
    return piv


def near_level(price, levels, tol=SR_TOLERANCE):
    for lv in levels:
        if abs(price - lv) / lv <= tol:
            return True
    return False


# ==================== MÔ PHỎNG 1 LỆNH (DCA) =======================
def simulate_dca(df, entry_idx, direction, leverage):
    o = df["open"].values; h = df["high"].values; l = df["low"].values; c = df["close"].values
    L = leverage
    E1 = c[entry_idx]
    move_tp = (TP_MARGIN_PCT / 100) / L
    move_dca = (DCA_TRIGGER_PCT / 100) / L
    long = direction in ("bullish", "LONG")
    P_tp0 = E1 * (1 + move_tp) if long else E1 * (1 - move_tp)
    P_dca = E1 * (1 - move_dca) if long else E1 * (1 + move_dca)
    fee = TAKER_FEE_PCT_PER_SIDE / 100
    units1 = L / E1
    fee_entry1 = units1 * E1 * fee
    dca_done = False; P_sl = P_tp = None; fee_dca = 0.0
    units_total = units1
    end = min(entry_idx + FORWARD_SCAN, len(df))
    for j in range(entry_idx + 1, end):
        hi, loo = h[j], l[j]
        if not dca_done:
            hit_dca = (loo <= P_dca) if long else (hi >= P_dca)
            hit_tp0 = (hi >= P_tp0) if long else (loo <= P_tp0)
            if hit_dca:
                units2 = L / P_dca
                units_total = units1 + units2
                avg = (units1 * E1 + units2 * P_dca) / units_total
                mT = 2
                if long:
                    P_sl = avg - (POST_DCA_SL_PCT / 100) * mT / units_total
                    P_tp = avg + (POST_DCA_TP_PCT / 100) * mT / units_total
                else:
                    P_sl = avg + (POST_DCA_SL_PCT / 100) * mT / units_total
                    P_tp = avg - (POST_DCA_TP_PCT / 100) * mT / units_total
                fee_dca = units2 * P_dca * fee
                dca_done = True
                continue
            if hit_tp0:
                fee_exit = units_total * P_tp0 * fee
                net = TP_MARGIN_PCT - (fee_entry1 + fee_exit) * 100
                return {"win": True, "outcome": "win_no_dca", "net_pct": net, "dca": False}, j
        else:
            hit_sl = (loo <= P_sl) if long else (hi >= P_sl)
            hit_tp = (hi >= P_tp) if long else (loo <= P_tp)
            if hit_sl:
                fee_exit = units_total * P_sl * fee
                net = -POST_DCA_SL_PCT * 2 - (fee_entry1 + fee_dca + fee_exit) * 100
                return {"win": False, "outcome": "loss_after_dca", "net_pct": net, "dca": True}, j
            if hit_tp:
                fee_exit = units_total * P_tp * fee
                net = POST_DCA_TP_PCT * 2 - (fee_entry1 + fee_dca + fee_exit) * 100
                return {"win": True, "outcome": "win_after_dca", "net_pct": net, "dca": True}, j
    return None, None


# ======================= BACKTEST 1 COIN ==========================
def backtest_symbol(df, leverage):
    o = df["open"].values; h = df["high"].values; l = df["low"].values; c = df["close"].values
    rsi = compute_rsi(df["close"])
    pivots = build_pivots(df)
    all_levels = [p[1] for p in pivots]
    warmup = RSI_PERIOD + RSI_LOOKBACK + SWING_WINDOW
    trades = []
    next_idx = 0
    n = len(df)
    for i in range(warmup, n - 2):
        if i < next_idx:
            continue
        rev = rsi_reversal(rsi, i)
        if rev is None:
            continue
        if SR_NO_LOOKAHEAD:
            levels = [pr for (cidx, pr) in pivots if cidx < i]
        else:
            levels = all_levels
        if not near_level(c[i], levels):
            continue
        pa = price_action(o[i], h[i], l[i], c[i], o[i - 1], c[i - 1])
        if pa != rev:
            continue
        res, ridx = simulate_dca(df, i, rev, leverage)
        if res:
            res["dir"] = "LONG" if rev == "bullish" else "SHORT"
            trades.append(res)
            next_idx = ridx + 1
    return trades


def summarize(trades, symbol, leverage):
    if not trades:
        return None
    t = pd.DataFrame(trades)
    total = len(t)
    wins = int(t["win"].sum())
    win_rate = wins / total * 100
    dca_rate = t["dca"].sum() / total * 100
    expectancy = t["net_pct"].mean()
    return {
        "symbol": symbol, "leverage": leverage, "total": total,
        "win_rate": win_rate, "dca_rate": dca_rate, "expectancy": expectancy,
    }


# ============================== MAIN ==============================
if __name__ == "__main__":
    ex = getattr(ccxt, EXCHANGE_ID)({"enableRateLimit": True, "options": {"defaultType": MARKET_TYPE}})
    ex.load_markets()
    since_str = (pd.Timestamp(BACKTEST_UNTIL, tz="UTC") - pd.Timedelta(days=BACKTEST_DAYS)).strftime("%Y-%m-%d")

    print(f"Phương pháp: RSI đảo chiều + gần S/R + Price Action  ·  khung {TIMEFRAME}")
    print(f"No-lookahead S/R: {SR_NO_LOOKAHEAD}  ·  {BACKTEST_DAYS} ngày  ·  phí {TAKER_FEE_PCT_PER_SIDE}%/chiều\n")

    summary = []
    for sym in SYMBOLS:
        print(f"{'#'*54}\n{sym}\n{'#'*54}")
        try:
            df = fetch_ohlcv_range(ex, sym, TIMEFRAME, since_str, BACKTEST_UNTIL)
            if len(df) < 60:
                print("  ⚠️ dữ liệu quá ít, bỏ qua."); continue
            print(f"  Đã tải {len(df)} nến {TIMEFRAME}")
            for lev in LEVERAGES:
                trades = backtest_symbol(df, lev)
                res = summarize(trades, sym, lev)
                if res:
                    summary.append(res)
                    tag = "CÓ LỜI" if res["expectancy"] > 0 else "LỖ"
                    print(f"  x{lev}: {res['total']} lệnh | win {res['win_rate']:.1f}% | "
                          f"DCA {res['dca_rate']:.1f}% | kỳ vọng {res['expectancy']:+.1f}%/lệnh | {tag}")
                else:
                    print(f"  x{lev}: không có lệnh nào.")
        except Exception as e:
            print(f"  ❌ lỗi {sym}: {e}  -> bỏ qua")

    print(f"\n{'='*70}\nTỔNG HỢP\n{'='*70}")
    if not summary:
        print("Không có kết quả. Kiểm tra symbol / mạng.")
    else:
        print(f"{'Coin':<16}{'Lev':<6}{'Lệnh':<7}{'Win%':<8}{'DCA%':<8}{'Kỳ vọng/lệnh':<14}{'KQ'}")
        for r in sorted(summary, key=lambda x: (x["symbol"], x["leverage"])):
            tag = "CÓ LỜI" if r["expectancy"] > 0 else "LỖ"
            print(f"{r['symbol']:<16}x{r['leverage']:<5}{r['total']:<7}{r['win_rate']:<8.1f}"
                  f"{r['dca_rate']:<8.1f}{r['expectancy']:+<14.1f}{tag}")
        prof = sum(1 for r in summary if r["expectancy"] > 0)
        print(f"\n{prof}/{len(summary)} cấu hình CÓ LỜI (kỳ vọng dương).")
        print("Cảnh báo: win-rate cao + DCA che giấu rủi ro đuôi — 1 lệnh thua sau DCA")
        print("mất ~100% vốn gốc. Hãy xem KỲ VỌNG/lệnh, không chỉ win-rate.")
        print("Coin < ~15-20 lệnh: mẫu quá nhỏ, đừng tin con số.")

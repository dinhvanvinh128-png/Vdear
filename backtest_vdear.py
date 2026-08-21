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
    (4) XÁC NHẬN BREAKOUT: nến đóng cửa vượt hẳn cực trị 3 nến trước theo
        hướng lệnh (LONG: đóng > đỉnh 3 nến & nến xanh; SHORT: đóng < đáy & nến đỏ).
        -> tránh "bắt dao rơi", giảm tỉ lệ thua. Tắt bằng USE_BREAKOUT = False.
    (5) XÁC NHẬN VOLUME GIÁ (mới): nến vào lệnh phải có KLGD vượt trung bình
        `VOLUME_LOOKBACK` nến trước * `VOLUME_MULTIPLIER` -> chỉ vào khi có dòng
        tiền thật đẩy giá, lọc phá vỡ giả. Tắt bằng USE_VOLUME = False.

  QUẢN LÝ VỐN — ĐÃ BỎ DCA (theo yêu cầu mới):
    - TP chốt lời: +100% margin  -> giá đi 1/L thuận chiều.
    - SL cắt lỗ CỨNG: -50% margin -> giá đi 0.5/L ngược chiều (KHÔNG còn DCA).
    - Bên nào chạm trước thì xử theo bên đó; nếu 1 nến chạm cả hai, ưu tiên SL
      (giả định kịch bản xấu -> con số backtest khắt khe, không tô hồng).

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
# Tự thử lần lượt tới sàn nào Colab truy cập được (Binance hay bị chặn IP -> lỗi 451).
EXCHANGES = ["bybit", "okx", "gateio", "mexc", "binance"]
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

# --- XÁC NHẬN BREAKOUT (mới): chỉ vào lệnh khi nến đóng cửa vượt hẳn cực trị
#     `BREAKOUT_LOOKBACK` nến trước theo hướng lệnh -> lọc tín hiệu giả, giảm thua.
USE_BREAKOUT = True
BREAKOUT_LOOKBACK = 3

# --- XÁC NHẬN VOLUME GIÁ (mới): nến vào lệnh phải có KLGD vượt hẳn trung bình
#     `VOLUME_LOOKBACK` nến trước * `VOLUME_MULTIPLIER` -> có dòng tiền thật.
USE_VOLUME = True
VOLUME_LOOKBACK = 20
VOLUME_MULTIPLIER = 1.3

# --- QUẢN LÝ VỐN (khớp CFG.money) — ĐÃ BỎ DCA ---
TP_MARGIN_PCT = 100          # TP = +100% margin
SL_MARGIN_PCT = 50           # SL cứng = -50% margin (không DCA)
LEVERAGES = [20]             # đòn bẩy x20 cho mọi coin
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


def volume_confirm(vol, i, lookback=VOLUME_LOOKBACK, mult=VOLUME_MULTIPLIER):
    """Nến i có KLGD vượt trung bình `lookback` nến trước * `mult` -> dòng tiền thật."""
    if i < lookback:
        return False
    prev = vol[i - lookback:i]
    avg = prev.mean() if len(prev) else 0.0
    cur = vol[i]
    if avg <= 0 or not np.isfinite(cur) or cur <= 0:
        return False
    return cur >= avg * mult


# ============ MÔ PHỎNG 1 LỆNH (TP +100% / SL -50%, KHÔNG DCA) =========
def simulate_trade(df, entry_idx, direction, leverage):
    h = df["high"].values; l = df["low"].values; c = df["close"].values
    L = leverage
    E = c[entry_idx]
    move_tp = (TP_MARGIN_PCT / 100) / L
    move_sl = (SL_MARGIN_PCT / 100) / L
    long = direction in ("bullish", "LONG")
    P_tp = E * (1 + move_tp) if long else E * (1 - move_tp)
    P_sl = E * (1 - move_sl) if long else E * (1 + move_sl)
    fee = TAKER_FEE_PCT_PER_SIDE / 100
    units = L / E
    fee_entry = units * E * fee
    end = min(entry_idx + FORWARD_SCAN, len(df))
    for j in range(entry_idx + 1, end):
        hi, loo = h[j], l[j]
        hit_sl = (loo <= P_sl) if long else (hi >= P_sl)
        hit_tp = (hi >= P_tp) if long else (loo <= P_tp)
        # ưu tiên xét SL trước: kịch bản xấu khi 1 nến chạm cả hai mức
        if hit_sl:
            fee_exit = units * P_sl * fee
            net = -SL_MARGIN_PCT - (fee_entry + fee_exit) * 100
            return {"win": False, "outcome": "loss", "net_pct": net}, j
        if hit_tp:
            fee_exit = units * P_tp * fee
            net = TP_MARGIN_PCT - (fee_entry + fee_exit) * 100
            return {"win": True, "outcome": "win", "net_pct": net}, j
    return None, None


# ======================= BACKTEST 1 COIN ==========================
def backtest_symbol(df, leverage):
    o = df["open"].values; h = df["high"].values; l = df["low"].values; c = df["close"].values
    vol = df["volume"].values
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
        if USE_BREAKOUT:
            hh = h[i - BREAKOUT_LOOKBACK:i].max()
            ll = l[i - BREAKOUT_LOOKBACK:i].min()
            if rev == "bullish":
                if not (c[i] > hh and c[i] > o[i]):   # đóng cửa phá lên đỉnh gần + nến xanh
                    continue
            else:
                if not (c[i] < ll and c[i] < o[i]):   # đóng cửa phá xuống đáy gần + nến đỏ
                    continue
        if USE_VOLUME and not volume_confirm(vol, i):  # KLGD nến vào lệnh phải bùng nổ
            continue
        res, ridx = simulate_trade(df, i, rev, leverage)
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
    expectancy = t["net_pct"].mean()
    return {
        "symbol": symbol, "leverage": leverage, "total": total,
        "wins": wins, "losses": total - wins,
        "win_rate": win_rate, "expectancy": expectancy,
    }


# ============================== MAIN ==============================
def make_exchange():
    """Thử lần lượt các sàn, trả về sàn ĐẦU TIÊN truy cập được từ máy đang chạy."""
    last = ""
    for exid in EXCHANGES:
        try:
            ex = getattr(ccxt, exid)({"enableRateLimit": True, "options": {"defaultType": MARKET_TYPE}})
            ex.load_markets()
            ex.fetch_ohlcv("BTC/USDT:USDT", TIMEFRAME, limit=5)  # test thật
            print(f"✓ Dùng sàn: {exid}\n")
            return ex
        except Exception as e:
            last = str(e)[:120]
            print(f"  (bỏ {exid}: {last})")
    raise SystemExit(
        "\n❌ Không sàn nào truy cập được từ đây (thường do Colab bị chặn IP).\n"
        "   Cách xử lý: đổi thứ tự EXCHANGES, hoặc chạy trên máy cá nhân/VPS,\n"
        "   hoặc Colab → Runtime → Disconnect and delete runtime rồi thử lại.\n"
        f"   Lỗi cuối: {last}")


if __name__ == "__main__":
    ex = make_exchange()
    since_str = (pd.Timestamp(BACKTEST_UNTIL, tz="UTC") - pd.Timedelta(days=BACKTEST_DAYS)).strftime("%Y-%m-%d")

    print(f"Phương pháp: RSI đảo chiều + gần S/R + Price Action + Breakout + Volume giá  ·  khung {TIMEFRAME}")
    print(f"Vốn: TP +{TP_MARGIN_PCT}% / SL -{SL_MARGIN_PCT}% margin (KHÔNG DCA)  ·  "
          f"Volume x{VOLUME_MULTIPLIER} ({'bật' if USE_VOLUME else 'tắt'})")
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
                    print(f"  x{lev}: {res['total']} lệnh | win {res['win_rate']:.1f}% "
                          f"({res['wins']}T/{res['losses']}B) | kỳ vọng {res['expectancy']:+.1f}%/lệnh | {tag}")
                else:
                    print(f"  x{lev}: không có lệnh nào.")
        except Exception as e:
            print(f"  ❌ lỗi {sym}: {e}  -> bỏ qua")

    print(f"\n{'='*70}\nTỔNG HỢP\n{'='*70}")
    if not summary:
        print("Không có kết quả. Kiểm tra symbol / mạng.")
    else:
        print(f"{'Coin':<16}{'Lev':<6}{'Lệnh':<7}{'Win%':<8}{'T/B':<9}{'Kỳ vọng/lệnh':<14}{'KQ'}")
        for r in sorted(summary, key=lambda x: (x["symbol"], x["leverage"])):
            tag = "CÓ LỜI" if r["expectancy"] > 0 else "LỖ"
            print(f"{r['symbol']:<16}x{r['leverage']:<5}{r['total']:<7}{r['win_rate']:<8.1f}"
                  f"{str(r['wins'])+'/'+str(r['losses']):<9}{r['expectancy']:+<14.1f}{tag}")
        prof = sum(1 for r in summary if r["expectancy"] > 0)
        print(f"\n{prof}/{len(summary)} cấu hình CÓ LỜI (kỳ vọng dương).")
        print("Đã BỎ DCA: mỗi lệnh chỉ TP +100% margin hoặc SL -50% margin (rủi ro rõ ràng).")
        print("Hãy xem KỲ VỌNG/lệnh, không chỉ win-rate.")
        print("Coin < ~15-20 lệnh: mẫu quá nhỏ, đừng tin con số.")

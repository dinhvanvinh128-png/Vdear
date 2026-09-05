/**
 * HÀM QUÉT OI/LONG-SHORT CHO CẢ BẢNG — api/oi-scan.js
 *
 * Hàm này tồn tại vì HẠN MỨC: Binance chặn 1000 request/5 phút theo IP, mà cả
 * bảng có ~600 coin × 2 request. Nên thứ đáng kiểm nhất không phải "có trả về
 * số không", mà là: có giới hạn đúng số coin quét không, có tính 24 giờ TRƯỢT
 * không, và một lượt quét hỏng có xoá mất dữ liệu cũ không.
 *
 * Không có bài nào gọi ra mạng thật: fetch bị thay bằng bản giả.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

// api/oi-scan.js là CommonJS (module.exports) như api/etf-flow.js sẵn có, còn
// bài kiểm chạy ở chế độ ESM — nên nạp qua createRequire.
const require = createRequire(import.meta.url);
const MOD = path.join(process.cwd(), 'api/oi-scan.js');

type Handler = (url: string) => unknown;

async function withFetch<T>(handler: Handler, run: (mod: {
  _scanOnce: () => Promise<Record<string, unknown>>;
  _reset: () => void;
}, calls: string[]) => Promise<T>): Promise<T> {
  const calls: string[] = [];
  const real = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = async (url: string) => {
    calls.push(String(url));
    const r = handler(String(url));
    if (r instanceof Error) throw r;
    return { ok: true, status: 200, json: async () => r };
  };
  try {
    const mod = require(MOD);
    mod._reset();
    return await run(mod, calls);
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = real;
  }
}

const ticker = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    symbol: 'C' + i + 'USDT',
    // khối lượng giảm dần: C0 lớn nhất
    quoteVolume: String(1e9 - i * 1000),
  }));

const oiHist = (first: number, last: number) => [
  { symbol: 'X', sumOpenInterest: String(first), sumOpenInterestValue: '1', timestamp: 1000 },
  { symbol: 'X', sumOpenInterest: String((first + last) / 2), sumOpenInterestValue: '1', timestamp: 2000 },
  { symbol: 'X', sumOpenInterest: String(last), sumOpenInterestValue: '1', timestamp: 3000 },
];

const lsHist = (long: number) => [
  { symbol: 'X', longAccount: String(long), shortAccount: String(1 - long), longShortRatio: '1', timestamp: 1 },
];

function route(handler: Partial<{ oi: unknown; ls: unknown; tick: unknown }>): Handler {
  return (url) => {
    if (url.includes('/fapi/v1/ticker/24hr')) return handler.tick ?? ticker(5);
    if (url.includes('openInterestHist')) return handler.oi ?? oiHist(100, 110);
    if (url.includes('globalLongShortAccountRatio')) return handler.ls ?? lsHist(0.6);
    return [];
  };
}

test('chỉ quét TOP coin theo khối lượng, không quét cả sàn', async () => {
  // 25 chứ không phải 3: clampInt() có sàn 20 để không ai vô tình đặt top = 1
  // rồi tưởng hàm hỏng.
  process.env.OI_SCAN_TOP = '25';
  delete require.cache[require.resolve(MOD)];
  await withFetch(route({ tick: ticker(200) }), async (mod, calls) => {
    const r = await mod._scanOnce();
    assert.equal(r.scanned, 25);
    // 1 ticker + 25 coin × 2 endpoint = 51 request, KHÔNG phải 401
    assert.equal(calls.length, 51);
    // và đúng những coin khối lượng lớn nhất (C0 lớn nhất, C199 nhỏ nhất)
    const keys = Object.keys(r.coins as object);
    assert.equal(keys.length, 25);
    assert.ok(keys.includes('C0') && keys.includes('C24'));
    assert.ok(!keys.includes('C25'), 'coin ngoài top không được quét');
  });
  delete process.env.OI_SCAN_TOP;
  delete require.cache[require.resolve(MOD)];
});

test('OI 24h dùng period=1h limit=25, tức 24 giờ TRƯỢT', async () => {
  await withFetch(route({}), async (mod, calls) => {
    await mod._scanOnce();
    const u = calls.find((c) => c.includes('openInterestHist'))!;
    assert.match(u, /period=1h/);
    assert.match(u, /limit=25/);
    // period=1d limit=2 sẽ ra "hôm qua so với hôm nay" theo mốc UTC — khác hẳn
    assert.ok(!u.includes('period=1d'));
  });
});

test('phần trăm tính từ điểm ĐẦU tới điểm CUỐI của chuỗi', async () => {
  await withFetch(route({ oi: oiHist(100, 130) }), async (mod) => {
    const r = await mod._scanOnce() as { coins: Record<string, { oiPct: number; oi: number }> };
    assert.equal(Math.round(r.coins.C0.oiPct), 30);
    assert.equal(r.coins.C0.oi, 130);
  });
});

test('mốc đầu bằng 0 thì để null chứ không ra Infinity', async () => {
  await withFetch(route({ oi: oiHist(0, 50) }), async (mod) => {
    const r = await mod._scanOnce() as { coins: Record<string, { oiPct: number | null }> };
    assert.equal(r.coins.C0.oiPct, null);
  });
});

test('long/short quy về phần trăm và cộng đủ 100', async () => {
  await withFetch(route({ ls: lsHist(0.62) }), async (mod) => {
    const r = await mod._scanOnce() as { coins: Record<string, { longPct: number; shortPct: number }> };
    assert.equal(Math.round(r.coins.C0.longPct * 10) / 10, 62);
    assert.equal(Math.round((r.coins.C0.longPct + r.coins.C0.shortPct) * 100) / 100, 100);
  });
});

test('một endpoint hỏng thì endpoint kia vẫn có số', async () => {
  const h: Handler = (url) => {
    if (url.includes('/fapi/v1/ticker/24hr')) return ticker(2);
    if (url.includes('openInterestHist')) return new Error('nguồn OI chết');
    if (url.includes('globalLongShortAccountRatio')) return lsHist(0.55);
    return [];
  };
  await withFetch(h, async (mod) => {
    const r = await mod._scanOnce() as {
      withOi: number; withLs: number;
      coins: Record<string, { oiPct: number | null; longPct: number | null }>;
    };
    assert.equal(r.withOi, 0);
    assert.equal(r.withLs, 2);
    assert.equal(r.coins.C0.oiPct, null);
    assert.ok(r.coins.C0.longPct != null);
  });
});

test('ticker hỏng thì trả ok:false chứ không ném lỗi ra ngoài', async () => {
  const h: Handler = () => new Error('sàn không phản hồi');
  await withFetch(h, async (mod) => {
    const r = await mod._scanOnce() as { ok: boolean; coins: object; errors: string[] };
    assert.equal(r.ok, false);
    assert.deepEqual(r.coins, {});
    assert.ok(r.errors.length > 0);
  });
});

test('phản hồi lạ (không phải mảng) không làm hỏng lượt quét', async () => {
  await withFetch(route({ oi: { error: 'nope' }, ls: 'rác' }), async (mod) => {
    const r = await mod._scanOnce() as { ok: boolean; withOi: number; withLs: number };
    assert.equal(r.ok, true);
    assert.equal(r.withOi, 0);
    assert.equal(r.withLs, 0);
  });
});

test('khoá theo BASE, không phải symbol của Binance', async () => {
  await withFetch(route({ tick: [{ symbol: 'BTCUSDT', quoteVolume: '1' }] }), async (mod) => {
    const r = await mod._scanOnce() as { coins: Record<string, unknown> };
    assert.ok('BTC' in r.coins);
    assert.ok(!('BTCUSDT' in r.coins));
  });
});

test('hợp đồng có kỳ hạn bị loại khỏi danh sách quét', async () => {
  const tick = [
    { symbol: 'BTCUSDT', quoteVolume: '9' },
    { symbol: 'BTCUSDT_250926', quoteVolume: '8' },   // delivery futures
    { symbol: 'BTCBUSD', quoteVolume: '7' },          // không phải cặp USDT
  ];
  await withFetch(route({ tick }), async (mod) => {
    const r = await mod._scanOnce() as { scanned: number; coins: Record<string, unknown> };
    assert.equal(r.scanned, 1);
    assert.deepEqual(Object.keys(r.coins), ['BTC']);
  });
});

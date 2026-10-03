/**
 * Proxy tới API công khai của mail.tm / mail.gw (cùng một kiểu API), chạy trên
 * Vercel Node.js runtime.
 *
 * Vì sao cần: gọi thẳng từ trình duyệt có thể hỏng vì CORS, trình chặn quảng
 * cáo hoặc nhà mạng. Trình duyệt gọi /api/mailtm?provider=tm&path=/messages
 * cùng tên miền với web, hàm này gọi tiếp nhà cung cấp.
 *
 * Không phải proxy mở: chỉ tới các máy chủ trong PROVIDERS, chỉ các đường dẫn
 * và method web dùng, chỉ chuyển Authorization/Accept/Content-Type. Không lưu gì.
 *
 * Chẩn đoán: mở /api/mailtm?diag=1 để xem máy chủ gọi từng nhà cung cấp ra sao.
 */

export function providers() {
  return {
    tm: process.env.MAILTM_UPSTREAM || 'https://api.mail.tm',
    gw: process.env.MAILGW_UPSTREAM || 'https://api.mail.gw',
  };
}

const ID = '[A-Za-z0-9_-]{1,64}';
const ROUTES = [
  { re: /^\/domains$/, methods: ['GET'] },
  { re: /^\/accounts$/, methods: ['POST'] },
  { re: new RegExp(`^/accounts/${ID}$`), methods: ['DELETE'] },
  { re: /^\/token$/, methods: ['POST'] },
  { re: /^\/me$/, methods: ['GET'] },
  { re: /^\/messages$/, methods: ['GET'] },
  { re: new RegExp(`^/messages/${ID}$`), methods: ['GET', 'PATCH', 'DELETE'] },
  { re: new RegExp(`^/messages/${ID}/attachment/${ID}$`), methods: ['GET'] },
];

const TIMEOUT_MS = 8000;
const UA = 'hop-thu-tam/1.0 (+https://hop-thu-tam.vercel.app)';

/** Kiểm tra provider + path + method theo danh sách cho phép, trả URL đích. */
export function resolveTarget(provider, rawPath, method) {
  const base = providers()[provider || 'tm'];
  if (!base) return { error: `provider không hợp lệ: ${provider}` };
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) return { error: 'thiếu tham số path (vd. ?path=/domains)' };
  const [pathname, query = ''] = rawPath.split('?', 2);
  const route = ROUTES.find((r) => r.re.test(pathname));
  if (!route) return { error: `đường dẫn không được phép: ${pathname}` };
  if (!route.methods.includes(method)) return { error: `${method} không được phép cho ${pathname}`, status: 405 };
  if (query && !/^page=\d{1,4}$/.test(query)) return { error: `query không được phép: ${query}` };
  return { url: `${base}${pathname}${query ? `?${query}` : ''}` };
}

/** Vài chữ đầu của một phản hồi lỗi (bỏ thẻ HTML), để thông báo lỗi nói được nhận gì. */
export function snippet(text, max = 160) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (body === null || body === undefined) return res.end();
  if (Buffer.isBuffer(body)) return res.end(body);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

/** Vercel có thể đã đọc sẵn req.body (object/chuỗi/Buffer); nếu chưa thì đọc stream. */
async function readBody(req) {
  let pre;
  try { pre = req.body; } catch { pre = undefined; } // getter của Vercel ném lỗi nếu JSON hỏng
  if (pre !== undefined && pre !== null) {
    if (typeof pre === 'string') return pre;
    if (Buffer.isBuffer(pre)) return pre.toString('utf8');
    return JSON.stringify(pre);
  }
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

async function upstreamFetch(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function diagnose() {
  const out = {};
  for (const [name, base] of Object.entries(providers())) {
    const url = `${base}/domains`;
    const started = Date.now();
    try {
      const r = await upstreamFetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      const text = await r.text();
      out[name] = { url, status: r.status, ms: Date.now() - started, contentType: r.headers.get('content-type'), body: snippet(text, 300) };
    } catch (err) {
      out[name] = { url, error: String(err?.cause?.code || err?.name || ''), message: String(err?.message || err), ms: Date.now() - started };
    }
  }
  return { node: process.version, region: process.env.VERCEL_REGION || null, providers: out };
}

export default async function handler(req, res) {
  try {
    const q = new URL(req.url || '/', 'http://localhost').searchParams;
    if (q.get('diag')) return send(res, 200, await diagnose());

    const method = (req.method || 'GET').toUpperCase();
    const provider = q.get('provider') || 'tm';
    const target = resolveTarget(provider, q.get('path'), method);
    if (target.error) return send(res, target.status || 400, { detail: target.error });

    const headers = { Accept: req.headers.accept || 'application/json', 'User-Agent': UA };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;

    let body;
    if (method === 'POST' || method === 'PATCH') {
      body = await readBody(req);
      if (body.length > 10_000) return send(res, 413, { detail: 'thân yêu cầu quá lớn' });
      // mail.tm yêu cầu merge-patch cho PATCH; trình duyệt luôn gửi JSON tới proxy.
      headers['Content-Type'] = method === 'PATCH' ? 'application/merge-patch+json' : 'application/json';
    }

    let upstream;
    try {
      upstream = await upstreamFetch(target.url, { method, headers, body });
    } catch (err) {
      const why = err?.name === 'AbortError' ? `quá ${TIMEOUT_MS / 1000}s không phản hồi` : `${err?.cause?.code || ''} ${err?.message || err}`.trim();
      return send(res, 502, { detail: `máy chủ không gọi được ${target.url}: ${why}`, upstream: target.url });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get('content-type') || '';

    // Lỗi từ nhà cung cấp mà không phải JSON (trang lỗi HTML, chặn bot…) → bọc lại
    // thành JSON có ghi URL + mã + vài chữ đầu, để trình duyệt hiện được lý do thật.
    if (!upstream.ok && !type.includes('json')) {
      return send(res, upstream.status, {
        detail: `${target.url} trả HTTP ${upstream.status}: ${snippet(buf.toString('utf8')) || '(thân rỗng)'}`,
        upstream: target.url,
      });
    }

    const passHeaders = {};
    if (type) passHeaders['Content-Type'] = type;
    const disp = upstream.headers.get('content-disposition');
    if (disp) passHeaders['Content-Disposition'] = disp;
    return send(res, upstream.status, upstream.status === 204 ? null : buf, passHeaders);
  } catch (err) {
    // Không bao giờ để Vercel trả trang 500 trống: luôn nói lỗi gì.
    return send(res, 500, { detail: `proxy lỗi: ${err?.message || err}` });
  }
}

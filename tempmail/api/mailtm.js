/**
 * Proxy tới API công khai của mail.tm, chạy trên Vercel Edge.
 *
 * Vì sao cần: gọi thẳng api.mail.tm từ trình duyệt có thể hỏng vì CORS, trình
 * chặn quảng cáo (chặn tên miền mail tạm) hoặc nhà mạng. Trình duyệt gọi
 * /api/mailtm?path=/messages cùng tên miền với web, hàm này gọi tiếp mail.tm.
 *
 * Không phải proxy mở: chỉ chuyển tiếp tới UPSTREAM, chỉ các đường dẫn/method
 * của mail.tm mà web dùng, và chỉ các header cần thiết. Không lưu gì.
 */
export const config = { runtime: 'edge' };

export const UPSTREAM = process.env.MAILTM_UPSTREAM || 'https://api.mail.tm';

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

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Tách "/messages?page=1" thành đường dẫn + query, kiểm tra theo danh sách cho phép. */
export function resolveTarget(rawPath, method) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) return { error: 'thiếu tham số path (vd. ?path=/domains)' };
  const [pathname, query = ''] = rawPath.split('?', 2);
  const route = ROUTES.find((r) => r.re.test(pathname));
  if (!route) return { error: `đường dẫn không được phép: ${pathname}` };
  if (!route.methods.includes(method)) return { error: `${method} không được phép cho ${pathname}`, status: 405 };
  if (query && !/^page=\d{1,4}$/.test(query)) return { error: `query không được phép: ${query}` };
  return { url: `${UPSTREAM}${pathname}${query ? `?${query}` : ''}` };
}

export default async function handler(request) {
  const method = request.method;
  const path = new URL(request.url).searchParams.get('path');
  const target = resolveTarget(path, method);
  if (target.error) return json(target.status || 400, { detail: target.error });

  const headers = { Accept: request.headers.get('accept') || 'application/json' };
  const auth = request.headers.get('authorization');
  if (auth) headers.Authorization = auth;

  let body;
  if (method === 'POST' || method === 'PATCH') {
    body = await request.text();
    if (body.length > 10_000) return json(413, { detail: 'thân yêu cầu quá lớn' });
    // mail.tm yêu cầu merge-patch cho PATCH; trình duyệt luôn gửi application/json tới proxy.
    headers['Content-Type'] = method === 'PATCH' ? 'application/merge-patch+json' : 'application/json';
  }

  let upstream;
  try {
    upstream = await fetch(target.url, { method, headers, body });
  } catch (err) {
    return json(502, { detail: `máy chủ không gọi được ${target.url}: ${err?.message || err}` });
  }

  const out = new Headers({ 'Cache-Control': 'no-store' });
  for (const h of ['content-type', 'content-disposition', 'content-length']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

/** Máy chủ giả lập API mail.tm (đủ các đường dẫn web dùng) cho test tích hợp. */
import http from 'node:http';

export function startFakeMailTm({ domain = 'fake.test', fail = null } = {}) {
  const accounts = new Map(); // address -> { id, password }
  const tokens = new Map();   // token -> accountId
  const messages = new Map(); // accountId -> [msg]
  const log = [];
  let n = 0;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    const url = new URL(req.url, 'http://x');
    log.push({ method: req.method, path: url.pathname + url.search, headers: req.headers, body: raw });
    const send = (status, obj, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type });
      res.end(obj === null ? '' : typeof obj === 'string' ? obj : JSON.stringify(obj));
    };
    if (fail) return send(fail.status, fail.body, fail.type);
    const me = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
    const key = `${req.method} ${url.pathname}`;

    if (key === 'GET /domains') return send(200, { 'hydra:member': [{ domain, isActive: true, isPrivate: false }] }, 'application/ld+json');
    if (key === 'POST /accounts') {
      const b = JSON.parse(raw);
      if (accounts.has(b.address)) return send(422, { 'hydra:description': 'address: This value is already used.' });
      const id = `acc${++n}`;
      accounts.set(b.address, { id, password: b.password });
      messages.set(id, [{ id: `m${n}`, from: { name: 'Bot', address: 'bot@x.test' }, subject: 'Chào', intro: 'xin chào', seen: false, createdAt: new Date().toISOString(), html: ['<p>hi</p>'], attachments: [] }]);
      return send(201, { id, address: b.address });
    }
    if (key === 'POST /token') {
      const b = JSON.parse(raw);
      const a = accounts.get(b.address);
      if (!a || a.password !== b.password) return send(401, { code: 401, message: 'Invalid credentials.' });
      const token = `tok${++n}`;
      tokens.set(token, a.id);
      return send(200, { id: a.id, token });
    }
    if (!me) return send(401, { code: 401, message: 'JWT Token not found' });
    if (key === 'GET /messages') return send(200, messages.get(me).map(({ html, ...m }) => m));
    const mm = url.pathname.match(/^\/messages\/([^/]+)$/);
    if (mm) {
      const list = messages.get(me);
      const m = list.find((x) => x.id === mm[1]);
      if (!m) return send(404, { detail: 'Not Found' });
      if (req.method === 'GET') return send(200, m);
      if (req.method === 'PATCH') {
        if (req.headers['content-type'] !== 'application/merge-patch+json') return send(415, { detail: 'bad content-type' });
        Object.assign(m, JSON.parse(raw));
        return send(200, m);
      }
      if (req.method === 'DELETE') { list.splice(list.indexOf(m), 1); return send(204, null); }
    }
    const am = url.pathname.match(/^\/accounts\/([^/]+)$/);
    if (am && req.method === 'DELETE') return send(204, null);
    return send(404, { detail: 'Not Found' });
  });

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, log, close: () => new Promise((r) => server.close(r)) });
  }));
}

/** Chạy handler proxy như Vercel Node runtime (req/res thật của node:http). */
export function startProxy(handler) {
  const server = http.createServer((req, res) => handler(req, res));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
  }));
}

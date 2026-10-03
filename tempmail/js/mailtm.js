/**
 * Client cho API công khai của mail.tm (https://docs.mail.tm) và mail.gw
 * (cùng một kiểu API). Không cần API key: mỗi người tự tạo hộp thư và nhận JWT.
 *
 * Hai lớp dự phòng:
 *  - Đường gọi: thử proxy cùng tên miền (/api/mailtm) trước, hỏng (mạng, 5xx,
 *    hoặc host không có proxy) thì gọi thẳng nhà cung cấp. Đường nào chạy được
 *    thì nhớ để dùng tiếp.
 *  - Nhà cung cấp: khi TẠO hộp thư, mail.tm không với tới được thì dùng mail.gw.
 *    Hộp thư đã tạo ở đâu thì luôn gọi đúng nơi đó (lưu trong session.provider),
 *    vì token của mail.tm không dùng được ở mail.gw.
 *
 * Lỗi luôn ghi rõ đã gọi gì, qua đường nào, và nhận được gì.
 */

export const PROVIDERS = {
  tm: { name: 'mail.tm', base: 'https://api.mail.tm' },
  gw: { name: 'mail.gw', base: 'https://api.mail.gw' },
};

export class MailTmError extends Error {
  constructor(message, { method, url, status = null, body = null, unreachable = false } = {}) {
    super(message);
    this.name = 'MailTmError';
    this.method = method;
    this.url = url;
    this.status = status;
    this.body = body;
    /** true = không tới được nhà cung cấp (mạng/5xx ở mọi đường) — đáng thử nhà cung cấp khác. */
    this.unreachable = unreachable;
  }
}

/** Mô tả ngắn cấu trúc nhận được, dùng trong thông báo lỗi. */
export function describeShape(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `mảng ${value.length} phần tử`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? `object có khoá [${keys.slice(0, 8).join(', ')}]` : 'object rỗng';
  }
  return typeof value;
}

/**
 * API trả danh sách theo hai kiểu, tuỳ header Accept: mảng thuần
 * (application/json) hoặc Hydra (application/ld+json, nằm trong "hydra:member").
 */
export function listOf(json, ctx) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json['hydra:member'])) return json['hydra:member'];
  throw new MailTmError(`${ctx.method} ${ctx.url}: cần một danh sách, nhận được ${describeShape(json)}`, ctx);
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Chuỗi ngẫu nhiên an toàn (crypto), dùng cho tên hộp thư và mật khẩu. */
export function randomString(length, alphabet = ALNUM, cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(length);
  cryptoImpl.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Tên hộp thư hợp lệ: chữ thường, số, dấu chấm, gạch dưới, gạch ngang. */
export function isValidLocalPart(name) {
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(name);
}

function snippet(text, max = 140) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function detailOf(body, text) {
  // JSON hợp lệ → chỉ lấy trường mô tả lỗi; không phải JSON (trang lỗi HTML…) → vài chữ đầu.
  if (body && typeof body === 'object') {
    const d = body['hydra:description'] || body.detail || body.message;
    return d ? String(d) : '';
  }
  return snippet(text);
}

/**
 * proxyBase: đường proxy cùng tên miền ('/api/mailtm'), null = không dùng.
 * direct: có gọi thẳng nhà cung cấp không (dự phòng hoặc đường chính).
 * providers: thứ tự thử khi tạo hộp thư mới.
 * bases: ghi đè địa chỉ gọi thẳng của từng nhà cung cấp (dùng cho test).
 */
export function createClient({
  proxyBase = '/api/mailtm',
  direct = true,
  providers = ['tm', 'gw'],
  bases = {},
  fetchImpl = globalThis.fetch.bind(globalThis),
  session = null,
  onSession,
} = {}) {
  const transports = [proxyBase && 'proxy', direct && 'direct'].filter(Boolean);
  if (!transports.length) throw new Error('createClient: cần proxyBase hoặc direct');
  let preferred = 0;
  let current = session ? { provider: 'tm', ...session } : null;

  function urlFor(transport, provider, path) {
    if (transport === 'proxy') {
      return `${proxyBase}?provider=${provider}&path=${encodeURIComponent(path)}`;
    }
    return (bases[provider] || PROVIDERS[provider].base) + path;
  }
  const where = (provider, path) => `${PROVIDERS[provider].name}${path}`;
  const transportLabel = (t) => (t === 'proxy' ? `qua ${proxyBase}` : 'gọi thẳng');

  /**
   * Gửi một yêu cầu, thử lần lượt các đường gọi. Trả { res, text, json }.
   * Chuyển sang đường khác khi: lỗi mạng, hoặc proxy trả 5xx / 404 (host không có proxy).
   */
  async function send(provider, method, path, { body, auth, contentType, accept, parse }) {
    const attempts = [];
    const order = transports.map((_, i) => transports[(preferred + i) % transports.length]);
    for (const t of order) {
      const url = urlFor(t, provider, path);
      const headers = { Accept: accept };
      if (body !== undefined) headers['Content-Type'] = t === 'proxy' ? 'application/json' : contentType;
      if (auth && current?.token) headers.Authorization = `Bearer ${current.token}`;
      let res;
      try {
        res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (err) {
        attempts.push(`${transportLabel(t)}: không kết nối được (${err?.message || err})`);
        continue;
      }
      const isLast = t === order[order.length - 1];
      const proxyBroken = t === 'proxy' && (res.status >= 500 || res.status === 404);
      if (proxyBroken && !isLast) {
        let text = '';
        try { text = await res.text(); } catch { /* bỏ qua */ }
        let j = null;
        try { j = JSON.parse(text); } catch { /* không phải JSON */ }
        attempts.push(`${transportLabel(t)}: HTTP ${res.status}${detailOf(j, text) ? ` (${detailOf(j, text)})` : ''}`);
        continue;
      }
      preferred = transports.indexOf(t);
      return { res, transport: t, attempts };
    }
    throw new MailTmError(`${method} ${where(provider, path)} thất bại — ${attempts.join('; ')}`, {
      method, url: where(provider, path), unreachable: true,
    });
  }

  async function raw(provider, method, path, { body, auth = true, contentType = 'application/json', accept = 'application/json', parse = 'json' } = {}) {
    const { res, transport, attempts } = await send(provider, method, path, { body, auth, contentType, accept, parse });
    const label = `${method} ${where(provider, path)} (${transportLabel(transport)})`;
    const prior = attempts.length ? ` [trước đó: ${attempts.join('; ')}]` : '';

    if (res.status === 204) return null;

    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch { /* bỏ qua */ }
      let errBody = null;
      try { errBody = JSON.parse(text); } catch { /* không phải JSON */ }
      const detail = detailOf(errBody, text);
      let hint = '';
      if (res.status === 429) hint = ' — bị giới hạn tốc độ (8 yêu cầu/giây), thử lại sau giây lát';
      if (res.status === 401) hint = ' — phiên đăng nhập không hợp lệ';
      throw new MailTmError(`${label} → HTTP ${res.status}${detail ? `: ${detail}` : ''}${hint}${prior}`, {
        method, url: where(provider, path), status: res.status, body: errBody,
        unreachable: res.status >= 500 || res.status === 403,
      });
    }

    if (parse === 'blob') return res.blob();
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new MailTmError(`${label}: phản hồi không phải JSON (${snippet(text, 80)})`, {
        method, url: where(provider, path), status: res.status, unreachable: true,
      });
    }
  }

  async function loginAt(provider, address, password) {
    const json = await raw(provider, 'POST', '/token', { body: { address, password }, auth: false });
    if (!json || typeof json.token !== 'string' || typeof json.id !== 'string') {
      throw new MailTmError(`POST ${where(provider, '/token')}: cần {id, token}, nhận được ${describeShape(json)}`, { method: 'POST', url: where(provider, '/token') });
    }
    current = { provider, id: json.id, address, password, token: json.token };
    onSession?.(current);
    return current;
  }

  function login(address, password) {
    return loginAt(current?.provider || providers[0], address, password);
  }

  /** Gọi có xác thực; JWT hết hạn (401) thì đăng nhập lại bằng mật khẩu đã lưu, thử một lần. */
  async function authed(method, path, opts) {
    if (!current) throw new Error('Chưa có hộp thư');
    try {
      return await raw(current.provider, method, path, opts);
    } catch (err) {
      if (err instanceof MailTmError && err.status === 401 && current.password) {
        await loginAt(current.provider, current.address, current.password);
        return raw(current.provider, method, path, opts);
      }
      throw err;
    }
  }

  async function domainsAt(provider) {
    const json = await raw(provider, 'GET', '/domains', { auth: false });
    const domains = listOf(json, { method: 'GET', url: where(provider, '/domains') })
      .filter((d) => d && typeof d.domain === 'string' && d.isActive !== false && d.isPrivate !== true)
      .map((d) => d.domain);
    if (!domains.length) {
      throw new MailTmError(`GET ${where(provider, '/domains')}: không có tên miền nào đang hoạt động`, {
        method: 'GET', url: where(provider, '/domains'), unreachable: true,
      });
    }
    return domains;
  }

  /** Lần lượt thử từng nhà cung cấp; chỉ chuyển tiếp khi lỗi kiểu "không với tới được". */
  async function eachProvider(list, fn) {
    const errors = [];
    for (const p of list) {
      try {
        return await fn(p);
      } catch (err) {
        if (!(err instanceof MailTmError) || !err.unreachable) throw err;
        errors.push(err.message);
      }
    }
    throw new MailTmError(`Không nhà cung cấp nào phản hồi. ${errors.join(' | ')}`, { unreachable: true });
  }

  /** { provider, domains } của nhà cung cấp đầu tiên phản hồi được. */
  function getDomains() {
    return eachProvider(providers, async (provider) => ({ provider, domains: await domainsAt(provider) }));
  }

  /** Tạo hộp thư mới rồi đăng nhập. Có `provider` thì chỉ dùng nơi đó. */
  async function createAccount({ localPart, domain, provider } = {}) {
    const name = (localPart || '').toLowerCase();
    if (name && !isValidLocalPart(name)) {
      throw new Error('Tên hộp thư chỉ gồm chữ thường, số, dấu . _ - và dài 3–64 ký tự');
    }
    const list = provider ? [provider] : providers;
    return eachProvider(list, async (p) => {
      const domains = await domainsAt(p);
      const chosenDomain = domain && domains.includes(domain) ? domain : domains[0];
      const address = `${name || randomString(10)}@${chosenDomain}`;
      const password = randomString(20, ALNUM + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      try {
        await raw(p, 'POST', '/accounts', { body: { address, password }, auth: false });
      } catch (err) {
        if (err instanceof MailTmError && err.status === 422) {
          throw new MailTmError(`Địa chỉ ${address} đã có người dùng hoặc không hợp lệ. Thử tên khác.`, err);
        }
        throw err;
      }
      return loginAt(p, address, password);
    });
  }

  async function listMessages(page = 1) {
    const path = `/messages?page=${page}`;
    const json = await authed('GET', path);
    return listOf(json, { method: 'GET', url: where(current.provider, path) });
  }

  const getMessage = (id) => authed('GET', `/messages/${encodeURIComponent(id)}`);
  const markSeen = (id) => authed('PATCH', `/messages/${encodeURIComponent(id)}`, {
    body: { seen: true },
    contentType: 'application/merge-patch+json',
  });
  const deleteMessage = (id) => authed('DELETE', `/messages/${encodeURIComponent(id)}`);

  /** downloadUrl của tệp đính kèm là đường dẫn tương đối, cần JWT nên phải tải qua fetch. */
  function downloadAttachment(downloadUrl) {
    const path = downloadUrl.startsWith('http') ? new URL(downloadUrl).pathname : downloadUrl;
    return authed('GET', path, { parse: 'blob', accept: '*/*' });
  }

  async function deleteAccount() {
    if (!current) return;
    await authed('DELETE', `/accounts/${encodeURIComponent(current.id)}`);
    current = null;
    onSession?.(null);
  }

  /** Bỏ phiên hiện tại mà không gọi mạng (khi hộp thư đã mất ở phía nhà cung cấp). */
  function forget() {
    current = null;
    onSession?.(null);
  }

  return {
    get session() { return current; },
    get transport() { return transports[preferred]; },
    getDomains,
    createAccount,
    login,
    listMessages,
    getMessage,
    markSeen,
    deleteMessage,
    downloadAttachment,
    deleteAccount,
    forget,
  };
}

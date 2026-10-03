/**
 * Client cho API công khai của mail.tm (https://docs.mail.tm).
 *
 * Không cần API key: mỗi người tự tạo tài khoản mail.tm và nhận JWT riêng,
 * nên trình duyệt gọi thẳng api.mail.tm. Giới hạn của mail.tm là 8 yêu cầu/giây
 * mỗi IP.
 *
 * Lỗi luôn ghi rõ đã gọi gì (method + URL) và nhận được gì (mã HTTP, hoặc các
 * khoá JSON khi cấu trúc không như mong đợi), để sửa được khi API thay đổi.
 */

export class MailTmError extends Error {
  constructor(message, { method, url, status = null, body = null } = {}) {
    super(message);
    this.name = 'MailTmError';
    this.method = method;
    this.url = url;
    this.status = status;
    this.body = body;
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
 * mail.tm trả danh sách theo hai kiểu, tuỳ header Accept: mảng thuần
 * (application/json) hoặc Hydra (application/ld+json, nằm trong "hydra:member").
 * Nhận cả hai; kiểu khác thì báo lỗi kèm cấu trúc thật.
 */
export function listOf(json, ctx) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json['hydra:member'])) return json['hydra:member'];
  throw new MailTmError(
    `${ctx.method} ${ctx.url}: cần một danh sách, nhận được ${describeShape(json)}`,
    ctx,
  );
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

function detailOf(body) {
  if (!body || typeof body !== 'object') return '';
  return body['hydra:description'] || body.detail || body.message || '';
}

/**
 * proxy = false: gọi thẳng `${base}${path}` (vd. https://api.mail.tm/domains).
 * proxy = true : gọi `${base}?path=${path}` qua hàm api/mailtm.js cùng tên miền.
 */
export function createClient({ base, proxy = false, fetchImpl = globalThis.fetch.bind(globalThis), session = null, onSession } = {}) {
  if (!base) throw new Error('createClient: thiếu base URL');
  const root = base.replace(/\/+$/, '');
  const urlFor = (path) => (proxy ? `${root}?path=${encodeURIComponent(path)}` : root + path);
  // Dùng trong thông báo lỗi: luôn ghi đường dẫn mail.tm, kèm proxy nếu có.
  const label = (path) => (proxy ? `${path} (qua ${root})` : root + path);
  /** session = { id, address, password, token } */
  let current = session;

  async function raw(method, path, { body, auth = true, contentType = 'application/json', accept = 'application/json', parse = 'json' } = {}) {
    const url = urlFor(path);
    const where = label(path);
    const headers = { Accept: accept };
    // Qua proxy luôn gửi JSON; proxy tự đổi sang merge-patch cho PATCH.
    if (body !== undefined) headers['Content-Type'] = proxy ? 'application/json' : contentType;
    if (auth && current?.token) headers.Authorization = `Bearer ${current.token}`;

    let res;
    try {
      res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      throw new MailTmError(`${method} ${where}: không kết nối được (${err?.message || err})`, { method, url });
    }

    if (res.status === 204) return null;

    if (!res.ok) {
      let errBody = null;
      try { errBody = await res.json(); } catch { /* thân lỗi không phải JSON */ }
      const detail = detailOf(errBody);
      let hint = '';
      if (res.status === 429) hint = ' — bị giới hạn tốc độ (mail.tm cho 8 yêu cầu/giây), thử lại sau giây lát';
      if (res.status === 401) hint = ' — phiên đăng nhập không hợp lệ';
      throw new MailTmError(
        `${method} ${where} → HTTP ${res.status}${detail ? `: ${detail}` : ''}${hint}`,
        { method, url, status: res.status, body: errBody },
      );
    }

    if (parse === 'blob') return res.blob();
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new MailTmError(`${method} ${where}: phản hồi không phải JSON (${text.slice(0, 80)}…)`, { method, url, status: res.status });
    }
  }

  async function login(address, password) {
    const ctx = { method: 'POST', url: label('/token') };
    const json = await raw('POST', '/token', { body: { address, password }, auth: false });
    if (!json || typeof json.token !== 'string' || typeof json.id !== 'string') {
      throw new MailTmError(`POST ${ctx.url}: cần {id, token}, nhận được ${describeShape(json)}`, ctx);
    }
    current = { id: json.id, address, password, token: json.token };
    onSession?.(current);
    return current;
  }

  /** Gọi có xác thực; nếu JWT hết hạn (401) thì đăng nhập lại bằng mật khẩu đã lưu, thử một lần. */
  async function authed(method, path, opts) {
    if (!current) throw new Error('Chưa có hộp thư');
    try {
      return await raw(method, path, opts);
    } catch (err) {
      if (err instanceof MailTmError && err.status === 401 && current.password) {
        await login(current.address, current.password);
        return raw(method, path, opts);
      }
      throw err;
    }
  }

  async function getDomains() {
    const ctx = { method: 'GET', url: label('/domains') };
    const json = await raw('GET', '/domains', { auth: false });
    const domains = listOf(json, ctx)
      .filter((d) => d && typeof d.domain === 'string' && d.isActive !== false && d.isPrivate !== true)
      .map((d) => d.domain);
    if (!domains.length) throw new MailTmError(`GET ${ctx.url}: mail.tm không trả tên miền nào đang hoạt động`, ctx);
    return domains;
  }

  /** Tạo hộp thư mới rồi đăng nhập. `localPart` để trống thì tạo ngẫu nhiên. */
  async function createAccount({ localPart, domain } = {}) {
    const domains = await getDomains();
    const chosenDomain = domain && domains.includes(domain) ? domain : domains[0];
    const name = (localPart || randomString(10)).toLowerCase();
    if (!isValidLocalPart(name)) {
      throw new Error('Tên hộp thư chỉ gồm chữ thường, số, dấu . _ - và dài 3–64 ký tự');
    }
    const address = `${name}@${chosenDomain}`;
    const password = randomString(20, ALNUM + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    try {
      await raw('POST', '/accounts', { body: { address, password }, auth: false });
    } catch (err) {
      if (err instanceof MailTmError && err.status === 422) {
        throw new MailTmError(`Địa chỉ ${address} đã có người dùng hoặc không hợp lệ. Thử tên khác.`, err);
      }
      throw err;
    }
    return login(address, password);
  }

  async function listMessages(page = 1) {
    const path = `/messages?page=${page}`;
    const json = await authed('GET', path);
    return listOf(json, { method: 'GET', url: label(path) });
  }

  function getMessage(id) {
    return authed('GET', `/messages/${encodeURIComponent(id)}`);
  }

  function markSeen(id) {
    return authed('PATCH', `/messages/${encodeURIComponent(id)}`, {
      body: { seen: true },
      contentType: 'application/merge-patch+json',
    });
  }

  function deleteMessage(id) {
    return authed('DELETE', `/messages/${encodeURIComponent(id)}`);
  }

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

  return {
    get session() { return current; },
    getDomains,
    createAccount,
    login,
    listMessages,
    getMessage,
    markSeen,
    deleteMessage,
    downloadAttachment,
    deleteAccount,
  };
}

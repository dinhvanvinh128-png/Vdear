import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, listOf, MailTmError, randomString, isValidLocalPart } from '../js/mailtm.js';
import { buildSrcdoc, escapeHtml, formatSize, formatWhen, hasRemoteImages, senderLabel } from '../js/render.js';

/** fetch giả: routes là map "METHOD url" → { status, json, text } hoặc mảng lần lượt, hoặc 'throw'. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const key = `${init.method} ${url}`;
    calls.push({ key, url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    let h = routes[key];
    if (Array.isArray(h)) h = h.shift();
    if (h === 'throw') throw new TypeError('Failed to fetch');
    if (!h) return new Response(JSON.stringify({ detail: `no route ${key}` }), { status: 404 });
    if (h.status === 204) return new Response(null, { status: 204 });
    return new Response(h.text ?? JSON.stringify(h.json ?? null), { status: h.status ?? 200 });
  };
  return { impl, calls };
}

const P = (provider, path) => `GET /api/mailtm?provider=${provider}&path=${encodeURIComponent(path)}`;
const PP = (method, provider, path) => `${method} /api/mailtm?provider=${provider}&path=${encodeURIComponent(path)}`;
const domains = (d) => ({ json: { 'hydra:member': [{ domain: 'off.test', isActive: false }, { domain: d, isActive: true, isPrivate: false }] } });
const sess = { provider: 'tm', id: 'acc1', address: 'a@ok.test', password: 'pw', token: 'old' };

test('listOf nhận cả mảng thuần lẫn Hydra, kiểu khác thì nêu cấu trúc nhận được', () => {
  const ctx = { method: 'GET', url: 'u' };
  assert.deepEqual(listOf([1], ctx), [1]);
  assert.deepEqual(listOf({ 'hydra:member': [2] }, ctx), [2]);
  assert.throws(() => listOf({ items: [], total: 0 }, ctx), /GET u: cần một danh sách, nhận được object có khoá \[items, total\]/);
});

test('tạo hộp thư qua proxy: đúng URL, lưu provider, Bearer khi đọc thư', async () => {
  let saved;
  const { impl, calls } = fakeFetch({
    [P('tm', '/domains')]: domains('ok.test'),
    [PP('POST', 'tm', '/accounts')]: { status: 201, json: { id: 'acc1' } },
    [PP('POST', 'tm', '/token')]: { json: { id: 'acc1', token: 'jwt1' } },
    [P('tm', '/messages?page=1')]: { json: [{ id: 'm1' }] },
  });
  const c = createClient({ fetchImpl: impl, onSession: (s) => { saved = s; } });
  const s = await c.createAccount({ localPart: 'hello' });
  assert.equal(s.address, 'hello@ok.test');
  assert.equal(saved.provider, 'tm');
  assert.equal(calls[1].headers.Authorization, undefined);
  assert.ok(calls[1].body.password.length >= 16);
  assert.equal((await c.listMessages())[0].id, 'm1');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer jwt1');
  assert.equal(c.transport, 'proxy');
});

test('proxy 500 → tự gọi thẳng, và nhớ đường đó cho lần sau', async () => {
  const { impl, calls } = fakeFetch({
    [P('tm', '/domains')]: { status: 500, text: 'A server error has occurred' },
    'GET https://api.mail.tm/domains': domains('ok.test'),
    'POST https://api.mail.tm/accounts': { status: 201, json: {} },
    'POST https://api.mail.tm/token': { json: { id: 'a', token: 't' } },
  });
  const c = createClient({ fetchImpl: impl });
  const s = await c.createAccount();
  assert.match(s.address, /^[a-z0-9]{10}@ok\.test$/);
  assert.equal(c.transport, 'direct');
  assert.deepEqual(calls.map((x) => x.key.split(' ')[1].slice(0, 22)), ['/api/mailtm?provider=t', 'https://api.mail.tm/do', 'https://api.mail.tm/ac', 'https://api.mail.tm/to']);
});

test('host không có proxy (404) cũng chuyển sang gọi thẳng', async () => {
  const { impl } = fakeFetch({ 'GET https://api.mail.tm/domains': domains('ok.test') });
  const c = createClient({ fetchImpl: impl });
  assert.deepEqual(await c.getDomains(), { provider: 'tm', domains: ['ok.test'] });
});

test('mail.tm không với tới được ở mọi đường → tạo hộp thư ở mail.gw', async () => {
  const { impl } = fakeFetch({
    [P('tm', '/domains')]: { status: 502, json: { detail: 'máy chủ không gọi được https://api.mail.tm/domains: ETIMEDOUT' } },
    'GET https://api.mail.tm/domains': 'throw',
    [P('gw', '/domains')]: domains('gw.test'),
    [PP('POST', 'gw', '/accounts')]: { status: 201, json: {} },
    [PP('POST', 'gw', '/token')]: { json: { id: 'g1', token: 'tg' } },
    [P('gw', '/messages?page=1')]: { json: [] },
  });
  const c = createClient({ fetchImpl: impl });
  const s = await c.createAccount();
  assert.equal(s.provider, 'gw');
  assert.match(s.address, /@gw\.test$/);
  assert.deepEqual(await c.listMessages(), []);
});

test('mọi nơi đều hỏng → lỗi liệt kê từng nhà cung cấp, từng đường và lý do', async () => {
  const { impl } = fakeFetch({
    [P('tm', '/domains')]: { status: 500, text: '<h1>FUNCTION_INVOCATION_FAILED</h1>' },
    'GET https://api.mail.tm/domains': 'throw',
    [P('gw', '/domains')]: { status: 403, text: '<title>Just a moment...</title>' },
  });
  const c = createClient({ fetchImpl: impl });
  await assert.rejects(c.createAccount(), (err) => {
    assert.ok(err.unreachable);
    assert.match(err.message, /Không nhà cung cấp nào phản hồi/);
    assert.match(err.message, /mail\.tm\/domains thất bại — qua \/api\/mailtm: HTTP 500 \(FUNCTION_INVOCATION_FAILED\); gọi thẳng: không kết nối được \(Failed to fetch\)/);
    assert.match(err.message, /mail\.gw\/domains \(qua \/api\/mailtm\) → HTTP 403: Just a moment/);
    return true;
  });
});

test('hộp thư cũ ở mail.gw luôn gọi mail.gw; session cũ không có provider = mail.tm', async () => {
  const { impl, calls } = fakeFetch({ [P('gw', '/messages?page=1')]: { json: [] }, [P('tm', '/messages?page=1')]: { json: [] } });
  await createClient({ fetchImpl: impl, session: { ...sess, provider: 'gw' } }).listMessages();
  const { provider, ...legacy } = sess;
  await createClient({ fetchImpl: impl, session: legacy }).listMessages();
  assert.deepEqual(calls.map((x) => x.key), [P('gw', '/messages?page=1'), P('tm', '/messages?page=1')]);
});

test('422 → thông báo địa chỉ đã có người dùng, KHÔNG chuyển sang mail.gw', async () => {
  const { impl, calls } = fakeFetch({
    [P('tm', '/domains')]: domains('ok.test'),
    [PP('POST', 'tm', '/accounts')]: { status: 422, json: { 'hydra:description': 'address: This value is already used.' } },
  });
  const c = createClient({ fetchImpl: impl });
  await assert.rejects(c.createAccount({ localPart: 'taken' }), /taken@ok\.test đã có người dùng/);
  assert.ok(!calls.some((x) => x.key.includes('provider=gw')));
});

test('tên không hợp lệ bị từ chối trước khi gọi mạng', async () => {
  const { impl, calls } = fakeFetch({});
  await assert.rejects(createClient({ fetchImpl: impl }).createAccount({ localPart: 'a b' }), /Tên hộp thư/);
  assert.equal(calls.length, 0);
});

test('JWT hết hạn (401) → đăng nhập lại đúng nhà cung cấp, thử lại một lần', async () => {
  const { impl, calls } = fakeFetch({
    [P('gw', '/messages?page=1')]: [{ status: 401, json: { message: 'Expired JWT Token' } }, { json: [{ id: 'm2' }] }],
    [PP('POST', 'gw', '/token')]: { json: { id: 'acc1', token: 'jwt2' } },
  });
  const c = createClient({ fetchImpl: impl, session: { ...sess, provider: 'gw' } });
  assert.equal((await c.listMessages())[0].id, 'm2');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer jwt2');
});

test('401 không phải lỗi "không với tới" — giữ nguyên mã để app tạo hộp thư mới', async () => {
  const { impl } = fakeFetch({
    [P('tm', '/messages?page=1')]: { status: 401, json: { message: 'Expired' } },
    [PP('POST', 'tm', '/token')]: { status: 401, json: { message: 'Invalid credentials.' } },
  });
  const c = createClient({ fetchImpl: impl, session: sess });
  await assert.rejects(c.listMessages(), (err) => err.status === 401 && !err.unreachable);
});

test('429 có gợi ý giới hạn tốc độ', async () => {
  const { impl } = fakeFetch({ [P('tm', '/messages?page=1')]: { status: 429, json: {} } });
  await assert.rejects(createClient({ fetchImpl: impl, session: sess }).listMessages(), /HTTP 429 — bị giới hạn tốc độ/);
});

test('PATCH: qua proxy gửi JSON, gọi thẳng gửi merge-patch', async () => {
  const a = fakeFetch({ [PP('PATCH', 'tm', '/messages/m1')]: { json: {} } });
  await createClient({ fetchImpl: a.impl, session: sess }).markSeen('m1');
  assert.equal(a.calls[0].headers['Content-Type'], 'application/json');
  const b = fakeFetch({ 'PATCH https://api.mail.tm/messages/m1': { json: {} } });
  await createClient({ proxyBase: null, fetchImpl: b.impl, session: sess }).markSeen('m1');
  assert.equal(b.calls[0].headers['Content-Type'], 'application/merge-patch+json');
});

test('token sai cấu trúc → báo khoá nhận được', async () => {
  const { impl } = fakeFetch({ [PP('POST', 'tm', '/token')]: { json: { jwt: 'x' } } });
  await assert.rejects(createClient({ fetchImpl: impl }).login('a@b', 'p'), /cần \{id, token\}, nhận được object có khoá \[jwt\]/);
});

test('deleteAccount và forget xoá phiên', async () => {
  let saved = 'unset';
  const { impl } = fakeFetch({ [PP('DELETE', 'tm', '/accounts/acc1')]: { status: 204 } });
  const c = createClient({ fetchImpl: impl, session: sess, onSession: (s) => { saved = s; } });
  await c.deleteAccount();
  assert.equal(saved, null);
  assert.equal(c.session, null);
});

test('randomString và isValidLocalPart', () => {
  assert.match(randomString(12), /^[a-z0-9]{12}$/);
  assert.ok(isValidLocalPart('abc.d-e_f'));
  assert.ok(!isValidLocalPart('ab'));
  assert.ok(!isValidLocalPart('Abc'));
  assert.ok(!isValidLocalPart('-abc'));
});

test('buildSrcdoc: mặc định chặn ảnh từ xa, bật khi cho phép; thư text được escape', () => {
  const html = buildSrcdoc({ html: ['<p>Hi <img src="https://t.test/p.gif"></p>'] });
  assert.match(html, /img-src data: cid:;/);
  assert.match(buildSrcdoc({ html: ['x'] }, { allowRemote: true }), /img-src data: cid: https: http:/);
  const text = buildSrcdoc({ html: [], text: '<script>alert(1)</script> https://a.test/x' });
  assert.ok(!text.includes('<script>'));
  assert.match(text, /<a href="https:\/\/a\.test\/x">/);
});

test('hasRemoteImages', () => {
  assert.ok(hasRemoteImages({ html: ['<img src="https://x/y.png">'] }));
  assert.ok(hasRemoteImages({ html: ['<div style="background:url(http://x/y)">'] }));
  assert.ok(!hasRemoteImages({ html: ['<img src="data:image/png;base64,AA">'] }));
  assert.ok(!hasRemoteImages({ text: 'hi' }));
});

test('hàm định dạng: thiếu dữ liệu là "—", không phải 0', () => {
  assert.equal(formatSize(undefined), '—');
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(2048), '2.0 KB');
  assert.equal(formatWhen('rác'), '—');
  const now = new Date('2026-10-03T15:00:00');
  assert.equal(formatWhen('2026-10-03T09:05:00', now), '09:05');
  assert.equal(formatWhen('2026-09-28T09:05:00', now), '28/09');
  assert.equal(senderLabel({ name: ' ', address: 'a@b' }), 'a@b');
  assert.equal(senderLabel(null), '(không rõ người gửi)');
  assert.equal(escapeHtml(`<a href="x">'`), '&lt;a href=&quot;x&quot;&gt;&#39;');
});

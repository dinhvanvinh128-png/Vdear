import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, listOf, MailTmError, randomString, isValidLocalPart } from '../js/mailtm.js';
import { buildSrcdoc, escapeHtml, formatSize, formatWhen, hasRemoteImages, senderLabel } from '../js/render.js';

const BASE = 'https://api.example.test';

/** fetch giả: routes là map "METHOD /path" → (req) => { status, json } hoặc mảng lần lượt. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname}${u.search}`;
    calls.push({ key, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    let handler = routes[key];
    if (Array.isArray(handler)) handler = handler.shift();
    if (!handler) return new Response(JSON.stringify({ detail: 'no route' }), { status: 404 });
    const r = typeof handler === 'function' ? handler(init) : handler;
    if (r.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(r.json ?? null), { status: r.status ?? 200 });
  };
  return { impl, calls };
}

const domainsHydra = { json: { 'hydra:member': [
  { domain: 'off.test', isActive: false, isPrivate: false },
  { domain: 'priv.test', isActive: true, isPrivate: true },
  { domain: 'ok.test', isActive: true, isPrivate: false },
] } };

test('listOf nhận cả mảng thuần lẫn Hydra, kiểu khác thì nêu cấu trúc nhận được', () => {
  const ctx = { method: 'GET', url: 'u' };
  assert.deepEqual(listOf([1], ctx), [1]);
  assert.deepEqual(listOf({ 'hydra:member': [2] }, ctx), [2]);
  assert.throws(() => listOf({ items: [], total: 0 }, ctx), /GET u: cần một danh sách, nhận được object có khoá \[items, total\]/);
});

test('getDomains bỏ tên miền tắt và riêng tư', async () => {
  const { impl } = fakeFetch({ 'GET /domains': domainsHydra });
  const c = createClient({ base: BASE, fetchImpl: impl });
  assert.deepEqual(await c.getDomains(), ['ok.test']);
});

test('getDomains báo lỗi rõ khi không còn tên miền nào', async () => {
  const { impl } = fakeFetch({ 'GET /domains': { json: [] } });
  const c = createClient({ base: BASE, fetchImpl: impl });
  await assert.rejects(c.getDomains(), /GET https:\/\/api\.example\.test\/domains: mail\.tm không trả tên miền/);
});

test('createAccount tạo tài khoản, đăng nhập, lưu phiên và gửi Bearer', async () => {
  let saved;
  const { impl, calls } = fakeFetch({
    'GET /domains': domainsHydra,
    'POST /accounts': { status: 201, json: { id: 'acc1' } },
    'POST /token': { json: { id: 'acc1', token: 'jwt1' } },
    'GET /messages?page=1': { json: [{ id: 'm1', seen: false }] },
  });
  const c = createClient({ base: BASE, fetchImpl: impl, onSession: (s) => { saved = s; } });
  const s = await c.createAccount({ localPart: 'hello' });
  assert.equal(s.address, 'hello@ok.test');
  assert.equal(saved.token, 'jwt1');
  assert.equal(calls[1].body.address, 'hello@ok.test');
  assert.ok(calls[1].body.password.length >= 16);
  assert.equal(calls[1].headers.Authorization, undefined, 'tạo tài khoản không cần token');

  const msgs = await c.listMessages();
  assert.equal(msgs[0].id, 'm1');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer jwt1');
});

test('createAccount: 422 thành thông báo địa chỉ đã có người dùng', async () => {
  const { impl } = fakeFetch({
    'GET /domains': domainsHydra,
    'POST /accounts': { status: 422, json: { 'hydra:description': 'address: This value is already used.' } },
  });
  const c = createClient({ base: BASE, fetchImpl: impl });
  await assert.rejects(c.createAccount({ localPart: 'taken' }), (err) => {
    assert.ok(err instanceof MailTmError);
    assert.equal(err.status, 422);
    assert.match(err.message, /taken@ok\.test đã có người dùng/);
    return true;
  });
});

test('createAccount từ chối tên không hợp lệ trước khi gọi mạng', async () => {
  const { impl, calls } = fakeFetch({ 'GET /domains': domainsHydra });
  const c = createClient({ base: BASE, fetchImpl: impl });
  await assert.rejects(c.createAccount({ localPart: 'a b' }), /Tên hộp thư/);
  assert.equal(calls.filter((x) => x.key === 'POST /accounts').length, 0);
});

test('JWT hết hạn (401) → đăng nhập lại bằng mật khẩu đã lưu, thử lại đúng một lần', async () => {
  const { impl, calls } = fakeFetch({
    'GET /messages?page=1': [
      { status: 401, json: { message: 'Expired JWT Token' } },
      { json: { 'hydra:member': [{ id: 'm2' }] } },
    ],
    'POST /token': { json: { id: 'acc1', token: 'jwt2' } },
  });
  const c = createClient({ base: BASE, fetchImpl: impl, session: { id: 'acc1', address: 'a@ok.test', password: 'pw', token: 'old' } });
  const msgs = await c.listMessages();
  assert.equal(msgs[0].id, 'm2');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer jwt2');
  assert.deepEqual(calls.map((x) => x.key), ['GET /messages?page=1', 'POST /token', 'GET /messages?page=1']);
});

test('429 có gợi ý giới hạn tốc độ và ghi rõ đã gọi gì', async () => {
  const { impl } = fakeFetch({ 'GET /messages?page=1': { status: 429, json: {} } });
  const c = createClient({ base: BASE, fetchImpl: impl, session: { id: 'x', address: 'a@b', password: 'p', token: 't' } });
  await assert.rejects(c.listMessages(), /GET https:\/\/api\.example\.test\/messages\?page=1 → HTTP 429 — bị giới hạn tốc độ/);
});

test('lỗi mạng ghi rõ URL', async () => {
  const c = createClient({ base: BASE, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(c.getDomains(), /GET https:\/\/api\.example\.test\/domains: không kết nối được \(Failed to fetch\)/);
});

test('token trả về sai cấu trúc → báo khoá nhận được', async () => {
  const { impl } = fakeFetch({ 'POST /token': { json: { jwt: 'x' } } });
  const c = createClient({ base: BASE, fetchImpl: impl });
  await assert.rejects(c.login('a@b', 'p'), /cần \{id, token\}, nhận được object có khoá \[jwt\]/);
});

test('markSeen dùng merge-patch, deleteAccount xoá phiên', async () => {
  let saved = 'unset';
  const { impl, calls } = fakeFetch({
    'PATCH /messages/m1': { json: { seen: true } },
    'DELETE /accounts/acc1': { status: 204 },
  });
  const c = createClient({ base: BASE, fetchImpl: impl, session: { id: 'acc1', address: 'a@b', password: 'p', token: 't' }, onSession: (s) => { saved = s; } });
  await c.markSeen('m1');
  assert.equal(calls[0].headers['Content-Type'], 'application/merge-patch+json');
  assert.deepEqual(calls[0].body, { seen: true });
  await c.deleteAccount();
  assert.equal(saved, null);
  assert.equal(c.session, null);
});

test('randomString và isValidLocalPart', () => {
  const s = randomString(12);
  assert.equal(s.length, 12);
  assert.match(s, /^[a-z0-9]+$/);
  assert.ok(isValidLocalPart('abc.d-e_f'));
  assert.ok(!isValidLocalPart('ab'));
  assert.ok(!isValidLocalPart('Abc'));
  assert.ok(!isValidLocalPart('-abc'));
});

test('buildSrcdoc: mặc định chặn ảnh từ xa, bật khi cho phép; thư text được escape', () => {
  const html = buildSrcdoc({ html: ['<p>Hi <img src="https://t.test/p.gif"></p>'] });
  assert.match(html, /img-src data: cid:;/);
  assert.match(html, /<p>Hi/);
  assert.match(buildSrcdoc({ html: ['x'] }, { allowRemote: true }), /img-src data: cid: https: http:/);

  const text = buildSrcdoc({ html: [], text: '<script>alert(1)</script> https://a.test/x' });
  assert.ok(!text.includes('<script>'));
  assert.match(text, /&lt;script&gt;/);
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

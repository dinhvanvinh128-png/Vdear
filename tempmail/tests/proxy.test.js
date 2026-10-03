import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { resolveTarget, snippet } from '../api/mailtm.js';
import { createClient } from '../js/mailtm.js';
import { startFakeMailTm, startProxy } from './fake-upstream.js';

test('resolveTarget chỉ cho provider + đường dẫn + method mà web dùng', () => {
  assert.equal(resolveTarget('tm', '/domains', 'GET').url, 'https://api.mail.tm/domains');
  assert.equal(resolveTarget('gw', '/messages?page=2', 'GET').url, 'https://api.mail.gw/messages?page=2');
  assert.equal(resolveTarget(null, '/domains', 'GET').url, 'https://api.mail.tm/domains');
  assert.ok(resolveTarget('tm', '/messages/abc123/attachment/ATT0', 'GET').url);
  assert.match(resolveTarget('evil', '/domains', 'GET').error, /provider/);
  assert.match(resolveTarget('tm', '/admin', 'GET').error, /không được phép/);
  assert.match(resolveTarget('tm', '//evil.test/x', 'GET').error, /không được phép/);
  assert.match(resolveTarget('tm', '/messages/../accounts', 'GET').error, /không được phép/);
  assert.equal(resolveTarget('tm', '/domains', 'DELETE').status, 405);
  assert.match(resolveTarget('tm', '/messages?page=1&x=2', 'GET').error, /query/);
  assert.match(resolveTarget('tm', null, 'GET').error, /thiếu/);
});

test('snippet bỏ thẻ HTML', () => {
  assert.equal(snippet('<html><h1>Lỗi</h1>\n<p>abc</p></html>'), 'Lỗi abc');
});

/** Dựng: mail.tm giả + proxy (req/res node:http thật) + client gọi qua fetch thật. */
async function rig(opts = {}) {
  const tm = await startFakeMailTm({ domain: 'tm.test', ...opts.tm });
  const gw = await startFakeMailTm({ domain: 'gw.test', ...opts.gw });
  process.env.MAILTM_UPSTREAM = tm.url;
  process.env.MAILGW_UPSTREAM = gw.url;
  const proxy = await startProxy(handler);
  const close = async () => {
    await Promise.all([tm.close(), gw.close(), proxy.close()]);
    delete process.env.MAILTM_UPSTREAM;
    delete process.env.MAILGW_UPSTREAM;
  };
  const client = (extra) => createClient({ proxyBase: `${proxy.url}/api/mailtm`, direct: false, ...extra });
  return { tm, gw, proxy, client, close };
}

test('tích hợp: toàn bộ luồng qua proxy thật tới mail.tm giả', async () => {
  const r = await rig();
  try {
    const c = r.client();
    const s = await c.createAccount({ localPart: 'vinh' });
    assert.equal(s.address, 'vinh@tm.test');
    assert.equal(s.provider, 'tm');
    const list = await c.listMessages();
    assert.equal(list.length, 1);
    const m = await c.getMessage(list[0].id);
    assert.deepEqual(m.html, ['<p>hi</p>']);
    await c.markSeen(m.id); // mail.tm giả trả 415 nếu proxy không đổi sang merge-patch
    assert.equal((await c.listMessages())[0].seen, true);
    await c.deleteMessage(m.id);
    assert.deepEqual(await c.listMessages(), []);
    await c.deleteAccount();

    const patch = r.tm.log.find((x) => x.method === 'PATCH');
    assert.equal(patch.headers['content-type'], 'application/merge-patch+json');
    assert.match(patch.headers.authorization, /^Bearer tok/);
    assert.match(patch.headers['user-agent'], /hop-thu-tam/);
    assert.equal(r.gw.log.length, 0, 'mail.tm chạy thì không đụng mail.gw');
  } finally { await r.close(); }
});

test('tích hợp: mail.tm trả trang lỗi HTML 500 → proxy bọc thành JSON có lý do → client dùng mail.gw', async () => {
  const r = await rig({ tm: { fail: { status: 500, type: 'text/html', body: '<html><h1>Internal Server Error</h1></html>' } } });
  try {
    const raw = await fetch(`${r.proxy.url}/api/mailtm?path=%2Fdomains`);
    assert.equal(raw.status, 500);
    assert.match((await raw.json()).detail, /\/domains trả HTTP 500: Internal Server Error/);

    const s = await r.client().createAccount();
    assert.equal(s.provider, 'gw');
    assert.match(s.address, /@gw\.test$/);
  } finally { await r.close(); }
});

test('tích hợp: mail.tm sập hẳn (không kết nối) → 502 ghi rõ URL', async () => {
  const r = await rig();
  await r.tm.close();
  try {
    const res = await fetch(`${r.proxy.url}/api/mailtm?path=%2Fdomains`);
    assert.equal(res.status, 502);
    assert.match((await res.json()).detail, /máy chủ không gọi được http:\/\/127\.0\.0\.1:\d+\/domains/);
    assert.equal((await r.client().createAccount()).provider, 'gw');
  } finally { await r.close(); }
});

test('tích hợp: đường dẫn lạ bị chặn, không tới upstream; diag báo từng nhà cung cấp', async () => {
  const r = await rig();
  try {
    const bad = await fetch(`${r.proxy.url}/api/mailtm?path=%2Fadmin`);
    assert.equal(bad.status, 400);
    assert.equal(r.tm.log.length, 0);
    const diag = await (await fetch(`${r.proxy.url}/api/mailtm?diag=1`)).json();
    assert.equal(diag.providers.tm.status, 200);
    assert.equal(diag.providers.gw.status, 200);
    assert.match(diag.providers.tm.body, /tm\.test/);
  } finally { await r.close(); }
});

test('handler không bao giờ ném: req hỏng → 500 JSON có lý do', async () => {
  const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler({ url: '/api/mailtm?path=%2Fdomains', method: 'GET', get headers() { throw new Error('hỏng'); } }, res);
  assert.equal(res.statusCode, 500);
  assert.match(JSON.parse(res.body).detail, /proxy lỗi: hỏng/);
});

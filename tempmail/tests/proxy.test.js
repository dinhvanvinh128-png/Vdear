import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { resolveTarget } from '../api/mailtm.js';
import { createClient } from '../js/mailtm.js';

test('resolveTarget chỉ cho các đường dẫn/method mail.tm mà web dùng', () => {
  assert.equal(resolveTarget('/domains', 'GET').url, 'https://api.mail.tm/domains');
  assert.equal(resolveTarget('/messages?page=2', 'GET').url, 'https://api.mail.tm/messages?page=2');
  assert.equal(resolveTarget('/messages/abc123/attachment/ATT0', 'GET').url, 'https://api.mail.tm/messages/abc123/attachment/ATT0');
  assert.match(resolveTarget('/admin', 'GET').error, /không được phép/);
  assert.match(resolveTarget('//evil.test/x', 'GET').error, /không được phép/);
  assert.match(resolveTarget('/messages/../accounts', 'GET').error, /không được phép/);
  assert.equal(resolveTarget('/domains', 'DELETE').status, 405);
  assert.match(resolveTarget('/messages?page=1&x=2', 'GET').error, /query/);
  assert.match(resolveTarget(null, 'GET').error, /thiếu/);
});

function withFetch(fn, impl) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = orig; });
}

test('handler chuyển tiếp Authorization, đổi PATCH sang merge-patch, trả nguyên mã HTTP', async () => {
  const seen = [];
  await withFetch(async () => {
    const res = await handler(new Request('https://site.test/api/mailtm?path=%2Fmessages%2Fm1', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json', Cookie: 'secret=1' },
      body: JSON.stringify({ seen: true }),
    }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { seen: true });
  }, async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ seen: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(seen[0].url, 'https://api.mail.tm/messages/m1');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer t');
  assert.equal(seen[0].init.headers['Content-Type'], 'application/merge-patch+json');
  assert.equal(seen[0].init.headers.Cookie, undefined, 'không chuyển cookie');
});

test('handler: đường dẫn lạ → 400, không gọi upstream; upstream sập → 502 ghi rõ URL', async () => {
  let called = false;
  await withFetch(async () => {
    const res = await handler(new Request('https://site.test/api/mailtm?path=%2Fsecret'));
    assert.equal(res.status, 400);
  }, async () => { called = true; return new Response('{}'); });
  assert.equal(called, false);

  await withFetch(async () => {
    const res = await handler(new Request('https://site.test/api/mailtm?path=%2Fdomains'));
    assert.equal(res.status, 502);
    assert.match((await res.json()).detail, /api\.mail\.tm\/domains: boom/);
  }, async () => { throw new Error('boom'); });
});

test('client proxy: gọi /api/mailtm?path=…, lỗi ghi đường dẫn mail.tm kèm proxy', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('domains')) return new Response(JSON.stringify(['ok.test']), { status: 500 });
    return new Response(JSON.stringify({ seen: true }), { status: 200 });
  };
  const c = createClient({ base: '/api/mailtm', proxy: true, fetchImpl, session: { id: 'a', address: 'x@y', password: 'p', token: 't' } });
  await c.markSeen('m1');
  assert.equal(calls[0].url, '/api/mailtm?path=%2Fmessages%2Fm1');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  await c.listMessages().catch(() => {});
  assert.equal(calls[1].url, '/api/mailtm?path=%2Fmessages%3Fpage%3D1');
  await assert.rejects(c.getDomains(), /GET \/domains \(qua \/api\/mailtm\) → HTTP 500/);
});

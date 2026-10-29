import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyAPI} from '../functions/api/[[path]].js';

const env = {API_ORIGIN: 'https://viabileasy-backend.onrender.com'};
const frontend = 'https://viabileasy.pages.dev';

test('Pages forwards API JSON, origin, cookies and trusted client IP without accepting forged proxy chains', async () => {
  const body = JSON.stringify({email: 'user@example.test', password: 'synthetic-test-password'});
  const request = new Request(frontend + '/api/auth/login?next=studies', {
    method: 'POST', body,
    headers: {
      Origin: frontend, Cookie: 'viabileasy_session=synthetic-session',
      'Content-Type': 'application/json', 'X-Viabileasy-Request': '1',
      'CF-Connecting-IP': '192.0.2.10', 'X-Forwarded-For': 'forged',
      Forwarded: 'for=forged', 'X-Real-IP': 'forged', 'X-Forwarded-Host': 'attacker.test',
    },
  });
  const response = await proxyAPI(request, env, async (upstream, options) => {
    assert.equal(upstream.url, env.API_ORIGIN + '/api/auth/login?next=studies');
    assert.equal(upstream.method, 'POST');
    assert.equal(await upstream.text(), body);
    assert.equal(upstream.headers.get('origin'), frontend);
    assert.equal(upstream.headers.get('cookie'), 'viabileasy_session=synthetic-session');
    assert.equal(upstream.headers.get('x-viabileasy-request'), '1');
    assert.equal(upstream.headers.get('x-forwarded-for'), '192.0.2.10');
    assert.equal(upstream.headers.get('forwarded'), null);
    assert.equal(upstream.headers.get('x-real-ip'), null);
    assert.equal(upstream.headers.get('x-forwarded-host'), null);
    assert.equal(options.redirect, 'manual');
    const headers = new Headers({'Content-Type': 'application/json'});
    headers.append('Set-Cookie', 'viabileasy_session=new-session; Secure; HttpOnly; SameSite=Lax; Path=/');
    headers.append('Set-Cookie', 'viabileasy_oauth=; Max-Age=0; Path=/api/auth/google');
    return new Response('{"ok":true}', {headers});
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.getSetCookie().length, 2);
  assert.match(response.headers.getSetCookie()[0], /Secure; HttpOnly/);
  assert.deepEqual(await response.json(), {ok: true});
});

test('OAuth redirects return to the browser, with their cookies intact', async () => {
  const target = 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic';
  const response = await proxyAPI(new Request(frontend + '/api/auth/google'), env, async (_, options) => {
    assert.equal(options.redirect, 'manual');
    return new Response(null, {status: 303, headers: {
      Location: target, 'Set-Cookie': 'viabileasy_oauth=synthetic; Secure; HttpOnly; Path=/api/auth/google',
    }});
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), target);
  assert.match(response.headers.get('set-cookie'), /viabileasy_oauth=synthetic/);
});

test('PDF bytes and errors are preserved without caching', async () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 0, 255, 10]);
  const response = await proxyAPI(new Request(frontend + '/api/documents/test/file'), env,
    async () => new Response(pdf, {headers: {'Content-Type': 'application/pdf'}}));
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdf);
  const denied = await proxyAPI(new Request(frontend + '/api/admin/overview'), env,
    async () => new Response('{"error":"Acesso negado"}', {status: 403}));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
});

test('Missing or unsafe backend configuration fails closed with JSON, without fetching', async () => {
  for (const origin of [undefined, '', 'http://viabileasy.onrender.com', 'https://attacker.test',
    'https://viabileasy.onrender.com/path', 'https://user:secret@viabileasy.onrender.com',
    'https://viabileasy.onrender.com?target=other']) {
    const response = await proxyAPI(new Request(frontend + '/api/ready'), {API_ORIGIN: origin}, () => {
      assert.fail('An invalid backend must never be contacted.');
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok((await response.json()).error);
  }
});

test('Backend network failures do not disclose provider details or credentials', async () => {
  const response = await proxyAPI(new Request(frontend + '/api/ready'), env, async () => {
    throw new Error('private-provider-detail');
  });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-provider-detail/);
});

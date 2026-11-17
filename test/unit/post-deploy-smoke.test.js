const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { SERVICES } = require('../../src/services/catalog');
const { createChecks, validateResponse, discoverAssets, runSmoke, summaryMarkdown } = require('../../scripts/post-deploy-smoke');
const sha = 'abcdef123456'.repeat(3) + 'abcd';
const release = '20261118T010203004Z-' + sha.slice(0, 12);
const jsonCheck = { name: 'Account', route: '/api/session', service: 'accounts', kind: 'json', contract: 'anonymous' };
const response = (body = '{"user":null}', overrides = {}) => ({ status: 200, body,
  headers: new Headers({ 'content-type': 'application/json', 'x-kt-release': release, 'x-kt-service': 'accounts' }), ...overrides });

test('coverage includes all backend services, every menu application, calendar and analytics', () => {
  const checks = createChecks('1.6.0');
  for (const service of [...SERVICES, 'gateway']) assert.ok(checks.some(c => c.service === service), service);
  const home = fs.readFileSync(path.join(__dirname, '../../public/home.html'), 'utf8');
  for (const link of home.matchAll(/<a\b[^>]*data-companion-service=["'][^"']+["'][^>]*href=["']([^"']+)["']/g)) {
    assert.ok(checks.some(c => c.kind === 'html' && c.route === link[1]), `Uncovered menu application: ${link[1]}`);
  }
  for (const route of ['/', '/tournament', '/combat', '/initiative', '/tracker', '/studio', '/dice', '/faq', '/knowthykt', '/tierlist', '/account', '/maps/index.html', '/api/calendar-events', '/api/tierlists/seasons', '/api/heartbeat', '/telemetry/script.js']) {
    assert.ok(checks.some(c => c.route === route), route);
  }
});

test('rejects wrong release, mixed activation timestamps, wrong service, HTML API fallback and invalid JSON contracts', () => {
  validateResponse(jsonCheck, response(), { sha, release });
  for (const [key, value, error] of [['x-kt-release', 'old-release', /release/], ['x-kt-service', 'gateway', /service/], ['content-type', 'text/html', /content type/]]) {
    const r = response(); r.headers.set(key, value);
    assert.throws(() => validateResponse(jsonCheck, r, { sha, release }), error);
  }
  const mixed = response(); mixed.headers.set('x-kt-release', '20261118T010203005Z-' + sha.slice(0, 12));
  assert.throws(() => validateResponse(jsonCheck, mixed, { sha, release }), /release/);
  for (const body of ['<!doctype html>', '{bad', '{}', '{"user":{"isAdmin":true}}']) {
    assert.throws(() => validateResponse(jsonCheck, response(body), { sha, release }), /JSON|contract/);
  }
});

test('private APIs require an actual JSON authentication error, not a login page or arbitrary HTTP success', () => {
  const check = { ...jsonCheck, contract: 'unauthorized', status: 401 };
  validateResponse(check, response('{"error":"Login required"}', { status: 401 }), { sha, release });
  assert.throws(() => validateResponse(check, response('{"error":"Login required"}'), { sha, release }), /HTTP/);
  assert.throws(() => validateResponse(check, response('{}', { status: 401 }), { sha, release }), /contract/);
});

test('HTML identity, calculator readiness, CSS MIME and both release-note versions are validated', () => {
  const html = { ...jsonCheck, kind: 'html', section: 'studio' };
  const htmlResponse = response('<html><body data-companion-section="studio"></body></html>'); htmlResponse.headers.set('content-type', 'text/html');
  validateResponse(html, htmlResponse, { sha, release });
  assert.throws(() => validateResponse({ ...html, section: 'faq' }, htmlResponse, { sha, release }), /page identity/);
  assert.throws(() => validateResponse({ ...jsonCheck, contract: 'combat' }, response('{"status":"ok","buildReady":false}'), { sha, release }), /contract/);
  const css = response('<html>fallback</html>'); css.headers.set('content-type', 'text/css');
  assert.throws(() => validateResponse({ ...jsonCheck, kind: 'css' }, css, { sha, release }), /asset/);
  const notes = { ...jsonCheck, contract: 'changelog', version: '1.6.0' };
  validateResponse(notes, response('{"page":{"markdown":"## 1.6.0 — release"}}'), { sha, release });
  assert.throws(() => validateResponse(notes, response('{"page":{"markdown":"## 1.5.38 — old"}}'), { sha, release }), /contract/);
});

test('discovers referenced same-origin scripts/styles, preserves versions, and excludes external media', () => {
  const assets = discoverAssets('<script src="/app.js?v=1&amp;a=2"></script><link href="style.css?v=3" rel="stylesheet"><script src="https://other.test/x.js"></script><img src="/image.png"><script src="/app.js?v=1&amp;a=2"></script>', 'https://example.test/studio/');
  assert.deepEqual(assets, [{ url: 'https://example.test/app.js?v=1&a=2', kind: 'js' }, { url: 'https://example.test/studio/style.css?v=3', kind: 'css' }]);
});

async function fixture(t, handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, cookie: req.headers.cookie });
    res.setHeader('X-KT-Release', release); res.setHeader('X-KT-Service', 'gateway');
    res.setHeader('Content-Type', 'text/html');
    handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { origin: `http://127.0.0.1:${server.address().port}`, seen };
}
const page = { name: 'Home', route: '/', service: 'gateway', kind: 'html', section: 'home' };
const options = { sha, attempts: 2, retryDelayMs: 0, timeoutMs: 1000 };

test('retries transient failures, fetches required assets, and collects all failures without cookies or writes', async t => {
  let first = true;
  const f = await fixture(t, (req, res) => {
    const pathname = new URL(req.url, 'http://test').pathname;
    if (pathname === '/' && first) { first = false; res.statusCode = 503; res.end('starting'); return; }
    if (pathname === '/') { res.end('<html><body data-companion-section="home"><script src="/main.js?v=1"></script><link rel="stylesheet" href="/broken.css"></body></html>'); return; }
    if (pathname === '/main.js') { res.setHeader('Content-Type', 'application/javascript'); res.end('console.log("ready")'); return; }
    res.statusCode = 404; res.end('not found');
  });
  const result = await runSmoke({ ...options, origin: f.origin, checks: [page, { ...page, name: 'Missing page', route: '/missing' }] });
  assert.equal(result.ok, false);
  assert.equal(result.failed, 2);
  assert.equal(result.results.find(r => r.name === 'Home').attempts, 2);
  assert.ok(result.results.some(r => r.kind === 'js' && r.ok));
  assert.ok(result.results.some(r => r.kind === 'css' && !r.ok));
  assert.ok(f.seen.every(req => req.method === 'GET' && !req.cookie));
  assert.match(summaryMarkdown(result), /Missing page/);
});

test('rejects cross-origin/login redirects and bounds stalled responses', async t => {
  const f = await fixture(t, (req, res) => {
    if (req.url.startsWith('/hang')) return;
    res.writeHead(302, { Location: 'https://other.test/login' }); res.end();
  });
  const result = await runSmoke({ ...options, origin: f.origin, attempts: 1, timeoutMs: 30, checks: [page, { ...page, route: '/hang', name: 'Timeout' }] });
  assert.equal(result.failed, 2);
  assert.match(result.results[0].error, /redirect/);
  assert.match(result.results[1].error, /timeout/i);
});

test('validates external analytics without requiring application release headers', async t => {
  const f = await fixture(t, (_req, res) => { res.removeHeader('X-KT-Release'); res.removeHeader('X-KT-Service'); res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}'); });
  const result = await runSmoke({ ...options, origin: f.origin, analyticsOrigin: f.origin, checks: [{ name: 'Umami heartbeat', route: '/api/heartbeat', target: 'analytics', kind: 'json', contract: 'heartbeat' }] });
  assert.equal(result.ok, true);
});

const fs = require('node:fs');
const { pageService } = require('../src/services/catalog');

function createChecks(version = '') {
  const pages = [
    ['Home', '/', 'gateway', 'home'], ['Tournaments and calendar', '/tournament', 'tournaments', 'tournament'],
    ['Combat Lab', '/combat', 'calculators', 'combat'], ['Initiative', '/initiative', 'calculators', 'initiative'],
    ['Activation tracker', '/tracker', 'calculators', 'tracker'], ['Studio', '/studio', 'studio', 'studio'],
    ['Dice Generator', '/dice', 'studio', 'dice'], ['FAQ', '/faq', 'faq', 'faq'],
    ['Know Thy Kill Team', '/knowthykt', 'knowthykt', 'training'], ['Tierlists', '/tierlist', 'tierlists', 'tierlist'],
    ['Account', '/account', 'accounts', 'account'], ['Maps', '/maps/index.html', 'gateway', null]
  ].map(([name, route, service, section]) => ({ name, route, service, section, kind: 'html', ...(name === 'Maps' ? { marker: 'id="maps"' } : {}) }));
  const apis = [
    ['Account session', '/api/session', 'accounts', 'anonymous'], ['Tournament session', '/api/me', 'tournaments', 'anonymous'],
    ['Tournament list', '/api/tournaments', 'tournaments', 'tournaments'], ['Calendar events', '/api/calendar-events', 'tournaments', 'events'],
    ['Studio library', '/api/studio/library', 'studio', 'teams'], ['FAQ entries', '/api/faq', 'faq', 'entries'],
    ['Training question bank', '/api/training/questions', 'knowthykt', 'questions'],
    ['Tierlist catalog', '/api/tierlists/catalog', 'tierlists', 'catalog'], ['Tierlist seasons', '/api/tierlists/seasons', 'tierlists', 'seasons'],
    ['Combat build', '/combat/api/health', 'calculators', 'combat'],
    ['Private notifications', '/api/notifications', 'notifications', 'unauthorized'],
    ['Private tierlists', '/api/tierlists', 'tierlists', 'unauthorized']
  ].map(([name, route, service, contract]) => ({ name, route, service, contract, kind: 'json', status: contract === 'unauthorized' ? 401 : 200 }));
  return [...pages, ...apis,
    ...['ru', 'en'].map(locale => ({ name: `Changelog (${locale})`, route: `/api/documentation/${locale}/changelog`, service: 'tournaments', kind: 'json', contract: 'changelog', version })),
    { name: 'Calendar script', route: '/calendar.js', service: 'tournaments', kind: 'js' },
    { name: 'Calendar styles', route: '/calendar.css', service: 'tournaments', kind: 'css' },
    { name: 'Analytics tracker', route: '/telemetry/script.js', kind: 'js' },
    { name: 'Umami dashboard', route: '/', target: 'analytics', kind: 'html' },
    { name: 'Umami heartbeat', route: '/api/heartbeat', target: 'analytics', kind: 'json', contract: 'heartbeat' }
  ];
}

function validateResponse(check, response, { sha, release } = {}) {
  if (response.status !== (check.status || 200)) throw Error(`HTTP ${response.status}; expected ${check.status || 200}`);
  if (check.service) {
    const actual = response.headers.get('x-kt-release');
    if (!new RegExp('^\\d{8}T\\d{9}Z-' + sha.slice(0, 12) + '$').test(actual || '') || (release && actual !== release)) throw Error('Wrong deployment release');
    if (response.headers.get('x-kt-service') !== check.service) throw Error(`Wrong service; expected ${check.service}`);
  }
  const mime = response.headers.get('content-type') || '', body = response.body;
  const types = { html: /^text\/html(?:;|$)/i, json: /^application\/json(?:;|$)/i,
    js: /^(?:application|text)\/(?:javascript|x-javascript)(?:;|$)/i, css: /^text\/css(?:;|$)/i };
  if (!types[check.kind]?.test(mime)) throw Error(`Wrong content type; expected ${check.kind}`);
  if (check.kind === 'html') {
    if (!/<html(?:\s|>)/i.test(body) || (check.section && !new RegExp('data-companion-section=["\']' + check.section + '["\']').test(body)) ||
        (check.marker && !body.includes(check.marker))) throw Error('Wrong HTML page identity');
  } else if (check.kind === 'js' || check.kind === 'css') {
    if (!body.trim() || /^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(body)) throw Error('Empty or HTML asset response');
  } else {
    let data;
    try { data = JSON.parse(body); } catch { throw Error('Invalid JSON response'); }
    const object = data && typeof data === 'object' && !Array.isArray(data);
    let valid = false;
    if (object) switch (check.contract) {
      case 'anonymous': valid = Object.hasOwn(data, 'user') && data.user === null; break;
      case 'unauthorized': valid = typeof data.error === 'string' && data.error.length > 0; break;
      case 'heartbeat': valid = data.ok === true; break;
      case 'combat': valid = data.status === 'ok' && data.buildReady === true; break;
      case 'catalog': valid = Array.isArray(data.teams) && data.teams.length > 0 && ['string', 'number'].includes(typeof data.version); break;
      case 'questions': valid = Array.isArray(data.questions) && data.questions.length > 0 && typeof data.revision === 'number'; break;
      case 'seasons': valid = Array.isArray(data.seasons); break;
      case 'changelog': {
        const markdown = data.page?.markdown;
        valid = typeof markdown === 'string' && /^## /m.test(markdown) && (!check.version || markdown.split('\n').some(line => line.startsWith(`## ${check.version} `)));
        break;
      }
      default: valid = Array.isArray(data[check.contract]);
    }
    if (!valid) throw Error(`Invalid JSON contract: ${check.contract}`);
  }
}

function discoverAssets(html, pageUrl) {
  const result = new Map(), page = new URL(pageUrl);
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const attributes = Object.fromEntries([...tag[0].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), m[3].replace(/&amp;/g, '&')]));
    const script = /^<script\b/i.test(tag[0]);
    if (!script && !attributes.rel?.toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    const value = script ? attributes.src : attributes.href;
    if (!value) continue;
    const url = new URL(value, page);
    if (url.origin !== page.origin || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
    url.hash = '';
    result.set(url.href, { url: url.href, kind: script ? 'js' : 'css' });
  }
  return [...result.values()];
}

function originUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Use an HTTP(S) origin without credentials');
  return url.origin;
}

async function request(url, { timeoutMs, maxBytes = 8 * 1024 * 1024 }) {
  const initial = new URL(url), signal = AbortSignal.timeout(timeoutMs);
  let target = initial;
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetch(target, { method: 'GET', redirect: 'manual', signal,
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'KTCompanion-PostDeploy-CI/1.0' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      const next = location && new URL(location, target);
      if (!next || next.origin !== initial.origin || next.pathname.replace(/\/$/, '') !== initial.pathname.replace(/\/$/, '')) throw Error('Unexpected redirect');
      target = next; continue;
    }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw Error('Oversized response'); }
    const chunks = []; let size = 0;
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > maxBytes) throw Error('Oversized response');
      chunks.push(chunk);
    }
    return { status: response.status, headers: response.headers, body: Buffer.concat(chunks).toString('utf8'), url: target.href };
  }
  throw Error('Too many redirects');
}

async function mapLimited(items, concurrency, worker) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await worker(items[index]); }
  }));
  return results;
}

async function runSmoke({ origin, analyticsOrigin = 'https://stats.ktcompanion.ru', sha, version = '', checks = createChecks(version),
  attempts = 4, timeoutMs = 10000, retryDelayMs = 3000, concurrency = 4, budgetMs = 6 * 60 * 1000 }) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw Error('Expected deployment SHA must be a full lowercase commit hash');
  if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(budgetMs) || budgetMs < 1) throw Error('Invalid smoke-check limits');
  origin = originUrl(origin); analyticsOrigin = originUrl(analyticsOrigin);
  const context = { sha }, assets = new Map();
  const deadline = Date.now() + budgetMs;
  async function execute(check) {
    const url = new URL(check.route, check.target === 'analytics' ? analyticsOrigin : origin);
    const result = { name: check.name, route: check.route, target: check.target || 'application', kind: check.kind, service: check.service, ok: false, attempts: 0 };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { result.error = 'Smoke-check time budget exceeded'; return result; }
      result.attempts = attempt;
      try {
        const requested = new URL(url); requested.searchParams.set('_deploy_check', sha.slice(0, 12));
        const response = await request(requested, { timeoutMs: Math.min(timeoutMs, remaining) });
        result.status = response.status;
        validateResponse(check, response, context);
        if (check.service && !context.release) context.release = response.headers.get('x-kt-release');
        if (check.kind === 'html' && check.target !== 'analytics') {
          for (const asset of discoverAssets(response.body, response.url)) {
            const assetUrl = new URL(asset.url);
            // Keep cache/version parameters, but not the request's diagnostic one.
            assetUrl.searchParams.delete('_deploy_check');
            assets.set(assetUrl.href, { name: `Asset ${assetUrl.pathname}`, route: assetUrl.pathname + assetUrl.search,
              kind: asset.kind, service: assetUrl.pathname.startsWith('/telemetry/') ? undefined : pageService(assetUrl.pathname) || 'gateway' });
          }
        }
        result.ok = true; delete result.error; return result;
      } catch (error) {
        result.error = ['TimeoutError', 'AbortError'].includes(error.name) ? 'Request timeout' : error.message;
        if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, Math.min(retryDelayMs, Math.max(0, deadline - Date.now()))));
      }
    }
    return result;
  }
  // Establish the release ID from the homepage before checking other services.
  const first = checks.length ? [await execute(checks[0])] : [];
  const results = [...first, ...await mapLimited(checks.slice(1), concurrency, execute)];
  const alreadyChecked = new Set(checks.filter(c => !c.target).map(c => new URL(c.route, origin).href));
  results.push(...await mapLimited([...assets].filter(([url]) => !alreadyChecked.has(url)).map(([, check]) => check), concurrency, execute));
  const failed = results.filter(r => !r.ok).length;
  return { sha, release: context.release, origin, analyticsOrigin, ok: failed === 0 && results.length > 0,
    total: results.length, passed: results.length - failed, failed, results };
}

function summaryMarkdown(report) {
  const cell = value => String(value || '').replace(/[|\r\n]/g, ' ');
  return `## All-application post-deployment checks\n\nCommit: \`${report.sha}\`\n\n${report.passed}/${report.total} passed.\n\n` +
    '| Check | Target | Result | Attempts |\n|---|---|---|---|\n' + report.results.map(r => `| ${cell(r.name)} | ${cell(r.route)} | ${r.ok ? 'Passed' : 'FAILED: ' + cell(r.error)} | ${r.attempts} |`).join('\n') + '\n';
}

async function main() {
  const tag = process.env.DEPLOY_TAG || '';
  if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Invalid deployment tag');
  const report = await runSmoke({ origin: process.env.HEALTH_URL || 'https://ktcompanion.ru/',
    analyticsOrigin: process.env.ANALYTICS_URL || 'https://stats.ktcompanion.ru/', sha: process.env.DEPLOY_SHA, version: tag.slice(1) });
  fs.mkdirSync('work/post-deploy-smoke', { recursive: true });
  fs.writeFileSync('work/post-deploy-smoke/report.json', JSON.stringify(report, null, 2) + '\n');
  const summary = summaryMarkdown(report);
  fs.writeFileSync('work/post-deploy-smoke/summary.md', summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  for (const result of report.results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}: ${result.route}${result.ok ? '' : ' — ' + result.error}`);
  console.log(`${report.passed}/${report.total} post-deployment checks passed.`);
  if (!report.ok) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createChecks, validateResponse, discoverAssets, runSmoke, summaryMarkdown };

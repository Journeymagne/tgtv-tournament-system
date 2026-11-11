/* Visual inspection of the isolated review bundle. API fixtures are browser-only;
   every write and unhandled network request is rejected. No product test runner. */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('C:/Users/Journeymagne/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const { fixture } = require('../review/fixtures.cjs');
const community = require('../review/community-fixtures.cjs');
const devices = JSON.parse(fs.readFileSync(path.join(root, 'docs/devices.json'), 'utf8'));
const bundle = path.join(root, 'artifacts', process.env.REVIEW_BUNDLE || 'review-dist');
const output = path.join(root, 'review');
const screens = [
  ['games', {}], ['tournaments', {}], ['standings', { slug: 'companion-open' }], ['profile', {}],
  ['tournament', { slug: 'companion-open' }], ['participants', { slug: 'companion-open' }], ['schedule', { slug: 'companion-open' }],
  ['game', { id: 701 }], ['score', { id: 701 }], ['settings', {}], ['account', {}], ['notifications', {}],
  ['organizer', {}], ['organizer', { tournamentId: 1 }], ['org-create', {}], ['org-edit', { tournamentId: 1 }],
  ['org-registrations', { tournamentId: 1 }], ['org-rounds', { tournamentId: 1 }], ['org-tables', { tournamentId: 1 }],
  ['org-result', { tournamentId: 1, matchId: 501 }], ['org-staff', { tournamentId: 1 }], ['org-audit', { tournamentId: 1 }],
  ['org-pairings', { tournamentId: 1, roundId: 401 }], ['org-seeds', { tournamentId: 1 }],
  ['org-round-tables', { tournamentId: 2, roundId: 402 }], ['org-team-result', { tournamentId: 2, gameId: 702 }],
  ['login', {}], ['onboarding', {}], ['recovery', {}], ['registration', { slug: 'companion-open' }],
  ['roster-registration', { slug: 'companion-teams', tournamentId: 2 }], ['table', { slug: 'companion-open', tableId: 11 }],
  ['team', {}], ['pairing', { id: 601 }], ['roster', { id: 201 }], ['tournament-stats', { slug: 'companion-open' }],
  ...community.routes.map(route => [route.name, route.params || {}]),
];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filename = path.resolve(bundle, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(bundle + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
  fs.createReadStream(filename).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const errors = [], blocked = [], views = [];
  try {
    await Promise.all(['dark', 'light'].map(async theme => {
      const context = await browser.newContext();
      await context.addInitScript(value => { localStorage.setItem('kt.theme', value); localStorage.setItem('kt.locale', 'ru'); }, theme);
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin) return route.continue();
        if (url.pathname.startsWith('/api/')) {
          const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type,Accept', 'Access-Control-Allow-Methods': 'GET,OPTIONS' };
          if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
          const data = request.method() === 'GET' ? community.fixture(url.pathname) ?? fixture(url.pathname) : undefined;
          if (data !== undefined) return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) });
          blocked.push({ method: request.method(), path: url.pathname });
          return route.fulfill({ status: 403, contentType: 'application/json', headers, body: JSON.stringify({ error: 'Blocked by isolated visual review' }) });
        }
        blocked.push({ method: request.method(), path: url.origin + url.pathname });
        return route.abort();
      });
      const page = await context.newPage();
      let current = {};
      page.on('pageerror', error => errors.push({ ...current, error: error.message }));
      for (const device of devices) for (const orientation of ['portrait', 'landscape']) {
        const width = orientation === 'portrait' ? device.width : device.height;
        const height = orientation === 'portrait' ? device.height : device.width;
        await page.setViewportSize({ width, height });
        for (const [screen, params] of screens) {
          current = { device: device.name, width, height, orientation, theme, screen, params };
          const url = origin + '/?screen=' + encodeURIComponent(screen) + '&params=' + encodeURIComponent(JSON.stringify(params));
          await page.goto(url, { waitUntil: 'load' });
          await page.getByRole('heading').first().waitFor({ timeout: 20000 });
          await page.waitForTimeout(110);
          const layout = await page.evaluate(() => {
            const elements = [...document.querySelectorAll('[role="button"],[role="tab"],input,[role="heading"],img')];
            const clipped = elements.map(node => { const rect = node.getBoundingClientRect(); return { text: (node.textContent || node.getAttribute('aria-label') || '').slice(0, 90), left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height }; }).filter(item => item.width > 0 && item.height > 0 && item.top >= 0 && item.top < innerHeight && (item.left < -1 || item.right > innerWidth + 1));
            const buttons = [...document.querySelectorAll('[role="button"],[role="tab"]')].map(node => { const rect = node.getBoundingClientRect(); return { text: (node.textContent || node.getAttribute('aria-label') || '').slice(0, 90), width: rect.width, height: rect.height }; }).filter(item => item.width > 0 && item.height > 0 && (item.width < 47 || item.height < 47));
            const lastTab = [...document.querySelectorAll('[role="tab"]')].at(-1);
            if (lastTab && lastTab.getBoundingClientRect().bottom > innerHeight) lastTab.scrollIntoView({ block: 'nearest' });
            const tabRect = lastTab?.getBoundingClientRect();
            const navReachable = !tabRect || tabRect.top >= 0 && tabRect.bottom <= innerHeight + 1;
            const selectedTabCount = document.querySelectorAll('[role="tab"][aria-selected="true"]').length;
            return { overflow: document.documentElement.scrollWidth > innerWidth, clipped, navReachable, selectedTabCount, smallControls: buttons, title: document.querySelector('[role="heading"]')?.textContent || '', text: document.body.innerText.slice(0, 180) };
          });
          views.push({ ...current, ...layout });
          if (device.name === 'iPhone 16' && orientation === 'portrait' && ['games', 'score', 'pairing', 'org-registrations', 'org-result', 'org-rounds'].includes(screen)) await page.screenshot({ path: path.join(output, `${screen}-${theme}-phone.png`) });
          if (device.name === 'Galaxy Tab S10 FE' && orientation === 'landscape' && (['games', 'profile', 'score', 'pairing', 'roster', 'tournament-stats'].includes(screen) || ['organizer', 'org-staff'].includes(screen) && params.tournamentId)) await page.screenshot({ path: path.join(output, `${screen}-${theme}-tablet.png`) });
          if (device.name === 'Compact / split screen' && orientation === 'landscape' && screen === 'games') await page.screenshot({ path: path.join(output, `games-${theme}-short-landscape.png`) });
        }
        console.log(JSON.stringify({ done: device.name, orientation, theme, views: views.length }));
      }
      await context.close();
    }));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
  const jsDir = path.join(bundle, '_expo/static/js/web');
  const bundleDigests = Object.fromEntries(fs.readdirSync(jsDir).filter(name => name.endsWith('.js')).map(name => [name, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(jsDir, name))).digest('hex')]));
  const report = { scope: 'React Native Web rendering with browser-intercepted fictional API fixtures; not a native or backend integration test', generatedAt: new Date().toISOString(), bundleDigests, views: views.length, errors, blocked, overflows: views.filter(v => v.overflow || v.clipped.length || !v.navReachable || v.selectedTabCount !== 1), smallControls: views.filter(v => v.smallControls.length), results: views };
  fs.writeFileSync(path.join(output, 'visual-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ views: report.views, errors, blocked, overflows: report.overflows.length, smallControls: report.smallControls.length }));
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

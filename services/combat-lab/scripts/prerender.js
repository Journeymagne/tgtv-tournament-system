// Browser-free prerender for the Cloudflare Workers build (npm run build:cloudflare).
//
// Does the job react-snap does for Netlify, without launching Chromium:
// Cloudflare's build machine lacks the system libraries Chromium needs
// (libXcomposite.so.1 and friends) and cannot install them. jsdom is a
// JavaScript DOM, so this runs anywhere Node runs.
//
// For each route in package.json `reactSnap.include` (the same list react-snap
// uses, so the two can't drift), it loads the CRA shell (build/index.html) at
// that URL, runs the real bundle, serves the app's own fetches (the /rules/*.md
// docs) from build/, waits until nothing is pending, and writes the rendered
// HTML to build/<route>/index.html. src/index.tsx then hydrates it in the
// browser exactly as it does react-snap's output.
//
// Any page error, failed local fetch, or page that never settles fails the
// build, so a broken prerender is never deployed.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const repoRoot = path.resolve(__dirname, '..');
const buildDir = path.join(repoRoot, 'build');
const ORIGIN = 'https://ktcalc.com';
const routes = require(path.join(repoRoot, 'package.json')).reactSnap.include;

const QUIET_MS = 300; // page must be idle this long before it is saved
const TIMEOUT_MS = 20000;

const CONTENT_TYPES = { '.md': 'text/markdown; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain' };

// Map a same-origin URL to a file in build/, or null if there is none.
function localFile(url) {
  const u = new URL(url);
  if (u.origin !== ORIGIN) return null;
  const file = path.join(buildDir, decodeURIComponent(u.pathname));
  if (!file.startsWith(buildDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return file;
}

// Serves the bundle's own scripts from build/ and answers every other request
// with an empty body, so nothing touches the network. Stylesheets are not
// needed (jsdom does no layout, and the <link> tags stay in the saved HTML),
// and off-site scripts such as the Google tag must not run at build time.
const localScriptsOnly = requestInterceptor((request) => {
  const file = localFile(request.url);
  if (file && file.endsWith('.js')) {
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'text/javascript' } });
  }
  const type = request.url.endsWith('.css') ? 'text/css' : 'text/javascript';
  return new Response('', { headers: { 'Content-Type': type } });
});

// Browser APIs jsdom leaves out that the app or its libraries touch. None of
// them affect the saved markup.
function addBrowserStubs(window, track) {
  window.matchMedia = window.matchMedia || ((query) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }));
  class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  window.ResizeObserver = window.ResizeObserver || NoopObserver;
  window.IntersectionObserver = window.IntersectionObserver || NoopObserver;
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = function scrollIntoView() {};

  // jsdom has no fetch. Serve same-origin files from build/ and fail loudly on
  // anything missing, so a renamed rules doc can't be prerendered as an error page.
  window.fetch = (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href).href;
    return track((async () => {
      const file = localFile(url);
      if (!file) throw new Error(`prerender: no local file for fetch(${url})`);
      const type = CONTENT_TYPES[path.extname(file)] || 'application/octet-stream';
      return new Response(fs.readFileSync(file), { status: 200, headers: { 'Content-Type': type } });
    })());
  };
}

// React sets form values as DOM properties (option.selected, input.checked,
// input.value), and HTML serialization only writes attributes. Copy the live
// state into attributes, as react-snap's fixFormFields does, or every select on
// the calculator pages would show its first option until the user touched it.
function syncFormState(document) {
  for (const option of document.querySelectorAll('option')) {
    if (option.selected) option.setAttribute('selected', '');
    else option.removeAttribute('selected');
  }
  for (const input of document.querySelectorAll('input')) {
    if (input.type === 'checkbox' || input.type === 'radio') {
      if (input.checked) input.setAttribute('checked', '');
      else input.removeAttribute('checked');
    } else if (input.type !== 'file' && input.type !== 'password') {
      input.setAttribute('value', input.value);
    }
  }
  for (const textarea of document.querySelectorAll('textarea')) {
    textarea.textContent = textarea.value;
  }
}

async function renderRoute(shell, route) {
  const errors = [];
  let pending = 0;
  let lastActivity = Date.now();
  const track = (promise) => {
    pending += 1;
    lastActivity = Date.now();
    return promise.finally(() => {
      pending -= 1;
      lastActivity = Date.now();
    }).catch((e) => {
      errors.push(e.message);
      throw e;
    });
  };

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    // A call into a browser API jsdom lacks is logged, not fatal: it cannot
    // change the saved markup. Script and loading errors fail the build.
    if (e.type === 'not-implemented' || e.type === 'css-parsing') {
      console.warn(`prerender: ${route}: ${e.message}`);
      return;
    }
    errors.push(`${e.type || 'jsdom'}: ${e.message}${e.cause ? ` (${e.cause.message || e.cause})` : ''}`);
  });
  virtualConsole.on('error', (...args) => {
    const msg = args.map(String).join(' ');
    // React's dev-only hydration and act() chatter never reaches a production
    // bundle; anything logged as an error here is a real page error.
    errors.push(msg);
  });

  const dom = new JSDOM(shell, {
    url: ORIGIN + route,
    runScripts: 'dangerously',
    resources: { interceptors: [localScriptsOnly] },
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse: (window) => addBrowserStubs(window, track),
  });

  await new Promise((resolve) => dom.window.addEventListener('load', resolve));
  // React runs useEffect (where Seo sets the title and meta tags) after the
  // first render, on a later tick. Count the quiet period from here, not from
  // before the bundle ran: the calculator pages take longer than QUIET_MS to
  // load, so an earlier start would save them before their effects run.
  lastActivity = Date.now();

  const started = Date.now();
  while (pending > 0 || Date.now() - lastActivity < QUIET_MS) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`prerender: ${route} never settled (${pending} fetch(es) pending)`);
    await new Promise((r) => setTimeout(r, 50));
  }
  if (errors.length) throw new Error(`prerender: ${route} had page errors:\n  ${errors.join('\n  ')}`);

  const root = dom.window.document.getElementById('root');
  if (!root || !root.hasChildNodes()) throw new Error(`prerender: ${route} rendered an empty #root`);

  syncFormState(dom.window.document);
  const html = dom.serialize();
  const title = dom.window.document.title;
  dom.window.close();
  return { html, title };
}

async function main() {
  const shellPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(shellPath)) throw new Error(`prerender: ${shellPath} not found; run react-scripts build first`);
  // Read the shell once: rendering "/" overwrites build/index.html.
  const shell = fs.readFileSync(shellPath, 'utf8');
  if (/<div id="root">\s*<\/div>/.test(shell) === false) {
    throw new Error('prerender: build/index.html is already prerendered; rebuild before prerendering again');
  }

  for (const route of routes) {
    const { html, title } = await renderRoute(shell, route);
    const out = route === '/' ? shellPath : path.join(buildDir, route, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    console.log(`prerender: ${route} -> ${path.relative(repoRoot, out)} (${title})`);
  }
  console.log(`prerender: ${routes.length} route(s) written`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildSites } = require("../../src/domain/sites");
const { rootDocument, siteName, pageDestination, handleSiteRequest } = require("../../src/http/sites");
const { sessionCookie, clearedSessionCookie, sessionToken } = require("../../src/http/io");
const sites = buildSites("https://ktcompanion.ru");
const request = (host, url = "/", method = "GET") => ({ headers: { host }, url, method });

test("configured services use separate subdomains with the same parent and local port", () => {
  assert.equal(sites.urls.tournament, "https://rating.ktcompanion.ru/");
  assert.equal(sites.urls.studio, "https://studio.ktcompanion.ru/");
  const local = buildSites("http://ktcompanion.localhost:3002");
  assert.equal(local.urls.initiative, "http://initiative.ktcompanion.localhost:3002/");
  assert.equal(local.urls.tracker, "http://tracker.ktcompanion.localhost:3002/");
  assert.equal(local.domain, "ktcompanion.localhost");
  for (const invalid of ["https://ktcompanion.ru/path", "https://user:pass@ktcompanion.ru", "http://127.0.0.1:3002", "javascript:alert(1)"]) assert.throws(() => buildSites(invalid));
});

test("each hostname serves only its own root page and known hosts are matched exactly", () => {
  assert.equal(rootDocument(request("ktcompanion.ru"), sites), "home.html");
  assert.equal(rootDocument(request("initiative.ktcompanion.ru"), sites), "killteam-initiative-calculator.html");
  assert.equal(rootDocument(request("tracker.ktcompanion.ru"), sites), "killteam-activation-tracker.html");
  assert.equal(rootDocument(request("rating.ktcompanion.ru"), sites), "index.html");
  assert.equal(rootDocument(request("studio.ktcompanion.ru"), sites), "studio/index.html");
  assert.equal(siteName(request("studio.ktcompanion.ru.evil.test"), sites), null);
  assert.equal(pageDestination(request("studio.ktcompanion.ru"), sites), null);
});

test("legacy pages move to the right service without redirecting assets or API writes", () => {
  assert.equal(pageDestination(request("ktcompanion.ru", "/studio/?resume=abc"), sites), "https://studio.ktcompanion.ru/?resume=abc");
  assert.equal(pageDestination(request("ktcompanion.ru", "/tournaments/team-cup?round=2"), sites), "https://rating.ktcompanion.ru/tournaments/team-cup?round=2");
  assert.equal(pageDestination(request("127.0.0.1:3002", "/tournament/"), sites), "https://rating.ktcompanion.ru/");
  assert.equal(pageDestination(request("rating.ktcompanion.ru", "/tournaments/team-cup"), sites), null);
  assert.equal(pageDestination(request("studio.ktcompanion.ru", "/studio/model.js"), sites), null);
  assert.equal(pageDestination(request("studio.ktcompanion.ru", "/api/login", "POST"), sites), null);
});

test("the page configuration is uncached and contains only the configured public origins", () => {
  let status, headers, body;
  const handled = handleSiteRequest(request("studio.ktcompanion.ru", "/companion-sites.js?v=test"), {
    writeHead(code, value) { status = code; headers = value; }, end(value) { body = value; }
  }, sites);
  assert.equal(handled, true);
  assert.equal(status, 200);
  assert.equal(headers["Cache-Control"], "no-store");
  const root = { window: {} }; vm.runInNewContext(body, root);
  assert.equal(root.window.KT_SITES.current, "studio");
  assert.equal(root.window.KT_SITES.urls.home, "https://ktcompanion.ru/");
});

test("shared login, renewal and logout cookies retain the parent domain and ignore legacy host cookies", () => {
  const cookie = sessionCookie("secret-token", 10000, true, sites.domain);
  assert.match(cookie, /^kt_sid=secret-token;/);
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Domain=ktcompanion.ru"]) assert(cookie.includes(attribute));
  const cleared = clearedSessionCookie(true, sites.domain);
  assert.match(cleared, /^kt_sid=;/);
  assert(cleared.includes("Max-Age=0"));
  assert(cleared.includes("Domain=ktcompanion.ru"));
  assert.equal(sessionToken({ headers: { cookie: "sid=old; kt_sid=shared" } }, sites.domain), "shared");
  assert.equal(sessionToken({ headers: { cookie: "sid=old" } }, sites.domain), undefined);
});

test("login returns to an exact service origin and rejects external or deceptive destinations", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../../public/companion-shell.js"), "utf8");
  for (const [next, allowed] of [
    ["https://studio.ktcompanion.ru/?resume=guest#editor", true],
    ["https://ktcompanion.ru/", true],
    ["https://evil.test/", false],
    ["https://studio.ktcompanion.ru.evil.test/", false],
    ["http://studio.ktcompanion.ru/", false],
    ["https://user@studio.ktcompanion.ru/", false],
    ["javascript:alert(1)", false]
  ]) {
    const redirects = [], location = new URL("https://rating.ktcompanion.ru/?next=" + encodeURIComponent(next));
    location.replace = value => redirects.push(value);
    const root = { URL, URLSearchParams, location, KT_SITES: { subdomains: true, urls: sites.urls, current: "tournament" },
      document: { body: { dataset: { companionSection: "tournament" } }, querySelectorAll: () => [], addEventListener() {} },
      fetch: async () => ({ ok: true, json: async () => ({ user: { id: 7, name: "User" } }) }), addEventListener() {} };
    root.window = root;
    vm.runInNewContext(source, root);
    await root.KTCompanion.ready;
    assert.equal(root.KTCompanion.returnAfterLogin(), allowed, next);
    assert.equal(redirects.length, allowed ? 1 : 0, next);
  }
});

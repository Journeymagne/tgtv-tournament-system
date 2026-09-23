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

test("service paths share a single origin and support ordinary localhost or IP previews", () => {
  assert.equal(sites.urls.tournament, "https://ktcompanion.ru/tournament");
  assert.equal(sites.urls.studio, "https://ktcompanion.ru/studio");
  for (const origin of ["http://localhost:3002", "http://127.0.0.1:3002"]) {
    const local = buildSites(origin);
    assert.equal(local.urls.initiative, origin + "/initiative");
    assert.equal(local.urls.tracker, origin + "/tracker");
  }
  for (const invalid of ["https://ktcompanion.ru/path", "https://user:pass@ktcompanion.ru", "javascript:alert(1)"]) assert.throws(() => buildSites(invalid));
});

test("each service path serves its own entry page without depending on a subdomain", () => {
  for (const host of ["ktcompanion.ru", "127.0.0.1:3002"]) {
    for (const [pathname, document] of [["/", "home.html"], ["/initiative", "killteam-initiative-calculator.html"], ["/tracker", "killteam-activation-tracker.html"], ["/tournament", "index.html"], ["/studio", "studio/index.html"]]) {
      assert.equal(rootDocument(request(host, pathname)), document);
      assert.equal(pageDestination(request(host, pathname), null), null);
    }
  }
  assert.equal(siteName(request("ktcompanion.ru", "/tournaments/cup")), "tournament");
});

test("old paths and service hosts redirect without losing queries or redirecting API writes", () => {
  assert.equal(pageDestination(request("ktcompanion.ru", "/studio/?resume=abc"), sites), "/studio?resume=abc");
  assert.equal(pageDestination(request("ktcompanion.ru", "/killteam-activation-tracker.html?q=1"), null), "/tracker?q=1");
  assert.equal(pageDestination(request("rating.ktcompanion.ru"), sites), "https://ktcompanion.ru/tournament");
  assert.equal(pageDestination(request("studio.ktcompanion.ru", "/?resume=abc"), sites), "https://ktcompanion.ru/studio?resume=abc");
  assert.equal(pageDestination(request("rating.ktcompanion.ru", "/tournaments/team-cup?round=2"), sites), "https://ktcompanion.ru/tournaments/team-cup?round=2");
  assert.equal(pageDestination(request("ktcompanion.ru", "/tournaments/team-cup"), sites), null);
  assert.equal(pageDestination(request("ktcompanion.ru", "/studio/model.js"), sites), null);
  assert.equal(pageDestination(request("ktcompanion.ru", "/api/login", "POST"), sites), null);
});

test("uncached page configuration uses clean paths even without environment settings", () => {
  for (const configured of [sites, null]) {
    let status, headers, body;
    assert(handleSiteRequest(request("ktcompanion.ru", "/companion-sites.js?v=test"), {
      writeHead(code, value) { status = code; headers = value; }, end(value) { body = value; }
    }, configured));
    assert.equal(status, 200);
    assert.equal(headers["Cache-Control"], "no-store");
    const root = { window: {} }; vm.runInNewContext(body, root);
    assert.equal(root.window.KT_SITES.subdomains, false);
    assert.equal(root.window.KT_SITES.urls.studio, configured ? "https://ktcompanion.ru/studio" : "/studio");
  }
});

test("login and logout use one host-only cookie across all service paths", () => {
  const cookie = sessionCookie("secret-token", 10000, true);
  assert.match(cookie, /^sid=secret-token;/);
  for (const attribute of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"]) assert(cookie.includes(attribute));
  assert(!cookie.includes("Domain="));
  const cleared = clearedSessionCookie(true);
  assert.match(cleared, /^sid=;/);
  assert(cleared.includes("Max-Age=0"));
  assert(cleared.includes("Path=/"));
  assert(!cleared.includes("Domain="));
  assert.equal(sessionToken({ headers: { cookie: "sid=local; kt_sid=old-shared" } }), "local");
  assert.equal(sessionToken({ headers: { cookie: "kt_sid=old-shared" } }), undefined);
});

test("login returns to an exact service origin and rejects external or deceptive destinations", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../../public/companion-shell.js"), "utf8");
  for (const [next, allowed] of [
    ["https://ktcompanion.ru/studio?resume=guest#editor", true],
    ["https://studio.ktcompanion.ru/", false],
    ["https://ktcompanion.ru/", true],
    ["https://evil.test/", false],
    ["https://studio.ktcompanion.ru.evil.test/", false],
    ["http://studio.ktcompanion.ru/", false],
    ["https://user@studio.ktcompanion.ru/", false],
    ["javascript:alert(1)", false]
  ]) {
    const redirects = [], location = new URL("https://ktcompanion.ru/tournament?next=" + encodeURIComponent(next));
    location.replace = value => redirects.push(value);
    const root = { URL, URLSearchParams, location, KT_SITES: { subdomains: false, urls: sites.urls, current: "tournament" },
      document: { body: { dataset: { companionSection: "tournament" } }, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} },
      fetch: async () => ({ ok: true, json: async () => ({ user: { id: 7, name: "User" } }) }), addEventListener() {} };
    root.window = root;
    vm.runInNewContext(source, root);
    await root.KTCompanion.ready;
    assert.equal(root.KTCompanion.returnAfterLogin(), allowed, next);
    assert.equal(redirects.length, allowed ? 1 : 0, next);
  }
});

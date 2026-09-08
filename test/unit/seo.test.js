const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  handleSeoRequest,
  metaDescription,
  robotsTxt,
  sitemapXml,
  tournamentPublicUrl,
  tournamentSlugFromPath
} = require("../../src/http/seo");

test("direct public tournament pages load data and translations before the app", async () => {
  let html = "";
  let status;
  const handled = await handleSeoRequest(
    { method: "GET", url: "/tournaments/team-cup", headers: { host: "127.0.0.1:3000" } },
    { writeHead: (value) => { status = value; }, end: (value) => { html = value; } },
    { withClient: (fn) => fn({ query: async () => ({ rows: [{ id: 1, slug: "team-cup", status: "in_progress", name: "Team Cup" }] }) }) }
  );
  assert.equal(handled, true);
  assert.equal(status, 200);
  const scripts = [...html.matchAll(/<script src="\/([^?]+)\?[^\"]+" defer><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ["game-data.js", "i18n.js", "app.js"]);

  // The dictionaries are no longer in this list: theme-boot.js runs first,
  // parser-blocking, and writes a tag for the one locale the visitor is in.
  // Losing it here would mean the app renders raw translation keys.
  assert.match(html, /<script src="\/theme-boot\.js\?[^"]+"><\/script>/);
  assert.ok(html.indexOf("theme-boot.js") < html.indexOf("app.js"));
  assert.doesNotMatch(html, /i18n\/(en|ru)\.js/);
});

test("tournamentSlugFromPath accepts clean public tournament URLs", () => {
  assert.equal(tournamentSlugFromPath("/tournaments/tgtv-open"), "tgtv-open");
  assert.equal(tournamentSlugFromPath("/tournaments/tgtv%20open"), "tgtv open");
});

test("tournamentSlugFromPath rejects non-public tournament URLs", () => {
  assert.equal(tournamentSlugFromPath("/tournaments"), "");
  assert.equal(tournamentSlugFromPath("/tournaments/admin"), "");
  assert.equal(tournamentSlugFromPath("/tournaments/admin/1"), "");
  assert.equal(tournamentSlugFromPath("/games"), "");
});

test("robotsTxt points crawlers at the sitemap", () => {
  assert.equal(
    robotsTxt("https://rating.ktcompanion.ru"),
    "User-agent: *\nAllow: /\n\nSitemap: https://rating.ktcompanion.ru/sitemap.xml\n"
  );
});

test("sitemapXml includes root and published tournament URLs", () => {
  const xml = sitemapXml("https://rating.ktcompanion.ru", [
    {
      slug: "rumble-open",
      completedAt: null,
      publishedAt: "2026-08-08T10:00:00.000Z",
      createdAt: "2026-08-07T10:00:00.000Z"
    }
  ]);
  assert.match(xml, /<loc>https:\/\/rating\.ktcompanion\.ru\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/rating\.ktcompanion\.ru\/tournaments\/rumble-open<\/loc>/);
  assert.match(xml, /<lastmod>2026-08-08T10:00:00.000Z<\/lastmod>/);
});

test("tournamentPublicUrl builds clean canonical URLs", () => {
  assert.equal(
    tournamentPublicUrl("https://rating.ktcompanion.ru", { slug: "rumble open" }),
    "https://rating.ktcompanion.ru/tournaments/rumble%20open"
  );
});

test("metaDescription strips markdown and truncates long text", () => {
  const text = metaDescription("# Header\n[Link](https://example.com) " + "x".repeat(200));
  assert.equal(text.startsWith("Header Link "), true);
  assert.equal(text.length, 155);
});

// seo.js builds its own HTML shell for crawlable routes, so it carries a second
// copy of the asset version. When the two drift, a visitor who lands on a
// tournament page gets a different app.js than one who lands on "/" -- and a
// released fix silently fails to reach the first of them.
test("the server-rendered shell serves the same asset version as index.html", () => {
  const seoSource = fs.readFileSync(path.join(__dirname, "../../src/http/seo.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(__dirname, "../../public/index.html"), "utf8");
  const seoVersion = seoSource.match(/ASSET_VERSION = "([^"]+)"/)?.[1];
  assert.ok(seoVersion, "seo.js no longer declares ASSET_VERSION");
  const indexVersions = [...indexSource.matchAll(/\/(?:app\.js|styles\.css|theme-boot\.js)\?v=([^"]+)/g)]
    .map((match) => match[1]);
  assert.ok(indexVersions.length >= 3, "index.html no longer versions its own scripts and stylesheet");
  assert.deepEqual([...new Set(indexVersions)], [seoVersion]);
});

// admin.js and documentation.css are deliberately absent from both shells: they
// are fetched at runtime, by administrators and by documentation readers
// respectively. Listing either one here would put them back on every visit.
test("the on-demand bundles are not linked from any first-paint shell", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "../../public/index.html"), "utf8");
  const seoSource = fs.readFileSync(path.join(__dirname, "../../src/http/seo.js"), "utf8");
  for (const asset of ["admin.js", "documentation.js", "documentation.css"]) {
    assert.ok(!indexSource.includes(asset), `index.html must not preload ${asset}`);
    assert.ok(!seoSource.includes(`/${asset}`), `the server-rendered shell must not preload ${asset}`);
  }
});

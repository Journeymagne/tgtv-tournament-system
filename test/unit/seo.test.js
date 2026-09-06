const test = require("node:test");
const assert = require("node:assert/strict");

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

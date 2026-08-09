const test = require("node:test");
const assert = require("node:assert/strict");

const {
  metaDescription,
  robotsTxt,
  sitemapXml,
  tournamentPublicUrl,
  tournamentSlugFromPath
} = require("../../src/http/seo");

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

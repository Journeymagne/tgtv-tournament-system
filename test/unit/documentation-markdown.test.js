const test = require("node:test");
const assert = require("node:assert/strict");
const { renderMarkdown, MAX_MARKDOWN_LENGTH } = require("../../src/domain/documentation");
const api = require("../../src/api/documentation");
const docs = require("../../public/documentation");

test("Markdown supports headings, tables, formulas, lists, links and escaped raw HTML", () => {
  const source = '## Scoring\n\n**Bold** and *italic*\n\n- First\n- Second\n\n| VP | GP |\n| --- | --- |\n| 0 | 10 |\n\n```text\nGP_A = min(20, 10 + VP_A − VP_B)\n```\n\n[Rules](https://example.com)\n\n> Note\n\n<script>alert(1)</script>';
  const { html, headings } = renderMarkdown(source);
  for (const marker of ['<strong>Bold</strong>', '<em>italic</em>', '<ul>', '<table>', 'scope="col"', '<code', '<blockquote>', 'href="https://example.com"', '&lt;script&gt;']) assert.ok(html.includes(marker), marker);
  assert.doesNotMatch(html, /<script>/);
  assert.deepEqual(headings, [{ id: "doc-scoring", title: "Scoring" }]);
});

test("scripts, unsafe URLs and HTML attributes cannot execute in published Markdown", () => {
  for (const source of ['[x](javascript:alert(1))', '[x](jav&#x61;script:alert(1))', '[x](data:text/html;base64,eA==)', '[x](vbscript:alert(1))', '<img src=x onerror=alert(1)>', '<svg onload=alert(1)>', '<iframe srcdoc="<script>alert(1)</script>"></iframe>']) {
    const { html } = renderMarkdown(source);
    assert.doesNotMatch(html, /<(script|svg|iframe|img)\b|href="(?:javascript|vbscript|data):/i);
  }
});

test("duplicate and Cyrillic headings get unique safe anchors, including formatted headings", () => {
  const { headings, html } = renderMarkdown('## **Очки**\n\n## Очки\n\n## Очки-2\n\n## Очки');
  assert.equal(new Set(headings.map((heading) => heading.id)).size, 4);
  assert.equal(headings[0].title, "Очки");
  for (const heading of headings) assert.ok(html.includes(`id="${heading.id}"`));
});

test("preview uses the public renderer, allows empty drafts, and bounds input", async () => {
  const markdown = '## Preview\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  assert.deepEqual(await api.preview({ body: { markdown } }), renderMarkdown(markdown));
  assert.equal((await api.preview({ body: { markdown: "" } })).html, "");
  for (const value of [null, {}, "a".repeat(MAX_MARKDOWN_LENGTH + 1), "bad\0text"]) {
    await assert.rejects(() => api.preview({ body: { markdown: value } }), (error) => error.status === 400);
  }
});

test("client loads published content and only exposes edit controls to administrators", async () => {
  const page = { id: "mmr", title: '<img src=x onerror=alert(1)>', summary: "Summary", category: "Rating", updatedAt: "2026-09-07", ...renderMarkdown("## Hello") };
  const calls = [];
  const data = await docs.load("en", "mmr", async (path) => { calls.push(path); return path.endsWith("/mmr") ? { page } : { pages: [page] }; });
  assert.deepEqual(calls, ["/api/documentation/en", "/api/documentation/en/mmr"]);
  assert.doesNotMatch(docs.render("en", "mmr", true, data), /data-doc-edit|<img/);
  assert.match(docs.render("en", "mmr", false, data, true), /data-doc-edit/);
  calls.length = 0;
  assert.equal((await docs.load("en", "unknown", async (path) => { calls.push(path); return { pages: [page] }; })).page, null);
  assert.equal(calls.length, 1);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const docs = require("../../public/documentation");
const { calculateElo, ELO_K } = require("../../src/domain/elo");
const { defaultPages, renderMarkdown } = require("../../src/domain/documentation");
const { gamePointsForTotals, teamTournamentPoints } = require("../../src/domain/team-tournaments");
const { CRIT_OPS } = require("../../src/domain/kill-teams");
const pages = defaultPages().map((page) => ({ ...page, ...renderMarkdown(page.markdown), version: 1, updatedAt: "2026-09-07T00:00:00.000Z" }));
const book = (locale, id) => ({ pages: pages.filter((page) => page.locale === locale), page: pages.find((page) => page.locale === locale && page.id === id) });

test("documentation has the same five complete, independently linkable pages in both languages", () => {
  for (const locale of ["ru", "en"]) {
    const data = book(locale);
    assert.deepEqual(data.pages.map((page) => page.id), docs.pageIds);
    const index = docs.render(locale, "", false, data);
    assert.equal((index.match(/class="card panel documentation-card"/g) || []).length, 5);
    for (const page of data.pages) {
      assert.ok(page.title && page.summary && page.markdown && page.headings.length > 0);
      assert.match(index, new RegExp(`href="/#/documentation/${page.id}"`));
      const html = docs.render(locale, page.id, false, book(locale, page.id));
      assert.ok(html.includes(page.title));
      assert.ok(html.includes(`data-documentation-page="${page.id}"`));
      assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
      assert.equal(new Set(page.headings.map((heading) => heading.id)).size, page.headings.length);
      for (const heading of page.headings) assert.ok(html.includes(`id="${heading.id}"`));
    }
  }
});

test("both individual tournament pages explain every supported standings tiebreaker", () => {
  for (const locale of ["ru", "en"]) for (const id of ["swiss-tiebreakers", "elimination-tiebreakers"]) {
    const page = book(locale, id).page;
    for (const name of ["Strength of Schedule", "Buchholz", "Head-to-head", "Total VP", "VP Diff"]) {
      assert.ok(page.html.toLowerCase().includes(name.toLowerCase()), `${locale}/${id}/${name}`);
    }
    for (const criterion of ["Primary bonus", "Crit Op + Tac Op", "APL", "Roll-off"]) assert.ok(page.html.includes(criterion));
  }
});

test("all published MMR examples match the production Elo function", () => {
  assert.equal(ELO_K, 32);
  for (const locale of ["ru", "en"]) {
    const page = book(locale, "mmr").page;
    const rows = page.markdown.split(/\r?\n/).filter((line) => /^\| 1000 \|/.test(line));
    assert.equal(rows.length, 5);
    for (const line of rows) {
      const [a, b, score, delta, nextA, nextB] = line.split("|").slice(1, -1).map(Number);
      const result = calculateElo(a, b, score);
      assert.equal(result.deltaA, delta);
      assert.equal(result.deltaA + result.deltaB, 0);
      assert.equal(a + delta, nextA); assert.equal(b - delta, nextB);
    }
    assert.match(page.markdown, /Math\.round\(32/);
    assert.ok(page.markdown.includes("+15"));
    assert.ok(page.markdown.includes("Unranked"));
  }
});

test("documented WTC points and the nine-mission pool match the implementation", () => {
  assert.deepEqual(gamePointsForTotals(18, 14), { a: 14, b: 6 });
  assert.deepEqual(gamePointsForTotals(12, 12), { a: 10, b: 10 });
  for (const gp of [28, 30, 32]) assert.deepEqual(teamTournamentPoints(gp), { a: 1, b: 1 });
  assert.deepEqual(teamTournamentPoints(27), { a: 0, b: 2 });
  assert.deepEqual(teamTournamentPoints(33), { a: 2, b: 0 });
  for (const locale of ["ru", "en"]) {
    const html = docs.render(locale, "wtc-pairings", false, book(locale, "wtc-pairings"));
    for (const mission of CRIT_OPS) assert.ok(html.includes(mission), mission);
    const source = book(locale, "team-tiebreakers").page.markdown;
    for (let difference = 0; difference <= 10; difference++) {
      const { a, b } = gamePointsForTotals(10 + difference, 10);
      assert.ok(source.includes(`| ${difference === 10 ? "10+" : difference} | ${a} | ${b} |`));
    }
    assert.doesNotMatch(source, /Live values|Промежуточные значения|11 \+ 11 \+ 0/);
  }
});

test("documentation handles missing pages safely and offers guest sign-in", () => {
  assert.match(docs.render("ru", "", true), /href="\/">Войти/);
  assert.doesNotMatch(docs.render("ru", "", false), /href="\/">Войти/);
  const unknown = docs.render("ru", '<img src=x onerror="alert(1)">');
  assert.match(unknown, /Страница не найдена/);
  assert.doesNotMatch(unknown, /onerror|<img/);
  assert.match(docs.render("unknown"), /Documentation/);
});

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function sourceOf(name) {
  const result = appSource.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
}

test("documentation hash routes preserve the page through navigation and reload", () => {
  for (const page of ["", ...docs.pageIds, "unknown-page"]) {
    const read = new Function("tournamentSlugFromLocation", "sharedChallengeTokenFromHash", "hashSegments",
      `${sourceOf("appRouteFromHash")}; return appRouteFromHash;`)(() => "", () => "", () => ["documentation", page]);
    const route = read();
    assert.deepEqual(route, { view: "documentation", documentationPage: page });
    const hash = new Function("state", `${sourceOf("appHashForState")}; return appHashForState;`)(route)();
    assert.equal(hash, `#/documentation${page ? `/${page}` : ""}`);
  }
});

test("documentation loader reuses its request and retries after a failed asset load", async () => {
  const scripts = [];
  const fakeWindow = {};
  const load = new Function("window", "document", "t",
    `let documentationLoadPromise = null; ${sourceOf("loadDocumentation")}; return loadDocumentation;`
  )(fakeWindow, { querySelector: () => ({ src: "http://localhost/theme-boot.js?v=docs-test" }),
    createElement: () => ({ remove() {} }), head: { appendChild: (script) => scripts.push(script) } }, (key) => key);
  const first = load();
  assert.equal(load(), first);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "/documentation.js?v=docs-test");
  scripts[0].onerror();
  await assert.rejects(first, /documentation.loadError/);
  const retry = load();
  assert.equal(scripts.length, 2);
  fakeWindow.TGTV_DOCUMENTATION = docs;
  scripts[1].onload();
  assert.equal(await retry, docs);
});

test("late documentation load cannot replace the page after the reader navigates away", async () => {
  const target = { innerHTML: "", isConnected: true };
  let finish;
  let route = { view: "documentation" };
  const render = new Function("state", "i18n", "document", "t", "appRouteFromHash", "loadDocumentation",
    `let documentationRequestId = 0; ${sourceOf("renderDocumentation")}; return renderDocumentation;`
  )({ me: { id: 1 }, view: "documentation", documentationPage: "mmr" }, { getLocale: () => "ru" },
    { querySelector: (selector) => { assert.equal(selector, "[data-content]"); return target; } }, (key) => key,
    () => route, () => new Promise((resolve) => { finish = resolve; }));
  const pending = render();
  route = { view: "tournaments" };
  target.innerHTML = "Tournament";
  finish(docs);
  await pending;
  assert.equal(target.innerHTML, "Tournament");
});

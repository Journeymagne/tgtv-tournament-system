const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { startApiServer, createClient } = require("../helpers/client");
const { createRouter } = require("../../src/http/router");
const routes = require("../../src/api/routes");
const { loadUserFromRequest } = require("../../src/api/auth");
const { migrate } = require("../../src/db/migrate");
const documentationMigration = require("../../src/db/migrations/018_documentation");
const { defaultPages } = require("../../src/domain/documentation");

let pool, server, admin, player, guest;
test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && /test/.test(target.pathname), "Use an isolated local test database");
  pool = new Pool(require("../helpers/schema").poolOptions);
  await require("../helpers/schema").resetSchemas(pool);
  await migrate(pool);
  const run = async (fn, transaction = false) => {
    const client = await pool.connect();
    try { if (transaction) await client.query("BEGIN"); const result = await fn(client); if (transaction) await client.query("COMMIT"); return result; }
    catch (error) { if (transaction) await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  server = await startApiServer(createRouter(routes, { withClient: (fn) => run(fn), withTransaction: (fn) => run(fn, true), loadUser: loadUserFromRequest }));
  admin = createClient(server.baseUrl); player = createClient(server.baseUrl); guest = createClient(server.baseUrl);
  for (const [client, name] of [[admin, "DocsAdmin"], [player, "DocsPlayer"]]) {
    const response = await client.post("/api/register", { name, password: "docs-test-password", confirmPassword: "docs-test-password", telegramContact: `@${name}` });
    assert.equal(response.status, 201);
  }
  await require("../helpers/access").grantOwner(pool, admin);
});
test.after(async () => { await server?.close(); await pool?.end(); });
test.beforeEach(async () => {
  for (const page of defaultPages()) await pool.query("UPDATE documentation_pages SET title=$3, summary=$4, markdown=$5, version=1 WHERE page_id=$1 AND locale=$2", [page.id, page.locale, page.title, page.summary, page.markdown]);
});
const read = async (client, locale = "ru") => (await client.get(`/api/documentation/${locale}/changelog`)).body.page;

test("guests read every seeded page; only admins may preview or publish", async () => {
  for (const locale of ["ru", "en"]) {
    const response = await guest.get(`/api/documentation/${locale}`);
    assert.equal(response.status, 200); assert.deepEqual(response.body.pages.map(page => page.id), ["changelog", "pairing-instructions", "handouts"]);
    for (const page of response.body.pages) assert.equal((await guest.get(`/api/documentation/${locale}/${page.id}`)).status, 200);
  }
  const page = await read(guest);
  for (const [client, expected] of [[guest, 401], [player, 403]]) {
    assert.equal((await client.patch("/api/admin/documentation/ru/changelog", page)).status, expected);
    assert.equal((await client.post("/api/admin/documentation/preview", { markdown: "## Draft" })).status, expected);
  }
  const before = await read(guest);
  const preview = await admin.post("/api/admin/documentation/preview", { markdown: "## Draft\n\n<script>bad()</script>" });
  assert.equal(preview.status, 200); assert.doesNotMatch(preview.body.html, /<script>/);
  assert.deepEqual(await read(guest), before);
});

test("saving publishes Markdown and metadata, survives reseeding, and leaves the other language unchanged", async () => {
  const old = await read(admin); const english = await read(guest, "en");
  const response = await admin.patch("/api/admin/documentation/ru/changelog", { ...old, title: "Новые правила", summary: "Обновлённое описание", markdown: "## Итоги\n\n**Новый текст**\n\n| VP | GP |\n| --- | --- |\n| 1 | 11 |" });
  assert.equal(response.status, 200); assert.equal(response.body.page.version, 2);
  assert.match(response.body.page.html, /<strong>Новый текст<\/strong>/);
  assert.equal((await read(guest)).title, "Новые правила");
  assert.deepEqual(await read(guest, "en"), english);
  const list = await guest.get("/api/documentation/ru");
  assert.equal(list.body.pages.find((page) => page.id === old.id).summary, "Обновлённое описание");
  const connection = await pool.connect();
  try {
    await connection.query("SET search_path=tournaments,accounts,public");
    await documentationMigration.up(connection);
  } finally {
    await connection.query("SET search_path=" + require("../../src/db/schemas").SEARCH_PATH);
    connection.release();
  }
  assert.equal((await read(guest)).markdown, response.body.page.markdown);
  assert.equal((await pool.query("SELECT updated_by FROM documentation_pages WHERE page_id=$1 AND locale='ru'", [old.id])).rows[0].updated_by, 1);
});

test("archived pages are absent from navigation and unavailable for reading or editing", async () => {
  for (const locale of ["ru", "en"]) {
    for (const id of ["wtc-pairings", "swiss-tiebreakers", "elimination-tiebreakers", "team-tiebreakers", "mmr"]) {
      assert.equal((await guest.get(`/api/documentation/${locale}/${id}`)).status, 404);
      assert.equal((await admin.patch(`/api/admin/documentation/${locale}/${id}`, {
        title: "Archived", summary: "Archived", markdown: "Replacement", version: 1
      })).status, 404);
    }
  }
});

test("Changelog upgrade preserves Handouts and archived edits and is safe to repeat", async () => {
  const migration = require("../../src/db/migrations/081_documentation_changelog");
  const repository = require("../../src/db/repositories/documentation");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Simulate an existing installation with customized pages, before Changelog.
    await client.query("DELETE FROM tournaments.documentation_pages WHERE page_id='changelog'");
    await client.query("UPDATE tournaments.documentation_pages SET markdown='Administrator content', version=9, updated_by=1 WHERE page_id IN ('handouts', 'mmr')");
    const preserved = (await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id IN ('handouts', 'mmr') ORDER BY page_id, locale")).rows;
    await migration.up(client);
    for (const locale of ["ru", "en"]) {
      assert.deepEqual((await repository.list(client, locale)).map(page => page.id), ["changelog", "pairing-instructions", "handouts"]);
      const page = await repository.get(client, locale, "changelog");
      assert.equal(page.markdown, defaultPages().find(item => item.id === "changelog" && item.locale === locale).markdown);
    }
    await client.query("UPDATE tournaments.documentation_pages SET markdown='Reviewed release notes', version=2, updated_by=1 WHERE page_id='changelog' AND locale='ru'");
    const once = (await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows;
    await migration.up(client);
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows, once);
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id IN ('handouts', 'mmr') ORDER BY page_id, locale")).rows, preserved);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("tier list release notes preserve bilingual editorial history and metadata and are idempotent", async () => {
  const migration = require("../../src/db/migrations/088_tierlist_release_notes");
  assert.ok(require("../../src/db/migrate").MIGRATIONS.includes(migration), "The normal migration runner includes the release notes");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE tournaments.documentation_pages SET markdown='Retained administrator content', version=11, updated_by=1 WHERE page_id IN ('handouts', 'mmr')");
    const otherPages = (await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id<>'changelog' ORDER BY page_id, locale")).rows;
    const fixtures = new Map();
    for (const locale of ["ru", "en"]) {
      const newline = locale === "en" ? "\r\n" : "\n";
      const intro = ["# Editor's changelog", "", `Custom ${locale} introduction.`, "", "## Editorial notice", "", "Keep this notice above releases.", "", ""].join(newline);
      const history = ["## 1.5.14 — Reviewed date", "", `Custom ${locale} release correction.`, "", "## 1.4.35 — Earlier release", "", "Older editorial history stays verbatim.", ""].join(newline);
      await client.query(`
        UPDATE tournaments.documentation_pages
        SET markdown=$2, title=$3, summary=$4, category=$5, position=37, version=7, updated_by=1, updated_at='2020-01-02T03:04:05Z'
        WHERE page_id='changelog' AND locale=$1
      `, [locale, intro + history, `Editor title ${locale}`, `Custom summary ${locale}`, `Editor category ${locale}`]);
      const before = (await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id='changelog' AND locale=$1", [locale])).rows[0];
      fixtures.set(locale, { intro, history, before });
    }

    await migration.up(client);
    for (const locale of ["ru", "en"]) {
      const after = (await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id='changelog' AND locale=$1", [locale])).rows[0];
      const { intro, history, before } = fixtures.get(locale);
      const seed = defaultPages().find(page => page.id === "changelog" && page.locale === locale).markdown;
      const start = seed.indexOf("## 1.5.15 —");
      assert.ok(start >= 0, `The ${locale} public seed contains the release`);
      const remaining = seed.slice(start), next = remaining.indexOf("\n## ", 1);
      const notes = remaining.slice(0, next < 0 ? undefined : next).trimEnd().replace(/\r\n/g, "\n");
      assert.equal(after.markdown, intro + notes + "\n\n" + history, "Only the new release block is inserted; original whitespace and editorial text survive");
      assert.equal(after.version, before.version + 1);
      assert.ok(after.updated_at > before.updated_at);
      for (const field of ["page_id", "locale", "title", "summary", "category", "position", "updated_by"]) assert.equal(after[field], before[field], `${locale}/${field}`);
    }
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id<>'changelog' ORDER BY page_id, locale")).rows, otherPages);
    const once = (await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows;
    await migration.up(client);
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows, once, "Repeating the migration leaves content, versions and timestamps unchanged");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("tier list release notes retain an already published editor-written release in either language", async () => {
  const migration = require("../../src/db/migrations/088_tierlist_release_notes");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const locale of ["ru", "en"]) {
      const heading = locale === "en" ? "## v1.5.15 — Editor's release" : "## 1.5.15 — Редакторский выпуск";
      await client.query(`
        UPDATE tournaments.documentation_pages
        SET markdown=$2, summary=$3, version=19, updated_by=1, updated_at='2021-02-03T04:05:06Z'
        WHERE page_id='changelog' AND locale=$1
      `, [locale, `# Custom log\n\n${heading}\n\nReviewed ${locale} release copy.\n\n## 1.5.14 — Old release\n\nKeep this.\n`, `Retained summary ${locale}`]);
    }
    const before = (await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows;
    await migration.up(client);
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows, before);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("tier list release notes seed missing changelogs in both languages without changing other documents", async () => {
  const migration = require("../../src/db/migrations/088_tierlist_release_notes");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM tournaments.documentation_pages WHERE page_id='changelog'");
    const preserved = (await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows;
    await migration.up(client);
    for (const locale of ["ru", "en"]) {
      const page = (await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id='changelog' AND locale=$1", [locale])).rows[0];
      const seed = defaultPages().find(page => page.id === "changelog" && page.locale === locale);
      for (const field of ["title", "summary", "category", "markdown"]) assert.equal(page[field], seed[field], `${locale}/${field}`);
      assert.equal(page.version, 1); assert.equal(page.position, 0); assert.equal(page.updated_by, null);
      assert.match(page.markdown, /^## 1\.5\.15 —/m);
    }
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages WHERE page_id<>'changelog' ORDER BY page_id, locale")).rows, preserved);
    const once = (await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows;
    await migration.up(client);
    assert.deepEqual((await client.query("SELECT * FROM tournaments.documentation_pages ORDER BY page_id, locale")).rows, once);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("simultaneous saves allow one writer and reject the stale revision without losing content", async () => {
  const page = await read(admin);
  const results = await Promise.all(["First edit", "Second edit"].map((markdown) => admin.patch("/api/admin/documentation/ru/changelog", { ...page, markdown })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const winner = results.find((result) => result.status === 200).body.page;
  assert.equal((await read(guest)).markdown, winner.markdown);
  assert.equal((await read(guest)).version, 2);
});

test("invalid documents and unknown page/language cannot be saved", async () => {
  const page = await read(admin);
  for (const invalid of [{ title: " " }, { summary: "" }, { markdown: "" }, { markdown: "a".repeat(100001) }, { title: "x".repeat(161) }, { version: "1" }, { version: 0 }]) {
    assert.equal((await admin.patch("/api/admin/documentation/ru/changelog", { ...page, ...invalid })).status, 400);
  }
  for (const url of ["/api/documentation/fr/mmr", "/api/documentation/ru/unknown"]) assert.equal((await guest.get(url)).status, 404);
  assert.equal((await admin.patch("/api/admin/documentation/ru/unknown", page)).status, 404);
  assert.equal((await read(guest)).version, 1);
});


test("upgrading an existing database seeds pairing guides through the migration runner", async () => {
  await pool.query("DELETE FROM tournaments.documentation_pages WHERE page_id = 'pairing-instructions'");
  await pool.query("DELETE FROM schema_migrations WHERE version = 84");
  const applied = await migrate(pool);
  assert.ok(applied.includes(84));
  for (const locale of ["ru", "en"]) {
    const response = await guest.get(`/api/documentation/${locale}/pairing-instructions`);
    assert.equal(response.status, 200);
    assert.ok(response.body.page.markdown.includes("WTC"));
  }
});

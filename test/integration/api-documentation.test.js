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
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
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
});
test.after(async () => { await server?.close(); await pool?.end(); });
test.beforeEach(async () => {
  for (const page of defaultPages()) await pool.query("UPDATE documentation_pages SET title=$3, summary=$4, markdown=$5, version=1 WHERE page_id=$1 AND locale=$2", [page.id, page.locale, page.title, page.summary, page.markdown]);
});
const read = async (client, locale = "ru") => (await client.get(`/api/documentation/${locale}/team-tiebreakers`)).body.page;

test("guests read every seeded page; only admins may preview or publish", async () => {
  for (const locale of ["ru", "en"]) {
    const response = await guest.get(`/api/documentation/${locale}`);
    assert.equal(response.status, 200); assert.equal(response.body.pages.length, 5);
    for (const page of response.body.pages) assert.equal((await guest.get(`/api/documentation/${locale}/${page.id}`)).status, 200);
  }
  const page = await read(guest);
  for (const [client, expected] of [[guest, 401], [player, 403]]) {
    assert.equal((await client.patch("/api/admin/documentation/ru/team-tiebreakers", page)).status, expected);
    assert.equal((await client.post("/api/admin/documentation/preview", { markdown: "## Draft" })).status, expected);
  }
  const before = await read(guest);
  const preview = await admin.post("/api/admin/documentation/preview", { markdown: "## Draft\n\n<script>bad()</script>" });
  assert.equal(preview.status, 200); assert.doesNotMatch(preview.body.html, /<script>/);
  assert.deepEqual(await read(guest), before);
});

test("saving publishes Markdown and metadata, survives reseeding, and leaves the other language unchanged", async () => {
  const old = await read(admin); const english = await read(guest, "en");
  const response = await admin.patch("/api/admin/documentation/ru/team-tiebreakers", { ...old, title: "Новые правила", summary: "Обновлённое описание", markdown: "## Итоги\n\n**Новый текст**\n\n| VP | GP |\n| --- | --- |\n| 1 | 11 |" });
  assert.equal(response.status, 200); assert.equal(response.body.page.version, 2);
  assert.match(response.body.page.html, /<strong>Новый текст<\/strong>/);
  assert.equal((await read(guest)).title, "Новые правила");
  assert.deepEqual(await read(guest, "en"), english);
  const list = await guest.get("/api/documentation/ru");
  assert.equal(list.body.pages.find((page) => page.id === old.id).summary, "Обновлённое описание");
  const connection = await pool.connect();
  try { await documentationMigration.up(connection); } finally { connection.release(); }
  assert.equal((await read(guest)).markdown, response.body.page.markdown);
  assert.equal((await pool.query("SELECT updated_by FROM documentation_pages WHERE page_id=$1 AND locale='ru'", [old.id])).rows[0].updated_by, 1);
});

test("simultaneous saves allow one writer and reject the stale revision without losing content", async () => {
  const page = await read(admin);
  const results = await Promise.all(["First edit", "Second edit"].map((markdown) => admin.patch("/api/admin/documentation/ru/team-tiebreakers", { ...page, markdown })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const winner = results.find((result) => result.status === 200).body.page;
  assert.equal((await read(guest)).markdown, winner.markdown);
  assert.equal((await read(guest)).version, 2);
});

test("invalid documents and unknown page/language cannot be saved", async () => {
  const page = await read(admin);
  for (const invalid of [{ title: " " }, { summary: "" }, { markdown: "" }, { markdown: "a".repeat(100001) }, { title: "x".repeat(161) }, { version: "1" }, { version: 0 }]) {
    assert.equal((await admin.patch("/api/admin/documentation/ru/team-tiebreakers", { ...page, ...invalid })).status, 400);
  }
  for (const url of ["/api/documentation/fr/mmr", "/api/documentation/ru/unknown"]) assert.equal((await guest.get(url)).status, 404);
  assert.equal((await admin.patch("/api/admin/documentation/ru/unknown", page)).status, 404);
  assert.equal((await read(guest)).version, 1);
});

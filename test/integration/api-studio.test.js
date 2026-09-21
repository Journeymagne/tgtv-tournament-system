const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const { sendStatic } = require("../../src/http/static");
const { loadUserFromRequest } = require("../../src/api/auth");
const routes = require("../../src/api/routes");
const model = require("../../public/studio/model");

let pool, server, origin;
test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(pool);
  const withClient = async fn => { const client = await pool.connect(); try { return await fn(client); } finally { client.release(); } };
  const withTransaction = fn => withClient(async client => {
    await client.query("BEGIN");
    try { const result = await fn(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
  });
  const router = createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest });
  server = http.createServer((req, res) => req.url.startsWith("/api/") ? router(req, res) : sendStatic(req, res));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async () => { await pool.query("TRUNCATE users RESTART IDENTITY CASCADE"); });
test.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });

async function request(path, account, options = {}) {
  const response = await fetch(origin + path, { ...options, headers: {
    "Content-Type": "application/json", ...(account ? { Cookie: account.cookie, "X-Studio-Account": String(account.id), "X-CSRF-Token": account.csrf || "" } : {}),
    ...options.headers
  }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function account(name, login = false) {
  const result = await request(login ? "/api/login" : "/api/register", null, { method: "POST", body: {
    name, password: "test-password-123", confirmPassword: "test-password-123", telegramContact: "@test", registerNickname: name
  } });
  assert.equal(result.status, login ? 200 : 201);
  const user = { id: result.body.user.id, cookie: result.headers.get("set-cookie").split(";")[0] };
  user.csrf = (await request("/api/studio/session", user)).body.csrfToken;
  return user;
}
const save = (user, project, revision = 0, publish = false, headers = {}) => request(
  "/api/studio/drafts/" + project.team.id + (publish ? "/publish" : ""), user,
  { method: publish ? "POST" : "PUT", body: { project, revision }, headers }
);

test("Studio and the library are public; personal drafts and mutations require a session", async () => {
  for (const path of ["/", "/killteam-initiative-calculator.html", "/killteam-activation-tracker.html", "/tournament/", "/studio/"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /data-companion-nav/);
  }
  assert.deepEqual((await request("/api/session")).body, { user: null });
  for (const path of ["session", "drafts", "drafts/example"]) assert.equal((await request("/api/studio/" + path)).status, 401);
  assert.equal((await request("/api/studio/library")).status, 200);
  const project = model.newProject("guest-team", "Guest team");
  assert.equal((await save(null, project)).status, 401);
  assert.equal((await save(null, project, 0, true)).status, 401);
  const anonymousCookie = { cookie: "kt_studio_owner=" + "a".repeat(64), id: 1 };
  assert.equal((await request("/api/studio/drafts", anonymousCookie)).status, 401);
});

test("one login works in both sections and on another device without disclosing private account fields", async () => {
  const alpha = await account("Alpha");
  const identity = (await request("/api/session", alpha)).body.user;
  assert.deepEqual(Object.keys(identity).sort(), ["id", "isAdmin", "name"]);
  assert.equal(identity.id, (await request("/api/me", alpha)).body.user.id);
  const project = model.newProject("shared-device", "My team");
  assert.equal((await save(alpha, project)).status, 200);
  const otherDevice = await account("Alpha", true);
  assert.notEqual(otherDevice.cookie, alpha.cookie);
  assert.equal((await request("/api/studio/drafts/shared-device", otherDevice)).body.project.team.name, "My team");
});

test("drafts are isolated by account, including identical project ids and stale tabs", async () => {
  const alpha = await account("Alpha"), bravo = await account("Bravo");
  const project = model.newProject("same-id", "Alpha secret");
  assert.equal((await save(alpha, project)).status, 200);
  assert.deepEqual((await request("/api/studio/drafts", bravo)).body.teams, []);
  assert.equal((await request("/api/studio/drafts/same-id", bravo)).status, 404);
  assert.equal((await save({ ...bravo, id: alpha.id }, project)).status, 401);
  assert.equal((await request("/api/studio/session", { ...bravo, id: alpha.id })).status, 401);
  project.team.name = "Bravo own team";
  assert.equal((await save(bravo, project)).status, 200);
  assert.equal((await request("/api/studio/drafts/same-id", alpha)).body.project.team.name, "Alpha secret");
});

test("writes verify CSRF, origin and project identity; logout revokes Studio access", async () => {
  const alpha = await account("Alpha"), project = model.newProject("secure-team", "Team");
  assert.equal((await save({ ...alpha, csrf: "wrong" }, project)).status, 403);
  assert.equal((await save(alpha, project, 0, false, { Origin: "https://other.invalid" })).status, 403);
  const malformed = await request("/api/studio/drafts/different-id", alpha, { method: "PUT", body: { project, revision: 0 } });
  assert.equal(malformed.status, 400);
  assert.equal((await save(alpha, project, 0, false, { Origin: origin })).status, 200);
  await request("/api/logout", alpha, { method: "POST" });
  assert.equal((await request("/api/studio/drafts", alpha)).status, 401);
  assert.equal((await request("/api/me", alpha)).body.user, null);
});

test("concurrent saves detect conflicts and the library keeps the last published snapshot", async () => {
  const alpha = await account("Alpha"), bravo = await account("Bravo");
  const project = model.newProject("published-team", "Published name");
  const concurrent = await Promise.all([save(alpha, project), save(alpha, project)]);
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  const published = await save(alpha, project, 1, true);
  assert.equal(published.status, 200);
  const id = published.body.publicationId;
  project.team.name = "Private unpublished changes";
  assert.equal((await save(alpha, project, 2)).status, 200);
  const library = await request("/api/studio/library?q=Published", bravo);
  assert.equal(library.body.total, 1);
  assert.equal(library.body.teams[0].name, "Published name");
  assert.equal((await request("/api/studio/library/" + id, bravo)).body.project.team.name, "Published name");
  assert.equal((await request("/api/studio/library/" + id)).body.project.team.name, "Published name");
  assert.equal((await request("/api/studio/drafts/published-team", bravo)).status, 404);
});

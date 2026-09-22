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
  for (const path of ["/", "/initiative", "/tracker", "/tournament", "/studio"]) {
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

const remove = (user, id, revision, headers = {}) => request('/api/studio/drafts/' + id, user, {
  method: 'DELETE', body: { revision }, headers
});
const rename = (user, id, name, revision, headers = {}) => request('/api/studio/drafts/' + id + '/name', user, {
  method: 'PATCH', body: { name, revision }, headers
});

test('only the owner can rename a team and receives publication editing controls', async () => {
  const alpha = await account('Alpha'), bravo = await account('Bravo'), project = model.newProject('rename-own', 'Before');
  const published = await save(alpha, project, 0, true), id = published.body.publicationId;
  for (const reader of [null, bravo]) {
    const tile = (await request('/api/studio/library', reader)).body.teams[0];
    const detail = (await request('/api/studio/library/' + id, reader)).body;
    for (const value of [tile, detail]) for (const key of ['canRename', 'projectId', 'revision', 'ownerId']) assert.equal(value[key], undefined);
  }
  const tile = (await request('/api/studio/library', alpha)).body.teams[0];
  assert.equal(tile.canRename, true);assert.equal(tile.projectId, project.team.id);assert.equal(tile.revision, 1);
  assert.equal((await rename(null, project.team.id, 'Denied', 1)).status, 401);
  assert.equal((await rename(bravo, project.team.id, 'Denied', 1)).status, 404);
  assert.equal((await rename({ ...alpha, csrf: 'wrong' }, project.team.id, 'Denied', 1)).status, 403);
  assert.equal((await rename({ ...alpha, id: bravo.id }, project.team.id, 'Denied', 1)).status, 401);
  assert.equal((await rename(alpha, project.team.id, 'Denied', 1, { Origin: 'https://other.invalid' })).status, 403);
  for (const name of ['', '  ', null, 7, 'a'.repeat(201), 'New\nname', 'Bad\u0000name']) assert.equal((await rename(alpha, project.team.id, name, 1)).status, 400);
  for (const revision of [undefined, -1, 1.5, '1']) assert.equal((await rename(alpha, project.team.id, 'Valid', revision)).status, 400);
  assert.equal((await remove(alpha, project.team.id, 1)).status, 200);
  assert.equal((await rename(alpha, project.team.id, 'Deleted', 1)).status, 410);
});

test('renaming updates draft and publication titles without publishing private edits', async () => {
  const alpha = await account('Alpha'), project = model.newProject('rename-published', 'Before');
  project.strategicPloys[0].body = 'Public rule';
  const published = await save(alpha, project, 0, true), id = published.body.publicationId;
  const publicSnapshot = (await request('/api/studio/library/' + id)).body.project;
  project.strategicPloys[0].body = 'Private rule';project.team.subtitle = 'Private subtitle';
  await save(alpha, project, 1);
  const renamed = await rename(alpha, project.team.id, '  Новое название <&>  ', 2);
  assert.equal(renamed.status, 200);assert.equal(renamed.body.revision, 3);
  assert.equal(renamed.body.publicationId, id);assert.equal(renamed.body.publishedAt, published.body.publishedAt);
  const draft = (await request('/api/studio/drafts/' + project.team.id, alpha)).body.project;
  const live = (await request('/api/studio/library/' + id)).body.project;
  project.team.name = publicSnapshot.team.name = 'Новое название <&>';
  assert.deepEqual(draft, project);assert.deepEqual(live, publicSnapshot);
  assert.equal((await request('/api/studio/library?q=' + encodeURIComponent('Новое название'))).body.total, 1);
  assert.equal((await request('/api/studio/library?q=Before')).body.total, 0);
});

test('renaming a private draft does not publish it or rename another owner\'s same-id project', async () => {
  const alpha = await account('Alpha'), bravo = await account('Bravo'), project = model.newProject('rename-private', 'Before');
  await save(alpha, project);await save(bravo, project);
  const renamed = await rename(alpha, project.team.id, 'After', 1);
  assert.equal(renamed.status, 200);assert.equal(renamed.body.publicationId, null);
  assert.equal((await request('/api/studio/library')).body.total, 0);
  assert.equal((await request('/api/studio/drafts/' + project.team.id, alpha)).body.project.team.name, 'After');
  assert.equal((await request('/api/studio/drafts/' + project.team.id, bravo)).body.project.team.name, 'Before');
});

test('stale names and concurrent autosaves cannot silently overwrite a rename', async () => {
  const alpha = await account('Alpha'), project = model.newProject('rename-racing', 'Before');
  await save(alpha, project);
  assert.equal((await rename(alpha, project.team.id, 'Stale', 0)).status, 409);
  project.team.name = 'Edited';
  const [saved, renamed] = await Promise.all([save(alpha, project, 1), rename(alpha, project.team.id, 'Renamed', 1)]);
  assert.deepEqual([saved.status, renamed.status].sort(), [200, 409]);
  const latest = (await request('/api/studio/drafts/' + project.team.id, alpha)).body;
  assert.equal(latest.revision, 2);assert.equal(latest.name, saved.status === 200 ? 'Edited' : 'Renamed');
});

test('conflicting edits are preserved as an account-owned PostgreSQL draft without changing the original', async () => {
  const alpha = await account('Alpha'), bravo = await account('Bravo'), project = model.newProject('database-original', 'Original');
  await save(alpha, project);
  project.team.subtitle = 'New server content';await save(alpha, project, 1);
  const local = structuredClone(project);local.team.subtitle = 'Other tab content';
  const recovered = await request('/api/studio/drafts/' + project.team.id, alpha, {
    method: 'PUT', body: { project: local, revision: 1, recoveryId: 'database-recovery' }
  });
  assert.equal(recovered.status, 200);assert.equal(recovered.body.recoveredFrom, project.team.id);
  assert.equal(recovered.body.id, 'database-recovery');assert.equal(recovered.body.original.revision, 2);
  const original = (await request('/api/studio/drafts/' + project.team.id, alpha)).body;
  const copy = (await request('/api/studio/drafts/database-recovery', alpha)).body;
  assert.deepEqual(original.project, project);assert.equal(original.revision, 2);
  assert.equal(copy.project.team.id, 'database-recovery');assert.equal(copy.project.team.subtitle, 'Other tab content');
  assert.equal(copy.publicationId, null);assert.equal(copy.revision, 1);
  assert.equal((await request('/api/studio/drafts', alpha)).body.teams.length, 2);
  assert.equal((await request('/api/studio/drafts/database-recovery', bravo)).status, 404);
});

test('a conflicting publication saves a private recovery draft and retains the published snapshot', async () => {
  const alpha = await account('Alpha'), project = model.newProject('published-recovery', 'Original');
  const published = await save(alpha, project, 0, true);
  project.team.subtitle = 'Private server changes';await save(alpha, project, 1);
  project.team.subtitle = 'Stale publish content';
  const recovered = await request('/api/studio/drafts/published-recovery/publish', alpha, {
    method: 'POST', body: { project, revision: 1, recoveryId: 'private-recovery' }
  });
  assert.equal(recovered.status, 200);assert.equal(recovered.body.publicationId, null);
  assert.equal((await request('/api/studio/library')).body.total, 1);
  assert.equal((await request('/api/studio/library/' + published.body.publicationId)).body.project.team.subtitle, '');
  assert.equal((await request('/api/studio/drafts/private-recovery', alpha)).body.project.team.subtitle, 'Stale publish content');
});

test('recovery cannot overwrite an existing draft, bypass deletion or accept malformed ids', async () => {
  const alpha = await account('Alpha'), project = model.newProject('recovery-validation', 'Original');
  await save(alpha, project);await save(alpha, model.newProject('occupied', 'Keep me'));
  const send = recoveryId => request('/api/studio/drafts/' + project.team.id, alpha, {method:'PUT',body:{project,revision:0,recoveryId}});
  for (const id of [null, 7, {}, '', '../invalid', 'x'.repeat(101), project.team.id]) assert.equal((await send(id)).status, 400);
  assert.equal((await send('occupied')).status, 409);
  assert.equal((await request('/api/studio/drafts/occupied', alpha)).body.name, 'Keep me');
  await remove(alpha, project.team.id, 1);assert.equal((await send('deleted-recovery')).status, 410);
  assert.equal((await request('/api/studio/drafts/deleted-recovery', alpha)).status, 404);
});

test('deletion requires the owner session, CSRF, matching account, origin and revision', async () => {
  const alpha = await account('Alpha'), bravo = await account('Bravo');
  const project = model.newProject('delete-private', 'Private');
  await save(alpha, project);
  assert.equal((await remove(null, project.team.id, 1)).status, 401);
  assert.equal((await remove(bravo, project.team.id, 1)).status, 404);
  assert.equal((await remove({ ...alpha, csrf: 'wrong' }, project.team.id, 1)).status, 403);
  assert.equal((await remove({ ...alpha, id: bravo.id }, project.team.id, 1)).status, 401);
  assert.equal((await remove(alpha, project.team.id, 1, { Origin: 'https://other.invalid' })).status, 403);
  for (const revision of [undefined, -1, 1.5, '1']) assert.equal((await remove(alpha, project.team.id, revision)).status, 400);
  assert.equal((await remove(alpha, project.team.id, 0)).status, 409);
  assert.equal((await request('/api/studio/drafts/delete-private', alpha)).status, 200);
});

test('deletion removes the draft, publication and image payload without touching another owner', async () => {
  const alpha = await account('Alpha'), bravo = await account('Bravo');
  const project = model.newProject('same-id', 'Published');
  const published = await save(alpha, project, 0, true);
  await save(bravo, project);
  assert.equal((await remove(alpha, project.team.id, 1)).status, 200);
  assert.equal((await request('/api/studio/drafts/same-id', alpha)).status, 404);
  assert.equal((await request('/api/studio/library/' + published.body.publicationId)).status, 404);
  assert.equal((await request('/api/studio/library')).body.total, 0);
  const list = await request('/api/studio/drafts', alpha);
  assert.deepEqual(list.body.teams, []);
  assert.deepEqual(list.body.deletedIds, ['same-id']);
  assert.equal((await request('/api/studio/drafts/same-id', bravo)).status, 200);
  const { rows: [row] } = await pool.query('SELECT project,published,publication_id,deleted_at FROM studio_projects WHERE owner_id=$1', [alpha.id]);
  assert.deepEqual(row.project, {});
  assert.equal(row.published, null);
  assert.equal(row.publication_id, null);
  assert(row.deleted_at);
});

test('old saves, delayed first uploads and publication cannot resurrect a deleted team', async () => {
  const alpha = await account('Alpha'), project = model.newProject('deleted', 'Deleted');
  await save(alpha, project);
  assert.equal((await remove(alpha, project.team.id, 1)).status, 200);
  for (const revision of [0, 1, 2]) {
    assert.equal((await save(alpha, project, revision)).status, 410);
    assert.equal((await save(alpha, project, revision, true)).status, 410);
  }
  assert.equal((await remove(alpha, project.team.id, 1)).status, 200);
  const local = model.newProject('local-only', 'Local');
  assert.equal((await remove(alpha, local.team.id, 0)).status, 200);
  assert.equal((await save(alpha, local)).status, 410);
  const copy = model.newProject('new-copy', 'New');
  assert.equal((await save(alpha, copy)).status, 200);
});

test('concurrent save and deletion serialize and never silently delete a newer revision', async () => {
  const alpha = await account('Alpha'), project = model.newProject('racing', 'Before');
  await save(alpha, project);
  project.team.name = 'After';
  const [saved, removed] = await Promise.all([save(alpha, project, 1), remove(alpha, project.team.id, 1)]);
  if (removed.status === 200) {
    assert.equal(saved.status, 410);
    assert.equal((await request('/api/studio/drafts/racing', alpha)).status, 404);
  } else {
    assert.equal(removed.status, 409);
    assert.equal(saved.status, 200);
    assert.equal((await request('/api/studio/drafts/racing', alpha)).body.project.team.name, 'After');
  }
});

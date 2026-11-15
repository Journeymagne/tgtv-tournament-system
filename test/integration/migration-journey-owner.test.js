const test = require("node:test");
const assert = require("node:assert/strict");
const { TEST_DATABASE_URL } = require("../helpers/db");
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool, withClient, withTransaction } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const { loadUserFromRequest } = require("../../src/api/auth");
const { startApiServer } = require("../helpers/client");
const routes = require("../../src/api/routes");

let pool, server;
test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && /test/.test(target.pathname));
  pool = getPool();
  await migrate(pool);
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  // Simulate an installation at 4.9.2, before this one-time data migration.
  await pool.query("DELETE FROM schema_migrations WHERE version=38");
});

async function user(id, { name = "Journey", telegram = "@Journeymagne", admin = false } = {}) {
  await pool.query(`INSERT INTO users
    (id,name,name_key,password_hash,telegram_contact,register_nickname,rating,is_admin)
    VALUES ($1,$2,$3,'preserved-password-hash',$4,$2,1234,$5)`, [id, name, name.toLowerCase(), telegram, admin]);
}
async function owner(id) {
  await pool.query("INSERT INTO platform_ownership(owner_user_id) VALUES ($1)", [id]);
}
async function owners() {
  return (await pool.query("SELECT owner_user_id FROM platform_ownership")).rows.map(row => row.owner_user_id);
}
async function audits() {
  return (await pool.query("SELECT * FROM administrative_audit_events ORDER BY id")).rows;
}
async function me(token) {
  const response = await fetch(server.baseUrl + "/api/me", { headers: { cookie: `sid=${token}` } });
  assert.equal(response.status, 200);
  return (await response.json()).user;
}

test("4.9.3 assigns the verified existing Journey account as the only owner and preserves profile data", async () => {
  await user(2);
  const before = (await pool.query("SELECT * FROM users WHERE id=2")).rows[0];
  assert.deepEqual(await migrate(pool), [38]);
  assert.deepEqual(await owners(), [2]);
  const after = (await pool.query("SELECT * FROM users WHERE id=2")).rows[0];
  assert.deepEqual(after, { ...before, is_admin: true, updated_at: after.updated_at });
  const log = await audits();
  assert.equal(log.length, 1);
  assert.equal(log[0].actor_name, "Release 4.9.3 migration");
  assert.deepEqual(log[0].before, { ownerUserId: null, targetIsAdmin: false });
  assert.deepEqual(log[0].after, { ownerUserId: 2, targetIsAdmin: true });
  assert.equal(log[0].entity_id, 2);
});

test("a previous owner loses only super-admin status and existing sessions see the new privileges", async () => {
  await user(1, { name: "Previous owner", telegram: "@previous", admin: true });
  await user(2, { admin: true });
  await user(3, { name: "Administrator", telegram: "@admin", admin: true });
  await owner(1);
  await pool.query(`INSERT INTO sessions(token,user_id,expires_at)
    VALUES ('previous-session',1,NOW()+INTERVAL '14 days'), ('journey-session',2,NOW()+INTERVAL '14 days')`);
  assert.equal((await me("previous-session")).isSuperAdmin, true);
  assert.equal((await me("journey-session")).isSuperAdmin, false);
  await migrate(pool);
  assert.deepEqual(await owners(), [2]);
  const previous = await me("previous-session"), journey = await me("journey-session");
  assert.equal(previous.isSuperAdmin, false);
  assert.equal(previous.isAdmin, true);
  assert.equal(previous.capabilities.canAssignGlobalRoles, false);
  assert.equal(journey.isSuperAdmin, true);
  assert.equal(journey.capabilities.canAssignGlobalRoles, true);
  assert.deepEqual((await pool.query("SELECT id FROM users WHERE is_admin ORDER BY id")).rows.map(row => row.id), [1, 2, 3]);
  assert.equal((await audits())[0].before.ownerUserId, 1);
});

test("an already assigned Journey owner is not rewritten or logged again", async () => {
  await user(2, { admin: true });
  await owner(2);
  const before = (await pool.query("SELECT * FROM platform_ownership")).rows;
  await migrate(pool);
  assert.deepEqual((await pool.query("SELECT * FROM platform_ownership")).rows, before);
  assert.deepEqual(await audits(), []);
});

for (const [label, id, details] of [
  ["different account ID", 3, {}],
  ["different nickname", 2, { name: "OtherJourney" }],
  ["different Telegram", 2, { telegram: "@someone_else" }],
  ["missing Telegram", 2, { telegram: "" }]
]) test(`owner assignment skips ${label} without changing the current owner`, async () => {
  await user(1, { name: "Previous owner", telegram: "@previous", admin: true });
  await owner(1);
  await user(id, details);
  await migrate(pool);
  assert.deepEqual(await owners(), [1]);
  assert.equal((await pool.query("SELECT is_admin FROM users WHERE id=$1", [id])).rows[0].is_admin, false);
  assert.deepEqual(await audits(), []);
});

test("an empty installation does not grant ownership to a later registration named Journey", async () => {
  await migrate(pool);
  assert.deepEqual(await owners(), []);
  await user(2);
  assert.deepEqual(await migrate(pool), []);
  assert.deepEqual(await owners(), []);
  assert.equal((await pool.query("SELECT is_admin FROM users WHERE id=2")).rows[0].is_admin, false);
});

test("ownership remains tied to the same ID after a profile rename and restart", async () => {
  await user(2);
  await migrate(pool);
  await pool.query("UPDATE users SET name='Renamed', name_key='renamed', telegram_contact='@renamed' WHERE id=2");
  await user(3);
  assert.deepEqual(await migrate(pool), []);
  assert.deepEqual(await owners(), [2]);
  assert.equal((await audits()).length, 1);
  assert.equal((await pool.query("SELECT is_admin FROM users WHERE id=3")).rows[0].is_admin, false);
});

test("a failed audit rolls back owner, user privileges and migration ledger together", async () => {
  await user(1, { name: "Previous owner", telegram: "@previous", admin: true });
  await owner(1);
  await user(2);
  await pool.query(`CREATE FUNCTION reject_owner_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test audit failure'; END $$;
    CREATE TRIGGER reject_owner_audit BEFORE INSERT ON administrative_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_owner_audit()`);
  try {
    await assert.rejects(migrate(pool), /test audit failure/);
    assert.deepEqual(await owners(), [1]);
    assert.equal((await pool.query("SELECT is_admin FROM users WHERE id=2")).rows[0].is_admin, false);
    assert.equal((await pool.query("SELECT 1 FROM schema_migrations WHERE version=38")).rowCount, 0);
    assert.deepEqual(await audits(), []);
  } finally {
    await pool.query("DROP TRIGGER reject_owner_audit ON administrative_audit_events; DROP FUNCTION reject_owner_audit()");
  }
  assert.deepEqual(await migrate(pool), [38]);
  assert.deepEqual(await owners(), [2]);
});

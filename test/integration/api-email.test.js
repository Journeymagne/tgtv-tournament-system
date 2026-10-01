const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { TEST_DATABASE_URL } = require("../helpers/db");
Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: "test", HOST: "127.0.0.1",
  EMAIL_PROVIDER: "local", SITE_URL: "http://127.0.0.1",
  EMAIL_OUTBOX_KEY: crypto.randomBytes(32).toString("hex"),
  RESEND_WEBHOOK_SECRET: "whsec_" + crypto.randomBytes(32).toString("base64")
});
const { getPool, closePool } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { decrypt, hash } = require("../../src/email/security");
const { tick } = require("../../src/email/worker");
const { server } = require("../../server");
const httpFetch = global.fetch;
let pool, origin;
test.before(async () => {
  pool = getPool();
  assert.equal(new URL(TEST_DATABASE_URL).hostname, "127.0.0.1");
  assert.match(new URL(TEST_DATABASE_URL).pathname, /test/);
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await migrate(pool);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  process.env.SITE_URL = origin;
});
test.beforeEach(async () => {
  process.env.EMAIL_PROVIDER = "local";
  global.fetch = httpFetch;
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  await pool.query("TRUNCATE email_rate_limits, email_suppressions, email_webhook_events");
});
test.after(async () => {
  global.fetch = httpFetch;
  await new Promise(resolve => server.close(resolve));
  await closePool();
});
async function request(path, method = "GET", body, cookie) {
  const response = await httpFetch(origin + path, {
    method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
async function signup(name = "EmailOwner", email = "owner@example.com") {
  const result = await request("/api/register", "POST", {
    name, email, password: "old-password-123", confirmPassword: "old-password-123",
    telegramContact: "@email_test", locale: "en"
  });
  assert.equal(result.status, 201);
  return result;
}
async function tokenFor(userId, kind = "verify") {
  const { rows: [job] } = await pool.query(
    "SELECT * FROM email_outbox WHERE user_id=$1 AND kind=$2 AND state='pending' ORDER BY created_at DESC LIMIT 1",
    [userId, kind]);
  assert.ok(job, "Expected a queued email");
  const payload = decrypt(job.payload);
  const token = payload.text.match(/#(?:verify|reset)=([a-f0-9]{64})/)[1];
  return { token, job, payload };
}
async function confirm(user) {
  const { token } = await tokenFor(user.body.user.id);
  assert.equal((await request("/api/auth/email/verify", "POST", { token })).status, 200);
  return token;
}
async function expireBudgets() {
  await pool.query("UPDATE email_rate_limits SET expires_at=NOW()-INTERVAL '1 second'");
}
test("registration stores only a token hash; email stays out of shared session and public profiles", async () => {
  const owner = await signup();
  const { token, job } = await tokenFor(owner.body.user.id);
  assert.ok(!job.payload.includes(token));
  assert.equal(job.token_hash, hash(token));
  const row = (await pool.query("SELECT token_hash FROM email_tokens")).rows[0];
  assert.equal(row.token_hash, hash(token));
  assert.equal(owner.body.user.emailAccount.pendingEmail, "owner@example.com");
  const session = await request("/api/session", "GET", undefined, owner.cookie);
  assert.ok(!JSON.stringify(session.body).includes("owner@example.com"));
  const viewer = await signup("Viewer", "viewer@example.com");
  const profile = await request("/api/users/" + owner.body.user.id, "GET", undefined, viewer.cookie);
  assert.equal(profile.status, 200);
  assert.ok(!JSON.stringify(profile.body).includes("owner@example.com"));
});
test("confirmation is single use and rejects expired tokens", async () => {
  const owner = await signup();
  const token = await confirm(owner);
  assert.equal((await request("/api/auth/email/verify", "POST", { token })).status, 400);
  const status = await request("/api/auth/email", "GET", undefined, owner.cookie);
  assert.equal(status.body.email, "owner@example.com");
  const second = await signup("Expired", "expired@example.com");
  const expired = await tokenFor(second.body.user.id);
  await pool.query("UPDATE email_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [hash(expired.token)]);
  assert.equal((await request("/api/auth/email/verify", "POST", { token: expired.token })).status, 400);
});
test("password recovery gives a generic response, revokes sessions, and rejects old passwords and replay", async () => {
  const owner = await signup();
  await confirm(owner);
  await expireBudgets();
  const found = await request("/api/auth/password/forgot", "POST", { email: "owner@example.com" });
  const absent = await request("/api/auth/password/forgot", "POST", { email: "absent@example.com" });
  assert.equal(found.status, 202);
  assert.equal(absent.status, 202);
  assert.deepEqual(found.body, absent.body);
  const { token } = await tokenFor(owner.body.user.id, "reset");
  const body = { token, password: "new-password-456", confirmPassword: "new-password-456" };
  assert.equal((await request("/api/auth/password/reset", "POST", body)).status, 200);
  assert.equal((await request("/api/me", "GET", undefined, owner.cookie)).body.user, null);
  assert.equal((await request("/api/login", "POST", { name: "EmailOwner", password: "old-password-123" })).status, 401);
  assert.equal((await request("/api/login", "POST", { name: "EmailOwner", password: body.password })).status, 200);
  assert.equal((await request("/api/auth/password/reset", "POST", body)).status, 400);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM email_outbox WHERE kind='password_changed'")).rows[0].count, 1);
});
test("pending email change preserves the verified address until confirmation and then ends sessions", async () => {
  const owner = await signup();
  await confirm(owner);
  const changed = await request("/api/auth/email", "POST",
    { email: "new@example.com", currentPassword: "old-password-123" }, owner.cookie);
  assert.equal(changed.status, 202);
  const before = await request("/api/auth/email", "GET", undefined, owner.cookie);
  assert.equal(before.body.email, "owner@example.com");
  assert.equal(before.body.pendingEmail, "new@example.com");
  await confirm(owner);
  assert.equal((await request("/api/me", "GET", undefined, owner.cookie)).body.user, null);
  const row = (await pool.query("SELECT email, pending_email FROM user_email_accounts")).rows[0];
  assert.equal(row.email, "new@example.com");
  assert.equal(row.pending_email, null);
});
test("recipient throttling preserves the current link; a later resend invalidates it", async () => {
  const owner = await signup();
  const first = await tokenFor(owner.body.user.id);
  assert.equal((await request("/api/auth/email/resend", "POST", {}, owner.cookie)).status, 202);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM email_tokens")).rows[0].count, 1);
  await expireBudgets();
  await request("/api/auth/email/resend", "POST", {}, owner.cookie);
  const next = await tokenFor(owner.body.user.id);
  assert.notEqual(first.token, next.token);
  assert.equal((await request("/api/auth/email/verify", "POST", { token: first.token })).status, 400);
  assert.equal((await request("/api/auth/email/verify", "POST", { token: next.token })).status, 200);
});
test("failed password checks still spend the request limit; foreign origins are rejected", async () => {
  const owner = await signup();
  assert.equal((await request("/api/auth/email", "POST",
    { email: "wrong@example.com", currentPassword: "wrong" }, owner.cookie)).status, 401);
  const budgets = await pool.query("SELECT hits FROM email_rate_limits WHERE key=$1", [hash("ip:127.0.0.1")]);
  assert.ok(budgets.rows[0].hits >= 2);
  const foreign = await httpFetch(origin + "/api/auth/password/forgot", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://foreign.example" },
    body: JSON.stringify({ email: "owner@example.com" })
  });
  assert.equal(foreign.status, 403);
});
test("signed webhooks deduplicate events and suppress queued delivery after a bounce", async () => {
  const owner = await signup();
  const { job } = await tokenFor(owner.body.user.id);
  const raw = JSON.stringify({ type: "email.bounced", created_at: new Date().toISOString(),
    data: { email_id: "provider-" + job.id, to: ["owner@example.com"] } });
  const timestamp = String(Math.floor(Date.now() / 1000)), id = "evt-test-bounce";
  const signature = crypto.createHmac("sha256", Buffer.from(process.env.RESEND_WEBHOOK_SECRET.slice(6), "base64"))
    .update(id + "." + timestamp + ".").update(raw).digest("base64");
  assert.equal((await request("/api/email/webhook", "POST", JSON.parse(raw))).status, 401);
  for (let i = 0; i < 2; i++) {
    const response = await httpFetch(origin + "/api/email/webhook", { method: "POST", body: raw,
      headers: { "Content-Type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1," + signature } });
    assert.equal(response.status, 200);
  }
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM email_webhook_events")).rows[0].count, 1);
  await tick();
  const state = (await pool.query("SELECT state,payload FROM email_outbox WHERE id=$1", [job.id])).rows[0];
  assert.deepEqual(state, { state: "cancelled", payload: null });
});
test("provider retries preserve idempotency and clear encrypted payload after acceptance", async () => {
  const owner = await signup();
  const { job } = await tokenFor(owner.body.user.id);
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-key-no-network";
  const calls = [];
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    calls.push(options);
    return calls.length === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ id: "test-provider-id" }) };
  };
  process.env.EMAIL_FROM = "KT Companion <account@auth.example.test>";
  try {
    await tick();
    assert.equal((await pool.query("SELECT state FROM email_outbox WHERE id=$1", [job.id])).rows[0].state, "pending");
    await pool.query("UPDATE email_outbox SET next_attempt_at=NOW() WHERE id=$1", [job.id]);
    await tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
    assert.equal(calls[0].body, calls[1].body);
    assert.deepEqual((await pool.query("SELECT state,payload,attempts FROM email_outbox WHERE id=$1", [job.id])).rows[0],
      { state: "sent", payload: null, attempts: 2 });
  } finally { global.fetch = httpFetch; process.env.EMAIL_PROVIDER = "local"; }
});

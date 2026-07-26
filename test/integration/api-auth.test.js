const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const auth = require("../../src/api/auth");
const users = require("../../src/db/repositories/users");
const { HttpError } = require("../../src/http/io");

let pool;
let client;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
});

test.afterEach(() => {
  client.release();
});

function body(name, overrides = {}) {
  return {
    name,
    password: "password123",
    confirmPassword: "password123",
    telegramContact: `@${name.toLowerCase()}`,
    registerNickname: name,
    ...overrides
  };
}

function requestWithCookie(token) {
  return { headers: { cookie: `sid=${token}` } };
}

// Mirrors withTransaction in src/db/pool.js: register/setup-admin no longer manage
// their own transaction (the router does, via tx: true routes), so any test that
// depends on their advisory-lock serialization has to supply the ambient transaction
// itself — otherwise pg_advisory_xact_lock takes and releases within its own
// single-statement implicit transaction and never actually serializes anything.
async function withTx(client, fn) {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

test("регистрация возвращает 201 и ставит cookie", async () => {
  const result = await auth.register({ client, body: body("Alpha") });

  assert.equal(result.status, 201);
  assert.equal(result.body.user.name, "Alpha");
  assert.equal(result.body.user.isAdmin, true);
  assert.ok(result.headers["Set-Cookie"].startsWith("sid="));
  assert.ok(result.headers["Set-Cookie"].includes("HttpOnly"));
  assert.ok(result.headers["Set-Cookie"].includes("SameSite=Lax"));
});

test("хеш пароля не попадает в ответ", async () => {
  const result = await auth.register({ client, body: body("Alpha") });
  assert.ok(!JSON.stringify(result.body).includes("passwordHash"));
});

test("второй пользователь администратором не становится", async () => {
  await auth.register({ client, body: body("Alpha") });
  const second = await auth.register({ client, body: body("Bravo") });
  assert.equal(second.body.user.isAdmin, false);
});

test("занятое имя отклоняется с 409", async () => {
  await auth.register({ client, body: body("Alpha") });
  await assert.rejects(
    () => auth.register({ client, body: body("alpha") }),
    (err) => err instanceof HttpError && err.status === 409
  );
});

test("короткий пароль и несовпадение отклоняются", async () => {
  await assert.rejects(
    () => auth.register({ client, body: body("Alpha", { password: "12345", confirmPassword: "12345" }) }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => auth.register({ client, body: body("Alpha", { confirmPassword: "other12345" }) }),
    (err) => err.status === 400
  );
});

test("Telegram обязателен", async () => {
  await assert.rejects(
    () => auth.register({ client, body: body("Alpha", { telegramContact: "" }) }),
    (err) => err.status === 400
  );
});

test("setup-admin требует пароль от 8 символов и работает только пока админов нет", async () => {
  await assert.rejects(
    () => auth.setupAdmin({ client, body: body("Root", { password: "1234567", confirmPassword: "1234567" }) }),
    (err) => err.status === 400
  );

  const created = await auth.setupAdmin({
    client,
    body: body("Root", { password: "password1234", confirmPassword: "password1234" })
  });
  assert.equal(created.body.user.isAdmin, true);

  await assert.rejects(
    () => auth.setupAdmin({ client, body: body("Second", { password: "password1234", confirmPassword: "password1234" }) }),
    (err) => err.status === 409
  );
});

test("вход по верному паролю выдаёт сессию", async () => {
  await auth.register({ client, body: body("Alpha") });
  const result = await auth.login({ client, body: { name: "alpha", password: "password123" } });

  assert.equal(result.status, 200);
  assert.equal(result.body.user.name, "Alpha");
  assert.ok(result.headers["Set-Cookie"].startsWith("sid="));
});

test("неверный пароль и неизвестное имя дают один и тот же 401", async () => {
  await auth.register({ client, body: body("Alpha") });

  const wrongPassword = await auth
    .login({ client, body: { name: "Alpha", password: "nope" } })
    .catch((err) => err);
  const unknownName = await auth
    .login({ client, body: { name: "Ghost", password: "nope" } })
    .catch((err) => err);

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownName.status, 401);
  assert.equal(wrongPassword.message, unknownName.message);
});

test("loadUserFromRequest узнаёт пользователя по cookie", async () => {
  const registered = await auth.register({ client, body: body("Alpha") });
  const token = /sid=([^;]+)/.exec(registered.headers["Set-Cookie"])[1];

  const loaded = await auth.loadUserFromRequest(client, requestWithCookie(token));
  assert.equal(loaded.name, "Alpha");

  assert.equal(await auth.loadUserFromRequest(client, { headers: {} }), null);
  assert.equal(await auth.loadUserFromRequest(client, requestWithCookie("bogus")), null);
});

test("logout гасит сессию и обнуляет cookie", async () => {
  const registered = await auth.register({ client, body: body("Alpha") });
  const token = /sid=([^;]+)/.exec(registered.headers["Set-Cookie"])[1];

  const result = await auth.logout({ client, req: requestWithCookie(token) });
  assert.equal(result.body.ok, true);
  assert.ok(result.headers["Set-Cookie"].includes("Max-Age=0"));
  assert.equal(await auth.loadUserFromRequest(client, requestWithCookie(token)), null);
});

test("me без сессии сообщает только о наличии администратора", async () => {
  const empty = await auth.me({ client, user: null });
  assert.equal(empty.user, null);
  assert.equal(empty.hasAdmin, false);

  await auth.register({ client, body: body("Alpha") });
  const withAdmin = await auth.me({ client, user: null });
  assert.equal(withAdmin.hasAdmin, true);
});

test("updateMe меняет профиль и требует текущий пароль для смены пароля", async () => {
  await auth.register({ client, body: body("Alpha") });
  const user = await users.findByNameKey(client, "alpha");

  const renamed = await auth.updateMe({ client, user, body: { name: "Alpha Two" } });
  assert.equal(renamed.user.name, "Alpha Two");

  const fresh = await users.findById(client, user.id);
  await assert.rejects(
    () => auth.updateMe({ client, user: fresh, body: { currentPassword: "wrong", newPassword: "brandnew1" } }),
    (err) => err.status === 401
  );

  await auth.updateMe({
    client,
    user: fresh,
    body: { currentPassword: "password123", newPassword: "brandnew1" }
  });
  const after = await users.findById(client, user.id);
  const { verifyPassword } = require("../../src/domain/passwords");
  assert.equal(await verifyPassword("brandnew1", after.passwordHash), true);
});

test("updateMe не меняет профиль при неверном currentPassword в том же запросе", async () => {
  await auth.register({ client, body: body("Alpha") });
  const user = await users.findByNameKey(client, "alpha");

  await assert.rejects(
    () =>
      auth.updateMe({
        client,
        user,
        body: { name: "Alpha Renamed", currentPassword: "wrong", newPassword: "brandnew1" }
      }),
    (err) => err.status === 401
  );

  const fresh = await users.findById(client, user.id);
  assert.equal(fresh.name, "Alpha");
});

test("конкурентная первая регистрация не создаёт двух администраторов", async () => {
  const clientA = await pool.connect();
  const clientB = await pool.connect();
  try {
    const [alpha, bravo] = await Promise.all([
      withTx(clientA, () => auth.register({ client: clientA, body: body("Racer1") })),
      withTx(clientB, () => auth.register({ client: clientB, body: body("Racer2") }))
    ]);

    const admins = [alpha.body.user.isAdmin, bravo.body.user.isAdmin].filter(Boolean);
    assert.equal(admins.length, 1);
  } finally {
    clientA.release();
    clientB.release();
  }
});

test("updateMe отклоняет занятое имя", async () => {
  await auth.register({ client, body: body("Alpha") });
  await auth.register({ client, body: body("Bravo") });
  const alpha = await users.findByNameKey(client, "alpha");

  await assert.rejects(
    () => auth.updateMe({ client, user: alpha, body: { name: "Bravo" } }),
    (err) => err.status === 409
  );
});

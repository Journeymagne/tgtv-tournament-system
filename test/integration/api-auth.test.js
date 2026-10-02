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
  assert.equal(result.body.user.isAdmin, false);
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

test("setup-admin отключён: владелец назначается локальной командой", async () => {
  await assert.rejects(() => auth.setupAdmin({client,body:body("Root")}), err=>err.status===410);
  assert.equal(await users.hasAdmin(client), false);
});

test("вход по никнейму без учёта регистра и пробелов выдаёт сессию", async () => {
  await auth.register({ client, body: body("Alpha") });
  const result = await auth.login({ client, body: { name: "  aLpHa  ", password: "password123" } });

  assert.equal(result.status, 200);
  assert.equal(result.body.user.name, "Alpha");
  assert.ok(result.headers["Set-Cookie"].startsWith("sid="));
});

test("вход по подтверждённой почте выдаёт сессию того же аккаунта", async () => {
  const registered = await auth.register({ client, body: body("Alpha") });
  await client.query(
    "INSERT INTO user_email_accounts(user_id,email,verified_at) VALUES($1,$2,NOW())",
    [registered.body.user.id, "long.nickname.contact@example.com"]
  );

  const result = await auth.login({ client, body: {
    name: "  Long.Nickname.Contact@EXAMPLE.COM  ", password: "password123"
  } });
  assert.equal(result.status, 200);
  assert.equal(result.body.user.id, registered.body.user.id);
  const token = /sid=([^;]+)/.exec(result.headers["Set-Cookie"])[1];
  const user = await auth.loadUserFromRequest(client, requestWithCookie(token));
  assert.equal(user.id, registered.body.user.id);
});

test("неподтверждённый чужой адрес не меняет владельца входа по почте", async () => {
  const alpha = await auth.register({ client, body: body("Alpha") });
  const bravo = await auth.register({ client, body: body("Bravo", {
    password: "otherPassword123", confirmPassword: "otherPassword123"
  }) });
  await client.query(
    "INSERT INTO user_email_accounts(user_id,email,verified_at) VALUES($1,$2,NOW())",
    [alpha.body.user.id, "shared@example.com"]
  );
  await client.query(
    "INSERT INTO user_email_accounts(user_id,pending_email) VALUES($1,$2)",
    [bravo.body.user.id, "shared@example.com"]
  );

  const result = await auth.login({ client, body: {
    name: "shared@example.com", password: "password123"
  } });
  assert.equal(result.body.user.id, alpha.body.user.id);
  await assert.rejects(() => auth.login({ client, body: {
    name: "shared@example.com", password: "otherPassword123"
  } }), err => err.status === 401);
});

test("ожидающая смена почты сохраняет старый адрес, подтверждение заменяет его", async () => {
  const registered = await auth.register({ client, body: body("Alpha") });
  await client.query(
    "INSERT INTO user_email_accounts(user_id,email,verified_at,pending_email) VALUES($1,$2,NOW(),$3)",
    [registered.body.user.id, "old@example.com", "new@example.com"]
  );
  const login = name => auth.login({ client, body: { name, password: "password123" } });
  assert.equal((await login("old@example.com")).body.user.id, registered.body.user.id);
  const pendingError = await login("new@example.com").catch(err => err);
  const missingError = await login("missing@example.com").catch(err => err);
  const malformedError = await login("invalid@").catch(err => err);
  for (const error of [pendingError, missingError, malformedError]) {
    assert.equal(error.status, 401);
    assert.equal(error.message, "Invalid name or password");
  }

  await client.query(
    "UPDATE user_email_accounts SET email=pending_email,pending_email=NULL WHERE user_id=$1",
    [registered.body.user.id]
  );
  await assert.rejects(() => login("old@example.com"), err => err.status === 401);
  assert.equal((await login("new@example.com")).body.user.id, registered.body.user.id);
  assert.equal((await login("Alpha")).body.user.id, registered.body.user.id);
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
  assert.equal(withAdmin.hasAdmin, false);
  const first = await users.findByNameKey(client, "alpha");
  await require("../../src/db/repositories/access").initializeOwner(client, first.id);
  assert.equal((await auth.me({client,user:null})).hasAdmin, true);
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
    assert.equal(admins.length, 0);
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

test("MEDIUM 1: гонка при записи имени (23505) отображается как 409, а не 500", async () => {
  await auth.register({ client, body: body("Alice") });
  await auth.register({ client, body: body("Bob") });
  const alice = await users.findByNameKey(client, "alice");
  const bob = await users.findByNameKey(client, "bob");

  const clientA = await pool.connect();
  const clientB = await pool.connect();
  try {
    await clientA.query("BEGIN");
    await clientB.query("BEGIN");

    // clientA claims "Charlie" for Alice inside its own OPEN (uncommitted)
    // transaction -- exactly the TOCTOU window an unlocked
    // isNameTaken-then-write leaves open for a concurrent request.
    await users.updateProfile(clientA, alice.id, { name: "Charlie" });

    // clientB tries to write the same name for Bob via the fixed helper
    // directly (bypassing isNameTaken, whose own outcome would otherwise
    // depend on real timing here). Its UPDATE blocks on clientA's
    // uncommitted unique-index entry until clientA resolves.
    const promiseB = auth.applyProfilePatch(clientB, bob.id, { name: "Charlie" });

    await clientA.query("COMMIT");

    await assert.rejects(
      promiseB,
      (err) => err.status === 409 && err.message === "This name is already taken"
    );
  } finally {
    await clientA.query("ROLLBACK").catch(() => {});
    await clientB.query("ROLLBACK").catch(() => {});
    clientA.release();
    clientB.release();
  }
});

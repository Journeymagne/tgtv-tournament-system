const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const users = require("../../src/db/repositories/users");
const sessions = require("../../src/db/repositories/sessions");

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

function newUser(name, overrides = {}) {
  return {
    name,
    passwordHash: "salt:hash",
    avatarData: null,
    registerNickname: name,
    telegramContact: `@${name.toLowerCase()}`,
    rating: 1000,
    isAdmin: false,
    ...overrides
  };
}

test("insert выдаёт идентификатор через RETURNING", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  assert.ok(Number.isInteger(created.id));
  assert.equal(created.name, "Alpha");
  assert.equal(created.rating, 1000);
  assert.deepEqual(created.challengeCredits, []);
});

test("последовательные вставки получают разные идентификаторы", async () => {
  const first = await users.insert(client, newUser("Alpha"));
  const second = await users.insert(client, newUser("Bravo"));
  assert.notEqual(first.id, second.id);
});

test("параллельные вставки не конфликтуют по идентификатору", async () => {
  const names = ["A1", "B2", "C3", "D4", "E5"];
  const created = await Promise.all(
    names.map(async (name) => {
      const own = await pool.connect();
      try {
        return await users.insert(own, newUser(name));
      } finally {
        own.release();
      }
    })
  );
  const ids = created.map((user) => user.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("findByNameKey ищет без учёта регистра", async () => {
  await users.insert(client, newUser("Alpha"));
  const found = await users.findByNameKey(client, "alpha");
  assert.equal(found.name, "Alpha");
  assert.equal(await users.findByNameKey(client, "missing"), null);
});

test("isNameTaken умеет исключать самого пользователя", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  assert.equal(await users.isNameTaken(client, "alpha"), true);
  assert.equal(await users.isNameTaken(client, "alpha", created.id), false);
});

test("addRating меняет рейтинг относительно текущего", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await users.addRating(client, created.id, 16);
  await users.addRating(client, created.id, -4);
  assert.equal((await users.findById(client, created.id)).rating, 1012);
});

test("updateProfile меняет только переданные поля", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await users.updateProfile(client, created.id, { telegramContact: "@new" });
  const updated = await users.findById(client, created.id);

  assert.equal(updated.telegramContact, "@new");
  assert.equal(updated.name, "Alpha");
  assert.equal(updated.registerNickname, "Alpha");
  assert.ok(updated.updatedAt);
});

test("appendChallengeCredit добавляет запись, не затирая прежние", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await users.appendChallengeCredit(client, created.id, { team: "Kasrkin", action: "credit" });
  await users.appendChallengeCredit(client, created.id, { team: "Ratlings", action: "credit" });

  const updated = await users.findById(client, created.id);
  assert.equal(updated.challengeCredits.length, 2);
  assert.equal(updated.challengeCredits[1].team, "Ratlings");
});

test("listLeaderboard сортирует по рейтингу и не отдаёт контакты", async () => {
  await users.insert(client, newUser("Alpha", { rating: 900 }));
  await users.insert(client, newUser("Bravo", { rating: 1100 }));

  const list = await users.listLeaderboard(client);
  assert.deepEqual(list.map((user) => user.name), ["Bravo", "Alpha"]);
  assert.equal("telegramContact" in list[0], false);
  assert.equal("passwordHash" in list[0], false);
});

test("search ищет по имени, нику и телеграму, исключая себя", async () => {
  const alpha = await users.insert(client, newUser("Alpha"));
  await users.insert(client, newUser("Bravo", { telegramContact: "@findme" }));

  const byName = await users.search(client, { q: "bra", excludeId: alpha.id, limit: 10 });
  assert.deepEqual(byName.map((user) => user.name), ["Bravo"]);

  const byTelegram = await users.search(client, { q: "findme", excludeId: alpha.id, limit: 10 });
  assert.deepEqual(byTelegram.map((user) => user.name), ["Bravo"]);

  const all = await users.search(client, { q: "", excludeId: alpha.id, limit: 10 });
  assert.equal(all.some((user) => user.id === alpha.id), false);
});

test("hasAdmin и countAdmins считают администраторов", async () => {
  assert.equal(await users.hasAdmin(client), false);
  await users.insert(client, newUser("Alpha", { isAdmin: true }));
  assert.equal(await users.hasAdmin(client), true);
  assert.equal(await users.countAdmins(client), 1);
});

test("remove удаляет пользователя и его сессии", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "token-1",
    userId: created.id,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  });

  await users.remove(client, created.id);
  assert.equal(await users.findById(client, created.id), null);
  assert.equal(await sessions.findActiveUser(client, "token-1"), null);
});

test("findActiveUser возвращает пользователя по действующему токену", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "token-live",
    userId: created.id,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  });

  const found = await sessions.findActiveUser(client, "token-live");
  assert.equal(found.id, created.id);
  assert.equal(found.passwordHash, "salt:hash");
});

test("findActiveUser не возвращает пользователя по истёкшему токену", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "token-dead",
    userId: created.id,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  });

  assert.equal(await sessions.findActiveUser(client, "token-dead"), null);
});

test("deleteExpired убирает только просроченные сессии", async () => {
  const created = await users.insert(client, newUser("Alpha"));
  await sessions.create(client, {
    token: "live",
    userId: created.id,
    expiresAt: new Date(Date.now() + 60000).toISOString()
  });
  await sessions.create(client, {
    token: "dead",
    userId: created.id,
    expiresAt: new Date(Date.now() - 1000).toISOString()
  });

  await sessions.deleteExpired(client);
  assert.ok(await sessions.findActiveUser(client, "live"));
  const { rows } = await client.query("SELECT token FROM sessions");
  assert.deepEqual(rows.map((row) => row.token), ["live"]);
});

test("findByIds читает пачкой, пропускает лишние и терпит пустой список", async () => {
  const alpha = await users.insert(client, newUser("Alpha"));
  const bravo = await users.insert(client, newUser("Bravo"));

  const found = await users.findByIds(client, [bravo.id, alpha.id, 9999]);
  assert.deepEqual(found.map((user) => user.id), [alpha.id, bravo.id]);
  assert.deepEqual(await users.findByIds(client, []), []);
});

test("lockByIds возвращает строки в порядке идентификаторов", async () => {
  const alpha = await users.insert(client, newUser("Alpha"));
  const bravo = await users.insert(client, newUser("Bravo"));

  await client.query("BEGIN");
  const locked = await users.lockByIds(client, [bravo.id, alpha.id]);
  await client.query("COMMIT");

  assert.deepEqual(locked.map((user) => user.id), [alpha.id, bravo.id]);
});

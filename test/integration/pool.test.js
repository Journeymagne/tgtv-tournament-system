const test = require("node:test");
const assert = require("node:assert/strict");

const { TEST_DATABASE_URL } = require("../helpers/db");

const { getPool, closePool, withClient, withTransaction } = require("../../src/db/pool");

const TABLE = "pool_test_scratch";

function poolStats() {
  const pool = getPool();
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
}

test.before(async () => {
  getPool(TEST_DATABASE_URL);
  await withClient((client) =>
    client.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id SERIAL PRIMARY KEY, label TEXT NOT NULL)`)
  );
});

test.after(async () => {
  await withClient((client) => client.query(`DROP TABLE IF EXISTS ${TABLE}`));
  await closePool();
});

test.beforeEach(async () => {
  await withClient((client) => client.query(`TRUNCATE ${TABLE} RESTART IDENTITY`));
});

test("withTransaction фиксирует изменения при успешном завершении", async () => {
  await withTransaction(async (client) => {
    await client.query(`INSERT INTO ${TABLE} (label) VALUES ($1)`, ["committed"]);
  });

  const { rows } = await withClient((client) => client.query(`SELECT label FROM ${TABLE}`));
  assert.deepEqual(rows.map((row) => row.label), ["committed"]);
});

test("withTransaction откатывает изменения при исключении и пробрасывает исходную ошибку", async () => {
  const boom = new Error("boom");

  await assert.rejects(
    withTransaction(async (client) => {
      await client.query(`INSERT INTO ${TABLE} (label) VALUES ($1)`, ["rolled-back"]);
      throw boom;
    }),
    (err) => err === boom
  );

  const { rows } = await withClient((client) => client.query(`SELECT label FROM ${TABLE}`));
  assert.deepEqual(rows, []);
});

test("withTransaction не удерживает клиента в пуле после успеха", async () => {
  const before = poolStats();

  await withTransaction(async (client) => {
    await client.query("SELECT 1");
  });

  const after = poolStats();
  assert.equal(after.total, before.total, "число клиентов пула не должно расти");
  assert.equal(after.idle, before.idle, "клиент должен вернуться в простаивающие");
  assert.equal(after.waiting, 0);
});

test("withTransaction не удерживает клиента в пуле после ошибки", async () => {
  const before = poolStats();

  await assert.rejects(
    withTransaction(async () => {
      throw new Error("boom");
    })
  );

  const after = poolStats();
  assert.equal(after.total, before.total, "число клиентов пула не должно расти");
  assert.equal(after.idle, before.idle, "клиент должен вернуться в простаивающие");
  assert.equal(after.waiting, 0);
});

test("withClient освобождает клиента при успешном завершении", async () => {
  const before = poolStats();

  await withClient(async (client) => {
    await client.query("SELECT 1");
  });

  const after = poolStats();
  assert.equal(after.total, before.total);
  assert.equal(after.idle, before.idle);
});

test("withClient освобождает клиента при исключении", async () => {
  const before = poolStats();

  await assert.rejects(
    withClient(async () => {
      throw new Error("boom");
    })
  );

  const after = poolStats();
  assert.equal(after.total, before.total);
  assert.equal(after.idle, before.idle);
});

test("пул остаётся работоспособным после серии успехов и ошибок подряд", async () => {
  const before = poolStats();

  for (let i = 0; i < 5; i += 1) {
    await assert.rejects(
      withTransaction(async (client) => {
        await client.query(`INSERT INTO ${TABLE} (label) VALUES ($1)`, [`iter-${i}`]);
        throw new Error(`boom-${i}`);
      })
    );
  }

  const after = poolStats();
  assert.equal(after.total, before.total, "повторные ошибки не должны накапливать клиентов");
  assert.equal(after.idle, before.idle);

  const { rows } = await withClient((client) => client.query(`SELECT count(*)::int AS count FROM ${TABLE}`));
  assert.equal(rows[0].count, 0);
});

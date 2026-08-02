const test = require("node:test");
const assert = require("node:assert/strict");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { captureStream } = require("../helpers/capture-stream");

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

test("Blocker 2: пул задаёт connectionTimeoutMillis, чтобы исчерпание пула отдавало ошибку, а не зависало навсегда", () => {
  assert.equal(getPool().options.connectionTimeoutMillis, 5000);
});

test("HIGH 3: ошибка простаивающего клиента пула логируется, а не роняет процесс", () => {
  const pool = getPool();
  const stderr = captureStream(process.stderr);
  try {
    // With no listener, EventEmitter's default behaviour for the special
    // "error" event is to throw synchronously right here -- exactly what
    // crashed the pm2-managed process on a transient Postgres blip pre-fix.
    assert.doesNotThrow(() => pool.emit("error", new Error("idle client boom")));
  } finally {
    stderr.restore();
  }
  assert.equal(stderr.calls.length, 1);
  assert.ok(stderr.calls[0].includes("idle client boom"));
});

test("HIGH 2: если ROLLBACK тоже падает, наружу пробрасывается исходная ошибка, а не ошибка отката", async () => {
  const pool = getPool();
  const realConnect = pool.connect.bind(pool);
  const realClient = await realConnect();
  const originalQuery = realClient.query.bind(realClient);
  let rollbackAttempted = false;

  // Simulate "connection dropped, failover" (the scenario in the finding):
  // BEGIN/handler queries go through normally, but ROLLBACK itself fails.
  realClient.query = (text, ...rest) => {
    if (typeof text === "string" && text.startsWith("ROLLBACK")) {
      rollbackAttempted = true;
      return Promise.reject(new Error("simulated connection drop during rollback"));
    }
    return originalQuery(text, ...rest);
  };
  pool.connect = () => Promise.resolve(realClient);

  const stderr = captureStream(process.stderr);
  const originalError = new Error("boom-from-handler");
  try {
    await assert.rejects(
      withTransaction(async () => {
        throw originalError;
      }),
      (err) => err === originalError
    );
  } finally {
    pool.connect = realConnect;
    stderr.restore();
  }

  assert.equal(rollbackAttempted, true, "test setup: ROLLBACK must actually have been attempted");
  assert.ok(
    stderr.calls.some((line) => line.includes("rollback failed")),
    "the rollback failure should still be logged, not silently dropped"
  );

  // The pool itself must still be usable afterwards -- the client whose
  // ROLLBACK failed must have been discarded, not handed back out broken.
  await withClient((client) => client.query("SELECT 1"));
});

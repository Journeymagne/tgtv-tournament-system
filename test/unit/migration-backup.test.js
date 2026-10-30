const test = require('node:test');
const assert = require('node:assert/strict');
const backup = require('../../src/db/backup');
const { migrate, MIGRATIONS } = require('../../src/db/migrate');

test('backup passes decoded libpq parameters separately from the URI', () => {
  const env = backup.connectionEnvironment(new URL('postgres://owner:p%40ss@localhost:5544/cup%20db?sslmode=require'));
  assert.equal(env.PGHOST, 'localhost');
  assert.equal(env.PGPORT, '5544');
  assert.equal(env.PGUSER, 'owner');
  assert.equal(env.PGPASSWORD, 'p@ss');
  assert.equal(env.PGDATABASE, 'cup db');
  assert.equal(env.PGSSLMODE, 'require');
});

test('a failed backup aborts normalization before BEGIN and releases the migration lock', async t => {
  t.mock.method(backup, 'backupDatabase', async () => { throw new Error('Archive verification failed'); });
  const queries = [];
  let released = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === 'SELECT version FROM schema_migrations') return { rows: MIGRATIONS.filter(m => m.version<=78).map(m => ({ version: m.version })) };
      if (sql.includes("to_regclass('accounts.users')")) return { rows: [{ existing: true }] };
      return { rows: [] };
    },
    release() { released = true; }
  };
  const pool = { options: { connectionString: 'postgres://backup-check.invalid/production' }, connect: async () => client };
  await assert.rejects(migrate(pool), /Archive verification failed/);
  assert.ok(!queries.includes('BEGIN'));
  assert.ok(queries.some(sql => sql.includes('pg_advisory_unlock')));
  assert.equal(released, true);
});

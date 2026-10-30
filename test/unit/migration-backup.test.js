const test = require('node:test');
const assert = require('node:assert/strict');
const backup = require('../../src/db/backup');
const { migrate, MIGRATIONS } = require('../../src/db/migrate');

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

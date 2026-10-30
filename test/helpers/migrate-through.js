const { MIGRATIONS } = require('../../src/db/migrate');

// Build the historical schema a migration was written for. Replaying an old
// migration over the latest schema can mask upgrade bugs or reference removed columns.
async function migrateThrough(client, version) {
  await client.query(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  for (const migration of MIGRATIONS.filter(m => m.version <= version)) {
    await migration.up(client);
    await client.query('INSERT INTO schema_migrations(version,name) VALUES($1,$2)', [migration.version,migration.name]);
  }
}

module.exports = { migrateThrough };

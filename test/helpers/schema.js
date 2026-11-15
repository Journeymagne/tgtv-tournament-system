const assert = require('node:assert/strict');
const { SCHEMAS, SEARCH_PATH } = require('../../src/db/schemas');
const { TEST_DATABASE_URL } = require('./db');
const poolOptions = { connectionString: TEST_DATABASE_URL, options: '-c search_path=' + SEARCH_PATH };
async function resetSchemas(client) {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(['127.0.0.1','localhost'].includes(target.hostname) && /test/.test(target.pathname));
  for (const schema of [...SCHEMAS, 'public']) await client.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await client.query('CREATE SCHEMA public');
}
module.exports = { poolOptions, resetSchemas };

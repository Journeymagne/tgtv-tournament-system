require('../src/config');
const { getPool, closePool } = require('../src/db/pool');
require('../src/db/migrate').migrate(getPool()).then(closePool).catch(async error => {
  console.error(error.message); await closePool(); process.exitCode = 1;
});

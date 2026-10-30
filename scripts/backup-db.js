const config = require('../src/config');
require('../src/db/backup').backupDatabase(config.requireDatabaseUrl(), {
  ssl: config.PGSSL ? { rejectUnauthorized: false } : undefined,
  directory: process.argv[2]
}).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

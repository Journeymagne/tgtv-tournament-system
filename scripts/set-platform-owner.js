// Run once after registering the intended owner: node scripts/set-platform-owner.js <user-id>
const { withTransaction, closePool } = require("../src/db/pool");
const { initializeOwner } = require("../src/db/repositories/access");
const id = Number(process.argv[2]);
withTransaction(client => initializeOwner(client, id))
  .then(() => console.log(`Platform owner: user ${id}`))
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(closePool);

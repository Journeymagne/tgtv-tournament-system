require('../src/config');
const { getPool,closePool }=require('../src/db/pool');
(async()=>{await require('../src/db/migrate').migrate(getPool());await require('./provision-service-roles').provision();await closePool();})()
  .catch(async error=>{console.error(error.message);await closePool();process.exitCode=1;});

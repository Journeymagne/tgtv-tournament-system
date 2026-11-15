const { withTransaction } = require('../db/pool');
const { listActive } = require('./tournament-source');
const { publish } = require('./publish');
const { startLoop } = require('./loop');
async function tick() {
  // Small transactions bound locks and work per tick. Dirty rows are durable:
  // producer failure or restart cannot acknowledge an undelivered change.
  for (let count = 0; count < 25; count++) {
    const found = await withTransaction(async client => {
      const { rows: [row] } = await client.query('SELECT user_id FROM tournaments.notification_recipients ORDER BY changed_at,user_id LIMIT 1 FOR UPDATE SKIP LOCKED');
      if (!row) return false;
      for (const payload of await listActive(client,row.user_id)) await publish(client,'tournaments',row.user_id,payload);
      await client.query('DELETE FROM tournaments.notification_recipients WHERE user_id=$1',[row.user_id]);
      return true;
    });
    if (!found) break;
  }
}
module.exports = { tick, startWorker: () => startLoop('tournament notifications failed', tick) };

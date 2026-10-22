const { withTransaction } = require('../db/pool');
const { SOURCES } = require('./publish');
const { startLoop } = require('./loop');
async function tick() {
  for (const [index, source] of SOURCES.entries()) await withTransaction(async client => {
    const { rows: [lock] } = await client.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [91828000 + index]);
    if (!lock.locked) return;
    const { rows } = await client.query(`SELECT * FROM ${source}.notification_outbox ORDER BY id LIMIT 100 FOR UPDATE`);
    for (const event of rows) {
      if (event.operation === 'delete') await client.query('DELETE FROM notifications.notification_inbox_items WHERE user_id=$1 AND notification_id=$2', [event.user_id,event.notification_id]);
      else {
        const payload = { ...event.payload, source };
        if (payload.href?.startsWith('#/')) payload.href = '/tournament' + payload.href;
        await client.query(`INSERT INTO notifications.notification_inbox_items(user_id,notification_id,payload,created_at,read_at)
          SELECT u.id,$2,$3,COALESCE(($3::jsonb->>'createdAt')::timestamptz,$4),
            CASE WHEN COALESCE(($3::jsonb->>'createdAt')::timestamptz,$4)<=s.last_seen_at THEN s.last_seen_at END
          FROM accounts.users u LEFT JOIN notifications.notification_inbox_state s ON s.user_id=u.id WHERE u.id=$1
          ON CONFLICT(user_id,notification_id) DO UPDATE SET payload=EXCLUDED.payload`,
        [event.user_id,event.notification_id,JSON.stringify(payload),event.created_at]);
      }
      await client.query(`DELETE FROM ${source}.notification_outbox WHERE id=$1`, [event.id]);
    }
  });
}
module.exports = { tick, startWorker: () => startLoop('notification delivery failed', tick) };

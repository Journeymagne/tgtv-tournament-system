const SOURCES = ['tournaments','studio','faq','knowthykt'];
async function publish(client, source, userId, payload) {
  if (!SOURCES.includes(source)) throw Error('Unknown notification source');
  if (!userId) return;
  await client.query(`INSERT INTO ${source}.notification_messages(user_id,notification_id,payload,created_at)
    VALUES($1,$2,$3,COALESCE(($3::jsonb->>'createdAt')::timestamptz,NOW()))
    ON CONFLICT(user_id,notification_id) DO UPDATE SET payload=EXCLUDED.payload
      WHERE notification_messages.payload IS DISTINCT FROM EXCLUDED.payload`, [userId,payload.id,JSON.stringify(payload)]);
}
async function retract(client, source, id) {
  if (!SOURCES.includes(source)) throw Error('Unknown notification source');
  await client.query(`DELETE FROM ${source}.notification_messages WHERE notification_id=$1`, [id]);
}
module.exports = { SOURCES, publish, retract };

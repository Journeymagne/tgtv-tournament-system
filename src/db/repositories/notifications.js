const { toIso } = require("../rows");
async function getLastSeenAt(client, userId) {
  const { rows } = await client.query(
    "SELECT last_seen_at FROM notification_inbox_state WHERE user_id = $1",
    [userId]
  );
  return toIso(rows[0]?.last_seen_at);
}

async function markReadThrough(client, userId, through) {
  const { rows } = await client.query(
    `INSERT INTO notification_inbox_state (user_id, last_seen_at, updated_at)
     VALUES ($1, LEAST($2::timestamptz, NOW()), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       last_seen_at = GREATEST(
         COALESCE(notification_inbox_state.last_seen_at, '-infinity'::timestamptz),
         LEAST(EXCLUDED.last_seen_at, NOW())
       ),
       updated_at = NOW()
     RETURNING last_seen_at`,
    [userId, through]
  );
  return toIso(rows[0]?.last_seen_at);
}

async function rememberItems(client, userId, items, lastSeenAt) {
  if (!items.length) return;
  await client.query(
    `INSERT INTO notification_inbox_items (user_id, notification_id, payload, created_at, read_at)
     SELECT $1, item->>'id', item, (item->>'createdAt')::timestamptz,
       CASE WHEN (item->>'createdAt')::timestamptz <= $3::timestamptz THEN $3::timestamptz END
     FROM jsonb_array_elements($2::jsonb) AS item
     ON CONFLICT (user_id, notification_id) DO UPDATE SET payload = EXCLUDED.payload
       WHERE notification_inbox_items.payload IS DISTINCT FROM EXCLUDED.payload`,
    [userId, JSON.stringify(items), lastSeenAt]
  );
}

async function listRecent(client, userId) {
  const { rows } = await client.query(
    `SELECT payload, read_at FROM notification_inbox_items
     WHERE user_id = $1
     ORDER BY created_at DESC, notification_id DESC LIMIT 5`,
    [userId]
  );
  return rows.map((row) => ({ ...row.payload, readAt: toIso(row.read_at), unread: !row.read_at }));
}

async function markItemRead(client, userId, id) {
  const { rows } = await client.query(
    `UPDATE notification_inbox_items SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND notification_id = $2 RETURNING notification_id, read_at`,
    [userId, id]
  );
  return rows[0] ? { id: rows[0].notification_id, readAt: toIso(rows[0].read_at) } : null;
}

async function markRememberedReadThrough(client, userId, through) {
  await client.query(
    `UPDATE notification_inbox_items SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL AND created_at <= $2::timestamptz`,
    [userId, through]
  );
}

module.exports = { getLastSeenAt, markReadThrough, rememberItems, listRecent, markItemRead, markRememberedReadThrough };

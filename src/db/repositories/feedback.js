const { FEEDBACK_COLUMNS: COLUMNS, mapFeedback } = require("../rows");

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM feedback WHERE id = $1`, [id]);
  return mapFeedback(rows[0]);
}

async function listAll(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM feedback ORDER BY created_at DESC, id DESC`
  );
  return rows.map(mapFeedback);
}

async function insert(client, { userId, screen, description }) {
  const { rows } = await client.query(
    `INSERT INTO feedback (user_id, screen, description, status)
     VALUES ($1, $2, $3, 'open') RETURNING ${COLUMNS}`,
    [userId, screen, description]
  );
  return mapFeedback(rows[0]);
}

async function setStatus(client, id, status, adminId) {
  const resolved = status === "resolved";
  const { rows } = await client.query(
    `UPDATE feedback
     SET status = $2,
         resolved_by = CASE WHEN $3 THEN $4::int ELSE NULL END,
         resolved_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, resolved ? "resolved" : "open", resolved, adminId]
  );
  return mapFeedback(rows[0]);
}

async function remove(client, id) {
  await client.query("DELETE FROM feedback WHERE id = $1", [id]);
}

module.exports = { findById, listAll, insert, setStatus, remove };

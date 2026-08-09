const { TOURNAMENT_TABLE_COLUMNS: COLUMNS, mapTournamentTable } = require("../rows");

async function nextTableNumber(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(table_number), 0) + 1 AS next_number
     FROM tournament_tables
     WHERE tournament_id = $1`,
    [tournamentId]
  );
  return Number(rows[0]?.next_number || 1);
}

async function insert(client, table) {
  const tableNumber = table.tableNumber || await nextTableNumber(client, table.tournamentId);
  const { rows } = await client.query(
    `INSERT INTO tournament_tables (tournament_id, table_number, killzone, deployment)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [table.tournamentId, tableNumber, table.killzone || "", table.deployment || null]
  );
  return mapTournamentTable(rows[0]);
}

async function listByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_tables
     WHERE tournament_id = $1
     ORDER BY table_number`,
    [tournamentId]
  );
  return rows.map(mapTournamentTable);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_tables WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapTournamentTable(rows[0]);
}

async function update(client, id, patch) {
  const fields = {
    killzone: "killzone",
    deployment: "deployment"
  };
  const assignments = [];
  const values = [id];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(field === "killzone" ? patch[field] || "" : patch[field] || null);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) return lockById(client, id);
  const { rows } = await client.query(
    `UPDATE tournament_tables
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    values
  );
  return mapTournamentTable(rows[0]);
}

async function remove(client, id) {
  const { rows } = await client.query(
    `DELETE FROM tournament_tables WHERE id = $1 RETURNING ${COLUMNS}`,
    [id]
  );
  return mapTournamentTable(rows[0]);
}

module.exports = { insert, listByTournament, lockById, update, remove };

const { TOURNAMENT_ROUND_COLUMNS: COLUMNS, mapTournamentRound } = require("../rows");

async function insert(client, round) {
  const { rows } = await client.query(
    `INSERT INTO tournament_rounds
       (tournament_id, round_number, status, generated_by, metadata, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING ${COLUMNS}`,
    [
      round.tournamentId,
      round.roundNumber,
      round.status,
      round.generatedBy || "system",
      round.metadata ? JSON.stringify(round.metadata) : null,
      round.startedAt || null,
      round.completedAt || null
    ]
  );
  return mapTournamentRound(rows[0]);
}

async function listByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_rounds
     WHERE tournament_id = $1
     ORDER BY round_number`,
    [tournamentId]
  );
  return rows.map(mapTournamentRound);
}

async function update(client, id, patch) {
  const fields = {
    status: "status",
    metadata: "metadata",
    startedAt: "started_at",
    completedAt: "completed_at"
  };
  const assignments = [];
  const values = [id];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(field === "metadata" ? JSON.stringify(patch[field] || null) : patch[field]);
    assignments.push(`${column} = $${values.length}${field === "metadata" ? "::jsonb" : ""}`);
  }
  if (!assignments.length) return null;

  const { rows } = await client.query(
    `UPDATE tournament_rounds
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    values
  );
  return mapTournamentRound(rows[0]);
}

module.exports = { insert, listByTournament, update };

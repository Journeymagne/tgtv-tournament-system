const {
  TOURNAMENT_COLUMNS,
  TOURNAMENT_PARTICIPANT_COLUMNS,
  TOURNAMENT_MATCH_COLUMNS: COLUMNS,
  aliasColumns,
  mapTournament,
  mapTournamentParticipant,
  mapTournamentMatch
} = require("../rows");

async function insert(client, match) {
  const { rows } = await client.query(
    `INSERT INTO tournament_matches
     (tournament_id, round_id, round_number, bracket_position, status, is_bye,
        participant_a_id, participant_b_id, source_match_a_id, source_match_b_id,
        winner_participant_id, pending_result, result, match_points, elo, game_id,
        submitted_by_user_id, table_id, mission, completed_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17, $18, $19::jsonb, $20)
     RETURNING ${COLUMNS}`,
    [
      match.tournamentId,
      match.roundId,
      match.roundNumber,
      match.bracketPosition || null,
      match.status,
      Boolean(match.isBye),
      match.participantAId || null,
      match.participantBId || null,
      match.sourceMatchAId || null,
      match.sourceMatchBId || null,
      match.winnerParticipantId || null,
      match.pendingResult ? JSON.stringify(match.pendingResult) : null,
      match.result ? JSON.stringify(match.result) : null,
      match.matchPoints ? JSON.stringify(match.matchPoints) : null,
      match.elo ? JSON.stringify(match.elo) : null,
      match.gameId || null,
      match.submittedByUserId || null,
      match.tableId || null,
      match.mission ? JSON.stringify(match.mission) : null,
      match.completedAt || null
    ]
  );
  return mapTournamentMatch(rows[0]);
}

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM tournament_matches WHERE id = $1`, [
    id
  ]);
  return mapTournamentMatch(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_matches WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapTournamentMatch(rows[0]);
}

async function listByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_matches
     WHERE tournament_id = $1
     ORDER BY round_number, COALESCE(bracket_position, id), id`,
    [tournamentId]
  );
  return rows.map(mapTournamentMatch);
}

async function listByRound(client, roundId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_matches
     WHERE round_id = $1
     ORDER BY COALESCE(bracket_position, id), id`,
    [roundId]
  );
  return rows.map(mapTournamentMatch);
}

async function listActiveForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT
        row_to_json(tournament_row) AS tournament,
        row_to_json(match_row) AS match,
        row_to_json(participant_a_row) AS participant_a,
        row_to_json(participant_b_row) AS participant_b
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     JOIN tournament_participants pa ON pa.id = tm.participant_a_id
     JOIN tournament_participants pb ON pb.id = tm.participant_b_id
     CROSS JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_COLUMNS, "t")}) tournament_row
     CROSS JOIN LATERAL (SELECT ${aliasColumns(COLUMNS, "tm")}) match_row
     CROSS JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_PARTICIPANT_COLUMNS, "pa")}) participant_a_row
     CROSS JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_PARTICIPANT_COLUMNS, "pb")}) participant_b_row
     WHERE t.status = 'in_progress'
       AND tm.status = ANY($2::text[])
       AND tm.is_bye = FALSE
       AND (pa.user_id = $1 OR pb.user_id = $1)
     ORDER BY t.started_at DESC NULLS LAST, t.id DESC, tm.round_number, COALESCE(tm.bracket_position, tm.id), tm.id`,
    [userId, ["active", "pending_confirmation"]]
  );
  return rows.map((row) => ({
    tournament: mapTournament(row.tournament),
    match: mapTournamentMatch(row.match),
    participantA: mapTournamentParticipant(row.participant_a),
    participantB: mapTournamentParticipant(row.participant_b)
  }));
}

function mapMatchLinks(rows) {
  return rows.map((row) => ({
    tournament: mapTournament(row.tournament),
    match: mapTournamentMatch(row.match),
    participantA: mapTournamentParticipant(row.participant_a),
    participantB: mapTournamentParticipant(row.participant_b)
  }));
}

async function listByGameIds(client, gameIds) {
  const ids = [...new Set(gameIds)].filter((id) => Number.isInteger(id));
  if (!ids.length) return [];
  const { rows } = await client.query(
    `SELECT
        row_to_json(t) AS tournament,
        row_to_json(tm) AS match,
        row_to_json(pa) AS participant_a,
        row_to_json(pb) AS participant_b
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants pa ON pa.id = tm.participant_a_id
     LEFT JOIN tournament_participants pb ON pb.id = tm.participant_b_id
     WHERE tm.game_id = ANY($1::int[])`,
    [ids]
  );
  return mapMatchLinks(rows);
}

async function listCompletedUnlinked(client) {
  const { rows } = await client.query(
    `SELECT
        row_to_json(t) AS tournament,
        row_to_json(tm) AS match,
        row_to_json(pa) AS participant_a,
        row_to_json(pb) AS participant_b
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants pa ON pa.id = tm.participant_a_id
     LEFT JOIN tournament_participants pb ON pb.id = tm.participant_b_id
     WHERE tm.status = 'completed'
       AND tm.is_bye = FALSE
       AND tm.result IS NOT NULL
       AND tm.game_id IS NULL
     ORDER BY COALESCE(tm.completed_at, tm.created_at) DESC, tm.id DESC`
  );
  return mapMatchLinks(rows);
}

async function listCompletedUnlinkedForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT
        row_to_json(t) AS tournament,
        row_to_json(tm) AS match,
        row_to_json(pa) AS participant_a,
        row_to_json(pb) AS participant_b
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants pa ON pa.id = tm.participant_a_id
     LEFT JOIN tournament_participants pb ON pb.id = tm.participant_b_id
     WHERE tm.status = 'completed'
       AND tm.is_bye = FALSE
       AND tm.result IS NOT NULL
       AND tm.game_id IS NULL
       AND (pa.user_id = $1 OR pb.user_id = $1)
     ORDER BY COALESCE(tm.completed_at, tm.created_at) DESC, tm.id DESC`,
    [userId]
  );
  return mapMatchLinks(rows);
}

async function ratingPoliciesByGameIds(client, gameIds) {
  const ids = [...new Set(gameIds)].filter((id) => Number.isInteger(id));
  if (!ids.length) return new Map();
  const { rows } = await client.query(
    `SELECT tm.game_id, t.rating_policy
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE tm.game_id = ANY($1::int[])`,
    [ids]
  );
  return new Map(rows.map((row) => [row.game_id, row.rating_policy || "ranked"]));
}

async function syncEloFromLinkedGames(client) {
  await client.query(
    `UPDATE tournament_matches tm
     SET elo = g.elo, updated_at = NOW()
     FROM games g
     WHERE tm.game_id = g.id
       AND tm.elo IS DISTINCT FROM g.elo`
  );
}

async function update(client, id, patch) {
  const fields = {
    status: "status",
    participantAId: "participant_a_id",
    participantBId: "participant_b_id",
    winnerParticipantId: "winner_participant_id",
    pendingResult: "pending_result",
    result: "result",
    matchPoints: "match_points",
    elo: "elo",
    gameId: "game_id",
    submittedByUserId: "submitted_by_user_id",
    tableId: "table_id",
    mission: "mission",
    completedAt: "completed_at"
  };
  const assignments = [];
  const values = [id];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const isJson = ["pendingResult", "result", "matchPoints", "elo", "mission"].includes(field);
    values.push(isJson ? JSON.stringify(patch[field] || null) : patch[field]);
    assignments.push(`${column} = $${values.length}${isJson ? "::jsonb" : ""}`);
  }
  if (!assignments.length) return null;

  const { rows } = await client.query(
    `UPDATE tournament_matches
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    values
  );
  return mapTournamentMatch(rows[0]);
}

module.exports = {
  insert,
  findById,
  lockById,
  listByTournament,
  listByRound,
  listActiveForUser,
  listByGameIds,
  listCompletedUnlinked,
  listCompletedUnlinkedForUser,
  ratingPoliciesByGameIds,
  syncEloFromLinkedGames,
  update
};

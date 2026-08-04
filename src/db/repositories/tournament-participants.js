const {
  TOURNAMENT_PARTICIPANT_COLUMNS: COLUMNS,
  mapTournamentParticipant
} = require("../rows");

const COMPETITIVE_STATUSES = ["joined", "active"];
const ACTIVE_NAME_STATUSES = ["joined", "active", "pending_placement", "eliminated", "finished"];

const FIELD_COLUMNS = {
  userId: "user_id",
  displayName: "display_name",
  displayNameKey: "display_name_key",
  faction: "faction",
  factionRules: "faction_rules",
  seed: "seed",
  status: "status",
  source: "source",
  withdrawnAt: "withdrawn_at",
  removedAt: "removed_at",
  placedAt: "placed_at"
};

async function maxSeed(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(seed), 0)::int AS seed
     FROM tournament_participants
     WHERE tournament_id = $1 AND status = ANY($2::text[])`,
    [tournamentId, ACTIVE_NAME_STATUSES]
  );
  return rows[0].seed;
}

async function insert(client, participant) {
  const seed =
    participant.seed === undefined ? (await maxSeed(client, participant.tournamentId)) + 1 : participant.seed;
  const { rows } = await client.query(
    `INSERT INTO tournament_participants
       (tournament_id, user_id, display_name, display_name_key, faction,
        faction_rules, seed, status, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      participant.tournamentId,
      participant.userId || null,
      participant.displayName,
      participant.displayNameKey,
      participant.faction || null,
      participant.factionRules || null,
      seed,
      participant.status,
      participant.source
    ]
  );
  return mapTournamentParticipant(rows[0]);
}

async function listByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_participants
     WHERE tournament_id = $1
     ORDER BY COALESCE(seed, 2147483647), id`,
    [tournamentId]
  );
  return rows.map(mapTournamentParticipant);
}

async function listCompetitive(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_participants
     WHERE tournament_id = $1 AND status = ANY($2::text[])
     ORDER BY seed, id`,
    [tournamentId, COMPETITIVE_STATUSES]
  );
  return rows.map(mapTournamentParticipant);
}

async function findByTournamentUser(client, tournamentId, userId, options = {}) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_participants
     WHERE tournament_id = $1 AND user_id = $2
       AND status NOT IN ('withdrawn','removed')
     ORDER BY id
     LIMIT 1
     ${options.forUpdate ? "FOR UPDATE" : ""}`,
    [tournamentId, userId]
  );
  return mapTournamentParticipant(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_participants WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapTournamentParticipant(rows[0]);
}

async function lockByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournament_participants
     WHERE tournament_id = $1
     ORDER BY id
     FOR UPDATE`,
    [tournamentId]
  );
  return rows.map(mapTournamentParticipant);
}

async function update(client, id, patch) {
  const assignments = [];
  const values = [id];
  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(patch[field] === undefined ? null : patch[field]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) {
    const locked = await lockById(client, id);
    return locked;
  }

  const { rows } = await client.query(
    `UPDATE tournament_participants
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    values
  );
  return mapTournamentParticipant(rows[0]);
}

async function setAllCompetitiveStatus(client, tournamentId, status) {
  const { rows } = await client.query(
    `UPDATE tournament_participants
     SET status = $2, placed_at = CASE WHEN $2 = 'active' THEN NOW() ELSE placed_at END,
         updated_at = NOW()
     WHERE tournament_id = $1 AND status = ANY($3::text[])
     RETURNING ${COLUMNS}`,
    [tournamentId, status, ["joined"]]
  );
  return rows.map(mapTournamentParticipant);
}

module.exports = {
  COMPETITIVE_STATUSES,
  ACTIVE_NAME_STATUSES,
  insert,
  listByTournament,
  listCompetitive,
  findByTournamentUser,
  lockById,
  lockByTournament,
  update,
  setAllCompetitiveStatus,
  maxSeed
};

const { toIso } = require("../rows");

function mapTeamMatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundId: row.round_id,
    roundNumber: row.round_number,
    bracketPosition: row.bracket_position,
    rosterAId: row.roster_a_id,
    rosterBId: row.roster_b_id,
    phase: row.phase,
    rollResult: row.roll_result,
    pairingVersion: row.pairing_version || 1,
    rollHistory: row.roll_history || [],
    missionBans: row.mission_bans || [],
    attackerRosterId: row.attacker_roster_id,
    defenderRosterId: row.defender_roster_id,
    shieldAMemberId: row.shield_a_member_id,
    shieldBMemberId: row.shield_b_member_id,
    shieldAConfirmed: Boolean(row.shield_a_confirmed),
    shieldBConfirmed: Boolean(row.shield_b_confirmed),
    swordAMemberId: row.sword_a_member_id,
    swordBMemberId: row.sword_b_member_id,
    swordAConfirmed: Boolean(row.sword_a_confirmed),
    swordBConfirmed: Boolean(row.sword_b_confirmed),
    pairings: row.pairings || null,
    missions: row.missions || null,
    tableIds: row.table_ids || [],
    environment: row.environment || null,
    gamePoints: row.game_points || null,
    teamGamePointsA: row.team_game_points_a,
    teamGamePointsB: row.team_game_points_b,
    teamTournamentPointsA: row.team_tournament_points_a,
    teamTournamentPointsB: row.team_tournament_points_b,
    teamElo: row.team_elo || null,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    games: []
  };
}

function mapGameLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamMatchId: row.team_match_id,
    gameId: row.game_id,
    slot: row.slot,
    rosterAMemberId: row.roster_a_member_id,
    rosterBMemberId: row.roster_b_member_id,
    mission: row.mission || {},
    tableId: row.table_id,
    gamePointsA: row.game_points_a,
    gamePointsB: row.game_points_b,
    game: row.game_id
      ? {
          id: row.game_id,
          status: row.game_status,
          playerIds: row.player_ids || [],
          pendingResult: row.pending_result || null,
          result: row.result || null,
          elo: row.elo || null,
          venueMode: row.venue_mode || "tts"
        }
      : null,
    table: row.table_id ? { id: row.table_id, tableNumber: row.table_number,
      killzone: row.mission?.killzone ?? row.killzone ?? "", deployment: row.mission?.layout ?? row.deployment } : null
  };
}

async function insert(client, match) {
  const { rows } = await client.query(
    `INSERT INTO tournament_team_matches
       (tournament_id, round_id, round_number, bracket_position, roster_a_id, roster_b_id,
        phase, missions, table_ids, pairing_version)
     VALUES ($1, $2, $3, $4, $5, $6, 'awaiting_roll', $7::jsonb, $8::int[], $9) RETURNING *`,
    [match.tournamentId, match.roundId, match.roundNumber, match.bracketPosition, match.rosterAId,
      match.rosterBId, JSON.stringify(match.missions || null), match.tableIds || [], match.pairingVersion || 1]
  );
  return mapTeamMatch(rows[0]);
}

async function findById(client, id, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT * FROM tournament_team_matches WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [id]
  );
  const match = mapTeamMatch(rows[0]);
  if (match) match.games = await listGameLinks(client, match.id);
  return match;
}

async function listByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT * FROM tournament_team_matches WHERE tournament_id = $1
     ORDER BY round_number, bracket_position, id`,
    [tournamentId]
  );
  const matches = rows.map(mapTeamMatch);
  if (!matches.length) return matches;
  const links = await listGameLinksForMatches(client, matches.map((match) => match.id));
  const byMatch = new Map();
  for (const link of links) {
    if (!byMatch.has(link.teamMatchId)) byMatch.set(link.teamMatchId, []);
    byMatch.get(link.teamMatchId).push(link);
  }
  for (const match of matches) match.games = byMatch.get(match.id) || [];
  return matches;
}

async function listByRound(client, roundId) {
  const { rows } = await client.query(
    "SELECT * FROM tournament_team_matches WHERE round_id = $1 ORDER BY bracket_position, id",
    [roundId]
  );
  return rows.map(mapTeamMatch);
}

async function listActivePairingsForCaptain(client, userId) {
  const { rows } = await client.query(
    `SELECT tm.id, tm.tournament_id, tm.round_number, tm.phase, tm.created_at,
            t.slug AS tournament_slug, t.name AS tournament_name, t.venue_mode,
            ra.id AS roster_a_id, ra.name AS roster_a_name, ra.team_name_snapshot AS team_a_name,
            rb.id AS roster_b_id, rb.name AS roster_b_name, rb.team_name_snapshot AS team_b_name,
            CASE WHEN ra.captain_user_id = $1 THEN 'a' ELSE 'b' END AS captain_side
     FROM tournament_team_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     JOIN tournament_team_rosters ra ON ra.id = tm.roster_a_id
     JOIN tournament_team_rosters rb ON rb.id = tm.roster_b_id
     WHERE t.status = 'in_progress'
       AND tm.phase IN ('awaiting_roll', 'mission_ban', 'shield_selection', 'sword_selection', 'environment_selection')
       AND (ra.captain_user_id = $1 OR rb.captain_user_id = $1)
     ORDER BY tm.created_at DESC, tm.id DESC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    tournamentId: row.tournament_id,
    roundNumber: row.round_number,
    phase: row.phase,
    captainSide: row.captain_side,
    createdAt: toIso(row.created_at),
    tournament: {
      id: row.tournament_id,
      slug: row.tournament_slug,
      name: row.tournament_name,
      venueMode: row.venue_mode
    },
    rosterA: { id: row.roster_a_id, name: row.roster_a_name, teamName: row.team_a_name },
    rosterB: { id: row.roster_b_id, name: row.roster_b_name, teamName: row.team_b_name }
  }));
}

async function update(client, id, patch) {
  const fields = {
    pairingVersion: "pairing_version", rollHistory: "roll_history", missionBans: "mission_bans",
    phase: "phase", rollResult: "roll_result", attackerRosterId: "attacker_roster_id",
    defenderRosterId: "defender_roster_id", shieldAMemberId: "shield_a_member_id",
    shieldBMemberId: "shield_b_member_id", shieldAConfirmed: "shield_a_confirmed",
    shieldBConfirmed: "shield_b_confirmed", swordAMemberId: "sword_a_member_id",
    swordBMemberId: "sword_b_member_id", swordAConfirmed: "sword_a_confirmed",
    swordBConfirmed: "sword_b_confirmed", pairings: "pairings", missions: "missions",
    tableIds: "table_ids", environment: "environment", gamePoints: "game_points",
    teamGamePointsA: "team_game_points_a", teamGamePointsB: "team_game_points_b",
    teamTournamentPointsA: "team_tournament_points_a", teamTournamentPointsB: "team_tournament_points_b",
    teamElo: "team_elo", completedAt: "completed_at"
  };
  const jsonFields = new Set(["pairings", "missions", "environment", "gamePoints", "teamElo", "rollHistory", "missionBans"]);
  const values = [id];
  const assignments = [];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const value = patch[field] === undefined ? null : patch[field];
    values.push(jsonFields.has(field) ? JSON.stringify(value) : value);
    const cast = jsonFields.has(field) ? "::jsonb" : field === "tableIds" ? "::int[]" : "";
    assignments.push(`${column} = $${values.length}${cast}`);
  }
  const { rows } = await client.query(
    `UPDATE tournament_team_matches SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    values
  );
  return mapTeamMatch(rows[0]);
}

async function insertGameLink(client, link) {
  const { rows } = await client.query(
    `INSERT INTO tournament_team_match_games
       (team_match_id, game_id, slot, roster_a_member_id, roster_b_member_id, mission, table_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (team_match_id, slot) DO UPDATE SET
       game_id = EXCLUDED.game_id, roster_a_member_id = EXCLUDED.roster_a_member_id,
       roster_b_member_id = EXCLUDED.roster_b_member_id, mission = EXCLUDED.mission,
       table_id = EXCLUDED.table_id, updated_at = NOW()
     RETURNING *`,
    [link.teamMatchId, link.gameId, link.slot, link.rosterAMemberId, link.rosterBMemberId,
      JSON.stringify(link.mission || {}), link.tableId || null]
  );
  return mapGameLink(rows[0]);
}

async function updateGamePoints(client, id, a, b) {
  await client.query(
    `UPDATE tournament_team_match_games SET game_points_a = $2, game_points_b = $3, updated_at = NOW()
     WHERE id = $1`,
    [id, a, b]
  );
}

async function listGameLinks(client, teamMatchId) {
  return listGameLinksForMatches(client, [teamMatchId]);
}

async function listGameLinksForMatches(client, teamMatchIds) {
  if (!teamMatchIds.length) return [];
  const { rows } = await client.query(
    `SELECT l.*, g.status AS game_status, g.player_ids, g.pending_result, g.result, g.elo, g.venue_mode,
            tt.table_number, tt.killzone, tt.deployment
     FROM tournament_team_match_games l
     JOIN games g ON g.id = l.game_id
     LEFT JOIN tournament_tables tt ON tt.id = l.table_id
     WHERE l.team_match_id = ANY($1::int[]) ORDER BY l.team_match_id, l.slot`,
    [teamMatchIds]
  );
  return rows.map(mapGameLink);
}

async function findByGameId(client, gameId) {
  const { rows } = await client.query(
    `SELECT tm.* FROM tournament_team_matches tm
     JOIN tournament_team_match_games l ON l.team_match_id = tm.id
     WHERE l.game_id = $1 FOR UPDATE OF tm`,
    [gameId]
  );
  const match = mapTeamMatch(rows[0]);
  if (match) match.games = await listGameLinks(client, match.id);
  return match;
}

async function listCompletedForRatingReplay(client) {
  const { rows } = await client.query(
    `SELECT tm.*, t.venue_mode, ra.team_id AS team_a_id, rb.team_id AS team_b_id
     FROM tournament_team_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     JOIN tournament_team_rosters ra ON ra.id = tm.roster_a_id
     JOIN tournament_team_rosters rb ON rb.id = tm.roster_b_id
     WHERE tm.phase = 'completed'
     ORDER BY tm.completed_at, tm.id FOR UPDATE OF tm`
  );
  return rows;
}

async function removeByRound(client, roundId) {
  const { rows } = await client.query(
    "DELETE FROM tournament_team_matches WHERE round_id = $1 RETURNING *",
    [roundId]
  );
  return rows.map(mapTeamMatch);
}

module.exports = {
  mapTeamMatch,
  mapGameLink,
  insert,
  findById,
  listByTournament,
  listByRound,
  listActivePairingsForCaptain,
  update,
  insertGameLink,
  updateGamePoints,
  listGameLinks,
  findByGameId,
  listCompletedForRatingReplay,
  removeByRound
};

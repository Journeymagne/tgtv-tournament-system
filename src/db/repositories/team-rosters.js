const { toIso } = require("../rows");
const { avatarUrl } = require("../../domain/avatars");

function mapRoster(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    teamId: row.team_id,
    name: row.name,
    nameKey: row.name_key,
    captainUserId: row.captain_user_id,
    registeredByUserId: row.registered_by_user_id,
    seed: row.seed,
    status: row.status,
    teamNameSnapshot: row.team_name_snapshot,
    teamLogoSnapshot: row.team_logo_snapshot || null,
    finalPlace: row.final_place,
    registeredAt: toIso(row.registered_at),
    startedAt: toIso(row.started_at),
    withdrawnAt: toIso(row.withdrawn_at),
    finishedAt: toIso(row.finished_at),
    team: row.team_slug ? { id: row.team_id, slug: row.team_slug, name: row.current_team_name || row.team_name_snapshot } : null,
    members: []
  };
}

function mapRosterMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    rosterId: row.roster_id,
    userId: row.user_id,
    slot: row.slot,
    displayNameSnapshot: row.display_name_snapshot,
    factionSnapshot: row.faction_snapshot,
    joinedAt: toIso(row.joined_at),
    endedAt: toIso(row.ended_at),
    replacedByUserId: row.replaced_by_user_id,
    user: row.user_id ? { id: row.user_id, name: row.user_name || row.display_name_snapshot, avatarUrl: avatarUrl(row.user_id, row.avatar_version) } : null
  };
}

async function insert(client, roster, members) {
  const { rows } = await client.query(
    `INSERT INTO tournament_team_rosters
       (tournament_id, team_id, name, name_key, captain_user_id, registered_by_user_id,
        seed, status, team_name_snapshot, team_logo_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [roster.tournamentId, roster.teamId, roster.name, roster.nameKey, roster.captainUserId,
      roster.registeredByUserId, roster.seed, roster.status || "registered", roster.teamNameSnapshot,
      roster.teamLogoSnapshot || null]
  );
  const saved = mapRoster(rows[0]);
  for (const member of members) {
    await insertMember(client, saved, member, roster.registeredByUserId);
  }
  saved.members = await listMembers(client, saved.id);
  return saved;
}

async function insertMember(client, roster, member, actorUserId) {
  const { rows } = await client.query(
    `INSERT INTO tournament_team_roster_members
       (tournament_id, roster_id, user_id, slot, display_name_snapshot, faction_snapshot, changed_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [roster.tournamentId, roster.id, member.userId, member.slot, member.displayNameSnapshot,
      member.factionSnapshot, actorUserId || null]
  );
  return mapRosterMember(rows[0]);
}

async function listMembers(client, rosterId, includeHistory = true) {
  const { rows } = await client.query(
    `SELECT rm.*, u.name AS user_name, u.avatar_version
     FROM tournament_team_roster_members rm
     LEFT JOIN users u ON u.id = rm.user_id
     WHERE rm.roster_id = $1 ${includeHistory ? "" : "AND rm.ended_at IS NULL"}
     ORDER BY (rm.ended_at IS NOT NULL), rm.slot, rm.joined_at, rm.id`,
    [rosterId]
  );
  return rows.map(mapRosterMember);
}

async function attachMembers(client, rosters, includeHistory = false) {
  if (!rosters.length) return rosters;
  const ids = rosters.map((roster) => roster.id);
  const { rows } = await client.query(
    `SELECT rm.*, u.name AS user_name, u.avatar_version
     FROM tournament_team_roster_members rm
     LEFT JOIN users u ON u.id = rm.user_id
     WHERE rm.roster_id = ANY($1::int[]) ${includeHistory ? "" : "AND rm.ended_at IS NULL"}
     ORDER BY rm.roster_id, (rm.ended_at IS NOT NULL), rm.slot, rm.joined_at, rm.id`,
    [ids]
  );
  const byRoster = new Map();
  for (const row of rows) {
    if (!byRoster.has(row.roster_id)) byRoster.set(row.roster_id, []);
    byRoster.get(row.roster_id).push(mapRosterMember(row));
  }
  for (const roster of rosters) roster.members = byRoster.get(roster.id) || [];
  return rosters;
}

async function listByTournament(client, tournamentId, { includeWithdrawn = true, includeHistory = false } = {}) {
  const { rows } = await client.query(
    `SELECT r.*, pt.slug AS team_slug, pt.name AS current_team_name
     FROM tournament_team_rosters r
     JOIN player_teams pt ON pt.id = r.team_id
     WHERE r.tournament_id = $1 ${includeWithdrawn ? "" : "AND r.status <> 'withdrawn'"}
     ORDER BY COALESCE(r.seed, 2147483647), r.id`,
    [tournamentId]
  );
  return attachMembers(client, rows.map(mapRoster), includeHistory);
}

async function listByTeam(client, teamId) {
  const { rows } = await client.query(
    `SELECT r.*, pt.slug AS team_slug, pt.name AS current_team_name
     FROM tournament_team_rosters r
     JOIN player_teams pt ON pt.id = r.team_id
     WHERE r.team_id = $1 ORDER BY r.registered_at DESC, r.id DESC`,
    [teamId]
  );
  return attachMembers(client, rows.map(mapRoster), true);
}

async function findById(client, id, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT r.*, pt.slug AS team_slug, pt.name AS current_team_name
     FROM tournament_team_rosters r JOIN player_teams pt ON pt.id = r.team_id
     WHERE r.id = $1${forUpdate ? " FOR UPDATE OF r" : ""}`,
    [id]
  );
  const roster = mapRoster(rows[0]);
  if (roster) roster.members = await listMembers(client, roster.id, true);
  return roster;
}

async function maxSeed(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(seed), 0)::int AS value FROM tournament_team_rosters
     WHERE tournament_id = $1 AND status <> 'withdrawn'`,
    [tournamentId]
  );
  return Number(rows[0]?.value || 0);
}

async function update(client, id, patch) {
  const fields = { name: "name", nameKey: "name_key", captainUserId: "captain_user_id", seed: "seed", status: "status", teamNameSnapshot: "team_name_snapshot", teamLogoSnapshot: "team_logo_snapshot", finalPlace: "final_place", startedAt: "started_at", withdrawnAt: "withdrawn_at", finishedAt: "finished_at" };
  const values = [id];
  const assignments = [];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(patch[field] === undefined ? null : patch[field]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) return findById(client, id);
  const { rows } = await client.query(
    `UPDATE tournament_team_rosters SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    values
  );
  const roster = mapRoster(rows[0]);
  if (roster) roster.members = await listMembers(client, roster.id, true);
  return roster;
}

async function replaceMember(client, roster, slot, user, faction, actorUserId) {
  const current = roster.members.find((member) => !member.endedAt && member.slot === slot);
  if (current) {
    await client.query(
      `UPDATE tournament_team_roster_members
       SET ended_at = NOW(), replaced_by_user_id = $2, changed_by_user_id = $3, updated_at = NOW()
       WHERE id = $1`,
      [current.id, user.id, actorUserId]
    );
  }
  return insertMember(client, roster, {
    userId: user.id,
    slot,
    displayNameSnapshot: user.name,
    factionSnapshot: faction
  }, actorUserId);
}

async function countMatches(client, rosterId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS value FROM tournament_team_matches
     WHERE roster_a_id = $1 OR roster_b_id = $1`,
    [rosterId]
  );
  return Number(rows[0]?.value || 0);
}

// Hard delete. Roster members cascade, which is the point: the tournament-wide
// unique index on active members is what otherwise keeps a player who was once
// registered here from joining any other roster in the same tournament.
async function remove(client, id) {
  const { rowCount } = await client.query("DELETE FROM tournament_team_rosters WHERE id = $1", [id]);
  return rowCount > 0;
}

async function setAllStatus(client, tournamentId, fromStatus, status) {
  const { rows } = await client.query(
    `UPDATE tournament_team_rosters
     SET status = $3, started_at = CASE WHEN $3 = 'active' THEN NOW() ELSE started_at END,
         finished_at = CASE WHEN $3 = 'finished' THEN NOW() ELSE finished_at END, updated_at = NOW()
     WHERE tournament_id = $1 AND status = $2 RETURNING *`,
    [tournamentId, fromStatus, status]
  );
  return rows.map(mapRoster);
}

module.exports = {
  mapRoster,
  mapRosterMember,
  insert,
  insertMember,
  listMembers,
  listByTournament,
  listByTeam,
  findById,
  maxSeed,
  update,
  replaceMember,
  countMatches,
  remove,
  setAllStatus
};

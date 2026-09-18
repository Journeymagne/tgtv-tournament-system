const { HttpError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const rosters = require("../db/repositories/team-rosters");
const teams = require("../db/repositories/player-teams");
const { normalizeRosterName } = require("../domain/player-teams");
const { teamNameKey } = require("../domain/player-teams");
const { clearPreparedRounds } = require("./tournament-preparation");

function requireReservationAccess(tournament, user) {
  if (!user.isAdmin) throw new HttpError(403, "Administrator rights required");
  if (!["draft", "registration_open", "registration_closed"].includes(tournament.status) || tournament.startedAt) {
    throw new HttpError(409, "Fill reserved rosters before tournament start");
  }
}

async function create(client, tournament, user, body) {
  requireReservationAccess(tournament, user);
  const existing = await rosters.listByTournament(client, tournament.id, { includeWithdrawn: false });
  if (existing.length >= Math.min(tournament.registrationLimit || 128, 128)) throw new HttpError(409, "Registration limit reached");
  const name = normalizeRosterName(body.name);
  const seed = await rosters.maxSeed(client, tournament.id) + 1;
  const { rows: [row] } = await client.query(`INSERT INTO tournament_team_rosters
    (tournament_id, name, name_key, registered_by_user_id, seed, status, team_name_snapshot, is_reserve)
    VALUES ($1,$2,$3,$4,$5,'incomplete','',TRUE) RETURNING *`, [tournament.id, name, teamNameKey(name), user.id, seed]);
  const roster = rosters.mapRoster(row);
  await clearPreparedRounds(client, tournament);
  await teams.audit(client, { tournamentId: tournament.id, actorUserId: user.id, eventType: "roster_reserve", entityType: "roster", entityId: roster.id, after: roster });
  return { status: 201, body: { roster } };
}

async function fill(client, tournament, roster, user, body) {
  requireReservationAccess(tournament, user);
  const team = await teams.findById(client, requirePositiveIntId(body.teamId, 400, "Choose a team"), true);
  if (!team || team.archivedAt) throw new HttpError(409, "Choose an active team");
  const members = await require("./team-tournaments").normalizeRosterMembers(client, team, body.members);
  const captainUserId = requirePositiveIntId(body.captainUserId, 400, "Choose a captain");
  if (!members.some(member => member.userId === captainUserId)) throw new HttpError(400, "The captain must be one of the three roster players");
  const name = normalizeRosterName(body.name || roster.name);
  const updated = await rosters.update(client, roster.id, { teamId: team.id, name, nameKey: teamNameKey(name), captainUserId,
    teamNameSnapshot: team.name, teamLogoSnapshot: team.logoData, status: "registered", isReserve: false });
  for (const member of members) await rosters.insertMember(client, updated, member, user.id);
  await clearPreparedRounds(client, tournament);
  await teams.audit(client, { teamId: team.id, tournamentId: tournament.id, actorUserId: user.id, eventType: "roster_reserve_fill", entityType: "roster", entityId: roster.id, before: roster, after: { ...updated, members } });
  return { roster: await rosters.findById(client, roster.id) };
}

const withConflictMessage = handler => async (...args) => {
  try { return await handler(...args); }
  catch (error) {
    if (error.code === "23505") throw new HttpError(409, "Roster name, seed, or player is already used in this tournament");
    throw error;
  }
};

module.exports = { create: withConflictMessage(create), fill: withConflictMessage(fill) };

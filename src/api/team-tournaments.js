const crypto = require("node:crypto");
const { HttpError, ValidationError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const tournamentsRepo = require("../db/repositories/tournaments");
const roundsRepo = require("../db/repositories/tournament-rounds");
const tablesRepo = require("../db/repositories/tournament-tables");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const gameParticipantsRepo = require("../db/repositories/game-participants");
const teamsRepo = require("../db/repositories/player-teams");
const rostersRepo = require("../db/repositories/team-rosters");
const teamMatchesRepo = require("../db/repositories/team-matches");
const { tournamentSummaryView, tournamentTableView, gameView } = require("./views");
const { recalculateCompletedGameRatings } = require("./rating-replay");
const { calculateSubmittedResult, matchScoreFor } = require("../domain/scoring");
const { calculateElo, ELO_K } = require("../domain/elo");
const { requireKillTeam, CRIT_OPS } = require("../domain/kill-teams");
const { normalizeRosterName, teamNameKey, defaultRosterName } = require("../domain/player-teams");
const { rosterForViewer } = require("../domain/tournaments/privacy");
const {
  validateTeamTournament,
  buildFirstTeamRound,
  buildNextTeamRound,
  teamStandings,
  teamMatchProgress,
  validateTeamTables,
  teamEnvironmentPlan,
  teamRollRound,
  teamNextAction,
  buildShieldSwordPairings,
  teamTournamentPoints
} = require("../domain/team-tournaments");

function nowIso() {
  return new Date().toISOString();
}

async function audit(client, tournament, user, eventType, details = {}) {
  return teamsRepo.audit(client, {
    tournamentId: tournament.id,
    actorUserId: user?.id || null,
    eventType,
    ...details
  });
}

async function requireTournament(client, id, forUpdate = false) {
  const tournamentId = requirePositiveIntId(id, 404, "Tournament not found");
  const tournament = forUpdate
    ? await tournamentsRepo.lockById(client, tournamentId)
    : await tournamentsRepo.findById(client, tournamentId);
  if (!tournament) throw new HttpError(404, "Tournament not found");
  if (tournament.participantMode !== "team") throw new HttpError(409, "This is not a team tournament");
  return tournament;
}

function activeRosterMembers(roster) {
  return (roster.members || []).filter((member) => !member.endedAt && member.userId);
}

function rosterMember(roster, memberId) {
  return activeRosterMembers(roster).find((member) => member.id === Number(memberId)) || null;
}

function rosterById(rosters, id) {
  return rosters.find((roster) => roster.id === Number(id)) || null;
}

function canEditRoster(user, roster, teamMembership) {
  if (user.isAdmin) return true;
  return roster.captainUserId === user.id || teamMembership?.role === "leader";
}

async function normalizeRosterMembers(client, team, values) {
  if (!Array.isArray(values) || values.length !== 3) {
    throw new ValidationError("A tournament roster must contain exactly three players");
  }
  const userIds = values.map((item) => requirePositiveIntId(item.userId, 400, "Choose three valid players"));
  if (new Set(userIds).size !== 3) throw new ValidationError("Roster players must be unique");
  const memberships = [];
  for (const id of userIds) memberships.push(await teamsRepo.activeMembership(client, team.id, id));
  if (memberships.some((membership) => !membership)) {
    throw new ValidationError("Every roster player must be a current member of the same team");
  }
  const people = await usersRepo.findByIds(client, userIds);
  if (people.length !== 3) throw new ValidationError("Every roster player must have an active account");
  return values.map((item, index) => {
    const userId = userIds[index];
    const person = people.find((candidate) => candidate.id === userId);
    return {
      userId,
      slot: index + 1,
      displayNameSnapshot: person.name,
      factionSnapshot: requireKillTeam(item.faction)
    };
  });
}

async function registerRoster({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, true);
  const registrationStatuses = user.isAdmin
    ? ["draft", "registration_open", "registration_closed"]
    : ["registration_open"];
  if (!registrationStatuses.includes(tournament.status)) throw new HttpError(409, "Team registration is not open");
  const teamId = requirePositiveIntId(body.teamId, 400, "Choose a team");
  const team = await teamsRepo.findById(client, teamId, true);
  if (!team) throw new HttpError(404, "Team not found");
  if (team.archivedAt) throw new HttpError(409, "Archived teams cannot register rosters");
  const registrarMembership = await teamsRepo.activeMembership(client, team.id, user.id);
  if (!registrarMembership && !user.isAdmin) throw new HttpError(403, "Only a current team member can register a roster");
  const members = await normalizeRosterMembers(client, team, body.members);
  if (!user.isAdmin && !members.some((member) => member.userId === user.id)) {
    throw new ValidationError("The registering player must be included in the roster");
  }
  const captainUserId = requirePositiveIntId(body.captainUserId, 400, "Choose a captain");
  if (!members.some((member) => member.userId === captainUserId)) {
    throw new ValidationError("The captain must be one of the three roster players");
  }
  const existing = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: true });
  if (existing.filter((roster) => roster.status !== "withdrawn").length >= 128) throw new HttpError(409, "A team tournament is limited to 128 rosters");
  const name = normalizeRosterName(String(body.name || "").trim() || defaultRosterName(team, existing));
  try {
    const roster = await rostersRepo.insert(client, {
      tournamentId: tournament.id,
      teamId: team.id,
      name,
      nameKey: teamNameKey(name),
      captainUserId,
      registeredByUserId: user.id,
      seed: (await rostersRepo.maxSeed(client, tournament.id)) + 1,
      status: "registered",
      teamNameSnapshot: team.name,
      teamLogoSnapshot: team.logoData
    }, members);
    await audit(client, tournament, user, "roster_create", { teamId: team.id, entityType: "roster", entityId: roster.id, after: roster });
    return { status: 201, body: { roster } };
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "Roster name, seed, or player is already used in this tournament");
    throw err;
  }
}

async function updateRoster({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, true);
  const rosterId = requirePositiveIntId(params.rosterId, 404, "Roster not found");
  const roster = await rostersRepo.findById(client, rosterId, true);
  if (!roster || roster.tournamentId !== tournament.id) throw new HttpError(404, "Roster not found");
  if (["withdrawn", "finished"].includes(roster.status)) throw new HttpError(409, "This roster is read-only");
  const membership = await teamsRepo.activeMembership(client, roster.teamId, user.id);
  if (!canEditRoster(user, roster, membership)) throw new HttpError(403, "Captain, team leader, or administrator rights required");
  if (tournament.status === "in_progress" && !user.isAdmin) {
    throw new HttpError(403, "Only an administrator can change a roster after tournament start");
  }
  if (["completed", "cancelled"].includes(tournament.status)) throw new HttpError(409, "This tournament is read-only");
  const before = roster;
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    patch.name = normalizeRosterName(body.name);
    patch.nameKey = teamNameKey(patch.name);
  }
  if (Array.isArray(body.members)) {
    const team = await teamsRepo.findById(client, roster.teamId, true);
    const members = await normalizeRosterMembers(client, team, body.members);
    const replacements = [];
    for (const member of members) {
      const current = activeRosterMembers(roster).find((item) => item.slot === member.slot);
      if (current?.userId === member.userId) {
        if (current.factionSnapshot !== member.factionSnapshot) {
          await client.query(
            "UPDATE tournament_team_roster_members SET faction_snapshot = $2, updated_at = NOW() WHERE id = $1",
            [current.id, member.factionSnapshot]
          );
        }
      } else replacements.push({ current, member });
    }
    // End every changed slot first so a valid slot swap cannot collide with the
    // tournament-wide unique active-player constraint midway through the update.
    for (const replacement of replacements) {
      if (!replacement.current) continue;
      await client.query(
        `UPDATE tournament_team_roster_members
         SET ended_at = NOW(), replaced_by_user_id = $2, changed_by_user_id = $3, updated_at = NOW()
         WHERE id = $1`,
        [replacement.current.id, replacement.member.userId, user.id]
      );
    }
    for (const { member } of replacements) {
      await rostersRepo.insertMember(client, roster, member, user.id);
    }
    patch.status = "active" === roster.status ? "active" : "registered";
  }
  const freshMembers = Array.isArray(body.members)
    ? await rostersRepo.listMembers(client, roster.id, false)
    : activeRosterMembers(roster);
  if (Object.prototype.hasOwnProperty.call(body, "captainUserId")) {
    const captainUserId = requirePositiveIntId(body.captainUserId, 400, "Choose a captain");
    if (!freshMembers.some((member) => member.userId === captainUserId)) {
      throw new ValidationError("The captain must be one of the three roster players");
    }
    patch.captainUserId = captainUserId;
  } else if (!freshMembers.some((member) => member.userId === roster.captainUserId)) {
    throw new ValidationError("Choose a new captain when replacing the current captain");
  }
  try {
    const updated = await rostersRepo.update(client, roster.id, patch);
    await audit(client, tournament, user, "roster_update", { teamId: roster.teamId, entityType: "roster", entityId: roster.id, before, after: updated });
    return { roster: updated };
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "Roster name, seed, or player is already used in this tournament");
    throw err;
  }
}

async function withdrawRoster({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, true);
  if (!["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
    throw new HttpError(409, "A roster can be withdrawn only before tournament start");
  }
  const roster = await rostersRepo.findById(client, requirePositiveIntId(params.rosterId, 404, "Roster not found"), true);
  if (!roster || roster.tournamentId !== tournament.id) throw new HttpError(404, "Roster not found");
  const membership = await teamsRepo.activeMembership(client, roster.teamId, user.id);
  if (!canEditRoster(user, roster, membership)) throw new HttpError(403, "Captain, team leader, or administrator rights required");
  const updated = await rostersRepo.update(client, roster.id, { status: "withdrawn", withdrawnAt: nowIso(), seed: null });
  await audit(client, tournament, user, "roster_withdraw", { teamId: roster.teamId, entityType: "roster", entityId: roster.id, before: roster, after: updated });
  return { roster: updated };
}

async function deleteRoster({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, true);
  const started = Boolean(tournament.startedAt) || ["in_progress", "completed"].includes(tournament.status);
  if (started && !user.isAdmin) throw new HttpError(403, "Only an administrator can remove a roster after tournament start");
  const roster = await rostersRepo.findById(client, requirePositiveIntId(params.rosterId, 404, "Roster not found"), true);
  if (!roster || roster.tournamentId !== tournament.id) throw new HttpError(404, "Roster not found");
  const membership = await teamsRepo.activeMembership(client, roster.teamId, user.id);
  if (!canEditRoster(user, roster, membership)) throw new HttpError(403, "Captain, team leader, or administrator rights required");
  if (started) {
    if (roster.status === "withdrawn") return { deletedRosterId: roster.id, resultsPreserved: true };
    const matches = (await teamMatchesRepo.listByTournament(client, tournament.id))
      .filter((match) => match.rosterAId === roster.id || match.rosterBId === roster.id);
    const forfeitedMatchIds = [];
    for (const match of matches.filter((item) => item.phase !== "completed")) {
      // Completed personal games remain available in history, including their Elo.
      // Open games are removed so they no longer appear as unfinished obligations.
      await client.query(
        "DELETE FROM games WHERE source_type = 'team_match_game' AND source_id = $1 AND status <> 'completed'",
        [match.id]
      );
      const removedA = match.rosterAId === roster.id;
      await teamMatchesRepo.update(client, match.id, {
        phase: "completed", resolution: "forfeit", completedAt: nowIso(), teamElo: null,
        teamTournamentPointsA: removedA ? 0 : 2, teamTournamentPointsB: removedA ? 2 : 0,
        teamGamePointsA: removedA ? 0 : 60, teamGamePointsB: removedA ? 60 : 0
      });
      forfeitedMatchIds.push(match.id);
    }
    const updated = await rostersRepo.update(client, roster.id, {
      status: "withdrawn", withdrawnAt: nowIso(), seed: null, finalPlace: null
    });
    for (const roundId of new Set(matches.map((match) => match.roundId))) {
      const remaining = await teamMatchesRepo.listByRound(client, roundId);
      if (remaining.length && remaining.every((match) => match.phase === "completed")) {
        const round = (await roundsRepo.listByTournament(client, tournament.id)).find((item) => item.id === roundId);
        if (round?.status !== "completed") await roundsRepo.update(client, roundId, { status: "completed", completedAt: nowIso() });
      }
    }
    await audit(client, tournament, user, "roster_remove_after_start", {
      teamId: roster.teamId, entityType: "roster", entityId: roster.id, before: roster, after: updated,
      metadata: { forfeitedMatchIds, resultsPreserved: true }
    });
    if (tournament.status === "completed") await publishFinalStandings(client, tournament, user);
    return { deletedRosterId: roster.id, resultsPreserved: true };
  }
  // Pairings reference rosters with ON DELETE RESTRICT. Reject the delete with a
  // readable error instead of letting PostgreSQL raise a foreign key violation.
  if (await rostersRepo.countMatches(client, roster.id)) {
    throw new HttpError(409, "This roster is already paired in a round and cannot be deleted");
  }
  await rostersRepo.remove(client, roster.id);
  await audit(client, tournament, user, "roster_delete", {
    teamId: roster.teamId,
    entityType: "roster",
    entityId: roster.id,
    before: roster,
    metadata: { memberUserIds: activeRosterMembers(roster).map((member) => member.userId) }
  });
  return { deletedRosterId: roster.id };
}

async function reseedRosters(client, tournament, user, eventType = "roster_seed_update") {
  const rosters = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false });
  let seed = 0;
  for (const roster of rosters.filter((item) => ["registered", "active"].includes(item.status))) {
    seed += 1;
    if (roster.seed !== seed) await rostersRepo.update(client, roster.id, { seed });
  }
  await audit(client, tournament, user, eventType, { metadata: { rosterIds: rosters.map((item) => item.id) } });
  return rosters;
}

async function updateRosterSeedsAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, true);
  if (!user.isAdmin) throw new HttpError(403, "Administrator rights required");
  if (["in_progress", "completed", "cancelled"].includes(tournament.status)) {
    throw new HttpError(409, "Roster seeds are locked after tournament start");
  }
  const rosters = (await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false }))
    .filter((roster) => ["registered", "active"].includes(roster.status));
  const rosterIds = Array.isArray(body.rosterIds) ? body.rosterIds.map(Number) : [];
  const expected = new Set(rosters.map((roster) => roster.id));
  if (rosterIds.length !== rosters.length || new Set(rosterIds).size !== rosterIds.length || rosterIds.some((id) => !expected.has(id))) {
    throw new ValidationError("Seed order must include every active roster exactly once");
  }
  await client.query(
    "UPDATE tournament_team_rosters SET seed = NULL, updated_at = NOW() WHERE tournament_id = $1 AND status IN ('registered', 'active')",
    [tournament.id]
  );
  for (let index = 0; index < rosterIds.length; index += 1) {
    await rostersRepo.update(client, rosterIds[index], { seed: index + 1 });
  }
  await audit(client, tournament, user, "roster_seed_update", { metadata: { rosterIds } });
  return tournamentData(client, tournament, user, { includeAudit: true });
}

async function configureTeamTables(client, tournament, values) {
  if (values !== undefined) {
    if (tournament.teamTablesLocked) throw new HttpError(409, "Team tables are locked for this tournament");
    validateTeamTables(values);
    const existing = await tablesRepo.listByTournament(client, tournament.id);
    if (existing.length > 3) throw new ValidationError("Configure exactly three team tables before continuing");
    for (let i = 0; i < 3; i += 1) {
      const data = { killzone: values[i].killzone, deployment: Number(values[i].deployment) };
      if (existing[i]) await tablesRepo.update(client, existing[i].id, data);
      else await tablesRepo.insert(client, { tournamentId: tournament.id, ...data });
    }
  }
  const tables = validateTeamTables(await tablesRepo.listByTournament(client, tournament.id));
  await tournamentsRepo.update(client, tournament.id, { teamTablesLocked: true });
  return tables;
}

// Table IDs identify the three shared slots. Their terrain is snapshotted per
// round, so generating a new round never rewrites an earlier round's tables.
function tablesForRound(round, defaults) {
  return round?.metadata?.tables || defaults;
}

async function tablesForTeamMatch(client, match) {
  const rounds = await roundsRepo.listByTournament(client, match.tournamentId);
  const round = rounds.find((item) => item.id === match.roundId);
  if (round?.metadata?.tables) return round.metadata.tables;
  return tablesRepo.listByTournament(client, match.tournamentId);
}

async function nextTeamRoundTables(client, tournament, values) {
  const defaults = tournament.teamTablesLocked
    ? await tablesRepo.listByTournament(client, tournament.id)
    : await configureTeamTables(client, tournament, values);
  validateTeamTables(defaults);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const selected = validateTeamTables(values === undefined ? tablesForRound(rounds.at(-1), defaults) : values);
  return defaults.map((table, index) => ({
    id: table.id,
    tournamentId: tournament.id,
    tableNumber: index + 1,
    killzone: selected[index].killzone,
    deployment: Number(selected[index].deployment)
  }));
}

async function startTournament(client, tournament, user, body = {}) {
  const rosters = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false });
  const competitive = rosters.filter((roster) => roster.status === "registered");
  if (rosters.some((roster) => roster.status === "incomplete")) {
    throw new ValidationError("Incomplete rosters must be completed or withdrawn before start");
  }
  validateTeamTournament(tournament, competitive);
  const tables = await configureTeamTables(client, tournament, body.tables);
  for (const roster of competitive) {
    if (activeRosterMembers(roster).length !== 3) throw new ValidationError("Every active roster must contain exactly three players");
    await rostersRepo.update(client, roster.id, {
      status: "active",
      startedAt: nowIso(),
      teamNameSnapshot: roster.teamNameSnapshot,
      teamLogoSnapshot: roster.teamLogoSnapshot
    });
  }
  const updated = await tournamentsRepo.update(client, tournament.id, { status: "in_progress", startedAt: nowIso() });
  await audit(client, updated, user, "team_tournament_start", { metadata: { rosterCount: competitive.length, byeSupported: false, tables } });
  return tournamentData(client, updated, user, { includeAudit: true });
}

function applyManualMatchups(blueprint, rosters, body = {}) {
  if (!Array.isArray(body.matchups) || !body.matchups.length) return blueprint;
  if (body.matchups.length !== blueprint.pairings.length) {
    throw new ValidationError("Manual team pairings must include every roster exactly once");
  }
  const allowed = new Set(rosters.map((roster) => roster.id));
  const seen = new Set();
  const pairings = body.matchups.map((item, index) => {
    const rosterAId = Number(item.rosterAId);
    const rosterBId = item.rosterBId === null || item.rosterBId === "" ? null : Number(item.rosterBId);
    if (!allowed.has(rosterAId) || (rosterBId !== null && !allowed.has(rosterBId)) || rosterAId === rosterBId || seen.has(rosterAId) || (rosterBId !== null && seen.has(rosterBId))) {
      throw new ValidationError("Each roster must appear exactly once in a team round");
    }
    seen.add(rosterAId);
    if (rosterBId !== null) seen.add(rosterBId);
    return { bracketPosition: index + 1, rosterAId, rosterBId };
  });
  if (seen.size !== allowed.size || pairings.filter((pairing) => pairing.rosterBId === null).length !== rosters.length % 2) {
    throw new ValidationError("Manual team pairings must include every roster exactly once");
  }
  return { ...blueprint, pairings };
}

async function buildRoundPreview(client, tournament, body = {}) {
  const rosters = (await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false }))
    .filter((roster) => ["registered", "active"].includes(roster.status));
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await teamMatchesRepo.listByTournament(client, tournament.id);
  let blueprint;
  if (!rounds.length) blueprint = buildFirstTeamRound(tournament, rosters);
  else {
    const latest = rounds[rounds.length - 1];
    if (latest.status !== "completed") throw new HttpError(409, "Complete every team match before generating the next round");
    if (latest.roundNumber >= tournament.swissRoundCount) throw new HttpError(409, "All configured Swiss rounds have been generated");
    blueprint = buildNextTeamRound(tournament, rosters, matches, latest.roundNumber + 1);
  }
  return { blueprint: applyManualMatchups(blueprint, rosters, body), rosters, matches };
}

async function previewTournament(client, tournament) {
  const { blueprint } = await buildRoundPreview(client, tournament);
  return { format: "swiss", participantMode: "team", pairingType: "shield_sword", rounds: [{ ...blueprint, matches: blueprint.pairings }] };
}

async function previewNextRound(client, tournament) {
  const { blueprint } = await buildRoundPreview(client, tournament);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const defaults = await tablesRepo.listByTournament(client, tournament.id);
  return {
    tournament: tournamentSummaryView(tournament),
    round: { ...blueprint, matches: blueprint.pairings },
    tables: tablesForRound(rounds.at(-1), defaults).map(tournamentTableView),
    teamRound: true
  };
}

async function generateRound(client, tournament, user, body = {}) {
  const missions = CRIT_OPS.map((critOp) => ({ critOp }));
  const { blueprint, rosters } = await buildRoundPreview(client, tournament, body);
  const tables = await nextTeamRoundTables(client, tournament, body.tables);
  const round = await roundsRepo.insert(client, {
    tournamentId: tournament.id,
    roundNumber: blueprint.roundNumber,
    status: "active",
    generatedBy: "admin",
    metadata: { participantMode: "team", pairingType: "shield_sword", missions, tables },
    startedAt: nowIso()
  });
  for (const pairing of blueprint.pairings) {
    await teamMatchesRepo.insert(client, {
      pairingVersion: 2,
      tournamentId: tournament.id,
      roundId: round.id,
      roundNumber: round.roundNumber,
      bracketPosition: pairing.bracketPosition,
      rosterAId: pairing.rosterAId,
      rosterBId: pairing.rosterBId,
      missions,
      tableIds: tables.map((table) => table.id)
    });
  }
  if (blueprint.pairings.every((pairing) => pairing.rosterBId === null)) {
    await roundsRepo.update(client, round.id, { status: "completed", completedAt: nowIso() });
  }
  await audit(client, tournament, user, "team_round_generate", { entityType: "round", entityId: round.id, metadata: { blueprint, missions, tables } });
  return tournamentData(client, { ...tournament, teamTablesLocked: true }, user, { includeAudit: true });
}

async function requireMatchContext(client, params, user, phase = null) {
  const tournament = await requireTournament(client, params.id, true);
  if (tournament.status !== "in_progress") throw new HttpError(409, "Tournament is not in progress");
  const match = await teamMatchesRepo.findById(client, requirePositiveIntId(params.matchId, 404, "Team match not found"), true);
  if (!match || match.tournamentId !== tournament.id) throw new HttpError(404, "Team match not found");
  if (phase && match.phase !== phase) throw new HttpError(409, `Team match is not in the ${phase} phase`);
  const rosters = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: true, includeHistory: true });
  const rosterA = rosterById(rosters, match.rosterAId);
  const rosterB = rosterById(rosters, match.rosterBId);
  if (match.resolution || rosterA?.status === "withdrawn" || rosterB?.status === "withdrawn") {
    throw new HttpError(409, "Pairing is closed because a roster was removed or received a bye");
  }
  const side = rosterA?.captainUserId === user.id ? "a" : rosterB?.captainUserId === user.id ? "b" : null;
  if (!user.isAdmin && !side) throw new HttpError(403, "Only a roster captain can perform this pairing action");
  return { tournament, match, rosterA, rosterB, side };
}

async function getPairingMatch({ client, user, params }) {
  const match = await teamMatchesRepo.findById(
    client,
    requirePositiveIntId(params.matchId, 404, "Team match not found")
  );
  if (!match) throw new HttpError(404, "Team match not found");
  const tournament = await requireTournament(client, match.tournamentId);
  if (!user?.isAdmin && !tournamentsRepo.PUBLISHED_STATUSES.includes(tournament.status)) {
    throw new HttpError(404, "Team match not found");
  }
  const rosters = await rostersRepo.listByTournament(client, tournament.id, {
    includeWithdrawn: true,
    includeHistory: true
  });
  const rosterA = rosterById(rosters, match.rosterAId);
  const rosterB = rosterById(rosters, match.rosterBId);
  if (!rosterA || (!rosterB && match.resolution !== "bye")) throw new HttpError(409, "Team match rosters are unavailable");
  const tables = (await tablesForTeamMatch(client, match))
    .filter((table) => !match.tableIds.length || match.tableIds.includes(table.id))
    .map(tournamentTableView);
  return {
    tournament: {
      ...tournamentSummaryView(tournament),
      viewer: {
        role: user?.isAdmin ? "admin" : user ? "player" : "spectator",
        canAdmin: Boolean(user?.isAdmin),
        captainRosterIds: [rosterA, rosterB]
          .filter((roster) => roster && roster.captainUserId === user?.id)
          .map((roster) => roster.id)
      }
    },
    teamMatch: redactTeamMatch({ ...match, tables }, rosterA, rosterB, user),
    tables
  };
}

function actionSide(user, body, captainSide) {
  if (!user.isAdmin) return captainSide;
  const side = body.side || captainSide;
  if (!["a", "b"].includes(side)) throw new ValidationError("Administrator actions must specify side a or b");
  return side;
}

async function roll({ client, user, params, body = {} }) {
  const context = await requireMatchContext(client, params, user, "awaiting_roll");
  if (context.match.pairingVersion === 2) {
    const side = actionSide(user, body, context.side);
    const round = teamRollRound(context.match);
    if (Number(body.rollRound) !== round) throw new HttpError(409, "Refresh the pairing before rolling again");
    const history = (context.match.rollHistory || []).map((item) => ({ ...item }));
    if (history.length < round) history.push({ a: null, b: null });
    const current = history[round - 1];
    if (current[side]) throw new HttpError(409, "You have already rolled; waiting for the other captain");
    current[side] = crypto.randomInt(1, 7);
    const patch = { rollHistory: history };
    if (current.a && current.b && current.a !== current.b) {
      patch.attackerRosterId = current.a > current.b ? context.match.rosterAId : context.match.rosterBId;
      patch.defenderRosterId = current.a > current.b ? context.match.rosterBId : context.match.rosterAId;
      patch.rollResult = Math.max(current.a, current.b);
      patch.phase = "mission_ban";
    }
    const updated = await teamMatchesRepo.update(client, context.match.id, patch);
    await audit(client, context.tournament, user, "team_match_roll", { entityType: "team_match", entityId: updated.id, metadata: { side, round, result: current[side] } });
    return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
  }
  const result = crypto.randomInt(1, 7);
  const attackerRosterId = result >= 4 ? context.match.rosterAId : context.match.rosterBId;
  const defenderRosterId = attackerRosterId === context.match.rosterAId ? context.match.rosterBId : context.match.rosterAId;
  const updated = await teamMatchesRepo.update(client, context.match.id, {
    rollResult: result,
    attackerRosterId,
    defenderRosterId,
    phase: "shield_selection"
  });
  await audit(client, context.tournament, user, "team_match_roll", { entityType: "team_match", entityId: context.match.id, after: { rollResult: result, attackerRosterId, defenderRosterId } });
  return { teamMatch: updated };
}

async function banMission({ client, user, params, body = {} }) {
  const context = await requireMatchContext(client, params, user, "mission_ban");
  const side = actionSide(user, body, context.side);
  if (teamNextAction(context.match)?.side !== side) throw new HttpError(403, "Waiting for the other captain's ban");
  const mission = String(body.mission || "");
  if (!context.match.missions.some((item) => item.critOp === mission) ||
      context.match.missionBans.some((item) => item.mission === mission)) {
    throw new ValidationError("Choose an available Crit Op to ban");
  }
  const bans = [...context.match.missionBans, { side, mission }];
  const updated = await teamMatchesRepo.update(client, context.match.id, {
    missionBans: bans, phase: bans.length === 2 ? "shield_selection" : "mission_ban"
  });
  await audit(client, context.tournament, user, "mission_ban", { entityType: "team_match", entityId: updated.id, metadata: { side, mission } });
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

async function selectShield({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user, "shield_selection");
  const side = actionSide(user, body, context.side);
  const roster = side === "a" ? context.rosterA : context.rosterB;
  const memberId = requirePositiveIntId(body.memberId, 400, "Choose a shield");
  if (!rosterMember(roster, memberId)) throw new ValidationError("The shield must be a current player in this roster");
  const confirmedField = side === "a" ? "shieldAConfirmed" : "shieldBConfirmed";
  if (context.match[confirmedField] && !user.isAdmin) throw new HttpError(409, "This shield choice is already confirmed");
  const patch = side === "a"
    ? { shieldAMemberId: memberId, shieldAConfirmed: body.confirm !== false }
    : { shieldBMemberId: memberId, shieldBConfirmed: body.confirm !== false };
  const bothConfirmed = (side === "a" ? patch.shieldAConfirmed : context.match.shieldAConfirmed) &&
    (side === "b" ? patch.shieldBConfirmed : context.match.shieldBConfirmed);
  if (bothConfirmed) patch.phase = "sword_selection";
  const updated = await teamMatchesRepo.update(client, context.match.id, patch);
  await audit(client, context.tournament, user, bothConfirmed ? "shields_reveal" : "shield_select", { entityType: "team_match", entityId: context.match.id, metadata: { side, confirmed: patch[confirmedField] } });
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

async function selectSword({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user, "sword_selection");
  const side = actionSide(user, body, context.side);
  const opponent = side === "a" ? context.rosterB : context.rosterA;
  const opponentShieldId = side === "a" ? context.match.shieldBMemberId : context.match.shieldAMemberId;
  const memberId = requirePositiveIntId(body.memberId, 400, "Choose an opponent sword");
  if (!rosterMember(opponent, memberId) || memberId === opponentShieldId) {
    throw new ValidationError("Choose one of the two remaining opponent players as the sword");
  }
  const confirmedField = side === "a" ? "swordAConfirmed" : "swordBConfirmed";
  if (context.match[confirmedField] && !user.isAdmin) throw new HttpError(409, "This sword choice is already confirmed");
  const patch = side === "a"
    ? { swordAMemberId: memberId, swordAConfirmed: body.confirm !== false }
    : { swordBMemberId: memberId, swordBConfirmed: body.confirm !== false };
  const bothConfirmed = (side === "a" ? patch.swordAConfirmed : context.match.swordAConfirmed) &&
    (side === "b" ? patch.swordBConfirmed : context.match.swordBConfirmed);
  if (bothConfirmed) {
    patch.pairings = buildShieldSwordPairings(activeRosterMembers(context.rosterA), activeRosterMembers(context.rosterB), {
      shieldA: context.match.shieldAMemberId,
      shieldB: context.match.shieldBMemberId,
      swordA: side === "a" ? memberId : context.match.swordAMemberId,
      swordB: side === "b" ? memberId : context.match.swordBMemberId
    });
    patch.phase = "environment_selection";
    patch.environment = { step: 0, assignments: [] };
  }
  const updated = await teamMatchesRepo.update(client, context.match.id, patch);
  await audit(client, context.tournament, user, bothConfirmed ? "swords_reveal" : "sword_select", { entityType: "team_match", entityId: context.match.id, metadata: { side, confirmed: patch[confirmedField] } });
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

function environmentPlan(context) {
  if (context.match.pairingVersion === 2) return teamEnvironmentPlan(context.match);
  const attackerSide = context.match.attackerRosterId === context.match.rosterAId ? "a" : "b";
  const defenderSide = attackerSide === "a" ? "b" : "a";
  const attackerShieldSlot = context.match.pairings.find((pairing) => pairing.shieldOwner === attackerSide)?.slot;
  const defenderShieldSlot = context.match.pairings.find((pairing) => pairing.shieldOwner === defenderSide)?.slot;
  if (context.tournament.venueMode === "tts") {
    return [
      { side: attackerSide, kind: "mission", slot: defenderShieldSlot },
      { side: defenderSide, kind: "mission", slot: attackerShieldSlot }
    ];
  }
  return [
    { side: defenderSide, kind: "table", slot: defenderShieldSlot },
    { side: attackerSide, kind: "mission", slot: defenderShieldSlot },
    { side: attackerSide, kind: "table", slot: attackerShieldSlot },
    { side: defenderSide, kind: "mission", slot: attackerShieldSlot }
  ];
}

function validateDirectAssignments(context, assignments) {
  if (!Array.isArray(assignments) || assignments.length !== 3) throw new ValidationError("Provide all three environment assignments");
  const missionNames = new Set(context.match.missions.map((mission) => mission.critOp));
  const seenMissions = new Set();
  const seenTables = new Set();
  const bySlot = new Map();
  for (const assignment of assignments) {
    const slot = Number(assignment.slot);
    const mission = String(assignment.mission || assignment.critOp || "");
    const tableId = assignment.tableId ? Number(assignment.tableId) : null;
    if (![1, 2, 3].includes(slot) || bySlot.has(slot) || !missionNames.has(mission) || seenMissions.has(mission)) {
      throw new ValidationError("Assignments must use each pairing and round mission exactly once");
    }
    if (context.tournament.venueMode === "irl") {
      if (!context.match.tableIds.includes(tableId) || seenTables.has(tableId)) {
        throw new ValidationError("Assignments must use three different tables from this team match");
      }
      seenTables.add(tableId);
    }
    seenMissions.add(mission);
    bySlot.set(slot, { slot, mission: { critOp: mission }, tableId });
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

async function selectEnvironment({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user, "environment_selection");
  if (context.match.pairingVersion === 2) return selectTeamEnvironment(client, context, user, body);
  let assignments;
  if (user.isAdmin && Array.isArray(body.assignments)) {
    assignments = validateDirectAssignments(context, body.assignments);
  } else {
    const state = context.match.environment || { step: 0, assignments: [] };
    const plan = environmentPlan(context);
    const step = plan[Number(state.step || 0)];
    if (!step) throw new HttpError(409, "Environment selection is already complete");
    const side = actionSide(user, body, context.side);
    if (side !== step.side) throw new HttpError(403, "Waiting for the other captain's environment choice");
    assignments = [...(state.assignments || [])];
    let assignment = assignments.find((item) => item.slot === step.slot);
    if (!assignment) {
      assignment = { slot: step.slot, mission: null, tableId: null };
      assignments.push(assignment);
    }
    if (step.kind === "mission") {
      const mission = String(body.mission || body.critOp || "");
      if (!context.match.missions.some((item) => item.critOp === mission) || assignments.some((item) => item.mission?.critOp === mission)) {
        throw new ValidationError("Choose an unused mission from this round");
      }
      assignment.mission = { critOp: mission };
    } else {
      const tableId = requirePositiveIntId(body.tableId, 400, "Choose a table");
      if (!context.match.tableIds.includes(tableId) || assignments.some((item) => item.tableId === tableId)) {
        throw new ValidationError("Choose an unused table assigned to this team match");
      }
      assignment.tableId = tableId;
    }
    if (Number(state.step || 0) + 1 < plan.length) {
      const updated = await teamMatchesRepo.update(client, context.match.id, { environment: { step: Number(state.step || 0) + 1, assignments } });
      await audit(client, context.tournament, user, "environment_select", { entityType: "team_match", entityId: context.match.id, metadata: { step } });
      return { teamMatch: updated };
    }
    const usedMissions = new Set(assignments.map((item) => item.mission?.critOp).filter(Boolean));
    const usedTables = new Set(assignments.map((item) => item.tableId).filter(Boolean));
    const finalSlot = [1, 2, 3].find((slot) => !assignments.some((item) => item.slot === slot));
    assignments.push({
      slot: finalSlot,
      mission: context.match.missions.find((mission) => !usedMissions.has(mission.critOp)),
      tableId: context.tournament.venueMode === "irl"
        ? context.match.tableIds.find((tableId) => !usedTables.has(tableId))
        : null
    });
    assignments.sort((a, b) => a.slot - b.slot);
  }
  await createPersonalGames(client, context, assignments, user);
  const updated = await teamMatchesRepo.findById(client, context.match.id);
  return { teamMatch: updated };
}

async function selectTeamEnvironment(client, context, user, body) {
  const { match } = context;
  const state = match.environment || { step: 0, assignments: [] };
  const step = teamNextAction(match);
  if (!step) throw new HttpError(409, "Environment selection is already complete");
  if (actionSide(user, body, context.side) !== step.side) throw new HttpError(403, "Waiting for the other captain's environment choice");
  if (Number(body.step) !== Number(state.step)) throw new HttpError(409, "Refresh the pairing before making this choice");
  const assignments = (state.assignments || []).map((item) => ({ ...item, mission: { ...item.mission } }));
  let assignment = assignments.find((item) => item.slot === step.slot);
  if (!assignment) {
    assignment = { slot: step.slot, mission: {}, tableId: null };
    assignments.push(assignment);
  }
  const tables = await tablesForTeamMatch(client, match);
  if (step.kind === "table") {
    const tableId = requirePositiveIntId(body.tableId, 400, "Choose a table");
    const table = tables.find((item) => item.id === tableId);
    if (!table || !match.tableIds.includes(tableId) || assignments.some((item) => item.tableId === tableId)) {
      throw new ValidationError("Choose an unused table assigned to this team match");
    }
    assignment.tableId = tableId;
    assignment.mission = { ...assignment.mission, killzone: table.killzone, layout: table.deployment };
  } else {
    const mission = String(body.mission || "");
    if (!match.missions.some((item) => item.critOp === mission) || match.missionBans.some((item) => item.mission === mission) ||
        assignments.some((item) => item.mission.critOp === mission)) {
      throw new ValidationError("Choose an unused, unbanned Crit Op");
    }
    assignment.mission.critOp = mission;
  }
  // As soon as the second table is chosen, the last table is public too.
  if (Number(state.step) === 2) {
    const table = tables.find((item) => match.tableIds.includes(item.id) && !assignments.some((a) => a.tableId === item.id));
    if (!table) throw new HttpError(409, "The third team table is unavailable");
    assignments.push({ slot: 3, tableId: table.id, mission: { killzone: table.killzone, layout: table.deployment } });
  }
  assignments.sort((a, b) => a.slot - b.slot);
  await audit(client, context.tournament, user, "environment_select", { entityType: "team_match", entityId: match.id, metadata: { step, assignment } });
  if (Number(state.step) + 1 === teamEnvironmentPlan(match).length) {
    if (assignments.length !== 3 || assignments.some((item) => !item.tableId || !item.mission.critOp || !item.mission.killzone || !item.mission.layout)) {
      throw new HttpError(409, "Complete all three game assignments first");
    }
    await createPersonalGames(client, context, assignments, user);
  } else {
    await teamMatchesRepo.update(client, match.id, { environment: { step: Number(state.step) + 1, assignments } });
  }
  const updated = await teamMatchesRepo.findById(client, match.id);
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

async function createPersonalGames(client, context, assignments, user) {
  const existing = context.match.games || await teamMatchesRepo.listGameLinks(client, context.match.id);
  if (existing.length === 3) {
    await teamMatchesRepo.update(client, context.match.id, { phase: "in_progress", environment: { step: "complete", assignments } });
    return existing;
  }
  const pairingBySlot = new Map(context.match.pairings.map((pairing) => [pairing.slot, pairing]));
  for (const assignment of assignments) {
    if (existing.some((link) => link.slot === assignment.slot)) continue;
    const pairing = pairingBySlot.get(assignment.slot);
    const memberA = rosterMember(context.rosterA, pairing.rosterAMemberId);
    const memberB = rosterMember(context.rosterB, pairing.rosterBMemberId);
    if (!memberA || !memberB) throw new HttpError(409, "A paired player is no longer available");
    const game = await gamesRepo.insert(client, {
      challengeId: null,
      playerIds: [memberA.userId, memberB.userId],
      sourceType: "team_match_game",
      sourceId: context.match.id,
      venueMode: context.tournament.venueMode,
      participants: [
        { userId: memberA.userId, resultKey: memberA.userId, displayNameSnapshot: memberA.displayNameSnapshot, factionSnapshot: memberA.factionSnapshot },
        { userId: memberB.userId, resultKey: memberB.userId, displayNameSnapshot: memberB.displayNameSnapshot, factionSnapshot: memberB.factionSnapshot }
      ]
    });
    await teamMatchesRepo.insertGameLink(client, {
      teamMatchId: context.match.id,
      gameId: game.id,
      slot: assignment.slot,
      rosterAMemberId: memberA.id,
      rosterBMemberId: memberB.id,
      mission: assignment.mission,
      tableId: assignment.tableId
    });
  }
  await teamMatchesRepo.update(client, context.match.id, { phase: "in_progress", environment: { step: "complete", assignments } });
  await audit(client, context.tournament, user, "personal_games_create", { entityType: "team_match", entityId: context.match.id, metadata: { assignments } });
}

function redactTeamMatch(match, rosterA, rosterB, user) {
  const admin = Boolean(user?.isAdmin);
  const side = rosterA?.captainUserId === user?.id ? "a" : rosterB?.captainUserId === user?.id ? "b" : null;
  const shieldsRevealed = match.shieldAConfirmed && match.shieldBConfirmed;
  const swordsRevealed = match.swordAConfirmed && match.swordBConfirmed;
  const progress = teamMatchProgress(match);
  return {
    ...match,
    progress,
    games: (match.games || []).map((link) => {
      const score = progress.details.find((item) => item.slot === link.slot);
      return { ...link, table: match.tables?.find((table) => table.id === link.tableId) || link.table,
        gamePointsA: score?.a ?? null, gamePointsB: score?.b ?? null };
    }),
    nextAction: teamNextAction(match),
    rollRound: teamRollRound(match),
    shieldAMemberId: admin || shieldsRevealed || side === "a" ? match.shieldAMemberId : null,
    shieldBMemberId: admin || shieldsRevealed || side === "b" ? match.shieldBMemberId : null,
    swordAMemberId: admin || swordsRevealed || side === "a" ? match.swordAMemberId : null,
    swordBMemberId: admin || swordsRevealed || side === "b" ? match.swordBMemberId : null,
    rosterA,
    rosterB
  };
}

async function tournamentData(client, tournament, user, { includeAudit = false } = {}) {
  const storedRosters = await rostersRepo.listByTournament(client, tournament.id, {
    includeWithdrawn: true,
    includeHistory: includeAudit
  });
  const myTeams = user ? await teamsRepo.listForUser(client, user.id) : [];
  const rosters = storedRosters.map((roster) => rosterForViewer(roster, tournament, user, {
    teamLeader: myTeams.some((team) => team.id === roster.teamId && team.leaderUserId === user?.id)
  }));
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const rawMatches = await teamMatchesRepo.listByTournament(client, tournament.id);
  const tables = await tablesRepo.listByTournament(client, tournament.id);
  const activeRosters = rosters.filter((roster) => roster.status !== "withdrawn");
  const matches = rawMatches.map((match) => redactTeamMatch({
    ...match,
    tables: tablesForRound(rounds.find((round) => round.id === match.roundId), tables)
      .filter((table) => !match.tableIds.length || match.tableIds.includes(table.id)).map(tournamentTableView)
  }, rosterById(rosters, match.rosterAId), rosterById(rosters, match.rosterBId), user));
  const tournamentGames = matches.flatMap((match) => match.games || []).filter((link) => link.game).map((link) => {
    const playerMembers = [
      rosters.flatMap((roster) => roster.members).find((member) => member.id === link.rosterAMemberId),
      rosters.flatMap((roster) => roster.members).find((member) => member.id === link.rosterBMemberId)
    ];
    return gameView({
      ...link.game,
      sourceType: "team_match_game",
      sourceId: matchIdForLink(matches, link),
      players: playerMembers.map((member) => ({ id: member?.userId, userId: member?.userId, name: member?.displayNameSnapshot || "Player", faction: member?.factionSnapshot || "", hasProfile: Boolean(member?.userId) })),
      teamTournamentGame: { ...link, missionLocked: matches.find((match) => match.id === link.teamMatchId)?.pairingVersion === 2 }
    });
  });
  const viewerTeams = [];
  for (const team of myTeams) {
    const memberships = await teamsRepo.listMemberships(client, team.id);
    viewerTeams.push({ ...team, defaultRosterName: defaultRosterName(team, storedRosters), members: memberships.filter((membership) => !membership.endedAt) });
  }
  if (user?.isAdmin) {
    const membersByTeam = new Map();
    for (const roster of rosters) {
      if (!membersByTeam.has(roster.teamId)) {
        const memberships = await teamsRepo.listMemberships(client, roster.teamId);
        membersByTeam.set(roster.teamId, memberships.filter((membership) => !membership.endedAt));
      }
      roster.availableMembers = membersByTeam.get(roster.teamId);
    }
  }
  let auditEvents = [];
  if (includeAudit) {
    const { rows } = await client.query(
      "SELECT * FROM player_team_audit_events WHERE tournament_id = $1 ORDER BY created_at DESC, id DESC LIMIT 500",
      [tournament.id]
    );
    auditEvents = rows;
  }
  return {
    tournament: {
      ...tournamentSummaryView(tournament),
      viewer: {
        role: user?.isAdmin ? "admin" : "spectator",
        canAdmin: Boolean(user?.isAdmin),
        captainRosterIds: activeRosters.filter((roster) => roster.captainUserId === user?.id).map((roster) => roster.id)
      }
    },
    participants: [],
    rosters,
    tables: tablesForRound(rounds.at(-1), tables).map(tournamentTableView),
    rounds: rounds.map((round) => ({ ...round, tables: tablesForRound(round, tables).map(tournamentTableView),
      matches: matches.filter((match) => match.roundId === round.id) })),
    teamMatches: matches,
    standings: teamStandings(activeRosters, rawMatches).map((row) => ({ ...row, rosterId: row.roster.id, roster: undefined })),
    tournamentGames,
    viewerTeams,
    finalResults: tournament.finalResults || null,
    auditEvents
  };
}

async function attachTeamGameDetails(client, games) {
  const ids = games
    .filter((game) => game.sourceType === "team_match_game" && Number.isInteger(game.id))
    .map((game) => game.id);
  if (!ids.length) return games;
  const { rows } = await client.query(
    `SELECT l.*, tm.tournament_id, tm.round_number, tm.phase, tm.roster_a_id, tm.roster_b_id, tm.pairing_version,
            ra.name AS roster_a_name, ra.team_id AS team_a_id, ra.team_name_snapshot AS team_a_name,
            rb.name AS roster_b_name, rb.team_id AS team_b_id, rb.team_name_snapshot AS team_b_name,
            t.slug AS tournament_slug, t.name AS tournament_name, t.venue_mode
     FROM tournament_team_match_games l
     JOIN tournament_team_matches tm ON tm.id = l.team_match_id
     JOIN tournament_team_rosters ra ON ra.id = tm.roster_a_id
     JOIN tournament_team_rosters rb ON rb.id = tm.roster_b_id
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE l.game_id = ANY($1::int[])`,
    [ids]
  );
  const participants = await gameParticipantsRepo.listByGameIds(client, ids);
  const linkByGameId = new Map(rows.map((row) => [row.game_id, row]));
  const participantsByGameId = new Map();
  for (const participant of participants) {
    if (!participantsByGameId.has(participant.gameId)) participantsByGameId.set(participant.gameId, []);
    participantsByGameId.get(participant.gameId).push(participant);
  }
  return games.map((game) => {
    const link = linkByGameId.get(game.id);
    if (!link) return game;
    return {
      ...game,
      players: (participantsByGameId.get(game.id) || []).map((participant) => ({
        id: participant.resultKey,
        userId: participant.userId,
        name: participant.displayNameSnapshot,
        faction: participant.factionSnapshot,
        avatarUrl: participant.user?.avatarUrl || null,
        hasProfile: Boolean(participant.userId)
      })),
      tournament: {
        id: link.tournament_id,
        slug: link.tournament_slug,
        name: link.tournament_name,
        venueMode: link.venue_mode,
        participantMode: "team"
      },
      teamMatch: {
        id: link.team_match_id,
        roundNumber: link.round_number,
        phase: link.phase,
        rosterA: { id: link.roster_a_id, name: link.roster_a_name, teamId: link.team_a_id, teamName: link.team_a_name },
        rosterB: { id: link.roster_b_id, name: link.roster_b_name, teamId: link.team_b_id, teamName: link.team_b_name }
      },
      teamTournamentGame: {
        missionLocked: link.pairing_version === 2,
        id: link.id,
        slot: link.slot,
        mission: link.mission || {},
        tableId: link.table_id,
        gamePointsA: link.game_points_a,
        gamePointsB: link.game_points_b
      }
    };
  });
}

function matchIdForLink(matches, link) {
  return matches.find((match) => (match.games || []).some((candidate) => candidate.id === link.id))?.id || null;
}

async function resetMatchAdmin({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user);
  if (!user.isAdmin) throw new HttpError(403, "Administrator rights required");
  const targetPhase = String(body.phase || "awaiting_roll");
  const allowed = ["awaiting_roll", "shield_selection", "sword_selection", "environment_selection"];
  if (context.match.pairingVersion === 2) allowed.push("mission_ban");
  if (!allowed.includes(targetPhase)) throw new ValidationError("Choose a valid reset phase");
  const phases = ["awaiting_roll", "mission_ban", "shield_selection", "sword_selection", "environment_selection", "in_progress", "completed"];
  if (phases.indexOf(targetPhase) > phases.indexOf(context.match.phase)) throw new HttpError(409, "Reset cannot skip pairing steps");
  if ((context.match.games || []).some((link) => link.game?.status === "completed") && !body.confirmResultsReset) {
    throw new HttpError(409, "Confirm removal of existing personal results before resetting pairing");
  }
  const games = (context.match.games || []).map((link) => link.game).filter(Boolean);
  for (const game of games) {
    if (game.elo) {
      for (const playerId of game.playerIds) {
        const delta = Number(game.elo?.[playerId]?.delta || 0);
        if (delta) await usersRepo.addRating(client, playerId, -delta, context.tournament.venueMode);
        const combinedDelta = Number(game.elo?.combined?.[playerId]?.delta || 0);
        if (combinedDelta) await usersRepo.addRating(client, playerId, -combinedDelta, "combined");
      }
    }
  }
  await gamesRepo.removeBySourceIds(client, "team_match_game", [context.match.id]);
  const clear = {
    phase: targetPhase,
    environment: null,
    gamePoints: null,
    teamGamePointsA: null,
    teamGamePointsB: null,
    teamTournamentPointsA: null,
    teamTournamentPointsB: null,
    teamElo: null,
    completedAt: null
  };
  if (targetPhase !== "environment_selection") clear.pairings = null;
  if (targetPhase === "awaiting_roll") Object.assign(clear, { rollResult: null, attackerRosterId: null, defenderRosterId: null });
  if (targetPhase === "awaiting_roll") clear.rollHistory = [];
  if (["awaiting_roll", "mission_ban"].includes(targetPhase)) clear.missionBans = [];
  if (targetPhase === "mission_ban") Object.assign(clear, { shieldAMemberId: null, shieldBMemberId: null, shieldAConfirmed: false, shieldBConfirmed: false, swordAMemberId: null, swordBMemberId: null, swordAConfirmed: false, swordBConfirmed: false });
  if (["awaiting_roll", "shield_selection"].includes(targetPhase)) Object.assign(clear, { shieldAMemberId: null, shieldBMemberId: null, shieldAConfirmed: false, shieldBConfirmed: false });
  if (["awaiting_roll", "shield_selection", "sword_selection"].includes(targetPhase)) Object.assign(clear, { swordAMemberId: null, swordBMemberId: null, swordAConfirmed: false, swordBConfirmed: false });
  const updated = await teamMatchesRepo.update(client, context.match.id, clear);
  await roundsRepo.update(client, context.match.roundId, { status: "active", completedAt: null });
  await recalculateCompletedGameRatings(client);
  await recalculateTeamRatings(client);
  await audit(client, context.tournament, user, "team_match_reset", { entityType: "team_match", entityId: context.match.id, before: context.match, after: updated });
  return { teamMatch: updated };
}

async function overridePairingsAdmin({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user);
  if (!user.isAdmin) throw new HttpError(403, "Administrator rights required");
  if (!["environment_selection", "in_progress"].includes(context.match.phase)) throw new HttpError(409, "Player pairings are not available yet");
  if ((context.match.games || []).length) throw new HttpError(409, "Reset personal games before changing player pairings");
  const pairings = Array.isArray(body.pairings) ? body.pairings.map((pairing, index) => ({
    slot: index + 1,
    rosterAMemberId: Number(pairing.rosterAMemberId),
    rosterBMemberId: Number(pairing.rosterBMemberId),
    shieldOwner: context.match.pairingVersion === 2 ? (index === 0 ? "a" : index === 1 ? "b" : null) : null
  })) : [];
  const a = new Set(pairings.map((pairing) => pairing.rosterAMemberId));
  const b = new Set(pairings.map((pairing) => pairing.rosterBMemberId));
  if (pairings.length !== 3 || a.size !== 3 || b.size !== 3 || pairings.some((pairing) => !rosterMember(context.rosterA, pairing.rosterAMemberId) || !rosterMember(context.rosterB, pairing.rosterBMemberId))) {
    throw new ValidationError("Manual pairings must use every player exactly once");
  }
  const updated = await teamMatchesRepo.update(client, context.match.id, { pairings, phase: "environment_selection", environment: { step: 0, assignments: [] } });
  await audit(client, context.tournament, user, "team_pairings_override", { entityType: "team_match", entityId: context.match.id, before: context.match.pairings, after: pairings });
  return { teamMatch: updated };
}

async function applyFinalGameResult(client, tournament, game, result, submittedBy, replaceCompleted = false) {
  const gamesApi = require("./games");
  if (replaceCompleted && game.elo) await gamesApi.reverseElo(client, game);
  const people = await usersRepo.lockByIds(client, game.playerIds);
  const playerA = people.find((person) => person.id === game.playerIds[0]);
  const playerB = people.find((person) => person.id === game.playerIds[1]);
  if (!playerA || !playerB) throw new HttpError(409, "A paired player is no longer available");
  if (tournament.ratingPolicy === "unranked") {
    return gamesRepo.saveFinalResult(client, game.id, {
      result: { ...result, confirmedBy: submittedBy, confirmedAt: nowIso() },
      elo: null,
      submittedBy,
      newSubmission: true
    });
  }
  return gamesApi.applyElo(client, game, playerA, playerB, result, submittedBy, {
    newSubmission: true,
    submittedBy
  });
}

async function handleGameRequest(context, action) {
  const { client, user, params, body = {} } = context;
  const game = await gamesRepo.lockById(client, requirePositiveIntId(params.id, 404, "Game not found"));
  if (!game || game.sourceType !== "team_match_game") throw new HttpError(404, "Team tournament game not found");
  const match = await teamMatchesRepo.findByGameId(client, game.id);
  if (!match) throw new HttpError(409, "Team tournament game link is invalid");
  const tournament = await tournamentsRepo.lockById(client, match.tournamentId);
  const removed = await client.query(
    "SELECT id FROM tournament_team_rosters WHERE id = ANY($1::int[]) AND status = 'withdrawn'",
    [[match.rosterAId, match.rosterBId].filter(Boolean)]
  );
  if (match.resolution || removed.rowCount) throw new HttpError(409, "Results involving a removed roster are preserved and cannot be reopened");
  const isParticipant = game.playerIds.includes(user.id);
  if (!user.isAdmin && !isParticipant) throw new HttpError(403, "Only a game participant can change this result");
  const link = match.games.find((item) => item.gameId === game.id);
  if (body.tiebreakers?.enabled && ["submit", "admin-save"].includes(action)) {
    throw new ValidationError("Individual tiebreakers are not allowed in team tournaments");
  }
  const resultBody = { ...body, tiebreakers: { enabled: false }, ...(match.pairingVersion === 2 ? { killzone: link.mission } : {}) };
  if (action === "submit") {
    if (game.status === "completed") throw new HttpError(409, "This game result has already been saved");
    const result = calculateSubmittedResult(resultBody, game.playerIds[0], game.playerIds[1]);
    if (tournament.venueMode === "irl") {
      await applyFinalGameResult(client, tournament, game, result, user.id);
      await recomputeTeamMatch(client, match.id);
    } else {
      await gamesRepo.savePendingResult(client, game.id, { submittedBy: user.id, pendingResult: { submittedBy: user.id, submittedAt: nowIso(), result } });
    }
  } else if (action === "confirm") {
    if (game.status !== "pending_confirmation" || !game.pendingResult?.result) throw new HttpError(409, "There is no submitted result to confirm");
    if (!user.isAdmin && game.pendingResult.submittedBy === user.id) throw new HttpError(403, "The other player must confirm this result");
    const pendingResult = calculateSubmittedResult({ ...game.pendingResult.result, tiebreakers: { enabled: false } }, game.playerIds[0], game.playerIds[1]);
    await applyFinalGameResult(client, tournament, game, pendingResult, user.id);
    await recomputeTeamMatch(client, match.id);
  } else if (action === "reject") {
    if (game.status !== "pending_confirmation" || !game.pendingResult?.result) throw new HttpError(409, "There is no submitted result to reject");
    if (!user.isAdmin && game.pendingResult.submittedBy === user.id) throw new HttpError(403, "The other player must reject this result");
    await gamesRepo.clearResult(client, game.id);
  } else if (action === "admin-save") {
    if (!user.isAdmin) throw new HttpError(403, "Administrator rights required");
    if (!["open", "pending_confirmation", "completed"].includes(game.status)) throw new HttpError(409, "This game result cannot be edited");
    const result = calculateSubmittedResult(resultBody, game.playerIds[0], game.playerIds[1]);
    await applyFinalGameResult(client, tournament, game, result, user.id, game.status === "completed");
    await recalculateCompletedGameRatings(client);
    await recomputeTeamMatch(client, match.id);
  }
  await audit(client, tournament, user, `team_game_result_${action}`, { entityType: "game", entityId: game.id });
  return require("./games").viewOf(client, await gamesRepo.findById(client, game.id));
}

async function recomputeTeamMatch(client, matchId) {
  const match = await teamMatchesRepo.findById(client, matchId, true);
  if (match.resolution) return match;
  const links = match.games || [];
  if (!links.length) return match;
  const progress = teamMatchProgress(match);
  const complete = links.length === 3 && progress.completed === 3;
  for (const link of links) {
    const score = progress.details.find((item) => item.slot === link.slot);
    await teamMatchesRepo.updateGamePoints(client, link.id, score?.a ?? null, score?.b ?? null);
  }
  const teamPoints = complete ? teamTournamentPoints(progress.gpA) : null;
  const updated = await teamMatchesRepo.update(client, match.id, {
    phase: complete ? "completed" : "in_progress",
    gamePoints: progress.details,
    teamGamePointsA: progress.gpA,
    teamGamePointsB: progress.gpB,
    teamTournamentPointsA: teamPoints?.a ?? null,
    teamTournamentPointsB: teamPoints?.b ?? null,
    completedAt: complete ? match.completedAt || nowIso() : null
  });
  const roundMatches = await teamMatchesRepo.listByRound(client, match.roundId);
  if (complete && roundMatches.every((item) => item.id === match.id || item.phase === "completed")) {
    await roundsRepo.update(client, match.roundId, { status: "completed", completedAt: nowIso() });
  }
  if (complete || match.phase === "completed") await recalculateTeamRatings(client);
  return updated;
}

async function recalculateTeamRatings(client) {
  await teamsRepo.resetRatings(client);
  const rows = await teamMatchesRepo.listCompletedForRatingReplay(client);
  const ratings = { tts: new Map(), irl: new Map() };
  function rating(map, id) {
    if (!map.has(id)) map.set(id, 1000);
    return map.get(id);
  }
  for (const row of rows) {
    if (row.team_a_id === row.team_b_id) {
      await teamMatchesRepo.update(client, row.id, { teamElo: null });
      continue;
    }
    const venue = row.venue_mode === "irl" ? "irl" : "tts";
    const track = ratings[venue];
    const beforeA = rating(track, row.team_a_id);
    const beforeB = rating(track, row.team_b_id);
    const scoreA = row.team_tournament_points_a === 2 ? 1 : row.team_tournament_points_a === 1 ? 0.5 : 0;
    const { deltaA, deltaB } = calculateElo(beforeA, beforeB, scoreA);
    track.set(row.team_a_id, beforeA + deltaA);
    track.set(row.team_b_id, beforeB + deltaB);
    await teamsRepo.setRating(client, row.team_a_id, venue, beforeA + deltaA);
    await teamsRepo.setRating(client, row.team_b_id, venue, beforeB + deltaB);
    await teamMatchesRepo.update(client, row.id, { teamElo: {
      k: ELO_K,
      [row.team_a_id]: { before: beforeA, after: beforeA + deltaA, delta: deltaA },
      [row.team_b_id]: { before: beforeB, after: beforeB + deltaB, delta: deltaB }
    } });
  }
}

async function publishFinalStandings(client, tournament, user) {
  const rosters = (await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false }))
    .filter((roster) => ["active", "finished"].includes(roster.status));
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await teamMatchesRepo.listByTournament(client, tournament.id);
  if (rounds.length < tournament.swissRoundCount || matches.some((match) => match.phase !== "completed")) {
    throw new HttpError(409, "Complete all configured team rounds before publishing standings");
  }
  const standings = teamStandings(rosters, matches);
  const finalResults = standings.map((row) => ({
    rank: row.rank,
    rosterId: row.roster.id,
    teamTournamentPoints: row.teamTournamentPoints,
    teamGamePoints: row.teamGamePoints,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    individualWins: row.individualWins,
    totalVp: row.totalVp,
    tacOpPoints: row.tacOpPoints
  }));
  for (const row of standings) await rostersRepo.update(client, row.roster.id, { status: "finished", finalPlace: row.rank, finishedAt: nowIso() });
  const updated = await tournamentsRepo.update(client, tournament.id, { status: "completed", completedAt: nowIso(), finalResults });
  await audit(client, updated, user, "team_standings_publish", { after: finalResults });
  return tournamentData(client, updated, user, { includeAudit: true });
}

async function deleteTournamentGames(client, tournamentId) {
  const matches = await teamMatchesRepo.listByTournament(client, tournamentId);
  return gamesRepo.removeBySourceIds(client, "team_match_game", matches.map((match) => match.id));
}

async function rollbackLatestRound(client, tournament, user) {
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const round = rounds[rounds.length - 1];
  if (!round) throw new HttpError(409, "There is no team round to roll back");
  const matches = await teamMatchesRepo.listByRound(client, round.id);
  const fullMatches = await teamMatchesRepo.listByTournament(client, tournament.id);
  const latest = fullMatches.filter((match) => match.roundId === round.id);
  if (latest.some((match) => (match.phase === "completed" && !match.resolution) || match.games.some((link) => link.game?.status === "completed"))) {
    throw new HttpError(409, "Reset completed team-match results before rolling back this round");
  }
  await gamesRepo.removeBySourceIds(client, "team_match_game", matches.map((match) => match.id));
  await teamMatchesRepo.removeByRound(client, round.id);
  await roundsRepo.remove(client, round.id);
  await audit(client, tournament, user, "team_round_rollback", { entityType: "round", entityId: round.id, before: { round, matches } });
  return tournamentData(client, tournament, user, { includeAudit: true });
}

module.exports = {
  registerRoster,
  updateRoster,
  withdrawRoster,
  deleteRoster,
  reseedRosters,
  updateRosterSeedsAdmin,
  startTournament,
  previewTournament,
  previewNextRound,
  generateRound,
  getPairingMatch,
  roll,
  banMission,
  selectShield,
  selectSword,
  selectEnvironment,
  resetMatchAdmin,
  overridePairingsAdmin,
  handleGameRequest,
  recomputeTeamMatch,
  recalculateTeamRatings,
  publishFinalStandings,
  deleteTournamentGames,
  rollbackLatestRound,
  tournamentData,
  attachTeamGameDetails,
  redactTeamMatch
};

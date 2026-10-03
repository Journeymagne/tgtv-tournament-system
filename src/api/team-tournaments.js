const { canManageTournament, tournamentPermissions } = require("../domain/access");
const crypto = require("node:crypto");
const { HttpError, ValidationError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const { clearPreparedRounds, requirePreparedFirstRound } = require("./tournament-preparation");
const tournamentsRepo = require("../db/repositories/tournaments");
const roundsRepo = require("../db/repositories/tournament-rounds");
const tablesRepo = require("../db/repositories/tournament-tables");
const { saveTableImage } = require("./tournament-table-images");
const pairingLog = require("./team-pairing-log");
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
const { teamGamePermissions } = require("../domain/team-game-permissions");
const { participantResultKey } = require("../domain/tournaments/results");
const {
  validateTeamTournament,
  buildFirstTeamRound,
  buildNextTeamRound,
  teamStandings,
  teamMatchProgress,
  validateTeamTables,
  validateTeamLines,
  normalizeRoundMissions,
  numberTeamTables,
  teamEnvironmentPlan,
  teamRollRound,
  teamNextAction,
  buildShieldSwordPairings,
  teamPointsForMatch
} = require("../domain/team-tournaments");

function nowIso() {
  return new Date().toISOString();
}

async function audit(client, tournament, user, eventType, details = {}) {
  return teamsRepo.audit(client, {
    tournamentId: tournament.id,
    actorUserId: user?.id || null,
    eventType,
    ...details,
    metadata: { ...details.metadata, actorName: user?.name || null, actorIsAdmin: Boolean(canManageTournament(user, tournament)) }
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
  return (roster.members || []).filter((member) => !member.endedAt && (member.userId || member.isProxy));
}

function rosterMember(roster, memberId) {
  return activeRosterMembers(roster).find((member) => member.id === Number(memberId)) || null;
}

function rosterById(rosters, id) {
  return rosters.find((roster) => roster.id === Number(id)) || null;
}

function canEditRoster(user, roster, teamMembership) {
  if (!user) return false;
  if (canManageTournament(user, roster.tournamentId)) return true;
  return roster.captainUserId === user.id || teamMembership?.role === "leader";
}

async function normalizeRosterMembers(client, team, values, { allowProxies = false, existingRoster = null } = {}) {
  if (!Array.isArray(values) || values.length !== 3) {
    throw new ValidationError("A tournament roster must contain exactly three players");
  }
  if (values.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new ValidationError("Choose three valid players");
  }
  const previous = activeRosterMembers(existingRoster || {});
  const userIds = values.filter((item) => item.proxy !== true)
    .map((item) => requirePositiveIntId(item.userId, 400, "Choose three valid players"));
  if (new Set(userIds).size !== userIds.length) throw new ValidationError("Roster players must be unique");
  const memberships = [];
  for (const id of userIds) memberships.push(await teamsRepo.activeMembership(client, team.id, id));
  if (memberships.some((membership) => !membership)) {
    throw new ValidationError("Every roster player must be a current member of the same team");
  }
  const people = await usersRepo.findByIds(client, userIds);
  if (people.length !== userIds.length) throw new ValidationError("Every roster player must have an active account");
  const members = [];
  for (const [index, item] of values.entries()) {
    if (item.proxy === true) {
      if (item.userId != null) throw new ValidationError("A proxy cannot have a registered account");
      const current = previous.find((member) => member.slot === index + 1 && member.isProxy);
      if (!allowProxies && !current) throw new HttpError(403, "Only tournament administrators can add roster proxies");
      let displayNameSnapshot = current?.displayNameSnapshot;
      if (!displayNameSnapshot) {
        do {
          const { rows: [row] } = await client.query("SELECT nextval('tournament_proxy_number') AS number");
          displayNameSnapshot = "Proxybot " + row.number;
        } while ([...people.map((person) => person.name), ...members.map((member) => member.displayNameSnapshot)]
          .some((name) => name.toLowerCase() === displayNameSnapshot.toLowerCase()));
      }
      members.push({ userId: null, isProxy: true, slot: index + 1, displayNameSnapshot,
        factionSnapshot: item.faction ? requireKillTeam(item.faction) : "" });
      continue;
    }
    const userId = requirePositiveIntId(item.userId, 400, "Choose three valid players");
    const person = people.find((candidate) => candidate.id === userId);
    members.push({
      userId,
      isProxy: false,
      slot: index + 1,
      displayNameSnapshot: person.name,
      factionSnapshot: requireKillTeam(item.faction)
    });
  }
  return members;
}

function rosterCaptainUserId(members, value, { allowNoCaptain = false } = {}) {
  if (allowNoCaptain && members.every((member) => member.isProxy) && (value == null || value === "")) return null;
  const captainUserId = requirePositiveIntId(value, 400, "Choose a captain");
  if (!members.some((member) => member.userId === captainUserId)) {
    throw new ValidationError("The captain must be one of the three roster players");
  }
  return captainUserId;
}

async function registerRoster({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, true);
  const registrationStatuses = canManageTournament(user, tournament)
    ? ["draft", "registration_open", "registration_closed"]
    : ["registration_open"];
  if (!registrationStatuses.includes(tournament.status)) throw new HttpError(409, "Team registration is not open");
  if (body.reserve === true) return require("./roster-reservations").create(client, tournament, user, body);
  const teamId = requirePositiveIntId(body.teamId, 400, "Choose a team");
  const team = await teamsRepo.findById(client, teamId, true);
  if (!team) throw new HttpError(404, "Team not found");
  if (team.archivedAt) throw new HttpError(409, "Archived teams cannot register rosters");
  const registrarMembership = await teamsRepo.activeMembership(client, team.id, user.id);
  if (!registrarMembership && !canManageTournament(user, tournament)) throw new HttpError(403, "Only a current team member can register a roster");
  const members = await normalizeRosterMembers(client, team, body.members, { allowProxies: canManageTournament(user, tournament) });
  if (!canManageTournament(user, tournament) && !members.some((member) => member.userId === user.id)) {
    throw new ValidationError("The registering player must be included in the roster");
  }
  const captainUserId = rosterCaptainUserId(members, body.captainUserId, { allowNoCaptain: canManageTournament(user, tournament) });
  const existing = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: true });
  if (tournament.registrationLimit && existing.filter((roster) => roster.status !== "withdrawn").length >= tournament.registrationLimit) {
    throw new HttpError(409, "Registration limit reached");
  }
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
    await clearPreparedRounds(client, tournament);
    await audit(client, tournament, user, "roster_create", { teamId: team.id, entityType: "roster", entityId: roster.id, after: roster });
    return { status: 201, body: { roster: rosterForViewer(roster, user) } };
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
  if (roster.isReserve) return require("./roster-reservations").fill(client, tournament, roster, user, body);
  const membership = await teamsRepo.activeMembership(client, roster.teamId, user.id);
  if (!canEditRoster(user, roster, membership)) throw new HttpError(403, "Captain, team leader, or administrator rights required");
  const nameOnly = Object.keys(body).length === 1 && Object.hasOwn(body, "name");
  if (tournament.status === "in_progress" && !canManageTournament(user, tournament) && !nameOnly) {
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
    const members = await normalizeRosterMembers(client, team, body.members, {
      allowProxies: canManageTournament(user, tournament), existingRoster: roster
    });
    const replacements = [];
    for (const member of members) {
      const current = activeRosterMembers(roster).find((item) => item.slot === member.slot);
      if (current && current.userId === member.userId && Boolean(current.isProxy) === member.isProxy) {
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
    patch.captainUserId = rosterCaptainUserId(freshMembers, body.captainUserId, { allowNoCaptain: canManageTournament(user, tournament) });
  } else if (!nameOnly && !freshMembers.some((member) => member.userId && member.userId === roster.captainUserId)) {
    if (canManageTournament(user, tournament) && freshMembers.every((member) => member.isProxy)) patch.captainUserId = null;
    else throw new ValidationError("Choose a new captain when replacing the current captain");
  }
  try {
    const updated = await rostersRepo.update(client, roster.id, patch);
    // A display-name change must not discard the organizer's prepared pairings.
    if (!nameOnly) await clearPreparedRounds(client, tournament);
    await audit(client, tournament, user, "roster_update", { teamId: roster.teamId, entityType: "roster", entityId: roster.id, before, after: updated });
    return { roster: { ...updated, paid: canManageTournament(user, tournament) ? updated.paid : undefined } };
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
  await clearPreparedRounds(client, tournament);
  await audit(client, tournament, user, "roster_withdraw", { teamId: roster.teamId, entityType: "roster", entityId: roster.id, before: roster, after: updated });
  return { roster: { ...updated, paid: canManageTournament(user, tournament) ? updated.paid : undefined } };
}

async function deleteRoster({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, true);
  const started = Boolean(tournament.startedAt) || ["in_progress", "completed"].includes(tournament.status);
  if (started && !canManageTournament(user, tournament)) throw new HttpError(403, "Only an administrator can remove a roster after tournament start");
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
      const winPoints = match.pairingType === "sword_shield_classic" ? 9 : 2;
      await teamMatchesRepo.update(client, match.id, {
        phase: "completed", resolution: "forfeit", completedAt: nowIso(), teamElo: null,
        teamTournamentPointsA: removedA ? 0 : winPoints, teamTournamentPointsB: removedA ? winPoints : 0,
        teamGamePointsA: match.pairingType === "sword_shield_classic" ? null : removedA ? 0 : 60,
        teamGamePointsB: match.pairingType === "sword_shield_classic" ? null : removedA ? 60 : 0
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
  await clearPreparedRounds(client, tournament);
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
  for (const roster of rosters.filter((item) => item.isReserve || ["registered", "active"].includes(item.status))) {
    seed += 1;
    if (roster.seed !== seed) await rostersRepo.update(client, roster.id, { seed });
  }
  await audit(client, tournament, user, eventType, { metadata: { rosterIds: rosters.map((item) => item.id) } });
  return rosters;
}

async function updateRosterSeedsAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, true);
  if (!canManageTournament(user, params.id)) throw new HttpError(403, "Administrator rights required");
  if (["in_progress", "completed", "cancelled"].includes(tournament.status)) {
    throw new HttpError(409, "Roster seeds are locked after tournament start");
  }
  const rosters = (await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false }))
    .filter((roster) => roster.isReserve || ["registered", "active"].includes(roster.status));
  const rosterIds = Array.isArray(body.rosterIds) ? body.rosterIds.map(Number) : [];
  const expected = new Set(rosters.map((roster) => roster.id));
  if (rosterIds.length !== rosters.length || new Set(rosterIds).size !== rosterIds.length || rosterIds.some((id) => !expected.has(id))) {
    throw new ValidationError("Seed order must include every active roster exactly once");
  }
  await client.query(
    "UPDATE tournament_team_rosters SET seed = NULL, updated_at = NOW() WHERE tournament_id = $1 AND (status IN ('registered', 'active') OR is_reserve)",
    [tournament.id]
  );
  for (let index = 0; index < rosterIds.length; index += 1) {
    await rostersRepo.update(client, rosterIds[index], { seed: index + 1 });
  }
  await audit(client, tournament, user, "roster_seed_update", { metadata: { rosterIds } });
  await clearPreparedRounds(client, tournament);
  return tournamentData(client, tournament, user, { includeAudit: true });
}

async function configureTeamTables(client, tournament, values) {
  if (values !== undefined) {
    if (tournament.teamTablesLocked) throw new HttpError(409, "Team tables are locked for this tournament");
    validateTeamTables(values, tournament.venueMode);
    const existing = await tablesRepo.listByTournament(client, tournament.id);
    if (existing.length > 3) throw new ValidationError("Configure exactly three team tables before continuing");
    for (let i = 0; i < 3; i += 1) {
      const data = { killzone: values[i].killzone, deployment: Number(values[i].deployment) };
      if (existing[i]) await tablesRepo.update(client, existing[i].id, data);
      else await tablesRepo.insert(client, { tournamentId: tournament.id, ...data });
    }
  }
  const tables = validateTeamTables(await tablesRepo.listByTournament(client, tournament.id), tournament.venueMode);
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
  const defaults = await tablesRepo.listByTournament(client, tournament.id);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const previous = tournament.roundDraft?.tables || tablesForRound(rounds.at(-1), defaults);
  const selected = validateTeamLines(values === undefined ? previous : values, tournament.venueMode);
  if (tournament.pairingType !== "sword_shield_classic") {
    for (let index = 0; index < selected.length; index += 3) validateTeamTables(selected.slice(index, index + 3), tournament.venueMode);
  }
  const used = new Set();
  const result = [];
  for (const [index, input] of selected.entries()) {
    const existing = input.id ? defaults.find(table => table.id === Number(input.id)) : defaults[index];
    if (input.id && !existing) throw new ValidationError("Choose a table belonging to this tournament");
    const table = existing || await tablesRepo.insert(client, { tournamentId: tournament.id, killzone: input.killzone, deployment: Number(input.deployment) });
    if (used.has(table.id)) throw new ValidationError("A table can belong to only one line");
    used.add(table.id);
    result.push({ id: table.id, tournamentId: tournament.id, tableNumber: input.tableNumber,
      killzone: input.killzone, deployment: Number(input.deployment),
      imageId: await saveTableImage(client, tournament.id, input, previous.find(item => item.id === table.id), tournament.venueMode) });
  }
  await tournamentsRepo.update(client, tournament.id, { teamTablesLocked: true });
  return result;
}

function assignLines(pairings, tables) {
  const used = new Set();
  let next = 1;
  return pairings.map(pairing => {
    if (pairing.rosterBId === null) return { ...pairing, lineNumber: null };
    const lineNumber = pairing.lineNumber == null ? next : Number(pairing.lineNumber);
    next += 1;
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber * 3 > tables.length || used.has(lineNumber)) {
      throw new ValidationError("Assign a different complete line to each team matchup");
    }
    used.add(lineNumber);
    return { ...pairing, lineNumber };
  });
}

async function startTournament(client, tournament, user, body = {}) {
  const rosters = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false });
  const competitive = rosters.filter((roster) => roster.status === "registered");
  if (rosters.some((roster) => roster.status === "incomplete")) {
    throw new ValidationError("Incomplete rosters must be completed or withdrawn before start");
  }
  validateTeamTournament(tournament, competitive);
  const first = requirePreparedFirstRound(await roundsRepo.listByTournament(client, tournament.id));
  const firstMatches = await teamMatchesRepo.listByRound(client, first.id);
  const expectedIds = competitive.map((roster) => roster.id).sort((a, b) => a - b);
  const pairedIds = firstMatches.flatMap((match) => [match.rosterAId, match.rosterBId]).sort((a, b) => a - b);
  if (JSON.stringify(expectedIds) !== JSON.stringify(pairedIds)) {
    throw new HttpError(409, "Rosters changed; generate the first round again");
  }
  const tables = tablesForRound(first, await tablesRepo.listByTournament(client, tournament.id));
  if (first.metadata?.lines) {
    validateTeamLines(tables, tournament.venueMode);
    assignLines(firstMatches, tables);
    if (tournament.pairingType === "sword_shield_classic") normalizeRoundMissions(first.metadata.missions);
  } else validateTeamTables(tables, tournament.venueMode);
  for (const roster of competitive) {
    if (activeRosterMembers(roster).length !== 3) throw new ValidationError("Every active roster must contain exactly three players");
    await rostersRepo.update(client, roster.id, {
      status: "active",
      startedAt: nowIso()
    });
  }
  const updated = await tournamentsRepo.update(client, tournament.id, { status: "in_progress", startedAt: nowIso() });
  await roundsRepo.update(client, first.id, { status: "active", startedAt: updated.startedAt });
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
    return { bracketPosition: index + 1, rosterAId, rosterBId, lineNumber: item.lineNumber == null || item.lineNumber === "" ? null : Number(item.lineNumber) };
  });
  if (seen.size !== allowed.size || pairings.filter((pairing) => pairing.rosterBId === null).length !== rosters.length % 2) {
    throw new ValidationError("Manual team pairings must include every roster exactly once");
  }
  return { ...blueprint, pairings };
}

async function buildRoundPreview(client, tournament, body = {}) {
  const allRosters = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: false });
  if (tournament.status === "registration_closed" && allRosters.some((roster) => roster.status === "incomplete")) {
    throw new ValidationError("Incomplete rosters must be completed or withdrawn before preparing the first round");
  }
  const rosters = allRosters.filter((roster) => ["registered", "active"].includes(roster.status));
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await teamMatchesRepo.listByTournament(client, tournament.id);
  let blueprint;
  if (!rounds.length || tournament.status === "registration_closed") {
    if (rosters.some((roster) => activeRosterMembers(roster).length !== 3)) {
      throw new ValidationError("Every active roster must contain exactly three players");
    }
    blueprint = buildFirstTeamRound(tournament, rosters);
    if (rounds.length) {
      const first = requirePreparedFirstRound(rounds);
      blueprint.pairings = matches.filter((match) => match.roundId === first.id).map((match) => ({
        bracketPosition: match.bracketPosition, rosterAId: match.rosterAId, rosterBId: match.rosterBId, lineNumber: match.lineNumber
      }));
    }
  }
  else {
    const latest = rounds[rounds.length - 1];
    if (latest.status !== "completed") throw new HttpError(409, "Complete every team match before generating the next round");
    if (latest.roundNumber >= tournament.swissRoundCount) throw new HttpError(409, "All configured Swiss rounds have been generated");
    blueprint = buildNextTeamRound(tournament, rosters, matches, latest.roundNumber + 1);
  }
  const setup = tournament.roundDraft && !body.matchups ? { ...body, matchups: tournament.roundDraft.matchups } : body;
  return { blueprint: applyManualMatchups(blueprint, rosters, setup), rosters, matches };
}

async function previewNextRound(client, tournament) {
  const { blueprint } = await buildRoundPreview(client, tournament);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const defaults = await tablesRepo.listByTournament(client, tournament.id);
  const previous = tournament.roundDraft?.tables || tablesForRound(rounds.at(-1), defaults);
  const count = Math.max(3, blueprint.pairings.filter(pair => pair.rosterBId !== null).length * 3, Math.ceil(previous.length / 3) * 3);
  const highestNumber = Math.max(0, ...previous.map(table => table.tableNumber));
  const tables = Array.from({ length: count }, (_, index) => previous[index] || {
    tableNumber: highestNumber + index - previous.length + 1,
    killzone: previous[index % 3]?.killzone || "", deployment: previous[index % 3]?.deployment || null
  });
  const pairings = assignLines(blueprint.pairings, tables);
  let reuseLines = previous.length === tables.length && Boolean(tournament.roundDraft?.tables?.length || rounds.at(-1)?.metadata?.lines);
  if (reuseLines) {
    try {
      validateTeamLines(previous, tournament.venueMode);
      if (tournament.pairingType !== "sword_shield_classic") {
        for (let index = 0; index < previous.length; index += 3) validateTeamTables(previous.slice(index, index + 3), tournament.venueMode);
      }
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      reuseLines = false;
    }
  }
  return {
    tournament: tournamentSummaryView(tournament),
    round: { ...blueprint, matches: pairings, missions: CRIT_OPS.map((critOp) => ({ critOp })) },
    tables: tables.map(tournamentTableView), teamRound: true, reuseLines,
    restoredDraft: Boolean(tournament.roundDraft), prepared: tournament.status === "registration_closed"
  };
}

async function generateRound(client, tournament, user, body = {}) {
  const missions = tournament.pairingType === "sword_shield_classic"
    ? normalizeRoundMissions(body.missions) : CRIT_OPS.map((critOp) => ({ critOp }));
  const { blueprint, rosters } = await buildRoundPreview(client, tournament, body);
  const tables = await nextTeamRoundTables(client, tournament, body.tables);
  blueprint.pairings = assignLines(blueprint.pairings, tables);
  const prepared = tournament.status === "registration_closed";
  if (prepared) await clearPreparedRounds(client, tournament);
  const round = await roundsRepo.insert(client, {
    tournamentId: tournament.id,
    roundNumber: blueprint.roundNumber,
    status: prepared ? "not_ready" : "active",
    generatedBy: "admin",
    metadata: { participantMode: "team", pairingType: tournament.pairingType, missions, tables, lines: true },
    startedAt: prepared ? null : nowIso()
  });
  for (const pairing of blueprint.pairings) {
    await teamMatchesRepo.insert(client, {
      pairingVersion: 2,
      pairingType: tournament.pairingType,
      captainPairingEnabled: tournament.captainPairingEnabled !== false,
      lineNumber: pairing.lineNumber,
      tournamentId: tournament.id,
      roundId: round.id,
      roundNumber: round.roundNumber,
      bracketPosition: pairing.bracketPosition,
      rosterAId: pairing.rosterAId,
      rosterBId: pairing.rosterBId,
      missions,
      tableIds: pairing.lineNumber ? tables.slice((pairing.lineNumber - 1) * 3, pairing.lineNumber * 3).map(table => table.id) : []
    });
  }
  if (!prepared && blueprint.pairings.every((pairing) => pairing.rosterBId === null)) {
    await roundsRepo.update(client, round.id, { status: "completed", completedAt: nowIso() });
  }
  await audit(client, tournament, user, prepared ? "team_first_round_prepare" : "team_round_generate", { entityType: "round", entityId: round.id, metadata: { blueprint, missions, tables } });
  if (tournament.roundDraft) await tournamentsRepo.update(client, tournament.id, { roundDraft: null });
  return tournamentData(client, { ...tournament, roundDraft: null, teamTablesLocked: true }, user);
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
  if (!canManageTournament(user, tournament) && !side) throw new HttpError(403, "Only a roster captain can perform this pairing action");
  return { tournament, match, rosterA, rosterB, side };
}

async function getRoster({ client, user, params }) {
  const storedRoster = await rostersRepo.findById(client, requirePositiveIntId(params.rosterId, 404, "Roster not found"));
  if (!storedRoster) throw new HttpError(404, "Roster not found");
  const tournament = await requireTournament(client, storedRoster.tournamentId);
  if (!canManageTournament(user, tournament) && !tournamentsRepo.PUBLISHED_STATUSES.includes(tournament.status)) {
    throw new HttpError(404, "Roster not found");
  }
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const myTeams = user ? await teamsRepo.listForUser(client, user.id) : [];
  const rosters = (await rostersRepo.listByTournament(client, tournament.id, { includeHistory: true }))
    .map((roster) => rosterForViewer(roster, user, {
      rounds,
      teamLeader: myTeams.some((team) => team.id === roster.teamId && team.leaderUserId === user?.id)
    }));
  const roster = rosterById(rosters, storedRoster.id);
  const allMatches = await teamMatchesRepo.listByTournament(client, tournament.id);
  const tables = await tablesRepo.listByTournament(client, tournament.id);
  const matches = allMatches.filter((match) => match.rosterAId === roster.id || match.rosterBId === roster.id);
  const standings = teamStandings(rosters.filter((item) => item.status !== "withdrawn"), allMatches, tournament.teamTiebreakerOrder ?? null);
  const row = standings.find((item) => item.roster.id === roster.id)
    || { ...teamStandings([roster], matches, tournament.teamTiebreakerOrder ?? null)[0], rank: null };
  const finalRow = tournament.finalResults?.find((item) => item.rosterId === roster.id);
  const teamLeader = myTeams.some((team) => team.id === roster.teamId && team.leaderUserId === user?.id);
  return {
    tournament: tournamentSummaryView(tournament),
    roster,
    viewer: {
      isTeamLeader: teamLeader,
      isCaptain: Boolean(user && roster.captainUserId === user.id),
      canRename: !roster.isReserve && !["withdrawn", "finished"].includes(roster.status)
        && !["completed", "cancelled"].includes(tournament.status)
        && canEditRoster(user, roster, teamLeader ? { role: "leader" } : null)
    },
    standing: { ...row, ...finalRow, rosterId: roster.id, roster: undefined },
    teamMatches: matches.map((match) => redactTeamMatch({
      ...match,
      tables: tablesForRound(rounds.find((round) => round.id === match.roundId), tables)
        .filter((table) => !match.tableIds.length || match.tableIds.includes(table.id)).map(tournamentTableView)
    }, rosterById(rosters, match.rosterAId), rosterById(rosters, match.rosterBId), user))
  };
}

async function getPairingMatch({ client, user, params }) {
  const match = await teamMatchesRepo.findById(
    client,
    requirePositiveIntId(params.matchId, 404, "Team match not found")
  );
  if (!match) throw new HttpError(404, "Team match not found");
  const tournament = await requireTournament(client, match.tournamentId);
  if (!canManageTournament(user, tournament) && !tournamentsRepo.PUBLISHED_STATUSES.includes(tournament.status)) {
    throw new HttpError(404, "Team match not found");
  }
  const storedRosters = await rostersRepo.listByTournament(client, tournament.id, {
    includeWithdrawn: true,
    includeHistory: true
  });
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const myTeams = user ? await teamsRepo.listForUser(client, user.id) : [];
  const rosters = storedRosters.map((roster) => rosterForViewer(roster, user, {
    rounds,
    teamLeader: myTeams.some((team) => team.id === roster.teamId && team.leaderUserId === user?.id)
  }));
  const rosterA = rosterById(rosters, match.rosterAId);
  const rosterB = rosterById(rosters, match.rosterBId);
  if (!rosterA || (!rosterB && match.resolution !== "bye")) throw new HttpError(409, "Team match rosters are unavailable");
  const tables = (await tablesForTeamMatch(client, match))
    .filter((table) => !match.tableIds.length || match.tableIds.includes(table.id))
    .map(tournamentTableView);
  return {
    tournament: {
      ...tournamentSummaryView(tournament),
      roundDraft: canManageTournament(user, tournament) ? tournament.roundDraft : undefined,
      viewer: {
        role: canManageTournament(user, tournament) ? "admin" : user ? "player" : "spectator",
        ...tournamentPermissions(user, tournament),
        captainRosterIds: [rosterA, rosterB]
          .filter((roster) => roster && roster.captainUserId === user?.id)
          .map((roster) => roster.id)
      }
    },
    teamMatch: redactTeamMatch({ ...match, tables }, rosterA, rosterB, user),
    eventLog: await pairingLog.read(client, match, rosterA, rosterB, user),
    tables
  };
}

function actionSide(user, body, captainSide, tournamentId) {
  if (captainSide) return captainSide;
  if (!canManageTournament(user, tournamentId)) return captainSide;
  const side = body.side || captainSide;
  if (!["a", "b"].includes(side)) throw new ValidationError("Administrator actions must specify side a or b");
  return side;
}

function pairingSnapshot(match) {
  const fields = ["phase", "rollResult", "rollHistory", "missionBans", "attackerRosterId", "defenderRosterId",
    "shieldAMemberId", "shieldBMemberId", "shieldAConfirmed", "shieldBConfirmed", "swordAMemberId",
    "swordBMemberId", "swordAConfirmed", "swordBConfirmed", "pairings", "environment"];
  return JSON.parse(JSON.stringify(Object.fromEntries(fields.map((field) => [field, match[field]]))));
}

function recordPairingAction(handler) {
  return async (request) => {
    const { client, user, params, body = {} } = request;
    const context = await requireMatchContext(client, params, user);
    if (body.revision !== undefined && Number(body.revision) !== context.match.pairingRevision) {
      throw new HttpError(409, "Pairing changed. Refresh and try again");
    }
    const before = pairingSnapshot(context.match);
    await handler(request);
    await teamMatchesRepo.update(client, context.match.id, {
      pairingHistory: [...context.match.pairingHistory, { before, action: handler.name, actorId: user.id, at: nowIso() }],
      pairingRevision: context.match.pairingRevision + 1
    });
    const updated = await teamMatchesRepo.findById(client, context.match.id);
    return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
  };
}

function hasEarlierPairingStep(match) {
  return match.pairingVersion === 2 && Boolean(match.rollHistory?.length || match.missionBans?.length ||
    match.shieldAMemberId || match.shieldBMemberId || match.swordAMemberId || match.swordBMemberId || match.environment?.step);
}

async function earlierPairingSnapshot(client, match) {
  // Older matches have no saved snapshots. Reconstruct their last logical step
  // from the retained selections, using the audit log for simultaneous choices.
  if (!hasEarlierPairingStep(match)) return null;
  const before = pairingSnapshot(match);
  const lastSide = async (events, choices, round = null) => {
    const { rows } = await client.query(
      `SELECT metadata->>'side' AS side FROM player_team_audit_events
       WHERE tournament_id = $1 AND entity_type = 'team_match' AND entity_id = $2
         AND event_type = ANY($3::text[]) AND ($4::int IS NULL OR metadata->>'round' = $4::text)
       ORDER BY id DESC LIMIT 1`, [match.tournamentId, match.id, events, round]
    );
    return choices.includes(rows[0]?.side) ? rows[0].side : choices.at(-1);
  };
  if (["environment_selection", "in_progress", "completed"].includes(before.phase)) {
    const plan = teamEnvironmentPlan(match);
    const count = before.environment?.step === "complete" ? plan.length : Number(before.environment?.step || 0);
    if (count > 0) {
      const step = plan[count - 1];
      if (!step) return null;
      let assignments = before.environment.assignments || [];
      if (step.kind === "table") {
        assignments = assignments.filter((item) => item.slot !== step.slot && !(count === 3 && item.slot === 3));
      } else {
        const assignment = assignments.find((item) => item.slot === step.slot);
        if (assignment?.mission) delete assignment.mission.critOp;
      }
      return { ...before, phase: "environment_selection", environment: { step: count - 1, assignments } };
    }
    before.phase = "sword_selection";
    before.pairings = null;
    before.environment = null;
  }
  if (before.phase === "sword_selection") {
    const choices = ["a", "b"].filter((side) => before[side === "a" ? "swordAMemberId" : "swordBMemberId"]);
    if (choices.length) {
      const side = (await lastSide(["sword_select", "swords_reveal"], choices)).toUpperCase();
      return { ...before, [`sword${side}MemberId`]: null, [`sword${side}Confirmed`]: false };
    }
    before.phase = "shield_selection";
  }
  if (before.phase === "shield_selection") {
    const choices = ["a", "b"].filter((side) => before[side === "a" ? "shieldAMemberId" : "shieldBMemberId"]);
    if (choices.length) {
      const side = (await lastSide(["shield_select", "shields_reveal"], choices)).toUpperCase();
      return { ...before, [`shield${side}MemberId`]: null, [`shield${side}Confirmed`]: false };
    }
    before.phase = "mission_ban";
  }
  if (before.phase === "mission_ban") {
    if (before.missionBans.length) return { ...before, missionBans: before.missionBans.slice(0, -1) };
    Object.assign(before, { phase: "awaiting_roll", attackerRosterId: null, defenderRosterId: null, rollResult: null });
  }
  if (before.phase === "awaiting_roll" && before.rollHistory.length) {
    const last = before.rollHistory.at(-1);
    const choices = ["a", "b"].filter((side) => last[side]);
    if (!choices.length) return null;
    const side = await lastSide(["team_match_roll"], choices, before.rollHistory.length);
    last[side] = null;
    if (!last.a && !last.b) before.rollHistory.pop();
    return before;
  }
  return null;
}

async function undoPairing({ client, user, params, body = {} }) {
  const context = await requireMatchContext(client, params, user);
  const { match, tournament } = context;
  if (!Number.isInteger(body.revision) || body.revision !== match.pairingRevision) {
    throw new HttpError(409, "Pairing changed. Refresh before undoing the last action");
  }
  const previous = match.pairingHistory.at(-1) || { before: await earlierPairingSnapshot(client, match), action: "existing_pairing_step", actorId: null };
  if (!previous.before) throw new HttpError(409, "There is no pairing action to undo");
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  if (rounds.some((round) => round.roundNumber > match.roundNumber)) {
    throw new HttpError(409, "Roll back later rounds before changing this pairing");
  }
  const hasResults = match.games.some((link) => ["completed", "pending_confirmation"].includes(link.game?.status));
  if (hasResults && body.confirmResultsReset !== true) {
    throw new HttpError(409, "Confirm removal of personal results before undoing this pairing action");
  }
  if (match.games.length) {
    for (const link of match.games) {
      if (link.game?.elo) await require("./games").reverseElo(client, link.game);
    }
    await gamesRepo.removeBySourceIds(client, "team_match_game", [match.id]);
  }
  await teamMatchesRepo.update(client, match.id, {
    ...previous.before, pairingHistory: match.pairingHistory.slice(0, -1), pairingRevision: match.pairingRevision + 1,
    gamePoints: null, teamGamePointsA: null, teamGamePointsB: null, teamTournamentPointsA: null,
    teamTournamentPointsB: null, teamElo: null, completedAt: null
  });
  await roundsRepo.update(client, match.roundId, { status: "active", completedAt: null });
  if (hasResults) {
    await recalculateCompletedGameRatings(client);
    await recalculateTeamRatings(client);
  }
  const updated = await teamMatchesRepo.findById(client, match.id);
  await audit(client, tournament, user, "team_pairing_undo", {
    entityType: "team_match", entityId: match.id, before: match, after: updated,
    metadata: { undoneAction: previous.action, originalActorId: previous.actorId }
  });
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

async function selectInitiative({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user, "awaiting_roll");
  if (context.match.pairingType !== "sword_shield_classic" || context.match.captainPairingEnabled === false) throw new HttpError(409, "Classic initiative is unavailable");
  if (!["a", "b"].includes(body.winnerSide)) throw new ValidationError("Choose the captain with initiative");
  const attackerRosterId = body.winnerSide === "a" ? context.match.rosterAId : context.match.rosterBId;
  const defenderRosterId = body.winnerSide === "a" ? context.match.rosterBId : context.match.rosterAId;
  await teamMatchesRepo.update(client, context.match.id, { attackerRosterId, defenderRosterId, phase: "shield_selection" });
  await audit(client, context.tournament, user, "team_match_roll", { entityType: "team_match", entityId: context.match.id,
    metadata: { manual: true, initiative: body.winnerSide, attackerName: (body.winnerSide === "a" ? context.rosterA : context.rosterB).name } });
}

async function selectClassicEnvironment(client, context, user, body) {
  const { match } = context;
  if (match.captainPairingEnabled === false) throw new HttpError(409, "Use manual assignments");
  const state = match.environment || { step: 0, assignments: [], choices: [] };
  const step = teamNextAction(match);
  if (!step || Number(body.step) !== Number(state.step)) throw new HttpError(409, "Refresh the current pairing step");
  if (actionSide(user, body, context.side, context.tournament.id) !== step.side) throw new HttpError(403, "Waiting for the other captain");
  const kind = step.kind === "either" ? body.kind : step.kind;
  if (!["table", "mission"].includes(kind)) throw new ValidationError("Choose a table or a mission");
  const assignments = structuredClone(state.assignments || []);
  let assignment = assignments.find(item => item.slot === step.slot);
  if (!assignment) { assignment = { slot: step.slot, tableId: null, mission: {} }; assignments.push(assignment); }
  const tables = (await tablesForTeamMatch(client, match)).filter(table => match.tableIds.includes(table.id));
  if (kind === "table") {
    const table = tables.find(table => table.id === Number(body.tableId));
    if (!table || assignments.some(item => item.tableId === table.id)) throw new ValidationError("Choose an unused table in this line");
    assignment.tableId = table.id;
    Object.assign(assignment.mission, { killzone: table.killzone, layout: table.deployment });
  } else {
    if (!match.missions.some(item => item.critOp === body.mission) || assignments.some(item => item.mission.critOp === body.mission)) throw new ValidationError("Choose an unused round mission");
    assignment.mission.critOp = body.mission;
  }
  const choices = [...(state.choices || []), kind];
  if (Number(state.step) === 3) {
    const table = tables.find(table => !assignments.some(item => item.tableId === table.id));
    if (!table) throw new HttpError(409, "The remaining table is unavailable");
    // Older rounds keep their three-mission snapshot and automatic last mission.
    const mission = match.missions.length === 3
      ? match.missions.find(mission => !assignments.some(item => item.mission.critOp === mission.critOp)) : null;
    if (match.missions.length === 3 && !mission) throw new HttpError(409, "The remaining mission is unavailable");
    assignments.push({ slot: 3, tableId: table.id, mission: { ...mission, killzone: table.killzone, layout: table.deployment } });
  }
  if (Number(state.step) + 1 === teamEnvironmentPlan(match).length) {
    await createPersonalGames(client, context, assignments.sort((a,b) => a.slot - b.slot), user);
  } else await teamMatchesRepo.update(client, match.id, { environment: { step: Number(state.step) + 1, assignments, choices } });
  await audit(client, context.tournament, user, "environment_select", { entityType: "team_match", entityId: match.id,
    metadata: { step: { ...step, kind }, logAssignments: pairingLog.assignmentDetails(context, assignments, tables) } });
}

async function manualPairings({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user, "environment_selection");
  const { match } = context;
  if (match.captainPairingEnabled !== false || match.games.length) throw new HttpError(409, "Manual assignment is unavailable");
  const input = body.pairings;
  if (!Array.isArray(input) || input.length !== 3 || input.some(item => !item || typeof item !== "object") || new Set(input.map(p => Number(p.rosterAMemberId))).size !== 3 ||
      new Set(input.map(p => Number(p.rosterBMemberId))).size !== 3 || new Set(input.map(p => Number(p.tableId))).size !== 3 ||
      new Set(input.map(p => p.mission)).size !== 3) throw new ValidationError("Use each player, table and mission exactly once");
  const tables = await tablesForTeamMatch(client, match);
  const pairings = [], assignments = [];
  for (const [index, item] of input.entries()) {
    if (!rosterMember(context.rosterA, item.rosterAMemberId) || !rosterMember(context.rosterB, item.rosterBMemberId)) throw new ValidationError("Choose current roster players");
    const table = tables.find(t => t.id === Number(item.tableId) && match.tableIds.includes(t.id));
    if (!table || !match.missions.some(m => m.critOp === item.mission)) throw new ValidationError("Choose a table in this line and an available mission");
    pairings.push({ slot: index + 1, rosterAMemberId: Number(item.rosterAMemberId), rosterBMemberId: Number(item.rosterBMemberId), shieldOwner: null });
    assignments.push({ slot: index + 1, tableId: table.id, mission: { critOp: item.mission, killzone: table.killzone, layout: table.deployment } });
  }
  context.match = await teamMatchesRepo.update(client, match.id, { pairings });
  await createPersonalGames(client, context, assignments, user);
}

async function roll({ client, user, params, body = {} }) {
  const context = await requireMatchContext(client, params, user, "awaiting_roll");
  const manual = Object.prototype.hasOwnProperty.call(body, "result");
  if (manual && (!Number.isInteger(body.result) || body.result < 1 || body.result > 6)) {
    throw new ValidationError("Enter a D6 result from 1 to 6");
  }
  if (context.match.pairingType === "sword_shield_classic") throw new ValidationError("Record the initiative winner for Classic");
  if (context.match.pairingVersion === 2) {
    const side = actionSide(user, body, context.side, context.tournament.id);
    const round = teamRollRound(context.match);
    if (Number(body.rollRound) !== round) throw new HttpError(409, "Refresh the pairing before rolling again");
    const history = (context.match.rollHistory || []).map((item) => ({ ...item }));
    if (history.length < round) history.push({ a: null, b: null });
    const current = history[round - 1];
    if (current[side]) throw new HttpError(409, "You have already rolled; waiting for the other captain");
    current[side] = manual ? body.result : crypto.randomInt(1, 7);
    const patch = { rollHistory: history };
    if (current.a && current.b && current.a !== current.b) {
      patch.attackerRosterId = current.a > current.b ? context.match.rosterAId : context.match.rosterBId;
      patch.defenderRosterId = current.a > current.b ? context.match.rosterBId : context.match.rosterAId;
      patch.rollResult = Math.max(current.a, current.b);
      patch.phase = "mission_ban";
    }
    const updated = await teamMatchesRepo.update(client, context.match.id, patch);
    await audit(client, context.tournament, user, "team_match_roll", { entityType: "team_match", entityId: updated.id, metadata: { side, round, result: current[side], manual,
      tied: Boolean(current.a && current.a === current.b),
      ...(patch.attackerRosterId ? { attackerName: rosterById([context.rosterA, context.rosterB], patch.attackerRosterId)?.name,
        defenderName: rosterById([context.rosterA, context.rosterB], patch.defenderRosterId)?.name } : {}) } });
    return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
  }
  const result = manual ? body.result : crypto.randomInt(1, 7);
  const attackerRosterId = result >= 4 ? context.match.rosterAId : context.match.rosterBId;
  const defenderRosterId = attackerRosterId === context.match.rosterAId ? context.match.rosterBId : context.match.rosterAId;
  const updated = await teamMatchesRepo.update(client, context.match.id, {
    rollResult: result,
    attackerRosterId,
    defenderRosterId,
    phase: "shield_selection"
  });
  await audit(client, context.tournament, user, "team_match_roll", { entityType: "team_match", entityId: context.match.id, after: { rollResult: result, attackerRosterId, defenderRosterId },
    metadata: { manual, attackerName: rosterById([context.rosterA, context.rosterB], attackerRosterId)?.name,
      defenderName: rosterById([context.rosterA, context.rosterB], defenderRosterId)?.name } });
  return { teamMatch: updated };
}

async function banMission({ client, user, params, body = {} }) {
  const context = await requireMatchContext(client, params, user, "mission_ban");
  const side = actionSide(user, body, context.side, context.tournament.id);
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
  const side = actionSide(user, body, context.side, context.tournament.id);
  const roster = side === "a" ? context.rosterA : context.rosterB;
  const memberId = requirePositiveIntId(body.memberId, 400, "Choose a shield");
  if (!rosterMember(roster, memberId)) throw new ValidationError("The shield must be a current player in this roster");
  const confirmedField = side === "a" ? "shieldAConfirmed" : "shieldBConfirmed";
  if (context.match[confirmedField] && (context.side || !canManageTournament(user, context.tournament))) throw new HttpError(409, "This shield choice is already confirmed");
  const patch = side === "a"
    ? { shieldAMemberId: memberId, shieldAConfirmed: body.confirm !== false }
    : { shieldBMemberId: memberId, shieldBConfirmed: body.confirm !== false };
  const bothConfirmed = (side === "a" ? patch.shieldAConfirmed : context.match.shieldAConfirmed) &&
    (side === "b" ? patch.shieldBConfirmed : context.match.shieldBConfirmed);
  if (bothConfirmed) patch.phase = "sword_selection";
  const updated = await teamMatchesRepo.update(client, context.match.id, patch);
  await audit(client, context.tournament, user, bothConfirmed ? "shields_reveal" : "shield_select", { entityType: "team_match", entityId: context.match.id, metadata: { side, confirmed: patch[confirmedField],
    ...pairingLog.choiceDetails(context, side, memberId, "shield", updated) } });
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

async function selectSword({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user, "sword_selection");
  const side = actionSide(user, body, context.side, context.tournament.id);
  const opponent = side === "a" ? context.rosterB : context.rosterA;
  const opponentShieldId = side === "a" ? context.match.shieldBMemberId : context.match.shieldAMemberId;
  const memberId = requirePositiveIntId(body.memberId, 400, "Choose an opponent sword");
  if (!rosterMember(opponent, memberId) || memberId === opponentShieldId) {
    throw new ValidationError("Choose one of the two remaining opponent players as the sword");
  }
  const confirmedField = side === "a" ? "swordAConfirmed" : "swordBConfirmed";
  if (context.match[confirmedField] && (context.side || !canManageTournament(user, context.tournament))) throw new HttpError(409, "This sword choice is already confirmed");
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
  await audit(client, context.tournament, user, bothConfirmed ? "swords_reveal" : "sword_select", { entityType: "team_match", entityId: context.match.id, metadata: { side, confirmed: patch[confirmedField],
    ...pairingLog.choiceDetails(context, side, memberId, "sword", updated) } });
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
  if (context.match.captainPairingEnabled === false) throw new HttpError(409, "Use manual assignments");
  if (context.match.pairingVersion === 2) return selectTeamEnvironment(client, context, user, body);
  let assignments;
  if (canManageTournament(user, context.tournament) && Array.isArray(body.assignments)) {
    assignments = validateDirectAssignments(context, body.assignments);
  } else {
    const state = context.match.environment || { step: 0, assignments: [] };
    const plan = environmentPlan(context);
    const step = plan[Number(state.step || 0)];
    if (!step) throw new HttpError(409, "Environment selection is already complete");
    const side = actionSide(user, body, context.side, context.tournament.id);
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
      await audit(client, context.tournament, user, "environment_select", { entityType: "team_match", entityId: context.match.id, metadata: { step, assignment,
        logAssignments: pairingLog.assignmentDetails(context, [assignment], await tablesForTeamMatch(client, context.match)) } });
      return { teamMatch: updated };
    }
    await audit(client, context.tournament, user, "environment_select", { entityType: "team_match", entityId: context.match.id, metadata: { step, assignment,
      logAssignments: pairingLog.assignmentDetails(context, [assignment], await tablesForTeamMatch(client, context.match)) } });
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
  if (context.match.pairingType === "sword_shield_classic") return selectClassicEnvironment(client, context, user, body);
  const { match } = context;
  const state = match.environment || { step: 0, assignments: [] };
  const step = teamNextAction(match);
  if (!step) throw new HttpError(409, "Environment selection is already complete");
  if (actionSide(user, body, context.side, context.tournament.id) !== step.side) throw new HttpError(403, "Waiting for the other captain's environment choice");
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
  await audit(client, context.tournament, user, "environment_select", { entityType: "team_match", entityId: match.id, metadata: { step, assignment,
    logAssignments: pairingLog.assignmentDetails(context, assignments.filter(item => item.slot === step.slot ||
      (!state.assignments?.some(previous => previous.slot === item.slot) && item.slot !== step.slot)), tables) } });
  if (Number(state.step) + 1 === teamEnvironmentPlan(match).length) {
    if (assignments.length !== 3 || assignments.some((item) => !item.tableId || !item.mission.critOp || (context.tournament.venueMode !== "irl" && !item.mission.killzone) || !item.mission.layout)) {
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
  const roundTables = await tablesForTeamMatch(client, context.match);
  for (const assignment of assignments) {
    if (existing.some((link) => link.slot === assignment.slot)) continue;
    const pairing = pairingBySlot.get(assignment.slot);
    const memberA = rosterMember(context.rosterA, pairing.rosterAMemberId);
    const memberB = rosterMember(context.rosterB, pairing.rosterBMemberId);
    if (!memberA || !memberB) throw new HttpError(409, "A paired player is no longer available");
    const game = await gamesRepo.insert(client, {
      challengeId: null,
      playerIds: [memberA.userId, memberB.userId].filter(Number.isInteger),
      sourceType: "team_match_game",
      sourceId: context.match.id,
      venueMode: context.tournament.venueMode,
      participants: [
        { userId: memberA.userId, resultKey: participantResultKey(memberA), displayNameSnapshot: memberA.displayNameSnapshot, factionSnapshot: memberA.factionSnapshot, isProxy: memberA.isProxy },
        { userId: memberB.userId, resultKey: participantResultKey(memberB), displayNameSnapshot: memberB.displayNameSnapshot, factionSnapshot: memberB.factionSnapshot, isProxy: memberB.isProxy }
      ]
    });
    await teamMatchesRepo.insertGameLink(client, {
      teamMatchId: context.match.id,
      gameId: game.id,
      slot: assignment.slot,
      rosterAMemberId: memberA.id,
      rosterBMemberId: memberB.id,
      mission: { ...assignment.mission, ...(roundTables.find((table) => table.id === assignment.tableId)?.imageId
        ? { imageId: roundTables.find((table) => table.id === assignment.tableId).imageId } : {}) },
      tableId: assignment.tableId
    });
  }
  await teamMatchesRepo.update(client, context.match.id, { phase: "in_progress", environment: { step: "complete", assignments } });
  await audit(client, context.tournament, user, "personal_games_create", { entityType: "team_match", entityId: context.match.id, metadata: { assignments, logAssignments: pairingLog.assignmentDetails(context, assignments, roundTables) } });
}

function redactTeamMatch(match, rosterA, rosterB, user) {
  const admin = Boolean(canManageTournament(user, match.tournamentId));
  const side = rosterA?.captainUserId === user?.id ? "a" : rosterB?.captainUserId === user?.id ? "b" : null;
  const canInspectChoices = admin && !side;
  const shieldsRevealed = match.shieldAConfirmed && match.shieldBConfirmed;
  const swordsRevealed = match.swordAConfirmed && match.swordBConfirmed;
  const progress = teamMatchProgress(match);
  return {
    ...match,
    pairingHistory: undefined,
    canUndo: Boolean((admin || side) && (match.pairingHistory?.length || hasEarlierPairingStep(match)) && !match.resolution),
    undoResetsResults: (match.games || []).some((link) => ["completed", "pending_confirmation"].includes(link.game?.status)),
    progress,
    games: (match.games || []).map((link) => {
      const score = progress.details.find((item) => item.slot === link.slot);
      return { ...link, permissions: teamGamePermissions(link.game, rosterA, rosterB, user), table: match.tables?.find((table) => table.id === link.tableId) || link.table,
        gamePointsA: score?.a ?? null, gamePointsB: score?.b ?? null };
    }),
    nextAction: teamNextAction(match),
    rollRound: teamRollRound(match),
    shieldAMemberId: canInspectChoices || shieldsRevealed || side === "a" ? match.shieldAMemberId : null,
    shieldBMemberId: canInspectChoices || shieldsRevealed || side === "b" ? match.shieldBMemberId : null,
    swordAMemberId: canInspectChoices || swordsRevealed || side === "a" ? match.swordAMemberId : null,
    swordBMemberId: canInspectChoices || swordsRevealed || side === "b" ? match.swordBMemberId : null,
    rosterA: rosterA ? { ...rosterA, paid: admin ? rosterA.paid : undefined } : rosterA,
    rosterB: rosterB ? { ...rosterB, paid: admin ? rosterB.paid : undefined } : rosterB
  };
}

async function tournamentData(client, tournament, user, { includeAudit = false } = {}) {
  const storedRosters = await rostersRepo.listByTournament(client, tournament.id, {
    includeWithdrawn: true,
    includeHistory: includeAudit || Boolean(canManageTournament(user, tournament))
  });
  const myTeams = user ? await teamsRepo.listForUser(client, user.id) : [];
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const rosters = storedRosters.map((roster) => rosterForViewer(roster, user, {
    rounds,
    teamLeader: myTeams.some((team) => team.id === roster.teamId && team.leaderUserId === user?.id)
  }));
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
      players: link.game.players?.length ? link.game.players : playerMembers.map((member) => ({ id: member ? participantResultKey(member) : null, userId: member?.userId, name: member?.displayNameSnapshot || "Player", faction: member?.factionSnapshot || "", hasProfile: Boolean(member?.userId), isProxy: Boolean(member?.isProxy) })),
      teamTournamentGame: { ...link, missionLocked: matches.find((match) => match.id === link.teamMatchId)?.pairingVersion === 2 }
    });
  });
  const viewerTeams = [];
  for (const team of myTeams) {
    const memberships = await teamsRepo.listMemberships(client, team.id);
    viewerTeams.push({ ...require("../domain/logos").teamLogoView(team), defaultRosterName: defaultRosterName(team, storedRosters), members: memberships.filter((membership) => !membership.endedAt) });
  }
  let auditEvents = [];
  if (includeAudit) {
    const { rows } = await client.query(
      "SELECT * FROM player_team_audit_events WHERE tournament_id = $1 ORDER BY created_at DESC, id DESC LIMIT 500",
      [tournament.id]
    );
    auditEvents = pairingLog.auditForViewer(rows, rawMatches, rosters, user);
  }
  return {
    tournament: {
      ...tournamentSummaryView(tournament),
      viewer: {
        role: canManageTournament(user, tournament) ? "admin" : "spectator",
        ...tournamentPermissions(user, tournament),
        captainRosterIds: activeRosters.filter((roster) => roster.captainUserId === user?.id).map((roster) => roster.id)
      },
      roundDraft: canManageTournament(user, tournament) ? tournament.roundDraft : undefined
    },
    participants: [],
    rosters,
    tables: tablesForRound(rounds.at(-1), tables).map(tournamentTableView),
    rounds: rounds.map((round) => ({ ...round, tables: tablesForRound(round, tables).map(tournamentTableView),
      matches: matches.filter((match) => match.roundId === round.id) })),
    teamMatches: matches,
    standings: teamStandings(activeRosters, rawMatches, tournament.teamTiebreakerOrder ?? null).map((row) => ({ ...row, rosterId: row.roster.id, roster: undefined })),
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
            ra.name AS roster_a_name, ra.team_id AS team_a_id, ra.team_name_snapshot AS team_a_name, ra.captain_user_id AS captain_a_id,
            rb.name AS roster_b_name, rb.team_id AS team_b_id, rb.team_name_snapshot AS team_b_name, rb.captain_user_id AS captain_b_id,
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
      resultPlayerIds: (participantsByGameId.get(game.id) || []).map((participant) => participant.resultKey),
      playerUserIds: (participantsByGameId.get(game.id) || []).map((participant) => participant.userId),
      hasProxy: (participantsByGameId.get(game.id) || []).some((participant) => participant.isProxy),
      players: (participantsByGameId.get(game.id) || []).map((participant) => ({
        id: participant.resultKey,
        userId: participant.userId,
        name: participant.displayNameSnapshot,
        faction: participant.factionSnapshot,
        avatarUrl: participant.user?.avatarUrl || null,
        hasProfile: Boolean(participant.userId),
        isProxy: participant.isProxy
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
        rosterA: { id: link.roster_a_id, name: link.roster_a_name, teamId: link.team_a_id, teamName: link.team_a_name, captainUserId: link.captain_a_id },
        rosterB: { id: link.roster_b_id, name: link.roster_b_name, teamId: link.team_b_id, teamName: link.team_b_name, captainUserId: link.captain_b_id }
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
  if (!canManageTournament(user, context.tournament)) throw new HttpError(403, "Administrator rights required");
  const targetPhase = context.match.captainPairingEnabled === false ? "environment_selection" : String(body.phase || "awaiting_roll");
  const allowed = ["awaiting_roll", "shield_selection", "sword_selection", "environment_selection"];
  if (context.match.pairingVersion === 2 && context.match.pairingType !== "sword_shield_classic") allowed.push("mission_ban");
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
    pairingHistory: [],
    pairingRevision: context.match.pairingRevision + 1,
    environment: null,
    gamePoints: null,
    teamGamePointsA: null,
    teamGamePointsB: null,
    teamTournamentPointsA: null,
    teamTournamentPointsB: null,
    teamElo: null,
    completedAt: null
  };
  if (targetPhase !== "environment_selection" || context.match.captainPairingEnabled === false) clear.pairings = null;
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
  return { teamMatch: redactTeamMatch(updated, context.rosterA, context.rosterB, user) };
}

async function overridePairingsAdmin({ client, user, params, body }) {
  const context = await requireMatchContext(client, params, user);
  if (!canManageTournament(user, context.tournament)) throw new HttpError(403, "Administrator rights required");
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
  await audit(client, context.tournament, user, "team_pairings_override", { entityType: "team_match", entityId: context.match.id, before: context.match.pairings, after: pairings,
    metadata: { logAssignments: pairingLog.assignmentDetails({ ...context, match: updated }, pairings.map(item => ({ slot: item.slot })), []) } });
  return { teamMatch: updated };
}

async function applyFinalGameResult(client, tournament, game, result, submittedBy, replaceCompleted = false) {
  const gamesApi = require("./games");
  if (replaceCompleted && game.elo) await gamesApi.reverseElo(client, game);
  if (game.hasProxy) {
    return gamesRepo.saveFinalResult(client, game.id, {
      result: { ...result, confirmedBy: submittedBy, confirmedAt: nowIso() },
      elo: null, submittedBy, newSubmission: true
    });
  }
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
  const candidate = await gamesRepo.findById(client, requirePositiveIntId(params.id, 404, "Game not found"));
  if (!candidate || candidate.sourceType !== "team_match_game") throw new HttpError(404, "Team tournament game not found");
  const matchCandidate = await teamMatchesRepo.findById(client, candidate.sourceId);
  if (!matchCandidate) throw new HttpError(409, "Team tournament game link is invalid");
  // Pairing undo and result submission acquire locks in the same order.
  const tournament = await tournamentsRepo.lockById(client, matchCandidate.tournamentId);
  if (tournament.status !== "in_progress") throw new HttpError(409, "Tournament is not in progress");
  const match = await teamMatchesRepo.findById(client, matchCandidate.id, true);
  const game = await gamesRepo.lockById(client, candidate.id);
  if (!match || !game) throw new HttpError(409, "Pairing changed. Open the current game again");
  const participants = await gameParticipantsRepo.listByGameIds(client, [game.id]);
  if (participants.length !== 2) throw new HttpError(409, "Game participant snapshots are missing");
  game.resultPlayerIds = participants.map((participant) => participant.resultKey);
  game.playerUserIds = participants.map((participant) => participant.userId);
  game.hasProxy = participants.some((participant) => participant.isProxy);
  const removed = await client.query(
    "SELECT id FROM tournament_team_rosters WHERE id = ANY($1::int[]) AND status = 'withdrawn'",
    [[match.rosterAId, match.rosterBId].filter(Boolean)]
  );
  if (match.resolution || removed.rowCount) throw new HttpError(409, "Results involving a removed roster are preserved and cannot be reopened");
  const isParticipant = game.playerIds.includes(user.id);
  const rosters = await rostersRepo.listByTournament(client, tournament.id, { includeWithdrawn: true });
  const permissions = teamGamePermissions(game, rosterById(rosters, match.rosterAId), rosterById(rosters, match.rosterBId), user);
  if (!canManageTournament(user, tournament) && !isParticipant && !permissions.captainRosterId) throw new HttpError(403, "Only a game participant or roster captain can change this result");
  const link = match.games.find((item) => item.gameId === game.id);
  if (!link || !["in_progress", "completed"].includes(match.phase)) throw new HttpError(409, "Complete captain pairing before reporting results");
  if (body.tiebreakers?.enabled && ["submit", "admin-save"].includes(action)) {
    throw new ValidationError("Individual tiebreakers are not allowed in team tournaments");
  }
  const resultBody = { ...body, tiebreakers: { enabled: false }, ...(match.pairingVersion === 2 ? { killzone: link.mission } : {}) };
  if (action === "submit") {
    if (game.status === "completed") throw new HttpError(409, "This game result has already been saved");
    if (!permissions.canSubmit) throw new HttpError(409, "This result is waiting for confirmation");
    const result = calculateSubmittedResult(resultBody, game.resultPlayerIds[0], game.resultPlayerIds[1]);
    if (tournament.venueMode === "irl" && !permissions.submitsAsCaptain) {
      await applyFinalGameResult(client, tournament, game, result, user.id);
      await recomputeTeamMatch(client, match.id);
    } else {
      await gamesRepo.savePendingResult(client, game.id, { submittedBy: user.id, pendingResult: {
        submittedBy: user.id, submittedAt: nowIso(), result,
        submittedAs: permissions.submitsAsCaptain ? "captain" : "player",
        submittedRosterId: permissions.ownRosterId,
        submittedByName: user.name
      } });
    }
  } else if (action === "confirm") {
    if (game.status !== "pending_confirmation" || !game.pendingResult?.result) throw new HttpError(409, "There is no submitted result to confirm");
    if (!permissions.canReview) throw new HttpError(403, permissions.requiresCaptainReview ? "The opposing captain must confirm this result" : "The opposing player or captain must confirm this result");
    const pendingResult = calculateSubmittedResult({ ...game.pendingResult.result, tiebreakers: { enabled: false } }, game.resultPlayerIds[0], game.resultPlayerIds[1]);
    await applyFinalGameResult(client, tournament, game, pendingResult, user.id);
    await recomputeTeamMatch(client, match.id);
  } else if (action === "reject") {
    if (game.status !== "pending_confirmation" || !game.pendingResult?.result) throw new HttpError(409, "There is no submitted result to reject");
    if (!permissions.canReview) throw new HttpError(403, permissions.requiresCaptainReview ? "The opposing captain must reject this result" : "The opposing player or captain must reject this result");
    await gamesRepo.clearResult(client, game.id);
  } else if (action === "admin-save") {
    if (!canManageTournament(user, tournament)) throw new HttpError(403, "Administrator rights required");
    if (!["open", "pending_confirmation", "completed"].includes(game.status)) throw new HttpError(409, "This game result cannot be edited");
    const result = calculateSubmittedResult(resultBody, game.resultPlayerIds[0], game.resultPlayerIds[1]);
    await applyFinalGameResult(client, tournament, game, result, user.id, game.status === "completed");
    await recalculateCompletedGameRatings(client);
    await recomputeTeamMatch(client, match.id);
  }
  await audit(client, tournament, user, `team_game_result_${action}`, { entityType: "game", entityId: game.id, metadata: { matchId: match.id, slot: link.slot } });
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
  const classic = match.pairingType === "sword_shield_classic";
  const teamPoints = complete ? teamPointsForMatch(match, progress) : null;
  const updated = await teamMatchesRepo.update(client, match.id, {
    phase: complete ? "completed" : "in_progress",
    gamePoints: progress.details,
    teamGamePointsA: classic ? null : progress.gpA,
    teamGamePointsB: classic ? null : progress.gpB,
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
    if (row.team_a_id === row.team_b_id || row.has_proxy) {
      await teamMatchesRepo.update(client, row.id, { teamElo: null });
      continue;
    }
    const venue = row.venue_mode === "irl" ? "irl" : "tts";
    const track = ratings[venue];
    const beforeA = rating(track, row.team_a_id);
    const beforeB = rating(track, row.team_b_id);
    const scoreA = row.team_tournament_points_a > row.team_tournament_points_b ? 1
      : row.team_tournament_points_a === row.team_tournament_points_b ? 0.5 : 0;
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
  const standings = teamStandings(rosters, matches, tournament.teamTiebreakerOrder ?? null);
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
    vpDiff: row.vpDiff,
    tacOpPoints: row.tacOpPoints
  }));
  for (const row of standings) await rostersRepo.update(client, row.roster.id, { status: "finished", finalPlace: row.rank, finishedAt: nowIso() });
  const updated = await tournamentsRepo.update(client, tournament.id, { status: "completed", completedAt: nowIso(), finalResults });
  await require("../db/repositories/achievements").syncPodium(client, updated, user.id);
  await audit(client, updated, user, "team_standings_publish", { after: finalResults });
  return tournamentData(client, updated, user, { includeAudit: true });
}

async function deleteTournamentGames(client, tournamentId) {
  const matches = await teamMatchesRepo.listByTournament(client, tournamentId);
  return gamesRepo.removeBySourceIds(client, "team_match_game", matches.map((match) => match.id));
}

async function rollbackLatestRound(client, tournament, user) {
  if (tournament.roundDraft) throw new HttpError(409, "Finish editing the restored round before undoing another round");
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const round = rounds[rounds.length - 1];
  if (!round) throw new HttpError(409, "There is no team round to roll back");
  const matches = await teamMatchesRepo.listByRound(client, round.id);
  const fullMatches = await teamMatchesRepo.listByTournament(client, tournament.id);
  const latest = fullMatches.filter((match) => match.roundId === round.id);
  if (latest.some((match) => (match.phase === "completed" && !match.resolution) || match.games.some((link) => ["completed", "pending_confirmation"].includes(link.game?.status) || link.game?.pendingResult))) {
    throw new HttpError(409, "Reset submitted team-match results before rolling back this round");
  }
  const draft = { roundNumber: round.roundNumber, tables: round.metadata?.tables || await tablesRepo.listByTournament(client, tournament.id),
    missions: round.metadata?.missions,
    matchups: matches.map(match => ({ rosterAId: match.rosterAId, rosterBId: match.rosterBId, lineNumber: match.lineNumber })) };
  await tournamentsRepo.update(client, tournament.id, { roundDraft: draft });
  await gamesRepo.removeBySourceIds(client, "team_match_game", matches.map((match) => match.id));
  await teamMatchesRepo.removeByRound(client, round.id);
  await roundsRepo.remove(client, round.id);
  await audit(client, tournament, user, "team_round_rollback", { entityType: "round", entityId: round.id, before: { round, matches } });
  return tournamentData(client, { ...tournament, roundDraft: draft }, user);
}

module.exports = {
  normalizeRosterMembers,
  rosterCaptainUserId,
  registerRoster,
  updateRoster,
  withdrawRoster,
  deleteRoster,
  reseedRosters,
  updateRosterSeedsAdmin,
  startTournament,
  previewNextRound,
  generateRound,
  getRoster,
  getPairingMatch,
  selectInitiative: recordPairingAction(selectInitiative),
  manualPairings: recordPairingAction(manualPairings),
  roll: recordPairingAction(roll),
  banMission: recordPairingAction(banMission),
  selectShield: recordPairingAction(selectShield),
  selectSword: recordPairingAction(selectSword),
  selectEnvironment: recordPairingAction(selectEnvironment),
  undoPairing,
  resetMatchAdmin,
  overridePairingsAdmin: recordPairingAction(overridePairingsAdmin),
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

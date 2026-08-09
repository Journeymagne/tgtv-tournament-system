const { HttpError, ValidationError } = require("../http/io");
const tournamentsRepo = require("../db/repositories/tournaments");
const participantsRepo = require("../db/repositories/tournament-participants");
const roundsRepo = require("../db/repositories/tournament-rounds");
const matchesRepo = require("../db/repositories/tournament-matches");
const tablesRepo = require("../db/repositories/tournament-tables");
const auditRepo = require("../db/repositories/tournament-audit-events");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const { requirePositiveIntId } = require("./params");
const {
  tournamentDetailView,
  tournamentSummaryView,
  tournamentMatchGameView,
  tournamentTableView
} = require("./views");
const { buildTournamentPreview } = require("../domain/tournaments/preview");
const { buildStandings } = require("../domain/tournaments/standings");
const { calculateSubmittedResult, matchScoreFor, parseKillzone } = require("../domain/scoring");
const { calculateElo, ELO_K } = require("../domain/elo");
const { requireKillTeam } = require("../domain/kill-teams");
const { uniqueSlug } = require("../domain/tournaments/slug");
const { buildSwissNextRound } = require("../domain/tournaments/swiss");
const { recalculateCompletedGameRatings } = require("./rating-replay");
const {
  normalizeNewTournament,
  normalizeTournamentPatch,
  validatePublishable,
  normalizeParticipantName,
  participantNameKey,
  normalizeFactionRules
} = require("../domain/tournaments/input");
const {
  TOURNAMENT_STATUSES,
  TOURNAMENT_FORMATS,
  PARTICIPANT_STATUSES,
  ROUND_STATUSES,
  MATCH_STATUSES
} = require("../domain/tournaments/constants");

function nowIso() {
  return new Date().toISOString();
}

function publicStatuses(tournament) {
  return tournamentsRepo.PUBLISHED_STATUSES.includes(tournament.status);
}

async function revertGameEloDeltas(client, games) {
  const deltas = new Map();
  for (const game of games) {
    for (const [userId, entry] of Object.entries(game.elo || {})) {
      const id = Number(userId);
      const delta = Number(entry?.delta || 0);
      if (!Number.isInteger(id) || !delta) continue;
      deltas.set(id, (deltas.get(id) || 0) - delta);
    }
  }
  for (const [userId, delta] of deltas) {
    await usersRepo.addRating(client, userId, delta);
  }
}

async function audit(client, tournament, user, eventType, details = {}) {
  return auditRepo.insert(client, {
    tournamentId: tournament.id,
    actorUserId: user?.id || null,
    eventType,
    ...details
  });
}

async function requireTournament(client, id, { forUpdate = false } = {}) {
  const tournamentId = requirePositiveIntId(id, 404, "Tournament not found");
  const tournament = forUpdate
    ? await tournamentsRepo.lockById(client, tournamentId)
    : await tournamentsRepo.findById(client, tournamentId);
  if (!tournament) throw new HttpError(404, "Tournament not found");
  return tournament;
}

async function peopleForParticipants(client, participants) {
  return usersRepo.findByIds(client, participants.map((participant) => participant.userId));
}

function viewerFor(tournament, participants, user) {
  if (!user) return { role: "spectator", canAdmin: false, participantId: null };
  const participant = participants.find((item) => item.userId === user.id && isListedParticipant(item)) || null;
  return {
    role: user.isAdmin ? "admin" : participant ? "participant" : "spectator",
    canAdmin: Boolean(user.isAdmin),
    participantId: participant?.id || null
  };
}

function isListedParticipant(participant) {
  return ![PARTICIPANT_STATUSES.WITHDRAWN, PARTICIPANT_STATUSES.REMOVED].includes(participant.status);
}

function participantHasGeneratedMatch(participantId, matches) {
  const id = Number(participantId);
  return matches.some((match) => match.participantAId === id || match.participantBId === id);
}

function normalizeOptionalDeployment(value) {
  if (value === undefined || value === null || value === "") return null;
  const deployment = Number(value);
  if (!Number.isSafeInteger(deployment) || deployment < 1 || deployment > 6) {
    throw new ValidationError("Deployment must be between 1 and 6");
  }
  return deployment;
}

function normalizeTablePayload(body = {}) {
  const tableNumber = body.tableNumber === undefined || body.tableNumber === ""
    ? null
    : requirePositiveIntId(body.tableNumber, 400, "Table number must be 1 or greater");
  const deployment = normalizeOptionalDeployment(body.deployment);
  const mission = parseKillzone({ killzone: body.killzone || "", layout: deployment || "" });
  return {
    tableNumber,
    killzone: mission?.killzone || "",
    deployment
  };
}

function normalizeRoundMission(input = {}) {
  return parseKillzone({
    killzone: input.killzone || "",
    critOp: input.critOp || "",
    layout: input.deployment || input.layout || ""
  }) || {};
}

function matchParticipantIds(match) {
  return [match.participantAId, match.participantBId].filter(Boolean);
}

function tableHistoryByParticipant(matches) {
  const history = new Map();
  for (const match of matches) {
    if (!match.tableId) continue;
    for (const participantId of matchParticipantIds(match)) {
      if (!history.has(participantId)) history.set(participantId, new Set());
      history.get(participantId).add(match.tableId);
    }
  }
  return history;
}

async function ensureTablesForPairings(client, tournament, pairingsCount) {
  if (tournament.venueMode !== "irl" || pairingsCount <= 0) return [];
  const tables = await tablesRepo.listByTournament(client, tournament.id);
  while (tables.length < pairingsCount) {
    tables.push(await tablesRepo.insert(client, { tournamentId: tournament.id }));
  }
  return tables;
}

function chooseTableForMatch(tables, match, history, usedThisRound) {
  if (!tables.length || match.isBye) return null;
  const participantIds = matchParticipantIds(match);
  if (participantIds.length < 2) return null;
  const candidatePool = tables.filter((table) => !usedThisRound.has(table.id));
  const candidates = candidatePool.length ? candidatePool : tables;
  const neverUsedByBoth = candidates.find((table) =>
    participantIds.every((id) => !history.get(id)?.has(table.id))
  );
  if (neverUsedByBoth) return neverUsedByBoth;
  const neverUsedByOne = candidates.find((table) =>
    participantIds.some((id) => !history.get(id)?.has(table.id))
  );
  return neverUsedByOne || candidates[0] || null;
}

function missionForMatch(tournament, table, roundMission = {}) {
  if (tournament.venueMode === "irl") {
    const mission = parseKillzone({
      killzone: table?.killzone || "",
      critOp: roundMission.critOp || "",
      layout: table?.deployment || ""
    });
    return mission || null;
  }
  const mission = parseKillzone(roundMission);
  return mission || null;
}

function applyRoundMissionAndTables(tournament, roundBlueprint, tables, previousMatches) {
  const history = tableHistoryByParticipant(previousMatches);
  const usedThisRound = new Set();
  for (const match of roundBlueprint.matches) {
    if (match.isBye) continue;
    let table = null;
    if (tournament.venueMode === "irl") {
      table = match.tableId
        ? tables.find((item) => item.id === match.tableId) || null
        : chooseTableForMatch(tables, match, history, usedThisRound);
      if (match.tableId && !table) throw new ValidationError("Round setup uses an unknown table");
      if (table) {
        match.tableId = table.id;
        usedThisRound.add(table.id);
      } else {
        match.tableId = null;
      }
    }
    match.mission = missionForMatch(tournament, table, roundBlueprint.mission || {});
  }
  return roundBlueprint;
}

function applyRoundSetupBody(roundBlueprint, participants, body = {}) {
  const participantIds = new Set(participants.map((participant) => participant.id));
  const seen = new Set();
  const setupMatches = Array.isArray(body.matchups) ? body.matchups : [];
  const roundMission = normalizeRoundMission(body.mission || body);
  const baseMatches = roundBlueprint.matches.map((match) => ({ ...match }));
  while (baseMatches.length < setupMatches.length) {
    baseMatches.push({
      key: `r${roundBlueprint.roundNumber}manual${baseMatches.length + 1}`,
      roundNumber: roundBlueprint.roundNumber,
      bracketPosition: baseMatches.length + 1,
      status: MATCH_STATUSES.NOT_READY,
      isBye: false,
      participantAId: null,
      participantBId: null,
      winnerParticipantId: null,
      sourceA: null,
      sourceB: null
    });
  }
  const matches = baseMatches.map((match, index) => {
    const setup = setupMatches[index] || {};
    if (match.isBye) return { ...match, mission: roundMission };
    const participantAId = setup.participantAId === undefined || setup.participantAId === ""
      ? match.participantAId || null
      : Number(setup.participantAId);
    const participantBId = setup.participantBId === undefined || setup.participantBId === ""
      ? match.participantBId || null
      : Number(setup.participantBId);
    if (
      (participantAId && !Number.isSafeInteger(participantAId)) ||
      (participantBId && !Number.isSafeInteger(participantBId))
    ) {
      throw new ValidationError("Round setup uses an invalid participant");
    }
    for (const id of [participantAId, participantBId].filter(Boolean)) {
      if (!participantIds.has(id)) throw new ValidationError("Round setup uses a player outside this tournament");
      if (seen.has(id)) throw new ValidationError("Each player can appear only once in a generated round");
      seen.add(id);
    }
    const tableId = setup.tableId === undefined || setup.tableId === ""
      ? match.tableId || null
      : Number(setup.tableId);
    if (tableId && !Number.isSafeInteger(tableId)) throw new ValidationError("Round setup uses an invalid table");
    return {
      ...match,
      bracketPosition: index + 1,
      participantAId,
      participantBId,
      tableId,
      status: participantAId && participantBId ? MATCH_STATUSES.ACTIVE : MATCH_STATUSES.NOT_READY,
      mission: roundMission
    };
  });
  return {
    ...roundBlueprint,
    mission: roundMission,
    matches
  };
}

function finalResultFromStanding(row, rank) {
  return {
    rank,
    participantId: row.participant.id,
    matchPoints: row.matchPoints,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    byes: row.byes,
    totalVp: row.totalVp,
    vpDiff: row.vpDiff,
    strengthOfSchedule: row.strengthOfSchedule,
    buchholz: row.buchholz
  };
}

function finalStandingsReady(tournament, rounds, matches) {
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) return false;
  if (!matches.length || matches.some((match) => match.status !== MATCH_STATUSES.COMPLETED)) return false;
  if (tournament.format === TOURNAMENT_FORMATS.SWISS) {
    return rounds.length >= Number(tournament.swissRoundCount || 0);
  }
  return true;
}

function finalStandingsOrderFromBody(body, standings) {
  const ids = Array.isArray(body?.participantIds) ? body.participantIds.map(Number) : [];
  const expected = standings.map((row) => row.participant.id);
  if (ids.length !== expected.length) {
    throw new ValidationError("Final standings must include every tournament participant exactly once");
  }
  const expectedSet = new Set(expected);
  const seen = new Set();
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || !expectedSet.has(id) || seen.has(id)) {
      throw new ValidationError("Final standings must include every tournament participant exactly once");
    }
    seen.add(id);
  }
  return ids;
}

async function fullView(client, tournament, user, { includeAudit = false } = {}) {
  const participants = await participantsRepo.listByTournament(client, tournament.id);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await matchesRepo.listByTournament(client, tournament.id);
  const tables = await tablesRepo.listByTournament(client, tournament.id);
  const people = await peopleForParticipants(client, participants);
  const standings = buildStandings(participants, matches, tournament.tiebreakerOrder);
  const auditEvents = includeAudit ? await auditRepo.listByTournament(client, tournament.id) : [];
  const visibleParticipants = participants.filter(isListedParticipant);
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const tournamentGames = matches
    .filter((match) => match.status === MATCH_STATUSES.COMPLETED && !match.isBye && match.result)
    .map((match) =>
      tournamentMatchGameView({
        tournament,
        match,
        participantA: participantById.get(match.participantAId),
        participantB: participantById.get(match.participantBId),
        people
      })
    );

  return tournamentDetailView({
    tournament,
    participants: visibleParticipants,
    people,
    rounds,
    matches,
    tables,
    tournamentGames,
    standings,
    viewer: viewerFor(tournament, participants, user),
    auditEvents
  });
}

async function listPublic({ client }) {
  const tournaments = await tournamentsRepo.listPublished(client);
  return { tournaments: tournaments.map(tournamentSummaryView) };
}

async function getPublic({ client, user, params }) {
  const tournament = await tournamentsRepo.findBySlug(client, params.slug);
  if (!tournament || !publicStatuses(tournament)) throw new HttpError(404, "Tournament not found");
  return fullView(client, tournament, user);
}

async function listAdmin({ client }) {
  const tournaments = await tournamentsRepo.listAdmin(client);
  return { tournaments: tournaments.map(tournamentSummaryView) };
}

async function getAdmin({ client, user, params }) {
  const tournament = await requireTournament(client, params.id);
  return fullView(client, tournament, user, { includeAudit: true });
}

async function createAdmin({ client, user, body }) {
  const slug = await uniqueSlug(body.slug || body.name, (candidate) =>
    tournamentsRepo.isSlugTaken(client, candidate)
  );
  const tournament = await tournamentsRepo.insert(
    client,
    normalizeNewTournament(body, user.id, slug)
  );
  await audit(client, tournament, user, "create", { after: tournament });
  return { status: 201, body: { tournament: tournamentSummaryView(tournament) } };
}

function assertEditableSetup(tournament) {
  if ([TOURNAMENT_STATUSES.COMPLETED, TOURNAMENT_STATUSES.CANCELLED].includes(tournament.status)) {
    throw new HttpError(409, "This tournament is read-only");
  }
}

async function updateAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  if (tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS) {
    const allowed = new Set(["description", "rulesSummary", "rulesLink", "startsAt", "tournamentRules"]);
    for (const key of Object.keys(body || {})) {
      if (!allowed.has(key)) throw new HttpError(409, "Tournament setup is locked after start");
    }
  }
  const patch = normalizeTournamentPatch(body);
  const updated = await tournamentsRepo.update(client, tournament.id, patch);
  await audit(client, updated, user, "update", { before: tournament, after: updated });
  return { tournament: tournamentSummaryView(updated) };
}

async function deleteAdmin({ client, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  const matches = await matchesRepo.listByTournament(client, tournament.id);
  const deletedGames = await gamesRepo.removeBySourceIds(
    client,
    "tournament_match",
    matches.map((match) => match.id)
  );
  await revertGameEloDeltas(client, deletedGames);
  const removed = await tournamentsRepo.remove(client, tournament.id);
  await recalculateCompletedGameRatings(client);
  return {
    ok: true,
    tournament: tournamentSummaryView(removed),
    deletedGames: deletedGames.length
  };
}

async function publishAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.DRAFT) {
    throw new HttpError(409, "Only draft tournaments can be published");
  }
  validatePublishable(tournament);
  const status =
    body.status === TOURNAMENT_STATUSES.REGISTRATION_CLOSED
      ? TOURNAMENT_STATUSES.REGISTRATION_CLOSED
      : TOURNAMENT_STATUSES.REGISTRATION_OPEN;
  const updated = await tournamentsRepo.update(client, tournament.id, {
    status,
    publishedAt: nowIso()
  });
  await audit(client, updated, user, "publish", { before: tournament, after: updated });
  return { tournament: tournamentSummaryView(updated) };
}

async function setRegistration({ client, user, params, status }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (
    ![TOURNAMENT_STATUSES.REGISTRATION_OPEN, TOURNAMENT_STATUSES.REGISTRATION_CLOSED].includes(
      tournament.status
    )
  ) {
    throw new HttpError(409, "Registration can be changed only before tournament start");
  }
  const updated = await tournamentsRepo.update(client, tournament.id, { status });
  await audit(client, updated, user, `registration_${status}`, { before: tournament, after: updated });
  return { tournament: tournamentSummaryView(updated) };
}

function withRegistrationStatus(handlerStatus) {
  return (ctx) => setRegistration({ ...ctx, status: handlerStatus });
}

async function assertParticipantAddAllowed(client, tournament, source) {
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) return;
  if (source === "self_join") throw new HttpError(409, "Registration is closed after tournament start");
  if (tournament.format !== TOURNAMENT_FORMATS.SWISS) {
    throw new HttpError(409, "Late placement is available only for Swiss tournaments");
  }
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const activeRound = rounds.find((round) => round.status === ROUND_STATUSES.ACTIVE);
  if (!activeRound) throw new HttpError(409, "Late placement is blocked until the next round exists");
  if (activeRound.roundNumber >= tournament.swissRoundCount) {
    throw new HttpError(409, "Late placement is blocked because there is no next Swiss round");
  }
}

async function assertParticipantCapacityAllowed(client, tournament, additionalCount = 1) {
  if (tournament.format !== TOURNAMENT_FORMATS.SINGLE_ELIMINATION) return;
  if (tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS) return;
  const bracketSize = Number(tournament.singleEliminationSize || 8);
  const participants = await participantsRepo.listByTournament(client, tournament.id);
  const competitiveCount = participants.filter((participant) =>
    [PARTICIPANT_STATUSES.JOINED, PARTICIPANT_STATUSES.ACTIVE].includes(participant.status)
  ).length;
  if (competitiveCount + additionalCount > bracketSize) {
    throw new HttpError(
      409,
      `Single elimination bracket is limited to ${bracketSize} participants`
    );
  }
}

async function createParticipant(client, tournament, user, body, source) {
  await assertParticipantAddAllowed(client, tournament, source);
  await assertParticipantCapacityAllowed(client, tournament);
  const linkedUser = await participantLinkedUser(client, user, body, source);
  const displayName = normalizeParticipantName(body.displayName || body.name || linkedUser?.name);
  const status =
    tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS
      ? PARTICIPANT_STATUSES.PENDING_PLACEMENT
      : PARTICIPANT_STATUSES.JOINED;
  const seed = (await participantsRepo.maxSeed(client, tournament.id)) + 1;
  try {
    return await participantsRepo.insert(client, {
      tournamentId: tournament.id,
      userId: linkedUser?.id || null,
      displayName,
      displayNameKey: participantNameKey(displayName),
      faction: body.faction || "",
      factionRules: normalizeFactionRules(body.factionRules),
      status,
      source,
      seed
    });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "Participant already exists");
    throw err;
  }
}

async function participantLinkedUser(client, user, body, source) {
  if (source === "self_join") return user;
  if (!body.userId) return null;
  const userId = requirePositiveIntId(body.userId, 400, "Invalid participant user");
  const linkedUser = await usersRepo.findById(client, userId);
  if (!linkedUser) throw new HttpError(404, "Participant user not found");
  return linkedUser;
}

async function join({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.REGISTRATION_OPEN) {
    throw new HttpError(409, "Registration is not open");
  }
  const participant = await createParticipant(
    client,
    tournament,
    user,
    { ...body, faction: requireKillTeam(body.faction) },
    "self_join"
  );
  await audit(client, tournament, user, "participant_join", {
    entityType: "participant",
    entityId: participant.id,
    after: participant
  });
  return { participant };
}

async function withdraw({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (
    ![TOURNAMENT_STATUSES.DRAFT, TOURNAMENT_STATUSES.REGISTRATION_OPEN, TOURNAMENT_STATUSES.REGISTRATION_CLOSED].includes(
      tournament.status
    )
  ) {
    throw new HttpError(409, "Withdraw is allowed only before tournament start");
  }
  const participant = await participantsRepo.findByTournamentUser(client, tournament.id, user.id, {
    forUpdate: true
  });
  if (!participant) throw new HttpError(404, "Participant not found");
  const updated = await participantsRepo.update(client, participant.id, {
    status: PARTICIPANT_STATUSES.WITHDRAWN,
    withdrawnAt: nowIso()
  });
  await audit(client, tournament, user, "participant_withdraw", {
    entityType: "participant",
    entityId: participant.id,
    before: participant,
    after: updated
  });
  return { participant: updated };
}

async function addParticipant({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  const participant = await createParticipant(client, tournament, null, body, "admin_manual");
  await audit(client, tournament, user, "participant_add", {
    entityType: "participant",
    entityId: participant.id,
    after: participant
  });
  return { status: 201, body: { participant } };
}

async function bulkParticipants({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  if (tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Bulk add is available only before tournament start");
  }
  const names = String(body.names || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!names.length) throw new ValidationError("Paste at least one participant name");
  await assertParticipantCapacityAllowed(client, tournament, names.length);

  const participants = [];
  const seen = new Set();
  for (const rawName of names) {
    const displayName = normalizeParticipantName(rawName);
    const key = participantNameKey(displayName);
    if (seen.has(key)) throw new HttpError(409, "Duplicate participant name in bulk list");
    seen.add(key);
    participants.push(
      await createParticipant(client, tournament, null, { displayName }, "admin_bulk")
    );
  }
  await audit(client, tournament, user, "participant_bulk_add", { after: participants });
  return { status: 201, body: { participants } };
}

async function updateParticipant({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  const participantId = requirePositiveIntId(params.participantId, 404, "Participant not found");
  const participant = await participantsRepo.lockById(client, participantId);
  if (!participant || participant.tournamentId !== tournament.id) {
    throw new HttpError(404, "Participant not found");
  }
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "userId")) {
    if (["withdrawn", "removed"].includes(participant.status)) {
      throw new HttpError(409, "Withdrawn or removed participants cannot be linked");
    }
    const userId = requirePositiveIntId(body.userId, 400, "Invalid participant user");
    const linkedUser = await usersRepo.findById(client, userId);
    if (!linkedUser) throw new HttpError(404, "Participant user not found");
    const existing = await participantsRepo.findByTournamentUser(client, tournament.id, userId, {
      forUpdate: true
    });
    if (existing && existing.id !== participant.id) {
      throw new HttpError(409, "Participant user already exists in this tournament");
    }
    patch.userId = linkedUser.id;
  }
  if (Object.prototype.hasOwnProperty.call(body, "displayName")) {
    if (tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS) {
      throw new HttpError(409, "Participant names are locked after start");
    }
    const displayName = normalizeParticipantName(body.displayName);
    patch.displayName = displayName;
    patch.displayNameKey = participantNameKey(displayName);
  }
  if (Object.prototype.hasOwnProperty.call(body, "faction")) patch.faction = String(body.faction || "");
  if (Object.prototype.hasOwnProperty.call(body, "factionRules")) {
    patch.factionRules = normalizeFactionRules(body.factionRules);
  }
  const updated = await participantsRepo.update(client, participant.id, patch);
  await audit(client, tournament, user, "participant_update", {
    entityType: "participant",
    entityId: participant.id,
    before: participant,
    after: updated
  });
  return { participant: updated };
}

async function removeParticipant({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  const participantId = requirePositiveIntId(params.participantId, 404, "Participant not found");
  const participant = await participantsRepo.lockById(client, participantId);
  if (!participant || participant.tournamentId !== tournament.id) {
    throw new HttpError(404, "Participant not found");
  }
  if (tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS) {
    const matches = await matchesRepo.listByTournament(client, tournament.id);
    if (
      participant.status !== PARTICIPANT_STATUSES.PENDING_PLACEMENT ||
      participantHasGeneratedMatch(participant.id, matches)
    ) {
      throw new HttpError(409, "Participants with generated matches cannot be removed after start");
    }
  }
  const updated = await participantsRepo.update(client, participant.id, {
    status: PARTICIPANT_STATUSES.REMOVED,
    removedAt: nowIso()
  });
  await audit(client, tournament, user, "participant_remove", {
    entityType: "participant",
    entityId: participant.id,
    before: participant,
    after: updated
  });
  return { participant: updated };
}

async function updateSeeds({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status === TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Seeds are locked after start");
  }
  assertEditableSetup(tournament);
  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const active = participants.filter((item) => ["joined", "active"].includes(item.status));
  const ids = Array.isArray(body.participantIds)
    ? body.participantIds.map((id) => requirePositiveIntId(id, 400, "Invalid seed order"))
    : [];
  if (ids.length !== active.length) throw new ValidationError("Seed order must include every active participant");
  const activeIds = new Set(active.map((item) => item.id));
  if (new Set(ids).size !== ids.length || ids.some((id) => !activeIds.has(id))) {
    throw new ValidationError("Seed order must include every active participant once");
  }
  const updated = [];
  for (let index = 0; index < ids.length; index += 1) {
    updated.push(await participantsRepo.update(client, ids[index], { seed: index + 1 }));
  }
  await audit(client, tournament, user, "seeds_update", { after: updated });
  return { participants: updated };
}

function assertTablesAvailable(tournament) {
  if (tournament.venueMode !== "irl") {
    throw new HttpError(409, "Tables are available only for In Real Life tournaments");
  }
}

async function requireTournamentTable(client, tournament, id) {
  const tableId = requirePositiveIntId(id, 404, "Table not found");
  const table = await tablesRepo.lockById(client, tableId);
  if (!table || table.tournamentId !== tournament.id) throw new HttpError(404, "Table not found");
  return table;
}

async function addTableAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  assertTablesAvailable(tournament);
  const payload = normalizeTablePayload(body);
  try {
    const table = await tablesRepo.insert(client, {
      tournamentId: tournament.id,
      ...payload
    });
    await audit(client, tournament, user, "table_add", {
      entityType: "table",
      entityId: table.id,
      after: table
    });
    return { status: 201, body: { table: tournamentTableView(table) } };
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "Table number already exists");
    throw err;
  }
}

async function updateTableAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  assertTablesAvailable(tournament);
  const table = await requireTournamentTable(client, tournament, params.tableId);
  const updated = await tablesRepo.update(client, table.id, normalizeTablePayload(body));
  await audit(client, tournament, user, "table_update", {
    entityType: "table",
    entityId: table.id,
    before: table,
    after: updated
  });
  return { table: tournamentTableView(updated) };
}

async function deleteTableAdmin({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  assertEditableSetup(tournament);
  assertTablesAvailable(tournament);
  const table = await requireTournamentTable(client, tournament, params.tableId);
  const matches = await matchesRepo.listByTournament(client, tournament.id);
  if (matches.some((match) => match.tableId === table.id)) {
    throw new HttpError(409, "This table is already assigned to a tournament match");
  }
  const removed = await tablesRepo.remove(client, table.id);
  await audit(client, tournament, user, "table_delete", {
    entityType: "table",
    entityId: table.id,
    before: table,
    after: removed
  });
  return { table: tournamentTableView(removed) };
}

async function previewAdmin({ client, params }) {
  const tournament = await requireTournament(client, params.id);
  const participants = await participantsRepo.listCompetitive(client, tournament.id);
  return { preview: buildTournamentPreview(tournament, participants) };
}

function roundSetupParticipantPool(participants) {
  return participants.filter((participant) => isListedParticipant(participant));
}

function firstRoundParticipantPool(participants) {
  return participants.filter((participant) =>
    [PARTICIPANT_STATUSES.ACTIVE, PARTICIPANT_STATUSES.PENDING_PLACEMENT].includes(participant.status)
  );
}

function roundSetupView(roundBlueprint, tables, participants) {
  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  return {
    id: roundBlueprint.id || null,
    roundNumber: roundBlueprint.roundNumber,
    status: roundBlueprint.status,
    mission: roundBlueprint.mission || null,
    matches: (roundBlueprint.matches || []).map((match, index) => ({
      id: match.id || null,
      roundNumber: match.roundNumber || roundBlueprint.roundNumber,
      bracketPosition: match.bracketPosition || index + 1,
      status: match.status,
      isBye: Boolean(match.isBye),
      participantAId: match.participantAId || null,
      participantBId: match.participantBId || null,
      participantA: participantsById.get(match.participantAId) || null,
      participantB: participantsById.get(match.participantBId) || null,
      tableId: match.tableId || null,
      table: tablesById.get(match.tableId) || null,
      mission: match.mission || null
    }))
  };
}

function pairingsCountForTables(roundBlueprint) {
  return (roundBlueprint.matches || []).filter(
    (match) => !match.isBye && matchParticipantIds(match).length === 2
  ).length;
}

function assertNextSwissRoundAllowed(tournament, rounds, matches) {
  const latestRound = rounds[rounds.length - 1];
  if (!latestRound || !roundIsComplete(latestRound, matches)) {
    throw new HttpError(409, "Finish all matches in the current Swiss round before generating the next round");
  }
  if (latestRound.roundNumber >= tournament.swissRoundCount) {
    throw new HttpError(409, "All Swiss rounds have already been generated");
  }
  const nextRoundNumber = latestRound.roundNumber + 1;
  if (rounds.some((round) => round.roundNumber === nextRoundNumber)) {
    throw new HttpError(409, "Next Swiss round has already been generated");
  }
  return nextRoundNumber;
}

function assertNextSingleEliminationRoundAllowed(rounds, matches) {
  const nextRound = rounds.find((round) => round.status === ROUND_STATUSES.NOT_READY);
  if (!nextRound) throw new HttpError(409, "There is no next bracket round to activate");

  const previousRound = rounds.find((round) => round.roundNumber === nextRound.roundNumber - 1);
  if (!previousRound || !roundIsComplete(previousRound, matches)) {
    throw new HttpError(409, "Finish the previous bracket round before activating the next round");
  }

  const nextMatches = matchesForRound(matches, nextRound);
  if (nextMatches.some((match) => !match.isBye && (!match.participantAId || !match.participantBId))) {
    throw new HttpError(409, "The next bracket round is waiting for winners from the previous round");
  }
  return { nextRound, nextMatches };
}

async function prepareFirstRoundSetup(client, tournament, rounds, matches, participants, body = {}) {
  if (rounds.length) throw new HttpError(409, "First round has already been generated");
  const eligible = firstRoundParticipantPool(participants);
  const preview = buildTournamentPreview(tournament, eligible);
  const firstRound = preview.rounds[0];
  if (
    tournament.format === TOURNAMENT_FORMATS.SINGLE_ELIMINATION &&
    Array.isArray(body.matchups) &&
    body.matchups.length > firstRound.matches.length
  ) {
    throw new ValidationError("Single elimination cannot add extra pairings");
  }
  const setupRound = applyRoundSetupBody(firstRound, roundSetupParticipantPool(eligible), body);
  const tables = await ensureTablesForPairings(client, tournament, pairingsCountForTables(setupRound));
  const round = applyRoundMissionAndTables(tournament, setupRound, tables, matches);
  return {
    isFirstRound: true,
    round,
    tables,
    preview: {
      ...preview,
      rounds: [round, ...preview.rounds.slice(1)]
    }
  };
}

async function prepareNextRoundSetup(client, tournament, user, rounds, matches, participants, body = {}) {
  if (!rounds.length) {
    return prepareFirstRoundSetup(client, tournament, rounds, matches, participants, body);
  }

  let roundBlueprint = null;
  if (tournament.format === TOURNAMENT_FORMATS.SWISS) {
    const nextRoundNumber = assertNextSwissRoundAllowed(tournament, rounds, matches);
    roundBlueprint = buildSwissNextRound(tournament, participants, matches, nextRoundNumber);
    roundBlueprint.generatedBy = `admin:${user.id}`;
  } else {
    const { nextRound, nextMatches } = assertNextSingleEliminationRoundAllowed(rounds, matches);
    if (Array.isArray(body.matchups) && body.matchups.length > nextMatches.length) {
      throw new ValidationError("Single elimination cannot add extra pairings");
    }
    roundBlueprint = {
      id: nextRound.id,
      roundNumber: nextRound.roundNumber,
      status: ROUND_STATUSES.ACTIVE,
      mission: null,
      matches: nextMatches.map((match, index) => ({
        ...match,
        key: `existing-${match.id}`,
        bracketPosition: match.bracketPosition || index + 1,
        status: match.isBye ? MATCH_STATUSES.COMPLETED : MATCH_STATUSES.ACTIVE,
        completedAt: match.isBye ? nowIso() : null
      }))
    };
  }

  const setupRound = applyRoundSetupBody(
    roundBlueprint,
    roundSetupParticipantPool(participants),
    body
  );
  const tables = await ensureTablesForPairings(client, tournament, pairingsCountForTables(setupRound));
  return {
    isFirstRound: false,
    round: applyRoundMissionAndTables(tournament, setupRound, tables, matches),
    tables
  };
}

async function previewNextRoundAdmin({ client, user, params }) {
  const tournament = await requireTournament(client, params.id);
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Tournament is not in progress");
  }
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await matchesRepo.listByTournament(client, tournament.id);
  const participants = await participantsRepo.listByTournament(client, tournament.id);
  const { round, tables } = await prepareNextRoundSetup(
    client,
    tournament,
    user,
    rounds,
    matches,
    participants
  );
  return {
    round: roundSetupView(round, tables, participants),
    tables: tables.map(tournamentTableView)
  };
}

async function persistPreview(client, tournament, preview) {
  const matchIdByKey = new Map();
  const createdRounds = [];
  const createdMatches = [];
  for (const roundBlueprint of preview.rounds) {
    const matchPairingCount = roundBlueprint.matches.filter(
      (match) => !match.isBye && matchParticipantIds(match).length === 2
    ).length;
    const tables = await ensureTablesForPairings(client, tournament, matchPairingCount);
    const setupRound = applyRoundMissionAndTables(
      tournament,
      { ...roundBlueprint, matches: roundBlueprint.matches.map((match) => ({ ...match })) },
      tables,
      createdMatches
    );
    const round = await roundsRepo.insert(client, {
      tournamentId: tournament.id,
      roundNumber: setupRound.roundNumber,
      status: setupRound.status,
      metadata: { format: preview.format, mission: setupRound.mission || null },
      startedAt: setupRound.status === ROUND_STATUSES.ACTIVE ? nowIso() : null
    });
    createdRounds.push(round);
    for (const matchBlueprint of setupRound.matches) {
      const match = await matchesRepo.insert(client, {
        ...matchBlueprint,
        tournamentId: tournament.id,
        roundId: round.id,
        sourceMatchAId: matchIdByKey.get(matchBlueprint.sourceA) || null,
        sourceMatchBId: matchIdByKey.get(matchBlueprint.sourceB) || null,
        completedAt: matchBlueprint.status === "completed" ? nowIso() : null
      });
      matchIdByKey.set(matchBlueprint.key, match.id);
      createdMatches.push(match);
    }
  }
  return { rounds: createdRounds, matches: createdMatches };
}

async function startAdmin({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.REGISTRATION_CLOSED) {
    throw new HttpError(409, "Registration must be closed before start");
  }
  validatePublishable(tournament);
  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const competitive = participants.filter((item) => item.status === PARTICIPANT_STATUSES.JOINED);
  buildTournamentPreview(tournament, competitive);
  await participantsRepo.setAllCompetitiveStatus(client, tournament.id, PARTICIPANT_STATUSES.ACTIVE);
  const updated = await tournamentsRepo.update(client, tournament.id, {
    status: TOURNAMENT_STATUSES.IN_PROGRESS,
    startedAt: nowIso()
  });
  await audit(client, updated, user, "start", {
    before: tournament,
    after: updated,
    metadata: { firstRoundPending: true, participantCount: competitive.length }
  });
  return fullView(client, updated, user, { includeAudit: true, includePrivate: true });
}

async function requireMatch(client, tournament, id) {
  const matchId = requirePositiveIntId(id, 404, "Tournament match not found");
  const match = await matchesRepo.lockById(client, matchId);
  if (!match || match.tournamentId !== tournament.id) {
    throw new HttpError(404, "Tournament match not found");
  }
  return match;
}

function participantById(participants, id) {
  return participants.find((participant) => participant.id === id) || null;
}

function requireMatchParticipants(match, participants) {
  const participantA = participantById(participants, match.participantAId);
  const participantB = participantById(participants, match.participantBId);
  if (!participantA || !participantB) throw new HttpError(409, "Both match participants are required");
  return { participantA, participantB };
}

function participantResultKey(participant) {
  return participant.userId || -participant.id;
}

function assertMatchParticipantUser(match, participantA, participantB, user, action) {
  if (![participantA.userId, participantB.userId].includes(user.id)) {
    throw new HttpError(403, `Only a match participant can ${action}`);
  }
}

function winnerParticipantIdFromResult(result, participantA, participantB) {
  if (!result.winnerId) return null;
  const winnerId = Number(result.winnerId);
  if (
    winnerId === Number(participantA.userId) ||
    winnerId === participantA.id ||
    winnerId === participantResultKey(participantA)
  ) {
    return participantA.id;
  }
  if (
    winnerId === Number(participantB.userId) ||
    winnerId === participantB.id ||
    winnerId === participantResultKey(participantB)
  ) {
    return participantB.id;
  }
  throw new ValidationError("Result winner does not match tournament participants");
}

function matchPointsFor(match, winnerParticipantId) {
  if (match.isBye && winnerParticipantId) return { [winnerParticipantId]: 3 };
  const points = {};
  if (!winnerParticipantId) {
    points[match.participantAId] = 1;
    points[match.participantBId] = 1;
    return points;
  }
  points[match.participantAId] = winnerParticipantId === match.participantAId ? 3 : 0;
  points[match.participantBId] = winnerParticipantId === match.participantBId ? 3 : 0;
  return points;
}

function resultForTournament(tournament, result, confirmedBy) {
  return {
    ...result,
    confirmedBy,
    confirmedAt: confirmedBy ? nowIso() : null,
    challengeCredit: tournament.challengeCreditPolicy === "count"
  };
}

function assertCompletableResult(tournament, result, winnerParticipantId) {
  if (tournament.format === TOURNAMENT_FORMATS.SINGLE_ELIMINATION && !winnerParticipantId) {
    throw new ValidationError("Single elimination matches require a winner; enable Approved Ops tiebreakers");
  }
  if (result.winnerId && !winnerParticipantId) {
    throw new ValidationError("Result winner does not match tournament participants");
  }
}

async function ensureTournamentGame(client, match, participantA, participantB) {
  if (!participantA.userId || !participantB.userId) return null;
  if (match.gameId) return gamesRepo.lockById(client, match.gameId);
  return gamesRepo.insert(client, {
    challengeId: null,
    playerIds: [participantA.userId, participantB.userId],
    sourceType: "tournament_match",
    sourceId: match.id
  });
}

async function applyTournamentElo(client, tournament, participantA, participantB, result) {
  if (tournament.ratingPolicy !== "ranked") return null;
  if (!participantA.userId || !participantB.userId) return null;

  const players = await usersRepo.lockByIds(client, [participantA.userId, participantB.userId]);
  const playerA = players.find((player) => player.id === participantA.userId);
  const playerB = players.find((player) => player.id === participantB.userId);
  if (!playerA || !playerB) throw new HttpError(409, "One of the tournament players has been deleted");

  const matchScoreA = matchScoreFor(result, playerA.id, playerB.id);
  const { deltaA, deltaB } = calculateElo(playerA.rating, playerB.rating, matchScoreA);
  const updatedA = await usersRepo.addRating(client, playerA.id, deltaA);
  const updatedB = await usersRepo.addRating(client, playerB.id, deltaB);

  return {
    k: ELO_K,
    [playerA.id]: { before: playerA.rating, after: updatedA.rating, delta: deltaA },
    [playerB.id]: { before: playerB.rating, after: updatedB.rating, delta: deltaB }
  };
}

async function publishFinalStandingsAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await matchesRepo.listByTournament(client, tournament.id);

  if (!finalStandingsReady(tournament, rounds, matches)) {
    throw new HttpError(409, "Finish every tournament match before publishing final standings");
  }

  const standings = buildStandings(participants, matches, tournament.tiebreakerOrder);
  const byParticipantId = new Map(standings.map((row) => [row.participant.id, row]));
  const participantIds = finalStandingsOrderFromBody(body, standings);
  const finalResults = participantIds.map((participantId, index) =>
    finalResultFromStanding(byParticipantId.get(participantId), index + 1)
  );

  for (const row of standings) {
    if (["active", "pending_placement"].includes(row.participant.status)) {
      await participantsRepo.update(client, row.participant.id, {
        status: PARTICIPANT_STATUSES.FINISHED
      });
    }
  }
  const updated = await tournamentsRepo.update(client, tournament.id, {
    status: TOURNAMENT_STATUSES.COMPLETED,
    completedAt: nowIso(),
    finalResults
  });
  await audit(client, updated, user, "standings_publish", { after: updated, metadata: { finalResults } });
  return fullView(client, updated, user, { includeAudit: true });
}

async function syncSingleElimination(client, tournament, user, match, winnerParticipantId) {
  if (winnerParticipantId) {
    await participantsRepo.update(client, winnerParticipantId, {
      status: PARTICIPANT_STATUSES.ACTIVE
    });
  }

  if (!match.isBye && winnerParticipantId) {
    const loserId = match.participantAId === winnerParticipantId ? match.participantBId : match.participantAId;
    if (loserId) {
      await participantsRepo.update(client, loserId, {
        status: PARTICIPANT_STATUSES.ELIMINATED
      });
    }
  }

  let matches = await matchesRepo.listByTournament(client, tournament.id);
  const childMatches = matches.filter(
    (item) => item.sourceMatchAId === match.id || item.sourceMatchBId === match.id
  );
  for (const child of childMatches) {
    const patch =
      child.sourceMatchAId === match.id
        ? { participantAId: winnerParticipantId }
        : { participantBId: winnerParticipantId };
    const updatedChild = await matchesRepo.update(client, child.id, patch);
    if (
      updatedChild.status === MATCH_STATUSES.NOT_READY &&
      updatedChild.participantAId &&
      updatedChild.participantBId
    ) {
      await matchesRepo.update(client, child.id, {
        status: MATCH_STATUSES.ACTIVE
      });
    }
  }

  matches = await matchesRepo.listByTournament(client, tournament.id);
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  for (const round of rounds) {
    const roundMatches = matches.filter((item) => item.roundId === round.id);
    if (!roundMatches.length) continue;
    if (roundMatches.every((item) => item.status === MATCH_STATUSES.COMPLETED)) {
      if (round.status !== ROUND_STATUSES.COMPLETED) {
        await roundsRepo.update(client, round.id, {
          status: ROUND_STATUSES.COMPLETED,
          completedAt: nowIso()
        });
      }
      continue;
    }
    if (
      roundMatches.some((item) => item.status === MATCH_STATUSES.ACTIVE) &&
      round.status !== ROUND_STATUSES.ACTIVE
    ) {
      await roundsRepo.update(client, round.id, {
        status: ROUND_STATUSES.ACTIVE,
        startedAt: round.startedAt || nowIso()
      });
    }
  }

  return null;
}

async function persistSwissRound(client, tournament, roundBlueprint) {
  const round = await roundsRepo.insert(client, {
    tournamentId: tournament.id,
    roundNumber: roundBlueprint.roundNumber,
    status: roundBlueprint.status,
    generatedBy: roundBlueprint.generatedBy || "system",
    metadata: { format: "swiss", mission: roundBlueprint.mission || null },
    startedAt: nowIso()
  });
  const matches = [];
  for (const matchBlueprint of roundBlueprint.matches) {
    matches.push(
      await matchesRepo.insert(client, {
        ...matchBlueprint,
        tournamentId: tournament.id,
        roundId: round.id,
        completedAt: matchBlueprint.status === MATCH_STATUSES.COMPLETED ? nowIso() : null
      })
    );
  }
  return { round, matches };
}

async function syncSwiss(client, tournament, user, match, participants) {
  const roundMatches = await matchesRepo.listByRound(client, match.roundId);
  if (roundMatches.some((item) => item.status !== MATCH_STATUSES.COMPLETED)) return null;

  await roundsRepo.update(client, match.roundId, {
    status: ROUND_STATUSES.COMPLETED,
    completedAt: nowIso()
  });

  if (match.roundNumber >= tournament.swissRoundCount) {
    await audit(client, tournament, user, "standings_ready", {
      metadata: { roundNumber: match.roundNumber }
    });
    return null;
  }

  await audit(client, tournament, user, "round_ready", {
    metadata: { roundNumber: match.roundNumber, nextRoundNumber: match.roundNumber + 1 }
  });
  return null;
}

function matchesForRound(matches, round) {
  return matches.filter((match) => match.roundId === round.id);
}

function roundIsComplete(round, matches) {
  const roundMatches = matchesForRound(matches, round);
  return roundMatches.length > 0 && roundMatches.every((match) => match.status === MATCH_STATUSES.COMPLETED);
}

async function assertCompletedMatchEditable(client, tournament, match) {
  if (match.status !== MATCH_STATUSES.COMPLETED) return false;

  const matches = await matchesRepo.listByTournament(client, tournament.id);
  if (tournament.format === TOURNAMENT_FORMATS.SWISS) {
    if (matches.some((item) => item.roundNumber > match.roundNumber)) {
      throw new HttpError(409, "This result is locked because a later Swiss round has already been generated");
    }
    return true;
  }

  const childMatches = matches.filter(
    (item) => item.sourceMatchAId === match.id || item.sourceMatchBId === match.id
  );
  if (childMatches.some((item) => item.status !== MATCH_STATUSES.NOT_READY)) {
    throw new HttpError(409, "This result is locked because the next bracket round has already been activated");
  }
  return true;
}

async function generateSwissNextRound(client, tournament, user, rounds, matches, participants, body = {}) {
  const pending = participants.filter(
    (participant) => participant.status === PARTICIPANT_STATUSES.PENDING_PLACEMENT
  );
  const { round: nextRound } = await prepareNextRoundSetup(
    client,
    tournament,
    user,
    rounds,
    matches,
    participants,
    body
  );
  await persistSwissRound(client, tournament, nextRound);
  for (const participant of pending) {
    await participantsRepo.update(client, participant.id, {
      status: PARTICIPANT_STATUSES.ACTIVE,
      placedAt: nowIso()
    });
  }
  await audit(client, tournament, user, "round_generate", { metadata: nextRound });
}

async function generateSingleEliminationNextRound(client, tournament, user, rounds, matches, participants, body = {}) {
  const setup = await prepareNextRoundSetup(
    client,
    tournament,
    user,
    rounds,
    matches,
    participants,
    body
  );
  const nextRound = setup.round;

  if (setup.isFirstRound) {
    await persistPreview(client, tournament, setup.preview);
    await audit(client, tournament, user, "round_generate", {
      metadata: nextRound
    });
    return;
  }

  await roundsRepo.update(client, nextRound.id, {
    status: ROUND_STATUSES.ACTIVE,
    metadata: { format: "single_elimination", mission: nextRound.mission || null },
    startedAt: nowIso()
  });
  for (const match of nextRound.matches) {
    await matchesRepo.update(client, match.id, {
      participantAId: match.participantAId || null,
      participantBId: match.participantBId || null,
      tableId: match.tableId || null,
      mission: match.mission || null,
      status: match.status,
      completedAt: match.completedAt || null
    });
  }
  await audit(client, tournament, user, "round_generate", {
    metadata: nextRound
  });
}

async function generateNextRoundAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Tournament is not in progress");
  }

  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  const matches = await matchesRepo.listByTournament(client, tournament.id);
  const participants = await participantsRepo.lockByTournament(client, tournament.id);

  if (tournament.format === TOURNAMENT_FORMATS.SWISS) {
    await generateSwissNextRound(client, tournament, user, rounds, matches, participants, body);
  } else {
    await generateSingleEliminationNextRound(client, tournament, user, rounds, matches, participants, body);
  }

  const freshTournament = await tournamentsRepo.findById(client, tournament.id);
  return fullView(client, freshTournament, user, { includeAudit: true, includePrivate: true });
}

async function reverseMatchElo(client, match) {
  if (!match.elo) return;
  for (const [playerId, entry] of Object.entries(match.elo)) {
    if (playerId === "k") continue;
    const id = Number(playerId);
    const delta = Number(entry?.delta || 0);
    if (Number.isInteger(id) && delta) await usersRepo.addRating(client, id, -delta);
  }
}

async function completeMatch(
  client,
  tournament,
  match,
  participants,
  user,
  result,
  submittedByUserId,
  options = {}
) {
  const { replaceCompleted = false } = options;
  const { participantA, participantB } = requireMatchParticipants(match, participants);
  const winnerParticipantId = winnerParticipantIdFromResult(result, participantA, participantB);
  assertCompletableResult(tournament, result, winnerParticipantId);

  const finalResult = resultForTournament(tournament, result, user?.id || null);
  if (replaceCompleted) await reverseMatchElo(client, match);
  const game = await ensureTournamentGame(client, match, participantA, participantB);
  const elo = await applyTournamentElo(client, tournament, participantA, participantB, finalResult);
  let gameId = match.gameId || null;
  if (game) {
    const updatedGame = await gamesRepo.saveFinalResult(client, game.id, {
      result: finalResult,
      elo,
      submittedBy: submittedByUserId,
      newSubmission: !replaceCompleted
    });
    gameId = updatedGame.id;
  }

  const completed = await matchesRepo.update(client, match.id, {
    status: MATCH_STATUSES.COMPLETED,
    pendingResult: null,
    result: finalResult,
    matchPoints: matchPointsFor(match, winnerParticipantId),
    elo,
    gameId,
    submittedByUserId,
    winnerParticipantId,
    completedAt: replaceCompleted ? match.completedAt || nowIso() : nowIso()
  });

  if (tournament.format === TOURNAMENT_FORMATS.SINGLE_ELIMINATION) {
    await syncSingleElimination(client, tournament, user, completed, winnerParticipantId);
  } else {
    await syncSwiss(client, tournament, user, completed, participants);
  }
  if (gameId) {
    await recalculateCompletedGameRatings(client);
    return matchesRepo.findById(client, match.id);
  }
  return completed;
}

async function submitResult({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Tournament is not in progress");
  }
  const match = await requireMatch(client, tournament, params.matchId);
  if (match.status === MATCH_STATUSES.COMPLETED) throw new HttpError(409, "This match is already completed");
  if (![MATCH_STATUSES.ACTIVE, MATCH_STATUSES.PENDING_CONFIRMATION].includes(match.status)) {
    throw new HttpError(409, "This match is not ready for results");
  }

  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const { participantA, participantB } = requireMatchParticipants(match, participants);
  assertMatchParticipantUser(match, participantA, participantB, user, "submit the result");
  if (match.status === MATCH_STATUSES.PENDING_CONFIRMATION && match.pendingResult?.submittedBy !== user.id) {
    throw new HttpError(409, "This result is waiting for your confirmation");
  }

  const result = calculateSubmittedResult(
    body,
    participantResultKey(participantA),
    participantResultKey(participantB)
  );
  const winnerParticipantId = winnerParticipantIdFromResult(result, participantA, participantB);
  assertCompletableResult(tournament, result, winnerParticipantId);
  const submittedAt = nowIso();
  const game = await ensureTournamentGame(client, match, participantA, participantB);
  if (game) {
    await gamesRepo.savePendingResult(client, game.id, {
      submittedBy: user.id,
      pendingResult: { submittedBy: user.id, submittedAt, result }
    });
  }
  const updated = await matchesRepo.update(client, match.id, {
    status: MATCH_STATUSES.PENDING_CONFIRMATION,
    pendingResult: { submittedBy: user.id, submittedAt, result },
    submittedByUserId: user.id,
    gameId: game?.id || match.gameId || null
  });
  await audit(client, tournament, user, "match_result_submit", {
    entityType: "match",
    entityId: match.id,
    after: updated
  });
  return fullView(client, tournament, user);
}

async function confirmResult({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Tournament is not in progress");
  }
  const match = await requireMatch(client, tournament, params.matchId);
  if (match.status !== MATCH_STATUSES.PENDING_CONFIRMATION || !match.pendingResult?.result) {
    throw new HttpError(409, "There is no submitted result to confirm");
  }
  if (match.pendingResult.submittedBy === user.id) {
    throw new HttpError(403, "The other player must confirm this result");
  }

  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const { participantA, participantB } = requireMatchParticipants(match, participants);
  assertMatchParticipantUser(match, participantA, participantB, user, "confirm the result");
  const completed = await completeMatch(
    client,
    tournament,
    match,
    participants,
    user,
    match.pendingResult.result,
    match.pendingResult.submittedBy
  );
  await audit(client, tournament, user, "match_result_confirm", {
    entityType: "match",
    entityId: match.id,
    before: match,
    after: completed
  });
  const freshTournament = await tournamentsRepo.findById(client, tournament.id);
  return fullView(client, freshTournament, user);
}

async function rejectResult({ client, user, params }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  const match = await requireMatch(client, tournament, params.matchId);
  if (match.status !== MATCH_STATUSES.PENDING_CONFIRMATION || !match.pendingResult?.result) {
    throw new HttpError(409, "There is no submitted result to reject");
  }
  if (match.pendingResult.submittedBy === user.id) {
    throw new HttpError(403, "The other player must reject this result");
  }

  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const { participantA, participantB } = requireMatchParticipants(match, participants);
  assertMatchParticipantUser(match, participantA, participantB, user, "reject the result");
  if (match.gameId) await gamesRepo.clearResult(client, match.gameId);
  const updated = await matchesRepo.update(client, match.id, {
    status: MATCH_STATUSES.ACTIVE,
    pendingResult: null,
    submittedByUserId: null
  });
  await audit(client, tournament, user, "match_result_reject", {
    entityType: "match",
    entityId: match.id,
    before: match,
    after: updated
  });
  return fullView(client, tournament, user);
}

async function saveMatchResultAdmin({ client, user, params, body }) {
  const tournament = await requireTournament(client, params.id, { forUpdate: true });
  if (tournament.status !== TOURNAMENT_STATUSES.IN_PROGRESS) {
    throw new HttpError(409, "Tournament is not in progress");
  }
  const match = await requireMatch(client, tournament, params.matchId);
  if (![MATCH_STATUSES.ACTIVE, MATCH_STATUSES.PENDING_CONFIRMATION, MATCH_STATUSES.COMPLETED].includes(match.status)) {
    throw new HttpError(409, "Only active, pending, or editable completed tournament matches can be saved");
  }
  const replaceCompleted = await assertCompletedMatchEditable(client, tournament, match);

  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const { participantA, participantB } = requireMatchParticipants(match, participants);
  const playerAId = participantResultKey(participantA);
  const playerBId = participantResultKey(participantB);
  const result = calculateSubmittedResult(body, playerAId, playerBId);
  const completed = await completeMatch(client, tournament, match, participants, user, result, user.id, {
    replaceCompleted
  });
  await audit(client, tournament, user, "match_result_admin", {
    entityType: "match",
    entityId: match.id,
    before: match,
    after: completed
  });
  const freshTournament = await tournamentsRepo.findById(client, tournament.id);
  return fullView(client, freshTournament, user, { includeAudit: true, includePrivate: true });
}

module.exports = {
  listPublic,
  getPublic,
  listAdmin,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  publishAdmin,
  closeRegistration: withRegistrationStatus(TOURNAMENT_STATUSES.REGISTRATION_CLOSED),
  reopenRegistration: withRegistrationStatus(TOURNAMENT_STATUSES.REGISTRATION_OPEN),
  join,
  withdraw,
  addParticipant,
  bulkParticipants,
  updateParticipant,
  removeParticipant,
  updateSeeds,
  previewAdmin,
  previewNextRoundAdmin,
  startAdmin,
  generateNextRoundAdmin,
  addTableAdmin,
  updateTableAdmin,
  deleteTableAdmin,
  publishFinalStandingsAdmin,
  submitResult,
  confirmResult,
  rejectResult,
  saveMatchResultAdmin
};

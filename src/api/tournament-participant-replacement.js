const { HttpError, ValidationError } = require("../http/io");
const { canManageTournament } = require("../domain/access");
const { requirePositiveIntId } = require("./params");
const { requireKillTeam } = require("../domain/kill-teams");
const { participantNameKey } = require("../domain/tournaments/input");
const { participantIdentity, matchParticipant, participantResultKey } = require("../domain/tournaments/results");
const participantsRepo = require("../db/repositories/tournament-participants");
const matchesRepo = require("../db/repositories/tournament-matches");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const gameParticipantsRepo = require("../db/repositories/game-participants");

// Called in the route transaction with the tournament and participant locked.
async function replaceParticipant(client, tournament, participant, user, body) {
  if (!canManageTournament(user, tournament)) throw new HttpError(403, "Tournament access required");
  if (tournament.participantMode === "team") throw new HttpError(409, "Use the team roster editor");
  if (["completed", "cancelled"].includes(tournament.status) || ["withdrawn", "removed", "finished", "eliminated"].includes(participant.status)) {
    throw new HttpError(409, "This participant cannot be replaced");
  }
  const expected = body.expectedIdentity;
  if (expected && (expected.userId !== participant.userId || Boolean(expected.isProxy) !== participant.isProxy || expected.displayName !== participant.displayName)) {
    throw new HttpError(409, "Participant changed. Refresh the tournament before replacing them.");
  }
  let replacementUser = null;
  let displayName;
  const isProxy = body.proxy === true;
  if (Object.hasOwn(body, "proxy") && !isProxy) throw new ValidationError("Choose a registered player or a new proxy");
  if (isProxy) {
    if (body.userId != null) throw new ValidationError("A proxy cannot have a registered account");
    const existing = await participantsRepo.listByTournament(client, tournament.id);
    do {
      const { rows: [row] } = await client.query("SELECT nextval('tournament_proxy_number') AS number");
      displayName = "Proxybot " + row.number;
    } while (existing.some(p => p.displayNameKey === participantNameKey(displayName)));
  } else {
    const id = requirePositiveIntId(body.userId, 400, "Choose a registered player");
    replacementUser = await usersRepo.findById(client, id);
    if (!replacementUser) throw new HttpError(404, "Player not found");
    const access = require("../db/repositories/access");
    access.assertActive(await access.hydrate(client, replacementUser));
    const existing = await participantsRepo.findByTournamentUser(client, tournament.id, id, { forUpdate: true });
    if (existing && existing.id !== participant.id) throw new HttpError(409, "Player already participates in this tournament");
    if (participant.userId === id) return participant;
    displayName = replacementUser.name;
  }
  const patch = { userId: replacementUser?.id ?? null, displayName,
    displayNameKey: participantNameKey(displayName), isProxy,
    ...(Object.hasOwn(body, "faction") ? { faction: requireKillTeam(body.faction) } : {}) };
  const next = { ...participant, ...patch };
  const participants = await participantsRepo.lockByTournament(client, tournament.id);
  const { rows: locked } = await client.query(
    "SELECT id FROM tournament_matches WHERE tournament_id = $1 AND (participant_a_id = $2 OR participant_b_id = $2) ORDER BY id FOR UPDATE",
    [tournament.id, participant.id]);
  for (const row of locked) {
    const match = await matchesRepo.findById(client, row.id);
    const game = match.gameId ? await gamesRepo.lockById(client, match.gameId) : null;
    const recorded = game ? await gameParticipantsRepo.listByGameIds(client, [game.id]) : [];
    const sides = [match.participantAId, match.participantBId].filter(Boolean).map(id => {
      const current = participants.find(p => p.id === id);
      if (!current) throw new HttpError(409, "Match participant is missing");
      const identity = matchParticipant(match, current);
      const saved = recorded.find(p => p.tournamentParticipantId === id);
      return saved ? { ...identity, userId: saved.userId, resultKey: saved.resultKey, displayName: saved.displayNameSnapshot,
        faction: saved.factionSnapshot, isProxy: saved.isProxy } : identity;
    });
    // Completed games, byes and submitted results belong to their original players.
    // Once frozen, this identity survives subsequent replacements in the same seat.
    if (match.status === "completed" || match.result || match.pendingResult || game?.result || game?.pendingResult || Object.keys(match.participantSnapshots || {}).length) {
      const snapshots = { ...(match.participantSnapshots || {}) };
      for (const side of sides) snapshots[side.id] = participantIdentity(side);
      await matchesRepo.update(client, match.id, { participantSnapshots: snapshots });
      continue;
    }
    if (game) {
      if (game.status !== "open") throw new HttpError(409, "Resolve the current game before replacing this player");
      const newSides = sides.map(p => p.id === participant.id ? next : p);
      if (new Set(newSides.map(participantResultKey)).size !== newSides.length) throw new HttpError(409, "A player cannot face themselves");
      await gameParticipantsRepo.replaceForGame(client, game.id, newSides.map(p => ({
        userId: p.userId, tournamentParticipantId: p.id, resultKey: participantResultKey(p),
        displayNameSnapshot: p.displayName, factionSnapshot: p.faction, isProxy: p.isProxy
      })));
      await client.query("UPDATE games SET player_ids = $2::int[] WHERE id = $1", [game.id, newSides.map(p => p.userId).filter(Number.isInteger)]);
    }
  }
  try {
    return await participantsRepo.update(client, participant.id, patch);
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "Player or display name already participates in this tournament");
    throw err;
  }
}

module.exports = { replaceParticipant };

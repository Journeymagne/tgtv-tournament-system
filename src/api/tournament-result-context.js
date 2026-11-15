const { HttpError, ValidationError } = require("../http/io");
const recordedParticipants = require("../db/repositories/game-participants");
const { matchParticipant, participantIdentity, participantResultKey } = require("../domain/tournaments/results");

function registeredFactionsForRecordedSide(match, participant, saved) {
  const frozen = participant && match.participantSnapshots?.[participant.id];
  if (frozen?.factions) return frozen.factions;
  // Account deletion leaves the same seat's registered choices intact. A
  // replacement has a frozen snapshot; never borrow its new occupant's list.
  if (participant && !saved.isProxy && participant.userId === saved.userId) {
    return participant.factions || saved.factions;
  }
  return saved.factions;
}

function resolveSides(match, participants, recorded) {
  const resolve = id => {
    const participant = matchParticipant(match, participants.find(p => p.id === id));
    if (!participant) throw new HttpError(409, "Both match participants are required");
    const saved = recorded.find(p => p.tournamentParticipantId === id);
    if (!saved) return participant;
    return {
      ...participant,
      userId: saved.userId,
      resultKey: saved.resultKey,
      displayName: saved.displayNameSnapshot,
      faction: saved.factionSnapshot,
      factions: registeredFactionsForRecordedSide(match, participant, saved),
      isProxy: saved.isProxy
    };
  };
  return { participantA: resolve(match.participantAId), participantB: resolve(match.participantBId) };
}

async function resolveTournamentResultSides(client, match, participants) {
  const recorded = match.gameId ? await recordedParticipants.listByGameIds(client, [match.gameId]) : [];
  return resolveSides(match, participants, recorded);
}

function assertTournamentResultContext(body, match, sides) {
  if (Object.hasOwn(body, "expectedGameId") &&
      (!Number.isSafeInteger(body.expectedGameId) || body.expectedGameId !== match.gameId)) {
    throw new HttpError(409, "The tournament game changed. Reopen its result form");
  }
  const expected = [participantResultKey(sides.participantA), participantResultKey(sides.participantB)].map(String);
  const scores = body.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores) ||
      Object.keys(scores).length !== 2 || !expected.every(key => Object.hasOwn(scores, key))) {
    throw new ValidationError("Provide scores for exactly the two current game participants");
  }
}

// Preserve recorded keys in tournament result forms after an account is deleted,
// without changing normal live participants or persisting new history snapshots.
async function attachRecordedMatchIdentities(client, matches, participants) {
  const recorded = await recordedParticipants.listByGameIds(client, matches.map(m => m.gameId).filter(Number.isInteger));
  const byGame = new Map();
  for (const saved of recorded) {
    if (!byGame.has(saved.gameId)) byGame.set(saved.gameId, []);
    byGame.get(saved.gameId).push(saved);
  }
  return matches.map(match => {
    const saved = byGame.get(match.gameId);
    if (!saved || !match.participantAId || !match.participantBId) return match;
    const sides = resolveSides(match, participants, saved);
    const snapshots = { ...match.participantSnapshots };
    let changed = false;
    for (const side of Object.values(sides)) {
      const current = matchParticipant(match, participants.find(p => p.id === side.id));
      if (participantResultKey(current) !== side.resultKey || current.userId !== side.userId) {
        snapshots[side.id] = participantIdentity(side);
        changed = true;
      }
    }
    return changed ? { ...match, participantSnapshots: snapshots } : match;
  });
}

module.exports = { resolveTournamentResultSides, assertTournamentResultContext, attachRecordedMatchIdentities, registeredFactionsForRecordedSide };

const { ValidationError } = require("../../http/io");

// Result keys belong to users, or to guests via a negative participant ID.
// Positive tournament participant IDs are a separate, overlapping namespace.
function participantResultKey(participant) {
  return participant.userId ?? -participant.id;
}

function resultWinner(result, participants) {
  if (result?.winnerId == null) return null;
  const key = result.winnerId;
  if (!Number.isSafeInteger(key) || key === 0) {
    throw new ValidationError("Invalid game result winner key");
  }
  const winners = participants.filter((participant) => participant &&
    participantResultKey(participant) === key);
  if (winners.length !== 1) throw new ValidationError("Result winner does not match tournament participants uniquely");
  return winners[0];
}

function winnerParticipantIdFromResult(result, participantA, participantB) {
  if (result.winnerId == null) return null;
  const winner = resultWinner(result, [participantA, participantB]);
  if (!winner) throw new ValidationError("Result winner does not match tournament participants");
  return winner.id;
}

function assertMatchWinner(match, participants) {
  const winner = match.winnerParticipantId;
  if (winner != null && (!Number.isSafeInteger(winner) || winner <= 0 ||
      ![match.participantAId, match.participantBId].includes(winner))) {
    throw new ValidationError("Winner participant does not belong to this match");
  }
  if (match.participantAId != null && match.participantAId === match.participantBId) {
    throw new ValidationError("Match participants must be distinct");
  }
  if (participants) {
    for (const id of [match.participantAId, match.participantBId].filter(id => id != null)) {
      const participant = participants.find(p => p?.id === id);
      if (!participant || (match.tournamentId != null && participant.tournamentId !== match.tournamentId)) {
        throw new ValidationError("Match participant does not belong to this tournament");
      }
    }
  }
}

// Reads never reinterpret game/user keys. The conversion belongs at the write boundary.
function matchWinnerParticipantId(match) {
  assertMatchWinner(match);
  return match.winnerParticipantId ?? null;
}

function participantScore(result, participant) {
  if (!participant) return {};
  return result?.scoresByParticipantId?.[participant.id] ??
    result?.scores?.[participantResultKey(participant)] ?? {};
}

function tournamentResultSnapshot(result, participants) {
  return { ...result, scoresByParticipantId: Object.fromEntries(participants.map(p =>
    [p.id, result.scores?.[participantResultKey(p)] ?? {}])) };
}

module.exports = { participantResultKey, winnerParticipantIdFromResult, matchWinnerParticipantId,
  assertMatchWinner, participantScore, tournamentResultSnapshot };

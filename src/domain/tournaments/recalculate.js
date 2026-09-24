const { ValidationError } = require('../../http/io');
const { assertMatchWinner, participantResultKey } = require('./results');

// Explicit maintenance boundary: game keys are resolved using the game's recorded
// participant links, including accounts deleted since the game was played.
function recalculateMatch(match, participants, game, gameParticipants = []) {
  const sides = [match.participantAId, match.participantBId]
    .filter(id => id != null).map(id => participants.find(p => p.id === id));
  if (sides.some(p => !p) || !sides.length) throw new ValidationError(`Match ${match.id}: participant is missing`);
  if (match.isBye) {
    if (sides.length !== 1) throw new ValidationError(`Match ${match.id}: bye requires one participant`);
    const winnerParticipantId = sides[0].id;
    assertMatchWinner({ ...match, winnerParticipantId }, sides);
    return { winnerParticipantId, matchPoints: { [winnerParticipantId]: 3 } };
  }
  if (sides.length !== 2) throw new ValidationError(`Match ${match.id}: two participants are required`);
  if (match.gameId && (!game || game.sourceType !== 'tournament_match' || game.sourceId !== match.id ||
      game.status !== 'completed' || !game.result)) {
    throw new ValidationError(`Match ${match.id}: completed game link is invalid`);
  }
  const result = game?.result ?? match.result;
  if (!result) throw new ValidationError(`Match ${match.id}: result is missing`);
  const identities = sides.map(participant => {
    const recorded = gameParticipants.filter(p => p.tournamentParticipantId === participant.id);
    if (recorded.length > 1 || (gameParticipants.length && recorded.length !== 1)) {
      throw new ValidationError(`Match ${match.id}: game participant link is ambiguous`);
    }
    const key = recorded[0]?.resultKey ?? participantResultKey(participant);
    if (!Number.isSafeInteger(key) || !key || !result.scores?.[key]) {
      throw new ValidationError(`Match ${match.id}: original player score cannot be resolved`);
    }
    return { participant, key };
  });
  if (identities[0].key === identities[1].key) throw new ValidationError(`Match ${match.id}: duplicate game player key`);
  const winners = result.winnerId == null ? [] : identities.filter(p => p.key === result.winnerId);
  if (result.winnerId != null && winners.length !== 1) {
    throw new ValidationError(`Match ${match.id}: game winner cannot be resolved`);
  }
  const winnerParticipantId = winners[0]?.participant.id ?? null;
  assertMatchWinner({ ...match, winnerParticipantId }, sides);
  return {
    winnerParticipantId,
    matchPoints: Object.fromEntries(sides.map(p => [p.id, winnerParticipantId === null ? 1 : p.id === winnerParticipantId ? 3 : 0])),
    result: { ...result, scoresByParticipantId: Object.fromEntries(identities.map(p => [p.participant.id, result.scores[p.key]])) }
  };
}

module.exports = { recalculateMatch };

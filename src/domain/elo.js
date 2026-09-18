const ELO_K = 32;
const UNREGISTERED_OPPONENT_RATING = 1000;

function calculateElo(ratingA, ratingB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(ELO_K * (scoreA - expectedA));
  return { deltaA, deltaB: -deltaA };
}

// Result keys identify both registered players and guests; user IDs identify
// accounts whose ratings can actually change. Never discard the guest's slot.
function calculateParticipantElo(participants, ratings, result) {
  if (participants.length !== 2 || !participants.some((p) => p.userId)) return null;
  if (participants.some((p) => p.userId && !ratings.has(p.userId))) return null;
  const [a, b] = participants;
  const winner = result?.winnerId == null ? null : Number(result.winnerId);
  if (winner !== null && winner !== a.resultKey && winner !== b.resultKey) {
    throw new Error("Result winner does not match game participants");
  }
  const beforeA = a.userId ? ratings.get(a.userId) : UNREGISTERED_OPPONENT_RATING;
  const beforeB = b.userId ? ratings.get(b.userId) : UNREGISTERED_OPPONENT_RATING;
  const scoreA = winner === a.resultKey ? 1 : winner === b.resultKey ? 0 : 0.5;
  const { deltaA, deltaB } = calculateElo(beforeA, beforeB, scoreA);
  const entry = (participant, before, delta) => participant.userId
    ? { before, after: before + delta, delta }
    : { before, after: before, delta: 0, fixed: true };
  return {
    k: ELO_K,
    [a.resultKey]: entry(a, beforeA, deltaA),
    [b.resultKey]: entry(b, beforeB, deltaB)
  };
}

module.exports = { ELO_K, UNREGISTERED_OPPONENT_RATING, calculateElo, calculateParticipantElo };

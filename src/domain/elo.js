const ELO_K = 32;

function calculateElo(ratingA, ratingB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(ELO_K * (scoreA - expectedA));
  return { deltaA, deltaB: -deltaA };
}

module.exports = { ELO_K, calculateElo };

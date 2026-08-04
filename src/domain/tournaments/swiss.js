const { ValidationError } = require("../../http/io");
const { MATCH_STATUSES, ROUND_STATUSES } = require("./constants");
const { seedParticipants } = require("./seeding");
const { buildStandings } = require("./standings");

function validateSwiss(participants, roundCount) {
  if (participants.length < 4 || participants.length > 128) {
    throw new ValidationError("Swiss requires 4-128 active participants");
  }
  if (!Number.isSafeInteger(roundCount) || roundCount < 1) {
    throw new ValidationError("Swiss round count must be 1 or greater");
  }
}

function buildSwissRoundOne(participants, roundCount) {
  validateSwiss(participants, roundCount);
  const seeded = seedParticipants(participants);
  const pairable = [...seeded];
  const matches = [];

  if (pairable.length % 2 === 1) {
    const bye = pairable.pop();
    matches.push({
      key: "r1m1",
      roundNumber: 1,
      bracketPosition: 1,
      status: MATCH_STATUSES.COMPLETED,
      isBye: true,
      participantAId: bye.id,
      participantBId: null,
      winnerParticipantId: bye.id,
      sourceA: null,
      sourceB: null
    });
  }

  const half = pairable.length / 2;
  const top = pairable.slice(0, half);
  const bottom = pairable.slice(half);
  for (let index = 0; index < half; index += 1) {
    matches.push({
      key: `r1m${matches.length + 1}`,
      roundNumber: 1,
      bracketPosition: matches.length + 1,
      status: MATCH_STATUSES.ACTIVE,
      isBye: false,
      participantAId: top[index].id,
      participantBId: bottom[index].id,
      winnerParticipantId: null,
      sourceA: null,
      sourceB: null
    });
  }

  return {
    format: "swiss",
    swissRoundCount: roundCount,
    rounds: [{ roundNumber: 1, status: ROUND_STATUSES.ACTIVE, matches }]
  };
}

function playedPairKey(aId, bId) {
  return [aId, bId].sort((a, b) => a - b).join(":");
}

function playedPairs(matches) {
  const pairs = new Set();
  for (const match of matches) {
    if (match.isBye || !match.participantAId || !match.participantBId) continue;
    if (match.status !== MATCH_STATUSES.COMPLETED) continue;
    pairs.add(playedPairKey(match.participantAId, match.participantBId));
  }
  return pairs;
}

function eligibleForNextRound(participants) {
  return participants
    .filter((participant) => ["active", "pending_placement"].includes(participant.status))
    .sort((a, b) => (a.seed || 0) - (b.seed || 0) || a.id - b.id);
}

function chooseByeIndex(rows) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (!rows[index].byes) return index;
  }
  return rows.length - 1;
}

function buildSwissNextRound(tournament, participants, matches, roundNumber) {
  const eligible = eligibleForNextRound(participants);
  validateSwiss(eligible, tournament.swissRoundCount);
  if (!Number.isInteger(roundNumber) || roundNumber < 2 || roundNumber > tournament.swissRoundCount) {
    throw new ValidationError("Swiss round number is out of range");
  }

  const standings = buildStandings(eligible, matches, tournament.tiebreakerOrder);
  const rows = [...standings];
  const pairHistory = playedPairs(matches);
  const roundMatches = [];

  if (rows.length % 2 === 1) {
    const byeIndex = chooseByeIndex(rows);
    const [byeRow] = rows.splice(byeIndex, 1);
    roundMatches.push({
      key: `r${roundNumber}m1`,
      roundNumber,
      bracketPosition: 1,
      status: MATCH_STATUSES.COMPLETED,
      isBye: true,
      participantAId: byeRow.participant.id,
      participantBId: null,
      winnerParticipantId: byeRow.participant.id,
      sourceA: null,
      sourceB: null
    });
  }

  while (rows.length) {
    const rowA = rows.shift();
    let opponentIndex = rows.findIndex(
      (rowB) => !pairHistory.has(playedPairKey(rowA.participant.id, rowB.participant.id))
    );
    if (opponentIndex === -1) opponentIndex = 0;
    const [rowB] = rows.splice(opponentIndex, 1);
    roundMatches.push({
      key: `r${roundNumber}m${roundMatches.length + 1}`,
      roundNumber,
      bracketPosition: roundMatches.length + 1,
      status: MATCH_STATUSES.ACTIVE,
      isBye: false,
      participantAId: rowA.participant.id,
      participantBId: rowB.participant.id,
      winnerParticipantId: null,
      sourceA: null,
      sourceB: null
    });
  }

  return { roundNumber, status: ROUND_STATUSES.ACTIVE, matches: roundMatches };
}

module.exports = { buildSwissRoundOne, buildSwissNextRound, playedPairKey };

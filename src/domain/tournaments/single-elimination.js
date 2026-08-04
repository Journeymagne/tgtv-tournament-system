const { ValidationError } = require("../../http/io");
const { MATCH_STATUSES, ROUND_STATUSES, SINGLE_ELIMINATION_SIZES } = require("./constants");
const { seedParticipants } = require("./seeding");

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

function roundCountFor(bracketSize) {
  return Math.log2(bracketSize);
}

function seedSlotOrder(size) {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new ValidationError("Bracket size must be a power of two");
  }
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

function validateParticipantCount(count, bracketSize) {
  if (!SINGLE_ELIMINATION_SIZES.includes(bracketSize)) {
    throw new ValidationError("Single elimination bracket size must be 8, 16, 32, or 64");
  }
  if (count !== bracketSize) {
    throw new ValidationError(`Single elimination requires exactly ${bracketSize} active participants`);
  }
}

function buildFirstRound(participants, bracketSize) {
  const bySeed = new Map(seedParticipants(participants).map((participant) => [participant.seed, participant]));
  const slots = seedSlotOrder(bracketSize).map((seed) => bySeed.get(seed) || null);
  const matches = [];
  for (let index = 0; index < slots.length; index += 2) {
    const a = slots[index];
    const b = slots[index + 1];
    const isBye = Boolean((a && !b) || (!a && b));
    const winner = isBye ? a || b : null;
    matches.push({
      key: `r1m${matches.length + 1}`,
      roundNumber: 1,
      bracketPosition: matches.length + 1,
      status: isBye ? MATCH_STATUSES.COMPLETED : MATCH_STATUSES.ACTIVE,
      isBye,
      participantAId: a?.id || b?.id || null,
      participantBId: a && b ? b.id : null,
      winnerParticipantId: winner?.id || null,
      sourceA: null,
      sourceB: null
    });
  }
  return matches;
}

function buildSingleElimination(participants, requestedBracketSize = 8) {
  const bracketSize = Number(requestedBracketSize || 8);
  validateParticipantCount(participants.length, bracketSize);

  const roundsTotal = roundCountFor(bracketSize);
  const rounds = [];
  let previous = buildFirstRound(participants, bracketSize);
  rounds.push({
    roundNumber: 1,
    status: ROUND_STATUSES.ACTIVE,
    matches: previous
  });

  for (let roundNumber = 2; roundNumber <= roundsTotal; roundNumber += 1) {
    const matches = [];
    for (let index = 0; index < previous.length; index += 2) {
      const sourceA = previous[index];
      const sourceB = previous[index + 1];
      matches.push({
        key: `r${roundNumber}m${matches.length + 1}`,
        roundNumber,
        bracketPosition: matches.length + 1,
        status: MATCH_STATUSES.NOT_READY,
        isBye: false,
        participantAId: sourceA?.winnerParticipantId || null,
        participantBId: sourceB?.winnerParticipantId || null,
        winnerParticipantId: null,
        sourceA: sourceA?.key || null,
        sourceB: sourceB?.key || null
      });
    }
    rounds.push({ roundNumber, status: ROUND_STATUSES.NOT_READY, matches });
    previous = matches;
  }

  return { format: "single_elimination", bracketSize, rounds };
}

module.exports = {
  nextPowerOfTwo,
  seedSlotOrder,
  buildSingleElimination
};

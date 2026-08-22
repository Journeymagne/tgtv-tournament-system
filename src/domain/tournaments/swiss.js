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

function randomIndex(length, random) {
  const value = Number(random());
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(value, 1 - Number.EPSILON)) : 0;
  return Math.floor(normalized * length);
}

function randomChoice(items, random) {
  return items[randomIndex(items.length, random)];
}

function shuffled(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function chooseByeRow(rows, random) {
  const fewestByes = Math.min(...rows.map((row) => Number(row.byes || 0)));
  const leastByeRows = rows.filter((row) => Number(row.byes || 0) === fewestByes);
  const lowestScore = Math.min(...leastByeRows.map((row) => Number(row.matchPoints || 0)));
  return randomChoice(
    leastByeRows.filter((row) => Number(row.matchPoints || 0) === lowestScore),
    random
  );
}

function repeatPenalty(rowA, rowB, pairHistory) {
  return pairHistory.has(playedPairKey(rowA.participant.id, rowB.participant.id)) ? 1 : 0;
}

function constrainedRow(remaining, pairHistory, random) {
  let fewestFreshOpponents = Infinity;
  let candidates = [];
  for (const row of remaining) {
    const freshOpponentCount = remaining.filter(
      (other) => other !== row && repeatPenalty(row, other, pairHistory) === 0
    ).length;
    if (freshOpponentCount < fewestFreshOpponents) {
      fewestFreshOpponents = freshOpponentCount;
      candidates = [row];
    } else if (freshOpponentCount === fewestFreshOpponents) {
      candidates.push(row);
    }
  }
  return randomChoice(candidates, random);
}

function greedyPairing(rows, pairHistory, random) {
  const remaining = [...rows];
  const pairs = [];
  let repeats = 0;

  while (remaining.length) {
    const rowA = constrainedRow(remaining, pairHistory, random);
    remaining.splice(remaining.indexOf(rowA), 1);
    const opponents = shuffled(remaining, random);
    const lowestPenalty = Math.min(...opponents.map((rowB) => repeatPenalty(rowA, rowB, pairHistory)));
    const rowB = randomChoice(
      opponents.filter((opponent) => repeatPenalty(rowA, opponent, pairHistory) === lowestPenalty),
      random
    );
    remaining.splice(remaining.indexOf(rowB), 1);
    pairs.push([rowA, rowB]);
    repeats += lowestPenalty;
  }

  return { pairs, repeats };
}

function minimumRepeatPairing(rows, pairHistory, random) {
  if (!rows.length) return { pairs: [], repeats: 0 };

  const attempts = Math.min(256, Math.max(24, rows.length * 4));
  let best = null;
  let equallyGood = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = greedyPairing(rows, pairHistory, random);
    if (!best || candidate.repeats < best.repeats) {
      best = candidate;
      equallyGood = [candidate];
    } else if (candidate.repeats === best.repeats) {
      equallyGood.push(candidate);
    }
    if (best.repeats === 0 && equallyGood.length >= 8) break;
  }

  best = randomChoice(equallyGood, random);
  if (best.repeats === 0) return best;

  const searchLimit = rows.length <= 18 ? 200000 : 50000;
  let visited = 0;
  function search(remaining, pairs, repeats) {
    if (visited >= searchLimit || repeats >= best.repeats) return;
    visited += 1;
    if (!remaining.length) {
      best = { pairs: [...pairs], repeats };
      return;
    }

    const rowA = constrainedRow(remaining, pairHistory, random);
    const rest = remaining.filter((row) => row !== rowA);
    const opponents = shuffled(rest, random).sort(
      (left, right) => repeatPenalty(rowA, left, pairHistory) - repeatPenalty(rowA, right, pairHistory)
    );
    for (const rowB of opponents) {
      const nextRepeats = repeats + repeatPenalty(rowA, rowB, pairHistory);
      if (nextRepeats >= best.repeats) continue;
      search(
        rest.filter((row) => row !== rowB),
        [...pairs, [rowA, rowB]],
        nextRepeats
      );
      if (best.repeats === 0 || visited >= searchLimit) return;
    }
  }

  search(rows, [], 0);
  return best;
}

function scoreBrackets(rows) {
  const byScore = new Map();
  for (const row of rows) {
    const score = Number(row.matchPoints || 0);
    if (!byScore.has(score)) byScore.set(score, []);
    byScore.get(score).push(row);
  }
  return [...byScore.entries()]
    .sort(([left], [right]) => right - left)
    .map(([score, bracketRows]) => ({ score, rows: bracketRows }));
}

function pairScoreBrackets(rows, pairHistory, random) {
  const brackets = scoreBrackets(rows);
  const pairs = [];

  for (let index = 0; index < brackets.length; index += 1) {
    const currentRows = brackets[index].rows.splice(0);
    if (!currentRows.length) continue;

    if (currentRows.length % 2 === 0) {
      pairs.push(...minimumRepeatPairing(currentRows, pairHistory, random).pairs);
      continue;
    }

    const lowerBracket = brackets.slice(index + 1).find((bracket) => bracket.rows.length);
    if (!lowerBracket) {
      throw new ValidationError("Swiss score brackets could not produce complete pairings");
    }

    let fewestRepeats = Infinity;
    let bestOptions = [];
    for (const floater of shuffled(lowerBracket.rows, random)) {
      const option = {
        floater,
        pairing: minimumRepeatPairing([...currentRows, floater], pairHistory, random)
      };
      if (option.pairing.repeats < fewestRepeats) {
        fewestRepeats = option.pairing.repeats;
        bestOptions = [option];
      } else if (option.pairing.repeats === fewestRepeats) {
        bestOptions.push(option);
      }
      if (fewestRepeats === 0) break;
    }
    const selected = randomChoice(bestOptions, random);
    lowerBracket.rows.splice(lowerBracket.rows.indexOf(selected.floater), 1);
    pairs.push(...selected.pairing.pairs);
  }

  return pairs;
}

function buildSwissNextRound(tournament, participants, matches, roundNumber, random = Math.random) {
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
    const byeRow = chooseByeRow(rows, random);
    rows.splice(rows.indexOf(byeRow), 1);
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

  const pairs = pairScoreBrackets(rows, pairHistory, random);
  for (const [rowA, rowB] of pairs) {
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

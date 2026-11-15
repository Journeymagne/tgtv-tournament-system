const { matchWinnerParticipantId, participantScore } = require("./results");

function scoreFor(match, participant, participantsById) {
  if (match.isBye && match.winnerParticipantId === participant.id) {
    return { points: 3, win: 1, draw: 0, loss: 0, totalVp: 0, vpDiff: 0, opponentId: null };
  }
  if (match.status !== "completed" || !match.result) return null;
  if (![match.participantAId, match.participantBId].includes(participant.id)) return null;

  const opponentId = match.participantAId === participant.id ? match.participantBId : match.participantAId;
  const opponent = participantsById.get(opponentId);
  const ownScore = participantScore(match.result, participant);
  const oppScore = participantScore(match.result, opponent);
  const ownTotal = Number(ownScore.total || 0);
  const oppTotal = Number(oppScore.total || 0);

  const winnerParticipantId = matchWinnerParticipantId(match);
  if (winnerParticipantId === null) {
    return { points: 1, win: 0, draw: 1, loss: 0, totalVp: ownTotal, vpDiff: ownTotal - oppTotal, opponentId };
  }
  const winnerIsParticipant = winnerParticipantId === participant.id;
  return {
    points: winnerIsParticipant ? 3 : 0,
    win: winnerIsParticipant ? 1 : 0,
    draw: 0,
    loss: winnerIsParticipant ? 0 : 1,
    totalVp: ownTotal,
    vpDiff: ownTotal - oppTotal,
    opponentId
  };
}

function assignHeadToHeadWins(rows, matches) {
  const participantsById = new Map(rows.map((row) => [row.participant.id, row.participant]));
  const wins = new Map(rows.map((row) => [row.participant.id, 0]));
  for (const match of matches) {
    if (
      match.status !== "completed" ||
      match.isBye ||
      !participantsById.has(match.participantAId) ||
      !participantsById.has(match.participantBId)
    ) {
      continue;
    }
    const winnerParticipantId = matchWinnerParticipantId(match);
    if (wins.has(winnerParticipantId)) wins.set(winnerParticipantId, wins.get(winnerParticipantId) + 1);
  }
  for (const row of rows) {
    row.headToHeadWins = wins.get(row.participant.id) || 0;
  }
}

function rankValue(row, key) {
  if (key === "total_vp") return row.totalVp;
  if (key === "vp_diff") return row.vpDiff;
  if (key === "strength_of_schedule") return row.strengthOfSchedule;
  if (key === "buchholz") return row.buchholz;
  if (key === "head_to_head") return row.headToHeadWins;
  return null;
}

function fallbackStandingOrder(a, b) {
  return (a.participant.seed || 0) - (b.participant.seed || 0) || a.participant.id - b.participant.id;
}

function equalValueBuckets(rows, valueFor) {
  const buckets = [];
  for (const row of rows) {
    const value = valueFor(row);
    const bucket = buckets[buckets.length - 1];
    if (!bucket || bucket.value !== value) buckets.push({ value, rows: [row] });
    else bucket.rows.push(row);
  }
  return buckets.map((bucket) => bucket.rows);
}

function sortTiebreakerBucket(rows, matches, tiebreakerOrder, priorityIndex = 0) {
  if (rows.length <= 1) return rows;
  if (priorityIndex >= tiebreakerOrder.length) return [...rows].sort(fallbackStandingOrder);

  const key = tiebreakerOrder[priorityIndex];
  if (key === "head_to_head") assignHeadToHeadWins(rows, matches);
  const valueFor = (row) => rankValue(row, key);
  const sorted = [...rows].sort((a, b) => Number(valueFor(b) || 0) - Number(valueFor(a) || 0));
  return equalValueBuckets(sorted, valueFor).flatMap((bucket) =>
    sortTiebreakerBucket(bucket, matches, tiebreakerOrder, priorityIndex + 1)
  );
}

function trimmedBuchholz(opponentMatchPoints) {
  if (opponentMatchPoints.length <= 2) return 0;
  return [...opponentMatchPoints]
    .sort((a, b) => a - b)
    .slice(1, -1)
    .reduce((sum, value) => sum + value, 0);
}

function buildStandings(participants, matches, tiebreakerOrder = []) {
  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
  // Withdrawn players still contribute earned points to their opponents' SoS.
  const allRows = participants.map((participant) => {
    const row = {
      participant,
      wins: 0,
      draws: 0,
      losses: 0,
      matchPoints: 0,
      byes: 0,
      totalVp: 0,
      vpDiff: 0,
      headToHeadWins: 0,
      opponents: []
    };
    for (const match of matches) {
      const score = scoreFor(match, participant, participantsById);
      if (!score) continue;
      row.wins += score.win;
      row.draws += score.draw;
      row.losses += score.loss;
      row.matchPoints += score.points;
      row.totalVp += score.totalVp;
      row.vpDiff += score.vpDiff;
      if (match.isBye) row.byes += 1;
      if (score.opponentId) row.opponents.push(score.opponentId);
    }
    return row;
  });

  const byParticipantId = new Map(allRows.map((row) => [row.participant.id, row]));
  const rows = allRows.filter(row => !["withdrawn", "removed"].includes(row.participant.status));
  for (const row of rows) {
    const opponentMatchPoints = row.opponents.map((opponentId) =>
      Number(byParticipantId.get(opponentId)?.matchPoints || 0)
    );
    row.strengthOfSchedule = opponentMatchPoints.reduce((sum, value) => sum + value, 0);
    row.buchholz = trimmedBuchholz(opponentMatchPoints);
  }

  const pointSorted = [...rows].sort((a, b) => b.matchPoints - a.matchPoints);
  const sortedRows = equalValueBuckets(pointSorted, (row) => row.matchPoints).flatMap((bucket) =>
    sortTiebreakerBucket(bucket, matches, tiebreakerOrder)
  );

  let lastRank = 0;
  let lastKey = null;
  return sortedRows.map((row, index) => {
    const key = JSON.stringify([
      row.matchPoints,
      ...tiebreakerOrder.map((item) => rankValue(row, item))
    ]);
    if (key !== lastKey) lastRank = index + 1;
    lastKey = key;
    return { rank: lastRank, ...row };
  });
}

module.exports = { buildStandings };

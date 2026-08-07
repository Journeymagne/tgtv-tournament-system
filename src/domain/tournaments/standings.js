function scoreFor(match, participant, participantsById) {
  if (match.isBye && match.winnerParticipantId === participant.id) {
    return { points: 3, win: 1, draw: 0, loss: 0, totalVp: 0, vpDiff: 0, opponentId: null };
  }
  if (match.status !== "completed" || !match.result) return null;
  if (![match.participantAId, match.participantBId].includes(participant.id)) return null;

  const opponentId = match.participantAId === participant.id ? match.participantBId : match.participantAId;
  const opponent = participantsById.get(opponentId);
  const ownScore =
    match.result.scores?.[participant.userId] ||
    match.result.scores?.[-participant.id] ||
    match.result.scores?.[participant.id] ||
    {};
  const oppScore =
    match.result.scores?.[opponent?.userId] ||
    match.result.scores?.[-opponentId] ||
    match.result.scores?.[opponentId] ||
    {};
  const ownTotal = Number(ownScore.total || 0);
  const oppTotal = Number(oppScore.total || 0);

  if (!match.result.winnerId) {
    return { points: 1, win: 0, draw: 1, loss: 0, totalVp: ownTotal, vpDiff: ownTotal - oppTotal, opponentId };
  }
  const winnerIsParticipant =
    match.winnerParticipantId === participant.id || Number(match.result.winnerId) === Number(participant.userId);
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

function headToHead(a, b, matches) {
  const match = matches.find(
    (item) =>
      item.status === "completed" &&
      !item.isBye &&
      ((item.participantAId === a.participant.id && item.participantBId === b.participant.id) ||
        (item.participantAId === b.participant.id && item.participantBId === a.participant.id))
  );
  if (!match || !match.winnerParticipantId) return 0;
  if (match.winnerParticipantId === a.participant.id) return -1;
  if (match.winnerParticipantId === b.participant.id) return 1;
  return 0;
}

function rankValue(row, key) {
  if (key === "total_vp") return row.totalVp;
  if (key === "vp_diff") return row.vpDiff;
  if (key === "strength_of_schedule") return row.strengthOfSchedule;
  if (key === "buchholz") return row.buchholz;
  return null;
}

function trimmedBuchholz(opponentMatchPoints) {
  if (opponentMatchPoints.length <= 2) return 0;
  return [...opponentMatchPoints]
    .sort((a, b) => a - b)
    .slice(1, -1)
    .reduce((sum, value) => sum + value, 0);
}

function buildStandings(participants, matches, tiebreakerOrder = []) {
  const active = participants.filter((participant) => !["withdrawn", "removed"].includes(participant.status));
  const participantsById = new Map(active.map((participant) => [participant.id, participant]));
  const rows = active.map((participant) => {
    const row = {
      participant,
      wins: 0,
      draws: 0,
      losses: 0,
      matchPoints: 0,
      byes: 0,
      totalVp: 0,
      vpDiff: 0,
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

  const byParticipantId = new Map(rows.map((row) => [row.participant.id, row]));
  for (const row of rows) {
    const opponentMatchPoints = row.opponents.map((opponentId) =>
      Number(byParticipantId.get(opponentId)?.matchPoints || 0)
    );
    row.strengthOfSchedule = opponentMatchPoints.reduce((sum, value) => sum + value, 0);
    row.buchholz = trimmedBuchholz(opponentMatchPoints);
  }

  rows.sort((a, b) => {
    const pointDiff = b.matchPoints - a.matchPoints;
    if (pointDiff) return pointDiff;
    for (const key of tiebreakerOrder) {
      if (key === "strength_of_schedule" && b.strengthOfSchedule !== a.strengthOfSchedule) {
        return b.strengthOfSchedule - a.strengthOfSchedule;
      }
      if (key === "buchholz" && b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      if (key === "total_vp" && b.totalVp !== a.totalVp) return b.totalVp - a.totalVp;
      if (key === "vp_diff" && b.vpDiff !== a.vpDiff) return b.vpDiff - a.vpDiff;
      if (key === "head_to_head") {
        const h2h = headToHead(a, b, matches);
        if (h2h) return h2h;
      }
    }
    return (a.participant.seed || 0) - (b.participant.seed || 0) || a.participant.id - b.participant.id;
  });

  let lastRank = 0;
  let lastKey = null;
  return rows.map((row, index) => {
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

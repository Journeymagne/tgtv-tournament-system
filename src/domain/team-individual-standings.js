const { gamePointsForTotals } = require('./team-tournaments');
const { participantResultKey } = require('./tournaments/results');

// This is a separate view of the recorded personal results. It never changes
// official team standings, publication, pairing or rating calculations.
function buildTeamIndividualStandings(rosters = [], matches = []) {
  const rows = new Map(), members = new Map(), rosterById = new Map(rosters.map(roster => [roster.id, roster]));
  const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  function rowFor(person, rosterId, memberId) {
    const name = String(person.name || person.displayNameSnapshot || 'Player');
    const userId = !person.isProxy && person.hasProfile !== false
      ? positiveId(person.userId === undefined ? person.id : person.userId) : null;
    const key = userId ? `user:${userId}` : JSON.stringify(['guest', rosterId,
      memberId ?? person.id, person.isProxy ? name : '']);
    if (!rows.has(key)) rows.set(key, { key, userId, name, isProxy: Boolean(person.isProxy),
      rosterIds: new Set(), rosterNames: new Set(), gamesPlayed: 0, byes: 0,
      wins: 0, draws: 0, losses: 0, matchPoints: 0, totalGp: 0, gpDiff: 0 });
    const row = rows.get(key), roster = rosterById.get(rosterId);
    if (rosterId != null) row.rosterIds.add(rosterId);
    if (roster) row.rosterNames.add(roster.name || roster.teamNameSnapshot || roster.team?.name || '');
    return row;
  }
  for (const roster of rosters) {
    for (const member of roster.members || []) {
      members.set(member.id, member);
      if (member.userId || member.isProxy || member.displayNameSnapshot) rowFor(member, roster.id, member.id);
    }
  }
  const countedGames = new Set(), countedByes = new Set();
  for (const match of matches) {
    if (match.phase === 'completed' && match.resolution === 'bye' && !countedByes.has(match.id ?? match)) {
      countedByes.add(match.id ?? match);
      const roster = rosterById.get(match.rosterAId);
      const time = Date.parse(match.completedAt || match.createdAt);
      for (const member of roster?.members || []) {
        const joined = Date.parse(member.joinedAt), ended = Date.parse(member.endedAt);
        const present = Number.isFinite(time)
          ? (!Number.isFinite(joined) || joined <= time) && (!member.endedAt || (Number.isFinite(ended) && time < ended))
          : !member.endedAt;
        if (!present || (!member.userId && !member.isProxy && !member.displayNameSnapshot)) continue;
        const row = rowFor(member, roster.id, member.id);
        row.byes += 1; row.wins += 1; row.matchPoints += 3; row.totalGp += 20; row.gpDiff += 20;
      }
    }
    for (const link of match.games || []) {
      const game = link.game;
      if (!game || game.status !== 'completed' || !game.result || countedGames.has(game.id ?? game)) continue;
      const memberIds = [link.rosterAMemberId, link.rosterBMemberId];
      const recorded = game.players?.length ? game.players : memberIds.map((id, index) => {
        const member = members.get(id);
        return member ? { ...member, id: participantResultKey(member), name: member.displayNameSnapshot }
          : { id: (game.resultPlayerIds || game.playerIds || [])[index], userId: null, hasProfile: false, name: 'Player' };
      });
      if (recorded.length !== 2 || recorded.some(player => !Number.isSafeInteger(Number(player.id)) || Number(player.id) === 0)) continue;
      const [a, b] = recorded;
      if (Number(a.id) === Number(b.id)) continue;
      const winner = game.result.winnerId == null ? null : Number(game.result.winnerId);
      if (winner !== null && winner !== Number(a.id) && winner !== Number(b.id)) continue;
      const scores = game.result.scores || {};
      if (scores[a.id]?.total == null || scores[b.id]?.total == null) continue;
      const vpA = Number(scores[a.id].total), vpB = Number(scores[b.id].total);
      if (!Number.isFinite(vpA) || !Number.isFinite(vpB)) continue;
      const gp = gamePointsForTotals(vpA, vpB);
      countedGames.add(game.id ?? game);
      for (const [player, rosterId, memberId, own, other] of [
        [a, match.rosterAId, memberIds[0], gp.a, gp.b], [b, match.rosterBId, memberIds[1], gp.b, gp.a]
      ]) {
        const row = rowFor(player, rosterId, memberId);
        row.gamesPlayed += 1; row.totalGp += own; row.gpDiff += own - other;
        if (winner === null) { row.draws += 1; row.matchPoints += 1; }
        else if (winner === Number(player.id)) { row.wins += 1; row.matchPoints += 3; }
        else row.losses += 1;
      }
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.matchPoints - a.matchPoints || b.totalGp - a.totalGp ||
    b.gpDiff - a.gpDiff || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  let rank = 0, previous = null;
  return sorted.map((row, index) => {
    const score = JSON.stringify([row.matchPoints, row.totalGp, row.gpDiff]);
    if (score !== previous) rank = index + 1;
    previous = score;
    return { ...row, rank, rosterIds: [...row.rosterIds].sort((a, b) => a - b),
      rosterNames: [...row.rosterNames].filter(Boolean).sort((a, b) => a.localeCompare(b)) };
  });
}

module.exports = { buildTeamIndividualStandings };

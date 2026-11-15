const { compareValues } = require('./statistics-sorting');

function sortHistory(games, query = new URLSearchParams(), ownerId) {
  const key = query.get('historySort'), direction = query.get('historyDirection');
  if (!['date', 'player', 'opponent', 'faction', 'score', 'opponentScore', 'vpDiff', 'elo', 'tournament', 'round', 'status'].includes(key) ||
    (direction && direction !== 'asc' && direction !== 'desc')) return [...games];
  const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const value = game => {
    const players = game.players || [];
    const own = ownerId ? players.find(player => !player.isProxy && Number(player.userId === undefined ? player.id : player.userId) === Number(ownerId)) : players[0];
    const opponent = players.find(player => player !== own);
    const score = game.result?.scores?.[own?.id] || {};
    const total = number(score.total), otherTotal = number(game.result?.scores?.[opponent?.id]?.total);
    const values = { date: game.submittedAt || game.createdAt, player: own?.name, opponent: opponent?.name,
      faction: score.faction || score.killTeam || score.team || own?.faction,
      score: total, opponentScore: otherTotal, vpDiff: total === null || otherTotal === null ? null : total - otherTotal,
      elo: number(game.elo?.[own?.id]?.delta), tournament: game.tournament?.name,
      round: number(game.tournamentMatch?.roundNumber ?? game.teamMatch?.roundNumber ?? game.roundNumber), status: game.status };
    return values[key];
  };
  const order = direction || (['player', 'opponent', 'faction', 'tournament', 'status'].includes(key) ? 'asc' : 'desc');
  return [...games].sort((a, b) => compareValues(value(a), value(b), order) ||
    compareValues(a.submittedAt || a.createdAt, b.submittedAt || b.createdAt, 'desc') || Number(b.id) - Number(a.id));
}
module.exports = { sortHistory };

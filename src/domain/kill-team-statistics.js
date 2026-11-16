const { canonicalKillTeam, teamKey } = require("./kill-teams");
const { tacOpOptions, gameInSeason, wilsonScore } = require("../../public/game-data");
const { compareValues } = require("./statistics-sorting");
const TOURNAMENT_SOURCES = new Set(["tournament_match", "team_match_game"]);

// Keep the same boundary and legacy timestamp behaviour as filterGamesBySeason
// on the public statistics screen.
function inSeason(game, season) {
  return gameInSeason(game, season);
}
function eligibleGames(games, season, publishedTournamentIds) {
  return games.filter(game => game.status === "completed" && game.result &&
    (!TOURNAMENT_SOURCES.has(game.sourceType) || publishedTournamentIds.has(game.tournament?.id)) &&
    inSeason(game, season));
}
function scoreTeam(score) {
  const raw = score.faction || score.killTeam || score.team;
  return canonicalKillTeam(raw) || String(raw || "").trim();
}
function winRate(row) { return row.games ? Math.round(row.wins / row.games * 100) : null; }
function statRowSort(a, b) {
  return b.wilsonScore - a.wilsonScore || b.wins - a.wins || b.games - a.games ||
    a.name.localeCompare(b.name);
}
function realUserId(player, game) {
  const raw = player.userId === undefined && game.sourceType === "challenge" ? player.id : player.userId;
  const id = Number(raw);
  return !player.isProxy && player.hasProfile !== false && Number.isSafeInteger(id) && id > 0 ? id : null;
}
function playerKey(player, game) {
  const userId = realUserId(player, game);
  if (userId) return "user:" + userId;
  // Guest/proxy result keys are local identities. Never merge equal numeric
  // keys from different tournaments, or distinct replacements at one seat.
  return JSON.stringify(["guest", game.sourceType, game.tournament?.id ?? "game:" + game.id,
    player.id, player.name || "Player"]);
}
function aggregateTeam(team, games, season) {
  const totals = { games: 0, wins: 0, losses: 0, draws: 0, matchGames: 0, mirrorGames: 0 };
  const players = new Map(), tacOps = new Map();
  for (const game of games) {
    if ((game.players || []).length < 2) continue;
    const entries = game.players.slice(0, 2).map(player => {
      const score = game.result.scores?.[player.id] || {};
      return { player, score, team: scoreTeam(score) || scoreTeam(player) };
    });
    if (entries.some(entry => !entry.team)) continue;
    const target = entries.filter(entry => entry.team === team);
    if (!target.length) continue;
    totals.matchGames += 1;
    if (target.length === 2) { totals.mirrorGames += 1; continue; }
    const winner = game.result.winnerId ? Number(game.result.winnerId) : null;
    for (const { player, score } of target) {
      const outcome = !winner ? "draws" : winner === Number(player.id) ? "wins" : "losses";
      totals.games += 1; totals[outcome] += 1;
      const key = playerKey(player, game);
      if (!players.has(key)) players.set(key, {
        userId: realUserId(player, game), name: player.name || "Player", games: 0, wins: 0
      });
      const row = players.get(key);
      row.games += 1;
      if (outcome === "wins") row.wins += 1;
      const rawTacOp = String(score.tacOp || "").trim();
      if (!rawTacOp) continue;
      const name = tacOpOptions.find(option => teamKey(option) === teamKey(rawTacOp)) || rawTacOp;
      if (!tacOps.has(name)) tacOps.set(name, { name, games: 0, wins: 0, points: 0 });
      const tac = tacOps.get(name), points = Number(score.tac);
      tac.games += 1;
      if (outcome === "wins") tac.wins += 1;
      tac.points += Number.isFinite(points) ? points : 0;
    }
  }
  const topPlayers = [...players.values()].map(row => ({ ...row, winRate: winRate(row), wilsonScore: wilsonScore(row.wins, row.games) }))
    .sort(statRowSort).map((row, index) => ({ ...row, rank: index + 1 }));
  const topTacOps = [...tacOps.values()].map(({ points, ...row }) => ({
    ...row, winRate: winRate(row), avgPoints: Math.round(points / row.games * 10) / 10
  })).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games ||
    b.avgPoints - a.avgPoints || a.name.localeCompare(b.name)).map((row, index) => ({ ...row, rank: index + 1 }));
  return { team, season: { id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt },
    ...totals, winRate: winRate(totals), topTacOps, topPlayers };
}

function orderSummary(summary, options = {}) {
  const select = (rows, prefix, keys, limit) => {
    const requested = options[prefix + 'Sort'], direction = options[prefix + 'Direction'];
    const valid = keys.includes(requested) && (!direction || direction === 'asc' || direction === 'desc');
    const key = valid ? requested : 'rank';
    const order = valid ? direction || (['rank', 'name'].includes(key) ? 'asc' : 'desc') : 'asc';
    return [...rows].sort((a, b) => compareValues(a[key], b[key], order) || a.rank - b.rank).slice(0, limit);
  };
  return { ...summary,
    topPlayers: select(summary.topPlayers, 'player', ['rank', 'name', 'games', 'wins', 'winRate', 'wilsonScore'], 5),
    topTacOps: select(summary.topTacOps, 'tacOp', ['rank', 'name', 'games', 'wins', 'winRate', 'avgPoints'], 3)
  };
}
function summarizeTeam(team, games, season, options) {
  return orderSummary(aggregateTeam(team, games, season), options);
}
module.exports = { TOURNAMENT_SOURCES, inSeason, eligibleGames, aggregateTeam, orderSummary, summarizeTeam, realUserId, scoreTeam };

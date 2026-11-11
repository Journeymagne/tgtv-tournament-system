const { canonicalKillTeam, teamKey } = require("./kill-teams");
const { tacOpOptions } = require("../../public/game-data");
const TOURNAMENT_SOURCES = new Set(["tournament_match", "team_match_game"]);

// Keep the same boundary and legacy timestamp behaviour as filterGamesBySeason
// on the public statistics screen.
function inSeason(game, season) {
  if (!season) return true;
  if (TOURNAMENT_SOURCES.has(game.sourceType) && game.tournament?.seasonId) {
    return game.tournament.seasonId === season.id;
  }
  const timestamp = game.submittedAt || game.result?.confirmedAt || game.createdAt || "";
  if (!timestamp) return true;
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return true;
  return (!season.startsAt || time >= Date.parse(season.startsAt)) &&
    (!season.endsAt || time < Date.parse(season.endsAt));
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
  return b.winRate - a.winRate || b.wins - a.wins || b.games - a.games ||
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
function summarizeTeam(team, games, season) {
  const totals = { games: 0, wins: 0, losses: 0, draws: 0, matchGames: 0, mirrorGames: 0 };
  const players = new Map(), tacOps = new Map();
  for (const game of games) {
    if ((game.players || []).length < 2) continue;
    const entries = game.players.slice(0, 2).map(player => {
      const score = game.result.scores?.[player.id] || {};
      return { player, score, team: scoreTeam(score) };
    });
    if (entries.some(entry => !entry.team)) continue;
    const target = entries.filter(entry => entry.team === team);
    if (!target.length) continue;
    totals.matchGames += 1;
    if (target.length === 2) totals.mirrorGames += 1;
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
  const topPlayers = [...players.values()].map(row => ({ ...row, winRate: winRate(row) }))
    .sort(statRowSort).slice(0, 3);
  const topTacOps = [...tacOps.values()].map(({ points, ...row }) => ({
    ...row, winRate: winRate(row), avgPoints: Math.round(points / row.games * 10) / 10
  })).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games ||
    b.avgPoints - a.avgPoints || a.name.localeCompare(b.name)).slice(0, 3);
  return { team, season: { id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt },
    ...totals, winRate: winRate(totals), topTacOps, topPlayers };
}
module.exports = { TOURNAMENT_SOURCES, inSeason, eligibleGames, summarizeTeam };

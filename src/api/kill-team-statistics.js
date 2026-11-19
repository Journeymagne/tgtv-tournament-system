const { HttpError } = require("../http/io");
const { KILL_TEAMS, canonicalKillTeam } = require("../domain/kill-teams");
const { currentSeason, seasons } = require("../../public/game-data");
const { PUBLISHED_STATUSES } = require("../db/repositories/tournaments");
const gamesApi = require("./games");
const { TOURNAMENT_SOURCES, eligibleGames, aggregateTeam, orderSummary } = require("../domain/kill-team-statistics");

const availableSeasons = seasons.map(({ id, name }) => ({ id, name })).reverse();

async function publishedIds(client, games) {
  const ids = [...new Set(games.filter(game => TOURNAMENT_SOURCES.has(game.sourceType))
    .map(game => game.tournament?.id).filter(Number.isSafeInteger))];
  if (!ids.length) return new Set();
  // Team tournament views omit status. Resolve visibility from current published
  // tournaments, rather than trusting a result or its saved timestamp.
  const { rows } = await client.query(
    "SELECT id FROM tournaments WHERE id = ANY($1::int[]) AND status = ANY($2::text[])",
    [ids, PUBLISHED_STATUSES]
  );
  return new Set(rows.map(row => row.id));
}
function nextSeasonBoundary(now, season) {
  const boundaries = [season.endsAt, ...seasons.map(item => item.startsAt)]
    .filter(Boolean).map(Date.parse).filter(time => time > now);
  return Math.min(...boundaries);
}
function createHandler({ loadCompleted = gamesApi.listCompleted, loadPublishedIds = publishedIds,
  getSeason = currentSeason, clock = Date.now } = {}) {
  const snapshots = new Map();
  async function loadSummaries(client, season) {
    const result = await loadCompleted({ client });
    const visible = await loadPublishedIds(client, result.games);
    const games = eligibleGames(result.games, season, visible);
    const allTimeGames = eligibleGames(result.games, null, visible);
    return new Map(KILL_TEAMS.map(name => {
      const summary = aggregateTeam(name, games, season);
      summary.topPlayers = aggregateTeam(name, allTimeGames, season).topPlayers;
      return [name, summary];
    }));
  }
  return async function get({ client, query = new URLSearchParams() }) {
    const input = query.get("team");
    const team = typeof input === "string" && input.length <= 256 ? canonicalKillTeam(input) : null;
    if (!team) throw new HttpError(400, "Choose a valid Kill Team from the list");
    const ordering = Object.fromEntries(['playerSort', 'playerDirection', 'tacOpSort', 'tacOpDirection']
      .map(key => [key, query.get(key)]));
    const now = clock(), seasonId = query.get("seasonId");
    const season = seasonId === null ? getSeason(now) : seasons.find(item => item.id === seasonId);
    if (!season) throw new HttpError(400, "Choose a valid season from the list");

    let snapshot = snapshots.get(season.id);
    if (!snapshot || now >= snapshot.expiresAt) {
      // A snapshot is fresh for a minute after loading, up to the boundary seen at request start.
      snapshot = { expiresAt: nextSeasonBoundary(now, season) };
      snapshot.data = loadSummaries(client, season).then(summaries => {
        snapshot.expiresAt = Math.min(snapshot.expiresAt, clock() + 60_000);
        return summaries;
      });
      snapshots.set(season.id, snapshot);
    }
    let summaries;
    try { summaries = await snapshot.data; }
    catch (error) {
      if (snapshots.get(season.id) === snapshot) snapshots.delete(season.id);
      throw error;
    }
    const remaining = Math.max(0, Math.floor((snapshot.expiresAt - clock()) / 1000));
    return { body: { ...orderSummary(summaries.get(team), ordering), availableSeasons },
      headers: { "Cache-Control": "public, max-age=" + remaining } };
  };
}
module.exports = { get: createHandler(), createHandler };

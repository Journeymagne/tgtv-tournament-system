const { HttpError } = require("../http/io");
const { KILL_TEAMS, canonicalKillTeam } = require("../domain/kill-teams");
const { currentSeason, seasons } = require("../../public/game-data");
const { PUBLISHED_STATUSES } = require("../db/repositories/tournaments");
const gamesApi = require("./games");
const { TOURNAMENT_SOURCES, eligibleGames, summarizeTeam } = require("../domain/kill-team-statistics");

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
function cacheExpiry(now, season) {
  if (season.endsAt && Date.parse(season.endsAt) <= now) return now;
  const boundaries = [season.endsAt, ...seasons.map(item => item.startsAt)]
    .filter(Boolean).map(Date.parse).filter(time => time > now);
  return Math.min(now + 60_000, ...boundaries);
}
function createHandler({ loadCompleted = gamesApi.listCompleted, loadPublishedIds = publishedIds,
  getSeason = currentSeason, clock = Date.now } = {}) {
  // Bounded to the canonical registry (48 aggregate results), never raw games or
  // account data. All teams share one load so opening many cards is inexpensive.
  let cache = null, pending = null;
  return async function get({ client, query = new URLSearchParams() }) {
    const input = query.get("team");
    const team = typeof input === "string" && input.length <= 256 ? canonicalKillTeam(input) : null;
    if (!team) throw new HttpError(400, "Choose a valid Kill Team from the list");
    const now = clock(), season = getSeason(now);
    if (!cache || cache.seasonId !== season.id || now >= cache.expiresAt) {
      if (!pending || pending.seasonId !== season.id) {
        const entry = { seasonId: season.id };
        entry.promise = (async () => {
          const result = await loadCompleted({ client });
          const visible = await loadPublishedIds(client, result.games);
          const games = eligibleGames(result.games, season, visible);
          const data = new Map(KILL_TEAMS.map(name => [name, summarizeTeam(name, games, season)]));
          return { seasonId: season.id, expiresAt: cacheExpiry(clock(), season), data };
        })();
        pending = entry;
      }
      const entry = pending;
      try {
        const loaded = await entry.promise;
        if (pending === entry) cache = loaded;
        // An older in-flight season must not overwrite the next season cache.
        const remaining = Math.max(0, Math.floor((loaded.expiresAt - clock()) / 1000));
        return { body: loaded.data.get(team), headers: { "Cache-Control": "public, max-age=" + remaining } };
      } finally {
        if (pending === entry) pending = null;
      }
    }
    const remaining = Math.max(0, Math.floor((cache.expiresAt - now) / 1000));
    return { body: cache.data.get(team), headers: { "Cache-Control": "public, max-age=" + remaining } };
  };
}
module.exports = { get: createHandler(), createHandler };

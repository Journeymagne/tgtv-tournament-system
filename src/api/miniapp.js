const { HttpError } = require("../http/io");
const { configuration } = require("../telegram/config");
const { hash, csrfToken } = require("../telegram/security");
const miniAuth = require("../telegram/miniapp-auth");
const auth = require("./auth");
const games = require("./games");
const tournaments = require("./tournaments");
const { publicUser } = require("./views");
const { DEFAULTS } = require("../telegram/messages");
const noStore = body => ({ body, headers: { "Cache-Control": "private, no-store", Vary: "Authorization, Cookie" } });

async function session(ctx) {
  miniAuth.checkOrigin(ctx.req);
  if (!ctx.body || typeof ctx.body !== "object" || Array.isArray(ctx.body)) throw new HttpError(400, "Invalid request body");
  const config = configuration();
  if (ctx.body.initData !== undefined) {
    if (!config.enabled || !config.token) throw new HttpError(503, "Вход через Telegram пока не настроен.");
    const person = miniAuth.validateInitData(ctx.body.initData, config.token);
    const linked = await miniAuth.linkedUser(ctx.client, person.id);
    if (!linked) return noStore({ authenticated: false, reason: "not_linked" });
    return noStore({ authenticated: true, user: publicUser(linked.user), accessToken: miniAuth.issueToken(linked.link, config.token), expiresIn: miniAuth.SESSION_SECONDS });
  }
  const user = await auth.loadUserFromRequest(ctx.client, ctx.req);
  return noStore({ authenticated: Boolean(user), reason: user ? null : "sign_in", user: publicUser(user), csrfToken: user ? csrfToken(ctx.req) : null });
}

async function summary(ctx) {
  const me = await auth.me(ctx);
  const { tournaments: available } = await tournaments.listPublic(ctx);
  const { rows } = await ctx.client.query(`SELECT tournament_id FROM tournament_participants WHERE user_id=$1 AND status NOT IN ('removed','withdrawn')
    UNION SELECT r.tournament_id FROM tournament_team_rosters r WHERE r.status <> 'withdrawn' AND
      (r.captain_user_id=$1 OR EXISTS (SELECT 1 FROM tournament_team_roster_members m WHERE m.roster_id=r.id AND m.user_id=$1 AND m.ended_at IS NULL))`, [ctx.user.id]);
  const active = await require("../telegram/data").activeGames(ctx.client, ctx.user.id);
  const byId = new Map(me.games.map(game => [game.id, game]));
  for (const game of active) byId.set(game.id, game);
  const profile = await require("./users").profile({ ...ctx, params: { id: String(ctx.user.id) } });
  const { rows: [link] } = await ctx.client.query("SELECT enabled,blocked,preferences FROM telegram_links WHERE user_id=$1", [ctx.user.id]);
  return noStore({ user: me.user, games: [...byId.values()], teamPairings: me.teamPairings,
    tournaments: available, myTournamentIds: rows.map(row => row.tournament_id),
    profile: { stats: profile.stats, recentGames: profile.recentGames, teams: profile.playerTeams },
    notifications: link || null, reference: require("../../public/game-data") });
}

function revision(game) { return hash(JSON.stringify({ status: game.status, result: game.result, pending: game.pendingResult })); }

async function gameDetail(ctx) {
  const { game } = await games.getOne(ctx);
  if (game.tournament?.id && !game.tournament.status) {
    const tournament = await require("../db/repositories/tournaments").findById(ctx.client, game.tournament.id);
    if (tournament) game.tournament = { ...game.tournament, status: tournament.status, format: tournament.format };
  }
  const participant = game.players.some(player => (player.userId ?? player.id) === ctx.user.id && !player.isProxy);
  const ownSubmission = game.pendingResult?.submittedBy === ctx.user.id;
  const permissions = game.resultPermissions || {
    canSubmit: participant && (game.status === "open" || (game.status === "pending_confirmation" && (game.sourceType === "tournament_match" || ownSubmission))),
    canReview: participant && game.status === "pending_confirmation" && !ownSubmission
  };
  if (game.tournament && game.tournament.status !== "in_progress") {
    permissions.canSubmit = false;
    permissions.canReview = false;
  }
  const confirmationRequired = game.sourceType === "tournament_match" ? false :
    !(game.sourceType === "team_match_game" && game.tournament?.venueMode === "irl" && !permissions.submitsAsCaptain);
  return { game: { ...game, resultPermissions: permissions, confirmationRequired, revision: revision(game) } };
}

async function changeResult(ctx) {
  const initial = await games.getOne(ctx);
  // Match the existing tournament -> game lock order. The revision prevents
  // approving a different score after the opponent edited the pending result.
  if (initial.game.tournament?.id) await ctx.client.query("SELECT id FROM tournaments WHERE id=$1 FOR UPDATE", [initial.game.tournament.id]);
  await games.lockGame(ctx.client, ctx.params.id);
  const { game } = await gameDetail(ctx);
  if (typeof ctx.body.revision !== "string" || ctx.body.revision !== game.revision) throw new HttpError(409, "Результат изменился. Обновите матч перед сохранением.");
  if (ctx.params.action === "result") await games.submitResult(ctx);
  else await games.respondToResult(ctx);
  return noStore(await gameDetail(ctx));
}

async function preferences(ctx) {
  if (typeof ctx.body.enabled !== "boolean" || !ctx.body.preferences || typeof ctx.body.preferences !== "object" || Array.isArray(ctx.body.preferences)) throw new HttpError(400, "Invalid notification settings");
  const { rows: [link] } = await ctx.client.query("SELECT id,preferences FROM telegram_links WHERE user_id=$1 FOR UPDATE", [ctx.user.id]);
  if (!link) throw new HttpError(409, "Сначала подключите Telegram в профиле сайта.");
  const next = { ...DEFAULTS, ...link.preferences };
  for (const [key, value] of Object.entries(ctx.body.preferences)) {
    if (!Object.hasOwn(DEFAULTS, key) || typeof value !== "boolean") throw new HttpError(400, "Invalid notification settings");
    next[key] = value;
  }
  await ctx.client.query("UPDATE telegram_links SET enabled=$2,preferences=$3 WHERE id=$1", [link.id, ctx.body.enabled, JSON.stringify(next)]);
  return noStore({ ok: true });
}

function route(method, path, handler, write = false) {
  return { method, path: "/api/miniapp" + path, tx: write, maxBodyBytes: 24576,
    handler: async ctx => handler(await miniAuth.authenticate(ctx, write)) };
}

module.exports = { routes: [
  { method: "POST", path: "/api/miniapp/session", handler: session, rateLimit: "auth", maxBodyBytes: 24576 },
  route("GET", "/summary", summary),
  route("GET", "/tournaments/:slug", async ctx => noStore(await tournaments.getPublic(ctx))),
  route("GET", "/games/:id", async ctx => noStore(await gameDetail(ctx))),
  ...["result", "confirm-result", "reject-result"].map(action => route("POST", `/games/:id/${action}`, ctx => changeResult({ ...ctx, params: { ...ctx.params, action } }), true)),
  route("PATCH", "/preferences", preferences, true)
] };

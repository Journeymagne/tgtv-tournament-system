const inbox = require("../notifications/tournament-source");
const users = require("../db/repositories/users");
const games = require("../api/games");
const teamMatches = require("../db/repositories/team-matches");
const { teamGamePermissions } = require("../domain/team-game-permissions");
const { hash } = require("./security");
const { CATEGORY, DEFAULTS } = require("./messages");

async function linkFor(client, telegramId) {
  const { rows } = await client.query(`SELECT l.* FROM telegram_links l JOIN users u ON u.id=l.user_id
    WHERE l.telegram_id=$1 AND (u.suspended_until IS NULL OR u.suspended_until<=NOW())`, [telegramId]);
  return rows[0];
}
async function activeGames(client, userId) {
  const { rows } = await client.query(`SELECT DISTINCT g.id FROM games g
    LEFT JOIN tournament_team_match_games tmg ON tmg.game_id=g.id
    LEFT JOIN tournament_team_matches tm ON tm.id=tmg.team_match_id
    LEFT JOIN tournament_team_rosters ra ON ra.id=tm.roster_a_id
    LEFT JOIN tournament_team_rosters rb ON rb.id=tm.roster_b_id
    WHERE g.status IN ('open','pending_confirmation') AND
    ($1=ANY(g.player_ids) OR ra.captain_user_id=$1 OR rb.captain_user_id=$1)
    ORDER BY g.id DESC`, [userId]);
  const result = [];
  for (const row of rows) {
    try {
      const { game } = await games.getOne({ client, user: { id: userId }, params: { id: String(row.id) } });
      result.push(game);
    } catch (err) { if (![403,404].includes(err.status)) throw err; }
  }
  return result;
}
async function activeItems(client, userId) {
  const items = await inbox.listActive(client,userId);
  for (const match of await teamMatches.listActivePairingsForCaptain(client,userId)) {
    items.push({ id: `team_pairing:${match.id}`, type: "team_pairing", sourceId: match.id,
      tournament: match.tournament, title: `${match.rosterA.name} — ${match.rosterB.name}`,
      href: `#/team-matches/${match.id}` });
  }
  for (const game of await activeGames(client,userId)) {
    if (game.status !== "pending_confirmation") continue;
    const canReview = game.sourceType === "team_match_game"
      ? teamGamePermissions(game,game.teamMatch?.rosterA,game.teamMatch?.rosterB,{ id:userId }).canReview
      : game.playerIds.includes(userId) && game.pendingResult?.submittedBy !== userId;
    if (!canReview) continue;
    items.push({ id: `result_pending:${game.id}`, type: "result_pending", gameId: game.id,
      submittedAt: game.pendingResult?.submittedAt || game.submittedAt,
      title: game.players.map(player=>player.name).join(" — "), href: `#/games/game/${game.id}` });
  }
  return items;
}
function forEvent(item,event) {
  if (event.entity === "games") return item.gameId === event.entity_id;
  if (event.entity === "challenges") return item.type === "game_challenge" && item.sourceId === event.entity_id;
  if (event.entity === "player_team_invitations") return item.type === "team_invitation" && item.sourceId === event.entity_id;
  if (event.entity === "tournaments") return item.type === "tournament_started" && item.sourceId === event.entity_id;
  return event.entity === "tournament_team_matches" && ["team_pairing","team_tournament_pairing"].includes(item.type) && item.sourceId === event.entity_id;
}
// Do not let unrelated avatar/name changes resend a pairing. Include the
// destination, opponents, assignment and submission identity in the fingerprint.
function fingerprint(item) {
  return hash(JSON.stringify({ id:item.id, href:item.href, opponent:item.opponent?.id || item.opponent?.name,
    table:item.table, mission:item.mission, title:item.title, submittedAt:item.submittedAt }));
}
async function queueReply(client,chatId,payload,key,linkId=null) {
  await client.query(`INSERT INTO telegram_outbox(chat_id,payload,dedup_key,link_id) VALUES($1,$2,$3,$4)
    ON CONFLICT(dedup_key) DO NOTHING`,[chatId,JSON.stringify(payload),key,linkId]);
}
async function expandEvents(client) {
  const { rows: events } = await client.query("SELECT * FROM telegram_events WHERE processed_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 25");
  if (!events.length) return;
  const { rows: links } = await client.query(`SELECT l.* FROM telegram_links l JOIN users u ON u.id=l.user_id
    WHERE l.enabled AND NOT l.blocked AND (u.suspended_until IS NULL OR u.suspended_until<=NOW())`);
  for (const link of links) {
    const eligible = events.filter(event=>event.created_at >= link.linked_at);
    if (!eligible.length) continue;
    for (const item of await activeItems(client,link.user_id)) {
      if (!link.preferences[CATEGORY[item.type]] || !eligible.some(event=>forEvent(item,event))) continue;
      await client.query(`INSERT INTO telegram_outbox(link_id,chat_id,notification,dedup_key) VALUES($1,$2,$3,$4)
        ON CONFLICT(dedup_key) DO NOTHING`,[link.id,link.chat_id,JSON.stringify(item),`n:${link.id}:${item.id}:${fingerprint(item)}`]);
    }
  }
  await client.query("UPDATE telegram_events SET processed_at=NOW() WHERE id=ANY($1::bigint[])",[events.map(event=>event.id)]);
}
module.exports = { linkFor, activeGames, activeItems, forEvent, fingerprint, queueReply, expandEvents, users, DEFAULTS };

const inbox = require("../notifications/tournament-source");
const users = require("../db/repositories/users");
const games = require("../api/games");
const teamMatches = require("../db/repositories/team-matches");
const { teamGamePermissions } = require("../domain/team-game-permissions");
const { hash } = require("./security");
const { CATEGORY, DEFAULTS } = require("./messages");
const access = require('./access');

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
// Caller owns the business transaction. A later generation wins even if an old
// callback was received out of order; delivery never repeats its business action.
async function queueScreen(client,{link,chatId,targetMessageId,payload,generation,dedupKey,gameId=null,accessScope={gameIds:[],pairingIds:[]}}) {
  if (!link?.id || String(link.chat_id)!==String(chatId) || !Number.isSafeInteger(generation) || generation<0 ||
      !payload || typeof payload.text!=='string' || payload.text.length>4096 ||
      (targetMessageId!=null && (!Number.isSafeInteger(Number(targetMessageId)) || Number(targetMessageId)<=0))) throw Error('Invalid Telegram screen');
  for(const [key,max] of [['gameIds',6],['pairingIds',3]]) {
    const ids=accessScope?.[key];
    if(!Array.isArray(ids) || ids.length>max || new Set(ids).size!==ids.length ||
      ids.some(id=>!Number.isSafeInteger(id) || id<=0 || id>2147483647)) throw Error('Invalid Telegram screen access');
  }
  for (const row of payload.reply_markup?.inline_keyboard || []) for (const button of row) {
    if (button.callback_data && Buffer.byteLength(button.callback_data)>64) throw Error('Invalid Telegram callback');
  }
  const {rows:[screen]}=await client.query(`INSERT INTO telegram_chat_screens(link_id,chat_id,generation,target_message_id)
    VALUES($1,$2,$3,$4) ON CONFLICT(link_id) DO UPDATE SET generation=EXCLUDED.generation,
      target_message_id=COALESCE(telegram_chat_screens.target_message_id,EXCLUDED.target_message_id),updated_at=clock_timestamp()
    WHERE telegram_chat_screens.generation<EXCLUDED.generation RETURNING *`,[link.id,chatId,generation,targetMessageId || null]);
  if(!screen) return;
  await client.query(`UPDATE telegram_outbox SET state='cancelled',payload=NULL,locked_until=NULL
    WHERE link_id=$1 AND screen_generation<$2 AND state='pending'`,[link.id,generation]);
  await client.query(`INSERT INTO telegram_outbox(link_id,chat_id,payload,dedup_key,delivery_method,screen_generation,target_message_id,game_id,access_scope)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(dedup_key) DO NOTHING`,
  [link.id,chatId,JSON.stringify(payload),dedupKey,screen.target_message_id?'editMessageText':'sendMessage',generation,screen.target_message_id,gameId,JSON.stringify(accessScope)]);
}
async function expandEvents(client) {
  // Persist a bounded fan-out cursor instead of holding one transaction across
  // every linked account. This lane has its own loop and cannot delay commands.
  await client.query('SELECT pg_advisory_xact_lock(91827060)');
  const {rows:[cursor]}=await client.query("SELECT value FROM telegram_state WHERE key='event-expansion'");
  const position=cursor?JSON.parse(cursor.value):null;
  const { rows: events } = position?
    await client.query('SELECT * FROM telegram_events WHERE id=ANY($1::bigint[]) AND processed_at IS NULL ORDER BY id FOR UPDATE',[position.eventIds]):
    await client.query("SELECT * FROM telegram_events WHERE processed_at IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 25");
  if (!events.length) { if(cursor) await client.query("DELETE FROM telegram_state WHERE key='event-expansion'"); return; }
  const { rows: links } = await client.query(`SELECT l.* FROM telegram_links l JOIN users u ON u.id=l.user_id
    WHERE l.id>$1 AND l.enabled AND NOT l.blocked AND (u.suspended_until IS NULL OR u.suspended_until<=NOW())
    ORDER BY l.id LIMIT 11`,[position?.afterLinkId || 0]);
  for (const link of links.slice(0,10)) {
    if (!await access.allowed(client, link.user_id)) continue;
    const eligible = events.filter(event=>event.created_at >= link.linked_at);
    if (!eligible.length) continue;
    for (const item of await activeItems(client,link.user_id)) {
      if (!link.preferences[CATEGORY[item.type]] || !eligible.some(event=>forEvent(item,event))) continue;
      await client.query(`INSERT INTO telegram_outbox(link_id,chat_id,notification,dedup_key) VALUES($1,$2,$3,$4)
        ON CONFLICT(dedup_key) DO NOTHING`,[link.id,link.chat_id,JSON.stringify(item),`n:${link.id}:${item.id}:${fingerprint(item)}`]);
    }
  }
  if(links.length>10) await client.query(`INSERT INTO telegram_state(key,value) VALUES('event-expansion',$1)
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[JSON.stringify({eventIds:events.map(event=>event.id),afterLinkId:links[9].id})]);
  else {
    await client.query("UPDATE telegram_events SET processed_at=NOW() WHERE id=ANY($1::bigint[])",[events.map(event=>event.id)]);
    await client.query("DELETE FROM telegram_state WHERE key='event-expansion'");
  }
}
module.exports = { linkFor, activeGames, activeItems, forEvent, fingerprint, queueReply, queueScreen, expandEvents, users, DEFAULTS };

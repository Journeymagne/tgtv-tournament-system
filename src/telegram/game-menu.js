const data = require('./data');
const messages = require('./game-messages');
const pages = require('./game-menu-data');
const drafts = require('./game-drafts');
const results = require('../api/game-results');

const integer = (value,min=0,max=2147483647) => /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value)>=min && Number(value)<=max;
function handles(action) { return typeof action==='string' && (action==='games' || action.startsWith('g:')); }
function parse(action) {
  if(action==='games') return {type:'list',filter:'active',direction:'next'};
  if(typeof action!=='string' || Buffer.byteLength(action)>64) return null;
  let match;
  if((match=/^g:l:(active|all):(next|previous):(\d+)$/.exec(action)) && integer(match[3])) return {type:'list',filter:match[1],direction:match[2],cursor:Number(match[3]) || undefined};
  if((match=/^g:v:(\d+)$/.exec(action)) && integer(match[1],1)) return {type:'game',gameId:Number(match[1])};
  if((match=/^g:s:(\d+):(submit|confirm|reject)(?::u(\d+))?$/.exec(action)) && integer(match[1],1) && (match[3]===undefined || integer(match[3],0,Number.MAX_SAFE_INTEGER))) return {type:'start',gameId:Number(match[1]),mode:match[2],sourceGeneration:match[3]===undefined?undefined:Number(match[3])};
  if((match=/^g:d:([A-Za-z0-9_-]{16}):(\d+):(back|cancel|extras|submit)$/.exec(action)) && integer(match[2])) return {type:'draft',token:match[1],version:Number(match[2]),event:{type:match[3]}};
  if((match=/^g:d:([A-Za-z0-9_-]{16}):(\d+):(choose|edit):(\d+)$/.exec(action)) && integer(match[2]) && integer(match[4],0,10000)) return {type:'draft',token:match[1],version:Number(match[2]),event:{type:match[3],index:Number(match[4])}};
  if((match=/^g:p:([A-Za-z0-9_-]{16}):(\d+):(\d+)$/.exec(action)) && integer(match[2]) && integer(match[3],0,100)) return {type:'page',token:match[1],version:Number(match[2]),choicePage:Number(match[3])};
  return null;
}
function isResultMutation(action) {
  const parsed=parse(action);
  return Boolean(parsed && (parsed.type==='start' || (parsed.type==='draft' && parsed.event.type==='submit')));
}
function error(status,code) { return Object.assign(Error(code),{status,code}); }
async function handle({client,update,person,link,user,action}) {
  const locale=link.locale || (person.language_code?.startsWith('en')?'en':'ru');
  const messageId=update.callback_query?.message?.message_id;
  const queue=(payload,gameId=null,accessScope)=>data.queueScreen(client,{link,chatId:person.id,targetMessageId:messageId,payload,generation:update.update_id,dedupKey:`g:${update.update_id}`,gameId,accessScope});
  // Admission counts requests rather than outbox rows. A normal wizard, Back,
  // Extras and field editing fit comfortably; only one throttle response/window.
  const {rows:[admission]}=await client.query(`INSERT INTO telegram_chat_screens(link_id,chat_id,request_count) VALUES($1,$2,1)
    ON CONFLICT(link_id) DO UPDATE SET
      request_count=CASE WHEN telegram_chat_screens.request_window<clock_timestamp()-INTERVAL '1 minute' THEN 1 ELSE LEAST(91,telegram_chat_screens.request_count+1) END,
      request_window=CASE WHEN telegram_chat_screens.request_window<clock_timestamp()-INTERVAL '1 minute' THEN clock_timestamp() ELSE telegram_chat_screens.request_window END
    RETURNING *,request_count=91 AS limited`,[link.id,person.id]);
  if(Number(admission.generation)>=update.update_id) return;
  if(admission.limited) {
    // Stable key bounds error queueing even if the sender keeps tapping.
    return data.queueReply(client,person.id,messages.renderError(error(429,'GAME_RATE'),locale),`g:limit:${link.id}:${new Date(admission.request_window).getTime()}`,link.id);
  }
  try {
    // The global menu button can live in a welcome/settings/error message.
    // It explicitly reopens the current screen; step callbacks stay bound to it.
    if(action!=='games' && messageId && admission.target_message_id && String(messageId)!==String(admission.target_message_id)) {
      throw error(409,'GAME_DRAFT_STALE');
    }
    const parsed=parse(action);
    if(!parsed) throw error(400,'GAME_DRAFT_INPUT');
    // A card start has no draft token yet. Bind its issued buttons to the card
    // generation so a delayed double tap cannot replace a newer draft on the
    // same edited physical message. Bare starts remain accepted for callers.
    if(parsed.type==='start' && parsed.sourceGeneration!==undefined && parsed.sourceGeneration!==Number(admission.generation)) throw error(409,'GAME_DRAFT_STALE');
    if(parsed.type==='list') {
      const page=await pages.listGames(client,user.id,parsed);
      const {rows}=await client.query(`SELECT tm.id,t.name FROM tournament_team_matches tm
        JOIN tournaments t ON t.id=tm.tournament_id JOIN tournament_team_rosters ra ON ra.id=tm.roster_a_id
        JOIN tournament_team_rosters rb ON rb.id=tm.roster_b_id
        WHERE t.status='in_progress' AND tm.phase IN ('awaiting_roll','mission_ban','shield_selection','sword_selection','environment_selection')
          AND (ra.captain_user_id=$1 OR rb.captain_user_id=$1) ORDER BY tm.id DESC LIMIT 3`,[user.id]);
      return queue(messages.renderMenu({...page,pairings:rows},locale),null,{gameIds:page.games.map(game=>game.id),pairingIds:rows.map(pairing=>pairing.id)});
    }
    if(parsed.type==='game') {
      const {game}=await results.gameDetail({client,user,params:{id:String(parsed.gameId)}});
      // The website permits some public views; the bot's personal card remains
      // limited to a real participant or a currently permitted captain.
      const {rows}=await client.query(`SELECT 1 FROM games g WHERE g.id=$1 AND
        (EXISTS(SELECT 1 FROM game_participants p WHERE p.game_id=g.id AND p.user_id=$2 AND NOT p.is_proxy)
        OR EXISTS(SELECT 1 FROM tournament_team_match_games l JOIN tournament_team_matches m ON m.id=l.team_match_id
          JOIN tournament_team_rosters r ON r.id IN (m.roster_a_id,m.roster_b_id) WHERE l.game_id=g.id AND r.captain_user_id=$2))`,[game.id,user.id]);
      if(!rows.length) throw error(403,'GAME_DRAFT_PERMISSION');
      return queue(messages.renderGame({...game,callbackGeneration:update.update_id},locale),game.id);
    }
    const view=parsed.type==='start'?await drafts.startDraft(client,{user,link,gameId:parsed.gameId,mode:parsed.mode}):
      parsed.type==='draft'?await drafts.transitionDraft(client,{user,link,token:parsed.token,version:parsed.version,event:parsed.event}):
        await drafts.readDraft(client,{user,link,token:parsed.token});
    if(parsed.type==='page') {
      if(view.version!==parsed.version || view.screen!=='choice' || parsed.choicePage>=Math.ceil(view.choices.length/12)) throw error(409,'GAME_DRAFT_STALE');
      view.choicePage=parsed.choicePage;
    }
    return queue(messages.renderDraft(view,locale),view.game.id);
  } catch(err) {
    if(!Number.isInteger(err.status) || err.status<400 || err.status>=500) throw err;
    // A delayed tap must not cancel or overwrite the valid wizard screen.
    // Keep its generation and answers intact and send recoverable guidance.
    return data.queueReply(client,person.id,messages.renderError(err,locale),`g:error:${update.update_id}`,link.id);
  }
}
module.exports={handles,parse,isResultMutation,handle};

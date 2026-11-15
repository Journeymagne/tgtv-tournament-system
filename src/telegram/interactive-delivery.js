const { call } = require('./client');
const access = require('./access');
const { PUBLISHED_STATUSES } = require('../db/repositories/tournaments');

function failure(error,attempts) {
  if(error.code===400 && error.description==='Bad Request: message is not modified') return {kind:'sent'};
  if(error.code===400 && ['Bad Request: message to edit not found',"Bad Request: message can't be edited"].includes(error.description)) return {kind:'fallback'};
  if(error.retryable===false || error.code===403 || attempts>=8) return {kind:'failed'};
  return {kind:'pending',delay:error.code===429?Math.min(86400,Math.max(1,Number(error.retryAfter)||1)):Math.min(1800,2**attempts*5)};
}
// The session lock supplements the durable 45s claim: after a long process
// pause, a second worker still cannot send an older screen concurrently. Use
// one leased connection throughout; never hold a business transaction on HTTP.
async function withChatLock(client,job,fn) {
  const key=Number(BigInt(job.chat_id)%2147483647n);
  const {rows:[guard]}=await client.query('SELECT pg_try_advisory_lock(91827059,$1) AS locked',[key]);
  if(!guard.locked) {
    await client.query(`UPDATE telegram_outbox SET state='pending',locked_until=NULL,attempts=GREATEST(0,attempts-1),
      next_attempt_at=NOW()+INTERVAL '1 second' WHERE id=$1 AND state='processing' AND attempts=$2`,[job.id,job.attempts]);
    return;
  }
  try { return await fn(); }
  finally { await client.query('SELECT pg_advisory_unlock(91827059,$1)',[key]); }
}
async function allowedGames(client,gameIds,userId) {
  if(!gameIds.length) return true;
  const {rows}=await client.query(`SELECT DISTINCT g.id FROM games g
    LEFT JOIN tournament_matches sm ON g.source_type='tournament_match' AND sm.game_id=g.id
    LEFT JOIN tournament_team_match_games l ON g.source_type='team_match_game' AND l.game_id=g.id
    LEFT JOIN tournament_team_matches m ON m.id=l.team_match_id
    LEFT JOIN tournaments t ON t.id=COALESCE(sm.tournament_id,m.tournament_id)
    WHERE g.id=ANY($1::int[]) AND (g.source_type NOT IN ('tournament_match','team_match_game') OR t.status=ANY($3::text[])) AND
    (EXISTS(SELECT 1 FROM game_participants p WHERE p.game_id=g.id AND p.user_id=$2 AND NOT p.is_proxy)
    OR EXISTS(SELECT 1 FROM tournament_team_rosters r WHERE r.id IN (m.roster_a_id,m.roster_b_id) AND r.captain_user_id=$2))`,[gameIds,userId,PUBLISHED_STATUSES]);
  return rows.length===gameIds.length;
}
async function allowedScope(client,job,userId) {
  const scope=job.access_scope;
  for(const [key,max] of [['gameIds',6],['pairingIds',3]]) {
    if(!Array.isArray(scope?.[key]) || scope[key].length>max || scope[key].some(id=>!Number.isSafeInteger(id) || id<=0 || id>2147483647)) return false;
  }
  const gameIds=[...new Set([...scope.gameIds,...(job.game_id?[job.game_id]:[])])];
  if(!await allowedGames(client,gameIds,userId)) return false;
  const pairingIds=[...new Set(scope.pairingIds)];
  if(!pairingIds.length) return true;
  const {rows}=await client.query(`SELECT tm.id FROM tournament_team_matches tm
    JOIN tournaments t ON t.id=tm.tournament_id JOIN tournament_team_rosters ra ON ra.id=tm.roster_a_id
    JOIN tournament_team_rosters rb ON rb.id=tm.roster_b_id
    WHERE tm.id=ANY($1::int[]) AND t.status='in_progress'
      AND tm.phase IN ('awaiting_roll','mission_ban','shield_selection','sword_selection','environment_selection')
      AND (ra.captain_user_id=$2 OR rb.captain_user_id=$2)`,[pairingIds,userId]);
  return rows.length===pairingIds.length;
}
async function deliver(source,job,{send=call}={}) {
  const ownsConnection=typeof source.connect==='function' && typeof source.release!=='function';
  const client=ownsConnection?await source.connect():source;
  try {
    return await withChatLock(client,job,async()=>{
      const {rows:[current]}=await client.query('SELECT * FROM telegram_outbox WHERE id=$1',[job.id]);
      if(!current || !['pending','processing'].includes(current.state)) return;
      const cancel=()=>client.query("UPDATE telegram_outbox SET state='cancelled',payload=NULL,locked_until=NULL WHERE id=$1 AND state IN ('pending','processing')",[job.id]);
      const {rows:[screen]}=await client.query(`SELECT s.*,l.user_id FROM telegram_chat_screens s
        JOIN telegram_links l ON l.id=s.link_id JOIN users u ON u.id=l.user_id
        WHERE s.link_id=$1 AND s.chat_id=$2 AND l.chat_id=s.chat_id AND NOT l.blocked
          AND (u.suspended_until IS NULL OR u.suspended_until<=NOW())`,[current.link_id,current.chat_id]);
      if(!screen || String(screen.generation)!==String(current.screen_generation) || !await access.allowed(client,screen.user_id) || !await allowedScope(client,current,screen.user_id)) return cancel();
      // Direct callers may supply a pending job; the worker normally claims it.
      let attempts=current.attempts;
      if(current.state==='pending') {
        const {rows:[claimed]}=await client.query(`UPDATE telegram_outbox SET state='processing',attempts=attempts+1,locked_until=NOW()+INTERVAL '45 seconds'
          WHERE id=$1 AND state='pending' RETURNING attempts`,[job.id]);
        if(!claimed) return;
        attempts=claimed.attempts;
      }
      let target=screen.target_message_id || current.target_message_id;
      const safeSend=async(method,body)=> {
        // A new request can commit while an old HTTP call is in flight. Recheck
        // immediately before every call, including a deleted-message fallback.
        const {rows:[latest]}=await client.query(`SELECT s.generation,l.chat_id,l.user_id,l.blocked,u.suspended_until FROM telegram_chat_screens s
          JOIN telegram_links l ON l.id=s.link_id JOIN users u ON u.id=l.user_id WHERE s.link_id=$1`,[current.link_id]);
        if(!latest || String(latest.generation)!==String(current.screen_generation) || String(latest.chat_id)!==String(current.chat_id) ||
            latest.user_id!==screen.user_id || latest.blocked ||
            (latest.suspended_until && new Date(latest.suspended_until).getTime()>Date.now()) || !await access.allowed(client,screen.user_id) ||
            !await allowedScope(client,current,screen.user_id)) throw Object.assign(Error('obsolete_screen'),{obsolete:true});
        return send(method,body);
      };
      try {
        let result;
        if(target) {
          try { result=await safeSend('editMessageText',{chat_id:current.chat_id,message_id:Number(target),...current.payload}); }
          catch(error) {
            const disposition=failure(error,attempts);
            if(disposition.kind==='sent') result={message_id:Number(target)};
            else if(disposition.kind==='fallback') {
              // Persist the removed target before trying a send. If send fails,
              // the retry no longer wastes another edit on a deleted message.
              await client.query('UPDATE telegram_chat_screens SET target_message_id=NULL WHERE link_id=$1 AND target_message_id=$2',[current.link_id,target]);
              await client.query("UPDATE telegram_outbox SET target_message_id=NULL,delivery_method='sendMessage' WHERE id=$1",[job.id]);
              target=null; result=await safeSend('sendMessage',{chat_id:current.chat_id,...current.payload});
            } else throw error;
          }
        } else result=await safeSend('sendMessage',{chat_id:current.chat_id,...current.payload});
        // Remember the physical message even if a newer generation committed
        // during HTTP. Its queued job will edit this target after this lock.
        await client.query(`UPDATE telegram_chat_screens SET target_message_id=$2,updated_at=clock_timestamp() WHERE link_id=$1`,[current.link_id,result.message_id]);
        await client.query(`UPDATE telegram_outbox SET state='sent',sent_at=NOW(),message_id=$2,payload=NULL,locked_until=NULL,last_error=NULL
          WHERE id=$1 AND attempts=$3`,[job.id,result.message_id,attempts]);
      } catch(error) {
        if(error.obsolete) return cancel();
        const disposition=failure(error,attempts);
        if(error.code===403) await client.query('UPDATE telegram_links SET blocked=TRUE WHERE id=$1',[current.link_id]);
        if(error.code===429) await pauseDelivery(client,disposition.delay || error.retryAfter || 1);
        const code=/^telegram_(http_\d{3}|network_error)$/.test(error.message)?error.message:'delivery_error';
        await client.query(`UPDATE telegram_outbox SET state=$2,locked_until=NULL,last_error=$3,next_attempt_at=NOW()+$4*INTERVAL '1 second'
          WHERE id=$1 AND attempts=$5`,[job.id,disposition.kind==='pending'?'pending':'failed',code,disposition.delay || 1,attempts]);
      }
    });
  } finally { if(client!==source) client.release(); }
}
async function pauseDelivery(client,seconds) {
  await client.query(`INSERT INTO telegram_state(key,value) VALUES('delivery-pause-until',(clock_timestamp()+$1*INTERVAL '1 second')::text)
    ON CONFLICT(key) DO UPDATE SET value=GREATEST(telegram_state.value::timestamptz,EXCLUDED.value::timestamptz)::text`,[Math.min(86400,Math.max(1,Number(seconds)||1))]);
}
module.exports={failure,deliver,withChatLock,pauseDelivery};

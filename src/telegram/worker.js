const fs = require("node:fs/promises");
const path = require("node:path");
const { configuration } = require("./config");
const { call } = require("./client");
const { handleUpdate } = require("./bot");
const { withClient, withTransaction, getPool } = require("../db/pool");
const data = require("./data");
const messages = require("./messages");
const access = require('./access');
const interactive = require('./interactive-delivery');

async function claim(client,lane='interactive') {
  await client.query("SELECT pg_advisory_xact_lock(91827058)");
  // Alternate attempted lanes when both have due work and notifications aged.
  // Counting attempts also lets replies proceed after a failed/cancelled alert.
  const lastWasNotification=`COALESCE((SELECT recent.notification IS NOT NULL FROM telegram_outbox recent
    WHERE recent.chat_id=o.chat_id AND recent.delivery_started_at IS NOT NULL
    ORDER BY recent.delivery_started_at DESC,recent.id DESC LIMIT 1),FALSE)`;
  // One in-flight message per chat, including unlinked bot replies.
  const {rows:[job]}=await client.query(`WITH candidate AS (
    SELECT o.id FROM telegram_outbox o WHERE next_attempt_at<=NOW() AND
      NOT EXISTS(SELECT 1 FROM telegram_state WHERE key='delivery-pause-until' AND value::timestamptz>NOW()) AND
      ${lane==='notification'?'notification IS NOT NULL':'notification IS NULL'} AND
      (state='pending' OR (state='processing' AND locked_until<NOW())) AND
      NOT EXISTS(SELECT 1 FROM telegram_outbox other WHERE other.chat_id=o.chat_id AND other.id<>o.id AND
        ((other.state='processing' AND other.locked_until>NOW()) OR other.sent_at>NOW()-INTERVAL '1 second')) AND
      ${lane==='notification'?`((NOT ${lastWasNotification} AND o.created_at<NOW()-INTERVAL '10 seconds') OR NOT EXISTS(SELECT 1 FROM telegram_outbox fast
        WHERE fast.chat_id=o.chat_id AND fast.notification IS NULL AND fast.state='pending' AND fast.next_attempt_at<=NOW()))`:
        `(${lastWasNotification} OR NOT EXISTS(SELECT 1 FROM telegram_outbox fair WHERE fair.chat_id=o.chat_id AND fair.notification IS NOT NULL
          AND fair.state='pending' AND fair.next_attempt_at<=NOW() AND fair.created_at<NOW()-INTERVAL '10 seconds'))`}
    ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE telegram_outbox SET state='processing',attempts=attempts+1,locked_until=NOW()+INTERVAL '45 seconds',delivery_started_at=clock_timestamp()
    WHERE id IN(SELECT id FROM candidate) RETURNING *`);
  return job;
}
async function payloadFor(client,job) {
  if (!await access.chatAllowed(client, job.chat_id)) return null;
  let link;
  if(job.link_id) {
    const {rows}=await client.query(`SELECT l.* FROM telegram_links l JOIN users u ON u.id=l.user_id WHERE l.id=$1
      AND NOT l.blocked AND (u.suspended_until IS NULL OR u.suspended_until<=NOW())`,[job.link_id]);
    link=rows[0];
    if(!link || String(link.chat_id)!==String(job.chat_id)) return null;
    if (!await access.allowed(client, link.user_id)) return null;
  }
  if(!job.notification) return job.payload;
  if(!link?.enabled || !link.preferences[messages.CATEGORY[job.notification.type]]) return null;
  const current=(await data.activeItems(client,link.user_id)).find(item=>item.id===job.notification.id);
  if(!current || data.fingerprint(current)!==data.fingerprint(job.notification)) return null;
  return messages.notification(current,link.locale);
}
async function sendForJob(job,method,body,options) {
  const config=configuration();
  if(config.mode==="local") {
    await fs.mkdir(config.captureDir,{recursive:true});
    try { await fs.writeFile(path.join(config.captureDir,job.id+".json"),JSON.stringify({method,...body},null,2),{flag:"wx",mode:0o600}); }
    catch(err) {if(err.code!=="EEXIST") throw err;}
    return {message_id:Number(job.id)};
  }
  return call(method,body,options);
}
async function tick(lane='interactive',{signal}={}) {
  const job=await withTransaction(client=>claim(client,lane));
  if(!job) return;
  if(job.screen_generation!=null) return withClient(client=>interactive.deliver(client,job,{send:(method,body)=>sendForJob(job,method,body,{signal})}));
  try {
    await withClient(client=>interactive.withChatLock(client,job,async()=>{
      const payload=await payloadFor(client,job);
      if(!payload) {
        await client.query("UPDATE telegram_outbox SET state='cancelled',payload=NULL,locked_until=NULL WHERE id=$1 AND attempts=$2",[job.id,job.attempts]);
        return;
      }
      const result=await sendForJob(job,'sendMessage',{chat_id:job.chat_id,...payload},{signal});
      await client.query(`UPDATE telegram_outbox SET state='sent',sent_at=NOW(),message_id=$2,payload=NULL,locked_until=NULL,last_error=NULL WHERE id=$1 AND attempts=$3`,[job.id,result.message_id,job.attempts]);
    }));
  } catch(err) {
    const retry=err.retryable!==false && job.attempts<8;
    await withTransaction(async client=>{
      if(err.code===403) await client.query("UPDATE telegram_links SET blocked=TRUE WHERE chat_id=$1",[job.chat_id]);
      if(err.code===429) await interactive.pauseDelivery(client,err.retryAfter);
      const code=/^telegram_(http_\d{3}|network_error)$/.test(err.message)?err.message:"delivery_error";
      await client.query(`UPDATE telegram_outbox SET state=$2,locked_until=NULL,last_error=$3,next_attempt_at=NOW()+$4*INTERVAL '1 second'
        WHERE id=$1 AND attempts=$5`,[job.id,retry?"pending":"failed",code,err.code===429?err.retryAfter:Math.min(1800,2**job.attempts*5),job.attempts]);
    });
  }
}
async function advanceOffset(client,update) {
  if(!Number.isSafeInteger(update?.update_id) || update.update_id<0) return;
  await client.query("INSERT INTO telegram_state(key,value) VALUES('poll-offset',$1) ON CONFLICT(key) DO UPDATE SET value=GREATEST(telegram_state.value::bigint,EXCLUDED.value::bigint)::text",[String(update.update_id+1)]);
}
// Start the spinner ACK immediately, without waiting on its network roundtrip
// before processing the command. Drain the bounded call even on failure/shutdown.
// The webhook keeps its router-owned inline response contract.
async function processUpdate(update,{answer=call,transaction=withTransaction,signal}={}) {
  const acknowledgement=(async()=>{
    if(typeof update.callback_query?.id==='string' && update.callback_query.id.length<=256) {
      try { await answer('answerCallbackQuery',{callback_query_id:update.callback_query.id},{timeout:1500,signal}); }
      catch { /* An expired spinner does not prevent a durable response. */ }
    }
  })();
  try { return await processCommand(update,{transaction,signal}); }
  finally { await acknowledgement; }
}
async function processCommand(update,{transaction,signal}) {
  let error;
  for(let attempt=0;attempt<3;attempt++) {
    try { return await transaction(async client=>{await handleUpdate(client,update);await advanceOffset(client,update);}); }
    catch(err) { error=err; if(signal?.aborted) throw err; }
  }
  // A permanently bad command must not hold the poll offset forever. Business
  // writes from the failed attempts rolled back. Record a bounded generic reply
  // and the receipt/offset together; database outages still propagate/retry.
  await transaction(async client=>{
    const {rowCount}=await client.query('INSERT INTO telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING',[update.update_id]);
    const person=update.callback_query?.from || update.message?.from;
    const message=update.callback_query?.message || update.message;
    if(rowCount && message?.chat?.type==='private' && Number.isSafeInteger(person?.id) && person.id>0 && message.chat.id===person.id) {
      const link=await data.linkFor(client,person.id);
      if(await access.chatAllowed(client,person.id)) await data.queueReply(client,person.id,{text:messages.choose(link?.locale || (person.language_code?.startsWith('en')?'en':'ru'),
        'Не удалось обработать команду. Открой /games и попробуй снова.','Could not process this command. Open /games and try again.')},`u:${update.update_id}:error`,link?.id);
    }
    await advanceOffset(client,update);
  });
  console.error(JSON.stringify({level:'error',msg:'telegram command failed after bounded attempts',code:/^[0-9A-Z]{5}$/.test(error?.code)?error.code:'command_error'}));
}
async function cleanup() {
  await withTransaction(async client=>{
    await client.query("DELETE FROM telegram_link_tokens WHERE expires_at<NOW()");
    await client.query("DELETE FROM telegram_updates WHERE received_at<NOW()-INTERVAL '7 days'");
    await client.query("DELETE FROM telegram_events WHERE processed_at<NOW()-INTERVAL '30 days'");
    await client.query("UPDATE telegram_outbox SET state='cancelled',payload=NULL WHERE created_at<NOW()-INTERVAL '2 days' AND state='pending'");
    await client.query("DELETE FROM telegram_outbox WHERE created_at<NOW()-INTERVAL '30 days' AND state NOT IN ('pending','processing')");
  });
}
function startWorker() {
  const config=configuration();
  if(!config.enabled || !config.workerEnabled) return async()=>{};
  let stopped=false, timer, backgroundTimer, notificationTimer, active=Promise.resolve(), background=Promise.resolve(), notifications=Promise.resolve(), lastCleanup=0, verified=config.mode==="local", nextVerification=0;
  const controller=new AbortController();
  const pause=ms=>new Promise(resolve=>{
    if(controller.signal.aborted) return resolve();
    const finish=()=>{clearTimeout(delay);controller.signal.removeEventListener("abort",finish);resolve();};
    const delay=setTimeout(finish,ms);controller.signal.addEventListener("abort",finish,{once:true});
  });
  const log=(message)=>console.error(JSON.stringify({level:"error",msg:message}));
  const run=()=>{
    active=(async()=>{
      try {
        if(!verified && Date.now()>=nextVerification) {
          nextVerification=Date.now()+30000;
          const me=await call("getMe");
          if(me.username.toLowerCase()!==config.username.toLowerCase()) throw Error("Bot identity mismatch");
          await withTransaction(async client=>{
            await client.query("INSERT INTO telegram_state(key,value) VALUES('bot-id',$1) ON CONFLICT DO NOTHING",[String(me.id)]);
            const {rows:[identity]}=await client.query("SELECT value FROM telegram_state WHERE key='bot-id'");
            if(identity.value!==String(me.id)) throw Error("Bot identity mismatch");
          });
          verified=true;
        }
        if(!verified) return;
        await tick('interactive',{signal:controller.signal});
      } catch {log("telegram delivery worker failed; check database and bot identity/configuration");}
      finally {if(!stopped) {timer=setTimeout(run,250);timer.unref();}}
    })();
  };
  run();
  const expand=()=>{
    background=(async()=>{
      try {
        if(!verified) return;
        if(Date.now()-lastCleanup>3600000) {await cleanup();lastCleanup=Date.now();}
        await withTransaction(data.expandEvents);
      } catch {if(!stopped) log('telegram notification worker failed');}
      finally {if(!stopped) {backgroundTimer=setTimeout(expand,1000);backgroundTimer.unref();}}
    })();
  };
  expand();
  const notify=()=>{
    notifications=(async()=>{
      try {if(verified && !stopped) await tick('notification',{signal:controller.signal});}
      catch {if(!stopped) log('telegram notification delivery failed');}
      finally {if(!stopped) {notificationTimer=setTimeout(notify,1000);notificationTimer.unref();}}
    })();
  };
  notify();
  let poll=Promise.resolve();
  if(config.mode==="polling") poll=(async()=>{
    while(!stopped) {
      if(!verified) {await pause(1000);continue;}
      let guard,locked=false,failed=false;
      const lease=new AbortController();
      const lost=()=>{failed=true;lease.abort();};
      try {
        guard=await getPool().connect();
        guard.on("error",lost);
        ({rows:[{locked}]}=await guard.query("SELECT pg_try_advisory_lock(91827057) AS locked"));
        if(!locked) throw Error("Polling already running");
        const webhook=await call("getWebhookInfo",{},{signal:controller.signal});
        if(webhook.url) throw Error("Webhook exists");
        while(!stopped && !failed) {
          const {rows:[state]}=await guard.query("SELECT value FROM telegram_state WHERE key='poll-offset'");
          const updates=await call("getUpdates",{offset:Number(state?.value)||0,timeout:25,allowed_updates:["message","callback_query","my_chat_member"]},{signal:AbortSignal.any([controller.signal,lease.signal]),timeout:30000});
          for(const update of updates) {
            if(stopped || failed) break;
            await processUpdate(update,{signal:AbortSignal.any([controller.signal,lease.signal])});
          }
        }
      } catch {if(!stopped) log("telegram polling failed; check connection, competing instances and run telegram:setup if a webhook is configured");}
      finally {
        if(guard) {
          if(locked && !failed) await guard.query("SELECT pg_advisory_unlock(91827057)").catch(()=>{failed=true;});
          guard.removeListener("error",lost);
          guard.release(failed);
        }
      }
      if(!stopped) await pause(5000);
    }
  })();
  return async()=>{stopped=true;clearTimeout(timer);clearTimeout(backgroundTimer);clearTimeout(notificationTimer);controller.abort();await Promise.allSettled([active,background,notifications,poll]);};
}
module.exports={startWorker,tick,claim,payloadFor,processUpdate};

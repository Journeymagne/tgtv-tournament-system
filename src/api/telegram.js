const crypto = require("node:crypto");
const { configuration } = require("../telegram/config");
const { hash, csrfToken, authorize, equal } = require("../telegram/security");
const { HttpError } = require("../http/io");
const { handleUpdate } = require("../telegram/bot");
const { DEFAULTS, queueReply } = require("../telegram/data");
const messages = require("../telegram/messages");

function enabled() {
  const config = configuration();
  if (!config.enabled) throw new HttpError(503,"Бот пока недоступен.");
  return config;
}
async function status(ctx) {
  const config = configuration();
  const { rows:[link] } = await ctx.client.query("SELECT username,display_name,telegram_id,enabled,blocked,preferences,locale FROM telegram_links WHERE user_id=$1",[ctx.user.id]);
  const { rows:[pending] } = await ctx.client.query("SELECT expires_at,telegram_id,username,display_name FROM telegram_link_tokens WHERE user_id=$1 AND expires_at>NOW()",[ctx.user.id]);
  return { body:{ available:config.enabled, botUsername:config.username || null, accountId:ctx.user.id, csrfToken:csrfToken(ctx.req), link:link || null,
    pending:pending ? { expiresAt:pending.expires_at, claimed:Boolean(pending.telegram_id), telegramId:pending.telegram_id, username:pending.username, displayName:pending.display_name } : null },headers:{"Cache-Control":"no-store"} };
}
async function createLink(ctx) {
  const config=enabled(); authorize(ctx);
  await ctx.client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[ctx.user.id]);
  if ((await ctx.client.query("SELECT 1 FROM telegram_links WHERE user_id=$1",[ctx.user.id])).rowCount) throw new HttpError(409,"Сначала отвяжите текущий Telegram.");
  const key="link-rate:"+ctx.user.id;
  const {rows:[last]}=await ctx.client.query("SELECT value FROM telegram_state WHERE key=$1",[key]);
  if (last && Date.now()-Number(last.value)<10000) throw new HttpError(429,"Подождите 10 секунд перед созданием новой ссылки.");
  await ctx.client.query("INSERT INTO telegram_state(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[key,String(Date.now())]);
  const token=crypto.randomBytes(32).toString("base64url");
  await ctx.client.query(`INSERT INTO telegram_link_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')
    ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,telegram_id=NULL,username=NULL,display_name=NULL,claimed_at=NULL`,[ctx.user.id,hash(token)]);
  return {body:{url:`https://t.me/${config.username}?start=link_${token}`},headers:{"Cache-Control":"no-store"}};
}
async function confirmLink(ctx) {
  enabled(); authorize(ctx);
  await ctx.client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[ctx.user.id]);
  const {rows:[pending]}=await ctx.client.query("SELECT * FROM telegram_link_tokens WHERE user_id=$1 AND expires_at>NOW() FOR UPDATE",[ctx.user.id]);
  if (!pending?.telegram_id || String(ctx.body.telegramId)!==String(pending.telegram_id)) throw new HttpError(409,"Откройте ссылку в боте и проверьте выбранный Telegram-аккаунт.");
  const {rows:conflicts}=await ctx.client.query("SELECT 1 FROM telegram_links WHERE user_id=$1 OR telegram_id=$2",[ctx.user.id,pending.telegram_id]);
  if (conflicts.length) throw new HttpError(409,"Этот аккаунт уже связан. Обновите страницу.");
  let link;
  try {
    ({rows:[link]}=await ctx.client.query(`INSERT INTO telegram_links(user_id,telegram_id,chat_id,username,display_name,locale) VALUES($1,$2,$2,$3,$4,$5) RETURNING *`,
      [ctx.user.id,pending.telegram_id,pending.username,pending.display_name,ctx.body.locale==="en"?"en":"ru"]));
  } catch(err) { if(err.code==="23505") throw new HttpError(409,"Этот Telegram уже связан с аккаунтом."); throw err; }
  await ctx.client.query("DELETE FROM telegram_link_tokens WHERE user_id=$1",[ctx.user.id]);
  await queueReply(ctx.client,link.chat_id,messages.welcome(link.locale,true),`linked:${link.id}`,link.id);
  return status(ctx);
}
async function preferences(ctx) {
  enabled(); authorize(ctx);
  const {rows:[link]}=await ctx.client.query("SELECT * FROM telegram_links WHERE user_id=$1 FOR UPDATE",[ctx.user.id]);
  if (!link) throw new HttpError(409,"Сначала подключите Telegram.");
  if (ctx.body.enabled!==undefined && typeof ctx.body.enabled!=="boolean") throw new HttpError(400,"Invalid notification setting");
  const prefs={...link.preferences};
  if (ctx.body.preferences!==undefined) {
    if (!ctx.body.preferences || typeof ctx.body.preferences!=="object" || Array.isArray(ctx.body.preferences)) throw new HttpError(400,"Invalid notification preferences");
    for(const [key,value] of Object.entries(ctx.body.preferences)) {
      if (!Object.hasOwn(DEFAULTS,key) || typeof value!=="boolean") throw new HttpError(400,"Invalid notification preference");
      prefs[key]=value;
    }
  }
  await ctx.client.query("UPDATE telegram_links SET enabled=$2,preferences=$3 WHERE id=$1",[link.id,ctx.body.enabled??link.enabled,JSON.stringify(prefs)]);
  return status(ctx);
}
async function unlink(ctx) {
  authorize(ctx);
  await ctx.client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[ctx.user.id]);
  await ctx.client.query("DELETE FROM telegram_link_tokens WHERE user_id=$1",[ctx.user.id]);
  await ctx.client.query("DELETE FROM telegram_links WHERE user_id=$1",[ctx.user.id]);
  return status(ctx);
}
async function webhook(ctx) {
  const config=configuration();
  if(config.mode!=="webhook") throw new HttpError(404,"Route not found");
  if(!equal(ctx.req.headers["x-telegram-bot-api-secret-token"],config.webhookSecret)) throw new HttpError(403,"Invalid webhook secret");
  await handleUpdate(ctx.client,ctx.body);
  const callbackId=ctx.body?.callback_query?.id;
  return {body:typeof callbackId==="string" && callbackId.length<=256 ? {method:"answerCallbackQuery",callback_query_id:callbackId} : {ok:true}};
}
module.exports={routes:[
  {method:"GET",path:"/api/telegram/status",handler:status,auth:"user"},
  {method:"POST",path:"/api/telegram/link",handler:createLink,auth:"user",tx:true,maxBodyBytes:4096},
  {method:"POST",path:"/api/telegram/confirm",handler:confirmLink,auth:"user",tx:true,maxBodyBytes:4096},
  {method:"PATCH",path:"/api/telegram/preferences",handler:preferences,auth:"user",tx:true,maxBodyBytes:4096},
  {method:"DELETE",path:"/api/telegram/link",handler:unlink,auth:"user",tx:true,maxBodyBytes:4096},
  {method:"POST",path:"/api/telegram/webhook",handler:webhook,tx:true,maxBodyBytes:65536}
]};

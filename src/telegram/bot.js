const { hash } = require("./security");
const data = require("./data");
const msg = require("./messages");

async function command(client, update, person, chatId, link, action) {
  const locale = link?.locale || (person.language_code?.startsWith("en") ? "en" : "ru");
  const t = (ru,en)=>msg.choose(locale,ru,en);
  const reply = (payload,suffix="0") => data.queueReply(client,chatId,payload,`u:${update.update_id}:${suffix}`,link?.id);
  if (action.startsWith("link_")) {
    const code = action.slice(5);
    if (!/^[a-zA-Z0-9_-]{43}$/.test(code)) return reply({ text:t("Ссылка недействительна. Создайте новую в профиле сайта.","Invalid link. Create a new one in your website profile.") });
    const { rows:[token] } = await client.query("SELECT * FROM telegram_link_tokens WHERE token_hash=$1 AND expires_at>NOW() FOR UPDATE",[hash(code)]);
    const { rows:conflict } = await client.query("SELECT user_id FROM telegram_links WHERE telegram_id=$1",[person.id]);
    if (!token || (token.telegram_id && String(token.telegram_id)!==String(person.id)) || conflict.some(row=>row.user_id!==token.user_id)) {
      return reply({ text:t("Ссылка истекла или аккаунт уже связан. Проверьте настройки на сайте.","The link expired or the account is already linked. Check website settings.") });
    }
    await client.query(`UPDATE telegram_link_tokens SET telegram_id=$2,username=$3,display_name=$4,claimed_at=NOW() WHERE user_id=$1`,
      [token.user_id,person.id,msg.short(person.username,32),msg.short([person.first_name,person.last_name].filter(Boolean).join(" "))]);
    return reply({ text:t("Telegram найден. Вернитесь в профиль сайта и подтвердите привязку этого аккаунта.","Telegram identified. Return to your website profile and confirm this account."),
      reply_markup:{ inline_keyboard:[[msg.button(t("Подтвердить на сайте","Confirm on website"),"/tournament#/profile")]] } });
  }
  if (action === "tournaments") {
    const { rows } = await client.query(`SELECT name,slug,starts_at FROM tournaments
      WHERE status IN ('registration_open','registration_closed','in_progress') ORDER BY starts_at NULLS LAST,id DESC LIMIT 8`);
    return reply({ text:rows.length ? t("Ближайшие и текущие турниры","Upcoming and active tournaments") : t("Сейчас нет открытых турниров.","No open tournaments right now."),
      reply_markup:{ inline_keyboard: rows.map(row=>[msg.appButton(msg.short(row.name,60),"/tournaments/"+encodeURIComponent(row.slug))]).concat([[msg.appButton(t("Все турниры","All tournaments"),"/tournament#/tournaments")]]) } });
  }
  if (!link) return reply(msg.welcome(locale,false));
  if (action === "stop") {
    await client.query("UPDATE telegram_links SET enabled=FALSE WHERE id=$1",[link.id]);
    await client.query("UPDATE telegram_outbox SET state='cancelled' WHERE link_id=$1 AND notification IS NOT NULL AND state='pending'",[link.id]);
    return reply({ text:t("Уведомления выключены. Включить их можно в /settings.","Notifications disabled. Enable them in /settings.") });
  }
  if (action === "unlink:ask" || action === "unlink") return reply({ text:t("Отвязать Telegram? Аккаунт и результаты на сайте сохранятся.","Disconnect Telegram? Your website account and results will be kept."),
    reply_markup:{inline_keyboard:[[{text:t("Отвязать","Disconnect"),callback_data:"unlink:yes"},{text:t("Отмена","Cancel"),callback_data:"m:settings"}]]} });
  if (action === "unlink:yes") {
    await client.query("DELETE FROM telegram_link_tokens WHERE user_id=$1",[link.user_id]);
    await client.query("DELETE FROM telegram_links WHERE id=$1",[link.id]);
    link = null;
    return reply({ text:t("Telegram отвязан.","Telegram disconnected.") });
  }
  if (/^p:(pairings|results|invitations|tournaments):[01]$/.test(action)) {
    const [,key,value] = action.split(":");
    await client.query("UPDATE telegram_links SET preferences=jsonb_set(preferences,ARRAY[$2],$3::jsonb) WHERE id=$1",[link.id,key,value==="1"?"true":"false"]);
    link.preferences[key]=value==="1"; action="settings";
  }
  if (/^enabled:[01]$/.test(action)) {
    link.enabled=action.endsWith("1");
    await client.query("UPDATE telegram_links SET enabled=$2 WHERE id=$1",[link.id,link.enabled]); action="settings";
  }
  if (/^lang:(ru|en)$/.test(action)) {
    link.locale=action.split(":")[1];
    await client.query("UPDATE telegram_links SET locale=$2 WHERE id=$1",[link.id,link.locale]); action="settings";
  }
  if (action === "settings") return reply(msg.settings(link));
  if (action === "profile" || action === "me") {
    const user = await data.users.findById(client,link.user_id);
    return reply({text:`${msg.short(user.name)}\n${t("Рейтинг TTS","TTS rating")}: ${user.ratings.tts}\n${t("Рейтинг IRL","IRL rating")}: ${user.ratings.irl}`,
      reply_markup:{inline_keyboard:[[msg.appButton(t("Мой профиль","My profile"),"/tournament#/profile")]]} });
  }
  if (action === "games") {
    const games = await data.activeGames(client,link.user_id);
    const items = await data.activeItems(client,link.user_id);
    const teams = items.filter(item=>item.type==="team_pairing");
    await reply({text:games.length || teams.length ? t("Ваши активные игры","Your active games") : t("Активных игр пока нет.","No active games yet."),
      reply_markup:{inline_keyboard:[[msg.appButton(t("Все мои игры","All my games"),"/tournament#/mygames")]]} });
    for(const item of teams.slice(0,3)) await reply(msg.notification(item,locale),item.id);
    for (const game of games.slice(0,5)) {
      const item = items.find(item=>item.gameId===game.id && item.type!=="result_pending");
      const payload = item ? msg.notification(item,locale) : {text:game.players.map(p=>msg.short(p.name)).join(" — "),reply_markup:{inline_keyboard:[[msg.appButton(t("Открыть матч","Open match"),`#/games/game/${game.id}`)]]}};
      if (items.some(item=>item.gameId===game.id && item.type==="result_pending")) payload.text += "\n"+t("Ожидается ваше подтверждение результата.","Awaiting your result confirmation.");
      await reply(payload,"game:"+game.id);
    }
    return;
  }
  return reply(msg.welcome(locale,true));
}

async function handleUpdate(client, update) {
  if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0) return;
  const { rowCount } = await client.query("INSERT INTO telegram_updates(update_id) VALUES($1) ON CONFLICT DO NOTHING",[update.update_id]);
  if (!rowCount) return;
  const member = update.my_chat_member;
  if (member?.chat?.type === "private" && Number.isSafeInteger(member.chat.id) && member.chat.id>0) {
    await client.query("UPDATE telegram_links SET blocked=$2 WHERE telegram_id=$1",[member.chat.id,["kicked","left"].includes(member.new_chat_member?.status)]);
    return;
  }
  const message = update.message || update.callback_query?.message;
  const person = update.callback_query?.from || update.message?.from;
  if (message?.chat?.type !== "private" || person?.is_bot || !Number.isSafeInteger(person?.id) || person.id<=0 || message.chat.id!==person.id) return;
  await client.query("SELECT pg_advisory_xact_lock(91827, $1)",[person.id % 2147483647]);
  const link = await data.linkFor(client,person.id);
  if (link) await client.query("UPDATE telegram_links SET blocked=FALSE WHERE id=$1",[link.id]);
  // Limit each Telegram sender independently, including attempts to claim links.
  const { rows:[rate] } = await client.query(`SELECT COUNT(*)::int AS count FROM telegram_outbox WHERE chat_id=$1 AND created_at>NOW()-INTERVAL '1 minute'`,[person.id]);
  if (rate.count>=30) return;
  const text = String(message.text || "");
  let action = typeof update.callback_query?.data === "string" ? update.callback_query.data : "";
  if (!action) {
    const match = /^\/(\w+)(?:@[a-zA-Z0-9_]+)?(?:\s+([^\s]+))?/.exec(text);
    action = match ? match[1]==="start" && match[2] ? match[2] : match[1] : "help";
  }
  if (action.startsWith("m:")) action=action.slice(2);
  await command(client,update,person,person.id,link,action);
}
module.exports = { handleUpdate };

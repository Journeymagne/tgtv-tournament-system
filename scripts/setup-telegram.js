require("../src/config");
const { configuration } = require("../src/telegram/config");
const { call } = require("../src/telegram/client");

async function main() {
  const config=configuration();
  if(!["polling","webhook"].includes(config.mode)) throw Error("Set TELEGRAM_MODE to polling or webhook first");
  const me=await call("getMe");
  if(me.username.toLowerCase()!==config.username.toLowerCase()) throw Error("Bot token belongs to a different TELEGRAM_BOT_USERNAME");
  if(config.miniAppUrl) {
    const page = await fetch(config.miniAppUrl, { signal: AbortSignal.timeout(15000), redirect: "error" });
    if(!page.ok || !(await page.text()).includes('/miniapp/app.js')) throw Error("Mini App page is not deployed; deploy /miniapp before enabling the menu");
  }
  const commands=[
    ["start","Начать / подключить аккаунт","Start / connect account"],
    ["games","Мои игры","My games"],["tournaments","Турниры","Tournaments"],
    ["profile","Мой профиль","My profile"],["settings","Настройки уведомлений","Notification settings"],
    ["stop","Выключить уведомления","Disable notifications"],["help","Помощь","Help"]
  ];
  await call("setMyCommands",{commands:commands.map(([command,description])=>({command,description}))});
  await call("setMyCommands",{language_code:"en",commands:commands.map(([command,,description])=>({command,description}))});
  const descriptions = {
    ru: {
      description: 'KT Companion — игры и турниры в Telegram. Получайте пары, вызовы, приглашения и запросы подтверждения результата. В мини-приложении смотрите свои игры, турнирную таблицу и профиль, вносите счёт. Нажмите Start и подключите свой аккаунт KT Companion.',
      short_description: 'Игры, турниры, пары и результаты Kill Team. Подключите аккаунт KT Companion и откройте мини-приложение.'
    },
    en: {
      description: 'KT Companion — games and tournaments in Telegram. Get pairings, challenges, invitations and result confirmation requests. Open the mini app to view your games, standings and profile, and submit scores. Tap Start and connect your KT Companion account.',
      short_description: 'Kill Team games, tournaments, pairings and results. Connect your KT Companion account and open the mini app.'
    }
  };
  for (const language_code of ['', 'ru', 'en']) {
    const copy = descriptions[language_code || 'ru'];
    await call('setMyDescription', { language_code, description: copy.description });
    await call('setMyShortDescription', { language_code, short_description: copy.short_description });
  }
  await call("setChatMenuButton",{menu_button:config.miniAppUrl ? {type:"web_app",text:"Турниры",web_app:{url:config.miniAppUrl}} : {type:"commands"}});
  if(config.mode==="webhook") await call("setWebhook",{url:config.site+"/api/telegram/webhook",secret_token:config.webhookSecret,allowed_updates:["message","callback_query","my_chat_member"],drop_pending_updates:false});
  else await call("deleteWebhook",{drop_pending_updates:false});
  console.log(`Configured @${me.username}: ${config.mode}. Start/restart the app to enable the worker.`);
}
main().catch(err=>{console.error(/^(telegram_|Set TELEGRAM_MODE|Bot token|Mini App page)/.test(err.message)?err.message:"Telegram setup failed; check configuration (credentials omitted)");process.exitCode=1;});

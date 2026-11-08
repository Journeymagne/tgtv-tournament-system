const { configuration } = require("./config");
const choose = (locale, ru, en) => locale === "en" ? en : ru;
const short = (value, max = 120) => String(value || "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, max);
const CATEGORY = { game_challenge: "invitations", team_invitation: "invitations", tournament_started: "tournaments", tournament_pairing: "pairings", team_tournament_pairing: "pairings", team_pairing: "pairings", result_pending: "results" };
const DEFAULTS = { pairings: true, results: true, invitations: true, tournaments: true };
function url(href) {
  const site = configuration().site;
  const candidate = new URL(href.startsWith("#") ? "/tournament" + href : href, site);
  if (candidate.origin !== site || !/^\/(?:tournament(?:s\/[^/]+)?|teams\/[^/]+)$/.test(candidate.pathname)) throw Error("Invalid Telegram destination");
  return candidate.href;
}
const button = (text, href) => ({ text, url: url(href) });
function appButton(text, href) {
  const appUrl = configuration().miniAppUrl;
  if (!appUrl) return button(text, href);
  const destination = new URL(url(href));
  const app = new URL(appUrl);
  const game = /^#\/games\/game\/(\d+)$/.exec(destination.hash);
  const tournament = /^\/tournaments\/([^/]+)$/.exec(destination.pathname);
  if (game) { app.searchParams.set("screen", "match"); app.searchParams.set("game", game[1]); }
  else if (tournament) app.searchParams.set("tournament", decodeURIComponent(tournament[1]));
  else if (destination.hash === "#/profile") app.searchParams.set("screen", "profile");
  else if (destination.hash === "#/mygames") app.searchParams.set("screen", "match");
  else if (destination.hash !== "#/tournaments") return button(text, href);
  return { text, web_app: { url: app.href } };
}
function menu(locale) {
  return { inline_keyboard: [
    ...(configuration().miniAppUrl ? [[{ text: choose(locale, "Открыть Турнирную систему", "Open Tournament System"), web_app: { url: configuration().miniAppUrl } }]] : []),
    [{ text: choose(locale, "Мои игры", "My games"), callback_data: "m:games" }, { text: choose(locale, "Турниры", "Tournaments"), callback_data: "m:tournaments" }],
    [{ text: choose(locale, "Мой профиль", "My profile"), callback_data: "m:profile" }, { text: choose(locale, "Настройки", "Settings"), callback_data: "m:settings" }]
  ] };
}
function welcome(locale, linked) {
  const t = (ru, en) => choose(locale, ru, en);
  const config = configuration();
  const lines = [
    '🔶 <b>KT COMPANION</b>',
    '',
    t('Привет! Я помогу следить за играми и турнирами и вовремя узнавать о важных событиях.',
      'Hi! I help you keep track of your games and tournaments and stay up to date with important events.'),
    '',
    t('<b>Что я умею</b>', '<b>What I can do</b>'),
    t('⚔️ Присылать вызовы на игру и приглашения в команду.', '⚔️ Send game challenges and team invitations.'),
    t('🏆 Сообщать о старте турнира и новых парах.', '🏆 Notify you when a tournament starts or pairings are ready.'),
    t('📍 Показывать соперника, стол, миссию и киллзону, когда они назначены.', '📍 Show your opponent, table, mission and killzone when assigned.'),
    t('✅ Напоминать, что результат игры ждёт твоего подтверждения.', '✅ Let you know when a game result needs your confirmation.')
  ];
  if (config.miniAppUrl) lines.push('',
    t('<b>Компаньон внутри Telegram</b>', '<b>Companion inside Telegram</b>'),
    t('Открой мини-приложение: здесь можно посмотреть свои игры, турниры и таблицу, внести счёт и подтвердить результат.',
      'Open the mini app to view your games, tournaments and standings, submit scores and confirm results.'));
  lines.push('', linked
    ? t('<b>Аккаунт подключён.</b> Выбери действие кнопками ниже. Язык бота и нужные уведомления — в /settings.',
      '<b>Your account is connected.</b> Choose an action below. Set your bot language and notifications in /settings.')
    : t('<b>Как подключиться</b>\nНажми «Подключить аккаунт», войди на сайт и в профиле выбери «Подключить Telegram». Перейди по персональной ссылке, нажми Start и вернись на сайт, чтобы подтвердить привязку.',
      '<b>Get connected</b>\nTap “Connect account”, sign in on the website and choose “Connect Telegram” in your profile. Follow your personal link, tap Start, then return to the website to confirm the connection.'));
  if (config.adminOnly) lines.push('', t(
    '🛠 <b>Закрытый тест для администраторов.</b> Используются настоящие данные: внесённые результаты сохраняются на сайте.',
    '🛠 <b>Administrators-only preview.</b> This uses live data: submitted results are saved on the website.'));
  return {
    text: lines.join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: linked ? menu(locale) : { inline_keyboard: [[button(choose(locale, "Подключить аккаунт", "Connect account"), "/tournament#/profile")], [{ text: choose(locale, "Турниры", "Tournaments"), callback_data: "m:tournaments" }]] }
  };
}
function settings(link) {
  const l = link.locale;
  const labels = { pairings: choose(l,"Пары","Pairings"), results: choose(l,"Подтверждение результатов","Result confirmation"), invitations: choose(l,"Вызовы и приглашения","Challenges and invitations"), tournaments: choose(l,"Начало турниров","Tournament starts") };
  return { text: choose(l, "Уведомления Турнирной системы. Выберите, что получать.", "Tournament System notifications. Choose what to receive."), reply_markup: { inline_keyboard: [
    [{ text: (link.enabled ? "✓ " : "○ ") + choose(l,"Все уведомления","All notifications"), callback_data: "enabled:" + (link.enabled ? "0" : "1") }],
    ...Object.keys(DEFAULTS).map(key => [{ text: (link.preferences[key] ? "✓ " : "○ ") + labels[key], callback_data: `p:${key}:${link.preferences[key] ? "0" : "1"}` }]),
    [{ text: "Русский", callback_data: "lang:ru" }, { text: "English", callback_data: "lang:en" }],
    [button(choose(l,"Настройки на сайте","Website settings"),"/tournament#/profile")],
    [{ text: choose(l,"Отвязать Telegram","Disconnect Telegram"), callback_data: "unlink:ask" }]
  ] } };
}
function mission(value) {
  if (typeof value === "string") return short(value);
  return short(value?.name || value?.title || value?.label || value?.critOp || value?.mission || value?.id || "");
}
function notification(item, locale) {
  const t = (ru, en) => choose(locale,ru,en);
  // Names, tournament titles and imported metadata are user-controlled text.
  const escape = value => short(value).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
  const lines = ['🔶 <b>KT COMPANION</b>'];
  const field = (label, value) => { if (value !== undefined && value !== null && value !== '') lines.push(`<b>${label}</b>  ${escape(value)}`); };
  const title = (ru, en) => lines.push(`<b>${t(ru,en)}</b>`, '');
  let action;
  switch (item.type) {
    case "game_challenge":
      title('ВЫЗОВ НА ИГРУ','GAME CHALLENGE');
      field(t('Соперник','Opponent'),item.actor?.name);
      action=t('Посмотреть вызов','View challenge'); break;
    case "team_invitation":
      title('ПРИГЛАШЕНИЕ В КОМАНДУ','TEAM INVITATION');
      field(t('Команда','Team'),item.team?.name);
      field(t('Пригласил','Invited by'),item.actor?.name);
      action=t('Посмотреть приглашение','View invitation'); break;
    case "tournament_started":
      title('ТУРНИР НАЧАЛСЯ','TOURNAMENT STARTED');
      field(t('Турнир','Tournament'),item.tournament?.name);
      action=t('Мой турнир','My tournament'); break;
    case "result_pending":
      title('ПРОВЕРЬТЕ РЕЗУЛЬТАТ','REVIEW THE RESULT');
      field(t('Матч','Match'),item.title);
      lines.push('',t('Другая сторона отправила результат на подтверждение.','The other side submitted a result for confirmation.'));
      action=t('Проверить результат','Review result'); break;
    case "team_pairing":
      title('КОМАНДНАЯ ПАРА ГОТОВА','TEAM PAIRING IS READY');
      if(item.title) lines.push(`<b>${escape(item.title)}</b>`, '');
      field(t('Турнир','Tournament'),item.tournament?.name);
      action=t('Открыть пейринг','Open pairings'); break;
    default:
      title('ВАША ПАРА ГОТОВА','YOUR PAIRING IS READY');
      field(t('Соперник','Opponent'),item.opponent?.name);
      field(t('Фракция соперника','Opponent faction'),item.opponentFaction);
      lines.push('');
      field(t('Турнир','Tournament'),item.tournament?.name);
      field(t('Ваша команда','Your team'),item.ownTeam?.name);
      field(t('Команда соперника','Opposing team'),item.opponentTeam?.name);
      field(t('Раунд','Round'),item.roundNumber);
      field(t('Стол','Table'),item.table?.number);
      field('Killzone',item.table?.killzone);
      field(t('Миссия','Mission'),mission(item.mission));
      action=t('Мои игры','My games');
  }
  // Solo notifications use a tournament-match ID on the website, while the
  // Mini App opens the canonical game. Both IDs are supplied by the inbox.
  const href = configuration().miniAppUrl && Number.isSafeInteger(item.gameId) && item.gameId > 0 ? `#/games/game/${item.gameId}` : item.href;
  const destination = appButton(action, href);
  return { text: lines.join("\n").replace(/\n{3,}/g,'\n\n').trim(), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[destination]] }, link_preview_options: { is_disabled: true } };
}
module.exports = { choose, short, CATEGORY, DEFAULTS, url, button, appButton, menu, welcome, settings, notification };

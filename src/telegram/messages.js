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
  return {
    text: linked ? choose(locale, "Турнирная система подключена. Выберите действие.", "Tournament System is connected. Choose an action.") : choose(locale,
      "Это бот Турнирной системы. Войдите на сайт и подключите Telegram в своём профиле. Аккаунт и рейтинг сохранятся.",
      "This is the Tournament System bot. Sign in on the website and connect Telegram in your profile. Your account and rating stay with you."),
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
  const lines = [];
  const t = (ru, en) => choose(locale,ru,en);
  switch (item.type) {
    case "game_challenge": lines.push(t("Вызов на игру","Game challenge"),short(item.actor?.name)); break;
    case "team_invitation": lines.push(t("Приглашение в команду","Team invitation"),short(item.team?.name)); break;
    case "tournament_started": lines.push(t("Турнир начался","Tournament started"),short(item.tournament?.name)); break;
    case "result_pending": lines.push(t("Результат ожидает вашего подтверждения","A result awaits your confirmation"),short(item.title)); break;
    case "team_pairing": lines.push(t("Опубликована командная пара","Team pairing published"),short(item.tournament?.name), short(item.title)); break;
    default:
      lines.push(t("Ваша турнирная пара","Your tournament pairing"),short(item.tournament?.name));
      if (item.roundNumber) lines.push(t("Раунд: ","Round: ") + item.roundNumber);
      if (item.opponent?.name) lines.push(t("Соперник: ","Opponent: ") + short(item.opponent.name));
      if (item.table?.number) lines.push(t("Стол: ","Table: ") + item.table.number);
      if (item.table?.killzone) lines.push("Killzone: " + short(item.table.killzone));
      if (mission(item.mission)) lines.push(t("Миссия: ","Mission: ") + mission(item.mission));
  }
  // Solo notifications use a tournament-match ID on the website, while the
  // Mini App opens the canonical game. Both IDs are supplied by the inbox.
  const href = configuration().miniAppUrl && Number.isSafeInteger(item.gameId) && item.gameId > 0 ? `#/games/game/${item.gameId}` : item.href;
  const destination = appButton(t("Открыть","Open"), href);
  if (!destination.web_app) destination.text = t("Открыть на сайте", "Open on website");
  return { text: lines.filter(Boolean).join("\n"), reply_markup: { inline_keyboard: [[destination]] }, link_preview_options: { is_disabled: true } };
}
module.exports = { choose, short, CATEGORY, DEFAULTS, url, button, appButton, menu, welcome, settings, notification };

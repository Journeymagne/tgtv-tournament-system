const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function gameFixture(overrides = {}) {
  return {
    id: 310, sourceType: "tournament_match", status: "open",
    createdAt: "2026-09-18T12:16:00.000Z",
    players: [{ id: 11, name: "Journey" }, { id: 22, name: "Иннокентий" }],
    tournament: { name: "Yerevan, Kill Team league, Autumn 2026-2027", slug: "autumn2026", ratingPolicy: "ranked" },
    tournamentMatch: { roundNumber: 1, bracketPosition: 2, table: { tableNumber: 2 } },
    ...overrides
  };
}

function renderDetail({ game = gameFixture(), me = { id: 11, isAdmin: true }, locale = "en" } = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
  const dictionary = require(`../../public/i18n/${locale}.js`);
  const content = { innerHTML: "" };
  const listeners = new Map();
  const calls = [];
  const context = vm.createContext({
    state: { me, selectedGameId: game.id },
    getKnownGame: () => game,
    t: (key, values = {}) => (dictionary[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? ""),
    fmtDate: () => "09/18, 15:16",
    setLiveContent: (element, html) => { element.innerHTML = html; },
    onLive: (element, type, handler) => element?.addEventListener(type, handler),
    liveRefresh: { schedule() {} },
    document: {
      querySelector(selector) {
        if (selector === "[data-content]") return content;
        if (!content.innerHTML.includes(selector.slice(1, -1))) return null;
        return { addEventListener: (event, handler) => listeners.set(selector, handler) };
      }
    },
    renderResultForm: (...args) => calls.push(["form", ...args]),
    renderResultReview: (...args) => calls.push(["review", ...args]),
    navigateBack: (...args) => calls.push(["back", ...args]),
    gameBackFallback: () => "/#/mygames",
    navigateToPublicTournament: (...args) => calls.push(["tournament", ...args]),
    openTeamPairing: (...args) => calls.push(["team", ...args]),
    wireLeaderboardProfiles: () => {},
    resultHeadline: () => "Result",
    killzoneReview: () => "",
    teamTableImageMarkup: () => "",
    reviewScoreCard: () => "",
    tieBreakerReview: () => "",
    eloReview: () => "",
    adminUi: () => ({}),
    exitOpenGame: () => {}
  });
  for (const name of ["escapeHtml", "playerProfileLink", "gamePlayerLinks", "gameTeamMatchId",
    "teamGameResultPermissions", "teamGameResultAction", "renderGameDetail"]) {
    const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
    if (!body) throw new Error(`Missing function: ${name}`);
    vm.runInContext(body, context);
  }
  vm.runInContext("renderGameDetail()", context);
  return { html: content.innerHTML, calls, click: (selector, dataset = {}) => {
    const handler = listeners.get(selector);
    if (!handler) throw new Error(`No click handler: ${selector}`);
    handler({ currentTarget: { dataset } });
  } };
}

module.exports = { gameFixture, renderDetail };

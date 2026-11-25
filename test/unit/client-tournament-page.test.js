const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = ["app.js", "admin.js"].map(file => fs.readFileSync(path.join(__dirname, "../../public", file), "utf8")).join("\n");
const extract = name => {
  const body = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, name);
  return body;
};

test("all tournament tabs use the same header and facts for viewers and managers", () => {
  const render = new Function("t", "escapeHtml", "tournamentFormatSummary", "formatLabel", "teamSizeFor", "tournamentStatusClass", "tournamentStatusLabel",
    "metricCard", "tournamentDateLabel", "tournamentParticipantCountLabel", "tournamentRoundsLabel", "venueModeLabel", "seasonLabel",
    `${extract("isListedTournamentParticipant")}; ${extract("listedTournamentParticipants")}; ${extract("tournamentCompactHeaderMarkup")}; return tournamentCompactHeaderMarkup;`
  )(key => key, String, () => "Swiss", () => "Swiss", () => 3, () => "open", () => "In progress", (label, value) => `<div>${label}:${value}</div>`,
    () => "18 Sep", () => "24/128", () => "6", () => "Tabletop Simulator", () => "2026 Q3");
  const data = { tournament: { name: "A Living Killteam", participantMode: "team" }, rosters: [], rounds: [] };
  const publicHeader = render(data);
  for (const activeTab of ["preview", "standings", "matches", "stats", "participants", "settings", "tables"]) {
    assert.equal(render(data, { admin: true, activeTab }), publicHeader);
  }
  assert.match(publicHeader, /2026 Q3/);
  assert.match(publicHeader, /24\/128/);
});

test("management extends the public tab order without replacing names or hiding statistics", () => {
  const tabs = new Function("t", "adminLabel", "canManageTournamentParticipants", `${extract("tournamentInfoTabDefinitions")}; return tournamentInfoTabDefinitions;`)(
    key => key, (_ru, en) => en, () => true
  );
  for (const participantMode of ["individual", "team"]) {
    const data = { tournament: { participantMode, venueMode: "irl" } };
    const publicTabs = tabs(data);
    const adminTabs = tabs(data, { admin: true });
    assert.deepEqual(adminTabs.slice(0, publicTabs.length), publicTabs);
    assert.equal(adminTabs.filter(tab => tab.id === "participants").length, 1);
    assert.ok(adminTabs.some(tab => tab.id === "settings"));
    assert.ok(adminTabs.some(tab => tab.id === "tables"));
  }
});

test("canonical route loads management detail only for authenticated administrators or assigned managers", async () => {
  for (const me of [null, { id: 9 }, { id: 1, isAdmin: true }, { id: 2, managedTournamentIds: [6] }]) {
    const state = { me };
    const calls = [];
    const data = { tournament: { id: 6, slug: "cup" } };
    const load = new Function("state", "api", "getKnownPublicTournament", "loadAdminUi", "t",
      `${require("../helpers/client-access-source")}; ${extract("loadPublicTournament")}; return loadPublicTournament;`
    )(state, async url => { calls.push(url); return data; }, () => null, async () => true, key => key);
    const result = await load("cup");
    const admin = Boolean(me?.isAdmin || me?.managedTournamentIds?.includes(6));
    assert.deepEqual(calls, admin ? ["/api/tournaments/cup", "/api/admin/tournaments/6"] : ["/api/tournaments/cup"]);
    assert.equal(Boolean(result.management), admin);
  }
});

test("revoked management rights retain the public tournament despite stale account permissions", async () => {
  const state = { me: { id: 2, managedTournamentIds: [6] } };
  const calls = [];
  const data = { tournament: { id: 6, slug: "cup", viewer: { canAdmin: false } } };
  const load = new Function("state", "api", "getKnownPublicTournament", "loadAdminUi", "t",
    `${require("../helpers/client-access-source")}; ${extract("loadPublicTournament")}; return loadPublicTournament;`
  )(state, async url => { calls.push(url); return data; }, () => null, async () => assert.fail("revoked manager loaded admin UI"), key => key);
  assert.equal(await load("cup"), data);
  assert.deepEqual(calls, ["/api/tournaments/cup"]);
});

test("management refresh renders the same canonical page and preserves the active tab", () => {
  const data = { tournament: { id: 6, slug: "cup" } };
  const state = { view: "tournaments", tournamentsTab: "admin", adminTournamentMode: "detail", selectedTournamentId: 6,
    adminTournamentDetail: data, tournamentInfoTab: "matches", me: { isAdmin: true } };
  const renders = [];
  const render = new Function("state", "tournamentSlugFromLocation", "renderPublicTournament", "canOpenAdministration",
    `${extract("renderTournaments")}; return renderTournaments;`
  )(state, () => "cup", (...args) => renders.push(args), () => true);
  render();
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0].tournament, data.tournament);
  assert.equal(renders[0][0].management, true);
  assert.equal(state.tournamentInfoTab, "matches");
});

test("legacy management detail opens the canonical tournament URL without an admin breadcrumb", () => {
  const state = { view: "tournaments", tournamentsTab: "admin", adminTournamentMode: "detail", selectedTournamentId: 6,
    adminTournamentDetail: { tournament: { id: 6, slug: "cup" } }, administrationContext: true, me: { isAdmin: true } };
  const urls = [], renders = [];
  const render = new Function("state", "tournamentSlugFromLocation", "renderPublicTournament", "canOpenAdministration", "pushAppLocation", "tournamentPublicPath",
    `${extract("renderTournaments")}; return renderTournaments;`
  )(state, () => "", (...args) => renders.push(args), () => true, (...args) => urls.push(args), slug => `/tournaments/${slug}`);
  render();
  assert.deepEqual(urls, [["/tournaments/cup", { replace: true }]]);
  assert.equal(state.administrationContext, false);
  assert.equal(renders.length, 1);
});

test("a delayed management load cannot replace a different tournament or page", async () => {
  for (const next of ["/tournaments/other", "/tournament#/profile"]) {
    let url = "/tournaments/cup", resolve;
    const state = { selectedTournamentId: 6, adminTournamentDetail: null };
    const load = new Function("state", "navigationUrl", "api", "loadAdminUsers",
      `${extract("loadAdminTournamentDetail")}; return loadAdminTournamentDetail;`
    )(state, () => url, () => new Promise(done => { resolve = done; }), async () => assert.fail("stale response loaded users"));
    const pending = load(6);
    url = next;
    resolve({ tournament: { id: 6, slug: "cup" } });
    await pending;
    assert.equal(state.adminTournamentDetail, null);
  }
});

test("management links retain judge actions on pairing, game and roster pages", () => {
  for (const management of [true, false]) {
    const state = { me: { id: 2, managedTournamentIds: [6] }, administrationContext: false,
      publicTournamentDetail: { management, tournament: { id: 6, slug: "cup" } } };
    const links = ["team-matches/7", "games/game/8", "rosters/9"].map(route => ({
      href: `/tournament#/${route}`, getAttribute() { return this.href; }, setAttribute(_key, value) { this.href = value; }
    }));
    const scope = new Function("state", "tournamentSlugFromLocation",
      `${require("../helpers/client-access-source")}; ${extract("scopeAdministrationLinks")}; return scopeAdministrationLinks;`
    )(state, () => "cup");
    scope({ querySelectorAll: () => links });
    assert.deepEqual(links.map(link => link.href), management
      ? ["/tournament#/administration/team-matches/7", "/tournament#/administration/games/game/8", "/tournament#/administration/rosters/9"]
      : ["/tournament#/team-matches/7", "/tournament#/games/game/8", "/tournament#/rosters/9"]);
    assert.equal(state.administrationContext, false);
  }
});

test("opening a pairing from the canonical management page keeps administrative controls", async () => {
  const state = { me: { id: 2, managedTournamentIds: [6] }, administrationContext: false,
    publicTournamentDetail: { management: true, tournament: { id: 6, slug: "cup" } } };
  const scopes = [];
  const open = new Function("state", "tournamentSlugFromLocation", "syncAppHash", "renderShell", "loadTeamPairing", "isCurrentTeamPairingRoute",
    `${require("../helpers/client-access-source")}; ${extract("openTeamPairing")}; return openTeamPairing;`
  )(state, () => "cup", () => scopes.push(state.administrationContext), () => {}, async () => {}, () => true);
  await open(7);
  assert.deepEqual(scopes, [true]);
  assert.equal(state.view, "teamPairing");
});

function tabHarness({ hash = "", tab = "participants" } = {}) {
  const state = { adminUsers: [] };
  let url = `/tournaments/cup${hash}`, listener, resolveUsers;
  const renders = [];
  const button = { dataset: { tournamentInfoTab: tab } };
  const document = { querySelectorAll: () => [button], querySelector: () => null };
  const noOp = () => {};
  const wire = new Function("state", "document", "window", "onLive", "wireLeaderboardProfiles", "wireTournamentRoundTabs", "wireTeamRosterDetailsControls",
    "wireTeamTournamentStandingsTabs", "wireTournamentDataTables", "navigationUrl", "pushAppLocation", "tournamentPublicPath", "canManageTournamentParticipants",
    "adminUi", "isCurrentPublicTournamentRoute", "renderPublicTournament", "renderTournaments", "rememberNavigationContext", "setMessage", "wireTournamentResultsControls",
    `${extract("wireTournamentTabButtons")}; ${extract("wireTournamentInfoControls")}; return wireTournamentInfoControls;`
  )(state, document, { location: { hash } }, (_button, _event, handler) => { listener = handler; }, noOp, noOp, noOp, noOp, noOp,
    () => url, next => { url = next; }, slug => `/tournaments/${slug}`, () => true,
    () => ({ loadAdminUsers: () => new Promise(done => { resolveUsers = done; }) }),
    slug => url === `/tournaments/${slug}`, data => renders.push(data.tournament.slug), noOp, noOp, error => assert.fail(error),noOp);
  wire({ tournament: { id: 6, slug: "cup", participantMode: "individual" } }, { admin: true, publicRoute: true });
  return { click: () => listener(), resolve: () => resolveUsers(), navigate: next => { url = next; }, renders };
}

test("leaving a direct settings URL renders the selected common tab", async () => {
  const h = tabHarness({ hash: "#settings", tab: "matches" });
  await h.click();
  assert.deepEqual(h.renders, ["cup"]);
});

test("a pending Participants tab cannot redraw a tournament after navigation", async () => {
  const h = tabHarness();
  const pending = h.click();
  h.navigate("/tournaments/other");
  h.resolve();
  await pending;
  assert.deepEqual(h.renders, []);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The client is two files now: admin.js is fetched on demand and shares app.js
// global scope, so anything extracted by name may live in either.
const appSource = ["app.js", "admin.js"]
  .map((file) => fs.readFileSync(path.join(__dirname, "../../public", file), "utf8"))
  .join("\n");

// Bounded by the first line that closes at column zero rather than by the name
// of whatever follows: admin functions now live in admin.js, so neighbours are
// no longer a stable anchor.
function functionSource(name) {
  return appSource.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\r?\\n\\}`))?.[0];
}

const actionButtonsSource = functionSource("adminTournamentActionButtons");
const tabContentSource = functionSource("tournamentInfoTabContent");
const runActionSource = functionSource("runAdminTournamentAction");

test("registration closed offers preparation first and a separate start only after saving a round", () => {
  const render = new Function("t", `${actionButtonsSource}; return adminTournamentActionButtons;`)((key) => key);
  for (const participantMode of ["individual", "team"]) {
    const data = { tournament: { status: "registration_closed", participantMode }, rounds: [] };
    const initial = render(data);
    assert.match(initial, /admin.tournament.action.generateFirst/);
    assert.doesNotMatch(initial, /data-admin-tournament-action="start"/);
    data.rounds = [{ roundNumber: 1, status: "not_ready" }];
    const prepared = render(data);
    assert.match(prepared, participantMode === "team" ? /admin.round.editTables/ : /admin.tournament.action.editFirst/);
    if (participantMode === "team") assert.match(prepared, /data-admin-tournament-action="rollback-latest-round"/);
    assert.match(prepared, /data-admin-tournament-action="start"/);
  }
});

test("preparation only opens setup, while Start explicitly activates either tournament mode", async () => {
  for (const participantMode of ["individual", "team"]) {
    const state = { adminTournamentDetail: { tournament: { id: 17, participantMode } } };
    const requests = [];
    const opened = [];
    const confirmations = [];
    const run = new Function("state", "api", "openNextRoundSetupModal", "confirmAction", "t", "loadTournamentAdmin", "renderTournaments", "setMessage",
      `${runActionSource}; return runAdminTournamentAction;`)(
      state, async (...args) => requests.push(args), async (id) => opened.push(id),
      async (options) => { confirmations.push(options); return true; }, (key) => key,
      async () => {}, () => {}, (message) => assert.fail(message)
    );
    await run("generate-next-round");
    assert.deepEqual(opened, [17]);
    assert.deepEqual(requests, []);
    assert.deepEqual(confirmations, []);
    await run("start");
    assert.equal(confirmations.length, 1);
    assert.deepEqual(requests, [["/api/admin/tournaments/17/start", { method: "POST" }]]);
    assert.equal(state.tournamentInfoTab, "matches");
  }
});

test("start notification opens freshly loaded tournament matches", async () => {
  const state = { notificationsOpen: true };
  const opened = [];
  const open = new Function("state", "renderNotificationControl", "navigateToPublicTournament",
    `${functionSource("openNotificationItem")}; return openNotificationItem;`)(state, () => {}, (...args) => opened.push(args));
  await open({ type: "tournament_started", tournament: { slug: "cup" } });
  assert.equal(state.notificationsOpen, false);
  assert.deepEqual(opened, [["cup", { tab: "matches", force: true }]]);
  const rendered = [];
  const navigate = new Function("state", "window", "tournamentPublicPath", "renderPublicTournamentRoute", "pushAppLocation",
    `${functionSource("navigateToPublicTournament")}; return navigateToPublicTournament;`)(
    state, { history: { pushState() {} } }, (slug) => `/tournaments/${slug}`, (...args) => rendered.push(args), () => {}
  );
  navigate(...opened[0]);
  assert.equal(state.tournamentInfoTab, "matches");
  assert.deepEqual(rendered, [["cup", { tab: "matches", force: true }]]);
});

test("completed rounds replace Generate next round with Close tournament", () => {
  assert.ok(actionButtonsSource, "could not find adminTournamentActionButtons in public/app.js");
  const translatedKeys = [];
  const factory = new Function(
    "tournamentFinalStandingsReady",
    "rollbackRoundActionState",
    "nextRoundActionState",
    "escapeHtml",
    "t",
    `${actionButtonsSource}; return adminTournamentActionButtons;`
  );
  const renderButtons = factory(
    () => true,
    () => ({ canRollback: false }),
    () => ({ canGenerate: true, message: "" }),
    String,
    (key) => {
      translatedKeys.push(key);
      return key;
    }
  );

  const markup = renderButtons({
    tournament: { status: "in_progress" },
    rounds: [{ matches: [{ status: "completed" }] }]
  });

  assert.match(markup, /data-admin-tournament-action="close-tournament"/);
  assert.doesNotMatch(markup, /generate-next-round/);
  assert.deepEqual(translatedKeys, ["admin.tournament.action.closeTournament", "admin.tournament.action.recalculateStandings"]);
});

test("the admin standings tab reuses the existing standings table only", () => {
  assert.ok(tabContentSource, "could not find tournamentInfoTabContent in public/app.js");
  const factory = new Function(
    "adminTournamentSettingsContent",
    "adminTournamentParticipantsContent",
    "adminTournamentTablesContent",
    "tournamentStatsContent",
    "tournamentMatchesContent",
    "publicStandingsTable",
    `${tabContentSource}; return tournamentInfoTabContent;`
  );
  const renderTab = factory(
    () => "settings",
    () => "participants",
    () => "tables",
    () => "stats",
    () => "matches",
    () => "shared standings"
  );

  assert.equal(renderTab("standings", {}, { admin: true }), "shared standings");
  assert.doesNotMatch(tabContentSource, /FinalStandings|final-standings/i);
});

test("Close tournament confirms and publishes the displayed standings order", async () => {
  assert.ok(runActionSource, "could not find runAdminTournamentAction in public/app.js");
  const state = {
    adminTournamentDetail: {
      tournament: { id: 17 },
      standings: [{ participantId: 4 }, { participantId: 9 }]
    }
  };
  const confirmations = [];
  const requests = [];
  const factory = new Function(
    "state",
    "confirmAction",
    "confirmDelete",
    "t",
    "api",
    "openNextRoundSetupModal",
    "rollbackRoundActionState",
    "loadTournamentAdmin",
    "renderTournaments",
    "openAdminTournamentList",
    "setMessage",
    `${runActionSource}; return runAdminTournamentAction;`
  );
  const runAction = factory(
    state,
    async ({ message }) => { confirmations.push(message); return true; },
    async (message) => { confirmations.push(message); return true; },
    (key) => key,
    async (requestPath, options) => { requests.push([requestPath, options]); },
    async () => {},
    () => ({ roundNumber: 1 }),
    async () => {},
    () => {},
    async () => {},
    () => {}
  );

  await runAction("close-tournament");

  assert.deepEqual(confirmations, ["dialog.admin.closeTournament"]);
  assert.deepEqual(requests, [[
    "/api/admin/tournaments/17/standings/publish",
    { method: "POST", body: { participantIds: [4, 9] } }
  ]]);
});

test("table editing remains available after results while Undo round is disabled", () => {
  const render = new Function("t", "tournamentFinalStandingsReady", "nextRoundActionState", "escapeHtml",
    functionSource("rollbackRoundActionState") + ";" + actionButtonsSource + "; return adminTournamentActionButtons;"
  )(key => key, () => false, () => ({ canGenerate: false, message: "" }), String);
  const html = render({ tournament: { status: "in_progress", participantMode: "team" },
    rounds: [{ id: 9, roundNumber: 1, status: "active", matches: [{ phase: "in_progress", games: [{ game: { status: "pending_confirmation" } }] }] }] });
  assert.match(html, /data-admin-tournament-action="edit-round-tables">/);
  assert.match(html, /data-admin-tournament-action="rollback-latest-round" disabled/);
  assert.doesNotMatch(html, /editFirstStarted/);
});

test("Edit only opens table settings; Undo sends DELETE only after confirmation and opens the full draft", async () => {
  const data = { tournament: { id: 17, participantMode: "team", status: "in_progress" }, rounds: [{ id: 4, roundNumber: 1, status: "active", matches: [] }] };
  const calls = [], opened = [];
  let accepted = false, confirms = 0;
  const run = new Function("state", "api", "renderRoundSetupModal", "openNextRoundSetupModal", "confirmAction", "t", "loadTournamentAdmin", "renderTournaments", "setMessage",
    functionSource("rollbackRoundActionState") + ";" + runActionSource + "; return runAdminTournamentAction;"
  )({ adminTournamentDetail: data }, async (url, options) => { calls.push([url, options]); return { round: data.rounds[0], tables: [] }; },
    preview => opened.push(preview), async id => opened.push({ draft: id }),
    async () => { confirms++; return accepted; }, key => key, async () => {}, () => {}, message => assert.fail(message));
  await run("edit-round-tables");
  assert.equal(confirms, 0);
  assert.deepEqual(calls, [["/api/admin/tournaments/17/rounds/4/tables", undefined]]);
  assert.equal(opened[0].tableOnly, true);
  await run("rollback-latest-round");
  assert.equal(calls.length, 1);
  assert.equal(confirms, 1);
  accepted = true;
  await run("rollback-latest-round");
  assert.deepEqual(calls[1], ["/api/admin/tournaments/17/rounds/latest", { method: "DELETE", body: { roundId: 4 } }]);
  assert.deepEqual(opened[1], { draft: 17 });
});

test("table-only dialog contains no pairing or mission controls and saves through PATCH", async () => {
  let html = "", previewWired, submitHandler;
  const state = { adminTournamentDetail: { tournament: { id: 17, participantMode: "team", venueMode: "tts", format: "swiss" } } };
  const render = new Function("state", "closeRoundSetupModal", "document", "venueModeLabel", "escapeHtml", "t", "teamTableSetupFields", "wireRoundSetupModal",
    functionSource("renderRoundSetupModal") + "; return renderRoundSetupModal;"
  )(state, () => {}, { body: { insertAdjacentHTML: (_position, value) => { html = value; } } }, value => value, String, key => key,
    () => '<input name="teamTableNumber-0"><input name="teamImageData-0">', (_tournament, _tables, preview) => { previewWired = preview; });
  const preview = { tableOnly: true, teamRound: true, round: { id: 4, roundNumber: 1, updatedAt: null,
    matches: [{ rosterAId: 3, rosterBId: 8 }] }, tables: [] };
  render(preview);
  assert.equal(previewWired, preview);
  assert.match(html, /admin.round.tablesTitle/);
  assert.match(html, /teamTableNumber-0/);
  assert.doesNotMatch(html, /rosterAId|rosterBId|roundCritOp|round-setup-add-empty/);

  const calls = [], notices = [], button = { disabled: false }, message = { classList: { add() {} } };
  const form = { elements: {}, querySelector: selector => selector === '[type="submit"]' ? button : null,
    addEventListener: (event, handler) => { if (event === "submit") submitHandler = handler; } };
  for (let index = 0; index < 3; index++) {
    for (const [name, value] of Object.entries({ teamTableId: index + 10, teamTableNumber: index + 50, teamKillzone: ["Volkus", "Gallowdark", "Octarius"][index], teamLayout: 6 })) {
      form.elements[name + "-" + index] = { value: String(value) };
    }
  }
  const document = { querySelector: selector => selector === "[data-round-setup-form]" ? form : selector === "[data-round-setup-message]" ? message : null,
    querySelectorAll: () => [] };
  const wire = new Function("document", "wireTeamTableImages", "closeRoundSetupModal", "updateRoundSetupPlayerSelects", "updateRoundSetupTableDeployment", "api", "adminUi", "state", "renderTournaments", "setMessage", "t",
    functionSource("teamTableSetupPayload") + ";" + functionSource("wireRoundSetupModal") + "; return wireRoundSetupModal;"
  )(document, () => {}, () => {}, () => {}, () => {}, async (url, options) => { assert.equal(button.disabled, true); calls.push([url, options]); },
    () => ({ loadTournamentAdmin: async () => {} }), state, () => {}, text => notices.push(text), key => key);
  wire(state.adminTournamentDetail.tournament, [], preview);
  await submitHandler({ preventDefault() {}, currentTarget: form });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/admin/tournaments/17/rounds/4/tables");
  assert.equal(calls[0][1].method, "PATCH");
  assert.deepEqual(Object.keys(calls[0][1].body), ["tables", "expectedUpdatedAt"]);
  assert.deepEqual(calls[0][1].body.tables.map(table => [table.id, table.tableNumber]), [[10, 50], [11, 51], [12, 52]]);
  assert.equal(button.disabled, false);
  assert.deepEqual(notices, ["admin.round.tablesSaved"]);
});

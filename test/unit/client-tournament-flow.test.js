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
  assert.deepEqual(translatedKeys, ["admin.tournament.action.closeTournament"]);
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
    "loadAdminTournamentPreview",
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

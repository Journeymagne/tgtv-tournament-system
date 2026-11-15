const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = ["app.js", "admin.js"].map(file => fs.readFileSync(path.join(__dirname, "../../public", file), "utf8")).join("\n");
function sourceOf(name) {
  const body = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, name);
  return body;
}

test("solo Swiss and elimination lists offer direct review of pending results and retain editing", () => {
  const render = new Function("state", "t", "escapeHtml", "publicMatchScore", "matchSetupMeta", "tournamentParticipantProfileLink", "tournamentMatchStatusLabel", "pairingWarningsMarkup", "individualPairingWarnings", "teamTableImageMarkup",
    `${sourceOf("adminTournamentMatchMarkup")}; return adminTournamentMatchMarkup;`
  )({}, key => key, String, () => "13:12", () => "", player => player?.displayName || "", String, () => "", () => [], () => "");
  for (const format of ["swiss", "single_elimination"]) {
    const data = { tournament: { id: 6, format, status: "in_progress" }, rounds: [] };
    const match = { id: 9, participantA: { displayName: "Alpha" }, participantB: { displayName: "Beta" }, status: "pending_confirmation", pendingResult: { result: { scores: {} } } };
    const html = render(match, data);
    assert.match(html, /class="primary-button" data-admin-tournament-match-review="9">play.action.reviewResult/);
    assert.match(html, /data-admin-tournament-match-result="9"/);
    for (const status of ["active", "completed", "cancelled"]) assert.doesNotMatch(render({ ...match, status }, data), /data-admin-tournament-match-review/);
    assert.doesNotMatch(render({ ...match, isBye: true }, data), /data-admin-tournament-match-review/);
    assert.doesNotMatch(render({ ...match, pendingResult: null }, data), /data-admin-tournament-match-review/);
    assert.doesNotMatch(render(match, { ...data, tournament: { ...data.tournament, status: "completed" } }), /data-admin-tournament-match-review/);
  }
});

function reviewHarness({ deferred = false, status = "pending_confirmation", canReview = true } = {}) {
  const state = { me: { id: 2, managedTournamentIds: [6] }, administrationContext: false };
  let listener, resolve, url = "/tournaments/cup";
  const reviewed = [], forms = [];
  const button = { dataset: { teamGameReview: "11", teamGameAdminReview: "1" } };
  const game = { id: 11, tournament: { id: 6 }, playerIds: [2, 3], status,
    pendingResult: status === "pending_confirmation" ? { result: { scores: {} } } : null, resultPermissions: { canReview } };
  const wire = new Function("state", "onLive", "navigationUrl", "stopTeamPairingPoll", "loadGame", "renderResultReview", "renderResultForm", "setMessage", "t", "getKnownGame", "normalizedGameDetailId", "syncAppHash", "renderShell",
    `${require("../helpers/client-access-source")}; ${sourceOf("teamGameResultPermissions")}; ${sourceOf("openGameDetail")}; ${sourceOf("wireTeamGameResultButtons")}; return wireTeamGameResultButtons;`
  )(state, (_button, _event, handler) => { listener = handler; }, () => url, () => {},
    () => deferred ? new Promise(done => { resolve = done; }) : Promise.resolve(game),
    id => reviewed.push({ id, admin: state.administrationContext }), (...args) => forms.push(args), error => assert.fail(error), key => key,
    () => game, Number, () => {}, () => {});
  wire({ querySelectorAll: () => [button] });
  return { state, click: () => listener(), reviewed, forms, navigate: () => { url = "/tournament#/profile"; }, resolve: () => resolve(game) };
}

test("a manager's preview button opens review directly even when the manager is a player", async () => {
  const h = reviewHarness();
  await h.click();
  assert.deepEqual(h.reviewed, [{ id: 11, admin: true }]);
  assert.deepEqual(h.forms, []);
});

test("a delayed preview review request cannot open after leaving the tournament", async () => {
  const h = reviewHarness({ deferred: true });
  const pending = h.click();
  h.navigate();
  h.resolve();
  await pending;
  assert.deepEqual(h.reviewed, []);
});

test("results resolved during loading open details for the selected game instead of a stale review", async () => {
  for (const options of [{ status: "completed" }, { status: "open" }, { canReview: false }]) {
    const h = reviewHarness(options);
    await h.click();
    assert.deepEqual(h.reviewed, []);
    assert.equal(h.state.view, "gameDetail");
    assert.equal(h.state.selectedGameId, 11);
    assert.equal(h.state.gameDetailMode, "");
  }
});

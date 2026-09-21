const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { liveHarness } = require("../helpers/live-refresh");
const { on, blocked } = require("../../public/live-refresh");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const sourceOf = (name) => source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`, "m"))[0];

test("unchanged responses leave the DOM alone; changed data renders once", async () => {
  const h = liveHarness();
  h.response = 1;
  await h.controller.run();
  assert.deepEqual(h.renders, []);
  h.response = 2;
  await h.controller.run();
  await h.controller.run();
  assert.deepEqual(h.renders, [2]);
});

test("selection/editing defers the newest response and applies it after release", async () => {
  const h = liveHarness();
  h.blocked = true;
  await h.controller.run();
  h.response = 3;
  await h.controller.run();
  assert.deepEqual(h.renders, []);
  h.blocked = false;
  h.controller.flush();
  h.controller.flush();
  assert.deepEqual(h.renders, [3]);
});

test("a deferred final result is applied before polling stops", async () => {
  const h = liveHarness({ apply: () => { h.current = null; } });
  h.blocked = true;
  await h.controller.run();
  assert.equal(h.timers.size, 1);
  h.blocked = false;
  h.controller.flush();
  assert.deepEqual(h.renders, [2]);
  assert.equal(h.timers.size, 0);
});

test("hiding the tab cancels polling and returning requests fresh data", async () => {
  const h = liveHarness();
  h.controller.schedule();
  h.document.visibilityState = "hidden";
  h.events.visibilitychange();
  assert.equal(h.timers.size, 0);
  await h.controller.run();
  assert.equal(h.requests.length, 0);
  h.document.visibilityState = "visible";
  h.events.visibilitychange();
  assert.equal([...h.timers.values()][0].delay, 0);
  await h.tick();
  assert.deepEqual(h.renders, [2]);
});

test("hidden in-flight responses and responses from an old page are discarded", async () => {
  for (const leave of [(h) => { h.current = null; }, (h) => { h.current = { ...h.current, anchor: {} }; },
    (h) => { h.document.visibilityState = "hidden"; h.events.visibilitychange(); }]) {
    let resolve;
    const h = liveHarness({ fetch: () => new Promise((done) => { resolve = done; }) });
    const request = h.controller.run();
    leave(h);
    resolve(2);
    await request;
    assert.deepEqual(h.renders, []);
  }
});

test("writes invalidate stale and deferred responses; requests never overlap", async () => {
  let resolve;
  const h = liveHarness({ fetch: () => new Promise((done) => { resolve = done; }) });
  const request = h.controller.run();
  await h.controller.run();
  assert.equal(h.requests.length, 1);
  h.controller.startWrite();
  h.controller.endWrite();
  resolve(2);
  await request;
  assert.deepEqual(h.renders, []);
  const deferred = liveHarness();
  deferred.blocked = true;
  await deferred.controller.run();
  deferred.controller.startWrite();
  deferred.controller.endWrite();
  deferred.blocked = false;
  deferred.controller.flush();
  assert.deepEqual(deferred.renders, []);
});

test("failed requests keep the screen and retry at its normal interval", async () => {
  const h = liveHarness({ fetch: () => { throw Error("offline"); } });
  await h.controller.run();
  assert.deepEqual(h.renders, []);
  assert.equal([...h.timers.values()][0].delay, 5000);
});

test("rebinding a retained button uses exactly one handler with current data", () => {
  const button = new EventTarget();
  const calls = [];
  on(button, "click", () => calls.push("old"));
  on(button, "click", () => calls.push("new"));
  button.dispatchEvent(new Event("click"));
  assert.deepEqual(calls, ["new"]);
});

test("selection across the updated region and active inputs block updates", () => {
  const element = { contains: () => true, querySelector: () => null };
  const doc = { querySelector: () => null, activeElement: null, defaultView: { getSelection: () => ({ isCollapsed: false, rangeCount: 1, getRangeAt: () => ({ intersectsNode: () => true }) }) } };
  assert.equal(blocked(element, doc), true);
  doc.defaultView.getSelection = () => ({ isCollapsed: true });
  doc.activeElement = { matches: () => true };
  assert.equal(blocked(element, doc), true);
  doc.activeElement = null;
  assert.equal(blocked(element, doc), false);
});

function policy(overrides = {}) {
  const state = { me: { id: 1, isAdmin: false }, view: "play", tournamentInfoTab: "matches", ...overrides };
  const root = { querySelector: () => root };
  let slug = "";
  let game = { id: 7, status: "open" };
  const target = new Function("state", "document", "app", "tournamentSlugFromLocation", "playerTeamSlugFromLocation", "getKnownGame", "tournamentMatchIdFromGameId",
    `${sourceOf("liveTournamentInterval")}; ${sourceOf("liveRefreshTarget")}; return liveRefreshTarget;`)(
    state, { querySelector: () => root }, root, () => slug, () => "", () => game, () => 0);
  return { state, root, target, slug: (value) => { slug = value; }, game: (value) => { game = value; } };
}

test("both tournament formats poll before the first round and between rounds until finished", () => {
  for (const participantMode of ["individual", "team"]) {
    const h = policy();
    h.slug("cup");
    for (const teamMatches of [[], [{ phase: "completed" }]]) {
      h.state.publicTournamentDetail = { tournament: { participantMode, status: "in_progress" }, teamMatches };
      for (const [tab, interval] of [["matches", 5000], ["standings", 15000], ["stats", 45000]]) {
        h.state.tournamentInfoTab = tab;
        assert.equal(h.target().interval, interval);
      }
    }
    for (const status of ["draft", "registration_open", "registration_closed", "completed", "cancelled"]) {
      h.state.publicTournamentDetail.tournament.status = status;
      assert.equal(h.target(), null);
    }
  }
});

test("anonymous pairing uses 5s during choices, 10s during games, and stops on completion", () => {
  const h = policy({ me: null, view: "teamPairing", selectedTeamMatchId: 7, teamPairingDetail: { tournament: { status: "in_progress" }, teamMatch: { phase: "shield_selection" } } });
  assert.equal(h.target().interval, 5000);
  h.state.teamPairingDetail.teamMatch.phase = "in_progress";
  assert.equal(h.target().interval, 10000);
  h.state.teamPairingDetail.teamMatch.phase = "completed";
  assert.equal(h.target(), null);
});

test("my games, game status and admin live views poll; editing and static views do not", () => {
  const h = policy();
  assert.equal(h.target().interval, 15000);
  h.state.view = "gameDetail";
  h.state.selectedGameId = 7;
  assert.equal(h.target().interval, 10000);
  h.game({ id: 7, status: "completed" });
  assert.equal(h.target(), null);
  h.state.me.isAdmin = true;
  h.state.view = "games";
  h.state.gamesTab = "sessions";
  assert.equal(h.target().interval, 15000);
  h.state.gamesTab = "history";
  assert.equal(h.target(), null);
  Object.assign(h.state, { view: "tournaments", tournamentsTab: "admin", adminTournamentMode: "detail", selectedTournamentId: 1,
    adminTournamentDetail: { tournament: { status: "in_progress" } } });
  assert.equal(h.target().interval, 5000);
  for (const tab of ["settings", "participants", "tables"]) {
    h.state.tournamentInfoTab = tab;
    assert.equal(h.target(), null);
  }
  for (const view of ["top", "profile", "player", "teams", "statistics", "challenge", "documentation", "feedback"]) {
    h.state.view = view;
    assert.equal(h.target(), null);
  }
  h.state.view = "play";
  h.root.querySelector = () => null;
  assert.equal(h.target(), null);
});

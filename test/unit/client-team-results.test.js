const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function sourceOf(name) {
  const source = appSource.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`, "m"))?.[0];
  assert.ok(source, `could not find ${name} in public/app.js`);
  return source;
}

function captainControls(user, overrides = {}) {
  const roster = (id, captainUserId) => ({ id, name: `Roster ${id}`, captainUserId,
    members: [1, 2, 3].map((n) => ({ id: id * 10 + n, displayNameSnapshot: `Player ${id}-${n}`, factionSnapshot: "Kasrkin" })) });
  const match = { id: 7, tournamentId: 4, pairingVersion: 2, phase: "awaiting_roll", rollRound: 1,
    rosterA: roster(1, 101), rosterB: roster(2, 202), rollHistory: [], missions: [{ critOp: "Orb" }, { critOp: "Loot" }],
    missionBans: [], tableIds: [1, 2, 3], ...overrides };
  const render = new Function("state", "t", "escapeHtml", "teamEnvironmentStep", "tableLabel", "teamTournamentTables",
    ["teamCaptainPairingControl", "teamPairingControlForSide", "teamMemberChoiceForm", "teamEnvironmentChoiceForm"].map(sourceOf).join("\n") + "; return teamCaptainPairingControl;"
  )({ me: user }, (key, values) => values?.name || key, String, (m) => m.nextAction, (table) => `Table ${table.tableNumber}`, () => []);
  return render(match, { status: "in_progress" });
}

test("non-captain admin sees both sides; captains and spectators cannot act for the other side", () => {
  const admin = captainControls({ id: 999, isAdmin: true });
  assert.match(admin, /data-admin-captain-side="a"/);
  assert.match(admin, /data-admin-captain-side="b"/);
  assert.equal((admin.match(/data-team-pair-action="roll"/g) || []).length, 2);
  const captain = captainControls({ id: 101, isAdmin: false });
  assert.match(captain, /data-side="a"/);
  assert.doesNotMatch(captain, /data-side="b"|data-admin-captain-side/);
  assert.equal(captainControls({ id: 999, isAdmin: false }), "");
  assert.equal(captainControls(null), "");
});

test("admin controls carry the chosen side through every phase and keep turn order", () => {
  const user = { id: 999, isAdmin: true };
  const rolled = captainControls(user, { rollHistory: [{ a: 4, b: null }] });
  assert.equal((rolled.match(/data-team-pair-action="roll"/g) || []).length, 1);
  assert.match(rolled, /data-side="b"/);
  const ban = captainControls(user, { phase: "mission_ban", nextAction: { kind: "ban", side: "b" } });
  assert.match(ban, /data-team-pairing-form="ban"[^>]*data-side="b"/);
  assert.doesNotMatch(ban, /data-team-pairing-form="ban"[^>]*data-side="a"/);
  const shield = captainControls(user, { phase: "shield_selection", shieldAMemberId: 12, shieldAConfirmed: true });
  assert.equal((shield.match(/data-team-pairing-form="shield"/g) || []).length, 2);
  assert.match(shield, /value="12" selected/);
  const sword = captainControls(user, { phase: "sword_selection", shieldAMemberId: 11, shieldBMemberId: 21 });
  assert.equal((sword.match(/data-team-pairing-form="sword"/g) || []).length, 2);
  assert.doesNotMatch(sword, /option value="(11|21)"/);
  for (const kind of ["table", "mission"]) {
    const html = captainControls(user, { phase: "environment_selection", environment: { step: 2, assignments: [] }, nextAction: { kind, side: "a", slot: 1 } });
    assert.match(html, /data-team-pairing-form="environment"[^>]*data-side="a"[^>]*data-step="2"/);
    assert.doesNotMatch(html, /data-team-pairing-form="environment"[^>]*data-side="b"/);
  }
});

test("admin polling preserves independent Shield drafts for both sides", () => {
  const make = (side, value) => {
    const select = { name: "memberId", value, options: ["11", "12", "21", "22"].map(value => ({ value })) };
    return { dataset: { teamMatchId: "7", teamPairingForm: "shield", side }, select,
      querySelectorAll: () => [select], elements: { namedItem: () => select } };
  };
  let forms = [make("a", "12"), make("b", "22")];
  const preserve = new Function("document", `${sourceOf("preserveTeamPairingDrafts")}; return preserveTeamPairingDrafts;`)({ querySelectorAll: () => forms });
  const restore = preserve();
  forms = [make("a", "11"), make("b", "21")];
  restore();
  assert.deepEqual(forms.map(form => form.select.value), ["12", "22"]);
});

test("anonymous pairing shows finished VP/GP and distinguishes pending and unplayed games", () => {
  const render = new Function("state", "t", "escapeHtml", "teamMissionLabel", "teamRosterMemberName",
    `${sourceOf("teamMatchGamesMarkup")}; return teamMatchGamesMarkup;`
  )({ me: null }, (key, values) => key === "teams.results.progress"
    ? `${values.count}/${values.total}: ${values.a}:${values.b}` : key, String, () => "Volkus", () => "Player");
  const match = { progress: { completed: 1, total: 3, gpA: 14, gpB: 6 }, games: [
    { slot: 1, gamePointsA: 14, gamePointsB: 6, game: { status: "completed", playerIds: [11, 21], result: { scores: { 11: { total: 18 }, 21: { total: 14 } } } } },
    { slot: 2, game: { status: "pending_confirmation", playerIds: [12, 22], pendingResult: { result: { scores: { 12: { total: 21 }, 22: { total: 0 } } } } } },
    { slot: 3, game: { status: "open", playerIds: [13, 23] } }
  ] };
  const html = render(match);
  assert.match(html, /1\/3: 14:6/);
  assert.match(html, /18:14 VP · 14:6 GP/);
  for (const status of ["completed", "pending_confirmation", "open"]) assert.match(html, new RegExp(`data-team-game-status="${status}"`));
  assert.equal((html.match(/teams.results.notCounted/g) || []).length, 2);
  assert.doesNotMatch(html, /21:0 VP|data-team-tournament-game/);
  assert.equal(render({ games: [] }), "");
});

test("standalone live-result polling works anonymously and stops after leaving the pairing URL", async () => {
  const state = { me: null, view: "teamPairing", selectedTeamMatchId: 7 };
  let segments = ["team-matches", "7"];
  let callback;
  let loads = 0;
  let renders = 0;
  const schedule = new Function("state", "hashSegments", "window", "stopTeamPairingPoll", "teamPairingSubmissionPending",
    "loadTeamPairing", "preserveTeamPairingDrafts", "renderShell", "renderTeamPairing", "setMessage",
    `let teamPairingPollTimer; ${sourceOf("isCurrentTeamPairingRoute")}; ${sourceOf("scheduleTeamPairingScreenPoll")}; return scheduleTeamPairingScreenPoll;`
  )(state, () => segments, { setTimeout: (fn, delay) => { assert.equal(delay, 5000); callback = fn; return 1; } },
    () => {}, () => false, async () => { loads += 1; return {}; }, () => () => {},
    () => assert.fail("anonymous visitor has no signed-in shell"), () => { renders += 1; }, (message) => assert.fail(message));
  schedule(7);
  await callback();
  assert.equal(loads, 1);
  assert.equal(renders, 1);
  schedule(7);
  segments = ["tournaments"];
  await callback();
  assert.equal(loads, 1);
  assert.equal(renders, 1);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function sourceOf(name) {
  const source = appSource.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`, "m"))?.[0];
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
    ["teamCaptainPairingControl", "teamPairingControlForSide", "teamMemberChoiceForm", "teamEnvironmentChoiceForm", "teamPairingMemberLabel", "teamRosterMemberLabel", "teamPairingMatchupLabel"].map(sourceOf).join("\n") + "; return teamCaptainPairingControl;"
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
  const synced = [];
  const preserve = new Function("document", "syncUserSelect", `${sourceOf("preserveTeamPairingDrafts")}; return preserveTeamPairingDrafts;`)({ querySelectorAll: (selector) => selector === "[data-team-pairing-form]" ? forms : [] }, (select) => synced.push(select.value));
  const restore = preserve();
  forms = [make("a", "11"), make("b", "21")];
  restore();
  assert.deepEqual(synced, ["12", "22"]);
  assert.deepEqual(forms.map(form => form.select.value), ["12", "22"]);
});

test("anonymous pairing shows finished VP/GP and distinguishes pending and unplayed games", () => {
  const render = new Function("state", "t", "escapeHtml", "teamMissionLabel", "teamRosterMemberLabel",
    `${sourceOf("teamMatchProgressMarkup")}\n${sourceOf("teamMatchGamesMarkup")}; return teamMatchGamesMarkup;`
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

test("each game keeps one card as pairings, partial environment choices and results arrive", () => {
  const messages = require("../../public/i18n/en.js");
  const render = new Function("state", "t", "escapeHtml", "teamTournamentTables",
    ["teamMatchProgressMarkup", "teamMatchGamesMarkup", "teamMissionLabel", "tableLabel", "teamRosterMemberLabel", "teamPairingMemberLabel"].map(sourceOf).join("\n") + "; return teamMatchGamesMarkup;"
  )({ me: { id: 1 } }, (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]), String,
    () => assert.fail("use the match's table snapshot"));
  const match = {
    rosterA: { members: [{ id: 11, displayNameSnapshot: "Alice", factionSnapshot: "Novitiates" }, { id: 12, displayNameSnapshot: "Bob", factionSnapshot: "Kasrkin" }] },
    rosterB: { members: [{ id: 21, displayNameSnapshot: "Carol", factionSnapshot: "Sanctifiers" }, { id: 22, displayNameSnapshot: "Dave", factionSnapshot: "Kommandos" }] },
    pairings: [{ slot: 2, rosterAMemberId: 12, rosterBMemberId: 22 }, { slot: 1, rosterAMemberId: 11, rosterBMemberId: 21, shieldOwner: "a" }],
    tables: [{ id: 7, tableNumber: 2, killzone: "Volkus", deployment: 6 }],
    environment: { assignments: [{ slot: "1", tableId: 7 }] }
  };
  let html = render(match);
  assert.equal((html.match(/class="team-match-game"/g) || []).length, 2);
  assert.match(html, /Game 1 · Alice \(Novitiates\) vs Carol \(Sanctifiers\)/);
  assert.match(html, /shield A · Table 2 \/ Volkus \/ Deployment 6/);
  assert.match(html, /Game 2 · Bob \(Kasrkin\) vs Dave \(Kommandos\)/);
  assert.doesNotMatch(html, /data-team-tournament-game|team-match-progress|data-team-game-status/);

  match.environment.assignments.unshift({ slot: 2, mission: { critOp: "Loot", killzone: "Gallowdark", layout: 4 } });
  match.environment.assignments[1].mission = { critOp: "Orb", killzone: "Volkus", layout: 6 };
  match.games = [
    { slot: 2, rosterAMemberId: 12, rosterBMemberId: 22, mission: match.environment.assignments[0].mission, game: { id: 102, status: "open" } },
    { slot: 1, rosterAMemberId: 11, rosterBMemberId: 21, mission: match.environment.assignments[1].mission, tableId: 7,
      gamePointsA: 20, gamePointsB: 0, game: { id: 101, status: "completed", playerIds: [1, 2], result: { scores: { 1: { total: 20 }, 2: { total: 6 } } } } }
  ];
  html = render(match);
  const cards = html.split('<div class="team-match-game"').slice(1);
  assert.equal(cards.length, 2);
  assert.match(cards[0], /data-team-game-slot="1"/);
  assert.match(cards[0], /shield A · Orb · Volkus · Layout 6 · Table 2/);
  assert.match(cards[0], /20:6 VP · 20:0 GP/);
  assert.match(cards[0], /data-team-tournament-game="101"/);
  assert.doesNotMatch(cards[0], /Loot|Dave/);
  assert.match(cards[1], /Loot · Gallowdark · Layout 4/);
  assert.match(cards[1], /data-team-tournament-game="102"/);
  assert.doesNotMatch(cards[1], /shield A|Orb|20:6 VP/);
  for (const phase of ["in_progress", "completed"]) {
    const finished = render({ ...match, phase });
    assert.doesNotMatch(finished, /shield A/);
    assert.match(finished, /Orb · Volkus · Layout 6 · Table 2/);
    assert.match(finished, /20:6 VP · 20:0 GP/);
  }
});

test("pairing choices collapse only after pairing ends, while games and undo remain visible", () => {
  const render = new Function("state", "t", "escapeHtml", `
    const teamRosterLabel = roster => roster.name;
    const teamMatchPhaseLabel = phase => phase;
    const teamRollHistoryMarkup = () => 'ROLL HISTORY';
    const teamPairingSideMarkup = (_match, side) => 'SHIELD AND SWORD ' + side;
    const teamMissionPoolMarkup = () => 'CRIT OPS POOL';
    const teamMatchGamesMarkup = () => 'PERSONAL GAMES';
    const teamCaptainPairingControl = () => '';
    ${sourceOf("teamMatchProgressMarkup")}
    ${sourceOf("teamPairingSelectionsMarkup")}
    ${sourceOf("teamMatchResultMarkup")}
    ${sourceOf("teamTournamentMatchMarkup")}
    return teamTournamentMatchMarkup;
  `)({ me: null }, key => key, String);
  const match = { id: 7, rosterA: { name: 'A' }, rosterB: { name: 'B' }, canUndo: true, pairingRevision: 10 };
  for (const phase of ["awaiting_roll", "mission_ban", "shield_selection", "sword_selection", "environment_selection"]) {
    const html = render({ ...match, phase }, { status: "in_progress" });
    assert.doesNotMatch(html, /<details/);
    assert.match(html, /ROLL HISTORY/);
    assert.match(html, /CRIT OPS POOL/);
  }
  for (const phase of ["in_progress", "completed"]) {
    const html = render({ ...match, phase }, { status: "in_progress" });
    assert.match(html, /<details class="team-pairing-details" data-team-pairing-details="7">/);
    assert.match(html, /<summary>teams.pairing.details<\/summary>ROLL HISTORY/);
    assert.match(html, /CRIT OPS POOL<\/details>PERSONAL GAMES/);
    assert.match(html.slice(html.indexOf('</details>')), /data-team-match-undo="7"/);
    assert.doesNotMatch(html, new RegExp(`<div class="row-meta">${phase}`));
  }
});

test("team result banners use awarded TTP, including draws with unequal GP, and wait for completion", () => {
  const messages = require("../../public/i18n/en.js");
  const render = new Function("t", "escapeHtml", `${sourceOf("teamMatchResultMarkup")}; return teamMatchResultMarkup;`)(
    (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]),
    value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  );
  const match = { phase: "completed", rosterA: { name: "Ash <1>" }, rosterB: { name: "Silent 1" },
    teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 40, teamGamePointsB: 20 };
  assert.match(render(match), /Winner: Ash &lt;1&gt;/);
  assert.match(render(match), /2:0 TTP · 40:20 GP/);
  assert.match(render({ ...match, teamTournamentPointsA: 0, teamTournamentPointsB: 2, teamGamePointsA: 20, teamGamePointsB: 40 }), /Winner: Silent 1/);
  for (const gpA of [28, 30, 32]) {
    const draw = render({ ...match, teamTournamentPointsA: 1, teamTournamentPointsB: 1, teamGamePointsA: gpA, teamGamePointsB: 60 - gpA });
    assert.match(draw, />Draw<\/div>/);
    assert.doesNotMatch(draw, /Winner:/);
  }
  assert.match(render({ ...match, resolution: "forfeit" }), /Winner: Ash &lt;1&gt;/);
  assert.match(render({ ...match, resolution: "bye", rosterB: null }), /Winner: Ash &lt;1&gt;/);
  assert.equal(render({ ...match, phase: "in_progress" }), "");
  assert.equal(render({ ...match, teamTournamentPointsA: null, teamTournamentPointsB: null }), "");
});

test("My Games previews show confirmed game count and GP in the captain's displayed roster order", () => {
  const messages = require("../../public/i18n/en.js");
  const render = new Function("t", "escapeHtml", `${sourceOf("teamMatchPhaseLabel")}\n${sourceOf("teamPairingCard")}; return teamPairingCard;`)(
    (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]), String
  );
  const match = { id: 3, phase: "in_progress", roundNumber: 1, rosterA: { name: "Crimson" }, rosterB: { name: "Solar" },
    tournament: { name: "Cup" }, progress: { completed: 1, total: 3, gpA: 4, gpB: 16 } };
  for (const [captainSide, title, score] of [["a", "Crimson vs Solar", "4:16"], ["b", "Solar vs Crimson", "16:4"]]) {
    const html = render({ ...match, captainSide });
    assert.match(html, new RegExp(title));
    assert.match(html, new RegExp(`Completed 1/3 games · Current GP: ${score}`));
    assert.doesNotMatch(html, /Three games in progress/);
  }
  const preparing = render({ ...match, captainSide: "a", phase: "shield_selection" });
  assert.match(preparing, /Captains choose shields/);
  assert.doesNotMatch(preparing, /Current GP/);
});

test("My Games refreshes only its captain preview and ignores results after navigating away", async () => {
  const state = { me: { id: 10 }, view: "play", teamPairings: [{ id: 3, progress: { completed: 0 } }] };
  const container = { innerHTML: "INITIAL" };
  const timers = [];
  let requests = 0, wires = 0;
  let response = Promise.resolve({ teamPairings: [{ id: 3, progress: { completed: 1, gpA: 4, gpB: 16 } }] });
  const schedule = new Function("state", "document", "window", "api", "wireMyGamesPairings", `
    let myGamesPairingRequestId = 0, teamPairingPollTimer = null;
    const stopTeamPairingPoll = () => {};
    const teamPairingsPanelMarkup = pairings => JSON.stringify(pairings);
    ${sourceOf("scheduleMyGamesPairingPoll")};return scheduleMyGamesPairingPoll;
  `)(state, { visibilityState: "visible", querySelector: selector => { assert.equal(selector, "[data-captain-pairings]"); return container; } },
    { setTimeout: callback => { timers.push(callback); return 1; } },
    path => { assert.equal(path, "/api/me/team-pairings"); requests += 1; return response; }, () => { wires += 1; });
  schedule();
  await timers.shift()();
  assert.equal(state.teamPairings[0].progress.completed, 1);
  assert.match(container.innerHTML, /"gpB":16/);
  await timers.shift()();
  assert.equal(wires, 1, "unchanged data must not replace the visible cards");
  let resolve;
  response = new Promise(done => { resolve = done; });
  const pending = timers.shift()();
  state.view = "teamPairing";
  resolve({ teamPairings: [] });
  await pending;
  assert.equal(state.teamPairings.length, 1);
  assert.equal(timers.length, 0);
  assert.equal(requests, 3);
});

test("polling retains expanded pairing details by match and leaves newly finished pairings collapsed", () => {
  let details = [{ dataset: { teamPairingDetails: "7" }, open: true }, { dataset: { teamPairingDetails: "8" }, open: false }];
  const document = { querySelectorAll: (selector) => selector === "[data-team-pairing-form]" ? []
    : selector.endsWith("[open]") ? details.filter(item => item.open) : details };
  const preserve = new Function("document", `${sourceOf("preserveTeamPairingDrafts")};return preserveTeamPairingDrafts;`)(document);
  const restore = preserve();
  details = ["8", "7", "9"].map(id => ({ dataset: { teamPairingDetails: id }, open: false }));
  restore();
  assert.deepEqual(details.map(item => item.open), [false, true, false]);
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
  )(state, () => segments, { setTimeout: (fn, delay) => { assert.equal(delay, 2000); callback = fn; return 1; } },
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

test("a saved captain action invalidates an older poll and refreshes before enabling another action", async () => {
  const state = { teamPairingDetail: { teamMatch: { id: 7, phase: "awaiting_roll" } } };
  const requests = [];
  let refreshes = 0;
  let stopped = 0;
  const run = new Function("state", "api", "stopTeamPairingPoll",
    `let teamPairingMutationPending = false, teamPairingRequestId = 0, publicTournamentRequestId = 0;
     ${sourceOf("loadTeamPairing")}
     async function refreshTeamTournamentUi() { await loadTeamPairing(7, { force: true }); }
     ${sourceOf("submitTeamPairingAction")}
     return { loadTeamPairing, submitTeamPairingAction, pending: () => teamPairingMutationPending };`
  )(state, (path) => path === "/action" ? Promise.resolve({}) : new Promise((resolve) => { requests.push(resolve); refreshes += 1; }), () => { stopped += 1; });
  const oldPoll = run.loadTeamPairing(7, { force: true });
  const action = run.submitTeamPairingAction({}, {}, "/action", {});
  assert.equal(run.pending(), true);
  await Promise.resolve();
  requests[1]({ teamMatch: { id: 7, phase: "mission_ban" } });
  await action;
  requests[0]({ teamMatch: { id: 7, phase: "awaiting_roll" } });
  assert.equal(await oldPoll, null);
  assert.equal(state.teamPairingDetail.teamMatch.phase, "mission_ban");
  assert.equal(run.pending(), false);
  assert.equal(refreshes, 2);
  assert.equal(stopped, 1);
});

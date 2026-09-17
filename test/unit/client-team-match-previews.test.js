const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const messages = require("../../public/i18n/en.js");
function sourceOf(name) {
  const result = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
}
const translate = (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]);
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

function previewRenderer(me) {
  return new Function("state", "t", "escapeHtml", "teamRosterLabel", "teamTournamentTables", [
    "teamTournamentMatchPreviewMarkup", "teamMatchProgressMarkup", "teamMatchGamesMarkup", "teamMatchPhaseLabel",
    "teamRosterMemberLabel", "teamPairingMemberLabel", "teamMissionLabel", "tableLabel"
  ].map(sourceOf).join("\n") + ";return teamTournamentMatchPreviewMarkup;")(
    { me }, translate, escape, roster => escape(roster.name), () => []);
}

function matchFixture() {
  return { id: 7, phase: "in_progress", canUndo: true,
    rosterA: { name: "Alpha", members: [1, 2, 3].map(id => ({ id, displayNameSnapshot: `A${id}`, factionSnapshot: "Novitiates" })) },
    rosterB: { name: "Beta", members: [4, 5, 6].map(id => ({ id, displayNameSnapshot: `B${id}`, factionSnapshot: "Kasrkin" })) },
    progress: { completed: 1, total: 3, gpA: 14, gpB: 6 },
    pairings: [{ slot: 1, rosterAMemberId: 1, rosterBMemberId: 4, shieldOwner: "a" }],
    games: ["completed", "pending_confirmation", "open"].map((status, i) => ({
      slot: i + 1, rosterAMemberId: i + 1, rosterBMemberId: i + 4, gamePointsA: 14, gamePointsB: 6,
      permissions: { canSubmit: true, canReview: true }, mission: { critOp: "Orb", killzone: "Volkus", layout: 6 },
      game: { id: i + 10, status, playerIds: [i + 1, i + 4],
        result: status === "completed" ? { scores: { 1: { total: 18 }, 4: { total: 14 } } } : null,
        pendingResult: status === "pending_confirmation" ? { submittedAs: "captain", result: { scores: { 2: { total: 21 }, 5: { total: 0 } } } } : null }
    })) };
}

test("tournament previews show every game and confirmed scores, without pairing or result controls for any viewer", () => {
  for (const me of [null, { id: 1 }, { id: 1, isAdmin: true }]) {
    const render = previewRenderer(me);
    const html = render(matchFixture(), { status: "in_progress" });
    assert.match(html, /Alpha vs Beta/);
    assert.match(html, /Completed 1\/3 games · Current GP: 14:6/);
    assert.match(html, /18:14 VP · 14:6 GP/);
    assert.match(html, /Awaiting confirmation/);
    assert.match(html, /Not played yet/);
    assert.match(html, /A1 \(Novitiates\) vs B4 \(Kasrkin\)/);
    assert.match(html, /Orb · Volkus · Layout 6/);
    assert.equal((html.match(/class="team-match-game"/g) || []).length, 3);
    assert.match(html, /data-team-pairing-open="7"/);
    assert.doesNotMatch(html, /<form|data-team-pair-action|data-team-match-undo|data-team-match-reset|data-team-game-result|data-team-game-review|shield A|21:0 VP|Three games in progress/);
    const completed = render({ ...matchFixture(), phase: "completed", teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 40, teamGamePointsB: 20 }, { status: "in_progress" });
    assert.match(completed, /2:0 TTP · 40:20 GP/);
  }
});

test("previews grow from empty slots to partial pairings, retain faction privacy, and handle byes", () => {
  const render = previewRenderer({ id: 1, isAdmin: true });
  const match = { ...matchFixture(), phase: "awaiting_roll", games: [], pairings: [] };
  const html = render(match, { status: "registration_closed" });
  assert.equal((html.match(/Players not paired yet/g) || []).length, 3);
  assert.doesNotMatch(html, /Novitiates|Kasrkin|VP|team-match-progress/);
  match.phase = "environment_selection";
  match.rosterA.members[0].factionHidden = true;
  match.pairings = [{ slot: 1, rosterAMemberId: 1, rosterBMemberId: 4, shieldOwner: "a" }];
  const partial = render(match, { status: "in_progress" });
  assert.match(partial, /A1/);
  assert.match(partial, /Kasrkin/);
  assert.doesNotMatch(partial, /Novitiates|shield A/);
  assert.equal((partial.match(/Players not paired yet/g) || []).length, 2);
  const bye = render({ ...match, phase: "completed", resolution: "bye", rosterB: null, pairings: [], teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 60, teamGamePointsB: 0 }, { status: "in_progress" });
  assert.match(bye, /60:0 GP/);
  assert.doesNotMatch(bye, /team-match-game|data-team-pairing-open| vs /);
});

test("both tournament routes render previews rather than the captain workspace", () => {
  const render = new Function("t", "teamTournamentMatchPreviewMarkup", "tournamentRoundsTabbedMarkup",
    ["teamTournamentRoundsMarkup", "teamTournamentMatchPreviewsMarkup"].map(sourceOf).join("\n") + ";return teamTournamentRoundsMarkup;")(
    translate, match => `PREVIEW ${match.id}`, (rounds, callback) => rounds.flatMap(round => round.matches.map(callback)).join(" "));
  for (const options of [{ publicRoute: true }, { admin: true }]) {
    assert.match(render({ tournament: { id: 4 }, rounds: [{ matches: [{ id: 7 }, { id: 8 }] }] }, options), /data-team-match-previews="4">PREVIEW 7 PREVIEW 8/);
  }
});

test("preview polling refreshes only the list on public and admin routes, and discards stale responses", async () => {
  for (const admin of [false, true]) {
    const data = { tournament: { id: 4, slug: "cup", status: "in_progress" }, rounds: [{ roundNumber: 1 }] };
    const state = { me: admin ? { id: 1, isAdmin: true } : null, view: "tournaments", tournamentsTab: admin ? "admin" : "public", selectedTournamentId: 4, tournamentInfoTab: "matches" };
    const container = { innerHTML: "ORIGINAL" };
    let currentContainer = container;
    const timers = [], calls = [], wires = [];
    let response = Promise.resolve({ ...data, rounds: [{ roundNumber: 1, score: "14:6" }] });
    const schedule = new Function("state", "document", "window", "api", "wireTournamentRoundTabs", "wireTeamMatchPreviews", `
      let teamPairingPollTimer;
      const stopTeamPairingPoll = () => {};
      const isCurrentPublicTournamentRoute = slug => slug === 'cup';
      const teamTournamentMatchPreviewsMarkup = data => JSON.stringify(data.rounds);
      ${sourceOf("scheduleTournamentMatchPreviewPoll")}; return scheduleTournamentMatchPreviewPoll;
    `)(state, { visibilityState: "visible", querySelector: () => currentContainer },
      { setTimeout: (callback, delay) => { assert.equal(delay, 2000); timers.push(callback); return 1; } },
      url => { calls.push(url); return response; }, root => wires.push(root), root => wires.push(root));
    schedule(data, { admin });
    await timers.shift()();
    assert.equal(calls[0], admin ? "/api/admin/tournaments/4" : "/api/tournaments/cup");
    assert.match(container.innerHTML, /14:6/);
    assert.equal(data.rounds[0].score, "14:6", "tab handlers must retain the new data");
    assert.deepEqual(wires, [container, container], "rewire only the replaced region, including round selection");
    await timers.shift()();
    assert.equal(wires.length, 2, "unchanged data must not rebuild the list");
    let resolve;
    response = new Promise(done => { resolve = done; });
    const pending = timers.shift()();
    currentContainer = { innerHTML: "NEW PAGE" };
    resolve({ ...data, rounds: [{ score: "STALE" }] });
    await pending;
    assert.equal(currentContainer.innerHTML, "NEW PAGE");
    assert.equal(data.rounds[0].score, "14:6");
    assert.equal(timers.length, 0);
  }
});

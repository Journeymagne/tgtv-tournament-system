const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync(require("node:path").join(__dirname, "../../public/app.js"), "utf8");
function extract(name) {
  const code = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(code, name);
  return code;
}
const messages = require("../../public/i18n/en.js");
const t = (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]);
const escapeHtml = (text) => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

test("standings and team participation history open the particular roster, not the parent team", () => {
  const render = new Function("t", "escapeHtml", ["teamRosterLabel", "teamStandingsTable", "teamRosterHistory", "teamRosterStatusLabel", "activeRosterMembersForUi"].map(extract).join("\n") + ";return {teamStandingsTable,teamRosterHistory};")(t, escapeHtml);
  const rosters = [1, 2].map((id) => ({ id, name: `Roster ${id}`, team: { slug: "same-team" }, tournament: { slug: "cup" } }));
  for (const html of [render.teamStandingsTable({ rosters, standings: rosters.map((roster) => ({ rosterId: roster.id, rank: roster.id })) }), render.teamRosterHistory(rosters)]) {
    assert.match(html, /data-roster-profile-link="1"/);
    assert.match(html, /data-roster-profile-link="2"/);
    assert.doesNotMatch(html, /data-team-profile-link|data-team-tournament=/);
  }
});

test("roster links round-trip through route state, including direct links", () => {
  const parse = new Function("hashSegments", `const tournamentSlugFromLocation = () => '', sharedChallengeTokenFromHash = () => ''; ${extract("appRouteFromHash")}; return appRouteFromHash();`);
  assert.deepEqual(parse(() => ["rosters", "42"]), { view: "roster", selectedRosterId: 42 });
  for (const id of ["bad", "0", "-1", "1.5"]) assert.equal(parse(() => ["rosters", id]).selectedRosterId, null);
  const hash = new Function("state", `${extract("appHashForState")};return appHashForState();`);
  assert.equal(hash({ view: "roster", selectedRosterId: 42 }), "#/rosters/42");
});

test("history shows newest rounds first, preserves A/B scores and hides result editing", () => {
  const renderedGames = [];
  const render = new Function("t", "escapeHtml", "teamMatchGamesMarkup", "teamMatchPhaseLabel",
    ["teamRosterLabel", "rosterMatchHistoryMarkup"].map(extract).join("\n") + ";return rosterMatchHistoryMarkup;"
  )(t, escapeHtml, (match, options) => { renderedGames.push([match.id, options.readOnly]); return "PERSONAL GAMES"; }, String);
  const matches = [1, 3, 2].map((id) => ({ id, roundNumber: id, phase: "completed", rosterA: { id: 10, name: "Opponent" }, rosterB: { id: 20, name: "My roster" }, teamTournamentPointsA: 0, teamTournamentPointsB: 2, teamGamePointsA: 20, teamGamePointsB: 40 }));
  const html = render({ tournament: { status: "in_progress" }, teamMatches: matches });
  assert.deepEqual(renderedGames, [[3, true], [2, true], [1, true]]);
  assert.deepEqual(matches.map((match) => match.id), [1, 3, 2], "render must not mutate stored history");
  assert.match(html, /Opponent<\/button> vs .*My roster<\/button>/);
  assert.match(html, /0:2 TTP · 20:40 GP/);
  assert.match(html, /data-team-pairing-open="3"/);
  assert.doesNotMatch(html, /data-team-match-reset|data-team-pairing-form/);
  assert.match(render({ tournament: {}, teamMatches: [] }), /no matches/);
});

test("a late roster response cannot replace a newer roster or a different page", async () => {
  const state = { me: null };
  const requests = [];
  let routeId = 0;
  const open = new Function("state", "api", "syncAppHash", "appRouteFromHash", `
    let rosterProfileRequestId = 0;
    const stopTeamPairingPoll = () => {}, leavePublicTournamentRoute = () => {}, renderRosterProfile = () => {};
    const playerTeamSlugFromLocation = () => '';
    ${extract("openRosterProfile")};return openRosterProfile;`
  )(state, () => new Promise((resolve) => requests.push(resolve)), () => { routeId = state.selectedRosterId; }, () => ({ selectedRosterId: routeId }));
  const first = open(1);
  const second = open(2);
  requests[1]({ roster: { id: 2 } });
  await second;
  requests[0]({ roster: { id: 1 } });
  await first;
  assert.equal(state.rosterProfile.roster.id, 2);
  const third = open(3);
  state.view = "teams";
  requests[2]({ roster: { id: 3 } });
  await third;
  assert.equal(state.rosterProfile, null);
});

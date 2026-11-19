const test = require("node:test");
const assert = require("node:assert/strict");
const {LeagueScreen, shared, leagueUrl} = require("../../public/tournament-leagues");
const {LeagueEditor} = require("../../public/tournament-leagues-editor");

function screen(options = {}) {
  const root = {isConnected: true, innerHTML: "", addEventListener() {}, querySelector() { return null; }};
  return new LeagueScreen(root, {locale: "en", ...options});
}
const rule = {primary: "tp", scale: [10, 8, 6, 4, 0], criteria: [{metric: "total_vp", aggregate: "sum"}]};
const league = {
  id: 9, slug: "autumn", name: "Autumn", revision: 3, formats: ["solo", "team"],
  rules: {solo: rule, org: {...rule, primary: "place"}}, tournamentIds: [11],
  events: [{id: 11, slug: "volkus", name: "Volkus", format: "solo", status: "counted"}],
  viewer: {canManage: false}
};
const row = {
  name: "Rook", subjectKey: "person:1", rank: 1, points: 15, eventCount: 2, identityStatus: "verified",
  criteriaValues: [92], picks: [
    {name: "Angels of Death", code: "AoD", side: "loyal"}, {name: "Blades of Khaine", code: "BoK", side: "xenos"},
    {name: "Nemesis Claw", code: "NC", side: "chaos"}
  ]
};

test("league directory links, supported tracks and administrator actions follow the response", async () => {
  const view = screen({canCreate: true, api: async () => ({leagues: [{...league, eventCount: 1}], viewer: {canCreate: false}})});
  await view.load();
  assert.match(view.root.innerHTML, /href="\/leagues\/autumn"/);
  assert.doesNotMatch(view.root.innerHTML, /data-action="create"/);
  view.canCreate = true;
  assert.match(view.directory(), /data-action="create"/);
  assert.deepEqual(shared.tracksFor(["doubles", "team"]), ["org"]);
  assert.equal(leagueUrl("осень", "org"), "/leagues/" + encodeURIComponent("осень") + "?track=org");
});

test("public standings expose two accessible pick buttons plus overflow and fetch the history on demand", async () => {
  const requests = [];
  const view = screen({slug: league.slug, api: async path => {
    requests.push(path);
    if (path.endsWith("/autumn")) return {league};
    if (path.includes("/standings/")) return {row: {...row, history: [
      {tournamentName: "Volkus", tournamentSlug: "volkus", displayName: "Ворон", points: 9, rank: 1, picks: [row.picks[0]]},
      {tournamentName: "October", tournamentSlug: "october", displayName: "Raven_17", points: 6, picks: [row.picks[1]]}
    ]}};
    return {rows: [row], criteria: rule.criteria};
  }});
  await view.load();
  assert.equal(requests.length, 2);
  assert.equal((view.root.innerHTML.match(/data-action="pick"/g) || []).length, 2);
  assert.match(view.root.innerHTML, /data-action="more-picks"/);
  assert.match(view.root.innerHTML, /aria-label="Angels of Death · Loyalists"/);
  assert.doesNotMatch(view.root.innerHTML, /data-action="edit"|data-value="registry"/);
  await view.expand(0);
  assert.equal(requests[2], "/api/leagues/autumn/standings/person%3A1?track=solo");
  const expanded = view.history(row, 0);
  assert.match(expanded, /Ворон/);
  assert.match(expanded, /Raven_17/);
  assert.match(expanded, /href="\/tournaments\/volkus"/);
  assert.match(expanded, /league \+9/);
  assert.match(expanded, /Angels of Death · Loyalists/);
  await view.expand(0);
  assert.equal(view.expanded, "");
});

test("organizations expose every roster with its participants and historical picks", () => {
  const view = screen({locale: "ru"});
  view.track = "org";
  view.criteria = [];
  const team = {subjectKey: "team:4", name: "Fresh Meat", points: 24, eventCount: 2};
  view.details.set(team.subjectKey, {history: [8, 10, 6].map((points, index) => ({
    tournamentName: index ? "3×3" : "2×2", displayName: ["FM Север", "FM Красные", "FM Белые"][index],
    points, members: [{name: "Mira", picks: [row.picks[0]]}]
  }))});
  const html = view.history(team, 0);
  assert.match(html, /FM Север/);
  assert.match(html, /FM Красные/);
  assert.match(html, /FM Белые/);
  assert.equal((html.match(/Angels of Death · Лоялы/g) || []).length, 3);
});

test("an outdated standings response cannot replace a new load or a detached view", async () => {
  let finish;
  const delayed = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const view = screen({api: () => ++calls === 1 ? delayed : Promise.resolve({leagues: [{...league, name: "Current"}]})});
  const old = view.load();
  await view.load();
  finish({leagues: [{...league, name: "Old"}]});
  await old;
  assert.match(view.root.innerHTML, /Current/);
  assert.doesNotMatch(view.root.innerHTML, /Old/);
});

test("draft snapshots keep independent track rules, distinct stages and the expected revision", () => {
  const view = screen({track: "solo"});
  view.league = league;
  const editor = new LeagueEditor(view, shared, 3);
  editor.rules.solo.criteria = [{name: "Best stage VP", metric: "total_vp", aggregate: "max"}];
  editor.rules.solo.importTournamentId = 11;
  editor.include.solo = true;
  const body = editor.configure();
  assert.deepEqual(body.tournamentIds, [11]);
  assert.equal(body.revision, 3);
  assert.notDeepEqual(body.rules.solo.criteria, league.rules.solo.criteria);
  assert.deepEqual(body.rules.org, league.rules.org);
  assert.equal(editor.canSave(), false);
  editor.preview = {valid: true};
  assert.equal(editor.canSave(), true);
  editor.rules.solo.scale = [8, 10, 0];
  assert.equal(editor.canSave(), false);
});

test("custom rule metrics respect selected sources and previews use server ranks and values", () => {
  const view = screen({track: "org"});
  view.league = {...league, formats: ["doubles", "team"]};
  const editor = new LeagueEditor(view, shared, 3);
  editor.sources.set("11", {id: 11, format: "doubles", supportedMetrics: ["average_sos", "total_vp", "events"]});
  editor.sources.set("12", {id: 12, format: "team", supportedMetrics: ["total_vp", "events"]});
  editor.selected.add("12");
  assert.deepEqual(editor.availableMetrics(), ["total_vp", "events"]);
  editor.preview = {valid: true, standings: {org: [{...row, name: "Fresh Meat", rank: 1, points: 24}]},
    league: {events: [{status: "counted"}]}, changes: {org: [{name: "Fresh Meat", from: 2, to: 1}]}};
  const preview = editor.previewPanel();
  assert.match(preview, /Fresh Meat/);
  assert.match(preview, /Points · 24/);
  assert.match(preview, /2 → 1/);
});

test("a conflicting revision provides a reload action and disables repeated saves", () => {
  const view = screen();
  const error = Object.assign(new Error("conflict"), {status: 409});
  assert.match(view.errorBox(error), /data-action="reload"/);
  view.league = league;
  const editor = new LeagueEditor(view, shared, 3);
  editor.preview = {valid: true};
  editor.savedError = error;
  assert.equal(editor.canSave(), false);
});

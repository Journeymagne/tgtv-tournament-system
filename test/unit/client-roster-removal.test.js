const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
// The client is two files now: admin.js is fetched on demand and shares app.js
// global scope, so anything extracted by name may live in either.
const source = ["app.js", "admin.js"]
  .map((file) => fs.readFileSync(path.join(__dirname, "../../public", file), "utf8"))
  .join("\n");
const extract = (name) => source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0];
const t = (key) => key;
test("admin roster removal remains available after start and completed removal is not offered twice", () => {
  const render = new Function("t", "escapeHtml", "teamRosterLabel", "teamRosterStatusLabel", "activeRosterMembersForUi", `${extract("adminTeamRostersContent")}; return adminTeamRostersContent;`)(t, String, (r) => r.name, String, () => []);
  for (const status of ["draft", "registration_open", "registration_closed", "in_progress", "completed", "cancelled"]) {
    const html = render({ tournament: { status }, rosters: [{ id: 7, name: "Squad", status: status === "completed" ? "finished" : "active" }] });
    assert.match(html, /data-admin-team-roster-delete="7"/);
  }
  const withdrawn = render({ tournament: { status: "in_progress" }, rosters: [{ id: 7, name: "Squad", status: "withdrawn" }] });
  assert.doesNotMatch(withdrawn, /data-admin-team-roster-delete/);
  assert.match(withdrawn, /teams.tournament.removeAfterStartHint/);
});
test("a bye renders a resolved match without captain or reset controls", () => {
  const render = new Function("t", "escapeHtml", "teamRosterLabel", `${extract("teamTournamentMatchMarkup")}; return teamTournamentMatchMarkup;`)(t, String, (r) => r.name);
  const html = render({ resolution: "bye", phase: "completed", rosterA: { name: "Squad" }, rosterB: null, teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 60, teamGamePointsB: 0 }, { status: "in_progress" });
  assert.match(html, /Squad/);
  assert.match(html, /teams.pairing.bye/);
  assert.doesNotMatch(html, /data-team-match-reset|data-team-pairing-open/);
});
test("manual round setup can submit a bye only in the second slot of an odd field", () => {
  const state = { adminTournamentDetail: { rosters: [1, 2, 3].map((id) => ({ id, name: `Squad ${id}`, status: "active" })) } };
  const render = new Function("t", "escapeHtml", "state", `${extract("teamRoundSetupRosterSelect")}; return teamRoundSetupRosterSelect;`)(t, String, state);
  assert.match(render("rosterBId", null), /value="" selected/);
  assert.doesNotMatch(render("rosterAId", 1), /teams.pairing.bye/);
  state.adminTournamentDetail.rosters.pop();
  assert.doesNotMatch(render("rosterBId", 2), /teams.pairing.bye/);
});

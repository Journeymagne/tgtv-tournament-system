const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function extract(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match, name);
  return match[0];
}
function route(hash) {
  return new Function("hashSegments", `const tournamentSlugFromLocation = () => '', sharedChallengeTokenFromHash = () => ''; ${extract("appRouteFromHash")}; return appRouteFromHash();`)(() => hash.replace(/^#\//, "").split("/"));
}
function serialize(state) {
  return new Function("state", `const tournamentMatchIdFromGameId = () => 0; ${extract("appHashForState")}; return appHashForState();`)(state);
}

test("administrative deep links preserve their context across navigation and refresh", () => {
  for (const [screen, extra] of [
    ["games/sessions", {}], ["games/game/7", {}], ["games/game/7/edit", {}],
    ["tournaments/admin/6", {}], ["tournaments/admin/create", {}],
    ["players/2", { playerProfile: { user: { id: 2 } } }],
    ["teams/amber", { teamProfile: { team: { slug: "amber" } } }],
    ["team-matches/8", {}], ["rosters/9", {}], ["feedback", {}],
    ["documentation/rules", {}], ["achievements/4", {}], ["achievements/hall-of-fame", {}],
    ["challenge/2", { me: { id: 1 } }]
  ]) {
    const hash = `#/administration/${screen}`;
    const parsed = route(hash);
    assert.equal(parsed.administrationContext, true, screen);
    assert.equal(serialize({ ...parsed, ...extra }), hash, screen);
  }
});

test("normal screens never inherit administrative context from their URLs", () => {
  for (const screen of ["games", "games/game/7", "players/2", "teams/amber", "tournaments", "feedback", "documentation/rules", "achievements/4", "rosters/9", "team-matches/8"]) {
    assert.equal(Boolean(route(`#/${screen}`).administrationContext), false, screen);
  }
});

test("saved administrative URLs lead to the central administration", () => {
  for (const [old, tab, peopleTab] of [["leaderboard/users", "people", "players"], ["teams/admin", "people", "teams"], ["tournaments/admin", "tournaments", undefined]]) {
    const parsed = route(`#/${old}`);
    assert.equal(parsed.view, "administration");
    assert.equal(parsed.adminHubTab, tab);
    assert.equal(parsed.adminPeopleTab, peopleTab);
    assert.equal(parsed.administrationContext, true);
  }
  for (const screen of ["games/sessions", "games/game/7/edit", "tournaments/admin/6"]) {
    assert.equal(serialize(route(`#/${screen}`)), `#/administration/${screen}`);
  }
});

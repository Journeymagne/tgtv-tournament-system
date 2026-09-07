const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");

function extract(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\r?\\n\\}`));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}

function harness(state = {}) {
  const content = { innerHTML: "" };
  const helpers = ["escapeHtml", "pageTabs", "paginate", "paginationMarkup", "teamsTable", "filterAdminTeams", "renderTop", "adminTeamsPanel"];
  const factory = new Function("state", "document", "t", "plural", "avatarMarkup", `
    const LEADERBOARD_PAGE_SIZE = 20;
    const wirePageTabs = () => {}, wireVenueTabs = () => {}, wirePaginationControls = () => {}, wireTeamLinks = () => {}, wireLeaderboardProfiles = () => {}, wireAdminUserControls = () => {};
    const venueTabs = () => '', usersTable = () => 'player rows', adminUsersPanel = () => 'user admin';
    ${helpers.map(extract).join("\n")}
    return { pageTabs, renderTop, teamsTable, filterAdminTeams, adminTeamsPanel };
  `);
  return { ...factory(state, { querySelector: () => content }, (key) => key, (key) => key, () => "logo"), content, state };
}

test("every user sees Teams beside the player leaderboard while administration stays restricted", () => {
  for (const isAdmin of [false, true]) {
    const ui = harness({ me: { isAdmin }, leaderboardTab: "teams", leaderboardVenue: "combined", teamLeaderboard: [] });
    ui.renderTop();
    assert.match(ui.content.innerHTML, /data-page-tab-value="teams"/);
    assert.equal(ui.content.innerHTML.includes('data-page-tab-value="users"'), isAdmin);
    assert.match(ui.content.innerHTML, /teams.leaderboard.title/);
    assert.equal(ui.state.leaderboardTab, "teams");
    assert.equal(Boolean(ui.pageTabs("games", [{ id: "sessions", label: "admin" }], "sessions")), isAdmin);
  }
  const restricted = harness({ me: { isAdmin: false }, leaderboardTab: "users", leaderboardVenue: "tts" });
  restricted.renderTop();
  assert.equal(restricted.state.leaderboardTab, "leaderboard");
  assert.doesNotMatch(restricted.content.innerHTML, /user admin/);
});

test("team ranking keeps global ranks across pages and escapes team names", () => {
  const teams = Array.from({ length: 23 }, (_, index) => ({ id: index + 1, slug: `team-${index}`, name: index === 20 ? '<img onerror="bad">' : `Team ${index}`, rating: 1100 - index, memberCount: 3 }));
  const ui = harness({ teamLeaderboardPage: 2 });
  const html = ui.teamsTable(teams);
  assert.match(html, /<td class="rank">21<\/td>/);
  assert.match(html, /<td class="rank">23<\/td>/);
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img/);
  assert.match(html, /data-pagination-target="team-leaderboard"/);
  assert.match(html, /<td>1080<\/td>/);
});

test("admin team search supports Russian names and archived teams", () => {
  const teams = [{ name: "Громовая Стража", archivedAt: "2026-09-01" }, { name: "Amber Guard" }];
  const ui = harness();
  assert.deepEqual(ui.filterAdminTeams(teams, "  ГРОМ  "), [teams[0]]);
  assert.deepEqual(ui.filterAdminTeams(teams, "GUARD"), [teams[1]]);
  assert.equal(ui.filterAdminTeams(teams, ""), teams);
});

test("team leaderboard venue and administration links round-trip through routing", () => {
  const parse = new Function("hashSegments", `const tournamentSlugFromLocation = () => '', sharedChallengeTokenFromHash = () => ''; ${extract("appRouteFromHash")}; return appRouteFromHash;`);
  const hash = new Function("state", `${extract("appHashForState")}; return appHashForState;`);
  for (const venue of ["combined", "tts", "irl"]) {
    const url = hash({ view: "top", leaderboardTab: "teams", leaderboardVenue: venue })();
    const route = parse(() => url.replace(/^#\//, "").split("/"))();
    assert.deepEqual(route, { view: "top", leaderboardTab: "teams", leaderboardVenue: venue });
  }
  const url = hash({ view: "teams", teamsTab: "admin", me: { isAdmin: true } })();
  assert.equal(url, "#/teams/admin");
  assert.equal(parse(() => ["teams", "admin"])().teamsTab, "admin");
  assert.equal(parse(() => ["teams", "admin"])().teamSlug, "");
});

test("opening teams remembers the leaderboard or administration return route", () => {
  for (const [view, returnHash] of [["top", "#/leaderboard/teams/irl"], ["teams", "#/teams/admin"]]) {
    const state = { view, teamProfile: null };
    const navigate = new Function("state", "appHashForState", "window", "playerTeamPublicPath", "leavePublicTournamentRoute", "renderPlayerTeamRoute", `${extract("navigateToPlayerTeam")}; return navigateToPlayerTeam;`)(
      state, () => returnHash, { history: { pushState() {} } }, (slug) => `/teams/${slug}`, () => {}, () => {}
    );
    navigate("amber");
    assert.equal(state.teamReturnHash, returnHash);
  }
});

test("logo removal sends null while an unchanged logo is omitted", async () => {
  const readLogo = new Function("compressAvatar", `${extract("teamLogoFromForm")}; return teamLogoFromForm;`)(async () => "uploaded-logo");
  assert.equal(await readLogo({ elements: {} }), undefined);
  assert.equal(await readLogo({ elements: { removeLogo: { checked: true } } }), null);
  assert.equal(await readLogo({ elements: { logo: { files: [{}] } } }), "uploaded-logo");
});

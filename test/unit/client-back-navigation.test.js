const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function sourceOf(name) {
  const result = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
}

function navigationHarness(initial = "/tournaments/cup") {
  const entries = [{ url: initial, state: null }];
  let index = 0;
  let selectedRound = "2";
  const state = { tournamentInfoTab: "matches", gameFilters: { playerQuery: "Player" } };
  const window = { location: new URL(initial, "http://localhost:3000"), scrollY: 450 };
  const move = (position) => { index = position; window.location = new URL(entries[index].url, window.location); };
  window.history = {
    get state() { return structuredClone(entries[index].state); },
    replaceState(value, _title, url) {
      entries[index] = { state: structuredClone(value), url: url || entries[index].url };
      move(index);
    },
    pushState(value, _title, url) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(value), url });
      move(index + 1);
    },
    back() { assert.ok(index > 0, "must never leave the app on a direct link"); move(index - 1); },
    forward() { move(index + 1); }
  };
  let routed = 0;
  const names = ["navigationUrl", "currentNavigationEntry", "navigationContextKeys", "rememberNavigationContext",
    "restoreNavigationContext", "pushAppLocation", "navigateBack", "gameBackFallback", "gameTeamMatchId"];
  const navigation = new Function("state", "window", "document", "handleHashNavigation", "tournamentPublicPath",
    `${names.map(sourceOf).join("\n")}; return { ${names.join(",")} };`
  )(state, window, { querySelector: () => selectedRound ? { dataset: { tournamentRoundTab: selectedRound } } : null },
    () => { routed += 1; }, (slug) => `/tournaments/${slug}`);
  return { ...navigation, state, window, entries, routed: () => routed, round: (value) => { selectedRound = value; } };
}

test("Back retraces tournament, roster, team match, game and result, preserving the original tournament context", () => {
  const nav = navigationHarness();
  nav.rememberNavigationContext();
  nav.state.tournamentInfoTab = "standings";
  nav.pushAppLocation("/#/rosters/3");
  nav.pushAppLocation("/#/team-matches/7");
  nav.round(null);
  nav.rememberNavigationContext();
  nav.pushAppLocation("/#/games/game/42");
  nav.rememberNavigationContext();
  nav.pushAppLocation("/#/games/game/42/result");
  for (const expected of ["/#/games/game/42", "/#/team-matches/7", "/#/rosters/3", "/tournaments/cup"]) {
    nav.navigateBack("/#/mygames");
    assert.equal(nav.navigationUrl(), expected);
  }
  nav.restoreNavigationContext(nav.currentNavigationEntry().context);
  assert.equal(nav.state.tournamentInfoTab, "matches");
  assert.equal(nav.currentNavigationEntry().context.tournamentRound, "2");
  assert.equal(nav.currentNavigationEntry().context.scrollY, 450);
  assert.equal(nav.entries.length, 5, "Back must not push new copies of earlier screens");
  nav.window.history.forward();
  assert.equal(nav.navigationUrl(), "/#/rosters/3");
});

test("history context survives refresh and list filters are independent between screens", () => {
  const nav = navigationHarness("/#/games/sessions");
  nav.rememberNavigationContext();
  nav.pushAppLocation("/#/games/game/42");
  nav.state.gameFilters.playerQuery = "Changed";
  nav.rememberNavigationContext();
  nav.navigateBack();
  nav.restoreNavigationContext(structuredClone(nav.window.history.state).tgtvNavigation.context);
  assert.equal(nav.navigationUrl(), "/#/games/sessions");
  assert.equal(nav.state.gameFilters.playerQuery, "Player");
});

test("direct game links fall back to the team match, then tournament, without a Back loop", () => {
  const nav = navigationHarness("/#/games/game/42");
  const game = { teamMatch: { id: 7 }, tournament: { slug: "cup" } };
  nav.navigateBack(nav.gameBackFallback(game));
  assert.equal(nav.navigationUrl(), "/#/team-matches/7");
  nav.navigateBack("/tournaments/cup");
  assert.equal(nav.navigationUrl(), "/tournaments/cup");
  assert.equal(nav.entries.length, 1);
  assert.equal(nav.routed(), 2);
  assert.equal(nav.gameBackFallback({ tournament: { slug: "cup" } }), "/tournaments/cup");
  assert.equal(nav.gameBackFallback({}), "/#/games");
  assert.equal(nav.gameBackFallback({ sourceType: "team_match_game", sourceId: 7 }), "/#/team-matches/7");
});

test("reopening the same page does not add a duplicate Back destination", () => {
  const nav = navigationHarness();
  nav.pushAppLocation("/tournaments/cup");
  assert.equal(nav.entries.length, 1);
  nav.pushAppLocation("https://other.example/");
  assert.equal(nav.entries.length, 1);
});

test("result and review URLs restore their screen on reload or Forward", () => {
  for (const mode of ["", "result", "edit", "review"]) {
    const segments = ["games", "game", "42", mode];
    const parse = new Function("tournamentSlugFromLocation", "sharedChallengeTokenFromHash", "hashSegments",
      `${sourceOf("appRouteFromHash")}; return appRouteFromHash;`)(() => "", () => "", () => segments);
    const route = parse();
    assert.deepEqual(route, { view: "gameDetail", selectedGameId: 42, gameDetailMode: mode });
    const hash = new Function("state", "tournamentMatchIdFromGameId",
      `${sourceOf("appHashForState")}; return appHashForState;`)(route, () => 0);
    assert.equal(hash(), `#/games/game/42${mode ? `/${mode}` : ""}`);
  }
});

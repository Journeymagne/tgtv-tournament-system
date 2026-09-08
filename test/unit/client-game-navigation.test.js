const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
// Administration entry points were split into their own on-demand file.
const adminSource = fs.readFileSync(path.join(__dirname, "../../public/admin.js"), "utf8");
const openGameDetailSource = appSource.match(
  /async function openGameDetail\(gameId\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction renderGames)/
)?.[0];
const loadGameSource = appSource.match(
  /async function loadGame\(gameId\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction getKnownGame)/
)?.[0];
const getKnownPublicTournamentSource = appSource.match(
  /function getKnownPublicTournament\(slug\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nasync function loadPublicTournament)/
)?.[0];
const loadPublicTournamentSource = appSource.match(
  /async function loadPublicTournament\(slug, options = \{\}\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nasync function renderPublicTournamentRoute)/
)?.[0];
const renderPublicTournamentRouteSource = appSource.match(
  /async function renderPublicTournamentRoute\(slug, options = \{\}\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction publicTournamentContainer)/
)?.[0];
const stopTeamPairingPollSource = appSource.match(
  /function stopTeamPairingPoll\(\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction leavePublicTournamentRoute)/
)?.[0];
const scheduleTeamPairingPollSource = appSource.match(
  /function scheduleTeamPairingPoll\(slug\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction teamPairingSubmissionPending)/
)?.[0];
const navigateToPlayerTeamSource = appSource.match(
  /function navigateToPlayerTeam\(slug\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction clearPlayerTeamRoute)/
)?.[0];
const loadTournamentAdminSource = adminSource.match(
  /async function loadTournamentAdmin\(\) \{[\s\S]*?\r?\n\}/
)?.[0];
const appRouteFromHashSource = appSource.match(
  /function appRouteFromHash\(\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nasync function applyAppRouteFromHash)/
)?.[0];
const appHashForStateSource = appSource.match(
  /function appHashForState\(\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction syncAppHash)/
)?.[0];
const loadPlayerProfileSource = appSource.match(
  /async function loadPlayerProfile\(userId\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nasync function openPlayerProfile)/
)?.[0];
const loadChallengeProgressSource = appSource.match(
  /async function loadChallengeProgress\(userId = null\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction selectedChallengeProgress)/
)?.[0];

function openGameDetailHarness({ knownGame }) {
  assert.ok(openGameDetailSource, "could not find openGameDetail in public/app.js");
  const state = {};
  const loadedIds = [];
  let hashSyncCount = 0;
  let renderCount = 0;
  const factory = new Function(
    "state",
    "normalizedGameDetailId",
    "getKnownGame",
    "loadGame",
    "syncAppHash",
    "renderShell",
    `${openGameDetailSource}; return openGameDetail;`
  );
  const openGameDetail = factory(
    state,
    (id) => Number(id),
    () => knownGame,
    async (id) => {
      loadedIds.push(id);
      return knownGame || { id };
    },
    () => { hashSyncCount += 1; },
    () => { renderCount += 1; }
  );
  return {
    openGameDetail,
    state,
    counts: () => ({ loadedIds, hashSyncCount, renderCount })
  };
}

test("opening a game already loaded by Games does not reload the full archive", async () => {
  const harness = openGameDetailHarness({ knownGame: { id: 42 } });

  await harness.openGameDetail(42);

  assert.deepEqual(harness.counts(), { loadedIds: [], hashSyncCount: 1, renderCount: 1 });
  assert.equal(harness.state.selectedGameId, 42);
  assert.equal(harness.state.view, "gameDetail");
});

test("opening an uncached game loads only that game by id", async () => {
  const harness = openGameDetailHarness({ knownGame: null });

  await harness.openGameDetail(42);

  assert.deepEqual(harness.counts(), { loadedIds: [42], hashSyncCount: 1, renderCount: 1 });
});

test("single-game loader requests the canonical game endpoint and caches its response", async () => {
  assert.ok(loadGameSource, "could not find loadGame in public/app.js");
  const state = { allGames: [], gamesError: "old error" };
  const requestedPaths = [];
  const factory = new Function(
    "state",
    "normalizedGameDetailId",
    "tournamentMatchIdFromGameId",
    "api",
    `${loadGameSource}; return loadGame;`
  );
  const loadGame = factory(
    state,
    (id) => Number(id),
    () => 0,
    async (requestPath) => {
      requestedPaths.push(requestPath);
      return { game: { id: 42, status: "completed" } };
    }
  );

  const game = await loadGame(42);

  assert.deepEqual(requestedPaths, ["/api/games/42"]);
  assert.equal(game.id, 42);
  assert.deepEqual(state.allGames, [game]);
  assert.equal(state.gamesError, "");
});

test("legacy tournament-match links resolve one canonical game instead of loading the archive", async () => {
  assert.ok(loadGameSource, "could not find loadGame in public/app.js");
  const state = { allGames: [], gamesError: "" };
  const requestedPaths = [];
  const factory = new Function(
    "state",
    "normalizedGameDetailId",
    "tournamentMatchIdFromGameId",
    "api",
    `${loadGameSource}; return loadGame;`
  );
  const loadGame = factory(
    state,
    () => "tournament-match-9",
    () => 9,
    async (requestPath) => {
      requestedPaths.push(requestPath);
      return { game: { id: 42, tournamentMatch: { id: 9 } } };
    }
  );

  const game = await loadGame("tournament-match-9");

  assert.deepEqual(requestedPaths, ["/api/games/tournament-match/9"]);
  assert.equal(game.id, 42);
  assert.equal(state.allGames[0], game);
});

test("public tournament loader reuses a complete cached aggregate and otherwise requests only its slug", async () => {
  assert.ok(getKnownPublicTournamentSource, "could not find getKnownPublicTournament in public/app.js");
  assert.ok(loadPublicTournamentSource, "could not find loadPublicTournament in public/app.js");
  const cached = { tournament: { slug: "summer-cup" }, rounds: [] };
  const state = { publicTournamentDetail: cached };
  const requestedPaths = [];
  const factory = new Function(
    "state",
    "api",
    `${getKnownPublicTournamentSource}; ${loadPublicTournamentSource}; return loadPublicTournament;`
  );
  const loadPublicTournament = factory(state, async (requestPath) => {
    requestedPaths.push(requestPath);
    return { tournament: { slug: "winter cup" }, rounds: [] };
  });

  assert.equal(await loadPublicTournament("summer-cup"), cached);
  const loaded = await loadPublicTournament("winter cup");

  assert.deepEqual(requestedPaths, ["/api/tournaments/winter%20cup"]);
  assert.equal(state.publicTournamentDetail, loaded);
});

test("team tournament polling cannot redraw a tournament after its route is left", async () => {
  assert.ok(stopTeamPairingPollSource, "could not find stopTeamPairingPoll in public/app.js");
  assert.ok(scheduleTeamPairingPollSource, "could not find scheduleTeamPairingPoll in public/app.js");
  const timers = [];
  const cleared = [];
  const renders = [];
  let currentSlug = "summer-cup";
  const factory = new Function(
    "window",
    "isCurrentPublicTournamentRoute",
    "api",
    "renderPublicTournament",
    "teamPairingSubmissionPending",
    "preserveTeamPairingDrafts",
    `let teamPairingPollTimer = null; let publicTournamentRequestId = 0; const state = {}; ${stopTeamPairingPollSource}; ${scheduleTeamPairingPollSource}; return scheduleTeamPairingPoll;`
  );
  const scheduleTeamPairingPoll = factory(
    {
      clearTimeout: (timer) => { cleared.push(timer); },
      setTimeout: (callback, delay) => {
        const timer = { id: timers.length + 1, callback, delay };
        timers.push(timer);
        return timer.id;
      }
    },
    (slug) => currentSlug === slug,
    async (path) => path,
    (data) => { renders.push(data); },
    () => false,
    () => () => {}
  );

  scheduleTeamPairingPoll("summer-cup");
  scheduleTeamPairingPoll("summer-cup");
  assert.deepEqual(cleared, [1]);
  assert.equal(timers[1].delay, 5000);

  currentSlug = "";
  await timers[1].callback();
  assert.deepEqual(renders, []);

  currentSlug = "summer-cup";
  scheduleTeamPairingPoll("summer-cup");
  await timers[2].callback();
  assert.deepEqual(renders, ["/api/tournaments/summer-cup"]);
});

test("pairing refresh preserves a draft only for the same match, action and step", () => {
  const source = appSource.match(/function preserveTeamPairingDrafts\(\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction isCurrentTeamPairingRoute)/)?.[0];
  assert.ok(source);
  const makeForm = (step, value, options = ["Orb", "Data"]) => {
    const select = { name: "mission", value, options: options.map((value) => ({ value })) };
    return { dataset: { teamMatchId: "7", teamPairingForm: "environment", step },
      querySelectorAll: () => [select], elements: { namedItem: () => select }, select };
  };
  let forms = [makeForm("3", "Data")];
  const preserve = new Function("document", `${source}; return preserveTeamPairingDrafts;`)({ querySelectorAll: () => forms });
  const restore = preserve();
  forms = [makeForm("3", "Orb")];
  restore();
  assert.equal(forms[0].select.value, "Data");
  forms = [makeForm("4", "Orb")];
  restore();
  assert.equal(forms[0].select.value, "Orb");
  forms = [makeForm("3", "Orb", ["Orb"])];
  restore();
  assert.equal(forms[0].select.value, "Orb");
});

test("table labels never come from another cached tournament", () => {
  const source = appSource.match(/function teamTournamentTables\(tournamentId\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction teamEnvironmentAssignmentsMarkup)/)?.[0];
  assert.ok(source);
  const tables = new Function("state", `${source}; return teamTournamentTables;`)({
    teamPairingDetail: { tournament: { id: 1 }, tables: [{ id: 11, killzone: "Volkus" }] },
    publicTournamentDetail: { tournament: { id: 2 }, tables: [{ id: 22, killzone: "Gallowdark" }] }
  });
  assert.deepEqual(tables(2), [{ id: 22, killzone: "Gallowdark" }]);
  assert.deepEqual(tables(3), []);
});

test("an in-flight tournament refresh is ignored after navigation", async () => {
  assert.ok(renderPublicTournamentRouteSource, "could not find renderPublicTournamentRoute in public/app.js");
  let currentRoute = true;
  let resolveLoad;
  const rendered = [];
  const container = { innerHTML: "" };
  const factory = new Function(
    "state",
    "isCurrentPublicTournamentRoute",
    "getKnownPublicTournament",
    "publicTournamentContainer",
    "t",
    "loadPublicTournament",
    "renderPublicTournament",
    "wirePublicTournamentNav",
    "escapeHtml",
    `let publicTournamentRequestId = 0; ${renderPublicTournamentRouteSource}; return renderPublicTournamentRoute;`
  );
  const renderPublicTournamentRoute = factory(
    { publicTournamentDetail: null, me: { id: 1 } },
    () => currentRoute,
    () => null,
    () => container,
    (key) => key,
    () => new Promise((resolve) => { resolveLoad = resolve; }),
    (data) => { rendered.push(data); },
    () => {},
    String
  );

  const refresh = renderPublicTournamentRoute("summer-cup", { force: true });
  currentRoute = false;
  resolveLoad({ tournament: { slug: "summer-cup" } });
  await refresh;

  assert.deepEqual(rendered, []);
});

test("opening a team explicitly leaves the tournament polling route", () => {
  assert.ok(navigateToPlayerTeamSource, "could not find navigateToPlayerTeam in public/app.js");
  const calls = [];
  const factory = new Function(
    "state",
    "appHashForState",
    "window",
    "playerTeamPublicPath",
    "leavePublicTournamentRoute",
    "renderPlayerTeamRoute",
    `${navigateToPlayerTeamSource}; return navigateToPlayerTeam;`
  );
  const navigateToPlayerTeam = factory(
    { view: "tournaments" },
    () => "#/tournaments",
    { history: { pushState: (_state, _title, url) => { calls.push(["push", url]); } } },
    (slug) => `/teams/${slug}`,
    () => { calls.push(["leave"]); },
    (slug, options) => { calls.push(["render", slug, options]); }
  );

  navigateToPlayerTeam("amber-ravens");

  assert.deepEqual(calls, [
    ["push", "/teams/amber-ravens"],
    ["leave"],
    ["render", "amber-ravens", { force: true }]
  ]);
});

test("admin tournament loader opens a selected tournament directly without loading catalogs", async () => {
  assert.ok(loadTournamentAdminSource, "could not find loadTournamentAdmin in public/app.js");
  const state = { selectedTournamentId: 7, adminTournamentMode: "detail" };
  const calls = [];
  const factory = new Function(
    "state",
    "loadAdminTournamentDetail",
    "loadAdminTournaments",
    `${loadTournamentAdminSource}; return loadTournamentAdmin;`
  );
  const loadTournamentAdmin = factory(
    state,
    async (id, options) => { calls.push(["detail", id, options]); },
    async () => { calls.push(["list"]); }
  );

  await loadTournamentAdmin();

  assert.deepEqual(calls, [["detail", 7, { preservePreview: true }]]);
});

test("challenge progress routes retain the selected user id", () => {
  assert.ok(appRouteFromHashSource, "could not find appRouteFromHash in public/app.js");
  assert.ok(appHashForStateSource, "could not find appHashForState in public/app.js");
  const routeFactory = new Function(
    "tournamentSlugFromLocation",
    "sharedChallengeTokenFromHash",
    "hashSegments",
    `${appRouteFromHashSource}; return appRouteFromHash;`
  );
  const appRouteFromHash = routeFactory(() => "", () => "", () => ["challenge", "17"]);
  const hashFactory = new Function(
    "state",
    "tournamentMatchIdFromGameId",
    `${appHashForStateSource}; return appHashForState;`
  );
  const appHashForState = hashFactory(
    { view: "challenge", selectedChallengeUserId: 17, me: { id: 3 } },
    () => 0
  );

  assert.deepEqual(appRouteFromHash(), { view: "challenge", selectedChallengeUserId: 17 });
  assert.equal(appHashForState(), "#/challenge/17");
});

test("notification routes retain challenge and team invitation targets", () => {
  assert.ok(appRouteFromHashSource, "could not find appRouteFromHash in public/app.js");
  assert.ok(appHashForStateSource, "could not find appHashForState in public/app.js");
  const routeFactory = (segments) => new Function(
    "tournamentSlugFromLocation",
    "sharedChallengeTokenFromHash",
    "hashSegments",
    `${appRouteFromHashSource}; return appRouteFromHash;`
  )(() => "", () => "", () => segments);
  const hashFactory = new Function(
    "state",
    "tournamentMatchIdFromGameId",
    `${appHashForStateSource}; return appHashForState;`
  );

  assert.deepEqual(routeFactory(["matchmaking", "challenge", "41"])(), {
    view: "play",
    focusChallengeId: 41
  });
  assert.deepEqual(routeFactory(["teams", "invitation", "73"])(), {
    view: "teams",
    teamsTab: "mine",
    teamSlug: "",
    focusInvitationId: 73
  });
  assert.equal(
    hashFactory({ view: "play", focusChallengeId: 41 }, () => 0)(),
    "#/mygames/challenge/41"
  );
  assert.equal(
    hashFactory({ view: "teams", focusInvitationId: 73, teamProfile: null }, () => 0)(),
    "#/teams/invitation/73"
  );
});

test("player profile loader requests one user and caches its challenge subentity", async () => {
  assert.ok(loadPlayerProfileSource, "could not find loadPlayerProfile in public/app.js");
  const state = { adminPasswordReset: null, playerProfile: null };
  const requestedPaths = [];
  const cachedProgress = [];
  const factory = new Function(
    "state",
    "api",
    "upsertChallengeProgress",
    `${loadPlayerProfileSource}; return loadPlayerProfile;`
  );
  const loadPlayerProfile = factory(
    state,
    async (requestPath) => {
      requestedPaths.push(requestPath);
      return { user: { id: 17 }, challengeProgress: { user: { id: 17 } } };
    },
    (progress) => { cachedProgress.push(progress); }
  );

  const profile = await loadPlayerProfile(17);

  assert.deepEqual(requestedPaths, ["/api/users/17"]);
  assert.equal(state.playerProfile, profile);
  assert.deepEqual(cachedProgress, [profile.challengeProgress]);
});

test("challenge progress loader requests only the selected user", async () => {
  assert.ok(loadChallengeProgressSource, "could not find loadChallengeProgress in public/app.js");
  const state = {
    selectedChallengeUserId: 17,
    me: { id: 3 },
    challengeError: "old error"
  };
  const requestedPaths = [];
  const cachedProgress = [];
  const factory = new Function(
    "state",
    "api",
    "upsertChallengeProgress",
    `${loadChallengeProgressSource}; return loadChallengeProgress;`
  );
  const loadChallengeProgress = factory(
    state,
    async (requestPath) => {
      requestedPaths.push(requestPath);
      return { users: [{ user: { id: 17 } }] };
    },
    (progress) => { cachedProgress.push(progress); }
  );

  await loadChallengeProgress(17);

  assert.deepEqual(requestedPaths, ["/api/challenge-progress?userId=17"]);
  assert.deepEqual(cachedProgress, [{ user: { id: 17 } }]);
  assert.equal(state.challengeError, "");
});

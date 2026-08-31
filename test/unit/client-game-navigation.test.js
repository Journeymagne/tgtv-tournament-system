const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
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
const loadTournamentAdminSource = appSource.match(
  /async function loadTournamentAdmin\(\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nasync function loadAdminTournamentDetail)/
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

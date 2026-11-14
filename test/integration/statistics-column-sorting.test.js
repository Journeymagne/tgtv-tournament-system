const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const users = require("../../src/db/repositories/users");
const teams = require("../../src/db/repositories/player-teams");
const games = require("../../src/db/repositories/games");
const usersApi = require("../../src/api/users");
let pool, client;
const query = values => new URLSearchParams(values);
const user = name => users.insert(client, { name, passwordHash: "test", rating: 1000, isAdmin: false });

test.before(async () => {
  pool = new Pool(require("../helpers/schema").poolOptions);
  await require("../helpers/schema").resetSchemas(pool);
  await migrate(pool);
});
test.after(async () => pool.end());
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("TRUNCATE accounts.users RESTART IDENTITY CASCADE");
});
test.afterEach(() => client.release());

test("player ordering precedes pagination and search retains global official places", async () => {
  const alpha = await user("Alpha"), beta = await user("Beta"), zulu = await user("Zulu");
  await users.setRatings(client, alpha.id, { tts: 1300, irl: 1000, combined: 1300 });
  await users.setRatings(client, beta.id, { tts: 1200, irl: 1000, combined: 1200 });
  await users.updateProfile(client, zulu.id, { registerNickname: "Searchable", telegramContact: "@needle" });
  const ascending = await users.listLeaderboard(client, "combined", "", query({ sort: "rating", direction: "asc", limit: 1 }));
  assert.deepEqual(ascending.map(row => [row.name, row.rank]), [["Zulu", 3]]);
  const byName = await users.listLeaderboard(client, "combined", "", query({ sort: "name", direction: "desc", limit: 1 }));
  assert.equal(byName[0].id, zulu.id);
  const found = await users.listLeaderboard(client, "combined", "https://t.me/needle", query({ sort: "rank", direction: "desc" }));
  assert.deepEqual(found.map(row => row.rank), [3]);
  const invalid = await users.listLeaderboard(client, "combined", "", query({ sort: "name; DROP TABLE users", direction: "sideways", limit: 1 }));
  assert.equal(invalid[0].id, alpha.id);
  const invalidDirection = await users.listLeaderboard(client, "combined", "", query({ sort: "name", direction: "sideways", limit: 1 }));
  assert.equal(invalidDirection[0].id, alpha.id);
});

test("every team leaderboard and admin column orders all rows before paging with immutable places", async () => {
  const alpha = await user("Alpha"), zulu = await user("Zulu");
  const a = await teams.insert(client, { name: "Alpha team", nameKey: "alpha team", slug: "alpha", leaderUserId: alpha.id });
  const z = await teams.insert(client, { name: "Zulu team", nameKey: "zulu team", slug: "zulu", leaderUserId: zulu.id });
  await teams.addMembership(client, a.id, alpha, "leader");
  await teams.addMembership(client, z.id, zulu, "leader");
  await teams.addMembership(client, z.id, alpha);
  await teams.setRating(client, a.id, "tts", 1200);
  await teams.setRating(client, z.id, "irl", 1100);
  for (const mode of ["leaderboard", "admin"]) {
    for (const [sort, direction, expected, rank] of [
      ["rank", "desc", z.id, 2], ["name", "desc", z.id, 2], ["leaderName", "desc", z.id, 2],
      ["memberCount", "desc", z.id, 2], ["rating", "asc", z.id, 2],
      ["ratingTts", "asc", z.id, 2], ["ratingIrl", "desc", z.id, 2]
    ]) {
      const result = await teams.listPage(client, query({ sort, direction, limit: 1 }), mode);
      assert.deepEqual(result.teams.map(row => [row.id, row.rank]), [[expected, rank]], `${mode}/${sort}`);
    }
  }
  const found = await teams.listPage(client, query({ q: "zulu", sort: "rank" }), "leaderboard");
  assert.equal(found.teams[0].rank, 2);
  const invalid = await teams.listPage(client, query({ sort: "__proto__", direction: "desc", limit: 1 }), "leaderboard");
  assert.equal(invalid.teams[0].id, a.id);
  await teams.insert(client, { name: 'No leader', nameKey: 'no leader', slug: 'no-leader', leaderUserId: null });
  for (const direction of ['asc', 'desc']) {
    const sorted = await teams.listPage(client, query({ sort: 'leaderName', direction, limit: 100 }), 'admin');
    assert.equal(sorted.teams.at(-1).leaderName, null);
  }
});

async function completed(a, b, index) {
  const game = await games.insert(client, { playerIds: [a.id, b.id], challengeId: null });
  await games.saveFinalResult(client, game.id, {
    result: { winnerId: a.id, scores: { [a.id]: { total: index, faction: index === 0 ? "Zulu" : "Alpha" }, [b.id]: { total: 0, faction: "Other" } } },
    elo: { [a.id]: { delta: index } }
  });
  await client.query("UPDATE games SET submitted_at = '2026-10-01'::timestamptz + $2 * interval '1 day' WHERE id=$1", [game.id, index]);
  return game;
}

test("all game sort columns promote an older row across the 25-row page boundary", async () => {
  const alpha = await user("Alpha"), beta = await user("Beta"), zulu = await user("Zulu"), aaron = await user("Aaron");
  const oldest = await completed(zulu, beta, 0);
  for (let index = 1; index <= 26; index++) await completed(alpha, aaron, index);
  const options = { page: 1, venue: null, playerId: null, playerQuery: "", factionKeys: [] };
  for (const [sort, direction] of [["date", "asc"], ["player", "desc"], ["opponent", "desc"], ["faction", "desc"], ["score", "asc"], ["vpDiff", "asc"], ["elo", "asc"]]) {
    const result = await games.listCompletedPage(client, { ...options, sort, direction });
    assert.equal(result.games[0].id, oldest.id, sort);
    assert.equal(result.pagination.total, 27);
  }
  const invalid = await games.listCompletedPage(client, { ...options, sort: "date; DELETE FROM games", direction: "wrong" });
  assert.notEqual(invalid.games[0].id, oldest.id);
  assert.equal(invalid.pagination.total, 27);
});

test("user history sorts full history before its five-row selection from the owner's side", async () => {
  const owner = await user("Owner"), other = await user("Other");
  const oldest = await completed(other, owner, 0);
  await client.query("UPDATE games SET result=jsonb_set(result,ARRAY['scores',$2::text,'total'],'99'::jsonb) WHERE id=$1", [oldest.id, String(owner.id)]);
  for (let index = 1; index <= 6; index++) await completed(other, owner, index);
  const response = await usersApi.profile({ client, params: { id: owner.id }, query: query({ historySort: "score", historyDirection: "desc" }) });
  assert.equal(response.recentGames[0].id, oldest.id);
  assert.equal(response.recentGames.length, 5);
  assert.equal(response.stats.matches, 7);
});

test("game numeric sorts keep missing scores and Elo last in either direction", async () => {
  const a = await user('A'), b = await user('B');
  const low = await completed(a, b, 2), high = await completed(a, b, 10), missing = await completed(a, b, 11);
  await client.query("UPDATE games SET result=jsonb_set(result,ARRAY['scores',$2::text],'{}'::jsonb),elo=NULL WHERE id=$1", [missing.id, String(a.id)]);
  for (const sort of ['score', 'vpDiff', 'elo']) {
    for (const [direction, expected] of [['asc', [low.id, high.id, missing.id]], ['desc', [high.id, low.id, missing.id]]]) {
      const result = await games.listCompletedPage(client, { page: 1, venue: null, factionKeys: [], sort, direction });
      assert.deepEqual(result.games.map(row => row.id), expected, `${sort}/${direction}`);
    }
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { startApiServer, createClient } = require("../helpers/client");
const { createRouter } = require("../../src/http/router");
const routes = require("../../src/api/routes");
const { loadUserFromRequest } = require("../../src/api/auth");
const { migrate } = require("../../src/db/migrate");
const cups = require("../../src/api/tournaments");
const users = require("../../src/db/repositories/users");
const games = require("../../src/db/repositories/games");
const gameApi = require("../../src/api/games");
const { calculateElo } = require("../../src/domain/elo");
let pool, server, root, alpha, admin, player, guest;

async function run(fn, transaction = false) {
  const client = await pool.connect();
  try {
    if (transaction) await client.query("BEGIN");
    const result = await fn(client);
    if (transaction) await client.query("COMMIT");
    return result;
  } catch (error) {
    if (transaction) await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && /test/.test(target.pathname));
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(pool);
  server = await startApiServer(createRouter(routes, { withClient: fn => run(fn), withTransaction: fn => run(fn, true), loadUser: loadUserFromRequest }));
});
test.after(async () => { await server?.close(); await pool?.end(); });
test.beforeEach(async () => {
  await pool.query("TRUNCATE games, tournaments, users RESTART IDENTITY CASCADE");
  admin = createClient(server.baseUrl); player = createClient(server.baseUrl); guest = createClient(server.baseUrl);
  const people = [];
  for (const [http, name] of [[admin, "RatingAdmin"], [player, "RatingPlayer"]]) {
    const response = await http.post("/api/register", { name, password: "rating-test-password", confirmPassword: "rating-test-password", telegramContact: `@${name}` });
    assert.equal(response.status, 201);
    people.push(response.body.user);
  }
  [root, alpha] = people;
});
const scores = (a, b, draw = false) => ({
  [a]: { crit: 6, tac: 6, kill: 6, primary: "crit" },
  [b]: { crit: draw ? 6 : 1, tac: draw ? 6 : 1, kill: draw ? 6 : 1, primary: "crit" }
});
async function guestGame(client, { venueMode = "irl", ratingPolicy = "ranked", draw = false } = {}) {
  const { body: { tournament } } = await cups.createAdmin({ client, user: root, body: {
    name: "Guest rating cup", description: "Rating regression", startsAt: "2026-09-19T12:00:00Z",
    rulesSummary: "Approved Ops", format: "swiss", swissRoundCount: 1, venueMode, ratingPolicy
  } });
  const ctx = body => ({ client, user: root, params: { id: tournament.id }, body });
  await cups.publishAdmin(ctx({ status: "registration_open" }));
  for (const body of [{ displayName: "Posossum" }, { userId: alpha.id }, { displayName: "Guest three" }, { displayName: "Guest four" }]) await cups.addParticipant(ctx(body));
  await cups.closeRegistration(ctx());
  await cups.generateNextRoundAdmin(ctx());
  const started = await cups.startAdmin(ctx());
  const match = started.rounds[0].matches.find(m => [m.participantA.userId, m.participantB.userId].includes(alpha.id));
  const opponent = [match.participantA, match.participantB].find(p => !p.userId);
  await cups.saveMatchResultAdmin({ ...ctx({ scores: scores(-opponent.id, alpha.id, draw) }), params: { id: tournament.id, matchId: match.id } });
  return { game: await games.findById(client, match.gameId), tournament, guestKey: -opponent.id, match };
}

for (const venueMode of ["tts", "irl"]) {
  test(`guest loss updates ${venueMode} and combined, and admin replay repairs old +15 without changing results`, async () => {
    const seeded = await run(async client => {
      const fixture = await guestGame(client, { venueMode });
      assert.equal(fixture.game.elo[alpha.id].delta, -16);
      assert.equal(fixture.game.elo.combined[alpha.id].delta, -16);
      // Reproduce the old production bug: the loser received +15 instead of -16.
      const oldTrack = { flat: 15, [alpha.id]: { before: 1000, after: 1015, delta: 15 } };
      await games.updateElo(client, fixture.game.id, { ...oldTrack, combined: oldTrack });
      await users.addRating(client, alpha.id, 31, venueMode);
      await users.addRating(client, alpha.id, 31, "combined");
      await client.query("UPDATE games SET submitted_at = '2026-01-01' WHERE id = $1", [fixture.game.id]);
      const later = await games.insert(client, { playerIds: [alpha.id, root.id], venueMode });
      await gameApi.applyElo(client, later, await users.findById(client, alpha.id), await users.findById(client, root.id), {
        winnerId: alpha.id, scores: scores(alpha.id, root.id)
      }, root.id, { newSubmission: true, submittedBy: root.id });
      return { ...fixture, before: await games.findById(client, fixture.game.id), later: await games.findById(client, later.id) };
    }, true);
    const path = `/api/admin/games/${seeded.game.id}/recalculate-rating`;
    assert.equal((await guest.post(path)).status, 401);
    assert.equal((await player.post(path)).status, 403);
    const repaired = await admin.post(path);
    assert.equal(repaired.status, 200, JSON.stringify(repaired.body));
    assert.equal(repaired.body.game.elo[alpha.id].delta, -16);
    assert.equal(repaired.body.game.elo.combined[alpha.id].delta, -16);
    assert.equal(repaired.body.game.elo[seeded.guestKey].fixed, true);
    assert.deepEqual(repaired.body.game.result, seeded.before.result);
    assert.equal(repaired.body.game.submittedAt, seeded.before.submittedAt);
    const snapshot = () => run(async client => ({
      alpha: (await users.findById(client, alpha.id)).ratings,
      root: (await users.findById(client, root.id)).ratings,
      game: await games.findById(client, seeded.game.id), later: await games.findById(client, seeded.later.id)
    }));
    const state = await snapshot();
    const delta = calculateElo(984, 1000, 1).deltaA;
    assert.equal(state.alpha[venueMode], 984 + delta);
    assert.equal(state.alpha.combined, 984 + delta);
    assert.equal(state.alpha[venueMode === "tts" ? "irl" : "tts"], 1000);
    assert.equal(state.root[venueMode], 1000 - delta);
    assert.equal(state.later.elo[alpha.id].before, 984);
    assert.deepEqual(state.later.result, seeded.later.result);
    assert.equal(state.later.submittedAt, seeded.later.submittedAt);
    const link = (await pool.query("SELECT elo FROM tournament_matches WHERE game_id = $1", [seeded.game.id])).rows[0];
    assert.deepEqual(link.elo, state.game.elo);
    assert.equal((await admin.post(path)).status, 200);
    assert.deepEqual(await snapshot(), state, "second recalculation must be idempotent");
    const audit = await pool.query("SELECT * FROM tournament_audit_events WHERE event_type = 'game_rating_recalculated'");
    assert.equal(audit.rows.length, 2);
    assert.ok(audit.rows.every(row => row.actor_user_id === root.id));
  });
}

test("draw versus guest gives zero at equal ratings; unranked and unfinished games cannot be recalculated", async () => {
  const draw = await run(client => guestGame(client, { draw: true }), true);
  assert.equal(draw.game.elo[alpha.id].delta, 0);
  const unranked = await run(client => guestGame(client, { ratingPolicy: "unranked" }), true);
  assert.equal(unranked.game.elo, null);
  assert.equal((await admin.post(`/api/admin/games/${unranked.game.id}/recalculate-rating`)).status, 409);
  const open = await run(client => games.insert(client, { playerIds: [alpha.id, root.id] }));
  assert.equal((await admin.post(`/api/admin/games/${open.id}/recalculate-rating`)).status, 409);
  assert.equal((await admin.post('/api/admin/games/999999/recalculate-rating')).status, 404);
});

test("guest rating documentation upgrade preserves custom edits and is repeatable", async () => {
  await run(async client => {
    const migration = require("../../src/db/migrations/031_guest_rating_docs");
    await require("../../src/db/migrations/018_documentation").up(client);
    await client.query("UPDATE documentation_pages SET markdown = '+15 legacy rule', version = 1, updated_by = NULL WHERE page_id = 'mmr' AND locale = 'ru'");
    await client.query("UPDATE documentation_pages SET markdown = '+15 custom document', version = 2, updated_by = $1 WHERE page_id = 'mmr' AND locale = 'en'", [root.id]);
    await migration.up(client);
    const first = (await client.query("SELECT locale, markdown, version FROM documentation_pages WHERE page_id = 'mmr' ORDER BY locale")).rows;
    assert.equal(first[0].markdown, '+15 custom document');
    assert.match(first[1].markdown, /фиксированный рейтинг 1000/);
    assert.equal(first[1].version, 2);
    await migration.up(client);
    assert.deepEqual((await client.query("SELECT locale, markdown, version FROM documentation_pages WHERE page_id = 'mmr' ORDER BY locale")).rows, first);
  }, true);
});

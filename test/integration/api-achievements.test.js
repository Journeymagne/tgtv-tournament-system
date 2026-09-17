const test = require("node:test");
const assert = require("node:assert/strict");
const { TEST_DATABASE_URL } = require("../helpers/db");
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool, withClient, withTransaction } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const { loadUserFromRequest } = require("../../src/api/auth");
const { startApiServer, createClient } = require("../helpers/client");
const repo = require("../../src/db/repositories/achievements");
const routes = require("../../src/api/routes");
const titlesMigration = require("../../src/db/migrations/026_achievement_titles");
let server, admin, player, guest, userId, teamId;
const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=";
const input = { name: "Good sport", description: "Fair play award", kind: "player", imageData };
test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname) && /test/.test(target.pathname));
  await migrate(getPool());
  await getPool().query("TRUNCATE achievements, games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest }));
  admin = createClient(server.baseUrl); player = createClient(server.baseUrl); guest = createClient(server.baseUrl);
  for (const [http, name] of [[admin, "Admin"], [player, "Player"]]) {
    const response = await http.post("/api/register", { name, password: "password123", confirmPassword: "password123", telegramContact: `@${name}` });
    assert.equal(response.status, 201); userId = response.body.user.id;
  }
  const team = await player.post("/api/teams", { name: "Medal team", description: "Team" });
  assert.equal(team.status, 201); teamId = team.body.team.id;
});
test.after(async () => { await server?.close(); await closePool(); });

test("only administrators create and award; cards, images and profile filters are readable", async () => {
  assert.equal((await guest.post("/api/achievements", input)).status, 401);
  assert.equal((await player.post("/api/achievements", input)).status, 403);
  const created = await admin.post("/api/achievements", input);
  assert.equal(created.status, 201);
  const achievement = created.body.achievement;
  assert.ok(achievement.imageUrl); assert.equal(achievement.image_data, undefined);
  const image = await fetch(server.baseUrl + achievement.imageUrl);
  assert.equal(image.status, 200); assert.equal(image.headers.get("content-type"), "image/png");
  assert.equal((await player.post(`/api/achievements/${achievement.id}/awards`, { targetId: userId })).status, 403);
  const awards = await Promise.all([1, 2].map(() => admin.post(`/api/achievements/${achievement.id}/awards`, { targetId: userId })));
  assert.deepEqual(awards.map((result) => result.body.awarded).sort(), [false, true]);
  assert.equal((await guest.get(`/api/achievements?userId=${userId}`)).body.achievements.length, 1);
  assert.equal((await guest.get("/api/achievements?userId=1")).body.achievements.length, 0);
  const detail = (await guest.get(`/api/achievements/${achievement.id}`)).body;
  assert.equal(detail.recipients.length, 1); assert.equal(detail.recipients[0].userId, userId);
  assert.equal((await admin.post(`/api/achievements/${achievement.id}/awards`, { targetId: 999999 })).status, 404);
  assert.equal((await admin.post(`/api/achievements/${achievement.id}/awards`, { targetId: "bad" })).status, 400);
});

test("team achievements are separate and awarded to teams", async () => {
  const created = await admin.post("/api/achievements", { ...input, kind: "team" });
  const id = created.body.achievement.id;
  assert.equal((await admin.post(`/api/achievements/${id}/awards`, { targetId: teamId })).body.awarded, true);
  const teamAwards = (await guest.get(`/api/achievements?teamId=${teamId}`)).body.achievements;
  assert.deepEqual(teamAwards.map((row) => row.id), [id]);
  assert.equal((await guest.get("/api/achievements?kind=team")).body.achievements.length, 1);
  assert.ok((await guest.get(`/api/achievements?userId=${userId}`)).body.achievements.every((row) => row.kind === "player"));
});

test("invalid images and fields do not create achievements", async () => {
  for (const invalid of [{ imageData: "data:image/svg+xml;base64,PHN2Zz4=" }, { imageData: "https://example.com/image.png" }, { name: " " }, { description: "" }, { kind: "wrong" }, { name: "a".repeat(121) }]) {
    assert.equal((await admin.post("/api/achievements", { ...input, ...invalid })).status, 400);
  }
  assert.equal((await guest.get("/api/achievements?kind=wrong")).status, 400);
  assert.equal((await guest.get("/api/achievements/999999")).status, 404);
});

test("creation accepts emoji logos including joined emoji, flags and keycaps without an image", async () => {
  for (const emoji of ["🏆", "🧑🏻‍🚀", "🇦🇲", "6️⃣"]) {
    const response = await admin.post("/api/achievements", { ...input, imageData: null, emoji });
    assert.equal(response.status, 201);
    assert.equal(response.body.achievement.emoji, emoji);
    assert.equal(response.body.achievement.imageUrl, null);
    assert.equal((await guest.get(`/api/achievements/${response.body.achievement.id}`)).body.achievement.emoji, emoji);
  }
  for (const emoji of ["", "abc", "🏆🥇", "<script>", "x".repeat(100)]) {
    assert.equal((await admin.post("/api/achievements", { ...input, imageData: null, emoji })).status, 400);
  }
});

test("podium sync preserves rank for guests, is repeatable, and replaces outdated winners", async () => {
  await withTransaction(async (client) => {
    const { rows: [event] } = await client.query("INSERT INTO tournaments (slug,name,status,format) VALUES ('medals','Cup','completed','swiss') RETURNING id");
    const participants = [];
    for (const [index, recipient] of [userId, null, 1].entries()) {
      const { rows: [row] } = await client.query(`INSERT INTO tournament_participants
        (tournament_id,user_id,display_name,display_name_key,status,source) VALUES ($1,$2,$3,$3,'finished','admin_manual') RETURNING id`, [event.id, recipient, `p${index}`]);
      participants.push(row.id);
    }
    const tournament = { id: event.id, name: "Cup", finalResults: participants.map((participantId, index) => ({ participantId, rank: index + 1 })) };
    await repo.syncPodium(client, tournament, 1);
    await repo.syncPodium(client, tournament, 1);
    const medals = (await repo.list(client)).filter((row) => row.tournamentId === event.id).sort((a,b) => a.place-b.place);
    assert.deepEqual(medals.map((row) => row.emoji), ["🥇", "🥈", "🥉"]);
    assert.equal((await repo.recipients(client, medals[1].id)).length, 0);
    assert.equal((await repo.recipients(client, medals[0].id))[0].userId, userId);
    tournament.finalResults = [{ participantId: participants[2], rank: 1 }];
    await repo.syncPodium(client, tournament, 1);
    assert.equal((await repo.recipients(client, medals[0].id))[0].userId, 1);
    assert.equal((await repo.recipients(client, medals[2].id)).length, 0);
  });
  const medal = (await guest.get("/api/achievements")).body.achievements.find((row) => row.place);
  assert.equal((await admin.post(`/api/achievements/${medal.id}/awards`, { targetId: userId })).status, 409);
});

test("Hall Of Fame sorts by edition, ordinary achievements by latest addition", async () => {
  const ids = [];
  for (const number of [2, 10, 7]) {
    const result = await admin.post("/api/achievements", { ...input, name: `Cup E${number}`, category: "title" });
    assert.equal(result.status, 201); ids.push(result.body.achievement.id);
  }
  const titles = (await guest.get("/api/achievements?category=title")).body.achievements.filter((row) => ids.includes(row.id));
  assert.deepEqual(titles.map((row) => row.tournamentNumber), [10, 7, 2]);
  const recent = await admin.post("/api/achievements", { ...input, name: "Most recent" });
  const ordinary = (await guest.get("/api/achievements?category=achievement")).body.achievements;
  assert.equal(ordinary[0].id, recent.body.achievement.id);
  assert.ok(ordinary.every((row) => row.category === "achievement"));
  assert.equal((await guest.get("/api/achievements?category=bad")).status, 400);
});

test("team award optionally stores roster snapshots and rejects other teams' players", async () => {
  const created = await admin.post("/api/achievements", { ...input, kind: "team", category: "title" });
  const id = created.body.achievement.id;
  assert.equal((await admin.post(`/api/achievements/${id}/awards`, { targetId: teamId, memberIds: [1] })).status, 400);
  assert.equal((await admin.post(`/api/achievements/${id}/awards`, { targetId: teamId, memberIds: [userId] })).body.awarded, true);
  const detail = (await guest.get(`/api/achievements/${id}`)).body;
  assert.deepEqual(detail.recipients[0].members, [{ userId, name: "Player" }]);
  assert.equal((await admin.post(`/api/achievements/${id}/awards`, { targetId: teamId, memberIds: [] })).body.awarded, false);
  assert.deepEqual((await guest.get(`/api/achievements/${id}`)).body.recipients[0].members, detail.recipients[0].members);
  const personal = await admin.post("/api/achievements", input);
  assert.equal((await admin.post(`/api/achievements/${personal.body.achievement.id}/awards`, { targetId: userId, memberIds: [userId] })).status, 400);
});

test("only admins delete achievements; deleted awards disappear from profiles and cannot be reissued", async () => {
  const created = await admin.post("/api/achievements", input);
  const id = created.body.achievement.id;
  await admin.post(`/api/achievements/${id}/awards`, { targetId: userId });
  assert.equal((await guest.del(`/api/achievements/${id}`)).status, 401);
  assert.equal((await player.del(`/api/achievements/${id}`)).status, 403);
  assert.equal((await admin.del(`/api/achievements/${id}`)).status, 200);
  assert.equal((await guest.get(`/api/achievements/${id}`)).status, 404);
  assert.equal((await admin.post(`/api/achievements/${id}/awards`, { targetId: userId })).status, 404);
  assert.ok((await guest.get(`/api/achievements?userId=${userId}`)).body.achievements.every((row) => row.id !== id));
});

test("migration moves legacy winners only, preserving IDs and awards", async () => {
  await withTransaction(async (client) => {
    await require("../../src/db/migrations/024_legacy_achievements").up(client);
    const before = (await client.query("SELECT id,legacy_id FROM achievements WHERE legacy_source='achievement-bot' ORDER BY id")).rows;
    await titlesMigration.up(client);
    const after = (await client.query("SELECT id,legacy_id FROM achievements WHERE legacy_source='achievement-bot' ORDER BY id")).rows;
    assert.deepEqual(after, before);
    const winners = (await repo.list(client, { category: "title" })).filter((row) => row.legacyId);
    assert.equal(winners.length, 17);
    assert.ok(winners.some((row) => row.legacyId === 44 && row.tournamentNumber === 1));
    assert.ok(winners.some((row) => row.legacyId === 62 && row.tournamentNumber === 3));
    assert.ok(!(await repo.list(client, { category: "achievement" })).some((row) => row.legacyId === 44));
  });
});

test("only admins edit achievement text; artwork, recipients and type survive edits", async () => {
  const created = await admin.post("/api/achievements", { ...input, category: "title", name: "Cup E2" });
  const card = created.body.achievement;
  await admin.post(`/api/achievements/${card.id}/awards`, { targetId: userId });
  const patch = { name: "Cup E12", description: "Updated description", kind: "team", emoji: "🔥" };
  assert.equal((await guest.patch(`/api/achievements/${card.id}`, patch)).status, 401);
  assert.equal((await player.patch(`/api/achievements/${card.id}`, patch)).status, 403);
  const edited = await admin.patch(`/api/achievements/${card.id}`, patch);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.achievement.name, patch.name);
  assert.equal(edited.body.achievement.description, patch.description);
  assert.equal(edited.body.achievement.kind, "player");
  assert.equal(edited.body.achievement.imageUrl, card.imageUrl);
  assert.equal(edited.body.achievement.tournamentNumber, 12);
  assert.equal((await guest.get(`/api/achievements/${card.id}`)).body.recipients[0].userId, userId);
  for (const bad of [{ name: " " }, { description: "" }, { name: "a".repeat(121) }, { description: "a".repeat(2001) }]) {
    assert.equal((await admin.patch(`/api/achievements/${card.id}`, { ...patch, ...bad })).status, 400);
  }
  await admin.del(`/api/achievements/${card.id}`);
  assert.equal((await admin.patch(`/api/achievements/${card.id}`, patch)).status, 404);
});

test("custom event medal text survives podium republishing", async () => {
  await withTransaction(async (client) => {
    const event = (await client.query("INSERT INTO tournaments (slug,name,status,format) VALUES ('editable-medal','Cup E4','completed','swiss') RETURNING id")).rows[0];
    const tournament = { id: event.id, name: "Cup E4", finalResults: [] };
    await repo.syncPodium(client, tournament, 1);
    const medal = (await repo.list(client)).find((row) => row.tournamentId === event.id && row.place === 1);
    await require('../../src/api/achievements').update({ client, params: { id: medal.id }, body: { name: "Custom winner", description: "Custom description" } });
    await repo.syncPodium(client, tournament, 1);
    const saved = repo.view(await repo.find(client, medal.id));
    assert.equal(saved.name, "Custom winner"); assert.equal(saved.description, "Custom description");
    assert.equal(saved.textEdited, true); assert.equal(saved.tournamentNumber, 4);
  });
});

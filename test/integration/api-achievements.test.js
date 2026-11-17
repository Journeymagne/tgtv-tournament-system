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
  await require("../helpers/access").grantOwner(getPool(), admin);
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

async function teamPodiumFixture(client, slug) {
  const event = (await client.query(`INSERT INTO tournaments
    (slug,name,status,format,participant_mode,team_size,completed_at)
    VALUES ($1,'Team Cup E4','completed','swiss','team',3,'2026-11-16T10:00:00Z') RETURNING id`, [slug])).rows[0];
  const players = [];
  for (const name of ['winner', 'replaced', 'silver', 'bronze', 'fourth', 'late']) {
    players.push((await client.query(`INSERT INTO users (name,name_key,password_hash)
      VALUES ($1,$1,'unused') RETURNING id`, [`${slug}-${name}`])).rows[0].id);
  }
  const rosters = [];
  for (const [i, recipient] of [players[0], players[2], players[3], players[4]].entries()) {
    const roster = (await client.query(`INSERT INTO tournament_team_rosters
      (tournament_id,team_id,name,name_key,team_name_snapshot,status)
      VALUES ($1,$2,$3,$3,'Medal team','finished') RETURNING id`, [event.id, teamId, `roster-${i}`])).rows[0];
    rosters.push(roster.id);
    await client.query(`INSERT INTO tournament_team_roster_members
      (tournament_id,roster_id,user_id,slot,display_name_snapshot,faction_snapshot,joined_at,ended_at)
      VALUES ($1,$2,$3,1,'Player','Kommandos','2026-10-01', $4)`,
    [event.id, roster.id, recipient, i === 0 ? '2026-11-17T10:00:00Z' : null]);
  }
  await client.query(`INSERT INTO tournament_team_roster_members
    (tournament_id,roster_id,user_id,slot,display_name_snapshot,faction_snapshot,joined_at,ended_at)
    VALUES ($1,$2,$3,1,'Former','Kommandos','2026-09-01','2026-09-30'),
      ($1,$2,$4,3,'Later','Kommandos','2026-11-17',NULL)`, [event.id, rosters[0], players[1], players[5]]);
  await client.query(`INSERT INTO tournament_team_roster_members
    (tournament_id,roster_id,slot,display_name_snapshot,faction_snapshot,joined_at,is_proxy)
    VALUES ($1,$2,2,'Guest','Kommandos','2026-10-01',TRUE)`, [event.id, rosters[0]]);
  const tournament = { id: event.id, name: 'Team Cup E4', participantMode: 'team', completedAt: '2026-11-16T10:00:00Z',
    finalResults: rosters.map((rosterId, i) => ({ rosterId, rank: i + 1 })) };
  await client.query('UPDATE tournaments SET final_results=$2::jsonb WHERE id=$1', [event.id, JSON.stringify(tournament.finalResults)]);
  return { tournament, players, rosters };
}

test('team podium awards personal titles to the completion roster and reconciles winners without duplicates', async () => {
  await withTransaction(async (client) => {
    const { tournament, players, rosters } = await teamPodiumFixture(client, 'personal-podium');
    await repo.syncPodium(client, tournament, 1);
    const medals = (await repo.list(client)).filter(row => row.tournamentId === tournament.id);
    assert.equal(medals.filter(row => row.kind === 'team').length, 3);
    const personal = medals.filter(row => row.kind === 'player').sort((a, b) => a.place - b.place);
    assert.equal(personal.length, 3);
    for (const [i, expected] of [players[0], players[2], players[3]].entries()) {
      assert.deepEqual((await repo.recipients(client, personal[i].id)).map(row => row.userId), [expected]);
      assert.ok((await repo.list(client, { userId: expected, kind: 'player', category: 'title' })).some(row => row.id === personal[i].id));
    }
    for (const absent of [players[1], players[4], players[5]]) {
      assert.equal((await repo.list(client, { userId: absent })).length, 0);
    }
    const awards = (await client.query('SELECT * FROM achievement_awards WHERE achievement_id=ANY($1::int[]) ORDER BY id', [medals.map(row => row.id)])).rows;
    await repo.syncPodium(client, tournament, 1);
    assert.deepEqual((await client.query('SELECT * FROM achievement_awards WHERE achievement_id=ANY($1::int[]) ORDER BY id', [medals.map(row => row.id)])).rows, awards);
    await require('../../src/api/achievements').update({ client, params: { id: personal[0].id }, body: { name: 'Personal winner', description: 'Edited medal' } });
    tournament.finalResults = [{ rank: 1, rosterId: rosters[1] }, { rank: 2, rosterId: rosters[0] }];
    await repo.syncPodium(client, tournament, 1);
    assert.deepEqual((await repo.recipients(client, personal[0].id)).map(row => row.userId), [players[2]]);
    assert.deepEqual((await repo.recipients(client, personal[1].id)).map(row => row.userId), [players[0]]);
    assert.deepEqual(await repo.recipients(client, personal[2].id), []);
    assert.equal((await repo.find(client, personal[0].id)).name, 'Personal winner');
    await client.query('UPDATE achievements SET deleted_at=NOW() WHERE id=$1', [personal[0].id]);
    await repo.syncPodium(client, tournament, 1);
    assert.equal(await repo.find(client, personal[0].id), null);
  });
});

test('team podium migration backfills completed results, preserves team medals and respects deletions', async () => {
  await withTransaction(async (client) => {
    const { tournament, players } = await teamPodiumFixture(client, 'backfill-podium');
    // Model the legacy catalog: three team medals, with an edit and a deletion.
    for (const place of [1, 2, 3]) {
      const { rows: [medal] } = await client.query(`INSERT INTO achievements
        (name,description,kind,emoji,tournament_id,place,category,text_edited,deleted_at)
        VALUES ($1,'Edited description','team','🏆',$2,$3,'title',TRUE,$4) RETURNING id`,
      [`Custom ${place}`, tournament.id, place, place === 3 ? '2026-11-17T10:00:00Z' : null]);
      await repo.award(client, medal.id, 'team', teamId, 1);
    }
    const existing = (await client.query('SELECT * FROM achievement_awards WHERE achievement_id IN (SELECT id FROM achievements WHERE tournament_id=$1) ORDER BY id', [tournament.id])).rows;
    const before = (await client.query('SELECT * FROM tournaments WHERE id=$1', [tournament.id])).rows[0];
    const pending = (await client.query(`INSERT INTO tournaments (slug,name,status,format,participant_mode,team_size,final_results)
      VALUES ('pending-podium','Pending','in_progress','swiss','team',3,$1::jsonb) RETURNING id`, [JSON.stringify(tournament.finalResults)])).rows[0];
    const migration = require('../../src/db/migrations/106_team_podium_players');
    await migration.up(client);
    await migration.up(client);
    const medals = (await repo.list(client)).filter(row => row.tournamentId === tournament.id);
    const personal = medals.filter(row => row.kind === 'player').sort((a, b) => a.place - b.place);
    assert.deepEqual(personal.map(row => row.place), [1, 2]);
    assert.deepEqual((await repo.recipients(client, personal[0].id)).map(row => row.userId), [players[0]]);
    assert.deepEqual((await repo.recipients(client, personal[1].id)).map(row => row.userId), [players[2]]);
    assert.deepEqual(medals.filter(row => row.kind === 'team').map(row => row.name).sort(), ['Custom 1', 'Custom 2']);
    const retained = (await client.query('SELECT * FROM achievement_awards WHERE id=ANY($1::int[]) ORDER BY id', [existing.map(row => row.id)])).rows;
    assert.deepEqual(retained, existing);
    assert.deepEqual((await client.query('SELECT * FROM tournaments WHERE id=$1', [tournament.id])).rows[0], before);
    assert.equal((await repo.list(client)).filter(row => row.tournamentId === pending.id).length, 0);
  });
});

test('podium publication works on the legacy schema before the personal medal migration', async () => {
  await withTransaction(async (client) => {
    await client.query('SAVEPOINT legacy_podium');
    try {
      // Restore the real pre-106 uniqueness contract inside a rolled-back savepoint.
      await client.query(`DELETE FROM achievements WHERE kind='player' AND tournament_id IN
        (SELECT tournament_id FROM achievements WHERE kind='team');
        DROP INDEX tournaments.achievements_tournament_place_kind;
        ALTER TABLE achievements ADD CONSTRAINT achievements_tournament_id_place_key UNIQUE(tournament_id,place)`);
      const { tournament, players } = await teamPodiumFixture(client, 'legacy-podium');
      await repo.syncPodium(client, tournament, 1);
      const legacy = (await repo.list(client)).filter(row => row.tournamentId === tournament.id);
      assert.equal(legacy.length, 3);
      assert.ok(legacy.every(row => row.kind === 'team'));
      await require('../../src/db/migrations/106_team_podium_players').up(client);
      const upgraded = (await repo.list(client)).filter(row => row.tournamentId === tournament.id);
      assert.deepEqual(upgraded.filter(row => row.kind === 'team').map(row => row.id).sort(), legacy.map(row => row.id).sort());
      const personal = upgraded.filter(row => row.kind === 'player').sort((a, b) => a.place - b.place);
      assert.equal(personal.length, 3);
      assert.deepEqual((await repo.recipients(client, personal[0].id)).map(row => row.userId), [players[0]]);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT legacy_podium');
    }
  });
});

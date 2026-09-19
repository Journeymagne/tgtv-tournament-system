const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const cups = require("../../src/api/tournaments");
const teams = require("../../src/api/team-tournaments");
const users = require("../../src/db/repositories/users");
const clubs = require("../../src/db/repositories/player-teams");
const matches = require("../../src/db/repositories/team-matches");
const games = require("../../src/db/repositories/games");
const live = require("../../src/api/tournament-live");
const { saveTableImage } = require("../../src/api/tournament-table-images");
const { pngImage } = require("../helpers/png");
let pool, client, admin, otherAdmin;
const PNG = `data:image/png;base64,${pngImage(300, 200).toString("base64")}`;
const tableSetup = [{ killzone: "Volkus", deployment: 1, imageData: PNG }, { killzone: "Gallowdark", deployment: 2 }, { killzone: "Octarius", deployment: 3 }];
const context = (cup, body = {}, user = admin) => ({ client, user, params: { id: cup.id }, body });
test.before(async () => { pool = new Pool({ connectionString: TEST_DATABASE_URL }); await migrate(pool); });
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  admin = await person("Live Admin", true);
  otherAdmin = await person("Other Admin", true);
});
test.afterEach(() => client.release());
async function person(name, isAdmin = false) { return users.insert(client, { name, passwordHash: "s:h", isAdmin, rating: 1000 }); }
async function club(n) {
  const people = await Promise.all([0, 1, 2].map(slot => person(`Player ${n} ${slot}`)));
  const team = await clubs.insert(client, { name: `Club ${n}`, nameKey: `club ${n}`, slug: `club-${n}`, leaderUserId: people[0].id, logoData: PNG });
  for (const [index, player] of people.entries()) await clubs.addMembership(client, team.id, player, index ? "member" : "leader");
  return { team, people, body: { teamId: team.id, captainUserId: people[0].id, members: people.map(player => ({ userId: player.id, faction: "Kommandos" })) } };
}
async function cup(limit = null) {
  const { body: { tournament } } = await cups.createAdmin({ client, user: admin, body: {
    name: "Live cup", description: "Tournament live tests", startsAt: "2026-09-19T12:00:00Z", format: "swiss", swissRoundCount: 3,
    participantMode: "team", teamSize: 3, registrationLimit: limit, logoData: PNG
  } });
  await cups.publishAdmin(context(tournament, { status: "registration_open" }));
  return tournament;
}

test("reserved rosters occupy capacity and are filled in place before start", async () => {
  const tournament = await cup(1);
  const group = await club(1);
  await assert.rejects(() => teams.registerRoster(context(tournament, { reserve: true, name: "Slot" }, group.people[1])), error => error.status === 403);
  const { body: { roster } } = await teams.registerRoster(context(tournament, { reserve: true, name: "Reserved slot" }));
  assert.equal(roster.isReserve, true);
  assert.equal(roster.members.length, 0);
  assert.equal((await cups.getPublic({ ...context(tournament), params: { slug: tournament.slug } })).rosters[0].id, roster.id);
  await assert.rejects(() => teams.registerRoster(context(tournament, group.body)), /Registration limit/);
  await cups.closeRegistration(context(tournament));
  await assert.rejects(() => cups.generateNextRoundAdmin(context(tournament, { tables: tableSetup })), /Incomplete/);
  await client.query("UPDATE tournament_team_rosters SET paid=TRUE WHERE id=$1", [roster.id]);
  const filled = await teams.updateRoster({ ...context(tournament, group.body, otherAdmin), params: { id: tournament.id, rosterId: roster.id } });
  assert.equal(filled.roster.id, roster.id);
  assert.equal(filled.roster.seed, roster.seed);
  assert.equal(filled.roster.paid, true);
  assert.equal(filled.roster.isReserve, false);
  assert.equal(filled.roster.members.length, 3);
});

test("non-owner admin restores first-round pairs and images; all roster members can follow pairing", async () => {
  const tournament = await cup();
  const groups = [];
  for (let n = 0; n < 4; n++) { const group = await club(n); groups.push(group); await teams.registerRoster(context(tournament, group.body)); }
  await cups.closeRegistration(context(tournament, {}, otherAdmin));
  const generated = await cups.generateNextRoundAdmin(context(tournament, { tables: tableSetup }, otherAdmin));
  await cups.startAdmin(context(tournament, {}, otherAdmin));
  const snapshot = await live.logo({ client, params: { kind: "roster", id: generated.rosters[0].id } });
  assert.deepEqual(snapshot.buffer, pngImage(300, 200), "starting must retain the stored logo, not save its display URL");
  for (const player of groups[0].people) assert.equal((await matches.listActivePairingsForCaptain(client, player.id)).length, 1);
  assert.equal((await matches.listActivePairingsForCaptain(client, otherAdmin.id)).length, 0);
  const first = generated.teamMatches[0];
  await assert.rejects(() => teams.roll({ ...context(tournament, {}, groups[0].people[1]), params: { id: tournament.id, matchId: first.id } }), error => error.status === 403);
  const rolled = await cups.rollbackLatestRoundAdmin(context(tournament, {}, otherAdmin));
  assert.equal(rolled.rounds.length, 0);
  assert.equal(rolled.tournament.roundDraft.tables[0].imageId, generated.tables[0].imageId);
  await assert.rejects(() => cups.rollbackLatestRoundAdmin(context(tournament)), /Finish editing the restored round/);
  const restored = await cups.generateNextRoundAdmin(context(tournament, {}, otherAdmin));
  assert.deepEqual(restored.teamMatches.map(m => [m.rosterAId, m.rosterBId]), generated.teamMatches.map(m => [m.rosterAId, m.rosterBId]));
  assert.equal(restored.tables[0].imageId, generated.tables[0].imageId);
  assert.equal(restored.tournament.roundDraft, null);
  const match = restored.teamMatches[0];
  const game = await games.insert(client, { sourceType: "team_match_game", sourceId: match.id, playerIds: [match.rosterA.members[0].userId, match.rosterB.members[0].userId] });
  await matches.insertGameLink(client, { teamMatchId: match.id, gameId: game.id, slot: 1, rosterAMemberId: match.rosterA.members[0].id, rosterBMemberId: match.rosterB.members[0].id, mission: {} });
  await client.query("UPDATE games SET status='pending_confirmation', pending_result='{}' WHERE id=$1", [game.id]);
  await assert.rejects(() => cups.rollbackLatestRoundAdmin(context(tournament)), /submitted team-match results/);
  assert.ok(await games.findById(client, game.id));
});

test("images survive terrain changes; compact replies do not repeat image data or match rosters", async () => {
  const tournament = await cup();
  const group = await club(1);
  await teams.registerRoster(context(tournament, group.body));
  const imageId = await saveTableImage(client, tournament.id, tableSetup[0]);
  assert.equal(await saveTableImage(client, tournament.id, { killzone: "Octarius", deployment: 6 }, { imageId, killzone: "Volkus", deployment: 1 }), imageId);
  assert.equal(await saveTableImage(client, tournament.id, { killzone: "Octarius", deployment: 6, imageId: null }, { imageId }), null);
  const full = await cups.getAdmin(context(tournament));
  const compact = await cups.getAdmin({ ...context(tournament), query: new URLSearchParams("compact=1") });
  assert.equal(compact.compactTeamTournament, true);
  assert.ok(!JSON.stringify(compact).includes("data:image"));
  assert.deepEqual(full.auditEvents, []);
  const image = await live.logo({ client, params: { kind: "tournament", id: tournament.id }, user: null });
  assert.deepEqual(image.buffer, pngImage(300, 200));
  const cached = await live.logo({ client, params: { kind: "tournament", id: tournament.id }, req: { headers: { "if-none-match": image.headers.ETag } } });
  assert.equal(cached.status, 304);
});

test("revision observes committed changes and stale admin edits are rejected", async () => {
  const tournament = await cup();
  const before = await live.revision({ client });
  const writer = await pool.connect();
  try {
    await writer.query("BEGIN");
    await writer.query("UPDATE tournaments SET name='Pending name' WHERE id=$1", [tournament.id]);
    const pending = await live.revision({ client });
    await writer.query("COMMIT");
    const committed = await live.revision({ client });
    assert.notEqual(before.revision, committed.revision);
    assert.notEqual(pending.revision, committed.revision, "a revision fetched before commit must not hide the subsequent commit");
  } finally { await writer.query("ROLLBACK"); writer.release(); }
  const current = await cups.getAdmin(context(tournament));
  await cups.updateAdmin(context(tournament, { name: "Other edit", expectedUpdatedAt: current.tournament.updatedAt }, otherAdmin));
  await assert.rejects(() => cups.updateAdmin(context(tournament, { name: "Stale edit", expectedUpdatedAt: current.tournament.updatedAt })), error => error.status === 409);
});

const roundTables = require("../../src/api/round-tables");
const rounds = require("../../src/db/repositories/tournament-rounds");
const roundTableInput = selected => selected.map(({ id, tableNumber, killzone, deployment, imageId }) => ({ id, tableNumber, killzone, deployment, imageId }));
async function preparedRound() {
  const tournament = await cup();
  for (let n = 0; n < 4; n++) { const group = await club(n); await teams.registerRoster(context(tournament, group.body)); }
  await cups.closeRegistration(context(tournament));
  const data = await cups.generateNextRoundAdmin(context(tournament, { tables: tableSetup }));
  const request = { ...context(tournament, {}, otherAdmin), params: { id: tournament.id, roundId: data.rounds[0].id } };
  const preview = await roundTables.getAdmin(request);
  return { tournament, data, request, preview };
}

test("editing prepared tables retains the round and pairings; Undo restores an editable numbered draft", async () => {
  const { tournament, data, request, preview } = await preparedRound();
  const selected = roundTableInput(preview.tables).map((table, index) => ({ ...table, tableNumber: 10 + index, deployment: 6 - index }));
  const saved = await roundTables.updateAdmin({ ...request, body: { tables: [...selected].reverse(), expectedUpdatedAt: preview.round.updatedAt } });
  assert.equal(saved.round.id, data.rounds[0].id);
  assert.deepEqual(saved.tables.map(table => table.tableNumber), [10, 11, 12]);
  assert.equal(saved.tables[0].imageId, preview.tables[0].imageId);
  const unchanged = await cups.getAdmin(context(tournament));
  assert.deepEqual(unchanged.teamMatches.map(match => [match.id, match.rosterAId, match.rosterBId, match.phase]),
    data.teamMatches.map(match => [match.id, match.rosterAId, match.rosterBId, match.phase]));
  assert.equal(unchanged.tournament.roundDraft, null);
  await assert.rejects(() => cups.rollbackLatestRoundAdmin(context(tournament, { roundId: 999999 })), error => error.status === 409);
  const undone = await cups.rollbackLatestRoundAdmin(context(tournament, { roundId: saved.round.id }, otherAdmin));
  assert.equal(undone.rounds.length, 0);
  assert.deepEqual(undone.tournament.roundDraft.tables.map(table => table.tableNumber), [10, 11, 12]);
  assert.equal(undone.tournament.roundDraft.tables[0].imageId, preview.tables[0].imageId);
  const resumed = await cups.previewNextRoundAdmin(context(tournament));
  assert.equal(resumed.restoredDraft, true);
  assert.deepEqual(resumed.tables.map(table => table.tableNumber), [10, 11, 12]);
  const [a, b] = data.teamMatches;
  const matchups = [{ rosterAId: a.rosterAId, rosterBId: b.rosterBId }, { rosterAId: b.rosterAId, rosterBId: a.rosterBId }];
  const regenerated = await cups.generateNextRoundAdmin(context(tournament, { matchups,
    tables: selected.map((table, index) => ({ ...table, tableNumber: 20 + index })) }));
  assert.deepEqual(regenerated.teamMatches.map(match => ({ rosterAId: match.rosterAId, rosterBId: match.rosterBId })), matchups);
  assert.deepEqual(regenerated.tables.map(table => table.tableNumber), [20, 21, 22]);
  assert.equal(regenerated.tables[0].imageId, preview.tables[0].imageId);
  await cups.startAdmin(context(tournament));
  const restored = await cups.getAdmin(context(tournament));
  assert.deepEqual(restored.teamMatches.map(match => match.id), regenerated.teamMatches.map(match => match.id));
});

test("editing active tables preserves pending/completed results, captain choices and other rounds", async () => {
  const { tournament, data, request } = await preparedRound();
  await cups.startAdmin(context(tournament));
  const first = data.teamMatches[0];
  const table = data.tables[0];
  const mission = { critOp: "Orb", killzone: table.killzone, layout: table.deployment, imageId: table.imageId };
  const assignments = [{ slot: 1, tableId: table.id, mission }];
  await matches.update(client, first.id, {
    phase: "in_progress", rollResult: 6, attackerRosterId: first.rosterAId,
    pairings: [{ slot: 1, rosterAMemberId: first.rosterA.members[0].id, rosterBMemberId: first.rosterB.members[0].id }],
    environment: { step: "complete", assignments },
    pairingHistory: [{ action: "environment", before: { phase: "environment_selection", environment: { step: 4, assignments } } }]
  });
  for (const [index, status] of ["pending_confirmation", "completed"].entries()) {
    const game = await games.insert(client, { sourceType: "team_match_game", sourceId: first.id, playerIds: [first.rosterA.members[index].userId, first.rosterB.members[index].userId] });
    await matches.insertGameLink(client, { teamMatchId: first.id, gameId: game.id, slot: index + 1,
      rosterAMemberId: first.rosterA.members[index].id, rosterBMemberId: first.rosterB.members[index].id, tableId: table.id, mission });
    await client.query("UPDATE games SET status=$2, pending_result=$3::jsonb, result=$4::jsonb, elo=$5::jsonb WHERE id=$1",
      [game.id, status, status === "pending_confirmation" ? '{"result":{"winner":"a"}}' : null,
        status === "completed" ? '{"winner":"b"}' : null, status === "completed" ? '{"delta":15}' : null]);
  }
  const before = await matches.findById(client, first.id);
  const gameRows = (await client.query("SELECT * FROM games ORDER BY id")).rows;
  const secondRound = await rounds.insert(client, { tournamentId: tournament.id, roundNumber: 2, status: "active", metadata: { tables: data.tables, missions: first.missions } });
  const later = await matches.insert(client, { tournamentId: tournament.id, roundId: secondRound.id, roundNumber: 2, bracketPosition: 1,
    rosterAId: first.rosterAId, rosterBId: first.rosterBId, tableIds: first.tableIds, missions: first.missions });
  const preview = await roundTables.getAdmin(request);
  const imageData = "data:image/png;base64," + pngImage(200, 300, [40, 100, 200]).toString("base64");
  const saved = await roundTables.updateAdmin({ ...request, body: { expectedUpdatedAt: preview.round.updatedAt,
    tables: roundTableInput(preview.tables).map((value, index) => ({ ...value, tableNumber: index + 50,
      deployment: 6, ...(index === 0 ? { killzone: "Tomb World", imageData } : {}) })) } });
  const after = await matches.findById(client, first.id);
  for (const field of ["id", "phase", "rollResult", "pairings", "attackerRosterId", "pairingRevision", "shieldAConfirmed", "tableIds"]) {
    assert.deepEqual(after[field], before[field], field + " must be preserved");
  }
  assert.deepEqual((await client.query("SELECT * FROM games ORDER BY id")).rows, gameRows);
  assert.equal(after.environment.assignments[0].mission.critOp, "Orb");
  assert.equal(after.environment.assignments[0].mission.killzone, "Tomb World");
  assert.equal(after.pairingHistory[0].before.environment.assignments[0].mission.killzone, "Tomb World");
  for (const link of after.games) {
    assert.equal(link.table.tableNumber, 50);
    assert.equal(link.mission.critOp, "Orb");
    assert.equal(link.mission.imageId, saved.tables[0].imageId);
    assert.equal(link.table.killzone, "Tomb World");
  }
  assert.notEqual(saved.tables[0].imageId, table.imageId);
  assert.deepEqual((await rounds.listByTournament(client, tournament.id)).find(round => round.id === secondRound.id), secondRound);
  assert.deepEqual(await matches.findById(client, later.id), { ...later, games: [] });
  const rosterView = await teams.getRoster({ ...context(tournament), params: { rosterId: first.rosterAId } });
  assert.equal(rosterView.teamMatches.find(match => match.id === first.id).games[0].table.tableNumber, 50);
  const imageRemoved = await roundTables.updateAdmin({ ...request, body: { expectedUpdatedAt: saved.round.updatedAt,
    tables: roundTableInput(saved.tables).map(value => ({ ...value, imageId: null })) } });
  assert.equal(imageRemoved.tables[0].imageId, null);
  assert.equal((await matches.findById(client, first.id)).games[0].mission.imageId, undefined);
  assert.equal((await rounds.listByTournament(client, tournament.id))[1].metadata.tables[0].imageId, table.imageId);
});

test("round table editor rejects pairings, invalid slots/numbers, non-admins, stale edits and foreign images", async () => {
  const { tournament, request, preview } = await preparedRound();
  const selected = roundTableInput(preview.tables);
  const body = { tables: selected, expectedUpdatedAt: preview.round.updatedAt };
  const spectator = await person("Spectator");
  await assert.rejects(() => roundTables.getAdmin({ ...request, user: spectator }), error => error.status === 403);
  await assert.rejects(() => roundTables.updateAdmin({ ...request, user: null, body }), error => error.status === 403);
  await assert.rejects(() => roundTables.getAdmin({ ...request, params: { ...request.params, roundId: 999999 } }), error => error.status === 404);
  for (const invalid of [
    { ...body, matchups: [] }, { ...body, expectedUpdatedAt: "stale" }, { tables: selected },
    { ...body, tables: selected.slice(1) },
    { ...body, tables: selected.map(value => ({ ...value, tableNumber: 1 })) },
    ...[0, -1, 1.2, true, 2147483648].map(tableNumber => ({ ...body, tables: selected.map((value, index) => index ? value : { ...value, tableNumber }) })),
    { ...body, tables: selected.map((value, index) => index ? value : { ...value, id: 999999 }) },
    { ...body, tables: selected.map(value => ({ ...value, rosterAId: 123 })) }
  ]) await assert.rejects(() => roundTables.updateAdmin({ ...request, body: invalid }));
  const other = await cup();
  const foreignImage = await saveTableImage(client, other.id, tableSetup[0]);
  await assert.rejects(() => roundTables.updateAdmin({ ...request, body: { ...body,
    tables: selected.map(value => ({ ...value, imageId: foreignImage })) } }), /does not belong/);
  assert.deepEqual(await roundTables.getAdmin(request), preview);
  const beforeImageCount = (await client.query("SELECT COUNT(*) FROM tournament_table_images")).rows;
  await client.query("BEGIN");
  try {
    const imageData = "data:image/png;base64," + pngImage(200, 200).toString("base64");
    await assert.rejects(() => roundTables.updateAdmin({ ...request, body: { ...body,
      tables: selected.map((value, index) => ({ ...value, imageData: index === 0 ? imageData : "invalid" })) } }));
  } finally { await client.query("ROLLBACK"); }
  assert.deepEqual((await client.query("SELECT COUNT(*) FROM tournament_table_images")).rows, beforeImageCount);
  const saved = await roundTables.updateAdmin({ ...request, body });
  await assert.rejects(() => roundTables.updateAdmin({ ...request, body }), error => error.status === 409);
  assert.deepEqual((await roundTables.getAdmin(request)).round, saved.round);
  await client.query("UPDATE tournaments SET status='completed' WHERE id=$1", [tournament.id]);
  await assert.rejects(() => roundTables.updateAdmin({ ...request, body: { ...body, expectedUpdatedAt: saved.round.updatedAt } }), error => error.status === 409);
});

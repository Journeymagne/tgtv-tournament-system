const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const migration = require("../../src/db/migrations/047_classic_player_points");
const tournaments = require("../../src/db/repositories/tournaments");
const rosters = require("../../src/db/repositories/team-rosters");
const matches = require("../../src/db/repositories/team-matches");
const games = require("../../src/db/repositories/games");
const achievements = require("../../src/db/repositories/achievements");

let pool, client, owner;
test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && /test/.test(target.pathname));
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(pool);
});
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  owner = (await client.query("INSERT INTO users(name,name_key,password_hash) VALUES('Owner','owner','unused') RETURNING id")).rows[0].id;
});
test.afterEach(async () => { await client.query("ROLLBACK"); client.release(); });
test.after(async () => { await pool?.end(); });

async function cup(label, count = 4, pairingType = "sword_shield_classic", order = ["vp_diff", "total_vp"]) {
  const tournament = (await client.query(`INSERT INTO tournaments
    (owner_user_id,slug,name,status,format,swiss_round_count,participant_mode,team_size,pairing_type,team_tiebreaker_order)
    VALUES($1,$2,$2,'completed','swiss',2,'team',3,$3,$4) RETURNING id`, [owner, label, pairingType, order])).rows[0];
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const name = `${label}-${index}`;
    const teamId = (await client.query("INSERT INTO player_teams(slug,name,name_key) VALUES($1,$1,$1) RETURNING id", [name])).rows[0].id;
    const members = [];
    for (let slot = 1; slot <= 3; slot += 1) {
      const player = `${name}-${slot}`;
      const userId = (await client.query("INSERT INTO users(name,name_key,password_hash) VALUES($1,$1,'unused') RETURNING id", [player])).rows[0].id;
      members.push({ userId, slot, displayNameSnapshot: player, factionSnapshot: "Kommandos" });
    }
    entries.push(await rosters.insert(client, {
      tournamentId: tournament.id, teamId, name, nameKey: name, teamNameSnapshot: name,
      captainUserId: members[0].userId, registeredByUserId: owner, seed: index + 1, status: "finished"
    }, members));
  }
  return { id: tournament.id, pairingType, entries, rounds: new Map(), positions: new Map() };
}

async function match(cup, roundNumber, aIndex, bIndex, totals, oldPoints = [3, 0], resolution = null) {
  if (!cup.rounds.has(roundNumber)) {
    const round = (await client.query("INSERT INTO tournament_rounds(tournament_id,round_number,status) VALUES($1,$2,'completed') RETURNING id", [cup.id, roundNumber])).rows[0];
    cup.rounds.set(roundNumber, round.id);
  }
  const a = cup.entries[aIndex], b = bIndex === null ? null : cup.entries[bIndex];
  const position = (cup.positions.get(roundNumber) || 0) + 1;
  cup.positions.set(roundNumber, position);
  const created = await matches.insert(client, {
    tournamentId: cup.id, roundId: cup.rounds.get(roundNumber), roundNumber,
    bracketPosition: position, rosterAId: a.id, rosterBId: b?.id ?? null, pairingType: cup.pairingType
  });
  for (let index = 0; index < totals.length; index += 1) {
    const memberA = a.members[index], memberB = b.members[index];
    const game = await games.insert(client, {
      playerIds: [memberA.userId, memberB.userId], sourceType: "team_match_game", sourceId: created.id
    });
    await games.saveFinalResult(client, game.id, {
      result: { scores: {
        [memberA.userId]: { total: totals[index][0], tac: 2 },
        [memberB.userId]: { total: totals[index][1], tac: 1 }
      } }, elo: { preserved: game.id }
    });
    await matches.insertGameLink(client, { teamMatchId: created.id, gameId: game.id, slot: index + 1,
      rosterAMemberId: memberA.id, rosterBMemberId: memberB.id, mission: {} });
  }
  await matches.update(client, created.id, { phase: "completed", resolution, completedAt: "2026-10-03T10:00:00.000Z",
    teamTournamentPointsA: oldPoints[0], teamTournamentPointsB: oldPoints[1], teamElo: { preserved: created.id } });
  return created.id;
}

async function publishOld(cup, order) {
  const finalResults = order.map((index, place) => ({ rank: place + 1, rosterId: cup.entries[index].id, teamTournamentPoints: 3 }));
  for (const row of finalResults) await rosters.update(client, row.rosterId, { finalPlace: row.rank });
  const updated = await tournaments.update(client, cup.id, { finalResults });
  await achievements.syncPodium(client, updated, owner);
}

async function podium(id) {
  return (await client.query(`SELECT a.place,w.team_id FROM achievements a JOIN achievement_awards w ON w.achievement_id=a.id
    WHERE a.tournament_id=$1 ORDER BY a.place,w.team_id`, [id])).rows;
}

test("migration 047 replaces historical Classic scores and published podiums, preserves tiebreakers and WTC, and is repeatable", async () => {
  const classic = await cup("classic-points");
  const [a, b, c, d] = classic.entries;
  const ids = [
    await match(classic, 1, 0, 2, [[21, 0], [21, 0], [21, 0]], [2, 0]),
    await match(classic, 1, 1, 3, [[21, 0], [21, 0], [0, 21]], [3, 0]),
    await match(classic, 2, 0, 3, [[21, 0], [21, 0], [0, 21]], [3, 0]),
    await match(classic, 2, 1, 2, [[21, 0], [21, 0], [8, 8]], [2, 0])
  ];
  await publishOld(classic, [1, 0, 2, 3]);
  const tied = await cup("classic-tied");
  await match(tied, 1, 0, 2, [[21, 20], [21, 21], [0, 21]], [1, 1]);
  await match(tied, 1, 1, 3, [[1, 0], [0, 0], [0, 1]], [1, 1]);
  await publishOld(tied, [0, 1, 2, 3]);
  const technical = await cup("classic-technical", 2);
  const bye = await match(technical, 1, 0, null, [], [2, 0], "bye");
  const forfeit = await match(technical, 2, 0, 1, [], [0, 3], "forfeit");
  const wtc = await cup("wtc-points", 2, "shield_sword", null);
  await match(wtc, 1, 0, 1, [[21, 0], [21, 0], [0, 21]], [2, 0]);
  await publishOld(wtc, [0, 1]);
  const wtcBefore = await matches.listByTournament(client, wtc.id);
  const wtcFinalBefore = (await tournaments.findById(client, wtc.id)).finalResults;
  const wtcPodiumBefore = await podium(wtc.id);
  const gamesBefore = (await client.query("SELECT * FROM games ORDER BY id")).rows;
  const identitiesBefore = (await client.query("SELECT * FROM game_participants ORDER BY id")).rows;
  const teamEloBefore = (await client.query("SELECT id,team_elo FROM tournament_team_matches ORDER BY id")).rows;

  await migration.up(client);
  for (const [index, expected] of [[0, [9, 0]], [1, [6, 3]], [2, [6, 3]], [3, [7, 1]]]) {
    const repaired = await matches.findById(client, ids[index]);
    assert.deepEqual([repaired.teamTournamentPointsA, repaired.teamTournamentPointsB], expected);
  }
  const final = (await tournaments.findById(client, classic.id)).finalResults;
  assert.deepEqual(final.map(row => [row.rosterId, row.rank, row.teamTournamentPoints]),
    [[a.id, 1, 15], [b.id, 2, 13], [d.id, 3, 6], [c.id, 4, 1]]);
  assert.equal(final.find(row => row.rosterId === b.id).individualWins, 4);
  assert.deepEqual((await rosters.listByTournament(client, classic.id)).map(row => [row.id, row.finalPlace]),
    [[a.id, 1], [b.id, 2], [c.id, 4], [d.id, 3]]);
  assert.deepEqual(await podium(classic.id), [{ place: 1, team_id: a.teamId }, { place: 2, team_id: b.teamId }, { place: 3, team_id: d.teamId }]);
  const tiedResult = await tournaments.findById(client, tied.id);
  assert.deepEqual(tiedResult.teamTiebreakerOrder, ["vp_diff", "total_vp"]);
  assert.deepEqual(tiedResult.finalResults.map(row => row.rosterId), [2, 1, 3, 0].map(index => tied.entries[index].id));
  assert.equal(tiedResult.finalResults.find(row => row.rosterId === tied.entries[0].id).totalVp, 42);
  assert.equal(tiedResult.finalResults.find(row => row.rosterId === tied.entries[1].id).totalVp, 1);
  for (const [id, expected] of [[bye, [9, 0]], [forfeit, [0, 9]]]) {
    const repaired = await matches.findById(client, id);
    assert.deepEqual([repaired.teamTournamentPointsA, repaired.teamTournamentPointsB], expected);
  }
  assert.deepEqual(await matches.listByTournament(client, wtc.id), wtcBefore);
  assert.deepEqual((await tournaments.findById(client, wtc.id)).finalResults, wtcFinalBefore);
  assert.deepEqual(await podium(wtc.id), wtcPodiumBefore);
  assert.deepEqual((await client.query("SELECT * FROM games ORDER BY id")).rows, gamesBefore);
  assert.deepEqual((await client.query("SELECT * FROM game_participants ORDER BY id")).rows, identitiesBefore);
  assert.deepEqual((await client.query("SELECT id,team_elo FROM tournament_team_matches ORDER BY id")).rows, teamEloBefore);

  await migration.up(client);
  assert.deepEqual((await tournaments.findById(client, classic.id)).finalResults, final);
  assert.deepEqual((await tournaments.findById(client, tied.id)).finalResults, tiedResult.finalResults);
  assert.deepEqual(await podium(classic.id), [{ place: 1, team_id: a.teamId }, { place: 2, team_id: b.teamId }, { place: 3, team_id: d.teamId }]);
});

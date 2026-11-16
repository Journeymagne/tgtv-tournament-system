const test = require('node:test');
const assert = require('node:assert/strict');
const { FACTION_RANKING_MIN_GAMES, seasons, wilsonScore } = require('../../public/game-data');
const { aggregateTeam, orderSummary } = require('../../src/domain/kill-team-statistics');
const { createHandler } = require('../../src/api/kill-team-statistics');
const team = 'Tempestus Aquilons', season = seasons[2];
function record(userId, games, wins = games, date = '2026-08-01') {
  return Array.from({ length: games }, (_, index) => ({ id: userId * 100 + index, status: 'completed',
    sourceType: 'challenge', submittedAt: date,
    players: [{ id: 1, userId, name: 'Player ' + userId }, { id: 2, userId: 999, name: 'Opponent' }],
    result: { winnerId: index < wins ? 1 : 2, scores: { 1: { faction: team }, 2: { faction: 'Kasrkin' } } } }));
}
function summary(games, options) { return orderSummary(aggregateTeam(team, games, season), options); }

test('nine games remain provisional, the tenth qualifies, and removing it revokes the place', () => {
  assert.equal(FACTION_RANKING_MIN_GAMES, 10);
  const games = record(10, 10);
  const before = summary(games.slice(0, 9));
  assert.equal(before.topPlayers.length, 0);
  assert.equal(before.provisionalPlayers[0].rank, null);
  assert.equal(before.provisionalPlayers[0].provisional, true);
  assert.equal(before.provisionalPlayers[0].wilsonScore, wilsonScore(9, 9));
  const eligible = summary(games);
  assert.equal(eligible.topPlayers[0].rank, 1);
  assert.equal(eligible.topPlayers[0].provisional, false);
  assert.equal(eligible.provisionalPlayers.length, 0);
  assert.deepEqual(summary(games.slice(0, 9)), before);
});

test('provisional high scores do not consume places or qualified top-five slots for any explicit sort', () => {
  const games = [...record(1, 9), ...record(2, 2), ...record(3, 8, 5)];
  for (let id = 10; id < 17; id++) games.push(...record(id, 10, id - 8));
  const raw = aggregateTeam(team, games, season);
  assert.deepEqual(raw.topPlayers.filter(row => !row.provisional).map(row => row.rank), [1, 2, 3, 4, 5, 6, 7]);
  for (const playerSort of ['rank', 'name', 'games', 'wins', 'winRate', 'wilsonScore']) {
    for (const playerDirection of ['asc', 'desc']) {
      const value = orderSummary(raw, { playerSort, playerDirection });
      assert.equal(value.topPlayers.length, 5);
      assert.ok(value.topPlayers.every(row => row.games >= 10 && row.rank >= 1));
      assert.ok(value.provisionalPlayers.every(row => row.games < 10 && row.rank === null));
    }
  }
});

test('API qualification uses all-time games independently of the current season', async () => {
  const games = [...record(10, 10, 7), ...record(11, 9)];
  const get = createHandler({ loadCompleted: async () => ({ games }), loadPublishedIds: async () => new Set(),
    getSeason: () => season, clock: () => Date.parse('2026-11-16') });
  const result = await get({ query: new URLSearchParams({ team }) });
  assert.equal(result.body.games, 0);
  assert.equal(result.body.topPlayers[0].games, 10);
  assert.equal(result.body.provisionalPlayers[0].games, 9);
  assert.equal(result.body.provisionalPlayers[0].rank, null);
});

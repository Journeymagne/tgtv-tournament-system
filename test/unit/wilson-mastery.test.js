const test = require('node:test');
const assert = require('node:assert/strict');
const { seasons, currentSeason, gameInSeason, wilsonScore } = require('../../public/game-data');
const { playerAchievements } = require('../../src/domain/wilson-achievements');
const { aggregateTeam, orderSummary } = require('../../src/domain/kill-team-statistics');
function game(id, { userId = 1, faction = 'Tempestus Aquilons', winnerId = 1, ...extra } = {}) {
  return { id, sourceType: 'challenge', status: 'completed', submittedAt: '2026-11-10T12:00:00Z',
    players: [{ id: 1, userId, name: 'Player' }, { id: 2, userId: 2, name: 'Opponent' }],
    result: { winnerId, scores: { 1: { faction }, 2: { faction: 'Kasrkin' } } }, ...extra };
}
const record = (wins, games, options) => Array.from({ length: games }, (_, i) =>
  game(i + 1, { ...options, winnerId: i < wins ? 1 : 2 }));
test('Wilson preserves precision, rewards evidence and handles an empty sample', () => {
  assert.equal(wilsonScore(0, 0), 0);
  assert.ok(Math.abs(wilsonScore(1, 1) - 20.6543) < 0.001);
  assert.ok(Math.abs(wilsonScore(9, 11) - 52.3014) < 0.001);
  assert.ok(wilsonScore(35, 50) > wilsonScore(3, 3));
  assert.ok(wilsonScore(70, 100) > wilsonScore(35, 50));
});
test('Q4 starts November 9 at local midnight, overriding earlier tournament tags after the boundary', () => {
  const q4 = seasons.find(s => s.id === '2026-q4-dataslate');
  assert.equal(q4.name, '2026 Q4');
  assert.equal(currentSeason('2026-11-08T19:59:59.999Z').id, seasons[1].id);
  assert.equal(currentSeason('2026-11-08T20:00:00Z').id, q4.id);
  for (const sourceType of ['challenge', 'tournament_match', 'team_match_game']) {
    const item = game(1, { sourceType, submittedAt: '2026-11-08T20:00:00Z', tournament: { seasonId: seasons[0].id } });
    assert.equal(gameInSeason(item, q4), true);
    assert.equal(gameInSeason(item, seasons[0]), false);
    assert.equal(gameInSeason(item, seasons[1]), false);
  }
  assert.equal(gameInSeason(game(1, { sourceType: 'tournament_match', submittedAt: '2026-11-08T19:59:59Z',
    tournament: { seasonId: seasons[0].id } }), seasons[0]), true);
});
test('mastery awards all qualifying faction tiers across all time and revokes them after losses', () => {
  const games = record(9, 11);
  assert.deepEqual(playerAchievements(games, 1).map(a => a.threshold), [50]);
  assert.deepEqual(playerAchievements(record(79, 100), 1).map(a => a.threshold), [50, 60, 70]);
  assert.deepEqual(playerAchievements([...games, ...record(0, 10)], 1), []);
  assert.deepEqual(playerAchievements([...games, ...record(0, 100, { faction: 'Deathwatch' })], 1)
    .map(a => a.team), ['Tempestus Aquilons']);
  assert.deepEqual(playerAchievements(games.map(g => ({ ...g, submittedAt: '2026-01-01' })), 1)
    .map(a => a.threshold), [50]);
});
test('a score displayed as 50.0 but below the raw threshold does not earn Experienced', () => {
  const score = wilsonScore(74, 126);
  assert.equal(score.toFixed(1), '50.0');
  assert.ok(score < 50);
  assert.deepEqual(playerAchievements(record(74, 126), 1), []);
});
test('mastery excludes proxies, guests, mirrors and incomplete games; draws stay in the denominator', () => {
  const games = record(9, 11), badge = playerAchievements(games, 1)[0];
  assert.equal(badge.games, 11); assert.equal(badge.wins, 9);
  assert.ok(Math.abs(badge.wilsonScore - 52.3014) < 0.001);
  for (const patch of [{ isProxy: true }, { hasProfile: false }, { userId: null }]) {
    assert.deepEqual(playerAchievements(games.map(g => ({ ...g, sourceType: 'tournament_match',
      players: [{ ...g.players[0], ...patch }, g.players[1]] })), 1), []);
  }
  assert.deepEqual(playerAchievements(games.map(g => ({ ...g, status: 'pending_confirmation' })), 1), []);
  assert.deepEqual(playerAchievements(games.map(g => ({ ...g, result: null })), 1), []);
  assert.deepEqual(playerAchievements(games.map(g => ({ ...g, result: { ...g.result,
    scores: { 1: { faction: 'Kasrkin' }, 2: { faction: 'Kasrkin' } } } })), 1), []);
  assert.deepEqual(playerAchievements([...games, game(15, { winnerId: null })], 1), []);
});
test('ranking uses Wilson and selects five players after ordering all candidates', () => {
  const games = record(35, 50);
  games.push(...record(3, 3, { userId: 3 }));
  for (let id = 4; id < 10; id++) games.push(...record(1, 1, { userId: id }));
  const summary = aggregateTeam('Tempestus Aquilons', games, seasons[2]);
  const top = orderSummary(summary).topPlayers;
  assert.equal(top.length, 1); assert.equal(top[0].userId, 1);
  assert.equal(orderSummary(summary).provisionalPlayers.length, 5);
  assert.ok(top[0].wilsonScore > orderSummary(summary).provisionalPlayers[0].wilsonScore);
  assert.equal(orderSummary(summary, { playerSort: 'winRate', playerDirection: 'desc' }).topPlayers[0].userId, 1);
});

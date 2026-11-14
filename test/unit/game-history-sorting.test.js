const test = require('node:test');
const assert = require('node:assert/strict');
const { sortHistory } = require('../../src/domain/game-history-sorting');
const query = values => new URLSearchParams(values);
function game(id, score, opponent, extra = {}) {
  return { id, submittedAt: `2026-10-0${id}`, players: [{ id: 2, userId: 2, name: opponent }, { id: 1, userId: 1, name: 'Owner' }],
    result: { scores: { 1: { total: score, faction: id === 1 ? 'Zulu' : 'Alpha' }, 2: { total: 1 } } },
    elo: { 1: { delta: score } }, ...extra };
}
test('owner history columns use the owner side, numeric comparison and missing values last in both directions', () => {
  const values = [game(1, 2, 'Zulu'), game(2, 10, 'Alpha'), game(3, undefined, 'Beta')];
  for (const key of ['score', 'vpDiff', 'elo']) {
    assert.deepEqual(sortHistory(values, query({ historySort: key, historyDirection: 'desc' }), 1).map(row => row.id), [2, 1, 3]);
    assert.deepEqual(sortHistory(values, query({ historySort: key, historyDirection: 'asc' }), 1).map(row => row.id), [1, 2, 3]);
  }
  assert.deepEqual(sortHistory(values, query({ historySort: 'opponent', historyDirection: 'desc' }), 1).map(row => row.id), [1, 3, 2]);
  assert.deepEqual(sortHistory(values, query({ historySort: 'faction', historyDirection: 'desc' }), 1).map(row => row.id), [1, 3, 2]);
  assert.deepEqual(values.map(row => row.id), [1, 2, 3]);
});
test('default and invalid history order preserve existing sequence', () => {
  const values = [game(2, 10, 'Alpha'), game(1, 2, 'Zulu')];
  assert.deepEqual(sortHistory(values, query({})), values);
  assert.deepEqual(sortHistory(values, query({ historySort: '__proto__' })), values);
  assert.deepEqual(sortHistory(values, query({ historySort: 'score', historyDirection: 'sideways' })), values);
});

test('history metadata and opponent VP sort raw values with missing metadata last', () => {
  const values = [game(1, 2, 'A', { tournament: { name: 'Zulu cup' }, tournamentMatch: { roundNumber: 2 }, status: 'pending_confirmation' }),
    game(2, 2, 'B', { tournament: { name: 'Alpha cup' }, teamMatch: { roundNumber: 10 }, status: 'completed' }),
    game(3, 2, 'C')];
  values[0].result.scores[2].total = 2;
  values[1].result.scores[2].total = 10;
  delete values[2].result.scores[2].total;
  for (const [key, direction, expected] of [
    ['tournament', 'asc', [2, 1, 3]], ['tournament', 'desc', [1, 2, 3]],
    ['round', 'asc', [1, 2, 3]], ['round', 'desc', [2, 1, 3]],
    ['opponentScore', 'asc', [1, 2, 3]], ['opponentScore', 'desc', [2, 1, 3]],
    ['status', 'asc', [2, 1, 3]], ['status', 'desc', [1, 2, 3]]
  ]) assert.deepEqual(sortHistory(values, query({ historySort: key, historyDirection: direction }), 1).map(row => row.id), expected, key + direction);
});

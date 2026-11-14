const test = require('node:test');
const assert = require('node:assert/strict');
const tables = require('../../public/tournament-tables');

test('table sorting compares numeric records and keeps absent text/numbers last', () => {
  const rows = [
    { index: 0, values: [tables.sortValue('—', 'text'), tables.sortValue('—')] },
    { index: 1, values: [tables.sortValue('Zulu', 'text'), tables.sortValue('2%')] },
    { index: 2, values: [tables.sortValue('Alpha', 'text'), tables.sortValue('10%')] }
  ];
  for (const direction of ['asc', 'desc']) {
    assert.equal(tables.sortRows(rows, 0, direction).at(-1).index, 0);
    assert.equal(tables.sortRows(rows, 1, direction).at(-1).index, 0);
  }
  assert.deepEqual(tables.sortRows(rows, 1, 'desc').map(row => row.index), [2, 1, 0]);
  assert.deepEqual(tables.sortValue('2-1-3', 'record'), [2, 1, -3]);
  assert.equal(tables.sortValue('2026-11-14T12:00:00Z', 'date'), Date.parse('2026-11-14T12:00:00Z'));
});

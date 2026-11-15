const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sorting = require('../../public/miniapp/sorting');

const source = fs.readFileSync(require.resolve('../../public/miniapp/app'), 'utf8');
function appFunction(name, context) {
  const plain = source.indexOf('  function ' + name + '(');
  const start = plain < 0 ? source.indexOf('  async function ' + name + '(') : plain;
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n  (?:async )?function /);
  const end = next < 0 ? start + rest.indexOf('\n  }\n') + 5 : start + next + 1;
  return vm.runInNewContext(source.slice(start, end) + '\n' + name, context);
}

test('every Mini App standings column sorts numerically or by name without changing official ranks', () => {
  assert.deepEqual(Object.keys(sorting.columns.standings), ['rank', 'name', 'points', 'totalVp', 'strengthOfSchedule']);
  assert.deepEqual(Object.keys(sorting.columns), ['standings']);
  for (const [surface, fields] of Object.entries(sorting.columns)) {
    if (surface !== 'standings') continue;
    for (const [key, type] of Object.entries(fields)) {
      const rows = [{ rank: 8, [key]: type === 'text' ? 'Zulu' : '12' }, { rank: 3, [key]: type === 'text' ? 'Alpha' : '2' }];
      const original = JSON.stringify(rows);
      assert.equal(sorting.sortRows(rows, { key, direction: 'asc' }, fields)[0], rows[1], surface + ':' + key);
      assert.equal(sorting.sortRows(rows, { key, direction: 'desc' }, fields)[0], rows[0]);
      assert.equal(JSON.stringify(rows), original);
    }
  }
  const rows = [{ rank: 8, name: 'Zulu' }, { rank: 3, name: 'Alpha' }];
  assert.deepEqual(sorting.sortRows(rows, { key: 'name', direction: 'asc' }, sorting.columns.standings).map(r => r.rank), [3, 8]);
});

test('table headers expose every column, current direction and keyboard buttons', () => {
  const context = { state: { detail: { tournament: { participantMode: 'team' } } },
    sortView: () => ({ key: 'points', direction: 'desc' }), esc: String, tr: key => key };
  context.sortHeading = appFunction('sortHeading', context);
  const html = appFunction('standingsHead', context)();
  for (const key of ['rank', 'name', 'points', 'totalVp', 'strengthOfSchedule']) assert.ok(html.includes('data-sort-key="' + key + '"'));
  assert.ok(html.includes('aria-sort="descending"'));
  assert.ok(html.includes('type="button"'));
  assert.ok(html.includes(' ↓'));
});

test('missing scores stay last in both directions, ties are stable, and resetting preserves source order', () => {
  const rows = [{ points: null }, { points: '2' }, { points: '' }, { points: 2 }, { points: 12 }, { points: undefined }];
  for (const direction of ['asc', 'desc']) {
    const ordered = sorting.sortRows(rows, { key: 'points', direction }, sorting.columns.standings);
    assert.deepEqual(ordered.slice(-3), [rows[0], rows[2], rows[5]]);
    assert.ok(ordered.indexOf(rows[1]) < ordered.indexOf(rows[3]));
  }
  const standings = { key: null, direction: 'asc' }, operations = { key: null, direction: 'asc' };
  sorting.toggle(standings, 'points', sorting.columns.standings);
  assert.equal(standings.direction, 'desc');
  assert.equal(operations.key, null);
  sorting.toggle(standings, 'points', sorting.columns.standings);
  assert.equal(standings.direction, 'asc');
  standings.key = null;
  assert.deepEqual(sorting.sortRows(rows, standings, sorting.columns.standings), rows);
});

test('standings render preserves published place and sorts filtered rows using raw scores', () => {
  const rows = [{ rank: 1, name: 'A', points: 2 }, { rank: 7, name: 'B', points: 12 }, { rank: 9, name: 'C', points: null }];
  const tableBody = appFunction('tableBody', { standingsRows: () => rows, state: { query: '', onlyMine: false }, locale: 'en',
    sortView: () => ({ key: 'points', direction: 'desc' }), ordering: sorting, esc: value => String(value ?? ''), tr: x => x });
  const html = tableBody();
  assert.ok(html.indexOf('>7</span>') < html.indexOf('>1</span>'));
  assert.ok(html.indexOf('>1</span>') < html.indexOf('>9</span>'));
});

test('sorting restores focus to the replacement column button for keyboard navigation', () => {
  let focused = false;
  const context = { document: { activeElement: { isConnected: false, dataset: { sortSurface: 'standings', sortKey: 'points' } },
    getElementById: () => ({ innerHTML: '' }), querySelector: selector => {
      assert.equal(selector, '[data-sort-surface="standings"][data-sort-key="points"]');
      return { focus() { focused = true; } };
    } }, tableBody: () => '', standingsHead: () => '' };
  appFunction('updateSortedSurface', context)('standings');
  assert.equal(focused, true);
});

test('Mini App only enables matching tagged standings controls', () => {
  const scope = appFunction('statisticsSortScope', {});
  for (const [tag, surface, expected] of [[null, 'standings', false], ['', 'standings', false], ['operations', 'standings', false], ['standings', 'standings', true], ['operations', 'operations', false]]) {
    assert.equal(scope({ closest: () => tag === null ? null : { dataset: { statisticsTable: tag } } }, surface), expected);
  }
});

test('operation breakdown retains participant order and has no sorting controls', () => {
  const game = { players: [{ id: 1, name: 'Zulu' }, { id: 2, name: 'Alpha' }] };
  const render = appFunction('operationScores', { scores: () => ({ 1: { crit: 2, primaryBonus: 2 }, 2: { crit: 4, primaryBonus: 0 } }), esc: String, tr: String });
  const html = render(game);
  assert.ok(html.indexOf('Zulu') < html.indexOf('Alpha'));
  assert.ok(html.includes('>2</td>'));
  assert.doesNotMatch(html, /data-sort-|sort-button|sort-reset|data-statistics-table/);
});

test('Mini App captain pairings retain server order and ignore obsolete sort state', () => {
  const render = appFunction('pairingList', { state: { slug: 'cup', data: { teamPairings: [
    { id: 1, tournament: { slug: 'cup' }, rosterA: { name: 'Zulu' }, rosterB: { name: 'Z' } },
    { id: 2, tournament: { slug: 'cup' }, rosterA: { name: 'Alpha' }, rosterB: { name: 'A' } }
  ] } }, websiteButton: (url, name) => name });
  assert.equal(render(), 'Zulu — ZAlpha — A');
});

test('old unsupported Mini App sort surfaces cannot update work lists or forms', () => {
  const update = appFunction('updateSortedSurface', { document: { get activeElement() { throw Error('Work-list sorting is disabled'); } } });
  for (const surface of ['operations', 'pairings', 'tournamentGames', 'otherGames', 'profileGames']) update(surface);
});

test('only the Mini App standings screen has an explicit statistics tag', () => {
  assert.match(source, /data-statistics-table="standings"/);
  assert.doesNotMatch(source, /gameOrderControls|orderedGames|profileSummaryPath|historySort/);
});

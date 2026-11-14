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
  const end = start + rest.slice(1).search(/\n  (?:async )?function /) + 1;
  return vm.runInNewContext(source.slice(start, end) + '\n' + name, context);
}

test('every Mini App standings and operation score column sorts numerically or by name without changing official ranks', () => {
  assert.deepEqual(Object.keys(sorting.columns.standings), ['rank', 'name', 'points', 'totalVp', 'strengthOfSchedule']);
  assert.deepEqual(Object.keys(sorting.columns.operations), ['name', 'crit', 'kill', 'tac', 'primaryBonus']);
  for (const [surface, fields] of Object.entries(sorting.columns)) {
    if (!['standings', 'operations'].includes(surface)) continue;
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

test('game lists sort all loaded games before their display limit, keeping each surface independent', () => {
  const games = Array.from({ length: 9 }, (_, index) => ({ id: index + 1, players: [{ id: 1, name: 'Me' }], status: 'completed', round: index + 1, points: index + 1 }));
  const views = { tournamentGames: { key: 'score', direction: 'desc' }, otherGames: { key: 'round', direction: 'asc' } };
  const ordered = appFunction('orderedGames', { ordering: sorting, sortView: surface => views[surface], locale: 'en',
    roundOf: g => g.round, scores: g => ({ 1: { total: g.points } }), playerIsMe: () => true, tr: x => x, statuses: {} });
  assert.equal(ordered(games, 'tournamentGames').slice(0, 4)[0].id, 9);
  assert.equal(ordered(games, 'otherGames')[0].id, 1);
});

test('updating a list changes only its container and never rerenders an unsaved result form', () => {
  const container = { innerHTML: '' }, form = { innerHTML: 'unsaved' };
  const update = appFunction('updateSortedSurface', { state: {},
    document: { querySelector: () => container, getElementById: () => form },
    gameOrderControls: () => 'controls', orderedGames: rows => rows, matchLink: g => String(g.id), gamesForSelection: () => [{ id: 5 }] });
  update('tournamentGames');
  assert.equal(container.innerHTML, 'controls5');
  assert.equal(form.innerHTML, 'unsaved');
});

test('Mini App profile requests ordering before the server limits history to five games', () => {
  const view = { key: 'score', direction: 'desc' };
  const path = appFunction('profileSummaryPath', { sortView: () => view, URLSearchParams });
  const query = new URL(path(), 'http://localhost').searchParams;
  assert.equal(query.get('historySort'), 'score');
  assert.equal(query.get('historyDirection'), 'desc');
  view.key = null;
  assert.equal(path(), '/summary');
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

test('profile sorting ignores stale responses and keeps the newest server-selected games', async () => {
  const pending = [], container = { innerHTML: '', isConnected: true, setAttribute() {} };
  const state = { data: { profile: { recentGames: [] } } };
  const refresh = appFunction('refreshProfileGames', { state, profileSortSequence: 0,
    profileSummaryPath: () => '/summary?historySort=score&historyDirection=desc',
    document: { querySelector: () => container }, route: () => ({ screen: 'profile' }),
    api: () => new Promise(resolve => pending.push(resolve)), gameOrderControls: () => 'controls', matchLink: g => String(g.id), showError: assert.fail });
  const first = refresh(), second = refresh();
  pending[1]({ profile: { recentGames: [{ id: 9 }] } });
  await second;
  pending[0]({ profile: { recentGames: [{ id: 2 }] } });
  await first;
  assert.equal(container.innerHTML, 'controls9');
  assert.deepEqual(state.data.profile.recentGames, [{ id: 9 }]);
});

test('a summary started before a new profile sort cannot overwrite that sort after it completes', async () => {
  const pending = [], container = { innerHTML: '', isConnected: true, setAttribute() {} };
  const current = { user: { id: 1 }, locale: 'en', profile: { recentGames: [{ id: 1 }] } };
  const state = { sequence: 0, user: current.user, data: current, slug: null };
  const view = { key: null, direction: 'asc' };
  let renders = 0;
  const context = { state, profileSortSequence: 0, URLSearchParams,
    sortView: () => view, content: { setAttribute() {} }, connection: { hidden: true }, tg: null,
    document: { querySelector: () => container }, route: () => ({ screen: 'profile' }),
    api: path => new Promise(resolve => pending.push({ path, resolve })),
    gameOrderControls: () => 'controls', matchLink: g => String(g.id), showError: assert.fail,
    chooseDefault() {}, applyLocale() {}, rememberSelection() {}, render() { renders++; } };
  context.profileSummaryPath = appFunction('profileSummaryPath', context);
  const load = appFunction('loadScreen', context), refresh = appFunction('refreshProfileGames', context);
  const oldSummary = load({ refresh: true, silent: true });
  assert.equal(pending[0].path, '/summary');
  Object.assign(view, { key: 'score', direction: 'desc' });
  const newSort = refresh();
  assert.match(pending[1].path, /historySort=score/);
  pending[1].resolve({ ...current, profile: { recentGames: [{ id: 9 }] } });
  await newSort;
  pending[0].resolve({ ...current, profile: { recentGames: [{ id: 2 }] } });
  await oldSummary;
  assert.deepEqual(state.data.profile.recentGames, [{ id: 9 }]);
  assert.equal(container.innerHTML, 'controls9');
  assert.equal(renders, 0, 'obsolete summary must not rerender the profile');
});

test('a sort/reset cycle rejects an older summary even when its requested path matches again', async () => {
  let finish;
  const busy = [];
  const original = { user: { id: 1 }, profile: { recentGames: [{ id: 9 }] } };
  const state = { sequence: 0, user: original.user, data: original };
  const context = { state, profileSortSequence: 0, profileSummaryPath: () => '/summary',
    content: { setAttribute(name, value) { if (name === 'aria-busy') busy.push(value); } }, api: () => new Promise(resolve => { finish = resolve; }),
    route: () => ({ screen: 'profile' }), document: {}, connection: {}, tg: null,
    chooseDefault() {}, applyLocale() {}, rememberSelection() {}, render: assert.fail, showError: assert.fail };
  const pending = appFunction('loadScreen', context)({ refresh: true });
  context.profileSortSequence += 2;
  finish({ ...original, profile: { recentGames: [{ id: 2 }] } });
  await pending;
  assert.equal(state.data, original);
  assert.deepEqual(busy, ['true', 'false']);
});

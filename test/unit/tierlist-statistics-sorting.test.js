const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../../public/tierlist/tierlist'), 'utf8');
function loadFunction(name, context) {
  const start = source.indexOf('  function ' + name + '(');
  const asyncStart = source.indexOf('  async function ' + name + '(');
  const at = start < 0 ? asyncStart : start;
  const remaining = source.slice(at);
  const end = remaining.slice(1).search(/\n  (?:async )?function /) + 1;
  return vm.runInNewContext(remaining.slice(0, end) + '\n' + name, context);
}

test('tierlist-only teams show unavailable statistics without calling the tournament API', async () => {
  const teamStats = { serial: 0, cache: new Map() };
  let renders = 0;
  const context = { teamStats,
    state: { selected: 'strike-force-variel', teamsById: new Map([
      ['strike-force-variel', { name: 'Strike Force Variel', statsAvailable: false }]
    ]) },
    cancelTeamStats() { teamStats.serial++; teamStats.data = null; },
    renderTeamStats() { renders++; },
    statsQuery() { assert.fail('Unsupported teams must not request tournament statistics'); },
    fetch() { assert.fail('Unsupported teams must not call the statistics API'); }
  };
  await loadFunction('loadTeamStats', context)('strike-force-variel');
  assert.equal(teamStats.teamId, 'strike-force-variel');
  assert.equal(teamStats.status, 'unavailable');
  assert.equal(teamStats.data, null);
  assert.equal(renders, 1);
});

test('shuffling changes the whole unranked pool as one undoable edit', () => {
  const rows = { S: ['ranked'], A: [], B: [], C: [], F: [], pool: ['one', 'two', 'three'] };
  const state = { record: { rows }, busy: false };
  const history = [], drafts = [];
  const shuffle = loadFunction('shufflePool', { state, Math: { floor: Math.floor, random: () => 0 },
    remember: () => history.push(structuredClone(rows)),
    persist: () => drafts.push(structuredClone(rows)), render() {}, toast() {}, t: key => key });
  shuffle();
  assert.deepEqual(Array.from(rows.pool), ['two', 'three', 'one']);
  assert.deepEqual(rows.S, ['ranked']);
  assert.deepEqual(history.map(snapshot => snapshot.pool), [['one', 'two', 'three']]);
  assert.deepEqual(drafts.map(snapshot => snapshot.pool), [['two', 'three', 'one']]);
  state.busy = true;
  shuffle();
  state.busy = false;
  rows.pool = ['one'];
  shuffle();
  assert.equal(history.length, 1);
});

test('tierlist asks the server to select each top three from all candidates and caches each sort combination separately', async () => {
  const requests = [], data = { team: 'Test Team', season: { name: 'Latest' }, games: 5, topPlayers: [], topTacOps: [] };
  const teamStats = { serial: 0, cache: new Map(), playerSort: { key: 'winRate', direction: 'desc' }, tacOpSort: { key: 'winRate', direction: 'desc' } };
  const context = { teamStats, state: { selected: 'team', teamsById: new Map([['team', { name: data.team }]]) },
    cancelTeamStats() { teamStats.serial++; }, renderTeamStats() {}, AbortController, URLSearchParams, setTimeout, clearTimeout,
    fetch: async url => { requests.push(url); return { ok: true, json: async () => data, headers: { get: () => 'max-age=60' } }; } };
  context.statsQuery = loadFunction('statsQuery', context);
  const load = loadFunction('loadTeamStats', context);
  await load('team');
  teamStats.playerSort = { key: 'games', direction: 'asc' };
  await load('team');
  teamStats.tacOpSort = { key: 'avgPoints', direction: 'desc' };
  await load('team');
  assert.equal(requests.length, 3);
  const query = new URL(requests[2], 'http://localhost').searchParams;
  assert.equal(query.get('playerSort'), 'games');
  assert.equal(query.get('playerDirection'), 'asc');
  assert.equal(query.get('tacOpSort'), 'avgPoints');
  assert.equal(query.get('tacOpDirection'), 'desc');
  await load('team');
  assert.equal(requests.length, 3, 'same sorting uses the corresponding cached ranking');
  teamStats.seasonId = 'past';
  const past = { ...data, season: { id: 'past', name: 'Past', endsAt: '2020-01-01' }, games: 1 };
  context.fetch = async url => { requests.push(url); return { ok: true, json: async () => past, headers: { get: () => 'max-age=60' } }; };
  await load('team');
  assert.equal(new URL(requests[3], 'http://localhost').searchParams.get('seasonId'), 'past');
  assert.equal(teamStats.data.games, 1);
  await load('team');
  teamStats.seasonId = '';
  await load('team');
  assert.equal(teamStats.data.games, 5);
  assert.equal(requests.length, 4, 'both the historical and default results are cached separately');
});

test('tierlist columns and reset independently change one ranking while preserving the other', async () => {
  let loads = 0;
  const teamStats = { playerSort: { key: 'winRate', direction: 'desc' }, tacOpSort: { key: 'games', direction: 'asc' } };
  const change = loadFunction('changeStatsSort', { teamStats, state: { selected: 'team' }, loadTeamStats: () => { loads++; } });
  change('players', 'name');
  assert.equal(teamStats.playerSort.key, 'name');
  assert.equal(teamStats.playerSort.direction, 'asc');
  assert.equal(teamStats.tacOpSort.key, 'games');
  change('players', 'name');
  assert.equal(teamStats.playerSort.direction, 'desc');
  change('players', null);
  assert.equal(teamStats.playerSort.key, 'wilsonScore');
  assert.equal(teamStats.playerSort.direction, 'desc');
  assert.equal(teamStats.tacOpSort.direction, 'asc');
  assert.equal(loads, 3);
});

test('all-time player rankings remain visible when the current season has no games', () => {
  const targets = new Map();
  const get = id => {
    if (!targets.has(id)) targets.set(id, { hidden: false, dataset: {}, setAttribute() {}, getAttribute() { return null; } });
    return targets.get(id);
  };
  const current = { id: 'q4', name: 'Q4' }, previous = { id: 'q3', name: 'Q3' };
  targets.set('team-stats-season', { options: [], replaceChildren(...options) { this.options = options; } });
  const context = { teamStats: { teamId: 'aquilons', status: 'ready', data: { season: current, availableSeasons: [current, previous],
    games: 0, winRate: null, topPlayers: [{ userId: 1, games: 11, wins: 9, wilsonScore: 52.3014 }], topTacOps: [] } },
    state: { selected: 'aquilons', teamsById: new Map([['aquilons', { id: 'aquilons', name: 'Tempestus Aquilons' }]]) },
    $: get, t: key => key, locale: () => 'en', statsPercent: () => '—', location: { origin: 'http://localhost' }, URL,
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    renderStatsRows() {}, positionTeamStats() {}, cancelTeamStats() {} };
  loadFunction('renderTeamStats', context)();
  assert.equal(get('team-stats-rankings').hidden, false);
  assert.equal(get('team-stats-empty').hidden, false);
  assert.equal(get('team-stats-season-field').hidden, false);
  assert.deepEqual(get('team-stats-season').options.map(option => option.value), ['q4', 'q3']);
  assert.equal(get('team-stats-season').value, 'q4');
  context.teamStats.data.topPlayers = [];
  context.teamStats.data.provisionalPlayers = [{ userId: 1, games: 9, rank: null, provisional: true }];
  loadFunction('renderTeamStats', context)();
  assert.equal(get('team-stats-rankings').hidden, false);
  assert.equal(get('team-stats-provisional').hidden, false);
});

test('tierlist tables render all accessible sortable columns, raw numeric metrics and profile links', () => {
  function element(tag) {
    return { tag, children: [], dataset: {}, attributes: {}, textContent: '',
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(key, value) { this.attributes[key] = value; },
      get childElementCount() { return this.children.length; } };
  }
  const targets = { 'team-stats-players': element('div'), 'team-stats-tacops': element('div'), 'team-stats-provisional-players': element('div') };
  const teamStats = { playerSort: { key: 'games', direction: 'asc' }, tacOpSort: { key: 'avgPoints', direction: 'desc' } };
  const render = loadFunction('renderStatsRows', { teamStats, $: id => targets[id],
    document: { createElement: element, createTextNode: text => ({ textContent: text }) },
    t: key => key === 'statsProvisionalShort' ? 'prov.' : key, locale: () => 'en', statsPercent: value => value + '%', window: {}, location: { origin: 'http://localhost' }, URL });
  function descendants(node) { return [node, ...(node.children?.flatMap(descendants) || [])]; }
  render('team-stats-players', [{ userId: 7, name: '<Player>', rank: 1, games: 12, wins: 9, winRate: 75 }], true);
  render('team-stats-provisional-players', [{ userId: 8, name: 'Provisional', rank: null, games: 2, wins: 2, winRate: 100, wilsonScore: 34.2 }], true, true);
  render('team-stats-tacops', [{ name: 'Op', games: 10, wins: 6, winRate: 60, avgPoints: 4.2 }]);
  for (const [id, fields, direction] of [
    ['team-stats-players', ['name', 'games', 'wins', 'winRate', 'wilsonScore'], 'ascending'],
    ['team-stats-tacops', ['name', 'games', 'wins', 'winRate', 'avgPoints'], 'descending']
  ]) {
    const nodes = descendants(targets[id]);
    assert.deepEqual(nodes.filter(n => n.dataset?.statsKey).map(n => n.dataset.statsKey), fields);
    assert.equal(nodes.filter(n => n.tag === 'table').length, 1);
    assert.ok(nodes.some(n => n.attributes?.['aria-sort'] === direction));
    assert.ok(nodes.some(n => n.dataset?.statsReset));
  }
  const player = descendants(targets['team-stats-players']).find(n => n.tag === 'a');
  assert.equal(player.textContent, '<Player>');
  assert.equal(player.href, 'http://localhost/tournament#/players/7');
  assert.ok(descendants(targets['team-stats-players']).some(node => node.tag === 'span' && node.textContent === '1. '));
  const provisionalNodes = descendants(targets['team-stats-provisional-players']);
  assert.ok(provisionalNodes.some(node => node.textContent === '34.2 · prov.'));
  const provisionalRow = provisionalNodes.find(node => node.tag === 'tr' && node.dataset.provisional === 'true');
  assert.equal(provisionalRow.children[0].children.length, 1, 'provisional name has no place prefix');
});

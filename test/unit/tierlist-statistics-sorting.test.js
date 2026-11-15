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
  assert.equal(teamStats.playerSort.key, 'winRate');
  assert.equal(teamStats.playerSort.direction, 'desc');
  assert.equal(teamStats.tacOpSort.direction, 'asc');
  assert.equal(loads, 3);
});

test('tierlist tables render all accessible sortable columns, raw numeric metrics and profile links', () => {
  function element(tag) {
    return { tag, children: [], dataset: {}, attributes: {}, textContent: '',
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(key, value) { this.attributes[key] = value; },
      get childElementCount() { return this.children.length; } };
  }
  const targets = { 'team-stats-players': element('div'), 'team-stats-tacops': element('div') };
  const teamStats = { playerSort: { key: 'games', direction: 'asc' }, tacOpSort: { key: 'avgPoints', direction: 'desc' } };
  const render = loadFunction('renderStatsRows', { teamStats, $: id => targets[id],
    document: { createElement: element, createTextNode: text => ({ textContent: text }) },
    t: key => key, locale: () => 'en', statsPercent: value => value + '%', window: {}, location: { origin: 'http://localhost' }, URL });
  function descendants(node) { return [node, ...(node.children?.flatMap(descendants) || [])]; }
  render('team-stats-players', [{ userId: 7, name: '<Player>', games: 12, wins: 9, winRate: 75 }], true);
  render('team-stats-tacops', [{ name: 'Op', games: 10, wins: 6, winRate: 60, avgPoints: 4.2 }]);
  for (const [id, fields, direction] of [
    ['team-stats-players', ['name', 'games', 'wins', 'winRate'], 'ascending'],
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
});

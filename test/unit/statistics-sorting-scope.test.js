const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tables = require('../../public/tournament-tables');
const source = fs.readFileSync(require.resolve('../../public/app'), 'utf8');
const fn = name => {
  const code = source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0];
  assert.ok(code, name);
  return code;
};

test('table enhancement leaves untagged and empty-tagged tables completely untouched', () => {
  for (const dataset of [{}, { statisticsTable: '' }]) {
    const node = { dataset, get ownerDocument() { throw Error('An unapproved table was enhanced'); } };
    tables.enhance(node, { view: {}, key: 'standings', t: String });
    assert.equal(dataset.tournamentTableEnhanced, undefined);
  }
});

test('sorting actions require the matching explicit statistics tag', () => {
  const scope = new Function(`${fn('statisticsSortScope')}; return statisticsSortScope;`)();
  assert.equal(scope(null, undefined), false);
  assert.equal(scope({ closest: () => ({ dataset: { statisticsTable: '' } }) }, ''), false);
  assert.equal(scope({ closest: () => null }, 'games'), false);
  assert.equal(scope({ closest: () => ({ dataset: { statisticsTable: '' } }) }, 'games'), false);
  assert.equal(scope({ closest: () => ({ dataset: { statisticsTable: 'leaderboard' } }) }, 'games'), false);
  assert.equal(scope({ closest: () => ({ dataset: { statisticsTable: 'games' } }) }, 'games'), true);
});

test('delegated sorting ignores untagged and mismatched controls before changing state or requesting data', async () => {
  const state = {}, events = {};
  let requests = 0;
  const wire = new Function('state', 'document', 'refreshStatisticsSort', 'navigationUrl', 'setMessage',
    require('../helpers/statistics-client-source') + '\n' + fn('wireStatisticsOrderEvents') + ';return wireStatisticsOrderEvents;')(
    state, { addEventListener: (type, callback) => { events[type] = callback; }, querySelectorAll: () => [] },
    async () => { requests++; }, () => '/games', () => {});
  wire();
  for (const tag of [null, '', 'leaderboard', 'games']) {
    const button = { dataset: { statisticsServerSort: 'games', sortKey: 'score' },
      closest: () => tag === null ? null : { dataset: { statisticsTable: tag } } };
    await events.click({ target: { closest: () => button } });
    assert.equal(requests, tag === 'games' ? 1 : 0);
  }
});

test('old captain-pairing sorting cannot change work-list order or create controls', () => {
  const render = new Function('state', 't', 'teamPairingCard', `${fn('teamPairingsPanelMarkup')}; return teamPairingsPanelMarkup;`)(
    { statisticsSorts: { 'captain-pairings': { key: 'gp', dir: 'desc' } } }, String, row => `<article data-pair="${row.id}"></article>`);
  const html = render([{ id: 8, teamGamePointsA: 1 }, { id: 3, teamGamePointsA: 60 }]);
  assert.ok(html.indexOf('data-pair="8"') < html.indexOf('data-pair="3"'));
  assert.doesNotMatch(html, /data-statistics-(order|table)|sort-button/);
});

test('desktop game and confirmation score cards use recorded participant order', () => {
  for (const name of ['renderGameDetail', 'renderResultReview', 'renderTournamentResultReview']) {
    assert.doesNotMatch(fn(name), /sortedGamePlayers|game-scores:|gameScoreColumns/);
  }
});

test('excluded desktop views contain no sorting toolbar; approved views remain explicitly tagged', () => {
  for (const name of ['renderPlay', 'renderProfile', 'renderPlayerProfile', 'teamPairingsPanelMarkup',
    'rosterMatchHistoryMarkup', 'teamMatchGamesMarkup', 'renderPlayerTeamProfile', 'teamRosterHistory']) {
    assert.doesNotMatch(fn(name), /statisticsListControls|sortStatisticsRows/);
  }
  assert.match(fn('renderGames'), /data-statistics-table="games"/);
  assert.match(fn('renderTeamDetail'), /data-statistics-table=/);
  for (const name of ['publicStandingsTable', 'teamStandingsTable', 'teamIndividualStandingsTable', 'tournamentTacOpStatsTable', 'tournamentKillTeamStatsTable']) {
    assert.match(fn(name), /data-statistics-table=/);
  }
});

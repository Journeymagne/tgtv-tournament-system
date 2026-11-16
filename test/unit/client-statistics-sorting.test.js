const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../public/app.js'), 'utf8');
function client(names, state = {}) {
  const functions = names.map(name => {
    const text = source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0];
    assert.ok(text, name);
    return text;
  }).join('\n');
  return new Function('state', 'canonicalKillTeamName', 't', 'wilsonScore', 'FACTION_RANKING_MIN_GAMES', `${functions};return {${names.join(',')}};`)(
    state, String, String, require('../../public/game-data').wilsonScore, require('../../public/game-data').FACTION_RANKING_MIN_GAMES);
}

test('table sort choices are independent and missing numeric values stay last in both directions', () => {
  const ui = client(['statisticsSortState', 'sortStatisticsRows', 'compareStatValues', 'statSortNumber']);
  const teams = ui.statisticsSortState('killTeams');
  teams.key = 'team'; teams.dir = 'asc';
  assert.deepEqual(ui.statisticsSortState('tacOps'), { key: 'winRate', dir: 'desc' });
  const rows = [{ value: '-' }, { value: 2 }, { value: 10 }, { value: 0 }];
  assert.deepEqual(ui.sortStatisticsRows(rows, { key: 'value', dir: 'asc' }).map(row => row.value), [0, 2, 10, '-']);
  assert.deepEqual(ui.sortStatisticsRows(rows, { key: 'value', dir: 'desc' }).map(row => row.value), [10, 2, 0, '-']);
});

test('presentation sorting preserves official rank and stable ordering of equal values', () => {
  const ui = client(['sortStatisticsRows', 'compareStatValues', 'statSortNumber']);
  const rows = [{ rank: 1, vp: 10 }, { rank: 2, vp: 20 }, { rank: 3, vp: 20 }];
  assert.deepEqual(ui.sortStatisticsRows(rows, { key: 'vp', dir: 'desc' }).map(row => row.rank), [2, 3, 1]);
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 3]);
});

test('tournament faction statistics attribute VP and wins to played faction', () => {
  const ui = client(['tournamentKillTeamStats', 'addTournamentStatLine']);
  const rows = ui.tournamentKillTeamStats([{ players: [{ id: 1, faction: 'Registered' }, { id: 2, faction: 'Opponent' }],
    result: { winnerId: 1, scores: { 1: { faction: 'Played', total: 15 }, 2: { faction: 'Opponent', total: 9 } } } }]);
  assert.equal(rows.find(row => row.name === 'Played')?.wins, 1);
  assert.equal(rows.find(row => row.name === 'Played')?.totalVp, 15);
  assert.equal(rows.some(row => row.name === 'Registered'), false);
});

test('faction detail retains all players, separates proxy replacements and excludes mirrors', () => {
  const ui = client(['teamDetailSummary', 'statisticsPlayerKey', 'teamEntryResult', 'addRecord', 'statRowSort']);
  const game = (id, name, faction = 'Other') => ({ id, sourceType: 'tournament_match', tournament: { id: 1 }, status: 'completed',
    players: [{ id: -1, name, isProxy: true }, { id: 100 + id, name: 'Opponent' }],
    result: { winnerId: -1, scores: { '-1': { faction: 'Kommandos' }, [100 + id]: { faction } } } });
  const games = Array.from({ length: 12 }, (_, index) => game(index, `Proxy ${index}`));
  games.push(game(99, 'Mirror', 'Kommandos'));
  const summary = ui.teamDetailSummary('Kommandos', games);
  assert.equal(summary.games, 12);
  assert.equal(summary.mirrorGames, 1);
  assert.equal(summary.players.length, 12);
  assert.equal(summary.players.every(row => row.games === 1), true);
  assert.equal(summary.players.every(row => row.provisional && row.rank === null), true);
  assert.equal(summary.recentGames.length, 5);
  assert.deepEqual(summary.recentGames.map(item => item.game.id), [11, 10, 9, 8, 7]);
});

test('faction player Wilson records span all time independently of seasonal games and use real account identities', () => {
  const ui = client(['teamDetailSummary', 'statisticsPlayerKey', 'teamEntryResult', 'addRecord', 'statRowSort']);
  const historical = Array.from({ length: 11 }, (_, index) => ({ id: index, sourceType: 'challenge', status: 'completed',
    submittedAt: '2026-08-01', players: [{ id: 1, userId: 1, name: 'Journey' }, { id: 2, userId: 2, name: 'Opponent' }],
    result: { winnerId: index < 9 ? 1 : 2, scores: { 1: { faction: 'Kommandos' }, 2: { faction: 'Kasrkin' } } } }));
  const summary = ui.teamDetailSummary('Kommandos', [], historical);
  assert.equal(summary.games, 0);
  assert.equal(summary.players[0].games, 11);
  assert.equal(summary.players[0].provisional, false);
  assert.equal(summary.players[0].rank, 1);
  assert.ok(Math.abs(summary.players[0].wilsonScore - 52.3014) < 0.001);
  assert.notEqual(ui.statisticsPlayerKey({ id: 1, userId: null, name: 'Guest' }, { sourceType: 'tournament_match', tournament: { id: 1 } }), 'user:1');
});

test('card sorting uses raw names, dates and numeric scores without mutating input', () => {
  const ui = client(['sortStatisticsRows', 'compareStatValues', 'statSortNumber', 'gameStatisticsValues']);
  const games = [
    { id: 1, players: [{ id: 1, name: 'Z' }, { id: 2, name: 'A' }], result: { scores: { 1: { total: 2 }, 2: { total: 1 } } } },
    { id: 2, players: [{ id: 1, name: 'A' }, { id: 2, name: 'Z' }], result: { scores: { 1: { total: 10 }, 2: { total: 4 } } } }
  ];
  const sorted = ui.sortStatisticsRows(games, { key: 'score', dir: 'desc' }, ui.gameStatisticsValues);
  assert.deepEqual(sorted.map(game => game.id), [2, 1]);
  assert.deepEqual(games.map(game => game.id), [1, 2]);
});

test('round card sorting reads side scores and team points while leaving match order intact', () => {
  const ui = client(['sortStatisticsRows', 'compareStatValues', 'statSortNumber', 'matchStatisticsValues']);
  const matches = [{ id: 1, phase: 'completed', rosterA: { name: 'Z' }, rosterB: { name: 'A' }, teamTournamentPointsA: 0,
    teamGamePointsA: 12, teamGamePointsB: 20 }, { id: 2, phase: 'completed', rosterA: { name: 'A' }, rosterB: { name: 'Z' },
    teamTournamentPointsA: 2, teamGamePointsA: 30, teamGamePointsB: 10 }];
  assert.deepEqual(ui.sortStatisticsRows(matches, { key: 'tp', dir: 'desc' }, ui.matchStatisticsValues).map(row => row.id), [2, 1]);
  assert.deepEqual(matches.map(row => row.id), [1, 2]);
});

test('nested team games sort recorded result keys even when player views are absent', () => {
  const ui = client(['gameStatisticsValues']);
  const values = ui.gameStatisticsValues({ resultPlayerIds: [-11, -22], playerIds: [11, 22],
    pendingResult: { result: { scores: { '-11': { total: 21, faction: 'Kommandos' }, '-22': { total: 6 } } } } });
  assert.equal(values.score, 21);
  assert.equal(values.vpDiff, 15);
  assert.equal(values.faction, 'Kommandos');
});

test('legacy faction snapshots count consistently in global and detailed summaries', () => {
  const ui = client(['killTeamWinrateSummary', 'addKillTeamStat', 'teamDetailSummary', 'statisticsPlayerKey', 'teamEntryResult', 'addRecord', 'statRowSort']);
  const game = { id: 1, status: 'completed', players: [{ id: 1, name: 'A', faction: 'Kommandos' }, { id: 2, name: 'B', faction: 'Kasrkin' }],
    result: { winnerId: 1, scores: { 1: { total: 10 }, 2: { total: 5 } } } };
  assert.equal(ui.killTeamWinrateSummary([game]).rows.find(row => row.team === 'Kommandos')?.wins, 1);
  assert.equal(ui.teamDetailSummary('Kommandos', [game]).wins, 1);
});

test('profile history ignores old sort settings and a slower response cannot replace a newer request', async () => {
  const state = { statisticsSorts: {} }, requests = [], urls = [];
  const code = source.match(/async function loadPlayerProfile\([^]*?\r?\n\}/)?.[0];
  const load = new Function('state', 'api', 'upsertChallengeProgress',
    require('../helpers/statistics-client-source') + '\n' + code + ';return loadPlayerProfile;')(
      state, url => { urls.push(url); return new Promise(resolve => requests.push(resolve)); }, () => {});
  const first = load(17);
  state.statisticsSorts['player-history:17'] = { key: 'score', dir: 'desc' };
  const second = load(17);
  requests[1]({ user: { id: 17 }, recentGames: [{ id: 'highest' }] });
  await second;
  requests[0]({ user: { id: 17 }, recentGames: [{ id: 'latest' }] });
  await first;
  assert.equal(state.playerProfile.recentGames[0].id, 'highest');
  assert.deepEqual(urls, ['/api/users/17', '/api/users/17']);
});

test('sorting keeps existing form nodes and their unsaved values', () => {
  const code = source.match(/function preserveStatisticsForms\([^]*?\r?\n\}/)?.[0];
  assert.ok(code);
  const old = { attributes: [{ name: 'id', value: 'profile' }], draft: 'unsaved' };
  let forms = [old], replacement;
  const preserve = new Function('document', code + ';return preserveStatisticsForms;')({ querySelectorAll: () => forms });
  const restore = preserve();
  forms = [{ attributes: old.attributes, replaceWith: node => { replacement = node; } }];
  restore();
  assert.equal(replacement, old);
  assert.equal(replacement.draft, 'unsaved');
});

test('global Tac Op balance excludes mirrors while event totals can include them', () => {
  const names = ['tacOpWinrateSummary', 'gameScoreEntries', 'statsTeamFilterMatchesWithFilters', 'statNumber', 'formatAverage'];
  const code = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0]).join('\n');
  const summarize = new Function('canonicalKillTeamName', 'canonicalTacOpName', code + ';return tacOpWinrateSummary;')(String, String);
  const mirror = { status: 'completed', players: [{ id: 1, faction: 'Kommandos' }, { id: 2, faction: 'Kommandos' }],
    result: { winnerId: 1, scores: { 1: { tacOp: 'Plant Banner', tac: 4 }, 2: { tacOp: 'Retrieval', tac: 2 } } } };
  assert.equal(summarize([mirror]).rows.length, 0);
  assert.equal(summarize([mirror], { classification: 'all', team: '' }, false).rows.length, 2);
});

test('an obsolete sorting request failure cannot roll back a newer successful choice', async () => {
  const state = {}, events = {}, requests = [], errors = [];
  const document = { addEventListener: (name, handler) => { events[name] = handler; }, querySelectorAll: () => [] };
  const code = source.match(/function wireStatisticsOrderEvents\([^]*?\r?\n\}/)?.[0];
  const wire = new Function('state', 'document', 'refreshStatisticsSort', 'setMessage', 'navigationUrl',
    require('../helpers/statistics-client-source') + '\n' + code + ';return wireStatisticsOrderEvents;')(
      state, document, () => new Promise((resolve, reject) => requests.push({ resolve, reject })), error => errors.push(error), () => "/test");
  wire();
  const click = key => events.click({ target: { closest: () => ({ disabled: false,
    dataset: { statisticsServerSort: 'leaderboard', sortKey: key },
    closest: () => ({ dataset: { statisticsTable: 'leaderboard' } }) }) } });
  const first = click('name');
  const second = click('rating');
  requests[1].resolve(); await second;
  requests[0].reject(new Error('old failure')); await first;
  assert.deepEqual(state.statisticsSorts.leaderboard, { key: 'rating', dir: 'desc' });
  assert.deepEqual(errors, []);
});

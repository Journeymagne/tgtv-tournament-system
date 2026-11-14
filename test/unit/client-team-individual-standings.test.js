const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tables = require('../../public/tournament-tables');
const source = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const sourceOf = name => {
  const result = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, `Missing client function: ${name}`);
  return result;
};
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fixture = () => ({ tournament: { id: 42, participantMode: 'team', pairingType: 'doubles' }, individualStandings: [
  { key: 'user:7', rank: 1, userId: 7, name: 'Alex <Admin>', isProxy: false, rosterIds: [3, 4], rosterNames: ['Old <Roster>', 'New & Roster'], gamesPlayed: 2, byes: 1, wins: 2, draws: 1, losses: 0, matchPoints: 7, totalGp: 43, gpDiff: 26 },
  { key: 'proxy:8', rank: 1, userId: 99, name: '<Guest>', isProxy: true, rosterIds: [4], rosterNames: ['New & Roster'], gamesPlayed: 0, byes: 0, wins: 0, draws: 0, losses: 0, matchPoints: 0, totalGp: 0, gpDiff: 0 }
] });

function uiHarness(state = {}, dictionary = {}) {
  const names = ['playerProfileLink', 'tournamentParticipantProfileLink', 'teamIndividualStandingsTable', 'teamTournamentStandingsContent', 'tournamentInfoTabContent'];
  return new Function('state', 't', 'escapeHtml', 'teamStandingsTable', 'publicStandingsTable',
    `${names.map(sourceOf).join('\n')}; return { teamIndividualStandingsTable, teamTournamentStandingsContent, tournamentInfoTabContent };`
  )(state, key => dictionary[key] || key, escapeHtml, () => '<table class="official-team-places"></table>', () => 'solo standings');
}

test('personal standings show GP totals and differences, keep saved ranks and link only account holders', () => {
  const data = fixture();
  Object.assign(data.individualStandings[0], { totalVp: 21, vpDiff: -2 });
  data.tournament.finalResults = [{ rank: 9, rosterId: 4 }];
  const before = structuredClone(data);
  const html = uiHarness().teamIndividualStandingsTable(data);
  assert.match(html, /class="data-table team-individual-standings-table"/);
  assert.equal((html.match(/<th(?: |\>)/g) || []).length, 8);
  assert.match(html, /href="\/tournament#\/players\/7"[^>]*data-profile-user="7">Alex &lt;Admin&gt;<\/a>/);
  assert.doesNotMatch(html, /players\/99|data-profile-user="99"|<Guest>|<Roster>/);
  assert.match(html, /Old &lt;Roster&gt; · New &amp; Roster/);
  assert.match(html, /<td>2<\/td><td>7<\/td><td>43<\/td><td>26<\/td><td>2-1-0<\/td>/);
  assert.match(html, /&lt;Guest&gt;/);
  assert.equal((html.match(/<td class="rank">1<\/td>/g) || []).length, 2);
  assert.deepEqual(data, before, 'rendering must not change personal ranks or official results');
});

test('both languages label personal totals and differences as GP and explain GP scoring', () => {
  for (const locale of ['en', 'ru']) {
    const dictionary = require(`../../public/i18n/${locale}`);
    const html = uiHarness({}, dictionary).teamIndividualStandingsTable(fixture());
    assert.match(html, /<th>Total GP<\/th><th>Diff GP<\/th>/);
    assert.match(dictionary['teams.tournament.individualStandingsHint'], /GP/);
    assert.match(dictionary['teams.tournament.individualStandingsHint'], /\+20/);
  }
});

test('team standings are the default; the nested selection is isolated per tournament and shared by admin/public', () => {
  const state = {};
  const ui = uiHarness(state);
  const data = fixture();
  assert.match(ui.tournamentInfoTabContent('standings', data), /official-team-places/);
  assert.match(ui.teamTournamentStandingsContent(data), /data-team-standings-tab="team"[^>]*aria-selected="true"/);
  state.teamTournamentStandingsTabs[42] = 'individual';
  for (const options of [{}, { admin: true }]) {
    const html = ui.tournamentInfoTabContent('standings', data, options);
    assert.match(html, /data-team-standings-tab="individual"[^>]*aria-selected="true"/);
    assert.match(html, /team-individual-standings-table/);
    assert.doesNotMatch(html, /official-team-places/);
  }
  assert.match(ui.teamTournamentStandingsContent({ ...data, tournament: { ...data.tournament, id: 43 } }), /official-team-places/);
  assert.equal(ui.tournamentInfoTabContent('standings', { tournament: { participantMode: 'individual' } }), 'solo standings');
});

test('empty personal standings explain when players appear and retain the solo scoring hint', () => {
  const ui = uiHarness({ teamTournamentStandingsTabs: { 42: 'individual' } });
  const html = ui.teamTournamentStandingsContent({ tournament: { id: 42 }, individualStandings: [] });
  assert.match(html, /teams.tournament.individualStandingsEmpty/);
  assert.match(html, /teams.tournament.individualStandingsHint/);
  assert.doesNotMatch(html, /<table/);
});

test('nested tab clicks rerender public and admin views and survive a refreshed payload', () => {
  for (const options of [{ publicRoute: true }, { admin: true }]) {
    const state = {}, callbacks = new Map(), rendered = [];
    let remembered = 0;
    const ui = uiHarness(state), data = fixture();
    const buttons = ['team', 'individual'].map(tab => ({ dataset: { teamStandingsTab: tab } }));
    const wire = new Function('state', 'document', 'onLive', 'renderPublicTournament', 'renderTournaments', 'rememberNavigationContext',
      `${sourceOf('wireTeamTournamentStandingsTabs')}; return wireTeamTournamentStandingsTabs;`
    )(state, { querySelectorAll: () => buttons }, (button, event, callback) => { assert.equal(event, 'click'); callbacks.set(button.dataset.teamStandingsTab, callback); },
      value => rendered.push(['public', ui.teamTournamentStandingsContent(value)]),
      () => rendered.push(['admin', ui.teamTournamentStandingsContent(data)]), () => { remembered++; });
    wire(data, options);
    callbacks.get('individual')();
    assert.equal(rendered[0][0], options.admin ? 'admin' : 'public');
    assert.match(rendered[0][1], /team-individual-standings-table/);
    assert.equal(remembered, 1);
    const refreshed = structuredClone(data);
    refreshed.individualStandings[0].matchPoints = 10;
    assert.match(ui.teamTournamentStandingsContent(refreshed), /<td>10<\/td>/);
    callbacks.get('team')();
    assert.match(rendered[1][1], /official-team-places/);
  }
});

test('personal table enhances every column with correct numeric, text and W-D-L sorting and independent saved state', () => {
  const state = { tournamentTableViews: { '42:teamStandings': { column: 2, direction: 'desc', query: 'Team' } } };
  const calls = [], table = {};
  const wire = new Function('state', 'document', 'TGTVTournamentTables', 't', 'scopeAdministrationLinks', 'rememberNavigationContext',
    `${sourceOf('wireTournamentDataTables')}; return wireTournamentDataTables;`
  )(state, {
    querySelector: selector => selector === '.team-individual-standings-table' ? table : null,
    querySelectorAll: selector => selector === '.team-individual-standings-table' ? [table] : []
  }, { enhance: (node, options) => { assert.equal(node, table); calls.push(options); } }, key => key, () => {}, () => {});
  wire(fixture());
  const options = calls[0];
  assert.equal(options.view, state.tournamentTableViews['42:teamIndividualStandings']);
  assert.notEqual(options.view, state.tournamentTableViews['42:teamStandings']);
  assert.deepEqual(options.defaultSort, { column: 0, direction: 'asc' });
  const values = [
    ['2', 'Zulu', 'Zoo', '2', '2', '2', '-10', '2-0-1'],
    ['1', 'Alpha', 'Alpha', '10', '10', '10', '2', '10-0-1']
  ];
  const rows = values.map((cells, index) => ({ index, values: cells.map((value, column) => tables.sortValue(value, options.types[column] || 'number')) }));
  for (let column = 0; column < 8; column++) {
    const direction = [0, 1, 2].includes(column) ? 'asc' : 'desc';
    assert.deepEqual(tables.sortRows(rows, column, direction).map(row => row.index), [1, 0], `column ${column}`);
  }
  Object.assign(options.view, { column: 4, direction: 'desc', query: 'Alex' });
  wire(fixture());
  assert.equal(calls[1].view, options.view);
  assert.equal(calls[1].view.query, 'Alex');
  assert.deepEqual(state.tournamentTableViews['42:teamStandings'], { column: 2, direction: 'desc', query: 'Team' });
});

test('navigation history restores the nested tab and personal table filters after refresh', () => {
  const state = { teamTournamentStandingsTabs: { 42: 'individual' }, tournamentTableViews: { '42:teamIndividualStandings': { column: 6, direction: 'desc', query: 'Alex' } } };
  let saved;
  const window = { location: { pathname: '/tournaments/cup', search: '', hash: '' }, scrollY: 50,
    history: { state: null, replaceState(value) { saved = structuredClone(value); } } };
  const names = ['navigationUrl', 'currentNavigationEntry', 'navigationContextKeys', 'rememberNavigationContext', 'restoreNavigationContext'];
  const nav = new Function('state', 'window', 'document', `${names.map(sourceOf).join('\n')}; return { rememberNavigationContext, restoreNavigationContext };`)(state, window, { querySelector: () => null });
  nav.rememberNavigationContext();
  state.teamTournamentStandingsTabs = {};
  state.tournamentTableViews = {};
  nav.restoreNavigationContext(saved.tgtvNavigation.context);
  assert.deepEqual(state.teamTournamentStandingsTabs, { 42: 'individual' });
  assert.deepEqual(state.tournamentTableViews['42:teamIndividualStandings'], { column: 6, direction: 'desc', query: 'Alex' });
});

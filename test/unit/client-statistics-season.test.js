const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { seasons, gameInSeason } = require('../../public/game-data');
const { createI18n } = require('../../public/i18n');
const source = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const sourceOf = name => {
  const code = source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0];
  assert.ok(code, name);
  return code;
};

test('alltime remains selected and includes games from every season', () => {
  const state = { selectedSeasonId: 'alltime' };
  const ui = new Function('state', 'seasons', 'latestSeason', 'gameInSeason',
    `${sourceOf('activeSeason')}\n${sourceOf('filterGamesBySeason')};return { activeSeason, filterGamesBySeason };`)(
    state, seasons, () => seasons.at(-1), gameInSeason);
  const games = [{ id: 1, submittedAt: '2026-06-01' }, { id: 2, submittedAt: '2026-10-01' },
    { id: 3, submittedAt: '2026-11-15' }];
  assert.equal(ui.activeSeason(), null);
  assert.equal(state.selectedSeasonId, 'alltime');
  assert.deepEqual(ui.filterGamesBySeason(games, ui.activeSeason()), games);
  state.selectedSeasonId = seasons.at(-1).id;
  assert.deepEqual(ui.filterGamesBySeason(games, ui.activeSeason()).map(game => game.id), [3]);
});

test('statistics selector translates alltime and retains the normal default season', () => {
  const state = { selectedSeasonId: '' };
  const i18n = createI18n({ en: require('../../public/i18n/en'), ru: require('../../public/i18n/ru') });
  const ui = new Function('state', 'seasons', 'latestSeason', 't', 'escapeHtml',
    `${sourceOf('activeSeason')}\n${sourceOf('seasonSelectorMarkup')};return { activeSeason, seasonSelectorMarkup };`)(
    state, seasons, () => seasons.at(-1), i18n.t, String);
  assert.equal(ui.activeSeason(), seasons.at(-1));
  state.selectedSeasonId = 'alltime';
  for (const [locale, label] of [['ru', 'За все время'], ['en', 'Alltime']]) {
    i18n.setLocale(locale);
    assert.ok(ui.seasonSelectorMarkup().includes(`<option value="alltime" selected>${label}</option>`));
  }
});

test('changing statistics season preserves the open killteam and the search text', () => {
  const state = { selectedSeasonId: seasons.at(-1).id, selectedStatisticsTeam: 'Kommandos', statisticsTeamQuery: 'komm' };
  let change, rendered;
  const wire = new Function('state', 'document', 'renderStatistics', 'rememberNavigationContext',
    `${sourceOf('wireStatisticsSeasonSelector')};return wireStatisticsSeasonSelector;`)(
    state, { querySelector: () => ({ addEventListener: (_event, handler) => { change = handler; } }) },
    () => { rendered = { ...state }; }, () => {});
  wire();
  for (const season of ['alltime', seasons[0].id]) {
    change({ target: { value: season } });
    assert.equal(rendered.selectedSeasonId, season);
    assert.equal(rendered.selectedStatisticsTeam, 'Kommandos');
    assert.equal(rendered.statisticsTeamQuery, 'komm');
  }
});

test('opening a statistics killteam scrolls to the beginning after rendering its detail', () => {
  const state = {}, actions = [];
  let click;
  const button = { dataset: { statTeam: 'Kommandos' }, addEventListener: (_event, handler) => { click = handler; } };
  const wire = new Function('state', 'document', 'window', 'renderStatistics', 'wireGameButtons',
    `${sourceOf('wireTeamStatistics')};return wireTeamStatistics;`)(state,
    { querySelectorAll: () => [button], querySelector: () => null },
    { scrollTo: (...args) => actions.push(args) }, () => actions.push(state.selectedStatisticsTeam), () => {});
  wire();
  click();
  assert.equal(state.statisticsTab, 'teams');
  assert.deepEqual(actions, ['Kommandos', [0, 0]]);
});

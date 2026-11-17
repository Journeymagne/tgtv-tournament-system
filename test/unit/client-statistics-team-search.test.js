const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const { createI18n } = require('../../public/i18n.js');

function client() {
  const state = { statisticsTeamQuery: '' };
  const i18n = createI18n({ en: require('../../public/i18n/en.js'), ru: require('../../public/i18n/ru.js') });
  const names = ['renderTeamCards', 'renderTeamCardGrid', 'teamCardRows', 'sortStatisticsRows',
    'statisticsSortState', 'compareStatValues', 'statSortNumber', 'comboField', 'normalizeComboOptions'];
  const code = names.map(name => source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0]).join('\n');
  const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const render = new Function('state', 't', 'escapeHtml', 'killTeamOptions', 'statisticsListControls',
    'killTeamLogoSrc', 'killTeamLogoAttrs', 'plural', `${code}; return renderTeamCards;`)(
    state, i18n.t, escapeHtml, ['Death Korps', 'Kommandos', 'Deathwatch'], () => '', () => '/logo.svg', () => '', (_, n) => `${n} games`);
  return { state, i18n, render };
}

test('killteam cards filter partial names regardless of case while retaining all suggestions', () => {
  const { state, render } = client();
  state.statisticsTeamQuery = '  dEaTh  ';
  const html = render({ rows: [{ team: 'Kommandos', games: 2, winRate: 100 }] });
  assert.match(html, /data-stat-team="Death Korps"/);
  assert.match(html, /data-stat-team="Deathwatch"/);
  assert.doesNotMatch(html, /data-stat-team="Kommandos"/);
  assert.match(html, /data-combo-items="[^\"]*Kommandos/);
  assert.match(html, /role="combobox"/);
  assert.match(html, /class="combo-menu"[^>]*role="listbox"/);
  assert.doesNotMatch(html, /<datalist/);
});

test('clearing a killteam search restores cards and unmatched text has a localized empty state', () => {
  const { state, i18n, render } = client();
  for (const locale of ['ru', 'en']) {
    i18n.setLocale(locale);
    state.statisticsTeamQuery = '<unknown>"';
    const html = render({ rows: [] });
    assert.ok(html.includes(i18n.t('tournaments.table.noResults')));
    assert.match(html, /value="&lt;unknown>\&quot;"/);
    assert.doesNotMatch(html, /data-stat-team=/);
    state.statisticsTeamQuery = '';
    assert.equal((render({ rows: [] }).match(/data-stat-team=/g) || []).length, 3);
    assert.equal(i18n.t('stats.tab.killTeamWinrates'), locale === 'ru' ? 'Винрейт' : 'Winrates');
  }
});

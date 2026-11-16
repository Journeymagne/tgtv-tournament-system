const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createI18n } = require('../../public/i18n');
const source = fs.readFileSync(require.resolve('../../public/app'), 'utf8');
const fn = source.match(/function factionPlayerTable\([^]*?\r?\n\}/)?.[0];
assert.ok(fn);
const dictionaries = { ru: require('../../public/i18n/ru'), en: require('../../public/i18n/en') };
const i18n = createI18n(dictionaries);
const render = new Function('t', 'escapeHtml', 'serverSortHeader', 'serverSortState', 'sortStatisticsRows', 'formatWilsonScore', 'FACTION_RANKING_MIN_GAMES',
  fn + ';return factionPlayerTable;')(i18n.t, String, label => '<th>' + label + '</th>', () => ({ key: 'wilsonScore', dir: 'desc' }),
  rows => [...rows].sort((a, b) => b.wilsonScore - a.wilsonScore), value => value.toFixed(1), 10);
for (const locale of ['ru', 'en']) {
  test('provisional scores are labeled and never display a place in ' + locale, () => {
    i18n.setLocale(locale);
    const html = render([{ name: 'Player', games: 2, wins: 2, winRate: 100, wilsonScore: 34.238, rank: null }], true);
    assert.match(html, /34\.2/);
    assert.match(html, /data-provisional="true"/);
    assert.match(html, new RegExp(locale === 'ru' ? 'предв\\.' : 'prov\\.'));
    assert.doesNotMatch(html, /data-player-rank=|null\./);
  });
  test('qualified scores display their official place in ' + locale, () => {
    i18n.setLocale(locale);
    const html = render([{ name: 'Player', games: 10, wins: 7, winRate: 70, wilsonScore: 39.678, rank: 1 }]);
    assert.match(html, /data-player-rank="1"/);
    assert.match(html, /1\.<\/span>/);
    assert.doesNotMatch(html, /predv|предв\.|prov\./);
  });
}

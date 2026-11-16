const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
// Existing client tests evaluate selected classic-script functions. Include their
// real sorting dependencies, with an isolated state when the fixture has none.
const names = ['statisticsSortState', 'sortStatisticsRows', 'statisticsListControls', 'gameStatisticsColumns',
  'gameStatisticsValues', 'matchStatisticsColumns', 'matchStatisticsValues', 'serverSortState',
  'serverSortHeader', 'statisticsSortQuery', 'compareStatValues', 'statSortNumber', 'statisticsSortScope'];
module.exports = `
var wilsonScore = ${require('../../public/game-data').wilsonScore.toString()};
var gameInSeason = ${require('../../public/game-data').gameInSeason.toString()};
var statisticsFixtureState = {};
function statisticsClientState() { return typeof state === 'undefined' ? statisticsFixtureState : state; }
function statisticsEscapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'); }
` + names.map(name => {
  const code = source.match(new RegExp(`function ${name}\\([^]*?\\r?\\n\\}`))?.[0];
  if (!code) throw new Error('Missing statistics helper: ' + name);
  return code.replace(/\bstate\b/g, 'statisticsClientState()').replace(/\bescapeHtml\b/g, 'statisticsEscapeHtml');
}).join('\n');

const test = require('node:test');
const assert = require('node:assert/strict');
const { companionHtml } = require('../../src/http/combat');
test('combat initial HTML supplies one canonical description and keeps React assets', () => {
  const source = '<html><head><title>Old title</title><meta name="description" content="Old"><meta property="og:site_name" content="ktcalc"><link rel="canonical" href="https://ktcalc.com/"><script src="/combat/static/main.js"></script></head><body><div id="root"></div></body></html>';
  const html = companionHtml(source, '/combat');
  assert.equal([...html.matchAll(/name="description"/g)].length, 1);
  assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
  assert.match(html, /content="Calculate Kill Team 2024 shooting odds/);
  assert.match(html, /href="https:\/\/ktcompanion.ru\/combat"/);
  assert.match(html, /og:site_name" content="KT Companion"/);
  assert.match(html, /src="\/combat\/static\/main.js"/);
  assert.doesNotMatch(html, /ktcalc\.com/);
  assert.match(companionHtml(source, '/combat/help/'), /content="Old"/);
});

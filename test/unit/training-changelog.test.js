const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const changelog = require('../../public/training/changelog');

test('training update history renders every entry in Russian and English without mixing locales', () => {
  const ru = changelog.render('ru');
  const en = changelog.render('en');
  assert.match(ru, /Обновления KnowThyKT/);
  assert.match(en, /KnowThyKT updates/);
  assert.doesNotMatch(en, /[а-яё]/i);
  assert.match(ru, /Portable Barricade/);
  assert.match(en, /Portable Barricade/);
  assert.match(en, /1\.5\.19/);
  const dates = html => [...html.matchAll(/<time datetime="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(dates(en), dates(ru));
  assert.ok(dates(en).length >= 2);
  assert.deepEqual(dates(en), [...dates(en)].sort().reverse());
  assert.equal(changelog.render('unsupported'), ru);
});

test('browser and server use the same public update-history renderer', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../../public/training/changelog'), 'utf8'), context);
  assert.equal(context.KTTrainingChangelog.render('en'), changelog.render('en'));
  assert.equal(context.KTTrainingChangelog.render('ru'), changelog.render('ru'));
  const browserPage = fs.readFileSync(require.resolve('../../public/training/index.html'), 'utf8');
  assert.match(browserPage, /href="#changelog" data-nav="changelog"/);
  assert.doesNotMatch(browserPage, /data-nav="changelog"[^>]*\bhidden/);
});

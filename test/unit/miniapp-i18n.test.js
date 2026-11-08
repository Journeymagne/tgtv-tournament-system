const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../../public/miniapp/i18n');

test('Mini App interface keys have English translations, including static shell and navigation', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../public/miniapp/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../public/miniapp/index.html'), 'utf8');
  const keys = [...app.matchAll(/tr\("([^"]+)"/g), ...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(m => m[1]);
  for (const line of app.split('\n').filter(l => /const (statuses|tabs) =/.test(l))) {
    keys.push(...[...line.matchAll(/"([^"\n]*[А-Яа-яЁё][^"\n]*)"/g)].map(m => m[1]));
  }
  assert.ok(keys.length > 100);
  for (const key of new Set(keys)) {
    assert.ok(Object.hasOwn(i18n.messages, key), key);
    assert.doesNotMatch(i18n.text(key, 'en'), /[А-Яа-яЁё]/, key);
    assert.equal(i18n.text(key, 'ru'), key);
  }
  assert.equal(i18n.text('Командный · {count} игроков в составе', 'en', { count: 3 }), 'Team event · 3 players per roster');
  assert.equal(i18n.normalize('en-GB'), 'en');
  assert.equal(i18n.normalize('ru-RU'), 'ru');
  assert.equal(i18n.normalize(undefined), 'ru');
});

test('API errors remain useful in both languages, with localized fallbacks', () => {
  assert.equal(i18n.error('Результат изменился. Обновите матч перед сохранением.', 409, 'en'), 'The result has changed. Refresh the game before saving.');
  assert.equal(i18n.error('Choose a valid Killzone', 400, 'ru'), 'Выберите допустимый Killzone.');
  assert.equal(i18n.error('Choose a valid Killzone', 400, 'en'), 'Choose a valid Killzone');
  assert.equal(i18n.error('Новая серверная ошибка', 403, 'en'), 'You do not have permission to perform this action.');
  assert.match(i18n.error(null, 401, 'en'), /session has expired/);
  assert.match(i18n.error(null, 429, 'ru'), /Слишком много запросов/);
});

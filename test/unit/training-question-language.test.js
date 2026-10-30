const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const bank = [...require('../../src/training-data/questions.json'), ...require('../../src/training-data/hand-of-the-archon.json')];
const translations = require('../../public/training/questions-en.json');
const { localize, signature } = require('../../public/training/question-language');

test('all core and team question versions have complete English wording and unchanged answer indices', () => {
  assert.equal(Object.keys(translations).length, bank.length);
  for (const question of bank) {
    const original = structuredClone(question);
    const entry = translations[question.id];
    assert.equal(entry.original, signature(question), question.id);
    const en = localize(question, 'en', translations);
    assert.notEqual(en, question);
    assert.equal(en.options.length, 4);
    assert.equal(en.answer, question.answer);
    assert.equal(en.id, question.id);
    assert.equal(en.difficulty, question.difficulty);
    assert.equal(en.source.url, question.source.url);
    for (const text of [en.topic, en.question, ...en.options, en.explanation, en.source.section]) {
      assert.ok(text.trim().length, question.id);
      assert.doesNotMatch(text, /[а-яё]|ZXTERM|ZXFIELD/i, question.id);
    }
    assert.deepEqual(question, original);
    assert.equal(localize(question, 'ru', translations), question);
  }
});

test('a moderator edit cannot inherit an outdated translation, but saved history stays translatable', () => {
  const question = bank[0];
  const edited = { ...question, question: question.question + ' Уточнение.', version: 2 };
  assert.equal(localize(edited, 'en', translations), edited);
  const reordered = { ...question, options: [...question.options].reverse() };
  assert.equal(localize(reordered, 'en', translations), reordered);
  const snapshot = { ...question, version: 1, revision: 9 };
  assert.equal(localize(snapshot, 'en', translations).question, translations[question.id].question);
  const session = { question: snapshot, optionOrder: [3, 0, 2, 1], selected: 2, correct: false };
  const saved = structuredClone(session);
  localize(session.question, 'en', translations);
  localize(session.question, 'ru', translations);
  assert.deepEqual(session, saved);
});

test('browser localization helper exports the same behavior and trainer scripts parse', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(require.resolve('../../public/training/question-language'), 'utf8'), context);
  assert.equal(context.KTTrainingQuestionLanguage.localize(bank[0], 'en', translations).question, translations[bank[0].id].question);
  new vm.Script(fs.readFileSync(require.resolve('../../public/training/app'), 'utf8'));
});

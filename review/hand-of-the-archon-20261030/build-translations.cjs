const fs = require('node:fs');
const path = require('node:path');
const questions = require('../../src/training-data/hand-of-the-archon.json');
const entries = require('./english.cjs');
const { signature } = require('../../public/training/question-language');
const target = path.join(__dirname, '../../public/training/questions-en.json');
const translations = JSON.parse(fs.readFileSync(target, 'utf8'));
for (const q of questions) {
  const entry = entries[q.id];
  if (!entry) throw Error('Missing translation: ' + q.id);
  translations[q.id] = { original: signature(q), topic: ({ 'Ploys и wounded': 'Ploys and wounded', 'Состав команды': 'Team selection' })[q.topic] || q.topic,
    question: entry.question, options: entry.options.slice(4 - q.answer).concat(entry.options.slice(0, 4 - q.answer)), explanation: entry.explanation,
    section: q.source.section.replaceAll('с.', 'p.').replaceAll(' и ', ' and ').replace('предыдущая errata', 'previous errata').replace('профили melee weapons', 'melee weapon profiles') };
}
fs.writeFileSync(target, JSON.stringify(translations, null, 2) + '\n');
console.log(`Added English text for ${questions.length} selected team questions.`);

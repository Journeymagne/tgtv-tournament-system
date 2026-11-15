const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const questions = [1,2,3,4].flatMap(level => JSON.parse(fs.readFileSync(path.join(root, `level-${level}.json`), 'utf8')));
const existing = JSON.parse(fs.readFileSync(path.join(root, '../../src/training-data/questions.json'), 'utf8'));
const existingById = new Map(existing.map(q => [q.id, q]));
const ids = new Set(), texts = new Set();
for (const q of questions) {
  if (ids.has(q.id) || texts.has(q.question.trim().toLowerCase())) throw Error('Duplicate question: ' + q.id);
  const promoted = existingById.get(q.id);
  if (promoted && JSON.stringify(promoted) !== JSON.stringify(q)) throw Error('Published question differs: ' + q.id);
  if (existing.some(item => item.id !== q.id && item.question.trim().toLowerCase() === q.question.trim().toLowerCase())) throw Error('Duplicate published question: ' + q.id);
  ids.add(q.id); texts.add(q.question.trim().toLowerCase());
  if (![1,2,3,4].includes(q.difficulty) || q.options.length !== 4 || new Set(q.options).size !== 4 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3 || !q.explanation || !q.source?.section || !q.source.url.startsWith('https://')) throw Error('Invalid question: ' + q.id);
}
if (questions.length !== 200 || [1,2,3,4].some(n => questions.filter(q => q.difficulty === n).length !== 50)) throw Error('Expected 50 questions per difficulty');
fs.writeFileSync(path.join(root, 'candidates.json'), JSON.stringify(questions, null, 2) + '\n');
const safeJSON = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const template = fs.readFileSync(path.join(root, 'review.template.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'review.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'review.js'), 'utf8');
const tokens = fs.readFileSync(path.join(root, '../../public/companion-tokens.css'), 'utf8');
const result = template.replace('/* COMPANION_TOKENS */', tokens).replace('/* REVIEW_CSS */', css)
  .replace('/* REVIEW_DATA */', safeJSON(questions)).replace('/* REVIEW_CODE */', safeJSON(js)).replace('/* REVIEW_JS */', js);
fs.writeFileSync(path.join(root, 'Know-Thy-Kill-Team-200-review.html'), result);
// Companion CSP uses script-src self. Keep preview JavaScript external while
// retaining a portable source for the user's "save HTML with selections" action.
fs.writeFileSync(path.join(root, 'review.preview.html'), result.replace('<script id="review-runtime">'+js+'</script>', '<script id="review-runtime" src="/training/review-ui.js?v=20261016"></script>'));
console.log(`Packaged ${questions.length} candidates: 50 per difficulty. Current live bank remains ${existing.length}.`);

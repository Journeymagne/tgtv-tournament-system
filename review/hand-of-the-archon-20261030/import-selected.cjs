const fs = require('node:fs');
const path = require('node:path');
const candidates = require('./candidates.json');
const selection = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (selection.batchId !== 'hoa-preview-2026-10-30-v1' || !Array.isArray(selection.selectedIds)) throw Error('Unknown selection batch');
const ids = new Set(selection.selectedIds);
if (!ids.size || ids.size !== selection.selectedIds.length || [...ids].some(id => !candidates.some(q => q.id === id))) throw Error('Invalid selected IDs');
const questions = candidates.filter(q => ids.has(q.id)).map(q => ({ ...q, team: 'hand-of-the-archon' }));
function edit(id, values, options) {
  const q = questions.find(q => q.id === id);
  if (!q) return;
  Object.assign(q, values);
  if (options) q.options = options.slice(4 - q.answer).concat(options.slice(0, 4 - q.answer));
}
edit('hoa-002', {
  question: 'На атаке splinter rifle выпали 1, 2, 5, 5. Вы хотите сохранить оба крита и попытаться получить ещё одно попадание через Stimulated Senses. Какие кубики стоит перебросить?',
  explanation: 'Перебросьте один из промахов: 1 или 2. Stimulated Senses выбирает одно числовое значение, поэтому одновременно перебросить разные результаты 1 и 2 нельзя. Обе пятёрки остаются критами.',
}, ['Один из промахов: либо 1, либо 2', 'Оба промаха: 1 и 2', 'Обе пятёрки', 'Один промах и одну пятёрку']);
edit('hoa-013', {}, ['Rending и Lethal 5+', 'Rending, Lethal 5+ и Balanced', 'Только Rending', 'Только Balanced']);
edit('hoa-023', {
  question: 'Враг с APL 2 начинает активацию рядом с Agent и объявляет Fall Back. Chain Snare успешно его останавливает. Сколько AP у врага осталось?',
  explanation: 'Осталось 2 AP: за остановленный Chain Snare Fall Back очки действий не тратятся. APL — характеристика, а AP — очки действий, доступные в активации.',
}, ['2 AP', '0 AP', '1 AP', '3 AP']);
edit('hoa-030', {
  question: 'Torment Grenade затрагивает врага с Save 4+ и вашего Agent с Save 4+ в пределах 1 дюйма от него. Для каждого отдельно бросили poison test, оба D6 показали 2. Кто получает D3 урона и Poison token?',
  explanation: 'Каждый затронутый оперативник проходит отдельный poison test. При Save 4+ к его результату добавляется 1: обе двойки становятся тройками. Поэтому оба оперативника получают по отдельному D3 урона и по Poison token.',
});
edit('hoa-043', { difficulty: 2 });
fs.writeFileSync(path.join(__dirname, '../../src/training-data/hand-of-the-archon.json'), JSON.stringify(questions, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'accepted-selection.json'), JSON.stringify({ batchId: selection.batchId, selectedIds: selection.selectedIds, notes: selection.notes, updatedAt: selection.updatedAt, exportedAt: selection.exportedAt }, null, 2) + '\n');
console.log(`Prepared ${questions.length} selected Hand of the Archon questions with editorial changes.`);

const { questions } = require('./training');

// Award credit at most twice per question. Repeated easy answers cannot farm ranks.
// Derive it from existing saved answers so earlier training counts immediately.
const ranks = [
  { id: 'noob', name: 'Нубик', en: 'Noob', xp: 0, tier: 1, note: 'Первый шаг в киллзону' },
  { id: 'freshblood', name: 'Фрешблад', en: 'Freshblood', xp: 200, tier: 2, note: 'Правила начинают складываться' },
  { id: 'regular', name: 'Середняк', en: 'Regular', xp: 800, tier: 3, note: 'Уже есть на что опереться' },
  { id: 'expert', name: 'Знаток киллтима', en: 'Kill Team expert', xp: 1800, tier: 4, note: 'Уверенно разбираете ситуации' },
  { id: 'tryhard', name: 'Потнич', en: 'Tryhard', xp: 3200, tier: 5, note: 'Знаете, где решают детали' },
  { id: 'judge', name: 'Судья', en: 'Judge', xp: 5000, tier: 6, note: 'Весь текущий курс закреплён' }
];

const calculateProgression = require('../../public/training/progression');
function progression(stats = {}) { return calculateProgression(questions, ranks, stats); }

module.exports = { ranks, progression };

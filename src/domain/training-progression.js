const { questions } = require('./training');
const maxXp = questions.reduce((total, question) => total + question.difficulty * 20, 0);

// Award credit at most twice per question. Repeated easy answers cannot farm ranks.
// Derive it from existing saved answers so earlier training counts immediately.
const ranks = [
  { id: 'noob', name: 'Нубик', en: 'Noob', xp: 0, tier: 1, note: 'Первый шаг в киллзону' },
  { id: 'freshblood', name: 'Фрешблад', en: 'Freshblood', xp: Math.round(maxXp * 0.04), tier: 2, note: 'Правила начинают складываться' },
  { id: 'regular', name: 'Середняк', en: 'Regular', xp: Math.round(maxXp * 0.16), tier: 3, note: 'Уже есть на что опереться' },
  { id: 'expert', name: 'Знаток киллтима', en: 'Kill Team expert', xp: Math.round(maxXp * 0.36), tier: 4, note: 'Уверенно разбираете ситуации' },
  { id: 'tryhard', name: 'Потнич', en: 'Tryhard', xp: Math.round(maxXp * 0.64), tier: 5, note: 'Знаете, где решают детали' },
  { id: 'judge', name: 'Судья', en: 'Judge', xp: maxXp, tier: 6, note: 'Весь текущий курс закреплён' }
];

const calculateProgression = require('../../public/training/progression');
function progression(stats = {}, curriculum = questions) {
  const maximum = curriculum.reduce((total, question) => total + question.difficulty * 20, 0);
  const thresholds = [0, .04, .16, .36, .64, 1];
  return calculateProgression(curriculum, ranks.map((rank, i) => ({ ...rank, xp: Math.round(maximum * thresholds[i]) })), stats);
}

module.exports = { ranks, progression };

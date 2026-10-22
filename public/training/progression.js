(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingProgression = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
function progression(questions, ranks, stats = {}) {
  const levels = [1, 2, 3, 4].map(difficulty => ({ difficulty, total: 0, seen: 0, solved: 0, mastered: 0, xp: 0, maxXp: 0 }));
  let attempts = 0, correct = 0;
  for (const question of questions) {
    const saved = stats?.[question.id];
    const count = Math.max(0, Math.floor(Number(saved?.attempts) || 0));
    const wins = Math.min(count, Math.max(0, Math.floor(Number(saved?.correct) || 0)));
    const level = levels[question.difficulty - 1];
    level.total += 1;
    level.seen += Number(count > 0);
    level.solved += Number(wins > 0);
    level.mastered += Number(wins >= 2);
    level.xp += Math.min(2, wins) * question.difficulty * 10;
    level.maxXp += question.difficulty * 20;
    attempts += count; correct += wins;
  }
  const xp = levels.reduce((n, level) => n + level.xp, 0);
  const rank = questions.length ? ranks.filter(rank => xp >= rank.xp).at(-1) : ranks[0];
  const next = ranks[rank.tier] || null;
  const remaining = next ? next.xp - xp : 0;
  const percent = !questions.length ? 0 : next ? Math.floor((xp - rank.xp) / (next.xp - rank.xp) * 100) : 100;
  const incomplete = levels.filter(level => level.xp < level.maxXp);
  // Recommend the least practiced level, with easier levels winning a tie.
  const recommended = incomplete.filter(level => questions.filter(q => q.difficulty === level.difficulty && (!q.status || q.status === 'active')).length >= 20)
    .sort((a, b) => a.xp / a.maxXp - b.xp / b.maxXp || a.difficulty - b.difficulty)[0];
  return {
    version: 1, xp, rank, next, remaining, percent, ranks, levels,
    total: questions.length, maxXp: levels.reduce((n, level) => n + level.maxXp, 0),
    solved: levels.reduce((n, level) => n + level.solved, 0),
    mastered: levels.reduce((n, level) => n + level.mastered, 0),
    attempts, accuracy: attempts ? Math.round(correct / attempts * 100) : null,
    recommendedMode: recommended ? String(recommended.difficulty) : 'mixed'
  };
}

return progression;
});

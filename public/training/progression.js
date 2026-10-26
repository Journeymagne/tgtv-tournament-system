(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingProgression = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
function progression(questions, ranks, stats = {}, retainedTier = 1) {
  const active = questions.filter(q => !q.status || q.status === 'active');
  const maximum = active.reduce((n, q) => n + q.difficulty * 20, 0);
  const thresholds = [0, .04, .16, .36, .64, 1];
  ranks = ranks.map((rank, i) => ({ ...rank, xp: Math.round(maximum * thresholds[i]) }));
  const levels = [1, 2, 3, 4].map(difficulty => ({ difficulty, total: 0, seen: 0, solved: 0, mastered: 0, xp: 0, maxXp: 0 }));
  const byId = new Map(questions.map(q => [q.id, q]));
  let attempts = 0, correct = 0, xp = 0, lifetimeSolved = 0, lifetimeMastered = 0;
  for (const [id, saved] of Object.entries(stats || {})) {
    const count = Math.max(0, Math.floor(Number(saved?.attempts) || 0));
    const wins = Math.min(count, Math.max(0, Math.floor(Number(saved?.correct) || 0)));
    const q = byId.get(id);
    xp += Number.isFinite(saved.xp) ? Math.max(0, saved.xp) : Math.min(2, wins) * (q?.original?.difficulty || q?.difficulty || 0) * 10;
    attempts += count; correct += wins;
    lifetimeSolved += Number(wins > 0); lifetimeMastered += Number(wins >= 2);
  }
  for (const question of active) {
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
  }
  // Lifetime XP is never removed. Qualification measures only the active course;
  // credit for withdrawn questions cannot substitute for unlearned active ones.
  const courseXp = levels.reduce((n, level) => n + level.xp, 0);
  const qualifiedRank = active.length ? ranks.filter(rank => courseXp >= rank.xp).at(-1) : ranks[0];
  const tier = Math.max(qualifiedRank.tier, Math.min(6, Math.max(1, Math.floor(Number(retainedTier) || 1))));
  const rank = ranks[tier - 1];
  const next = ranks[rank.tier] || null;
  const recertification = active.length > 0 && rank.tier > qualifiedRank.tier;
  const recertificationRemaining = recertification ? Math.max(0, rank.xp - courseXp) : 0;
  const remaining = next ? Math.max(0, next.xp - courseXp) : 0;
  const percent = !active.length ? 0 : recertification ? Math.floor(courseXp / Math.max(1, rank.xp) * 100)
    : next ? Math.floor((courseXp - rank.xp) / Math.max(1, next.xp - rank.xp) * 100) : 100;
  const incomplete = levels.filter(level => level.xp < level.maxXp);
  // Recommend the least practiced level, with easier levels winning a tie.
  const recommended = incomplete.filter(level => questions.filter(q => q.difficulty === level.difficulty && (!q.status || q.status === 'active')).length >= 20)
    .sort((a, b) => a.xp / a.maxXp - b.xp / b.maxXp || a.difficulty - b.difficulty)[0];
  return {
    version: 2, xp, courseXp, rank, qualifiedRank, next, remaining, percent, ranks, levels,
    recertification, recertificationRemaining, lifetimeSolved, lifetimeMastered,
    total: active.length, maxXp: maximum,
    solved: levels.reduce((n, level) => n + level.solved, 0),
    mastered: levels.reduce((n, level) => n + level.mastered, 0),
    attempts, accuracy: attempts ? Math.round(correct / attempts * 100) : null,
    recommendedMode: recommended ? String(recommended.difficulty) : 'mixed'
  };
}

return progression;
});

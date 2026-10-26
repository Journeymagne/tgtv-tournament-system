(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingProgressHistory = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  // Recover the original 100-question ranks using dated answers, never answers
  // earned after the expansion. Account history is complete; guests may have less.
  function bootstrap(stats, sessions, questions, legacyCutoff) {
    const byId = new Map(questions.map(q => [q.id, q]));
    const cutoff = Date.parse(legacyCutoff);
    const items = sessions.flatMap(s => s.items || []).filter(i => i.correct && i.answeredAt)
      .sort((a, b) => Date.parse(a.answeredAt) - Date.parse(b.answeredAt));
    const credits = new Map(), legacyWins = new Map();
    for (const item of items) {
      const q = item.question || byId.get(item.questionId)?.original || byId.get(item.questionId);
      const credit = credits.get(item.questionId) || { count: 0, xp: 0 };
      if (q && credit.count < 2) { credit.xp += q.difficulty * 10; credit.count++; }
      credits.set(item.questionId, credit);
      if (/^kt-\d{3}$/.test(item.questionId) && Number(item.questionId.slice(3)) <= 100 && Date.parse(item.answeredAt) < cutoff) {
        legacyWins.set(item.questionId, Math.min(2, (legacyWins.get(item.questionId) || 0) + 1));
      }
    }
    let legacyXp = 0;
    const restored = {};
    for (const [id, saved] of Object.entries(stats || {})) {
      const q = byId.get(id), original = q?.original || q;
      const wins = Math.max(0, Math.min(2, Number(saved.correct) || 0, Number(saved.attempts) || 0));
      const oldValue = wins * Math.max(q?.difficulty || 0, original?.difficulty || 0) * 10;
      restored[id] = { ...saved, xp: Number.isFinite(saved.xp) ? saved.xp : Math.max(oldValue, credits.get(id)?.xp || 0) };
      if (/^kt-\d{3}$/.test(id) && Number(id.slice(3)) <= 100) {
        const datedWins = Date.parse(saved.lastAt) < cutoff ? wins : 0;
        legacyXp += Math.max(datedWins, legacyWins.get(id) || 0) * (original?.difficulty || 0) * 10;
      }
    }
    const legacyTier = [0, 200, 800, 1800, 3200, 5000].filter(xp => legacyXp >= xp).length;
    return { stats: restored, legacyTier };
  }
  return { bootstrap };
});

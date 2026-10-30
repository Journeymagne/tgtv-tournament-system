(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./team-courses'));
  else root.KTTrainingSessionBank = factory(root.KTTrainingTeams);
})(typeof globalThis === 'object' ? globalThis : this, function (teams) {
  function snapshot(q) {
    return { id: q.id, difficulty: q.difficulty, topic: q.topic, question: q.question,
      options: [...q.options], answer: q.answer, explanation: q.explanation, source: { ...q.source },
      ...(q.team ? { team: q.team } : {}),
      ...(q.references ? { references: q.references.map(ref => ({ ...ref })) } : {}),
      ...(q.sourceNote ? { sourceNote: q.sourceNote } : {}),
      version: q.version || 1, revision: q.revision || 1 };
  }
  function reconcile(session, questions, makeItem, pick, stats = {}) {
    if (!session) return false;
    const before = JSON.stringify(session.items);
    const byId = new Map(questions.map(q => [q.id, q]));
    const used = new Set(session.items.map(item => item.questionId));
    const pool = questions.filter(q => q.status === 'active' && teams.matches(q, session.team || 'core', session.mode));
    session.items = session.items.map(item => {
      const q = byId.get(item.questionId);
      if (!item.question && q) item.question = snapshot(q.original || q);
      if (item.selected !== null || item.skipped) return item;
      if (q?.status === 'active' && teams.matches(q, session.team || 'core', session.mode)) {
        if (item.question?.version !== q.version) return { ...makeItem(q), ...(item.targetQuestionId ? { targetQuestionId: item.targetQuestionId } : {}) };
        // PostgreSQL JSONB changes object-key order. Do not rebuild an unchanged
        // snapshot: otherwise every read looks like a session edit and rejects answers.
        if (item.question.revision !== q.revision) item.question = snapshot(q);
        return item;
      }
      // A deliberate bank selection must never silently become another question.
      const eligible = item.targetQuestionId ? [] : pool.filter(q => !used.has(q.id) &&
        ((session.team || 'core') === 'core' || teams.unsolved(q, stats)));
      const priority = eligible.filter(q => !stats[q.id]?.lastCorrect);
      const candidates = priority.length ? priority : eligible;
      if (candidates.length) {
        const replacement = pick(candidates);
        used.add(replacement.id);
        return makeItem(replacement);
      }
      return { ...item, skipped: true };
    });
    return before !== JSON.stringify(session.items);
  }
  return { snapshot, reconcile };
});

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingSessionBank = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  function snapshot(q) {
    return { id: q.id, difficulty: q.difficulty, topic: q.topic, question: q.question,
      options: [...q.options], answer: q.answer, explanation: q.explanation, source: { ...q.source },
      version: q.version || 1, revision: q.revision || 1 };
  }
  function reconcile(session, questions, makeItem, pick) {
    if (!session) return false;
    const before = JSON.stringify(session.items);
    const byId = new Map(questions.map(q => [q.id, q]));
    const used = new Set(session.items.map(item => item.questionId));
    const pool = questions.filter(q => q.status === 'active' && (session.mode === 'mixed' || q.difficulty === Number(session.mode)));
    session.items = session.items.map(item => {
      const q = byId.get(item.questionId);
      if (!item.question && q) item.question = snapshot(q.original || q);
      if (item.selected !== null || item.skipped) return item;
      if (q?.status === 'active' && (session.mode === 'mixed' || q.difficulty === Number(session.mode))) {
        if (item.question?.version !== q.version) return makeItem(q);
        // PostgreSQL JSONB changes object-key order. Do not rebuild an unchanged
        // snapshot: otherwise every read looks like a session edit and rejects answers.
        if (item.question.revision !== q.revision) item.question = snapshot(q);
        return item;
      }
      const candidates = pool.filter(q => !used.has(q.id));
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

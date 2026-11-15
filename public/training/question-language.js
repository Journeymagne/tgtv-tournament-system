(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingQuestionLanguage = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  function signature(q) {
    return JSON.stringify([q.topic, q.question, ...q.options, q.explanation, q.source.section]);
  }
  function localize(q, locale, translations) {
    if (!q || locale !== 'en') return q;
    const current = translations[q.id];
    const original = signature(q);
    const entry = current?.original === original ? current
      : current?.versions?.find(version => version.original === original);
    // Never apply a translation of a different editorial version to a saved answer.
    if (!entry) return q;
    return { ...q, topic: entry.topic, question: entry.question,
      options: [...entry.options], explanation: entry.explanation,
      source: { ...q.source, section: entry.section } };
  }
  return { signature, localize };
});

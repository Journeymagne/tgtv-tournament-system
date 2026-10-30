(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingTeams = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const teams = [{ id: 'hand-of-the-archon', name: 'Hand of the Archon' }];
  const valid = team => team === 'core' || teams.some(value => value.id === team);
  const matches = (q, team = 'core', mode = 'mixed') => (q.team || 'core') === team && (mode === 'mixed' || q.difficulty === Number(mode));
  const unanswered = (q, stats = {}) => !(stats[q.id]?.attempts > 0);
  function available(questions, stats = {}, team = 'core', mode = 'mixed') {
    return questions.filter(q => (!q.status || q.status === 'active') && matches(q, team, mode) &&
      (team === 'core' || unanswered(q, stats)));
  }
  function select(questions, stats, team, mode, shuffle) {
    const pool = available(questions, stats, team, mode);
    const priority = pool.filter(q => !stats[q.id]?.lastCorrect);
    const repeat = pool.filter(q => stats[q.id]?.lastCorrect);
    return [...shuffle(priority), ...shuffle(repeat)].slice(0, 20);
  }
  function progress(questions, stats = {}, awards = {}) {
    return teams.map(team => {
      const pool = questions.filter(q => q.team === team.id && (!q.status || q.status === 'active'));
      const solved = pool.filter(q => stats?.[q.id]?.correct > 0).length;
      const qualified = pool.length > 0 && solved === pool.length;
      return { ...team, total: pool.length, solved, qualified, earned: Boolean(awards?.[team.id]) || qualified,
        earnedAt: awards?.[team.id]?.earnedAt || null, percent: pool.length ? Math.floor(solved / pool.length * 100) : 0 };
    });
  }
  return { teams, valid, matches, unanswered, available, select, progress };
});

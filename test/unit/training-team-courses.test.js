const test = require('node:test');
const assert = require('node:assert/strict');
const teams = require('../../public/training/team-courses');
const { progression } = require('../../src/domain/training-progression');
const { reconcile, snapshot } = require('../../public/training/session-bank');
const team = 'hand-of-the-archon';
const q = (id, extra = {}) => ({ id, difficulty: 3, topic: 'Example', question: 'Example question?',
  options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'Example explanation', source: { url: 'https://wahapedia.ru/' },
  status: 'active', version: 1, revision: 1, ...extra });

test('team answers and bank expansion do not change the core rank or course', () => {
  const core = q('core'), archon = q('archon', { team });
  const coreStats = { core: { attempts: 2, correct: 2, xp: 60 } };
  const baseline = progression(coreStats, [core]);
  const expanded = progression({ ...coreStats, archon: { attempts: 5, correct: 3, xp: 60 } }, [core, archon]);
  assert.deepEqual(expanded, baseline);
  assert.equal(teams.matches(core), true);
  assert.equal(teams.matches(archon), false);
  assert.equal(teams.matches(archon, team, '3'), true);
  assert.equal(teams.matches(archon, team, '4'), false);
});

test('team achievement needs every active question once; mistakes, review and deleted questions do not remove credit', () => {
  const questions = [q('a', { team }), q('b', { team }), q('c', { team, status: 'review' }), q('d', { team, status: 'deleted' })];
  assert.equal(teams.progress(questions, { a: { correct: 10 } })[0].earned, false);
  const complete = teams.progress(questions, { a: { correct: 1, lastCorrect: false }, b: { correct: 1 } })[0];
  assert.equal(complete.total, 2);
  assert.equal(complete.solved, 2);
  assert.equal(complete.earned, true);
  assert.equal(teams.progress([])[0].earned, false, 'empty course must not grant an achievement');
  const earnedAt = '2026-10-30T12:00:00Z';
  const retained = teams.progress(questions, {}, { [team]: { earnedAt } })[0];
  assert.equal(retained.earned, true);
  assert.equal(retained.qualified, false);
  assert.equal(retained.earnedAt, earnedAt);
});

test('moderation replacements never cross courses, and snapshots retain rule references', () => {
  const refs = [{ title: 'Invigorations', url: 'https://wahapedia.ru/kill-team3/kill-teams/hand-of-the-archon/#Invigorations' }];
  const removed = q('removed', { team, status: 'review' });
  const replacement = q('replacement', { team, references: refs });
  const core = q('core');
  const makeItem = value => ({ questionId: value.id, question: snapshot(value), selected: null });
  const session = { team, mode: 'mixed', items: [makeItem(removed)] };
  assert.equal(reconcile(session, [removed, core, replacement], makeItem, pool => pool[0]), true);
  assert.equal(session.items[0].questionId, 'replacement');
  assert.deepEqual(session.items[0].question.references, refs);
  assert.equal(session.items[0].question.team, team);
  const exhausted = { team, mode: 'mixed', items: [makeItem(removed)] };
  reconcile(exhausted, [removed, core], makeItem, pool => pool[0]);
  assert.equal(exhausted.items[0].skipped, true);
  assert.equal(exhausted.items[0].questionId, 'removed');
});

test('guest team session can finish below 20 questions and retain its achievement after reload', async () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const questions = [q('a', { team }), q('b', { team }), q('core')];
  const bank = { version: 'test-teams', revision: 1, questions, journey: progression({}, questions) };
  let saved = null;
  const sandbox = { structuredClone, navigator: {},
    localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } },
    window: { KTTrainingTeams: teams, KTTrainingSessionBank: require('../../public/training/session-bank'),
      KTTrainingProgression: require('../../public/training/progression'),
      KTTrainingProgressHistory: require('../../public/training/progression-history'),
      KTTrainingAPI: { questions: async () => bank } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../public/training/guest-progress'), 'utf8'), sandbox);
  const guest = sandbox.window.KTTrainingGuest(bank);
  let { state } = await guest.refresh();
  ({ state } = await guest.start({ sessionId: 'guest-test', mode: 'mixed', team, revision: state.revision }));
  assert.equal(state.active.items.length, 2);
  for (const item of [...state.active.items]) {
    ({ state } = await guest.answer('guest-test', { questionId: item.questionId, questionVersion: 1, selected: 1, revision: state.revision }));
    ({ state } = await guest.advance('guest-test', { questionId: item.questionId, revision: state.revision }));
  }
  assert.equal(state.active, null);
  assert.equal(state.completedCount, 1);
  assert.equal(state.teamAchievements[0].earned, true);
  assert.equal(state.journey.xp, 0);
  const again = (await sandbox.window.KTTrainingGuest(bank).refresh()).state;
  assert.equal(again.history[0].items.length, 2);
  assert.equal(again.teamAchievements[0].earnedAt, state.teamAchievements[0].earnedAt);
});

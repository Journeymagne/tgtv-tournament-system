const test = require('node:test');
const assert = require('node:assert/strict');
const { progression } = require('../../src/domain/training-progression');
const { questions } = require('../../src/domain/training');
const { bootstrap } = require('../../public/training/progression-history');
const statsFor = questions => Object.fromEntries(questions.map(q => [q.id, { attempts: 2, correct: 2, xp: q.difficulty * 20 }]));

test('withdrawn questions leave the course without removing lifetime XP or answers', () => {
  const bank = [
    { id: 'one', difficulty: 1, status: 'active' },
    { id: 'two', difficulty: 4, status: 'review' },
    { id: 'three', difficulty: 3, status: 'deleted' }
  ];
  const saved = statsFor(bank), j = progression(saved, bank);
  assert.equal(j.xp, 160);
  assert.equal(j.courseXp, 20);
  assert.equal(j.total, 1);
  assert.equal(j.mastered, 1);
  assert.equal(j.lifetimeMastered, 3);
  assert.equal(j.rank.id, 'judge');
  assert.equal(j.accuracy, 100);
  assert.equal(progression(saved, bank.map(q => ({ ...q, difficulty: 1 }))).xp, 160, 'editor changes do not reprice earned XP');
});

test('past XP cannot replace active knowledge, and recertification keeps the earned title', () => {
  const bank = questions.map(q => ({ ...q, status: 'active' }));
  const old = statsFor(bank.slice(0, 100));
  const pending = progression(old, bank, 6);
  assert.equal(pending.xp, 5000);
  assert.equal(pending.rank.id, 'judge');
  assert.equal(pending.qualifiedRank.id, 'regular');
  assert.equal(pending.recertification, true);
  assert.equal(pending.recertificationRemaining, 10000);
  assert.ok(pending.percent > 0 && pending.percent < 100);
  const completed = progression(statsFor(bank), bank, 6);
  assert.equal(completed.recertification, false);
  assert.equal(completed.percent, 100);
  const withdrawn = bank.map(q => ({ ...q, status: Number(q.id.slice(3)) <= 100 ? 'deleted' : 'active' }));
  assert.equal(progression(old, withdrawn).rank.id, 'noob');
  const empty = progression(old, bank.map(q => ({ ...q, status: 'review' })), 6);
  assert.equal(empty.total, 0);
  assert.equal(empty.recertification, false);
  assert.equal(empty.rank.id, 'judge');
  assert.equal(progression({}, []).rank.id, 'noob');
});

test('legacy ranks use answers dated before expansion even after later attempts', () => {
  const old = questions.slice(0, 100);
  const saved = Object.fromEntries(old.map(q => [q.id, { attempts: 3, correct: 2, lastAt: '2026-10-24T00:00:00Z' }]));
  const items = old.flatMap(q => [0, 1].map(() => ({ questionId: q.id, question: q, correct: true, answeredAt: '2026-10-21T00:00:00Z' })));
  const restored = bootstrap(saved, [{ items }], questions, '2026-10-22T20:46:00Z');
  assert.equal(restored.legacyTier, 6);
  assert.equal(Object.values(restored.stats).reduce((n, s) => n + s.xp, 0), 5000);
  const modern = bootstrap(saved, [{ items: items.map(i => ({ ...i, answeredAt: '2026-10-23T00:00:00Z' })) }], questions, '2026-10-22T20:46:00Z');
  assert.equal(modern.legacyTier, 1, 'new players cannot get Judge from just the first hundred questions');
});

test('guest reload retains title and XP when the active course changes', async () => {
  const vm = require('node:vm'), fs = require('node:fs');
  let bank = { version: 'test', revision: 1, questions, journey: progression(), legacyRankCutoff: '2026-10-22T20:46:00Z' };
  let saved = JSON.stringify({ bankVersion: 'test', revision: 0, active: null, history: [], completedCount: 10,
    stats: Object.fromEntries(questions.slice(0, 100).map(q => [q.id, { attempts: 2, correct: 2, lastAt: '2026-10-21T00:00:00Z' }])) });
  const sandbox = { structuredClone, navigator: {}, localStorage: { getItem: () => saved, setItem: (_, value) => { saved = value; } },
    window: { KTTrainingProgression: require('../../public/training/progression'), KTTrainingProgressHistory: { bootstrap },
      KTTrainingSessionBank: require('../../public/training/session-bank'), KTTrainingAPI: { questions: async () => bank } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../public/training/guest-progress'), 'utf8'), sandbox);
  const guest = sandbox.window.KTTrainingGuest(bank);
  const first = (await guest.refresh()).state;
  assert.equal(first.journey.rank.id, 'judge');
  assert.equal(first.journey.recertification, true);
  assert.equal((await guest.refresh()).state.revision, first.revision);
  bank = { ...bank, revision: 2, questions: questions.map(q => ({ ...q, status: q.id === 'kt-001' ? 'review' : 'active' })) };
  const changed = (await guest.refresh()).state;
  assert.equal(changed.journey.xp, 5000);
  assert.equal(changed.journey.total, 299);
  assert.equal(changed.journey.lifetimeMastered, 100);
  const reloaded = (await sandbox.window.KTTrainingGuest(bank).refresh()).state;
  assert.equal(reloaded.journey.rank.id, 'judge');
  assert.equal(reloaded.journey.xp, 5000);
});

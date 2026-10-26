(function () {
  'use strict';
  // Guest results stay in this browser and never become trusted account results.
  window.KTTrainingGuest = function (bank) {
    const key = 'kt-knowthykt-guest-v1';
    let questions = new Map(bank.questions.map(question => [question.id, question]));
    const snapshots = window.KTTrainingSessionBank;
    async function refreshBank() {
      const next = await window.KTTrainingAPI.questions(bank.revision);
      if (!next.unchanged) {
        bank = next;
        questions = new Map(bank.questions.map(question => [question.id, question]));
      }
    }
    const compatibleVersions = new Set([bank.version, ...(bank.compatibleVersions || [])]);
    const empty = () => ({ bankVersion: bank.version, user: null, guest: true, revision: 0,
      active: null, history: [], stats: {}, completedCount: 0, historyLimit: 100 });
    let memory = empty(), persistent = true;
    function prepare(value) {
      let changed = false;
      if (value.progressionVersion !== 2) {
        const restored = window.KTTrainingProgressHistory.bootstrap(value.stats,
          [...value.history, ...(value.active ? [value.active] : [])], bank.questions, bank.legacyRankCutoff);
        const previous = window.KTTrainingProgression(bank.questions.filter(q => q.status !== 'deleted').map(q => ({ ...q, status: 'active' })), bank.journey.ranks, value.stats);
        value.stats = restored.stats;
        value.rankTier = Math.max(value.rankTier || 1, restored.legacyTier, previous.rank.tier);
        value.progressionVersion = 2;
        changed = true;
      }
      const next = window.KTTrainingProgression(bank.questions, bank.journey.ranks, value.stats, value.rankTier);
      if (value.rankTier !== next.rank.tier) { value.rankTier = next.rank.tier; changed = true; }
      return changed;
    }
    function read() {
      if (!persistent) return structuredClone(memory);
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        const validSession = session => session && Array.isArray(session.items) && session.items.length === 20 &&
          session.items.every(item => questions.has(item.questionId) && Array.isArray(item.optionOrder));
        if (compatibleVersions.has(saved?.bankVersion) && Number.isInteger(saved.revision) && saved.stats &&
            Array.isArray(saved.history) && saved.history.every(validSession) && (!saved.active || validSession(saved.active))) {
          return { ...saved, bankVersion: bank.version, user: null, guest: true };
        }
      } catch { persistent = false; }
      return structuredClone(memory);
    }
    function response(value) {
      const state = structuredClone(value);
      state.journey = window.KTTrainingProgression(bank.questions, bank.journey.ranks, state.stats, state.rankTier);
      state.bankRevision = bank.revision;
      state.localPersistence = persistent;
      return { state, bank };
    }
    function save(value) {
      prepare(value);
      value.revision += 1;
      value.history = value.history.slice(0, 100);
      memory = structuredClone(value);
      if (persistent) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch { persistent = false; }
      }
      return response(value);
    }
    function conflict() {
      const error = Error('Прогресс изменился в другой вкладке. Повторите действие.');
      error.status = 409;
      throw error;
    }
    function change(body, action) {
      const run = async () => {
        await refreshBank();
        const value = read();
        if (snapshots.reconcile(value.active, bank.questions, makeItem, pool => shuffle(pool)[0])) save(value);
        if (body.revision !== value.revision) conflict();
        prepare(value);
        action(value);
        return save(value);
      };
      return navigator.locks ? navigator.locks.request(key, run) : Promise.resolve().then(run);
    }
    function shuffle(values) {
      const result = [...values];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
    function current(value, id, body) {
      const session = value.active;
      if (!session || session.id !== id || session.items[session.cursor]?.questionId !== body.questionId) conflict();
      return session;
    }
    function makeItem(q) {
      return { questionId: q.id, question: snapshots.snapshot(q), optionOrder: shuffle([0,1,2,3]), selected: null, correct: null, answeredAt: null };
    }
    return {
      refresh: async () => {
        await refreshBank();
        const readCurrent = () => {
          const value = read();
          const repaired = snapshots.reconcile(value.active, bank.questions, makeItem, pool => shuffle(pool)[0]);
          return prepare(value) || repaired ? save(value) : response(value);
        };
        return navigator.locks ? navigator.locks.request(key, readCurrent) : readCurrent();
      },
      start: body => change(body, value => {
        if (!['mixed', '1', '2', '3', '4'].includes(body.mode)) throw Error('Выберите сложность сессии.');
        if ((value.active?.id || null) !== (body.replaceSessionId || null)) conflict();
        const pool = bank.questions.filter(q => q.status === 'active' && (body.mode === 'mixed' || q.difficulty === Number(body.mode)));
        if (pool.length < 20) throw Error('В этом режиме осталось меньше 20 вопросов. Выберите другую сложность.');
        if (value.active) value.history.unshift({ ...value.active, status: 'abandoned', finishedAt: new Date().toISOString() });
        value.active = { id: body.sessionId, bankVersion: bank.version, mode: body.mode, status: 'active', cursor: 0,
          startedAt: new Date().toISOString(), finishedAt: null,
          items: shuffle(pool).slice(0, 20).map(makeItem) };
      }),
      answer: (id, body) => change(body, value => {
        const session = current(value, id, body), item = session.items[session.cursor];
        const question = questions.get(item.questionId);
        if (item.skipped || question.status !== 'active' || body.questionVersion !== question.version) conflict();
        if (!Number.isInteger(body.selected) || body.selected < 0 || body.selected > 3) throw Error('Выберите ответ.');
        if (item.selected !== null) conflict();
        item.selected = body.selected;
        item.correct = body.selected === questions.get(item.questionId).answer;
        item.answeredAt = new Date().toISOString();
        const prior = value.stats[item.questionId] || { attempts: 0, correct: 0 };
        value.stats[item.questionId] = { ...prior, attempts: prior.attempts + 1, correct: prior.correct + Number(item.correct),
          xp: (prior.xp || 0) + (item.correct && prior.correct < 2 ? question.difficulty * 10 : 0),
          lastCorrect: item.correct, lastAt: item.answeredAt };
      }),
      advance: (id, body) => change(body, value => {
        const session = current(value, id, body);
        if (session.items[session.cursor].selected === null && !session.items[session.cursor].skipped) throw Error('Сначала проверьте ответ.');
        if (session.cursor === 19) {
          value.history.unshift({ ...session, status: 'completed', finishedAt: new Date().toISOString() });
          value.completedCount += 1;
          value.active = null;
        } else session.cursor += 1;
      })
    };
  };
})();

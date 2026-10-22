(function () {
  'use strict';
  // Guest results stay in this browser and never become trusted account results.
  window.KTTrainingGuest = function (bank) {
    const key = 'kt-knowthykt-guest-v1';
    const questions = new Map(bank.questions.map(question => [question.id, question]));
    const empty = () => ({ bankVersion: bank.version, user: null, guest: true, revision: 0,
      active: null, history: [], stats: {}, completedCount: 0, historyLimit: 100 });
    let memory = empty(), persistent = true;
    function read() {
      if (!persistent) return structuredClone(memory);
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        const validSession = session => session && Array.isArray(session.items) && session.items.length === 20 &&
          session.items.every(item => questions.has(item.questionId) && Array.isArray(item.optionOrder));
        if (saved?.bankVersion === bank.version && Number.isInteger(saved.revision) && saved.stats &&
            Array.isArray(saved.history) && saved.history.every(validSession) && (!saved.active || validSession(saved.active))) {
          return { ...saved, user: null, guest: true };
        }
      } catch { persistent = false; }
      return structuredClone(memory);
    }
    function response(value) {
      const state = structuredClone(value);
      state.journey = window.KTTrainingProgression(bank.questions, bank.journey.ranks, state.stats);
      state.localPersistence = persistent;
      return { state };
    }
    function save(value) {
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
      const run = () => {
        const value = read();
        if (body.revision !== value.revision) conflict();
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
    return {
      refresh: async () => response(read()),
      start: body => change(body, value => {
        if (!['mixed', '1', '2', '3', '4'].includes(body.mode)) throw Error('Выберите сложность сессии.');
        if ((value.active?.id || null) !== (body.replaceSessionId || null)) conflict();
        if (value.active) value.history.unshift({ ...value.active, status: 'abandoned', finishedAt: new Date().toISOString() });
        const pool = bank.questions.filter(q => body.mode === 'mixed' || q.difficulty === Number(body.mode));
        value.active = { id: body.sessionId, bankVersion: bank.version, mode: body.mode, status: 'active', cursor: 0,
          startedAt: new Date().toISOString(), finishedAt: null,
          items: shuffle(pool).slice(0, 20).map(q => ({ questionId: q.id, optionOrder: shuffle([0, 1, 2, 3]),
            selected: null, correct: null, answeredAt: null })) };
      }),
      answer: (id, body) => change(body, value => {
        const session = current(value, id, body), item = session.items[session.cursor];
        if (!Number.isInteger(body.selected) || body.selected < 0 || body.selected > 3) throw Error('Выберите ответ.');
        if (item.selected !== null) conflict();
        item.selected = body.selected;
        item.correct = body.selected === questions.get(item.questionId).answer;
        item.answeredAt = new Date().toISOString();
        const prior = value.stats[item.questionId] || { attempts: 0, correct: 0 };
        value.stats[item.questionId] = { attempts: prior.attempts + 1, correct: prior.correct + Number(item.correct),
          lastCorrect: item.correct, lastAt: item.answeredAt };
      }),
      advance: (id, body) => change(body, value => {
        const session = current(value, id, body);
        if (session.items[session.cursor].selected === null) throw Error('Сначала проверьте ответ.');
        if (session.cursor === 19) {
          value.history.unshift({ ...session, status: 'completed', finishedAt: new Date().toISOString() });
          value.completedCount += 1;
          value.active = null;
        } else session.cursor += 1;
      })
    };
  };
})();

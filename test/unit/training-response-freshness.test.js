const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../../public/training/app.js'), 'utf8');
const account = { id: 41, name: 'Trainee', isAdmin: false };
const question = (id = 'q1', text = 'Current question') => ({ id, question: text,
  options: ['Yes', 'No'], answer: 0, difficulty: 1, topic: 'Rules',
  explanation: 'Answer explanation', status: 'active', version: 1, revision: 1,
  source: { title: 'Rules', url: 'https://example.org/rules', section: 'Core' } });
const journey = xp => ({ xp, rank: { tier: 1, name: 'Recruit' } });
const bank = (revision, count = 1, text = 'Current question') => ({ revision,
  questions: Array.from({ length: count }, (_, i) => question('q' + (i + 1), text)), journey: journey(0) });
function progress({ revision = 10, bankRevision = 1, user = account, saved = false } = {}) {
  return { user, revision, bankRevision, journey: journey(saved ? 10 : 0), stats: saved
    ? { q1: { attempts: 1, correct: 1, lastCorrect: true } } : {}, history: [], completedCount: 0,
    teamAchievements: [], active: { id: 'session', team: 'core', mode: 'mixed', cursor: 0,
      items: [{ questionId: 'q1', optionOrder: [0, 1], selected: saved ? 0 : null, correct: saved }] } };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Execute the entire shipped IIFE. The DOM adapter retains rendered HTML and
// real event handlers; no app function is extracted or replaced for this test.
async function openTraining({ user = account, initialBank = bank(1) } = {}) {
  const nodes = new Map(), windowEvents = new Map();
  class Element {
    constructor() { this.listeners = new Map(); this.dataset = {}; this.attributes = {}; this.classList = { toggle() {} }; }
    addEventListener(name, listener) {
      if (!this.listeners.has(name)) this.listeners.set(name, []);
      this.listeners.get(name).push(listener);
    }
    async emit(name) { await Promise.all((this.listeners.get(name) || []).map(fn => fn({ target: this, preventDefault() {} }))); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() {}
    querySelector(selector) { return nodes.get(selector) || null; }
    querySelectorAll(selector) {
      if (selector === '[data-option]') return this.buttons.filter(button => button.dataset.option !== undefined);
      if (selector === 'button') return this.buttons || [];
      if (selector === '[data-was-disabled]') return (this.buttons || []).filter(button => button.dataset.wasDisabled !== undefined);
      return [];
    }
    set innerHTML(html) {
      this.html = html;
      for (const key of this.dynamicIds || []) nodes.delete(key);
      this.dynamicIds = []; this.buttons = [];
      for (const match of html.matchAll(/<(\w+)\b([^>]*)>/g)) {
        const [, tag, attrs] = match;
        const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
        if (!id && tag !== 'button') continue;
        const element = new Element(); element.disabled = /\bdisabled\b/.test(attrs);
        const option = /data-option="([^"]+)"/.exec(attrs)?.[1];
        if (option !== undefined) element.dataset.option = option;
        if (id) { nodes.set('#' + id, element); this.dynamicIds.push('#' + id); }
        if (tag === 'button') this.buttons.push(element);
      }
    }
    get innerHTML() { return this.html || ''; }
    replaceChildren() { this.innerHTML = ''; }
    append(...children) { this.children = children; }
  }
  for (const selector of ['#main', '#save-status', '#connection-notice', '#toast', '#breadcrumb',
    '#report-question', '#report-comment', '#report-error', '#report-dialog', '#report-form',
    '#report-cancel', '#confirm-cancel', '#confirm-accept', '.skip-link',
    '.training-footer span:last-child', '[data-nav="moderation"]']) nodes.set(selector, new Element());
  const initial = progress({ user, bankRevision: initialBank.revision });
  let refreshResult = { state: initial }, answerResult;
  const banks = [], questionRequests = [], answers = [];
  const root = {
    location: { hash: '#session', search: '', reload() {} }, URLSearchParams,
    crypto: { randomUUID: () => 'request-id' },
    setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    document: { hidden: false, querySelector: selector => nodes.get(selector) || null,
      querySelectorAll: () => [], createElement: () => new Element(), addEventListener() {} },
    addEventListener(name, listener) { windowEvents.set(name, listener); }, scrollTo() {},
    KTUI: { locale: () => 'ru' }, KTCompanion: { ready: Promise.resolve({ user }), loginUrl: () => '/login' },
    KTTrainingQuestionLanguage: { localize: value => value },
    KTTrainingTeams: { valid: () => true, teams: [], progress: () => [] },
    KTTrainingJourneyUI: {}, KTTrainingModeration: () => ({}),
    KTTrainingAPI: {
      async questions() {
        const response = banks.length ? banks.shift() : initialBank;
        questionRequests.push(response);
        return response;
      },
      async connect(identity) { root.KTAccount = { id: identity.id }; return { state: initial }; },
      async refresh() { return refreshResult; },
      async answer(id, payload) { answers.push({ id, ...payload }); return answerResult; }
    },
    KTTrainingGuest: () => ({ refresh: async () => ({ state: initial }) })
  };
  root.window = root;
  await vm.runInNewContext(source, root, { filename: 'public/training/app.js' });
  assert.match(nodes.get('#main').innerHTML, /question-card/, 'the real app must finish initial rendering');
  return {
    root, nodes, banks, questionRequests, answers,
    refreshWith(value) { refreshResult = value; }, answerWith(value) { answerResult = value; },
    sessionWith(user) { windowEvents.get('kt:session')({ detail: { user } }); },
    focus: () => windowEvents.get('focus')(),
    async answer() {
      await nodes.get('#main').querySelectorAll('[data-option]')[0].emit('click');
      await nodes.get('#check-answer').emit('click');
    }
  };
}
async function waitForBankRequest(app, count) {
  // Drain only promise continuations, with a bound so a missing request fails.
  for (let i = 0; i < 20 && app.questionRequests.length < count; i++) await Promise.resolve();
  assert.equal(app.questionRequests.length, count, 'refresh must be suspended at the real bank request');
}

test('training keeps a saved answer and XP when an older refresh bank request finishes last', async () => {
  const app = await openTraining();
  const oldBank = deferred(); app.banks.push(oldBank.promise);
  app.refreshWith({ state: progress({ bankRevision: 2 }) });
  const refresh = app.focus();
  await waitForBankRequest(app, 2);
  // Authenticated answer responses contain state only. Its own bank fetch must
  // finish before the older refresh's deferred fetch completes.
  app.banks.push(bank(2));
  app.answerWith({ state: progress({ revision: 11, bankRevision: 2, saved: true }) });
  await app.answer();
  assert.equal(app.answers[0].revision, 10);
  assert.match(app.nodes.get('#main').innerHTML, /10 XP/);
  assert.match(app.nodes.get('#main').innerHTML, /explanation success/);
  oldBank.resolve(bank(2)); await refresh;
  assert.match(app.nodes.get('#main').innerHTML, /10 XP/, 'confirmed XP must survive the delayed refresh');
  assert.match(app.nodes.get('#main').innerHTML, /explanation success/, 'confirmed answer must stay saved');
});

test('training cannot replace a newer catalogue with a delayed older bank', async () => {
  const app = await openTraining();
  const oldBank = deferred(); app.banks.push(oldBank.promise);
  app.refreshWith({ state: progress({ bankRevision: 2 }) });
  const refresh = app.focus(); await waitForBankRequest(app, 2);
  app.answerWith({ state: progress({ revision: 11, bankRevision: 3, saved: true }),
    bank: bank(3, 2, 'Newest catalogue question') });
  await app.answer();
  oldBank.resolve(bank(2, 1, 'Obsolete catalogue question')); await refresh;
  assert.equal(app.nodes.get('.training-footer span:last-child').textContent, '2 вопросов · Kill Team 2024');
  assert.match(app.nodes.get('#main').innerHTML, /Newest catalogue question/);
  assert.doesNotMatch(app.nodes.get('#main').innerHTML, /Obsolete catalogue question/);
});

test('training ignores a bank response belonging to the previous shared account identity', async () => {
  const app = await openTraining();
  const before = app.nodes.get('#main').innerHTML;
  const oldBank = deferred(); app.banks.push(oldBank.promise);
  app.refreshWith({ state: progress({ bankRevision: 2 }) });
  const refresh = app.focus(); await waitForBankRequest(app, 2);
  app.root.KTAccount = { id: 99 };
  oldBank.resolve(bank(2, 2, 'Previous account bank')); await refresh;
  assert.equal(app.nodes.get('#main').innerHTML, before);
  assert.equal(app.nodes.get('.training-footer span:last-child').textContent, '1 вопросов · Kill Team 2024');
});

test('training initial account and guest setup both accept their first progress response', async () => {
  for (const user of [account, null]) {
    const app = await openTraining({ user });
    assert.match(app.nodes.get('#main').innerHTML, /Current question/);
    assert.match(app.nodes.get('#main').innerHTML, /0 XP/);
    if (user) assert.match(app.nodes.get('#save-status').textContent, /Trainee/);
  }
});

test('training ignores the old bank after the shared shell announces logout or another account', async () => {
  for (const user of [null, { id: 99 }]) {
    const app = await openTraining();
    const before = app.nodes.get('#main').innerHTML;
    const oldBank = deferred(); app.banks.push(oldBank.promise);
    app.refreshWith({ state: progress({ bankRevision: 2 }) });
    const refresh = app.focus(); await waitForBankRequest(app, 2);
    app.sessionWith(user);
    oldBank.resolve(bank(2, 2, 'Previous account bank')); await refresh;
    assert.equal(app.nodes.get('#main').innerHTML, before);
    assert.equal(app.nodes.get('.training-footer span:last-child').textContent, '1 вопросов · Kill Team 2024');
  }
});

test('training accepts newer saved progress while retaining an already newer catalogue', async () => {
  const app = await openTraining({ initialBank: bank(3, 2, 'Newest catalogue question') });
  app.answerWith({ state: progress({ revision: 11, bankRevision: 2, saved: true }),
    bank: bank(2, 1, 'Obsolete catalogue question') });
  await app.answer();
  assert.match(app.nodes.get('#main').innerHTML, /10 XP/);
  assert.match(app.nodes.get('#main').innerHTML, /explanation success/);
  assert.match(app.nodes.get('#main').innerHTML, /Newest catalogue question/);
  assert.equal(app.nodes.get('.training-footer span:last-child').textContent, '2 вопросов · Kill Team 2024');
});

test('training retains the newer catalogue after a state-only answer waits on an older bank', async () => {
  const app = await openTraining({ initialBank: bank(3, 2, 'Newest catalogue question') });
  const delayed = deferred(); app.banks.push(delayed.promise);
  app.answerWith({ state: progress({ revision: 11, bankRevision: 2, saved: true }) });
  const answering = app.answer(); await waitForBankRequest(app, 2);
  delayed.resolve(bank(2, 1, 'Obsolete catalogue question')); await answering;
  assert.match(app.nodes.get('#main').innerHTML, /10 XP/);
  assert.match(app.nodes.get('#main').innerHTML, /explanation success/);
  assert.match(app.nodes.get('#main').innerHTML, /Newest catalogue question/);
  assert.equal(app.nodes.get('.training-footer span:last-child').textContent, '2 вопросов · Kill Team 2024');
});

test('training accepts catalogue-only refreshes at an unchanged progress revision', async () => {
  const app = await openTraining();
  app.refreshWith({ state: progress({ bankRevision: 2 }), bank: bank(2, 2, 'Updated catalogue question') });
  await app.focus();
  assert.match(app.nodes.get('#main').innerHTML, /Updated catalogue question/);
  assert.equal(app.nodes.get('.training-footer span:last-child').textContent, '2 вопросов · Kill Team 2024');
});

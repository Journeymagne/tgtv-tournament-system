const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scoring = require('../../src/domain/scoring');
const filename = path.resolve(__dirname, '../../src/telegram/game-draft-steps.js');
// Keep RED at named behavior assertions, rather than a module-loader failure.
const engine = fs.existsSync(filename) ? require(filename) : {};

function game(changes = {}) {
  return { id: 19, status: 'open', sourceType: 'challenge', playerIds: [11, 22],
    players: [{ id: 11, userId: 11, name: 'Alpha', factions: ['Kasrkin'] },
      { id: 22, userId: 22, name: 'Bravo', factions: ['Legionaries'] }],
    resultPermissions: { canSubmit: true, canReview: false }, ...changes };
}
function start(context = game(), mode = 'submit') {
  assert.equal(typeof engine.createState, 'function', 'step engine creates explicit unanswered fields');
  return { context, state: engine.createState(context, mode) };
}
function view(flow) { return engine.view(flow.context, flow.state); }
function event(flow, input) { flow.state = engine.transition(flow.context, flow.state, input); return view(flow); }
function choose(flow, value) {
  const current = view(flow);
  const index = current.choices.findIndex(choice => choice.value === value);
  assert.notEqual(index, -1, `choice ${JSON.stringify(value)} offered for ${current.step?.field}`);
  return event(flow, { type: 'choose', index });
}
function scores(flow, a = [6, 4, 5, 'crit'], b = [2, 3, 1, 'kill']) {
  for (const value of [...a, ...b]) choose(flow, value);
  return view(flow);
}

test('button result steps never turn unset scores into zero and require both primary selections', () => {
  const flow = start();
  assert.equal(view(flow).screen, 'choice');
  assert.equal(view(flow).step.field, 'crit');
  assert.equal(view(flow).step.playerId, 11);
  assert.deepEqual(view(flow).choices.map(choice => choice.value), [0, 1, 2, 3, 4, 5, 6]);
  assert.throws(() => engine.resultBody(flow.context, flow.state), /incomplete|answer|required/i);
  scores(flow);
  assert.equal(view(flow).screen, 'summary');
  const body = engine.resultBody(flow.context, flow.state);
  assert.deepEqual(scoring.calculateSubmittedResult(body, 11, 22).scores[11],
    scoring.calculateApprovedOps({ crit: 6, kill: 4, tac: 5, primary: 'crit', faction: 'Kasrkin' }));
});

test('Back and field editing retain answers while invalid choice indices do not change state', () => {
  const flow = start();
  choose(flow, 4);
  event(flow, { type: 'back' });
  assert.equal(view(flow).step.field, 'crit');
  assert.equal(view(flow).step.value, 4);
  const original = structuredClone(flow.state);
  for (const index of [-1, 7, 1.5, '1', NaN]) {
    assert.throws(() => engine.transition(flow.context, flow.state, { type: 'choose', index }));
    assert.deepEqual(flow.state, original);
  }
  choose(flow, 4);
  for (const value of [4, 5, 'crit', 2, 3, 1, 'kill']) choose(flow, value);
  const field = view(flow).editableFields.findIndex(item => item.playerId === 11 && item.field === 'kill');
  assert.ok(field >= 0);
  event(flow, { type: 'edit', index: field });
  assert.equal(view(flow).step.value, 4);
  choose(flow, 6);
  assert.equal(view(flow).screen, 'summary');
  assert.equal(engine.resultBody(flow.context, flow.state).scores[11].kill, 6);
  event(flow, { type: 'cancel' });
  assert.equal(view(flow).screen, 'cancelled');
});

test('only multiple registered factions add a required faction step, including proxy result keys', () => {
  const context = game({ playerIds: [-71, 22], players: [
    { id: -71, resultKey: -71, userId: null, isProxy: true, name: 'Guest', factions: ['Kasrkin', 'Legionaries'] },
    { id: 22, userId: 22, name: 'Bravo', factions: ['Legionaries'] }
  ] });
  const flow = start(context);
  for (const value of [6, 4, 5, 'crit']) choose(flow, value);
  assert.equal(view(flow).step.field, 'faction');
  assert.deepEqual(view(flow).choices.map(choice => choice.value), ['Kasrkin', 'Legionaries']);
  choose(flow, 'Kasrkin');
  for (const value of [2, 3, 1, 'kill']) choose(flow, value);
  assert.equal(engine.resultBody(context, flow.state).scores[-71].faction, 'Kasrkin');
});

test('ordinary ties explicitly allow a draw while elimination ties require APL and roll-off only after equal criteria', () => {
  const ordinary = start();
  scores(ordinary, [0, 0, 0, 'crit'], [0, 0, 0, 'crit']);
  assert.equal(view(ordinary).step.field, 'tie');
  choose(ordinary, false);
  assert.equal(view(ordinary).screen, 'summary');
  assert.equal(scoring.calculateSubmittedResult(engine.resultBody(ordinary.context, ordinary.state), 11, 22).winnerId, null);

  const knockout = start(game({ sourceType: 'tournament_match', tournament: { format: 'single_elimination', status: 'in_progress' } }));
  scores(knockout, [0, 0, 0, 'crit'], [0, 0, 0, 'crit']);
  assert.equal(view(knockout).step.field, 'aplTens');
  for (const value of [9, 9, 9, 9]) choose(knockout, value);
  assert.equal(view(knockout).step.field, 'rollOffWinnerId');
  choose(knockout, 22);
  const body = engine.resultBody(knockout.context, knockout.state);
  assert.equal(body.tiebreakers.apl[11], 99);
  assert.equal(body.tiebreakers.apl[22], 99);
  assert.equal(scoring.calculateSubmittedResult(body, 11, 22).tiebreakers.decidedBy, 'rollOff');
});

test('unequal earlier tie criteria avoid requesting irrelevant APL or roll-off', () => {
  const flow = start(game({ sourceType: 'tournament_match', tournament: { format: 'single_elimination', status: 'in_progress' } }));
  scores(flow, [4, 0, 0, 'crit'], [2, 3, 0, 'crit']);
  assert.equal(view(flow).screen, 'summary');
  assert.equal(scoring.calculateSubmittedResult(engine.resultBody(flow.context, flow.state), 11, 22).tiebreakers.decidedBy, 'primary');
});

test('review modes show the existing pending score and never offer score choices', () => {
  for (const mode of ['confirm', 'reject']) {
    const context = game({ status: 'pending_confirmation', pendingResult: { submittedBy: 22,
      result: { scores: { 11: { crit: 6, kill: 4, tac: 5, primary: 'crit' }, 22: { crit: 1, kill: 2, tac: 3, primary: 'kill' } } } } });
    const flow = start(context, mode);
    assert.equal(view(flow).screen, 'review');
    assert.deepEqual(view(flow).summary.result, context.pendingResult.result);
    assert.deepEqual(view(flow).choices, []);
    assert.throws(() => engine.transition(context, flow.state, { type: 'choose', index: 0 }));
  }
});

// Pure button workflow. Values come from the website's dictionaries and scoring.
const { ValidationError } = require('../http/io');
const { calculateApprovedOps, calculateSubmittedResult, calculateTieBreakers } = require('../domain/scoring');
const { KILL_TEAMS, KILLZONES, CRIT_OPS } = require('../domain/kill-teams');
const { tacOpOptions } = require('../../public/game-data');
const { validLayout } = require('../../public/map-catalog');
const digits = Array.from({ length: 10 }, (_, index) => index);
const scoreFields = ['crit', 'tac', 'kill', 'primary'];
// Telegram keyboards already sent to players address edit fields by position.
const scoreEditOrder = ['crit', 'kill', 'tac', 'primary'];
const copy = value => structuredClone(value);
const playerId = player => player.resultKey ?? player.id;
const factions = player => player.factions?.length ? player.factions : player.faction ? [player.faction] : [];
const lockedMission = game => Boolean(game.teamTournamentGame?.missionLocked);
const assignedMission = game => game.teamTournamentGame?.mission || game.tournamentMatch?.mission || null;

function descriptor(field, id = null, extra = false) {
  return { field, playerId: id, labelKey: `gameDraft.field.${field}`, extra };
}
function baseFields(game, order = scoreFields) {
  return game.players.flatMap(player => [...order.map(field => descriptor(field, playerId(player))),
    ...(factions(player).length > 1 ? [descriptor('faction', playerId(player))] : [])]);
}
function extraFields(game) {
  return [...game.players.flatMap(player => [descriptor('tacOp', playerId(player), true),
    ...(!factions(player).length ? [descriptor('faction', playerId(player), true)] : [])]),
  ...(!lockedMission(game) ? ['killzone', 'critOp', 'layout'].map(field => descriptor(field, null, true)) : [])];
}
const key = field => `${field.playerId ?? ''}:${field.field}`;
function valueFor(state, field) {
  if (['aplTens', 'aplOnes'].includes(field.field)) return state.answers.aplDigits?.[field.playerId]?.[field.field === 'aplTens' ? 0 : 1];
  if (field.playerId !== null) return state.answers.scores[field.playerId]?.[field.field];
  if (['killzone', 'critOp', 'layout'].includes(field.field)) return state.answers.killzone?.[field.field];
  return state.answers[field.field];
}
function completeBase(game, state) {
  return baseFields(game).every(field => state.answered[key(field)]);
}
function tieFields(game, state) {
  if (!completeBase(game, state) || game.sourceType === 'team_match_game') return [];
  const [a, b] = game.players.map(playerId);
  const sa = calculateApprovedOps(state.answers.scores[a]);
  const sb = calculateApprovedOps(state.answers.scores[b]);
  if (sa.total !== sb.total) return [];
  const forced = game.tournament?.format === 'single_elimination';
  const fields = forced ? [] : [descriptor('tie')];
  if (!forced && !state.answers.tie) return fields;
  // Ask for APL/roll-off only if the earlier canonical criteria are still tied.
  const zero = { apl: { [a]: 0, [b]: 0 }, rollOffWinnerId: a };
  const probe = calculateTieBreakers(zero, a, b, sa, sb);
  if (['primary', 'critTac'].includes(probe.decidedBy)) return fields;
  const aplFields = [a, b].flatMap(id => [descriptor('aplTens', id), descriptor('aplOnes', id)]);
  fields.push(...aplFields);
  if (!aplFields.every(field => state.answered[key(field)])) return fields;
  const apl = Object.fromEntries([a, b].map(id => [id, state.answers.aplDigits[id][0] * 10 + state.answers.aplDigits[id][1]]));
  if (calculateTieBreakers({ apl, rollOffWinnerId: a }, a, b, sa, sb).decidedBy === 'rollOff') fields.push(descriptor('rollOffWinnerId'));
  return fields;
}
function fields(game, state) { return [...baseFields(game, scoreEditOrder), ...tieFields(game, state), ...extraFields(game)]; }
function choicesFor(game, state, field) {
  const player = game.players.find(item => playerId(item) === field.playerId);
  let values;
  if (['crit', 'kill', 'tac'].includes(field.field)) values = [0, 1, 2, 3, 4, 5, 6];
  else if (field.field === 'primary') values = ['crit', 'kill', 'tac'];
  else if (field.field === 'faction') values = factions(player).length ? factions(player) : ['', ...KILL_TEAMS];
  else if (field.field === 'tacOp') values = ['', ...tacOpOptions];
  else if (field.field === 'killzone') values = ['', ...KILLZONES];
  else if (field.field === 'critOp') values = ['', ...CRIT_OPS];
  else if (field.field === 'layout') values = [null, ...Array.from({ length: 13 }, (_, index) => index + 1).filter(value => validLayout(state.answers.killzone?.killzone, value))];
  else if (field.field === 'tie') values = [false, true];
  else if (['aplTens', 'aplOnes'].includes(field.field)) values = digits;
  else if (field.field === 'rollOffWinnerId') values = game.players.map(playerId);
  else throw new ValidationError('Invalid draft field');
  return values.map(value => ({ value, labelKey: value === '' || value === null ? 'gameDraft.unset' :
    field.field === 'tie' ? `gameDraft.tie.${value ? 'resolve' : 'draw'}` :
    field.field === 'primary' ? `gameDraft.primary.${value}` : null }));
}
function settle(game, state) {
  const next = [...baseFields(game), ...tieFields(game, state)].find(field => !state.answered[key(field)]);
  state.screen = next ? 'choice' : 'summary';
  state.field = next || null;
}
function createState(game, mode = 'submit') {
  if (!['submit', 'confirm', 'reject'].includes(mode) || game.players?.length !== 2) throw new ValidationError('Invalid draft context');
  const pending = game.pendingResult?.result;
  const answers = { scores: {}, killzone: copy(lockedMission(game) ? assignedMission(game) || {} : pending?.killzone || assignedMission(game) || {}), aplDigits: {} };
  for (const player of game.players) {
    const id = playerId(player);
    const prior = pending?.scores?.[id] || {};
    answers.scores[id] = Object.fromEntries(['crit', 'kill', 'tac', 'primary', 'faction', 'tacOp'].filter(field => prior[field] !== undefined).map(field => [field, prior[field]]));
    if (factions(player).length === 1) answers.scores[id].faction = factions(player)[0];
  }
  const state = { mode, screen: mode === 'submit' ? 'choice' : 'review', field: null, answers, answered: {}, history: [] };
  if (mode === 'submit') settle(game, state);
  return state;
}
function resultBody(game, state) {
  if (state.mode !== 'submit' || !completeBase(game, state) ||
      tieFields(game, state).some(field => !state.answered[key(field)])) throw new ValidationError('Draft answers are incomplete');
  const [a, b] = game.players.map(playerId);
  const enabled = game.sourceType !== 'team_match_game' && (state.answers.tie === true || game.tournament?.format === 'single_elimination');
  const apl = Object.fromEntries([a, b].map(id => [id, (state.answers.aplDigits[id]?.[0] || 0) * 10 + (state.answers.aplDigits[id]?.[1] || 0)]));
  const body = { scores: copy(state.answers.scores), killzone: copy(lockedMission(game) ? assignedMission(game) || {} : state.answers.killzone),
    tiebreakers: { enabled, apl, rollOffWinnerId: state.answers.rollOffWinnerId || null } };
  // Shared validators also check optional map values and all result bounds.
  calculateSubmittedResult(body, a, b);
  return body;
}
function view(game, state) {
  const editableFields = state.mode === 'submit' && !['saved', 'cancelled'].includes(state.screen)
    ? fields(game, state).map(field => ({ ...field, value: valueFor(state, field) ?? null })) : [];
  const prompts = baseFields(game);
  const stepOrder = scoreFields.includes(state.field?.field) ? prompts : editableFields;
  const step = state.screen === 'choice' && state.field ? { ...state.field, value: valueFor(state, state.field) ?? null,
    index: stepOrder.findIndex(field => key(field) === key(state.field)), total: prompts.length } : null;
  let result = state.mode === 'submit' ? null : game.pendingResult?.result || null;
  if (state.mode === 'submit' && completeBase(game, state) && !tieFields(game, state).some(field => !state.answered[key(field)])) {
    const [a, b] = game.players.map(playerId);
    result = calculateSubmittedResult(resultBody(game, state), a, b);
  }
  return { screen: state.screen, step, choices: step ? choicesFor(game, state, step) : [], editableFields,
    summary: { result, confirmationRequired: game.confirmationRequired ?? true } };
}
function transition(game, original, event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new ValidationError('Invalid draft event');
  const state = copy(original);
  if (['saved', 'cancelled'].includes(state.screen)) throw new ValidationError('Draft is closed');
  if (event.type === 'cancel') { state.screen = 'cancelled'; state.field = null; return state; }
  if (event.type === 'back') {
    if (state.screen === 'extras') { state.screen = 'summary'; state.field = null; return state; }
    if (state.screen === 'choice' && state.field?.extra) { state.screen = 'extras'; state.field = null; return state; }
    const navigation = state.history.pop();
    if (navigation) Object.assign(state, navigation);
    return state;
  }
  const remember = () => {
    state.history.push({ screen: state.screen, field: copy(state.field) });
    if (state.history.length > 64) state.history.shift();
  };
  if (event.type === 'extras' && state.mode === 'submit' && state.screen === 'summary') {
    remember(); state.screen = 'extras'; state.field = null; return state;
  }
  if (event.type === 'edit' && state.mode === 'submit' && ['summary', 'extras'].includes(state.screen)) {
    const editable = fields(game, state);
    if (!Number.isSafeInteger(event.index) || !editable[event.index]) throw new ValidationError('Invalid draft field index');
    remember(); state.screen = 'choice'; state.field = editable[event.index]; return state;
  }
  if (event.type !== 'choose' || state.mode !== 'submit' || state.screen !== 'choice' || !state.field) throw new ValidationError('Invalid draft action');
  const choices = choicesFor(game, state, state.field);
  if (!Number.isSafeInteger(event.index) || !choices[event.index]) throw new ValidationError('Invalid draft choice index');
  remember();
  const { field, playerId: id, extra } = state.field;
  const value = choices[event.index].value;
  if (scoreFields.includes(field) && value !== valueFor(state, state.field)) {
    for (const item of ['tie', 'rollOffWinnerId']) { delete state.answers[item]; delete state.answered[key(descriptor(item))]; }
    state.answers.aplDigits = {};
    for (const player of game.players) for (const part of ['aplTens', 'aplOnes']) delete state.answered[key(descriptor(part, playerId(player)))];
  }
  if (['aplTens', 'aplOnes'].includes(field)) {
    state.answers.aplDigits[id] ||= [];
    state.answers.aplDigits[id][field === 'aplTens' ? 0 : 1] = value;
    delete state.answers.rollOffWinnerId; delete state.answered[key(descriptor('rollOffWinnerId'))];
  } else if (id !== null) state.answers.scores[id][field] = value;
  else if (['killzone', 'critOp', 'layout'].includes(field)) {
    state.answers.killzone[field] = value;
    if (field === 'killzone' && state.answers.killzone.layout && !validLayout(value, state.answers.killzone.layout)) state.answers.killzone.layout = null;
  } else state.answers[field] = value;
  state.answered[key(state.field)] = true;
  if (extra) { state.screen = 'extras'; state.field = null; }
  else settle(game, state);
  return state;
}

module.exports = { createState, transition, view, resultBody, scoreFields };

const { ValidationError, HttpError } = require('../http/io');

function wtcDoublesNextAction(match) {
  if (match.phase !== 'environment_selection' || match.captainPairingEnabled === false) return null;
  const winner = match.attackerRosterId === match.rosterAId ? 'a' : 'b';
  const loser = winner === 'a' ? 'b' : 'a';
  const state = match.environment?.wtcDoubles || {};
  const step = Number(match.environment?.step || 0);
  if (step === 0) return { kind:'right', side:winner };
  if (step === 1) return { kind:state.right, side:winner };
  if (step === 2) return { kind:state.right === 'pairings' ? 'tables' : 'pairings', side:loser };
  if (step === 3) return { kind:'missions', side:loser };
  return null;
}

function applyWtcDoublesSelection(match, body, membersA, membersB) {
  const action = wtcDoublesNextAction(match);
  const step = Number(match.environment?.step || 0);
  if (!action || body.step !== step || body.kind !== action.kind) throw new HttpError(409,'Refresh the current pairing step');
  const state = structuredClone(match.environment?.wtcDoubles || {});
  const idsA = membersA.map(m=>m.id), idsB = membersB.map(m=>m.id);
  const unique = (values, allowed) => values.length === 2 && new Set(values).size === 2 && values.every(value=>allowed.includes(value));
  let pairings = match.pairings || null;
  if (action.kind === 'right') {
    if (!['pairings','tables'].includes(body.right)) throw new ValidationError('Choose player pairings or table assignments');
    state.right = body.right;
    const winner = match.attackerRosterId === match.rosterAId ? 'a' : 'b';
    state.tableSide = body.right === 'tables' ? winner : winner === 'a' ? 'b' : 'a';
  } else if (action.kind === 'pairings') {
    if (!Array.isArray(body.pairings) || body.pairings.some(p=>!p) ||
        !unique(body.pairings.map(p=>Number(p.rosterAMemberId)),idsA) || !unique(body.pairings.map(p=>Number(p.rosterBMemberId)),idsB))
      throw new ValidationError('Use each current roster player exactly once');
    pairings = body.pairings.map((p,i)=>({slot:i+1,rosterAMemberId:Number(p.rosterAMemberId),rosterBMemberId:Number(p.rosterBMemberId),shieldOwner:null}));
  } else if (action.kind === 'tables') {
    if (!Array.isArray(body.tables) || body.tables.some(t=>!t) ||
        !unique(body.tables.map(t=>Number(t.memberId)),state.tableSide === 'a' ? idsA : idsB) ||
        !unique(body.tables.map(t=>Number(t.tableId)),match.tableIds)) throw new ValidationError('Assign each table to one of your own players');
    state.tables = body.tables.map(t=>({memberId:Number(t.memberId),tableId:Number(t.tableId)}));
  } else if (action.kind === 'missions') {
    const available = match.missions.filter(m=>!match.missionBans.some(b=>b.mission === m.critOp)).map(m=>m.critOp);
    if (!Array.isArray(body.missions) || body.missions.some(m=>!m) || !unique(body.missions.map(m=>m.slot),[1,2]) ||
        !unique(body.missions.map(m=>m.mission),available) || pairings?.length !== 2 || state.tables?.length !== 2)
      throw new ValidationError('Assign both remaining missions exactly once');
    const assignments = pairings.map(p=>({slot:p.slot,
      tableId:state.tables.find(t=>t.memberId === (state.tableSide === 'a' ? p.rosterAMemberId : p.rosterBMemberId))?.tableId,
      mission:{critOp:body.missions.find(m=>m.slot === p.slot).mission}}));
    if (assignments.some(a=>!a.tableId)) throw new HttpError(409,'Table assignments no longer match the current players');
    return { pairings, environment:{step:4,wtcDoubles:state,assignments} };
  }
  return { pairings, environment:{step:step+1,wtcDoubles:state,assignments:[]} };
}

module.exports = { wtcDoublesNextAction, applyWtcDoublesSelection };

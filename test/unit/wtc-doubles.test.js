const test = require('node:test');
const assert = require('node:assert/strict');
const { wtcDoublesNextAction, applyWtcDoublesSelection } = require('../../src/domain/wtc-doubles');
const { teamSizeFor, teamMatchProgress, teamPointsForMatch, teamStandings, normalizeRoundMissions } = require('../../src/domain/team-tournaments');
const { normalizeNewTournament, normalizeTournamentPatch } = require('../../src/domain/tournaments/input');
const { CRIT_OPS } = require('../../src/domain/kill-teams');
const {validateResultFactions}=require('../../src/domain/tournaments/factions');
const membersA = [{id:11},{id:12}], membersB = [{id:21},{id:22}];
const base = { pairingType:'wtc_doubles', pairingVersion:2, captainPairingEnabled:true, phase:'environment_selection',
  rosterAId:1, rosterBId:2, attackerRosterId:1, tableIds:[101,102], missions:CRIT_OPS.slice(0,4).map(critOp=>({critOp})),
  missionBans:CRIT_OPS.slice(2,4).map(mission=>({mission})), environment:null };
function choose(match, body) { return {...match, ...applyWtcDoublesSelection(match, {...body, step:Number(match.environment?.step || 0)},membersA,membersB)}; }
test('WTC Doubles supports each initiative side and both choices, preserving table-first player ownership',()=>{
  for (const winner of [1,2]) for (const right of ['pairings','tables']) {
    let m={...base,attackerRosterId:winner};
    const initiative=winner===1?'a':'b', other=initiative==='a'?'b':'a';
    assert.deepEqual(wtcDoublesNextAction(m),{kind:'right',side:initiative});
    m=choose(m,{kind:'right',right});
    const tableSide=right==='tables'?initiative:other;
    const actions={pairings:{kind:'pairings',pairings:[{rosterAMemberId:11,rosterBMemberId:22},{rosterAMemberId:12,rosterBMemberId:21}]},
      tables:{kind:'tables',tables:(tableSide==='a'?membersA:membersB).map((member,i)=>({memberId:member.id,tableId:101+i}))}};
    assert.equal(wtcDoublesNextAction(m).side,initiative);
    m=choose(m,actions[right]);
    assert.equal(wtcDoublesNextAction(m).side,other);
    m=choose(m,actions[right==='tables'?'pairings':'tables']);
    assert.deepEqual(wtcDoublesNextAction(m),{kind:'missions',side:other});
    assert.throws(()=>choose(m,{kind:'missions',missions:[{slot:1,mission:CRIT_OPS[2]},{slot:2,mission:CRIT_OPS[1]}]}));
    m=choose(m,{kind:'missions',missions:[{slot:1,mission:CRIT_OPS[0]},{slot:2,mission:CRIT_OPS[1]}]});
    assert.equal(m.environment.assignments.length,2);
    assert.equal(m.environment.assignments[0].tableId,tableSide==='a'?101:102);
    assert.equal(m.environment.assignments[1].tableId,tableSide==='a'?102:101);
    assert.equal(wtcDoublesNextAction(m),null);
  }
});
test('WTC Doubles rejects wrong steps, duplicate players/tables and invalid right',()=>{
  assert.throws(()=>choose(base,{kind:'right',right:'shield'}));
  assert.throws(()=>applyWtcDoublesSelection(base,{kind:'right',right:'tables',step:1},membersA,membersB));
  const m=choose(base,{kind:'right',right:'tables'});
  assert.throws(()=>choose(m,{kind:'tables',tables:[{memberId:11,tableId:101},{memberId:12,tableId:101}]}));
  assert.throws(()=>choose(m,{kind:'tables',tables:[{memberId:21,tableId:101},{memberId:22,tableId:102}]}));
});
const game=(slot,a,b)=>({slot,game:{status:'completed',playerIds:[10,20],result:{scores:{10:{total:a,tac:3},20:{total:b,tac:2}}}}});
test('WTC Doubles clamps personal GP and uses inclusive 18–22 team draw boundaries',()=>{
  for (const [gp,expected] of [[17,{a:0,b:2}],[18,{a:1,b:1}],[22,{a:1,b:1}],[23,{a:2,b:0}]])
    assert.deepEqual(teamPointsForMatch({...base},{gpA:gp}),expected);
  const m={...base,games:[game(1,20,4),game(2,1,18)]};
  assert.equal(teamSizeFor(m),2);
  assert.equal(teamMatchProgress(m).gpA,20);
  assert.deepEqual(teamPointsForMatch(m),{a:1,b:1});
});
test('WTC Doubles validates both venues, one faction, four missions and fixed standings',()=>{
  const t=normalizeNewTournament({participantMode:'team',format:'swiss',pairingType:'wtc_doubles'},1,'wtc');
  assert.equal(t.teamSize,2); assert.equal(t.swissRoundCount,4); assert.equal(t.captainPairingEnabled,true);
  assert.equal(normalizeTournamentPatch({venueMode:'irl'},t).captainPairingEnabled,false);
  assert.throws(()=>normalizeTournamentPatch({factionCount:2},t));
  assert.throws(()=>normalizeTournamentPatch({teamSize:3},t));
  assert.throws(()=>normalizeTournamentPatch({teamTiebreakerOrder:['total_vp']},t));
  assert.throws(()=>normalizeRoundMissions(CRIT_OPS.slice(0,3),'wtc_doubles'));
  assert.throws(()=>validateResultFactions(t,{scores:{10:{faction:'Kasrkin'}}},[{userId:10,factionSnapshot:'Kommandos'}]));
  assert.doesNotThrow(()=>validateResultFactions(t,{scores:{10:{faction:'Kommandos'}}},[{userId:10,factionSnapshot:'Kommandos'}]));
});
test('WTC Doubles excludes incomplete matches and averages current opponent TP including withdrawn rosters',()=>{
  const rosters=[{id:1},{id:2},{id:3},{id:4}];
  const match=(a,b,points)=>({...base,phase:'completed',rosterAId:a,rosterBId:b,teamTournamentPointsA:points,teamTournamentPointsB:2-points,games:[]});
  const matches=[match(1,2,2),match(1,3,1),match(2,4,2),{...match(1,4,2),phase:'in_progress',games:[game(1,20,0)]}];
  const rows=teamStandings(rosters.slice(0,2),matches,null,{pairingType:'wtc_doubles',historicalRosters:rosters});
  const row=rows.find(r=>r.roster.id===1);
  assert.equal(row.teamTournamentPoints,3); assert.equal(row.strengthOfSchedule,1.5);
  assert.equal(row.played,2); assert.equal(row.individualWins,0);
});
test('WTC Doubles compares personal wins before mean SOS, then VP and raw Tac Op',()=>{
  const rows=[{id:1},{id:2},{id:3},{id:4}];
  const match=(a,b,scores)=>({...base,phase:'completed',rosterAId:a,rosterBId:b,teamTournamentPointsA:1,teamTournamentPointsB:1,
    games:[game(1,...scores.slice(0,2)),game(2,...scores.slice(2,4))]});
  // Both teams have 1 TP; team 2's personal win beats team 1's higher VP total.
  let ms=[match(1,3,[18,18,18,18]),match(2,4,[10,8,6,8])];
  const rank=()=>teamStandings(rows,ms,null,{pairingType:'wtc_doubles'}).filter(r=>r.roster.id<=2).map(r=>r.roster.id);
  assert.deepEqual(rank(),[2,1]);
  // Equal wins/SOS: total VP is compared next.
  ms=[match(1,3,[9,9,9,9]),match(2,4,[11,11,11,11])];assert.deepEqual(rank(),[2,1]);
  // Equal wins/SOS/VP: raw Tac Op breaks the tie.
  ms=[match(1,3,[9,9,9,9]),match(2,4,[9,9,9,9])];
  ms[1].games[0].game.result.scores[10].tac=6;assert.deepEqual(rank(),[2,1]);
});

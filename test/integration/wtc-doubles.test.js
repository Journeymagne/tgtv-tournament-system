const test=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg');
require('../helpers/db');
const {migrate}=require('../../src/db/migrate');
const users=require('../../src/db/repositories/users'),teams=require('../../src/db/repositories/player-teams');
const rosters=require('../../src/db/repositories/team-rosters'),tournaments=require('../../src/db/repositories/tournaments');
const rounds=require('../../src/db/repositories/tournament-rounds'),matches=require('../../src/db/repositories/team-matches');
const games=require('../../src/db/repositories/games'),api=require('../../src/api/team-tournaments');
const {normalizeNewTournament}=require('../../src/domain/tournaments/input');
const {CRIT_OPS}=require('../../src/domain/kill-teams');
let pool,client,owner;
test.before(async()=>{pool=new Pool(require('../helpers/schema').poolOptions);await require('../helpers/schema').resetSchemas(pool);await migrate(pool)});
test.after(async()=>pool.end());
test.beforeEach(async()=>{client=await pool.connect();await client.query('BEGIN');await client.query('TRUNCATE accounts.users RESTART IDENTITY CASCADE');owner=await users.insert(client,{name:'WTC Owner',passwordHash:'test',rating:1000,isAdmin:true})});
test.afterEach(async()=>{await client.query('ROLLBACK');client.release()});
async function fixture(venueMode='tts') {
  let cup=await tournaments.insert(client,normalizeNewTournament({name:'WTC Doubles',participantMode:'team',format:'swiss',pairingType:'wtc_doubles',venueMode,ratingPolicy:'unranked'},owner.id,'wtc-doubles'));
  for(let i=0;i<4;i++) {
    const members=[];
    for(let slot=1;slot<=2;slot++)members.push(await users.insert(client,{name:`WTC Player ${i}-${slot}`,passwordHash:'test',rating:1000}));
    const team=await teams.insert(client,{slug:`wtc-team-${i}`,name:`WTC Team ${i}`,nameKey:`wtc team ${i}`,leaderUserId:members[0].id});
    await teams.addMembership(client,team.id,members[0],'leader');
    await teams.addMembership(client,team.id,members[1]);
    const roster=await rosters.insert(client,{tournamentId:cup.id,teamId:team.id,name:team.name,nameKey:team.nameKey,captainUserId:members[0].id,registeredByUserId:owner.id,seed:i+1,teamNameSnapshot:team.name},members.map((m,i)=>({userId:m.id,slot:i+1,displayNameSnapshot:m.name,factionSnapshot:'Kommandos'})));
    await rosters.update(client,roster.id,{paid:true});
  }
  cup=await tournaments.update(client,cup.id,{status:'registration_closed'});
  await api.generateRound(client,cup,owner,{tables:Array.from({length:venueMode==='tts'?2:4},(_,i)=>({tableNumber:i+1,killzone:'Volkus',deployment:1})),missions:CRIT_OPS.slice(0,4)});
  await api.startTournament(client,cup,owner,{});
  const saved=await tournaments.findById(client,cup.id);
  return {cup:saved,match:(await matches.listByTournament(client,cup.id))[0]};
}
async function act(f,handler,body) {
  const current=await matches.findById(client,f.match.id);
  return api[handler]({client,user:owner,params:{id:f.cup.id,matchId:f.match.id},body:{revision:current.pairingRevision,...body}});
}
async function current(f){return matches.findById(client,f.match.id)}
test('WTC table-first selections prevent replacement of a selected player until pairing is reset',async()=>{
  const f=await fixture();
  await act(f,'roll',{side:'a',rollRound:1,result:6});await act(f,'roll',{side:'b',rollRound:1,result:1});
  await act(f,'banMission',{side:'b',mission:CRIT_OPS[2]});await act(f,'banMission',{side:'a',mission:CRIT_OPS[3]});
  await act(f,'selectEnvironment',{side:'a',step:0,kind:'right',right:'tables'});
  const rs=await rosters.listByTournament(client,f.cup.id),a=rs.find(r=>r.id===f.match.rosterAId);
  await act(f,'selectEnvironment',{side:'a',step:1,kind:'tables',tables:a.members.map((member,i)=>({memberId:member.id,tableId:f.match.tableIds[i]}))});
  const before=await rosters.findById(client,a.id);
  await assert.rejects(api.updateRoster({client,user:owner,params:{id:f.cup.id,rosterId:a.id},body:{members:[{userId:a.members[0].userId,faction:'Kommandos'},{proxy:true,faction:'Kasrkin'}]}}),/Reset this pairing before replacing a selected player/);
  assert.deepEqual(await rosters.findById(client,a.id),before);
});
test('WTC reset rejects old and repeated revisions before removing newer pairing state',async()=>{
  const f=await fixture(),params={id:f.cup.id,matchId:f.match.id};
  await act(f,'roll',{side:'a',rollRound:1,result:6});
  const before=await current(f);
  await assert.rejects(api.resetMatchAdmin({client,user:owner,params,body:{phase:'awaiting_roll',revision:0}}),{status:409});
  assert.deepEqual(await current(f),before);
  await api.resetMatchAdmin({client,user:owner,params,body:{phase:'awaiting_roll',revision:before.pairingRevision}});
  const reset=await current(f);
  await assert.rejects(api.resetMatchAdmin({client,user:owner,params,body:{phase:'awaiting_roll',revision:before.pairingRevision}}),{status:409});
  assert.deepEqual(await current(f),reset);
});
test('WTC Doubles persists two shared TTS tables, four missions and immutable size/type snapshots',async()=>{
  const f=await fixture();
  assert.equal(f.match.teamSize,2);assert.equal(f.match.pairingType,'wtc_doubles');assert.equal(f.match.missions.length,4);
  const all=await matches.listByTournament(client,f.cup.id);
  assert.deepEqual(all[0].tableIds,all[1].tableIds);
  assert.equal(all[0].tableIds.length,2);
  await client.query('SAVEPOINT invalid_type');
  await assert.rejects(client.query('UPDATE tournaments SET team_size=3 WHERE id=$1',[f.cup.id]),{code:'23514'});
  await client.query('ROLLBACK TO SAVEPOINT invalid_type');
  await client.query('SAVEPOINT invalid_venue_mode');
  await assert.rejects(client.query('UPDATE tournaments SET captain_pairing_enabled=FALSE WHERE id=$1',[f.cup.id]),{code:'23514'});
  await client.query('ROLLBACK TO SAVEPOINT invalid_venue_mode');
});
for(const winner of ['a','b'])for(const right of ['pairings','tables'])test(`TTS ${winner} initiative, ${right} first: permissions, stale writes, GP, corrections and undo`,async()=>{
  const f=await fixture(),loser=winner==='a'?'b':'a';
  await act(f,'roll',{side:'a',rollRound:1,result:winner==='a'?6:1});
  await act(f,'roll',{side:'b',rollRound:1,result:winner==='b'?6:1});
  await assert.rejects(act(f,'banMission',{side:winner,mission:CRIT_OPS[2]}),{status:403});
  await act(f,'banMission',{side:loser,mission:CRIT_OPS[2]});
  await act(f,'banMission',{side:winner,mission:CRIT_OPS[3]});
  await assert.rejects(act(f,'selectEnvironment',{side:loser,step:0,kind:'right',right}),{status:403});
  const stale=(await current(f)).pairingRevision;
  await act(f,'selectEnvironment',{side:winner,step:0,kind:'right',right});
  await assert.rejects(act(f,'selectEnvironment',{side:winner,revision:stale,step:0,kind:'right',right}),{status:409});
  const all=await rosters.listByTournament(client,f.cup.id),m=await current(f);
  const a=all.find(r=>r.id===m.rosterAId),b=all.find(r=>r.id===m.rosterBId);
  const tableSide=right==='tables'?winner:loser,own=tableSide==='a'?a:b;
  const bodies={pairings:{pairings:[{rosterAMemberId:a.members[0].id,rosterBMemberId:b.members[1].id},{rosterAMemberId:a.members[1].id,rosterBMemberId:b.members[0].id}]},tables:{tables:own.members.map((p,i)=>({memberId:p.id,tableId:m.tableIds[i]}))}};
  await act(f,'selectEnvironment',{side:winner,step:1,kind:right,...bodies[right]});
  const other=right==='tables'?'pairings':'tables';
  await act(f,'selectEnvironment',{side:loser,step:2,kind:other,...bodies[other]});
  await assert.rejects(act(f,'selectEnvironment',{side:loser,step:3,kind:'missions',missions:[{slot:1,mission:CRIT_OPS[2]},{slot:2,mission:CRIT_OPS[1]}]}),{status:400});
  await act(f,'selectEnvironment',{side:loser,step:3,kind:'missions',missions:[{slot:1,mission:CRIT_OPS[0]},{slot:2,mission:CRIT_OPS[1]}]});
  let saved=await current(f);assert.equal(saved.games.length,2);assert.equal(saved.phase,'in_progress');
  assert.equal(saved.games[0].tableId,m.tableIds[tableSide==='a'?0:1]);
  for(let i=0;i<2;i++) {
    const link=saved.games[i],ids=link.game.resultPlayerIds||link.game.playerIds;
    await games.saveFinalResult(client,link.game.id,{result:{winnerId:ids[i],scores:{[ids[0]]:{total:i===0?20:1,tac:2},[ids[1]]:{total:i===0?4:18,tac:1}}},elo:null});
    await api.recomputeTeamMatch(client,saved.id);
    const view=await api.tournamentData(client,f.cup,owner);
    assert.equal(view.standings.find(row=>row.rosterId===a.id).teamTournamentPoints,i===0?0:1);
  }
  saved=await current(f);assert.equal(saved.teamGamePointsA,20);assert.equal(saved.teamTournamentPointsA,1);
  const link=saved.games[1],ids=link.game.resultPlayerIds||link.game.playerIds;
  await games.saveFinalResult(client,link.game.id,{result:{winnerId:ids[0],scores:{[ids[0]]:{total:20,tac:2},[ids[1]]:{total:0,tac:1}}},elo:null});
  await api.recomputeTeamMatch(client,saved.id);assert.equal((await current(f)).teamTournamentPointsA,2);
  await assert.rejects(act(f,'undoPairing',{}),{status:409});
  await act(f,'undoPairing',{confirmResultsReset:true});
  saved=await current(f);assert.equal(saved.phase,'environment_selection');assert.equal(saved.environment.step,3);assert.equal(saved.games.length,0);
  const later=await rounds.insert(client,{tournamentId:f.cup.id,roundNumber:2,status:'active'});
  await assert.rejects(act(f,'resetMatchAdmin',{phase:'awaiting_roll',confirmResultsReset:true}),{status:409});
  assert.equal((await current(f)).environment.step,3);assert.ok(later.id);
});
test('IRL WTC Doubles uses separate two-table lines and permits either captain to save final manual assignments',async()=>{
  const f=await fixture('irl'),all=await matches.listByTournament(client,f.cup.id);
  assert.equal(f.match.captainPairingEnabled,false);assert.equal(f.match.phase,'environment_selection');
  assert.equal(new Set(all.flatMap(m=>m.tableIds)).size,4);
  const rs=await rosters.listByTournament(client,f.cup.id),a=rs.find(r=>r.id===f.match.rosterAId),b=rs.find(r=>r.id===f.match.rosterBId);
  const body={revision:f.match.pairingRevision,pairings:a.members.map((p,i)=>({rosterAMemberId:p.id,rosterBMemberId:b.members[i].id,tableId:f.match.tableIds[i],mission:CRIT_OPS[i]}))};
  await api.manualPairings({client,user:{id:b.captainUserId},params:{id:f.cup.id,matchId:f.match.id},body});
  assert.equal((await current(f)).games.length,2);
  await assert.rejects(api.manualPairings({client,user:{id:a.captainUserId},params:{id:f.cup.id,matchId:f.match.id},body}),{status:409});
});

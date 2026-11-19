const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool } = require('../../src/db/pool');
const { resetSchemas } = require('../helpers/schema');
const { migrate } = require('../../src/db/migrate');
const { SCHEMAS } = require('../../src/db/schemas');
const users = require('../../src/db/repositories/users');
const tournaments = require('../../src/db/repositories/tournaments');
const participants = require('../../src/db/repositories/tournament-participants');
const repo = require('../../src/db/repositories/leagues');
const api = require('../../src/api/leagues');
let pool,organizer,neighbor,viewer,admin;

async function tx(action) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE kt_tournaments');
    const result=await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
const call=(method,{user=organizer,params={},body={},q=''}={})=>tx(async client=>(await api[method]({client,user,params,body,query:new URLSearchParams(q)})).body);
const person=(name,fields={})=>users.insert(pool,{name,passwordHash:'s:h',rating:1000,...fields});
async function cup(slug,status='completed') {
  const t=await tournaments.insert(pool,{name:slug,slug,ownerUserId:neighbor.id,format:'swiss',swissRoundCount:3});
  await tournaments.update(pool,t.id,{status});
  return t;
}
async function seat(t,name,userId=null) {
  return participants.insert(pool,{tournamentId:t.id,displayName:name,displayNameKey:name.toLowerCase(),
    userId,status:'finished',source:'admin_manual'});
}
const publish=(t,rows)=>tournaments.update(pool,t.id,{status:'completed',finalResults:rows});
const make=async (name,tournamentIds=[],rules={})=>(await call('save',{body:{name,formats:['solo'],tournamentIds,rules}})).league;
const ranking=(league)=>call('standings',{user:null,params:{slug:league.slug},q:'track=solo'});
const pending=(league,q='')=>call('bindings',{params:{leagueId:league.id},q});
const bind=(league,sourceKey,revision,fields)=>call('bind',{params:{leagueId:league.id,sourceKey},body:{revision,...fields}});

test.before(async()=>{
  pool=getPool();
  await resetSchemas(pool);
  await migrate(pool);
  for (const name of SCHEMAS) process.env[name.toUpperCase()+'_DB_PASSWORD']=randomBytes(24).toString('hex');
  await require('../../scripts/provision-service-roles').provision();
});
test.after(closePool);
test.beforeEach(async()=>{
  await pool.query('TRUNCATE users,tournaments,leagues RESTART IDENTITY CASCADE');
  organizer=await person('League Owner');
  neighbor=await person('Other Organizer');
  viewer=await person('Viewer');
  admin=await person('Site Admin',{isAdmin:true});
  await pool.query('UPDATE accounts.users SET can_create_tournaments=TRUE WHERE id=ANY($1)',[[organizer.id,neighbor.id]]);
});

test('config is atomic, publication visibility and league ownership apply to all operations',async()=>{
  const event=await cup('source','registration_open');
  const hidden=await cup('hidden','draft');
  await pool.query('INSERT INTO tournament_judges(tournament_id,user_id,granted_by) VALUES($1,$2,$3)',[event.id,viewer.id,neighbor.id]);
  await assert.rejects(call('save',{user:viewer,body:{name:'Forbidden',formats:['solo']}}),{status:403});
  await assert.rejects(call('save',{body:{name:'Empty formats',formats:[]}}),{status:400});
  await assert.rejects(make('Draft link',[hidden.id]),{status:400});
  const bad=await call('preview',{body:{name:'Preview',formats:['team'],rules:{org:{criteria:['head_to_head']}}}});
  assert.equal(bad.valid,false);
  assert.ok(bad.issues.some(i=>i.field==='head_to_head'));
  assert.deepEqual((await call('list',{user:null})).leagues,[]);
  const {league}=await call('save',{body:{name:'Autumn',formats:['solo','doubles','team']}});
  assert.equal((await call('detail',{user:null,params:{slug:league.slug}})).league.viewer.canManage,false);
  for (const user of [neighbor,viewer]) {
    await assert.rejects(call('save',{user,params:{leagueId:league.id},body:{revision:1,name:'Overwrite'}}),{status:403});
    await assert.rejects(call('bindings',{user,params:{leagueId:league.id}}),{status:403});
  }
  const patch={params:{leagueId:league.id},body:{revision:1,tournamentIds:[event.id,event.id]}};
  const races=await Promise.allSettled([call('save',patch),call('save',patch)]);
  assert.deepEqual(races.map(r=>r.status).sort(),['fulfilled','rejected']);
  assert.equal(races.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await repo.forTournament(pool,event.id)).length,1);
  const second=await make('Winter',[event.id]);
  assert.equal((await repo.forTournament(pool,event.id)).length,2);
  const exposed=(await call('detail',{user:null,params:{slug:second.slug}})).league;
  assert.equal(exposed.events[0].status,'pending');
  assert.equal('ownerUserId' in exposed,false);
  await tournaments.update(pool,event.id,{status:'draft'});
  assert.deepEqual((await call('detail',{user:null,params:{slug:second.slug}})).league.events,[]);
  assert.deepEqual(await repo.forTournament(pool,event.id),[]);
  assert.equal((await call('list',{user:null})).leagues.every(l=>l.eventCount===0),true);
  await tournaments.update(pool,event.id,{status:'registration_open'});
  const detached=(await call('save',{user:admin,params:{leagueId:league.id},body:{revision:2,tournamentIds:[]}})).league;
  assert.deepEqual(detached.events,[]);
  assert.deepEqual((await repo.forTournament(pool,event.id)).map(l=>l.slug),[second.slug]);
});

test('copied rules retain their effective order and hide an unpublished source; a corrected archive rejoins automatically',async()=>{
  const template=await cup('template'),stage=await cup('archive'),good=await cup('full-results');
  await tournaments.update(pool,template.id,{tiebreakerOrder:['total_vp']});
  const old=await seat(stage,'Unresolved archive'),known=await seat(good,'Known winner',viewer.id);
  await publish(stage,[{participantId:old.id,rank:1,matchPoints:3}]);
  await publish(good,[{participantId:known.id,rank:1,matchPoints:3,totalVp:12}]);
  const draft={name:'Imported',formats:['solo'],tournamentIds:[stage.id,good.id],rules:{solo:{importTournamentId:template.id}}};
  const preview=await call('preview',{body:draft});
  assert.ok(preview.issues.some(i=>i.code==='missing_data' && i.tournamentId===stage.id && i.field==='total_vp'));
  const l=(await call('save',{body:draft})).league;
  assert.equal(l.events.find(e=>e.id===stage.id).status,'needs_data');
  assert.deepEqual((await ranking(l)).rows.map(r=>r.points),[3]);
  await tournaments.update(pool,template.id,{tiebreakerOrder:[],status:'draft'});
  const detail=async()=>(await call('detail',{user:null,params:{slug:l.slug}})).league;
  assert.deepEqual((await detail()).rules.solo.criteria.map(c=>c.metric),['total_vp']);
  assert.equal((await detail()).rules.solo.sourceName,undefined);
  await publish(stage,[{participantId:old.id,rank:1,matchPoints:3,totalVp:20}]);
  await tx(client=>repo.syncTournamentIdentities(client,stage.id));
  assert.equal((await detail()).events.find(e=>e.id===stage.id).status,'counted');
  assert.deepEqual((await ranking(l)).rows.map(r=>r.criteriaValues),[[20],[12]]);
});

test('registry cards survive renames, account deletion, republication, and claiming two guest appearances',async()=>{
  const rook=await person('Rook account',{registerNickname:'Rook'});
  const other=await person('Registry account',{registerNickname:'Rook'});
  const a=await cup('september'),b=await cup('october');
  const p1=await seat(a,'Ворон',rook.id),p2=await seat(b,'Raven_17',rook.id);
  const g1=await seat(a,'Стриж'),g2=await seat(b,'Стриж');
  const result=(p,rank,points,vp)=>({participantId:p.id,rank,matchPoints:points,totalVp:vp});
  await publish(a,[result(p1,1,9,43),result(g1,2,6,32)]);
  await publish(b,[result(g2,1,6,42),result(p2,2,6,49)]);
  const league=await make('Season',[a.id,b.id],{solo:{criteria:['total_vp']}});
  const {rows}=await ranking(league);
  assert.equal(rows.length,3);
  const leader=rows.find(row=>row.name==='Rook');
  assert.deepEqual([leader.points,leader.eventCount,leader.criteriaValues],[15,2,[92]]);
  assert.equal(rows.filter(row=>row.name==='Стриж').length,2);
  const history=(await call('standings',{user:null,params:{slug:league.slug,subjectKey:leader.subjectKey},q:'track=solo'})).row.history;
  assert.deepEqual(history.map(s=>s.displayName).sort(),['Raven_17','Ворон']);
  assert.equal(history.some(s=>'userId' in s),false);
  const guests=(await pending(league)).bindings;
  assert.equal(guests.length,2);
  const suggestions=await pending(league,new URLSearchParams({sourceKey:guests[0].sourceKey,q:'Rook'}));
  assert.deepEqual(suggestions.candidates.map(c=>c.userId).sort((a,b)=>a-b),[rook.id,other.id]);
  assert.equal(suggestions.candidates.some(c=>'email' in c || 'telegramContact' in c),false);
  let r=await bind(league,guests[0].sourceKey,league.revision,{registerNickname:'Swift'});
  r=await bind(league,guests[1].sourceKey,r.revision,{personId:guests[0].personId});
  r=await bind(league,guests[0].sourceKey,r.revision,{userId:other.id,claimCard:true});
  assert.deepEqual((await ranking(league)).rows.map(row=>row.eventCount),[2,2]);
  assert.equal((await pending(league)).bindings.length,0);
  await users.updateProfile(pool,rook.id,{registerNickname:'Rook II'});
  assert.equal((await ranking(league)).rows.find(row=>row.subjectKey===leader.subjectKey).name,'Rook II');
  await pool.query('DELETE FROM accounts.users WHERE id=$1',[rook.id]);
  const orphan=(await ranking(league)).rows.find(row=>row.subjectKey===leader.subjectKey);
  assert.equal(orphan.name,'Rook II');
  assert.equal(orphan.points,15);
  await publish(a,[result(p1,1,10,45),result(g1,2,6,32)]);
  const counts=async()=>(await pool.query('SELECT (SELECT count(*) FROM league_people) AS people,(SELECT count(*) FROM league_person_bindings) AS bindings')).rows[0];
  const stable=await counts();
  for (let i=0;i<2;i++) {
    await tx(client=>repo.syncTournamentIdentities(client,a.id));
    assert.equal((await ranking(league)).rows.find(row=>row.subjectKey===leader.subjectKey).points,16);
    assert.deepEqual(await counts(),stable);
  }
});

test('attaching one official game to two leagues preserves its single personal Challenge credit',async()=>{
  const t=await cup('challenge-stage');
  const a=await seat(t,'Winner',viewer.id),b=await seat(t,'Opponent',neighbor.id);
  const {rows:[round]}=await pool.query("INSERT INTO tournament_rounds(tournament_id,round_number,status) VALUES($1,1,'completed') RETURNING id",[t.id]);
  const {rows:[match]}=await pool.query(`INSERT INTO tournament_matches(tournament_id,round_id,round_number,status,participant_a_id,participant_b_id)
    VALUES($1,$2,1,'not_ready',$3,$4) RETURNING id`,[t.id,round.id,a.id,b.id]);
  const games=require('../../src/db/repositories/games');
  const game=await games.insert(pool,{playerIds:[viewer.id,neighbor.id],sourceType:'tournament_match',sourceId:match.id,
    participants:[a,b].map(p=>({userId:p.userId,resultKey:p.userId,tournamentParticipantId:p.id,displayNameSnapshot:p.displayName}))});
  const faction=require('../../src/domain/kill-teams').ALL_KILL_TEAM_TRACK[0];
  await games.saveFinalResult(pool,game.id,{result:{winnerId:viewer.id,scores:{
    [viewer.id]:{faction,total:10},[neighbor.id]:{faction:'Kommandos',total:4}}},elo:{}});
  await pool.query("UPDATE tournament_matches SET game_id=$2,status='completed',winner_participant_id=$3 WHERE id=$1",[match.id,game.id,a.id]);
  await publish(t,[{participantId:a.id,rank:1,matchPoints:3},{participantId:b.id,rank:2,matchPoints:0}]);
  const challenge=async()=>(await require('../../src/api/users').challengeProgress({client:pool,user:viewer,query:new URLSearchParams()})).users[0].tracks.allKillTeam;
  const before=await challenge();
  assert.equal(before.completedCount,1);
  assert.equal(before.completed[0].gameId,game.id);
  const first=await make('League one',[t.id]),second=await make('League two',[t.id]);
  await tx(client=>repo.syncTournamentIdentities(client,t.id));
  assert.equal((await ranking(first)).rows.length,2);
  assert.equal((await ranking(second)).rows.find(r=>r.points===0).eventCount,1);
  assert.deepEqual(await challenge(),before);
});

test('an unresolved split slot reserves one place, changing the recipient moves exactly that award',async()=>{
  const t=await cup('split');
  const slot=await seat(t,'Current player',viewer.id);
  const old=await person('Original player',{registerNickname:'Original'});
  for (const [i,occupant] of [old,viewer].entries()) {
    const {rows:[round]}=await pool.query(`INSERT INTO tournament_rounds(tournament_id,round_number,status)
      VALUES ($1,$2,'completed') RETURNING id`,[t.id,i+1]);
    await pool.query(`INSERT INTO tournament_matches(tournament_id,round_id,round_number,status,is_bye,participant_a_id,winner_participant_id,participant_snapshots)
      VALUES ($1,$2,$3,'completed',TRUE,$4,$4,$5)`,[t.id,round.id,i+1,slot.id,JSON.stringify({[slot.id]:{userId:occupant.id,displayName:occupant.name}})]);
  }
  await publish(t,[{participantId:slot.id,rank:1,matchPoints:6,wins:2,losses:0,draws:0}]);
  const l=await make('Awards',[t.id],{solo:{primary:'place'}});
  assert.deepEqual((await ranking(l)).rows.map(r=>r.points),[0,0]);
  const [dispute]=(await pending(l)).places;
  assert.equal(dispute.candidates.length,2);
  const params={leagueId:l.id,tournamentId:t.id,participantId:slot.id};
  const choose=(revision,personId)=>call('place',{params,body:{revision,personId}});
  await assert.rejects(choose(1,2147483647),{status:400});
  const r=await choose(1,dispute.candidates[0].personId);
  assert.equal((await pending(l)).places.length,0);
  assert.deepEqual((await ranking(l)).rows.map(row=>[row.points,row.eventCount]),[[10,1],[0,1]]);
  const change=await choose(r.revision,dispute.candidates[1].personId);
  assert.equal((await ranking(l)).rows[0].subjectKey,'person:'+dispute.candidates[1].personId);
  assert.equal((await choose(change.revision,dispute.candidates[1].personId)).revision,change.revision);
  assert.equal((await pool.query("SELECT count(*) AS n FROM league_place_recipients")).rows[0].n,'1');
});

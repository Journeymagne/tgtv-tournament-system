const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { HttpError } = require('../http/io');
const { freshUser } = require('./authorization');
const { canCreateLeague, canManageLeague } = require('../domain/access');
const { validateLeagueRules, resolveTournamentOrder, leagueFormat, supportedMetrics, supportedTrackMetrics } = require('../domain/leagues/rules');
const { buildEventContributions } = require('../domain/leagues/event-contributions');
const { buildLeagueStandings } = require('../domain/leagues/standings');
const { loadLeagueEvents } = require('../db/repositories/league-events');
const repo = require('../db/repositories/leagues');
const people = require('../db/repositories/league-identities');

const TRACKS=['solo','org'];
const FORMATS=['solo','doubles','team'];
const privateHeaders={'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
const response=(body,status=200)=>({body,status,headers:privateHeaders});
const trackOf=t=>leagueFormat(t)==='solo'?'solo':'org';

function id(value) {
  if (!['number','string'].includes(typeof value) || !/^\d+$/.test(String(value)) || Number(value)<1 || Number(value)>2147483647) {
    throw new HttpError(400,'Invalid identifier');
  }
  return Number(value);
}

async function requireLeagueAccess(client,user,leagueId=null,{lock=false}={}) {
  user=await freshUser(client,user);
  if (leagueId==null) {
    if (!canCreateLeague(user)) throw new HttpError(403,'League creation permission required');
    return {user,league:null};
  }
  const league=await repo.find(client,id(leagueId),{lock});
  if (!league) throw new HttpError(404,'League not found');
  if (!canManageLeague(user,league)) throw new HttpError(403,'League management permission required');
  return {user,league};
}

function checkRevision(league,revision) {
  if (league && revision!==league.revision) throw new HttpError(409,'League changed. Reload the current settings before saving.');
}

function publicLeague(league,user) {
  const {ownerUserId,hiddenRuleSources=[],...fields}=league;
  if (fields.rules && hiddenRuleSources.length) {
    fields.rules=Object.fromEntries(Object.entries(fields.rules).map(([track,r])=>{
      if (!hiddenRuleSources.includes(r.sourceTournamentId)) return [track,r];
      const {sourceTournamentId,sourceName,sourceVersion,...visible}=r;
      return [track,visible];
    }));
  }
  return {...fields,viewer:{canManage:canManageLeague(user,league)}};
}

function publicIssue(issue) {
  const {code,field,tournamentId,action}=issue;
  return {code,field,tournamentId,action};
}

function rowSummary(row) {
  const {subjectKey,name,rank,points,eventCount,picks,criteriaValues,identityStatus}=row;
  return {subjectKey,name,rank,points,eventCount,picks,criteriaValues,identityStatus};
}

function calculate(bundles,bindings,rules,formats) {
  const facts=[],events=[];
  for (const b of bundles) {
    const t=b.tournament,format=leagueFormat(t),track=trackOf(t);
    const enabled=formats.includes(format);
    const f=buildEventContributions(b,bindings,rules[track] || {});
    const counted=enabled && f.status==='counted';
    facts.push({...f,track,contributions:counted?f.contributions:[],encounters:counted?f.encounters:[]});
    events.push({...repo.sourceSummary(t),status:enabled?f.status:'excluded',issues:enabled?f.issues.map(publicIssue):[]});
  }
  const standings={};
  for (const track of TRACKS) {
    const section=facts.filter(f=>f.track===track);
    standings[track]=buildLeagueStandings(section.flatMap(f=>f.contributions),section.flatMap(f=>f.encounters),rules[track] || {});
  }
  const byEvent=new Map(events.map(e=>[e.id,e]));
  for (const e of events) { e.points=0; e.appearanceCount=0; }
  for (const row of Object.values(standings).flat()) {
    for (const appearance of row.history) {
      const event=byEvent.get(appearance.tournamentId);
      event.points+=appearance.points;
      event.appearanceCount++;
    }
  }
  return {facts,events,standings};
}

async function load(client,league) {
  const config=await repo.config(client,league.id);
  const bundles=await loadLeagueEvents(client,config.tournamentIds);
  const bindings=await people.state(client,league.id,config.tournamentIds);
  const computed=calculate(bundles,bindings,config.rules,league.formats);
  return {...computed,bundles,bindings,league:{...league,...config,events:computed.events,eventCount:computed.events.length}};
}

async function list({client,user}) {
  return response({leagues:(await repo.list(client)).map(l=>publicLeague(l,user)),viewer:{canCreate:canCreateLeague(user)}});
}

async function bySlug({client,params}) {
  const league=await repo.find(client,params.slug,{slug:true});
  if (!league) throw new HttpError(404,'League not found');
  return load(client,league);
}

async function detail(ctx) {
  const result=await bySlug(ctx);
  return response({league:publicLeague(result.league,ctx.user)});
}

async function standings(ctx) {
  const {league,standings,bindings}=await bySlug(ctx);
  const track=ctx.query.get('track') || (league.formats.includes('solo')?'solo':'org');
  if (!TRACKS.includes(track) || !league.rules[track]) throw new HttpError(404,'League track not found');
  const rows=standings[track];
  if (ctx.params.subjectKey) {
    const requested=ctx.params.subjectKey;
    const redirect=/^person:\d+$/.test(requested) && bindings.people.get(Number(requested.slice(7)))?.mergedIntoId;
    const row=rows.find(r=>r.subjectKey===(redirect?'person:'+redirect:requested));
    if (!row) throw new HttpError(404,'League standing not found');
    const history=row.history.map(item=>{
      const {tournamentId,tournamentName,tournamentDate,tournamentSlug,format,pairingType,sourceKey,subjectKey,name,
        displayName,aliases,rank,rawTp,metrics,picks,members,awardPlace,points,teamNameSnapshot}=item;
      return {tournamentId,tournamentName,tournamentDate,tournamentSlug,format,pairingType,sourceKey,subjectKey,name,
        displayName,aliases,rank,rawTp,metrics,picks,members,awardPlace,points,teamNameSnapshot};
    });
    return response({row:{...rowSummary(row),history}});
  }
  return response({rows:rows.map(rowSummary),criteria:league.rules[track].criteria});
}

async function sources({client,user,query}) {
  await requireLeagueAccess(client,user,query.get('leagueId'));
  return response({sources:(await repo.availableSources(client,{q:(query.get('q') || '').trim().slice(0,120)})).map(repo.sourceSummary)});
}

function draftFields(body,existing) {
  const name=body.name ?? existing?.name;
  if (typeof name!=='string' || !name.trim() || name.trim().length>120) throw new HttpError(400,'Enter a league name of 1–120 characters');
  const formats=body.formats ?? existing?.formats;
  if (!Array.isArray(formats) || !formats.length || formats.some(f=>!FORMATS.includes(f))) throw new HttpError(400,'Choose at least one supported league format');
  const selected=body.tournamentIds ?? existing?.tournamentIds ?? [];
  if (!Array.isArray(selected)) throw new HttpError(400,'Choose tournaments from the catalog');
  const rules=body.rules ?? {};
  if (!rules || typeof rules!=='object' || Array.isArray(rules) || Object.keys(rules).some(k=>!TRACKS.includes(k))) throw new HttpError(400,'Invalid league rules');
  return {name:name.trim(),formats:FORMATS.filter(f=>formats.includes(f)),tournamentIds:[...new Set(selected.map(id))].sort((a,b)=>a-b),rules};
}

function normalizeRules(draft,existing,available,issues) {
  const selected=available.filter(t=>draft.tournamentIds.includes(t.id));
  for (const t of selected) {
    if (!draft.formats.includes(leagueFormat(t))) issues.push({code:'invalid_format',tournamentId:t.id,field:'formats',action:'Enable the tournament format or remove this stage'});
  }
  const rules={};
  for (const track of TRACKS) {
    if (!(track==='solo'?draft.formats.includes('solo'):draft.formats.some(f=>f!=='solo'))) continue;
    const previous=existing?.rules[track],provided=draft.rules[track] ?? previous ?? {};
    let rule=provided;
    if (provided.importTournamentId!=null) {
      const source=available.find(t=>t.id===id(provided.importTournamentId));
      if (!source || source.status!=='completed' || trackOf(source)!==track) {
        issues.push({code:'invalid_rule',track,field:'importTournamentId',action:'Choose a published completed tournament in this track'});
      } else {
        const order=resolveTournamentOrder(source);
        const sourceVersion=createHash('sha256').update(JSON.stringify([source.id,source.pairingType,order])).digest('hex');
        rule={...provided,criteria:order,sourceTournamentId:source.id,sourceName:source.name,sourceVersion};
      }
    } else if (provided.sourceTournamentId!=null) {
      // Clients can retain an existing snapshot. Creating or replacing one always reads the actual source.
      if (provided.sourceTournamentId!==previous?.sourceTournamentId ||
          !isDeepStrictEqual(provided.criteria,previous.criteria)) {
        rule={...provided,sourceTournamentId:null,sourceName:null};
      } else rule={...provided,sourceName:previous.sourceName,sourceVersion:previous.sourceVersion};
    }
    try {
      rules[track]=validateLeagueRules(rule);
      if (rules[track].sourceTournamentId) rules[track].sourceVersion=rule.sourceVersion;
      const trackSources=selected.filter(t=>trackOf(t)===track);
      if (!trackSources.length) {
        const compatible=supportedTrackMetrics(track,draft.formats);
        for (const {metric} of rules[track].criteria) {
          if (!compatible.includes(metric)) issues.push({code:'incompatible_metric',track,field:metric,action:'change_league_criteria'});
        }
      }
      for (const t of trackSources) {
        for (const {metric} of rules[track].criteria) {
          if (!supportedMetrics(t).includes(metric)) issues.push({code:'incompatible_metric',tournamentId:t.id,track,field:metric,action:'Change the league criterion or remove this stage'});
        }
      }
    } catch(error) {
      if (!(error instanceof HttpError)) throw error;
      issues.push({code:'invalid_rule',field:'rules',track,action:error.message});
      rules[track]=validateLeagueRules(previous || {});
    }
  }
  return rules;
}

function rankChanges(before,after) {
  const prior=new Map(before.map(row=>[row.subjectKey,row]));
  const next=new Map(after.map(row=>[row.subjectKey,row]));
  return [...new Set([...next.keys(),...prior.keys()])].flatMap(key=>{
    const a=prior.get(key),b=next.get(key);
    if (a?.rank===b?.rank && a?.points===b?.points && a?.eventCount===b?.eventCount &&
        JSON.stringify(a?.criteriaValues)===JSON.stringify(b?.criteriaValues)) return [];
    return [{subjectKey:key,name:(b || a).name,from:a?.rank ?? null,to:b?.rank ?? null,
      fromPoints:a?.points ?? null,toPoints:b?.points ?? null}];
  });
}

async function configure(ctx,save) {
  const {client,body,params}=ctx;
  if (!body || typeof body!=='object' || Array.isArray(body)) throw new HttpError(400,'Invalid league settings');
  const access=await requireLeagueAccess(client,ctx.user,params.leagueId);
  const current=access.league ? {...access.league,...await repo.config(client,access.league.id)} : null;
  checkRevision(current,body.revision);
  const draft=draftFields(body,current);
  const imports=Object.values(draft.rules).flatMap(r=>r?.importTournamentId==null?[]:[id(r.importTournamentId)]);
  const needed=[...new Set([...draft.tournamentIds,...imports,...(current?.tournamentIds || [])])];
  // Result publication already locks the tournament; use the same tournament → league lock order.
  const available=await repo.availableSources(client,{ids:needed,lock:save});
  if (current && save) checkRevision((await requireLeagueAccess(client,ctx.user,current.id,{lock:true})).league,body.revision);
  if (draft.tournamentIds.some(tid=>!available.some(t=>t.id===tid))) throw new HttpError(400,'Choose published tournaments from the catalog');
  const issues=[];
  draft.rules=normalizeRules(draft,current,available,issues);
  const bundles=await loadLeagueEvents(client,draft.tournamentIds);
  const bindings=await people.state(client,current?.id,draft.tournamentIds);
  const computed=calculate(bundles,bindings,draft.rules,draft.formats);
  if (!save) {
    const before=current ? (await load(client,current)).standings : {solo:[],org:[]};
    return response({
      valid:issues.length===0,issues:[...issues,...computed.events.flatMap(e=>e.issues)],
      league:publicLeague({...current,ownerUserId:current?.ownerUserId ?? access.user.id,...draft,events:computed.events},access.user),
      standings:Object.fromEntries(TRACKS.map(track=>[track,computed.standings[track].map(rowSummary)])),
      changes:Object.fromEntries(TRACKS.map(track=>[track,rankChanges(before[track],computed.standings[track])]))
    });
  }
  if (issues.length) throw new HttpError(400,issues.map(i=>[available.find(t=>t.id===i.tournamentId)?.name,i.field,i.action].filter(Boolean).join(' · ')).join('\n'));
  const unchanged=current && current.name===draft.name && isDeepStrictEqual(current.formats,draft.formats)
    && isDeepStrictEqual(current.tournamentIds,draft.tournamentIds)
    && isDeepStrictEqual(current.rules,draft.rules);
  if (unchanged) return response({league:publicLeague({...current,events:computed.events,eventCount:computed.events.length},access.user)});
  const record=current || await repo.insert(client,draft,access.user.id);
  if (current) await repo.update(client,current.id,draft);
  await repo.replaceConfig(client,record.id,draft);
  await people.sync(client,record.id,bundles);
  const result=await load(client,await repo.find(client,record.id));
  return response({league:publicLeague(result.league,access.user)},current?200:201);
}

async function identityWork(ctx,lock=false) {
  const {league,user}=await requireLeagueAccess(ctx.client,ctx.user,ctx.params.leagueId,{lock});
  if (lock && (!ctx.body || typeof ctx.body!=='object' || Array.isArray(ctx.body))) throw new HttpError(400,'Invalid league decision');
  if (lock) checkRevision(league,ctx.body.revision);
  const data=await load(ctx.client,league);
  const {bindings}=data;
  const active=new Map(),appearanceKeys=new Map();
  for (const fact of data.facts.flatMap(f=>f.identities)) {
    const appearance=fact.originKey || fact.sourceKey;
    active.set(fact.sourceKey,appearance);
    if (!appearanceKeys.has(appearance)) appearanceKeys.set(appearance,[]);
    appearanceKeys.get(appearance).push(fact.sourceKey);
  }
  const sources=bindings.bindings.filter(b=>active.has(b.sourceKey)).map(b=>({...b,person:bindings.people.get(b.personId),
    appearanceKeys:appearanceKeys.get(active.get(b.sourceKey))}));
  // Evaluate the slot without any award decisions to enumerate precisely the players who actually shared it.
  const places=[];
  for (const bundle of data.bundles.filter(b=>data.league.rules.solo?.primary==='place' && trackOf(b.tournament)==='solo')) {
    const view=buildEventContributions(bundle,{...bindings,recipients:new Map()},{...data.league.rules.solo,primary:'place'});
    for (const issue of view.issues.filter(i=>i.code==='place_recipient')) {
      const candidates=issue.candidateKeys.flatMap(key=>{
        const p=bindings.people.get(Number(String(key).replace(/^person:/,'')));
        return p?[{personId:p.id,name:p.name}]:[];
      });
      const slot=bundle.tournament.id+':'+issue.participantId;
      places.push({tournamentId:bundle.tournament.id,participantId:issue.participantId,
        personId:bindings.recipients.get(slot) || null,candidates});
    }
  }
  return {league,user,sources,places};
}

async function bindings(ctx) {
  const {league,sources,places}=await identityWork(ctx);
  const all=ctx.query.get('status')==='all',selected=ctx.query.get('sourceKey');
  const seen=new Set();
  const entries=sources.filter(s=>{
    if ((selected && s.sourceKey!==selected) || (!selected && !all && s.person.confirmed)) return false;
    const key=s.personId+':'+s.appearanceKeys[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (selected && !entries.length) throw new HttpError(404,'League source not found');
  const q=ctx.query.get('q') ?? (selected?entries[0].name:'');
  return response({revision:league.revision,bindings:entries.map(({manual,person,appearanceKeys,...s})=>({...s,userId:person.userId,
    confirmed:person.confirmed,registerNickname:person.registerNickname,cardName:person.name,manual})),
    places:places.filter(p=>all || !p.personId || !p.candidates.some(c=>c.personId===p.personId)),
    candidates:selected?await people.candidates(ctx.client,league.id,q):[]});
}

async function applyIdentity(ctx,place) {
  const {league,user,sources,places}=await identityWork(ctx,true);
  let changed;
  if (place) {
    const tournamentId=id(ctx.params.tournamentId),participantId=id(ctx.params.participantId),personId=id(ctx.body.personId);
    const slot=places.find(p=>p.tournamentId===tournamentId && p.participantId===participantId);
    if (!slot || !slot.candidates.some(c=>c.personId===personId)) throw new HttpError(400,'Choose a player who shared this official place');
    changed=await people.choosePlace(ctx.client,league.id,tournamentId,participantId,personId,slot.personId,user);
  } else {
    const source=sources.find(s=>s.sourceKey===ctx.params.sourceKey);
    if (!source) throw new HttpError(404,'League source not found');
    changed=await people.bind(ctx.client,league.id,source,ctx.body,user);
  }
  if (changed) await ctx.client.query('UPDATE leagues SET revision=revision+1 WHERE id=$1',[league.id]);
  return response({revision:league.revision+(changed?1:0)});
}

const preview=ctx=>configure(ctx,false);
const save=ctx=>configure(ctx,true);
const bind=ctx=>applyIdentity(ctx,false);
const place=ctx=>applyIdentity(ctx,true);
const read={auth:'none',loadUser:true,tx:true,repeatableRead:true};
const create={auth:'user',permission:'league.create',tx:true};
const manage={auth:'user',permission:'league.manage',tx:true};
const routes=[
  {method:'GET',path:'/api/leagues',handler:list,...read},
  {method:'GET',path:'/api/leagues/sources',handler:sources,auth:'user'},
  {method:'GET',path:'/api/leagues/:slug',handler:detail,...read},
  {method:'GET',path:'/api/leagues/:slug/standings',handler:standings,...read},
  {method:'GET',path:'/api/leagues/:slug/standings/:subjectKey',handler:standings,...read},
  {method:'POST',path:'/api/leagues/preview',handler:preview,...create,repeatableRead:true},
  {method:'POST',path:'/api/leagues',handler:save,...create},
  {method:'POST',path:'/api/leagues/:leagueId/preview',handler:preview,...manage,repeatableRead:true},
  {method:'PATCH',path:'/api/leagues/:leagueId',handler:save,...manage},
  {method:'GET',path:'/api/leagues/:leagueId/bindings',handler:bindings,...manage,repeatableRead:true},
  {method:'PUT',path:'/api/leagues/:leagueId/bindings/:sourceKey',handler:bind,...manage},
  {method:'PUT',path:'/api/leagues/:leagueId/places/:tournamentId/:participantId',handler:place,...manage}
];
module.exports={routes,requireLeagueAccess,list,detail,standings,sources,preview,save,bindings,bind,place};

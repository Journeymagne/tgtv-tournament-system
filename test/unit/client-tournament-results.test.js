const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../public/app.js'), 'utf8');
const extract = name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\r?\\n\\}`))[0];
const results = require('../../public/tournament-results');

test('results tab appears only after publication, in public and administration views', () => {
  const tabs = new Function('t','adminLabel',`${extract('tournamentInfoTabDefinitions')};return tournamentInfoTabDefinitions;`)(key=>key,(_,en)=>en);
  for (const admin of [false,true]) {
    const data = { tournament: { status: 'in_progress', finalResults: null } };
    assert.equal(tabs(data,{admin}).some(tab=>tab.id==='results'),false);
    assert.equal(tabs(data,{admin})[0].id,'preview');
    data.tournament.status='completed';data.tournament.finalResults=[{rank:1,participantId:1}];
    assert.equal(tabs(data,{admin}).some(tab=>tab.id==='results'),true);
    assert.deepEqual(tabs(data,{admin}).slice(0,2).map(tab=>tab.id),['results','preview']);
  }
});

test('completed tournament defaults to results and preserves an explicit overview selection', () => {
  const state = { tournamentInfoTab: '' };
  const activeTab = new Function('state','t','adminLabel',`${extract('tournamentInfoTabDefinitions')}\n${extract('tournamentInfoActiveTab')};return tournamentInfoActiveTab;`)(state,key=>key,(_,en)=>en);
  const data={tournament:{status:'completed',finalResults:[{rank:1,participantId:1}]}};
  for(const admin of [false,true]) {
    state.tournamentInfoTab='';assert.equal(activeTab(data,{admin}),'results');
    state.tournamentInfoTab='preview';assert.equal(activeTab(data,{admin}),'preview');
    state.tournamentInfoTab='';assert.equal(activeTab({tournament:{status:'in_progress'}},{admin}),'preview');
  }
});

test('completed overview retains the last round maps, missions, deadline and progress instead of rendering results', () => {
  const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const preview = new Function('t','escapeHtml','tournamentMatchStatusLabel','tournamentRoundDeadlineMarkup','tournamentRoundProgressMarkup','teamTableImageMarkup','mapLayoutLabel','markdownToHtml','tournamentRulesLinkMarkup',
    `${extract('tournamentPreviewRound')}\n${extract('tournamentPreviewMarkup')};return tournamentPreviewMarkup;`)(
    (key,params)=>params?.number?`Round ${params.number}`:key,escape,status=>status,round=>round.metadata.endsAt,round=>`${round.matches.length} confirmed games`,()=>'',table=>table.deployment,escape,()=>''
  );
  const data={tournament:{status:'completed',participantMode:'team',description:'Tournament rules',finalResults:[{rank:1,rosterId:1}]},rounds:[
    {id:1,roundNumber:1,status:'completed',matches:[],metadata:{tables:[{killzone:'Tomb World'}]}},
    {id:6,roundNumber:6,status:'completed',matches:[{phase:'completed'}],metadata:{endsAt:'2026-11-15T23:59:00+04:00',tables:[{tableNumber:1,killzone:'Volkus',deployment:'5'}],missions:[{critOp:'Loot'}]}}
  ]};
  const html=preview(data);
  assert.match(html,/tournament-preview-round/);assert.match(html,/Round 6/);assert.match(html,/Volkus/);assert.match(html,/Loot/);
  assert.match(html,/2026-11-15T23:59:00\+04:00/);assert.match(html,/1 confirmed games/);assert.match(html,/Tournament rules/);
  assert.doesNotMatch(html,/Tomb World|tournament-results|data-tournament-results-download/);
});

test('opening another tournament uses its first tab unless a target tab is explicitly requested', () => {
  const state={tournamentInfoTab:'preview'};
  const navigate=new Function('state','pushAppLocation','tournamentPublicPath','renderPublicTournamentRoute',`${extract('navigateToPublicTournament')};return navigateToPublicTournament;`)(state,()=>{},slug=>'/tournaments/'+slug,()=>{});
  navigate('completed-cup');assert.equal(state.tournamentInfoTab,'');
  navigate('completed-cup',{tab:'preview'});assert.equal(state.tournamentInfoTab,'preview');
  navigate('live-cup',{tab:'matches'});assert.equal(state.tournamentInfoTab,'matches');
});

test('organizer readiness banner is hidden from judges, participants and incomplete events', () => {
  const render = new Function('state','t','TGTVTournamentResults',`${extract('tournamentFinalStandingsReady')}\n${extract('canFinishTournamentUi')}\n${extract('tournamentCompletionBannerMarkup')};return tournamentCompletionBannerMarkup;`)
    ({me:null},key=>key,results);
  const data={tournament:{status:'in_progress',participantMode:'team',format:'swiss',swissRoundCount:1,viewer:{canFinish:true}},rounds:[{id:1,roundNumber:1,status:'completed',matches:[{phase:'completed'}]}]};
  assert.match(render(data),/data-public-admin-action="close-tournament"/);
  assert.match(render(data,{admin:true}),/data-admin-tournament-action="close-tournament"/);
  data.tournament.viewer.canFinish=false;assert.equal(render(data),'');
  data.tournament.viewer.canFinish=true;data.rounds[0].matches[0].phase='in_progress';assert.equal(render(data),'');
});

test('export controls restore the button and show a retryable error after encoding failure', async () => {
  let callback;const button={disabled:false,isConnected:true},error={textContent:''};
  const doc={querySelectorAll:()=>[button],querySelector:()=>error,documentElement:{}};
  const wire=new Function('document','onLive','getComputedStyle','TGTVTournamentResults','t','i18n',`${extract('wireTournamentResultsControls')};return wireTournamentResultsControls;`)
    (doc,(_button,_event,fn)=>{callback=fn},()=>({getPropertyValue:()=>''}),{download:async()=>{throw Error('encoding failed')}},key=>key,{getLocale:()=> 'ru'});
  wire({});await callback();assert.equal(button.disabled,false);assert.equal(error.textContent,'results.exportFailed');
});

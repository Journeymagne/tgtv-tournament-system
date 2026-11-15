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
    data.tournament.status='completed';data.tournament.finalResults=[{rank:1,participantId:1}];
    assert.equal(tabs(data,{admin}).some(tab=>tab.id==='results'),true);
  }
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

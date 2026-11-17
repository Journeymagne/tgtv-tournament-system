const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../public/app.js'),'utf8');
const fn=name=>{const text=source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];assert.ok(text,name);return text};
const guides=require('../../public/pairing-instructions');
test('WTC Doubles selects venue-specific pairing instructions in both languages',()=>{
  for(const lang of ['ru','en'])for(const guided of [true,false]) {
    const guide=guides.get({pairingType:'wtc_doubles',captainPairingEnabled:guided},{venueMode:guided?'tts':'irl'},lang);
    assert.match(guide.title,new RegExp(guided?'TTS':'IRL'));assert.equal(guide.steps.length,6);
  }
});
test('WTC Doubles renders table-first choices against own players, without requiring opponents',()=>{
  const render=new Function('t','escapeHtml','activeRosterMembersForUi','teamPairingMemberLabel','tableLabel',`${fn('wtcDoublesChoiceForm')};return wtcDoublesChoiceForm`)(key=>key,String,r=>r.members,m=>m.name,t=>`Table ${t.tableNumber}`);
  const match={id:9,rosterA:{name:'Alpha',members:[{id:11,name:'Alice'},{id:12,name:'Amy'}]},rosterB:{name:'Beta',members:[{id:21,name:'Bob'},{id:22,name:'Ben'}]},nextAction:{kind:'tables',side:'b'},environment:{step:1},tableIds:[1,2],tables:[{id:1,tableNumber:1},{id:2,tableNumber:2}]};
  const html=render(match,'b');assert.match(html,/Bob/);assert.match(html,/Ben/);assert.doesNotMatch(html,/Alice|Amy/);
  assert.equal((html.match(/<select /g)||[]).length,2);assert.match(html,/data-step="1"/);
  assert.doesNotMatch(render(match,'a'),/<form/);
});
test('editing a running WTC Doubles tournament does not submit locked faction setup',()=>{
  const admin=fs.readFileSync(path.join(__dirname,'../../public/admin.js'),'utf8');
  const code=admin.match(/function adminTournamentBodyFromForm\([^\n]*\) \{[\s\S]*?\r?\n\}/)?.[0];assert.ok(code);
  const collect=new Function('setFormValue',`${code};return adminTournamentBodyFromForm`)((body,form,name)=>{const control=form.elements[name];if(control&&!control.disabled)body[name]=control.value});
  const form={dataset:{},elements:{name:{value:'Renamed'},participantMode:{value:'team',disabled:true},pairingType:{value:'wtc_doubles',disabled:true},factionCount:{value:'1',disabled:true}},querySelectorAll:()=>[]};
  const body=collect(form);assert.equal(body.name,'Renamed');assert.equal(Object.hasOwn(body,'factionCount'),false);
});

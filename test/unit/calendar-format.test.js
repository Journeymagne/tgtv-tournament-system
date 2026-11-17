const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeCalendarEvent,tournamentDefaults}=require('../../src/domain/calendar-events');
const base={name:'Cup',date:'2026-11-21',time:'10:00',city:'Москва',venue:'Клуб',address:'',participantLimit:24,entryFee:0};

test('Players events save rounds and transfer them to tournament creation without a team size',()=>{
 const event=normalizeCalendarEvent({...base,participantMode:'individual',swissRoundCount:'5',teamSize:'3'});
 assert.equal(event.participantMode,'individual');assert.equal(event.tournamentType,'solo');assert.equal(event.teamSize,null);assert.equal(event.swissRoundCount,5);
 const defaults=tournamentDefaults(event);assert.equal(defaults.swissRoundCount,5);assert.equal(defaults.participantMode,'individual');assert.equal(defaults.registrationLimit,24);
});
test('Teams events support the actual two- and three-player tournament rosters',()=>{
 for(const size of [2,3]){
  const event=normalizeCalendarEvent({...base,participantMode:'team',teamSize:String(size),swissRoundCount:4});
  assert.equal(event.teamSize,size);assert.equal(event.tournamentType,size===2?'pairs':'teams');
  const defaults=tournamentDefaults(event);assert.equal(defaults.teamSize,size);assert.equal(defaults.swissRoundCount,4);assert.equal(defaults.registrationLimit,24/size);
  assert.equal(defaults.pairingType,size===2?'doubles':'shield_sword');
 }
});
test('Legacy calendar events remain editable and receive sensible format defaults',()=>{
 for(const [type,mode,size]of [['solo','individual',null],['teams','team',3],['pairs','team',2]]){
  const event=normalizeCalendarEvent({...base,tournamentType:type});
  assert.equal(event.participantMode,mode);assert.equal(event.teamSize,size);assert.equal(event.swissRoundCount,3);
 }
});
test('Unsupported formats, round counts and roster sizes reject before persistence',()=>{
 for(const changes of [{participantMode:'other'},{swissRoundCount:0},{swissRoundCount:-1},{swissRoundCount:1.5},{swissRoundCount:true},{swissRoundCount:2147483648},{participantMode:'team',teamSize:1},{participantMode:'team',teamSize:4},{participantMode:'team',teamSize:2.5},{participantMode:'team',teamSize:true}]){
  assert.throws(()=>normalizeCalendarEvent({...base,participantMode:'individual',swissRoundCount:3,...changes}),{status:400});
 }
});

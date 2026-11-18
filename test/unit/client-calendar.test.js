const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { monthDays,filterEvents } = require('../../public/calendar');
test('calendar month grid uses Monday first and preserves local dates at year and leap boundaries',()=>{
  const november=monthDays('2026-11');
  assert.equal(november[0],'2026-10-26');
  assert.equal(november.at(-1),'2026-12-06');
  assert.equal(november.length,42);
  assert.ok(monthDays('2028-02').includes('2028-02-29'));
  assert.equal(monthDays('2027-01')[0],'2026-12-28');
});
test('calendar combines title/city/venue search with city and tournament type filters',()=>{
  const events=[{id:1,name:'Autumn cup',city:'Moscow',venue:'Club',tournamentType:'solo'},
    {id:2,name:'Pairs',city:'Moscow',venue:'Other',tournamentType:'pairs'}];
  assert.deepEqual(filterEvents(events,{search:' CLUB ',city:'Moscow',type:'solo'}).map(e=>e.id),[1]);
  assert.equal(filterEvents(events,{search:'',city:'Kazan',type:''}).length,0);
});
test('calendar uses the existing application shell and omits the game-system control',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../../public/app.js'),'utf8');
  const calendar=fs.readFileSync(path.join(__dirname,'../../public/calendar.js'),'utf8');
  assert.match(app,/navButton\('calendar', t\('calendar.title'\)\)/);
  assert.match(app,/view: 'calendar'/);
  assert.doesNotMatch(calendar,/gameSystemOptions|name="(?:gameSystem|system)"|global-header|mobile-bottom-nav/);
  assert.match(calendar,/class="primary-button"/);
  assert.match(calendar,/calendarEvent=\$\{event.id\}/);
});

test('Teams filter includes pairs and teams of three; Players excludes both',()=>{
 const events=[{name:'Solo',city:'Moscow',venue:'Club',tournamentType:'solo',participantMode:'individual'},
  {name:'Pairs',city:'Moscow',venue:'Club',tournamentType:'pairs',participantMode:'team'},
  {name:'Teams',city:'Moscow',venue:'Club',tournamentType:'teams',participantMode:'team'}];
 assert.equal(filterEvents(events,{search:'',city:'',type:'team'}).length,2);
 assert.equal(filterEvents(events,{search:'',city:'',type:'individual'}).length,1);
});


test('calendar offers Add event to organizers and administrators while leaving other controls restricted', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../../public/calendar.js'), 'utf8');
  for (const [user, canAdd] of [[null, false], [{ id: 2 }, false], [{ id: 2, managedTournamentIds: [1] }, false],
    [{ id: 2, canCreateTournaments: true, capabilities: { canCreateTournaments: true } }, true],
    [{ id: 2, canCreateTournaments: true, capabilities: { canCreateTournaments: false } }, false],
    [{ id: 1, isAdmin: true }, true]]) {
    const sandbox = { module: { exports: {} }, URLSearchParams, location: { search: '' }, matchMedia: () => ({ matches: false }), document: { querySelectorAll: () => [] } };
    vm.runInNewContext(source, sandbox);
    const container = { isConnected: true, innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    const today = new Date(), date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    await sandbox.module.exports.mount(container, { user, isCurrent: () => true, t: key => key, escapeHtml: value => String(value), locale: () => 'en', comboField: () => '', wireComboFields: () => {},
      api: async () => ({ events: [{ id: 1, name: 'Announcement', date, city: 'Moscow', venue: 'Club', participantLimit: 32, entryFee: 1000 }] }) });
    assert.equal(container.innerHTML.includes('data-calendar-add'), canAdd, JSON.stringify(user));
    assert.equal(container.innerHTML.includes('data-calendar-edit='), Boolean(user?.isAdmin));
    assert.equal(container.innerHTML.includes('data-calendar-delete='), Boolean(user?.isAdmin));
    assert.equal(container.innerHTML.includes('calendarEvent=1'), Boolean(user?.isAdmin));
  }
});

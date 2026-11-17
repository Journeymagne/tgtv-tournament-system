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

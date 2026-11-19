const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCalendarEvent, monthRange, tournamentDefaults } = require('../../src/domain/calendar-events');
const event = { name: 'November cup', date: '2026-11-21', time: '10:30', city: 'Moscow', venue: 'Club', address: 'Street 1', tournamentType: 'solo', participantLimit: 32, entryFee: '1500.50' };

test('manual announcements preserve pending conditions without turning them into free entry or zero capacity', () => {
  for (const pending of [null, undefined, '']) {
    const saved = normalizeCalendarEvent({...event,participantLimit:pending,entryFee:pending});
    assert.equal(saved.participantLimit,null);
    assert.equal(saved.entryFee,null);
    assert.equal(tournamentDefaults(saved).registrationLimit,null);
  }
  assert.equal(normalizeCalendarEvent({...event,entryFee:0}).entryFee,0);
  assert.equal(normalizeCalendarEvent({...event,participantLimit:null}).entryFee,1500.5);
  for (const pending of [null, '']) {
    assert.equal(tournamentDefaults(normalizeCalendarEvent({...event,tournamentType:'pairs',participantLimit:pending})).registrationLimit,null);
  }
});

test('calendar events preserve local dates and monetary precision without a system selector', () => {
  const value = normalizeCalendarEvent(event);
  assert.equal(value.date, '2026-11-21');
  assert.equal(value.entryFee, 1500.5);
  assert.equal(value.name, 'November cup');
  assert.equal(Object.hasOwn(value, 'gameSystem'), false);
  assert.equal(normalizeCalendarEvent({ ...event, time: '', entryFee: '0' }).time, null);
});

test('calendar rejects impossible local dates, times, capacities, types and fees', () => {
  for (const changes of [{date:'2026-02-29'},{date:'2026-04-31'},{date:'2026-13-01'},{time:'24:00'},
    {participantLimit:true},{participantLimit:0},{participantLimit:10001},{participantLimit:2.5},
    {tournamentType:'other'},{tournamentType:'teams',participantLimit:2},{entryFee:-1},{entryFee:'NaN'},
    {entryFee:'1.001'},{entryFee:1000001},{name:' '},{city:'x'.repeat(81)},{venue:''},
    {tournamentType:'teams',participantLimit:385},{tournamentType:'pairs',participantLimit:257},{entryFee:[]},{entryFee:{}},
    {city:'c'.repeat(80),venue:'v'.repeat(160),address:'a'.repeat(300)}]) {
    assert.throws(()=>normalizeCalendarEvent({...event,...changes}),{status:400},JSON.stringify(changes));
  }
  assert.deepEqual(monthRange('2026-12'),{from:'2026-12-01',until:'2027-01-01'});
  assert.throws(()=>monthRange('2026-13'),{status:400});
});
test('calendar rejects impossible dates, unsafe values and unknown formats', () => {
  for (const patch of [{ date: '2026-02-29' }, { date: '2026-13-01' }, { time: '24:00' }, { entryFee: '-1' }, { entryFee: '1.001' }, { entryFee: '1e3' }, { entryFee: Infinity }, { participantLimit: 1.5 }, { participantLimit: 10001 }, { tournamentType: 'other' }, { name: ' ' }, { city: {} }, { venue: 'x'.repeat(161) }]) {
    assert.throws(() => normalizeCalendarEvent({ ...event, ...patch }), { status: 400 });
  }
  assert.throws(() => normalizeCalendarEvent([]), { status: 400 });
  assert.equal(normalizeCalendarEvent({ ...event, date: '2028-02-29' }).date, '2028-02-29');
});
test('month bounds cross years without timezone conversion', () => {
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', until: '2027-01-01' });
  assert.throws(() => monthRange('2026-00'), { status: 400 });
  assert.throws(() => monthRange('2026-02-01'), { status: 400 });
});
test('tournament defaults use Kill Team and convert players to doubles/team rosters', () => {
  const doubles = tournamentDefaults({ ...event, tournamentType: 'pairs', participantLimit: 24 });
  assert.equal(doubles.participantMode, 'team');
  assert.equal(doubles.pairingType, 'doubles');
  assert.equal(doubles.registrationLimit, 12);
  assert.equal(doubles.venueMode, 'irl');
  assert.equal(doubles.captainPairingEnabled, false);
  assert.equal(doubles.gameSystem, 'Warhammer 40k Kill Team');
  assert.equal(tournamentDefaults({ ...event, tournamentType: 'teams', participantLimit: 30 }).registrationLimit, 10);
  assert.equal(tournamentDefaults({ ...event, time: null }).startsAt, '2026-11-21T00:00');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { poolOptions, resetSchemas } = require('../helpers/schema');
const { migrate } = require('../../src/db/migrate');
const users = require('../../src/db/repositories/users');
const calendar = require('../../src/api/calendar-events');
const tournaments = require('../../src/api/tournaments');
const routes = require('../../src/api/routes-tournaments');
let pool, admin, player;
const data = { name: 'Calendar cup', date: '2026-11-21', time: '10:00', city: 'Moscow', venue: 'Club', address: '', tournamentType: 'solo', participantLimit: 32, entryFee: 1500 };
async function tx(action) { const c = await pool.connect(); try { await c.query('BEGIN'); const result = await action(c); await c.query('COMMIT'); return result; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
test.before(async () => { pool = new Pool(poolOptions); await resetSchemas(pool); await migrate(pool); });
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  await pool.query('TRUNCATE accounts.users,tournaments.tournaments RESTART IDENTITY CASCADE');
  admin = await users.insert(pool, { name: 'CalendarAdmin', passwordHash: 's:h', rating: 1000, isAdmin: true });
  player = await users.insert(pool, { name: 'CalendarPlayer', passwordHash: 's:h', rating: 1000 });
});
test('calendar routes are public to read and administrator-only to mutate', async () => {
  assert.equal(routes.find(r => r.path === '/api/calendar-events').auth, 'none');
  for (const r of routes.filter(r => r.path.startsWith('/api/admin/calendar-events'))) assert.equal(r.auth, 'admin');
  await assert.rejects(tx(client => calendar.create({ client, user: player, body: data })), { status: 403 });
  const saved = await tx(client => calendar.create({ client, user: admin, body: data }));
  const event = saved.body.event;
  const list = await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') });
  assert.equal(list.events.length, 1);
  assert.equal(list.events[0].date, data.date);
  const changed = await tx(client => calendar.update({ client, user: admin, params: { id: event.id }, body: { ...data, name: 'New name', expectedUpdatedAt: event.updatedAt } }));
  assert.equal(changed.event.name, 'New name');
  await assert.rejects(tx(client => calendar.update({ client, user: admin, params: { id: event.id }, body: { ...data, expectedUpdatedAt: event.updatedAt } })), { status: 409 });
  await tx(client => calendar.remove({ client, user: admin, params: { id: event.id } }));
  assert.equal((await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') })).events.length, 0);
});
test('creating from a calendar event is atomic, prevents duplicates and hides drafts from guests', async () => {
  const event = (await tx(client => calendar.create({ client, user: admin, body: data }))).body.event;
  const body = { name: data.name, gameSystem: 'Warhammer 40k Kill Team', venueMode: 'irl', format: 'swiss', swissRoundCount: 3, calendarEventId: event.id };
  const outcomes = await Promise.allSettled([1, 2].map(() => tx(client => tournaments.createAdmin({ client, user: admin, body }))));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.status, 409);
  const publicEvent = (await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') })).events[0];
  assert.equal(publicEvent.tournamentCreated, true);
  assert.equal(publicEvent.tournament, null);
  const adminEvent = (await calendar.getAdmin({ client: pool, user: admin, params: { id: event.id } })).event;
  assert.ok(adminEvent.tournament.id);
  await pool.query("UPDATE tournaments SET status='registration_open' WHERE id=$1", [adminEvent.tournament.id]);
  const published = (await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') })).events[0];
  assert.ok(published.tournament.slug);
  await pool.query('DELETE FROM tournaments WHERE id=$1', [adminEvent.tournament.id]);
  assert.equal((await calendar.getAdmin({ client: pool, user: admin, params: { id: event.id } })).event.tournamentCreated, false);
});
test('bad tournament creation rolls back the link; removing the event retains the tournament', async () => {
  const event = (await tx(client => calendar.create({ client, user: admin, body: data }))).body.event;
  await assert.rejects(tx(client => tournaments.createAdmin({ client, user: admin, body: { name: data.name, format: 'invalid', calendarEventId: event.id } })));
  assert.equal((await calendar.getAdmin({ client: pool, user: admin, params: { id: event.id } })).event.tournamentCreated, false);
  const created = await tx(client => tournaments.createAdmin({ client, user: admin, body: { name: data.name, gameSystem: 'Warhammer 40k Kill Team', calendarEventId: event.id } }));
  await tx(client => calendar.remove({ client, user: admin, params: { id: event.id } }));
  assert.equal(Number((await pool.query('SELECT count(*) FROM tournaments WHERE id=$1', [created.body.tournament.id])).rows[0].count), 1);
});

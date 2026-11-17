const { HttpError } = require('../http/io');
const { requirePositiveIntId } = require('./params');
const { normalizeCalendarEvent, monthRange, tournamentDefaults } = require('../domain/calendar-events');
const repo = require('../db/repositories/calendar-events');
function requireAdmin(user) { if (!user?.isAdmin) throw new HttpError(403, 'Administrator rights required'); }
async function requireEvent(client, id, lock = false) {
  const event = await repo.find(client, requirePositiveIntId(id,404,'Calendar event not found'), true, lock);
  if (!event) throw new HttpError(404, 'Calendar event not found');
  return event;
}
async function list({ client, user, query }) {
  const month = query.get('month') || new Date().toISOString().slice(0,7);
  return { events: await repo.list(client, monthRange(month), !!user?.isAdmin) };
}
async function getAdmin({ client, user, params }) {
  requireAdmin(user); const event = await requireEvent(client, params.id);
  return { event, tournamentDefaults: tournamentDefaults(event) };
}
async function create({ client, user, body }) {
  requireAdmin(user);
  return { status: 201, body: { event: await repo.insert(client, normalizeCalendarEvent(body), user.id) } };
}
async function update({ client, user, params, body }) {
  requireAdmin(user); const event = await requireEvent(client, params.id, true);
  if (!body.expectedUpdatedAt || body.expectedUpdatedAt !== event.updatedAt) throw new HttpError(409, 'Calendar event changed. Reload it before saving.');
  return { event: await repo.update(client, event.id, normalizeCalendarEvent({ ...event,...body })) };
}
async function remove({ client, user, params }) {
  requireAdmin(user); const event = await requireEvent(client, params.id, true); await repo.remove(client,event.id);
  return { ok: true };
}
module.exports = { list, getAdmin, create, update, remove, requireEvent };

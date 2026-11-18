const { HttpError } = require('../http/io');
const { requirePositiveIntId } = require('./params');
const { normalizeCalendarEvent, monthRange, tournamentDefaults } = require('../domain/calendar-events');
const repo = require('../db/repositories/calendar-events');
const { canCreateTournament } = require('../domain/access');
function requireAdmin(user) { if (!user?.isAdmin) throw new HttpError(403, 'Administrator rights required'); }
async function requireEvent(client, id, lock = false) {
  const event = await repo.find(client, requirePositiveIntId(id,404,'Calendar event not found'), true, lock);
  if (!event) throw new HttpError(404, 'Calendar event not found');
  return event;
}
async function list({ client, user, query }) {
  const month = query.get('month') || new Date().toISOString().slice(0,7);
  return { events: await repo.list(client, monthRange(month), !!user?.isAdmin, user?.id || null) };
}
async function getAdmin({ client, user, params }) {
  requireAdmin(user); const event = await requireEvent(client, params.id);
  return { event, tournamentDefaults: tournamentDefaults(event) };
}
async function create({ client, user, body }) {
  if (!canCreateTournament(user)) throw new HttpError(403, 'Tournament creation permission required');
  return { status: 201, body: { event: await repo.insert(client, normalizeCalendarEvent(body), user.id) } };
}
async function update({ client, user, params, body }) {
  requireAdmin(user); const event = await requireEvent(client, params.id, true);
  if (!body.expectedUpdatedAt || body.expectedUpdatedAt !== event.updatedAt) throw new HttpError(409, 'Calendar event changed. Reload it before saving.');
  const changes={...event,...body};
  if(Object.hasOwn(body,'tournamentType') && !Object.hasOwn(body,'participantMode')) {
    delete changes.participantMode;
    if(!Object.hasOwn(body,'teamSize'))delete changes.teamSize;
  }
  return { event: await repo.update(client, event.id, normalizeCalendarEvent(changes,{allowIncomplete:!!event.autoCreated})) };
}
async function remove({ client, user, params }) {
  requireAdmin(user); const event = await requireEvent(client, params.id, true); await repo.remove(client,event.id);
  return { ok: true };
}
module.exports = { list, getAdmin, create, update, remove, requireEvent };

const { HttpError } = require('../http/io');
const { requirePositiveIntId } = require('./params');
const { normalizeCalendarEvent, monthRange, tournamentDefaults, calendarTimeZone } = require('../domain/calendar-events');
const { isPlatformAdmin, canCreateTournament } = require('../domain/access');
const { requireProviderAccess } = require('./tournament-providers');
const access = require('../db/repositories/access');
const tournaments = require('../db/repositories/tournaments');
const repo = require('../db/repositories/calendar-events');

function requestedProvider(body) {
  if (Object.hasOwn(body,'provider_id')) throw new HttpError(400,'Use providerId for the organization');
  if (body.providerId == null) return null;
  if (!['string','number'].includes(typeof body.providerId) || !/^\d+$/.test(String(body.providerId)) ||
      Number(body.providerId) > 2147483647) throw new HttpError(400,'Invalid organization');
  return requirePositiveIntId(body.providerId,400,'Invalid organization');
}

async function refreshUser(client,user) {
  user = await access.hydrate(client,user);
  if (!user) throw new HttpError(401,'You need to sign in');
  access.assertActive(user);
  return user;
}

async function requireEvent(client,id,lock=false) {
  const event = await repo.find(client,requirePositiveIntId(id,404,'Calendar event not found'),true,lock);
  if (!event) throw new HttpError(404,'Calendar event not found');
  return event;
}

async function requireEditableEvent(client,id,user,{lock=false,creatingTournament=false}={}) {
  let event = await requireEvent(client,id);
  let provider = null;
  if (event.providerId != null) {
    ({provider,user} = await requireProviderAccess(client,user,event.providerId,null,{lock}));
  }
  if (lock) {
    const linkedId = event.tournament?.id ?? null;
    if (linkedId != null) await tournaments.lockById(client,linkedId);
    event = await requireEvent(client,id,true);
    if ((event.tournament?.id ?? null) !== linkedId) throw new HttpError(409,'Calendar event changed. Reload it before saving.');
  }
  user = await refreshUser(client,user);
  const member = user.providerMemberships.find(m=>m.providerId===event.providerId);
  if (!isPlatformAdmin(user) && member?.role!=='organizer') throw new HttpError(403,'Calendar event management permission required');
  if (creatingTournament && provider?.archivedAt) throw new HttpError(403,'Organization is archived');
  if (creatingTournament && event.tournamentCreated) throw new HttpError(409,'A tournament has already been created for this calendar event');
  return {event,user};
}

// The router checks the same source before charging quotas, and direct handler
// calls also acquire the provider and source locks through this entry point.
async function tournamentCreationContext(client,user,body) {
  const requested = requestedProvider(body);
  if (body.calendarEventId !== undefined) {
    const result = await requireEditableEvent(client,body.calendarEventId,user,{lock:true,creatingTournament:true});
    if (Object.hasOwn(body,'providerId') && result.event.providerId!==requested) throw new HttpError(403,'Calendar event belongs to a different organization');
    return {...result,providerId:result.event.providerId};
  }
  if (requested != null) {
    ({user} = await requireProviderAccess(client,user,requested,'canCreateEvents',{lock:true}));
  } else {
    user = await refreshUser(client,user);
    if (!canCreateTournament(user)) throw new HttpError(403,'Tournament creation permission required');
  }
  return {user,event:null,providerId:requested};
}

async function list({ client, user, query }) {
  const month = query.get('month') || new Date().toISOString().slice(0,7);
  return { events: await repo.list(client,monthRange(month),user),
    viewer: { canCreateEvents: isPlatformAdmin(user) || Boolean(user?.capabilities?.canCreateProviderEvents) } };
}

async function getAdmin({client,user,params}) {
  const {event} = await requireEditableEvent(client,params.id,user);
  return {event,tournamentDefaults:tournamentDefaults(event)};
}

async function create({client,user,body}) {
  const providerId = requestedProvider(body);
  if (providerId != null) {
    ({user} = await requireProviderAccess(client,user,providerId,'canCreateEvents',{lock:true}));
  } else {
    user = await refreshUser(client,user);
    if (!isPlatformAdmin(user)) throw new HttpError(403,'Administrator rights required');
  }
  const event = {...normalizeCalendarEvent(body),providerId};
  return {status:201,body:{event:await repo.insert(client,event,user.id,calendarTimeZone(body.calendarTimeZone))}};
}

async function update({client,user,params,body}) {
  const {event} = await requireEditableEvent(client,params.id,user,{lock:true});
  if (Object.hasOwn(body,'providerId') || Object.hasOwn(body,'provider_id')) throw new HttpError(403,'Calendar event organization cannot be changed');
  if (!body.expectedUpdatedAt || body.expectedUpdatedAt !== event.updatedAt) throw new HttpError(409,'Calendar event changed. Reload it before saving.');
  const changes={...event,...body};
  if (Object.hasOwn(body,'tournamentType') && !Object.hasOwn(body,'participantMode')) {
    delete changes.participantMode;
    if (!Object.hasOwn(body,'teamSize')) delete changes.teamSize;
  }
  return {event:await repo.update(client,event.id,normalizeCalendarEvent(changes,{allowIncomplete:!!event.autoCreated}))};
}

async function remove({client,user,params}) {
  const {event} = await requireEditableEvent(client,params.id,user,{lock:true});
  await repo.remove(client,event.id);
  return {ok:true};
}

module.exports = {list,getAdmin,create,update,remove,requireEditableEvent,tournamentCreationContext};

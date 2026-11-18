const { HttpError, ValidationError } = require('../http/io');
const { requirePositiveIntId } = require('./params');
const repo = require('../db/repositories/tournament-providers');
const users = require('../db/repositories/users');
const access = require('../db/repositories/access');
const { normalizeProvider, providerPermissions } = require('../domain/tournament-providers');
const { canCreateTournament, isPlatformAdmin } = require('../domain/access');
const { uniqueSlug } = require('../domain/tournaments/slug');
const notifications = require('../notifications/publish');
const notificationId = id => 'tournament_provider_invitation:'+id;

function publicProvider(provider, viewer) {
  return { ...provider, viewer };
}
async function requireProviderAccess(client, user, providerId, capability, { lock = false } = {}) {
  const id = requirePositiveIntId(providerId,404,'Organization not found');
  const provider = await repo.findById(client,id,{lock});
  if (!provider) throw new HttpError(404,'Organization not found');
  // A role revoked while this request waited for the provider lock must be observed.
  user = user ? await access.hydrate(client,user) : null;
  if (user) access.assertActive(user);
  const membership = user ? await repo.activeMembership(client,id,user.id) : null;
  const permissions = providerPermissions(user,provider,membership);
  if (capability && !user) throw new HttpError(401,'You need to sign in');
  if (capability && !permissions[capability]) throw new HttpError(403,'Organization permission required');
  return { provider,membership,permissions,user };
}
function pageQuery(query = new URLSearchParams()) {
  const page = require('../resources/pages').options(query).page;
  const search = (query.get('q') || '').trim();
  const city = (query.get('city') || '').trim();
  if (search.length>120 || city.length>80 || search.includes('\0') || city.includes('\0')) throw new ValidationError('Invalid organization filter');
  return {page,search,city};
}
async function list({client,user,query}) {
  const mine = ['1','true'].includes(query?.get('mine'));
  if (mine && !user) throw new HttpError(401,'You need to sign in');
  const result = await repo.list(client,{...pageQuery(query),userId:mine?user.id:null});
  const memberships = new Map((user ? await repo.listMembershipsForUser(client,user.id) : []).map(m=>[m.providerId,m]));
  const {rows} = await client.query('SELECT DISTINCT city FROM tournaments.tournament_providers ORDER BY city');
  return {...result,providers:result.providers.map(p=>publicProvider(p,providerPermissions(user,p,memberships.get(p.id)))),
    cities:rows.map(r=>r.city),pagination:{...result.pagination,page:result.pagination.currentPage,pageSize:20}};
}
function invitationView(invitation) {
  return {...invitation,inviteeName:invitation.invitee?.name || '',invitedByName:invitation.invitedBy?.name || ''};
}
async function dashboard({client,user}) {
  const memberships = await repo.listMembershipsForUser(client,user.id);
  return {providers:memberships.map(m=>publicProvider(m.provider,providerPermissions(user,m.provider,m))),
    invitations:(await repo.listPendingInvitations(client,{inviteeUserId:user.id})).map(invitationView)};
}
async function profileData(client, provider, user) {
  const membership = user ? await repo.activeMembership(client,provider.id,user.id) : null;
  const viewer = providerPermissions(user,provider,membership);
  const members = await repo.listMemberships(client,provider.id);
  return {provider:publicProvider({...provider,memberCount:members.length},viewer),
    members:members.map(m=>({userId:m.userId,name:m.user?.name || '',avatarUrl:m.user?.avatarUrl || null,role:m.role,isOwner:m.isOwner})),
    invitations:viewer.canManageMembers ? (await repo.listPendingInvitations(client,{providerId:provider.id})).map(invitationView) : [],
    counts:await require('./tournament-provider-events').counts(client,provider.id,Boolean(viewer.isMember || isPlatformAdmin(user)))};
}
async function get({client,user,params}) {
  const provider = await repo.findBySlug(client,params.slug);
  if (!provider) throw new HttpError(404,'Organization not found');
  return profileData(client,provider,user);
}
async function record(client,user,provider,eventType,before,after,entityType='provider',entityId=provider.id) {
  await repo.audit(client,{providerId:provider.id,actorUserId:user.id,eventType,entityType,entityId,before,after});
}
async function uniqueWrite(action) {
  try { return await action(); }
  catch (error) {
    if (error.code==='23505') throw new HttpError(409,'Organization name, membership or invitation already exists');
    throw error;
  }
}
async function create({client,user,body}) {
  user = await access.hydrate(client,user); access.assertActive(user);
  if (!canCreateTournament(user)) throw new HttpError(403,'Tournament creation permission required');
  const input = normalizeProvider(body);
  await client.query("SELECT pg_advisory_xact_lock(hashtext('tournament_provider_slug_allocation'))");
  const slug = await uniqueSlug(input.name,async candidate=>candidate==='dashboard' || repo.isSlugTaken(client,candidate));
  const provider = await uniqueWrite(()=>repo.insert(client,{...input,slug,createdByUserId:user.id}));
  await record(client,user,provider,'provider_created',null,provider);
  return {status:201,body:await profileData(client,provider,user)};
}
async function update({client,user,params,body}) {
  const ctx = await requireProviderAccess(client,user,params.id,'canEdit',{lock:true});
  if (body.expectedUpdatedAt !== ctx.provider.updatedAt) throw new HttpError(409,'Organization changed. Reload before saving.');
  if (['ownerUserId','createdByUserId','slug','archivedAt','owner_user_id'].some(k=>Object.hasOwn(body,k))) throw new HttpError(403,'Use the dedicated organization action');
  const patch = normalizeProvider(body,{partial:true});
  const provider = await uniqueWrite(()=>repo.update(client,ctx.provider.id,patch));
  await record(client,ctx.user,provider,'provider_updated',ctx.provider,provider);
  return profileData(client,provider,ctx.user);
}
function role(value) {
  if (!['organizer','judge'].includes(value)) throw new ValidationError('Choose organizer or judge');
  return value;
}
async function invite({client,user,params,body}) {
  const ctx = await requireProviderAccess(client,user,params.id,'canManageMembers',{lock:true});
  if (ctx.provider.archivedAt) throw new HttpError(409,'Archived organizations cannot invite members');
  const userId = requirePositiveIntId(body.userId,400,'Choose a player');
  const target = await users.findById(client,userId);
  if (!target) throw new HttpError(404,'Player not found');
  if (await repo.activeMembership(client,ctx.provider.id,userId)) throw new HttpError(409,'Player is already a member');
  const invitation = await uniqueWrite(()=>repo.insertInvitation(client,{providerId:ctx.provider.id,inviteeUserId:userId,invitedByUserId:user.id,role:role(body.role)}));
  await record(client,ctx.user,ctx.provider,'invitation_created',null,invitation,'invitation',invitation.id);
  await notifications.publish(client,'tournaments',userId,{id:notificationId(invitation.id),type:'tournament_provider_invitation',
    sourceId:invitation.id,createdAt:invitation.createdAt,actor:{id:user.id,name:user.name},provider:{id:ctx.provider.id,slug:ctx.provider.slug,name:ctx.provider.name},
    href:'/tournament#/tournaments/organizations?invitation='+invitation.id});
  return {status:201,body:{invitation}};
}
async function respondInvitation({client,user,params,action}) {
  const id = requirePositiveIntId(params.id,404,'Invitation not found');
  let invitation = await repo.findInvitation(client,id);
  if (!invitation) throw new HttpError(404,'Invitation not found');
  const ctx = await requireProviderAccess(client,user,invitation.providerId,null,{lock:true});
  invitation = await repo.findInvitation(client,id);
  // Check recipient permission before revealing invitation status.
  if (action==='revoke') {
    if (!ctx.permissions.canManageMembers) throw new HttpError(403,'Organization permission required');
  } else if (invitation.inviteeUserId!==user.id) throw new HttpError(403,'Only the invited player can respond');
  if (invitation.status!=='pending') throw new HttpError(409,'Invitation is no longer pending');
  if (action==='accept') {
    if (ctx.provider.archivedAt) throw new HttpError(409,'Organization is archived');
    if (await repo.activeMembership(client,ctx.provider.id,user.id)) throw new HttpError(409,'Player is already a member');
    await repo.addMembership(client,ctx.provider.id,user.id,invitation.role);
  }
  const updated = await repo.setInvitationStatus(client,id,({accept:'accepted',decline:'declined',revoke:'revoked'})[action]);
  await notifications.retract(client,'tournaments',notificationId(id));
  await record(client,ctx.user,ctx.provider,'invitation_'+updated.status,invitation,updated,'invitation',id);
  return {invitation:updated,provider:publicProvider(ctx.provider,providerPermissions(ctx.user,ctx.provider,await repo.activeMembership(client,ctx.provider.id,user.id)))};
}
async function changeMember({client,user,params,body,action}) {
  const ctx = await requireProviderAccess(client,user,params.id,action==='leave'?null:'canManageMembers',{lock:true});
  const userId = action==='leave'?user.id:requirePositiveIntId(params.userId,404,'Member not found');
  const member = await repo.activeMembership(client,ctx.provider.id,userId);
  if (!member) throw new HttpError(404,'Member not found');
  if (userId===ctx.provider.ownerUserId) throw new ValidationError('Transfer the chief organizer role first');
  let updated;
  if (action==='role') updated=await repo.setMembershipRole(client,member.id,role(body.role));
  else updated=await repo.endMembership(client,member.id);
  await record(client,ctx.user,ctx.provider,action==='role'?'member_role_changed':action==='leave'?'member_left':'member_removed',member,updated,'membership',member.id);
  return profileData(client,ctx.provider,ctx.user);
}
async function transferOwner({client,user,params,body}) {
  const ctx = await requireProviderAccess(client,user,params.id,'canTransferOwnership',{lock:true});
  const id = requirePositiveIntId(body.userId,400,'Choose an organizer');
  const membership = await repo.activeMembership(client,ctx.provider.id,id);
  if (!membership || membership.role!=='organizer') throw new ValidationError('Choose an active organizer');
  const target=await access.hydrate(client,await users.findById(client,id));
  if (!target || (target.suspendedUntil && new Date(target.suspendedUntil).getTime()>Date.now())) {
    throw new ValidationError('Choose an active organizer whose account is not suspended');
  }
  const provider = await repo.update(client,ctx.provider.id,{ownerUserId:id});
  await record(client,ctx.user,provider,'provider_owner_changed',ctx.provider,provider);
  return profileData(client,provider,ctx.user);
}
async function archive({client,user,params,action}) {
  const restore = action==='restore';
  const ctx=await requireProviderAccess(client,user,params.id,restore?'canRestore':'canArchive',{lock:true});
  if (!restore) {
    const invitations = await repo.revokePendingInvitations(client,ctx.provider.id);
    for (const invitation of invitations) await notifications.retract(client,'tournaments',notificationId(invitation.id));
  }
  const provider=await repo.update(client,ctx.provider.id,{archivedAt:restore?null:new Date().toISOString()});
  await record(client,ctx.user,provider,restore?'provider_restored':'provider_archived',ctx.provider,provider);
  return profileData(client,provider,ctx.user);
}
async function logo({client,params,req,query}) {
  const id=requirePositiveIntId(params.id,404,'Logo not found');
  const data=await repo.getLogo(client,id);
  const {decodeDataUrl,contentVersion}=require('../domain/data-url');
  const file=decodeDataUrl(data);
  if (!file) throw new HttpError(404,'Logo not found');
  const version=contentVersion(data);
  const headers={ETag:'"'+version+'"','Cache-Control':query?.get('v')===version?'public, max-age=604800, immutable':'public, max-age=0, must-revalidate'};
  if (req?.headers?.['if-none-match']===headers.ETag) return {status:304,buffer:null,headers};
  return {buffer:file.bytes,contentType:file.contentType,headers};
}
async function events(ctx) {
  const access=await requireProviderAccess(ctx.client,ctx.user,ctx.params.id,null);
  return require('./tournament-provider-events').list({...ctx,user:access.user,provider:access.provider,canSeeDrafts:access.permissions.isMember || isPlatformAdmin(access.user)});
}
module.exports={requireProviderAccess,list,dashboard,get,create,update,invite,respondInvitation,changeMember,transferOwner,archive,logo,events};

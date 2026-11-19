const { toIso } = require('../rows');
const { avatarUrl } = require('../../domain/avatars');
const { providerLogoUrl } = require('../../domain/tournament-providers');
const { auditJson } = require('../../resources/audit');
const pages = require('../../resources/pages');

const PROVIDERS = 'tournaments.tournament_providers';
const MEMBERSHIPS = 'tournaments.tournament_provider_memberships';
const INVITATIONS = 'tournaments.tournament_provider_invitations';
const PROVIDER_COLUMNS = `p.id, p.slug, p.name, p.logo_version, p.city, p.description, p.created_by_user_id,
  p.owner_user_id, p.co_owner_user_id, p.archived_at, p.created_at,
  to_char(p.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at`;

function mapProvider(row) {
  if (!row) return null;
  const provider = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: providerLogoUrl(row.id, row.logo_version),
    city: row.city,
    description: row.description,
    createdByUserId: row.created_by_user_id,
    ownerUserId: row.owner_user_id,
    coOwnerUserId: row.co_owner_user_id ?? null,
    archivedAt: toIso(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: row.updated_at
  };
  if (row.member_count !== undefined) provider.memberCount = row.member_count;
  return provider;
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    providerId: row.provider_id,
    userId: row.user_id,
    role: row.role,
    joinedAt: toIso(row.joined_at),
    endedAt: toIso(row.ended_at)
  };
}

function mapInvitation(row) {
  if (!row) return null;
  const invitation = {
    id: row.id,
    providerId: row.provider_id,
    inviteeUserId: row.invitee_user_id,
    invitedByUserId: row.invited_by_user_id,
    role: row.role,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    respondedAt: toIso(row.responded_at),
    revokedAt: toIso(row.revoked_at)
  };
  if (row.provider_name !== undefined) {
    invitation.provider = { id: row.provider_id, slug: row.provider_slug, name: row.provider_name };
    invitation.invitee = row.invitee_name ? { id: row.invitee_user_id, name: row.invitee_name } : null;
    invitation.invitedBy = row.invited_by_name ? { id: row.invited_by_user_id, name: row.invited_by_name } : null;
  }
  return invitation;
}

async function findById(client, id, { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT ${PROVIDER_COLUMNS} FROM ${PROVIDERS} p WHERE p.id=$1${lock ? ' FOR UPDATE' : ''}`, [id]
  );
  return mapProvider(rows[0]);
}

async function findBySlug(client, slug) {
  const { rows } = await client.query(`SELECT ${PROVIDER_COLUMNS} FROM ${PROVIDERS} p WHERE p.slug=$1`, [slug]);
  return mapProvider(rows[0]);
}

async function isSlugTaken(client, slug) {
  const { rows } = await client.query(`SELECT 1 FROM ${PROVIDERS} WHERE slug=$1`, [slug]);
  return rows.length > 0;
}

async function getLogo(client, id) {
  const { rows } = await client.query(`SELECT logo_data FROM ${PROVIDERS} WHERE id=$1`, [id]);
  return rows[0]?.logo_data ?? null;
}

async function list(client, { search = '', city = '', userId = null, page = 1 } = {}) {
  const { rows, pagination } = await pages.select(client,
    `SELECT ${PROVIDER_COLUMNS},
      (SELECT count(*)::int FROM ${MEMBERSHIPS} m
       WHERE m.provider_id=p.id AND m.ended_at IS NULL AND m.user_id IS NOT NULL) AS member_count
     FROM ${PROVIDERS} p
     WHERE ($1='' OR strpos(p.name_key,$1)>0)
       AND ($2='' OR lower(p.city)=lower($2))
       AND ($3::int IS NULL OR EXISTS (
         SELECT 1 FROM ${MEMBERSHIPS} m WHERE m.provider_id=p.id AND m.user_id=$3 AND m.ended_at IS NULL
       ))
     ORDER BY (p.archived_at IS NOT NULL), p.name_key, p.id`,
    [search.toLocaleLowerCase('en-US'), city, userId], new URLSearchParams({ page: String(page) })
  );
  return { providers: rows.map(mapProvider), pagination };
}

// One SQL statement gives pool clients the same creation guarantee as callers in a transaction.
async function insert(client, provider) {
  const { rows } = await client.query(
    `WITH provider AS (
       INSERT INTO ${PROVIDERS} AS p (slug,name,name_key,city,description,logo_data,created_by_user_id,owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING ${PROVIDER_COLUMNS}
     ), membership AS (
       INSERT INTO ${MEMBERSHIPS} (provider_id,user_id,role)
       SELECT id, owner_user_id, 'organizer' FROM provider RETURNING provider_id
     )
     SELECT provider.* FROM provider JOIN membership ON membership.provider_id=provider.id`,
    [provider.slug, provider.name, provider.nameKey, provider.city, provider.description ?? '', provider.logoData, provider.createdByUserId]
  );
  return mapProvider(rows[0]);
}

async function update(client, id, patch) {
  const fields = {
    name: 'name', nameKey: 'name_key', city: 'city', description: 'description',
    logoData: 'logo_data', ownerUserId: 'owner_user_id', coOwnerUserId: 'co_owner_user_id', archivedAt: 'archived_at'
  };
  const values = [id];
  const assignments = [];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.hasOwn(patch, field)) continue;
    values.push(patch[field]);
    assignments.push(`${column}=$${values.length}`);
  }
  if (!assignments.length) return findById(client, id);
  const { rows } = await client.query(
    `UPDATE ${PROVIDERS} AS p SET ${assignments.join(', ')}, updated_at=clock_timestamp()
     WHERE p.id=$1 RETURNING ${PROVIDER_COLUMNS}`,
    values
  );
  return mapProvider(rows[0]);
}

// All changes to existing provider memberships and invitations require a provider row lock in the caller.
async function activeMembership(client, providerId, userId) {
  const { rows } = await client.query(
    `SELECT id,provider_id,user_id,role,joined_at,ended_at FROM ${MEMBERSHIPS}
     WHERE provider_id=$1 AND user_id=$2 AND ended_at IS NULL`, [providerId, userId]
  );
  return mapMembership(rows[0]);
}

async function listMemberships(client, providerId) {
  const { rows } = await client.query(
    `SELECT m.id,m.provider_id,m.user_id,m.role,m.joined_at,m.ended_at,
       (m.user_id=p.owner_user_id OR m.user_id IS NOT DISTINCT FROM p.co_owner_user_id) AS is_owner,u.name AS user_name,u.avatar_version
     FROM ${MEMBERSHIPS} m
     JOIN ${PROVIDERS} p ON p.id=m.provider_id
     JOIN accounts.users u ON u.id=m.user_id
     WHERE m.provider_id=$1 AND m.ended_at IS NULL
     ORDER BY is_owner DESC, m.role, m.joined_at, m.id`,
    [providerId]
  );
  return rows.map(row => ({
    ...mapMembership(row),
    isOwner: row.is_owner,
    user: { id: row.user_id, name: row.user_name, avatarUrl: avatarUrl(row.user_id, row.avatar_version) }
  }));
}

async function listMembershipsForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${PROVIDER_COLUMNS}, m.id AS membership_id, m.provider_id, m.user_id, m.role, m.joined_at, m.ended_at
     FROM ${MEMBERSHIPS} m JOIN ${PROVIDERS} p ON p.id=m.provider_id
     WHERE m.user_id=$1 AND m.ended_at IS NULL
     ORDER BY (p.archived_at IS NOT NULL), p.name_key, p.id`, [userId]
  );
  return rows.map(row => ({
    ...mapMembership({ ...row, id: row.membership_id }),
    isOwner: row.owner_user_id === userId || row.co_owner_user_id === userId,
    provider: mapProvider(row)
  }));
}

async function addMembership(client, providerId, userId, role) {
  const { rows } = await client.query(
    `INSERT INTO ${MEMBERSHIPS} (provider_id,user_id,role) VALUES ($1,$2,$3) RETURNING *`,
    [providerId, userId, role]
  );
  return mapMembership(rows[0]);
}

async function setMembershipRole(client, id, role) {
  const { rows } = await client.query(
    `UPDATE ${MEMBERSHIPS} SET role=$2 WHERE id=$1 AND ended_at IS NULL RETURNING *`, [id, role]
  );
  return mapMembership(rows[0]);
}

async function endMembership(client, id) {
  const { rows } = await client.query(
    `UPDATE ${MEMBERSHIPS} SET ended_at=clock_timestamp() WHERE id=$1 AND ended_at IS NULL RETURNING *`, [id]
  );
  return mapMembership(rows[0]);
}

async function insertInvitation(client, invitation) {
  const { rows } = await client.query(
    `INSERT INTO ${INVITATIONS} (provider_id,invitee_user_id,invited_by_user_id,role)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [invitation.providerId, invitation.inviteeUserId, invitation.invitedByUserId, invitation.role]
  );
  return mapInvitation(rows[0]);
}

async function findInvitation(client, id) {
  const { rows } = await client.query(`SELECT * FROM ${INVITATIONS} WHERE id=$1`, [id]);
  return mapInvitation(rows[0]);
}

async function pendingInvitation(client, providerId, userId) {
  const { rows } = await client.query(
    `SELECT * FROM ${INVITATIONS} WHERE provider_id=$1 AND invitee_user_id=$2 AND status='pending'`,
    [providerId, userId]
  );
  return mapInvitation(rows[0]);
}

async function listPendingInvitations(client, { providerId = null, inviteeUserId = null } = {}) {
  if (providerId == null && inviteeUserId == null) return [];
  const { rows } = await client.query(
    `SELECT i.*, p.slug AS provider_slug, p.name AS provider_name, u.name AS invitee_name, sender.name AS invited_by_name
     FROM ${INVITATIONS} i
     JOIN ${PROVIDERS} p ON p.id=i.provider_id
     JOIN accounts.users u ON u.id=i.invitee_user_id
     LEFT JOIN accounts.users sender ON sender.id=i.invited_by_user_id
     WHERE i.status='pending' AND ($1::int IS NULL OR i.provider_id=$1) AND ($2::int IS NULL OR i.invitee_user_id=$2)
     ORDER BY i.created_at DESC,i.id DESC`,
    [providerId, inviteeUserId]
  );
  return rows.map(mapInvitation);
}

async function setInvitationStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE ${INVITATIONS} SET status=$2, updated_at=clock_timestamp(),
       responded_at=CASE WHEN $2 IN ('accepted','declined') THEN clock_timestamp() ELSE responded_at END,
       revoked_at=CASE WHEN $2='revoked' THEN clock_timestamp() ELSE revoked_at END
     WHERE id=$1 AND status='pending' RETURNING *`,
    [id, status]
  );
  return mapInvitation(rows[0]);
}

async function revokePendingInvitations(client, providerId) {
  const { rows } = await client.query(
    `UPDATE ${INVITATIONS} SET status='revoked', revoked_at=clock_timestamp(), updated_at=clock_timestamp()
     WHERE provider_id=$1 AND status='pending' RETURNING *`,
    [providerId]
  );
  return rows.map(mapInvitation);
}

async function audit(client, event) {
  await client.query(
    `INSERT INTO tournaments.tournament_provider_audit_events
       (provider_id,actor_user_id,event_type,entity_type,entity_id,before,after)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [event.providerId, event.actorUserId ?? null, event.eventType, event.entityType ?? null,
      event.entityId ?? null, auditJson(event.before), auditJson(event.after)]
  );
}

module.exports = {
  findById, findBySlug, isSlugTaken, getLogo, list, insert, update,
  activeMembership, listMemberships, listMembershipsForUser, addMembership, setMembershipRole, endMembership,
  insertInvitation, findInvitation, pendingInvitation, listPendingInvitations, setInvitationStatus, revokePendingInvitations,
  audit
};

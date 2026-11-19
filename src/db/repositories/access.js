const { HttpError, ValidationError } = require("../../http/io");
const permissions = require("../../domain/access");

async function ownerId(client) {
  const { rows } = await client.query("SELECT owner_user_id FROM platform_ownership WHERE singleton");
  return rows[0]?.owner_user_id || null;
}

async function hydrate(client, user) {
  if (!user) return null;
  const tournamentAccess = ['monolith','tournaments'].includes(process.env.SERVICE_NAME || 'monolith');
  // The accounts role cannot read tournaments tables. Read all tournament grants in
  // one statement so role changes, scoped IDs and picker options share a snapshot.
  const tournamentGrants = tournamentAccess ? `LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT id ORDER BY id) FILTER (WHERE manage) AS managed,
      array_agg(DISTINCT id ORDER BY id) FILTER (WHERE organize) AS organized,
      array_agg(DISTINCT id ORDER BY id) FILTER (WHERE assign_judges) AS judge_management
    FROM (
      SELECT t.id,TRUE AS manage,TRUE AS organize,TRUE AS assign_judges
      FROM tournaments t WHERE t.owner_user_id=u.id AND t.provider_id IS NULL
      UNION ALL
      SELECT j.tournament_id,TRUE,FALSE,FALSE FROM tournament_judges j
      WHERE j.user_id=u.id AND j.revoked_at IS NULL AND (j.expires_at IS NULL OR j.expires_at>NOW())
      UNION ALL
      SELECT t.id,TRUE,m.role='organizer',(p.owner_user_id=u.id OR p.co_owner_user_id IS NOT DISTINCT FROM u.id)
      FROM tournament_provider_memberships m JOIN tournament_providers p ON p.id=m.provider_id
      JOIN tournaments t ON t.provider_id=p.id WHERE m.user_id=u.id AND m.ended_at IS NULL
      UNION ALL
      SELECT t.id,FALSE,FALSE,TRUE FROM tournaments t WHERE u.is_admin AND t.provider_id IS NOT NULL
    ) effective_grants
  ) grants ON TRUE` : '';
  const tournamentFields = tournamentAccess ? `grants.managed,grants.organized,grants.judge_management,
    (SELECT jsonb_agg(jsonb_build_object('providerId',p.id,'role',m.role,'isOwner',(p.owner_user_id=u.id OR p.co_owner_user_id IS NOT DISTINCT FROM u.id),
      'name',p.name,'slug',p.slug,'archivedAt',p.archived_at) ORDER BY p.name,p.id)
      FROM tournament_provider_memberships m JOIN tournament_providers p ON p.id=m.provider_id
      WHERE m.user_id=u.id AND m.ended_at IS NULL) AS provider_memberships` : 'NULL AS managed';
  const { rows: [row] } = await client.query(`SELECT u.is_admin, u.can_create_tournaments, u.is_faq_moderator,
    u.suspended_until, u.suspension_reason,
    EXISTS (SELECT 1 FROM platform_ownership p WHERE p.owner_user_id=u.id) AS is_super_admin,
    ${tournamentFields} FROM users u ${tournamentGrants} WHERE u.id=$1`, [user.id]);
  if (!row) return null;
  const result = { ...user, isSuperAdmin: row.is_super_admin,
    isAdmin: row.is_admin || row.is_super_admin,
    canCreateTournaments: row.can_create_tournaments,
    isFAQModerator: row.is_faq_moderator,
    suspendedUntil: row.suspended_until?.toISOString() || null,
    suspensionReason: row.suspension_reason,
    managedTournamentIds: row.managed || [],
    organizedTournamentIds: row.organized || [],
    judgeManagementTournamentIds: row.judge_management || [],
    providerMemberships: row.provider_memberships || [] };
  return { ...result, capabilities: permissions.userCapabilities(result) };
}

function assertActive(user) {
  if (user?.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()) {
    throw new HttpError(403, "Account is temporarily suspended");
  }
}

async function audit(client, user, eventType, entityType, entityId, before, after, reason = "") {
  await client.query(`INSERT INTO administrative_audit_events
    (actor_user_id,actor_name,event_type,entity_type,entity_id,before,after,reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
  [user?.id || null, user?.name || "Local setup", eventType, entityType, entityId || null,
    require('../../resources/audit').auditJson(before), require('../../resources/audit').auditJson(after), String(reason).slice(0, 1000)]);
}

async function assertTarget(client, actor, target, { ownerOnly = false } = {}) {
  if (!actor?.isAdmin && !actor?.isSuperAdmin) throw new HttpError(403, "Administrator rights required");
  const owner = await ownerId(client);
  if (target.id === owner && actor.id !== owner) throw new HttpError(403, "The platform owner is protected");
  if (ownerOnly && actor.id !== owner) throw new HttpError(403, "Super administrator rights required");
  if (target.isAdmin && actor.id !== owner) throw new HttpError(403, "Only the owner can manage administrators");
  return owner;
}

async function initializeOwner(client, userId) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new ValidationError("Choose an existing account ID");
  await client.query("SELECT pg_advisory_xact_lock(847362952)");
  const current = await ownerId(client);
  if (current && current !== userId) throw new HttpError(409, "A platform owner already exists");
  const { rowCount } = await client.query("UPDATE users SET is_admin=TRUE WHERE id=$1", [userId]);
  if (!rowCount) throw new HttpError(404, "User not found");
  await client.query("INSERT INTO platform_ownership(owner_user_id) VALUES ($1) ON CONFLICT (singleton) DO NOTHING", [userId]);
  if (!current) await audit(client, null, "platform_owner_initialized", "user", userId, null, { userId });
}

module.exports = { ownerId, hydrate, assertActive, audit, assertTarget, initializeOwner };

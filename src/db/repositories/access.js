const { HttpError, ValidationError } = require("../../http/io");
const permissions = require("../../domain/access");

async function ownerId(client) {
  const { rows } = await client.query("SELECT owner_user_id FROM platform_ownership WHERE singleton");
  return rows[0]?.owner_user_id || null;
}

async function hydrate(client, user) {
  if (!user) return null;
  const { rows: [row] } = await client.query(`SELECT u.is_admin, u.can_create_tournaments, u.is_faq_moderator,
    u.suspended_until, u.suspension_reason,
    EXISTS (SELECT 1 FROM platform_ownership p WHERE p.owner_user_id=u.id) AS is_super_admin,
    ARRAY(SELECT id FROM tournaments WHERE owner_user_id=u.id
      UNION SELECT tournament_id FROM tournament_judges WHERE user_id=u.id AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())) AS managed_tournament_ids
    FROM users u WHERE u.id=$1`, [user.id]);
  if (!row) return null;
  const result = { ...user, isSuperAdmin: row.is_super_admin,
    isAdmin: row.is_admin || row.is_super_admin,
    canCreateTournaments: row.can_create_tournaments,
    isFAQModerator: row.is_faq_moderator,
    suspendedUntil: row.suspended_until?.toISOString() || null,
    suspensionReason: row.suspension_reason,
    managedTournamentIds: row.managed_tournament_ids };
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
    before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, String(reason).slice(0, 1000)]);
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

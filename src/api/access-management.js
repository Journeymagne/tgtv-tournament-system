const { HttpError, ValidationError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const tournaments = require("../db/repositories/tournaments");
const users = require("../db/repositories/users");
const access = require("../db/repositories/access");
const tournamentAudit = require("../db/repositories/tournament-audit-events");
const { canManageTournament, canManageJudges } = require("../domain/access");

async function context(client, user, params, write = false) {
  const id = requirePositiveIntId(params.id, 404, "Tournament not found");
  const tournament = write ? await tournaments.lockById(client, id) : await tournaments.findById(client, id);
  if (!tournament) throw new HttpError(404, "Tournament not found");
  user = await access.hydrate(client, user);
  if (!(write ? canManageJudges(user, tournament) : canManageTournament(user, tournament))) {
    throw new HttpError(403, "Only the organizer or super administrator can manage judges");
  }
  return { tournament, user };
}

async function staff({ client, user, params }) {
  const contextValue = await context(client, user, params);
  const { tournament } = contextValue;
  user = contextValue.user;
  const { rows } = await client.query(`SELECT u.id, u.name, u.is_admin,
    EXISTS (SELECT 1 FROM platform_ownership p WHERE p.owner_user_id=u.id) AS is_super_admin,
    j.granted_by, g.name AS granted_by_name, j.expires_at, j.revoked_at,
    (j.user_id IS NOT NULL AND j.revoked_at IS NULL AND (j.expires_at IS NULL OR j.expires_at > NOW())) AS assigned
    FROM users u LEFT JOIN tournament_judges j ON j.user_id=u.id AND j.tournament_id=$1
    LEFT JOIN users g ON g.id=j.granted_by
    WHERE u.is_admin OR u.id=$2 OR j.user_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM platform_ownership p WHERE p.owner_user_id=u.id)
    ORDER BY (u.id=$2) DESC, u.name`, [tournament.id, tournament.ownerUserId]);
  return { ownerUserId: tournament.ownerUserId, canManageJudges: canManageJudges(user, tournament),
    staff: rows.map(row => ({ userId: row.id, name: row.name,
      role: row.id === tournament.ownerUserId ? "organizer" : row.is_super_admin ? "super_admin" : "judge",
      automatic: row.is_admin || row.is_super_admin,
      assigned: row.assigned, active: row.id === tournament.ownerUserId || row.is_admin || row.is_super_admin || row.assigned,
      grantedByName: row.granted_by_name, expiresAt: row.expires_at?.toISOString() || null,
      canRevoke: canManageJudges(user, tournament) && row.assigned && row.id !== tournament.ownerUserId })) };
}

async function assignJudge({ client, user, params, body }) {
  const ctx = await context(client, user, params, true);
  const id = requirePositiveIntId(body.userId, 400, "Choose a user");
  if (!await users.findById(client, id)) throw new HttpError(404, "User not found");
  if (id === ctx.tournament.ownerUserId) throw new ValidationError("The organizer already has full tournament access");
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
    throw new ValidationError("Expiry must be a future date");
  }
  await client.query(`INSERT INTO tournament_judges (tournament_id,user_id,granted_by,expires_at)
    VALUES ($1,$2,$3,$4) ON CONFLICT(tournament_id,user_id) DO UPDATE SET
      granted_by=$3,granted_at=NOW(),expires_at=$4,revoked_at=NULL`, [ctx.tournament.id,id,user.id,expiresAt]);
  await tournamentAudit.insert(client, { tournamentId: ctx.tournament.id, actorUserId: user.id,
    eventType: "judge_assigned", entityType: "user", entityId: id, after: { userId: id, expiresAt } });
  return staff({ client, user, params });
}

async function revokeJudge({ client, user, params }) {
  const ctx = await context(client, user, params, true);
  const id = requirePositiveIntId(params.userId, 400, "Choose a user");
  if (id === ctx.tournament.ownerUserId) throw new ValidationError("The organizer cannot be removed");
  const { rowCount } = await client.query(`UPDATE tournament_judges SET revoked_at=NOW()
    WHERE tournament_id=$1 AND user_id=$2 AND revoked_at IS NULL`, [ctx.tournament.id,id]);
  if (!rowCount) throw new HttpError(409, "No explicit judge assignment exists; platform access cannot be revoked here");
  await tournamentAudit.insert(client, { tournamentId: ctx.tournament.id, actorUserId: user.id,
    eventType: "judge_revoked", entityType: "user", entityId: id, after: { revoked: true } });
  return staff({ client, user, params });
}

async function setPermissions({ client, user, params, body }) {
  const target = await users.findById(client, requirePositiveIntId(params.id, 404, "User not found"));
  if (!target) throw new HttpError(404, "User not found");
  const owner = await access.assertTarget(client, user, target, { ownerOnly: true });
  if (body.isAdmin !== undefined && typeof body.isAdmin !== "boolean") throw new ValidationError("Invalid administrator value");
  if (body.canCreateTournaments !== undefined && typeof body.canCreateTournaments !== "boolean") throw new ValidationError("Invalid permission value");
  if (target.id === owner && body.isAdmin === false) throw new ValidationError("The platform owner cannot be demoted");
  const before = await access.hydrate(client, target);
  await client.query(`UPDATE users SET is_admin=COALESCE($2,is_admin),
    can_create_tournaments=COALESCE($3,can_create_tournaments),updated_at=NOW() WHERE id=$1`,
  [target.id, body.isAdmin ?? null, body.canCreateTournaments ?? null]);
  const after = await access.hydrate(client, target);
  await access.audit(client,user,"user_permissions_changed","user",target.id,
    { isAdmin: before.isAdmin, canCreateTournaments: before.canCreateTournaments },
    { isAdmin: after.isAdmin, canCreateTournaments: after.canCreateTournaments },body.reason);
  return { ok: true };
}

async function suspendUser({ client, user, params, body }) {
  const target = await users.findById(client, requirePositiveIntId(params.id, 404, "User not found"));
  if (!target) throw new HttpError(404, "User not found");
  await access.assertTarget(client, user, target);
  if (target.id === user.id) throw new ValidationError("You cannot suspend yourself");
  const until = body.until ? new Date(body.until) : null;
  const reason = String(body.reason || "").trim().slice(0,1000);
  if (until && (!Number.isFinite(until.getTime()) || until.getTime() <= Date.now() || !reason)) throw new ValidationError("Choose a future date and provide a reason");
  await client.query("UPDATE users SET suspended_until=$2,suspension_reason=$3 WHERE id=$1",[target.id,until,reason]);
  if (until) await require("../db/repositories/sessions").deleteByUserId(client,target.id);
  await access.audit(client,user,until ? "user_suspended" : "user_restored","user",target.id,null,{until},reason);
  return { ok: true };
}

async function auditLog({ client, user }) {
  if (!user?.isAdmin) throw new HttpError(403,"Administrator rights required");
  const { rows } = await client.query("SELECT * FROM administrative_audit_events ORDER BY id DESC LIMIT 100");
  return { events: rows };
}

async function transferOwner({ client, user, params, body }) {
  if (!user?.isSuperAdmin) throw new HttpError(403, "Super administrator rights required");
  const { tournament } = await context(client, user, params, true);
  const id = requirePositiveIntId(body.userId, 400, "Choose an organizer");
  const reason = String(body.reason || "").trim().slice(0,1000);
  if (!reason) throw new ValidationError("Provide a reason for transferring ownership");
  if (!await users.findById(client,id)) throw new HttpError(404,"User not found");
  await tournaments.update(client,tournament.id,{ownerUserId:id});
  await tournamentAudit.insert(client,{tournamentId:tournament.id,actorUserId:user.id,
    eventType:"organizer_changed",entityType:"tournament",entityId:tournament.id,
    before:{ownerUserId:tournament.ownerUserId},after:{ownerUserId:id},metadata:{reason}});
  await access.audit(client,user,"organizer_changed","tournament",tournament.id,
    {ownerUserId:tournament.ownerUserId},{ownerUserId:id},reason);
  return {ok:true};
}

module.exports = { staff, assignJudge, revokeJudge, setPermissions, suspendUser, auditLog, transferOwner };

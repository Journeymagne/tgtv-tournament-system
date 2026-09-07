const { toIso } = require("../rows");

function mapTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameKey: row.name_key,
    description: row.description || "",
    logoData: row.logo_data || null,
    leaderUserId: row.leader_user_id,
    ratings: { tts: Number(row.rating_tts ?? 1000), irl: Number(row.rating_irl ?? 1000) },
    archivedAt: toIso(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    memberCount: row.member_count === undefined ? undefined : Number(row.member_count || 0)
  };
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    displayNameSnapshot: row.display_name_snapshot,
    role: row.role,
    joinedAt: toIso(row.joined_at),
    endedAt: toIso(row.ended_at),
    endReason: row.end_reason || null,
    endedByUserId: row.ended_by_user_id,
    user: row.user_id
      ? { id: row.user_id, name: row.user_name || row.display_name_snapshot, avatarData: row.avatar_data || null }
      : null
  };
}

function mapInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    inviteeUserId: row.invitee_user_id,
    invitedByUserId: row.invited_by_user_id,
    status: row.status,
    createdAt: toIso(row.created_at),
    respondedAt: toIso(row.responded_at),
    revokedAt: toIso(row.revoked_at),
    team: row.team_name ? { id: row.team_id, slug: row.team_slug, name: row.team_name } : null,
    invitee: row.invitee_name ? { id: row.invitee_user_id, name: row.invitee_name } : null,
    invitedBy: row.invited_by_name ? { id: row.invited_by_user_id, name: row.invited_by_name } : null
  };
}

async function isSlugTaken(client, slug) {
  const { rows } = await client.query("SELECT 1 FROM player_teams WHERE slug = $1 LIMIT 1", [slug]);
  return rows.length > 0;
}

async function insert(client, team) {
  const { rows } = await client.query(
    `INSERT INTO player_teams (slug, name, name_key, description, logo_data, leader_user_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [team.slug, team.name, team.nameKey, team.description || "", team.logoData || null, team.leaderUserId]
  );
  return mapTeam(rows[0]);
}

async function findById(client, id, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT * FROM player_teams WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [id]
  );
  return mapTeam(rows[0]);
}

async function findBySlug(client, slug) {
  const { rows } = await client.query("SELECT * FROM player_teams WHERE slug = $1", [slug]);
  return mapTeam(rows[0]);
}

async function listPublic(client, search = "") {
  const value = String(search || "").trim();
  const { rows } = await client.query(
    `SELECT pt.*, COUNT(ptm.id) FILTER (WHERE ptm.ended_at IS NULL)::int AS member_count
     FROM player_teams pt
     LEFT JOIN player_team_memberships ptm ON ptm.team_id = pt.id
     WHERE ($1 = '' OR pt.name ILIKE '%' || $1 || '%')
     GROUP BY pt.id
     ORDER BY (pt.archived_at IS NOT NULL), pt.name_key, pt.id
     LIMIT 200`,
    [value]
  );
  return rows.map(mapTeam);
}

async function listForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT pt.*, COUNT(all_members.id) FILTER (WHERE all_members.ended_at IS NULL)::int AS member_count
     FROM player_team_memberships mine
     JOIN player_teams pt ON pt.id = mine.team_id
     LEFT JOIN player_team_memberships all_members ON all_members.team_id = pt.id
     WHERE mine.user_id = $1 AND mine.ended_at IS NULL
     GROUP BY pt.id, mine.joined_at
     ORDER BY mine.joined_at, pt.id`,
    [userId]
  );
  return rows.map(mapTeam);
}

async function listAdministration(client) {
  const { rows } = await client.query(
    `SELECT pt.*, leader.name AS leader_name,
            (SELECT COUNT(*)::int FROM player_team_memberships m
             WHERE m.team_id = pt.id AND m.ended_at IS NULL) AS member_count
     FROM player_teams pt
     LEFT JOIN users leader ON leader.id = pt.leader_user_id
     ORDER BY (pt.archived_at IS NOT NULL), pt.name_key, pt.id`
  );
  return rows.map((row) => ({ ...mapTeam(row), leaderName: row.leader_name || null }));
}

async function listLeaderboard(client, venueMode = "combined") {
  const mode = ["tts", "irl"].includes(venueMode) ? venueMode : "combined";
  // Count the initial 1000 points once, then add gains/losses from both venues.
  const rating = mode === "combined" ? "pt.rating_tts + pt.rating_irl - 1000" : `pt.rating_${mode}`;
  const { rows } = await client.query(
    `SELECT pt.*, ${rating} AS selected_rating,
            (SELECT COUNT(*)::int FROM player_team_memberships m
             WHERE m.team_id = pt.id AND m.ended_at IS NULL) AS member_count
     FROM player_teams pt
     ORDER BY selected_rating DESC, pt.name_key, pt.id`
  );
  return rows.map((row) => ({ ...mapTeam(row), rating: Number(row.selected_rating), venueMode: mode }));
}

async function listMemberships(client, teamId) {
  const { rows } = await client.query(
    `SELECT m.*, u.name AS user_name, u.avatar_data
     FROM player_team_memberships m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY (m.ended_at IS NOT NULL), CASE WHEN m.role = 'leader' THEN 0 ELSE 1 END,
              m.joined_at, m.id`,
    [teamId]
  );
  return rows.map(mapMembership);
}

async function activeMembership(client, teamId, userId, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT m.*, u.name AS user_name, u.avatar_data
     FROM player_team_memberships m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1 AND m.user_id = $2 AND m.ended_at IS NULL
     ORDER BY m.id DESC LIMIT 1${forUpdate ? " FOR UPDATE OF m" : ""}`,
    [teamId, userId]
  );
  return mapMembership(rows[0]);
}

async function membershipById(client, id, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT m.*, u.name AS user_name, u.avatar_data
     FROM player_team_memberships m
     LEFT JOIN users u ON u.id = m.user_id
     WHERE m.id = $1${forUpdate ? " FOR UPDATE OF m" : ""}`,
    [id]
  );
  return mapMembership(rows[0]);
}

async function addMembership(client, teamId, user, role = "member") {
  const { rows } = await client.query(
    `INSERT INTO player_team_memberships (team_id, user_id, display_name_snapshot, role)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [teamId, user.id, user.name, role]
  );
  return mapMembership(rows[0]);
}

async function endMembership(client, id, reason, actorUserId) {
  const { rows } = await client.query(
    `UPDATE player_team_memberships
     SET ended_at = NOW(), end_reason = $2, ended_by_user_id = $3, updated_at = NOW()
     WHERE id = $1 AND ended_at IS NULL RETURNING *`,
    [id, reason, actorUserId || null]
  );
  return mapMembership(rows[0]);
}

async function setMembershipRole(client, id, role) {
  const { rows } = await client.query(
    `UPDATE player_team_memberships SET role = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id, role]
  );
  return mapMembership(rows[0]);
}

async function update(client, id, patch) {
  const fields = { name: "name", nameKey: "name_key", description: "description", logoData: "logo_data", leaderUserId: "leader_user_id", archivedAt: "archived_at" };
  const values = [id];
  const assignments = [];
  for (const [field, column] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(patch[field] === undefined ? null : patch[field]);
    assignments.push(`${column} = $${values.length}`);
  }
  if (!assignments.length) return findById(client, id);
  const { rows } = await client.query(
    `UPDATE player_teams SET ${assignments.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return mapTeam(rows[0]);
}

async function insertInvitation(client, invitation) {
  const { rows } = await client.query(
    `INSERT INTO player_team_invitations (team_id, invitee_user_id, invited_by_user_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [invitation.teamId, invitation.inviteeUserId, invitation.invitedByUserId]
  );
  return mapInvitation(rows[0]);
}

async function invitationById(client, id, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT i.*, pt.name AS team_name, pt.slug AS team_slug,
            invitee.name AS invitee_name, inviter.name AS invited_by_name
     FROM player_team_invitations i
     JOIN player_teams pt ON pt.id = i.team_id
     JOIN users invitee ON invitee.id = i.invitee_user_id
     LEFT JOIN users inviter ON inviter.id = i.invited_by_user_id
     WHERE i.id = $1${forUpdate ? " FOR UPDATE OF i" : ""}`,
    [id]
  );
  return mapInvitation(rows[0]);
}

async function listInvitationsForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT i.*, pt.name AS team_name, pt.slug AS team_slug,
            invitee.name AS invitee_name, inviter.name AS invited_by_name
     FROM player_team_invitations i
     JOIN player_teams pt ON pt.id = i.team_id
     JOIN users invitee ON invitee.id = i.invitee_user_id
     LEFT JOIN users inviter ON inviter.id = i.invited_by_user_id
     WHERE (i.invitee_user_id = $1 OR i.invited_by_user_id = $1)
       AND i.status = 'pending'
       AND pt.archived_at IS NULL
     ORDER BY i.created_at DESC, i.id DESC`,
    [userId]
  );
  return rows.map(mapInvitation);
}

async function updateInvitationStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE player_team_invitations
     SET status = $2,
         responded_at = CASE WHEN $2 IN ('accepted','declined') THEN NOW() ELSE responded_at END,
         revoked_at = CASE WHEN $2 = 'revoked' THEN NOW() ELSE revoked_at END,
         updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return mapInvitation(rows[0]);
}

async function hasLockedActiveRoster(client, teamId, userId = null) {
  const { rows } = await client.query(
    `SELECT 1
     FROM tournament_team_rosters r
     JOIN tournaments t ON t.id = r.tournament_id
     JOIN tournament_team_roster_members rm ON rm.roster_id = r.id AND rm.ended_at IS NULL
     WHERE r.team_id = $1 AND t.status = 'in_progress' AND r.status = 'active'
       AND ($2::int IS NULL OR rm.user_id = $2)
     LIMIT 1`,
    [teamId, userId]
  );
  return rows.length > 0;
}

async function hasUnfinishedRoster(client, teamId) {
  const { rows } = await client.query(
    `SELECT 1
     FROM tournament_team_rosters r
     JOIN tournaments t ON t.id = r.tournament_id
     WHERE r.team_id = $1
       AND r.status NOT IN ('withdrawn', 'finished')
       AND t.status IN ('draft', 'registration_open', 'registration_closed', 'in_progress')
     LIMIT 1`,
    [teamId]
  );
  return rows.length > 0;
}

async function resetRatings(client) {
  await client.query("UPDATE player_teams SET rating_tts = 1000, rating_irl = 1000");
}

async function setRating(client, teamId, venue, rating) {
  const column = venue === "irl" ? "rating_irl" : "rating_tts";
  const { rows } = await client.query(
    `UPDATE player_teams SET ${column} = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [teamId, rating]
  );
  return mapTeam(rows[0]);
}

async function audit(client, event) {
  await client.query(
    `INSERT INTO player_team_audit_events
       (team_id, tournament_id, actor_user_id, event_type, entity_type, entity_id, before, after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [event.teamId || null, event.tournamentId || null, event.actorUserId || null, event.eventType,
      event.entityType || null, event.entityId || null, JSON.stringify(event.before || null),
      JSON.stringify(event.after || null), JSON.stringify(event.metadata || null)]
  );
}

module.exports = {
  mapTeam,
  mapMembership,
  mapInvitation,
  isSlugTaken,
  insert,
  findById,
  findBySlug,
  listPublic,
  listForUser,
  listAdministration,
  listLeaderboard,
  listMemberships,
  activeMembership,
  membershipById,
  addMembership,
  endMembership,
  setMembershipRole,
  update,
  insertInvitation,
  invitationById,
  listInvitationsForUser,
  updateInvitationStatus,
  hasLockedActiveRoster,
  hasUnfinishedRoster,
  resetRatings,
  setRating,
  audit
};

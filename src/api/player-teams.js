const { HttpError, ValidationError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const usersRepo = require("../db/repositories/users");
const teamsRepo = require("../db/repositories/player-teams");
const rostersRepo = require("../db/repositories/team-rosters");
const { uniqueSlug } = require("../domain/tournaments/slug");
const {
  normalizeTeamName,
  teamNameKey,
  normalizeTeamDescription,
  normalizeTeamLogo
} = require("../domain/player-teams");

function teamView(team) {
  if (!team) return null;
  const { nameKey, ...view } = team;
  return view;
}

async function requireTeam(client, id, forUpdate = false) {
  const teamId = requirePositiveIntId(id, 404, "Team not found");
  const team = await teamsRepo.findById(client, teamId, forUpdate);
  if (!team) throw new HttpError(404, "Team not found");
  return team;
}

async function requireMembership(client, team, user, { leader = false } = {}) {
  const membership = await teamsRepo.activeMembership(client, team.id, user.id);
  if (!membership && !user.isAdmin) throw new HttpError(403, "Active team membership required");
  if (leader && !user.isAdmin && membership?.role !== "leader") {
    throw new HttpError(403, "Team leader rights required");
  }
  return membership;
}

async function create({ client, user, body }) {
  const name = normalizeTeamName(body.name);
  const slug = await uniqueSlug(body.slug || name, (candidate) => teamsRepo.isSlugTaken(client, candidate));
  let team;
  try {
    team = await teamsRepo.insert(client, {
      slug,
      name,
      nameKey: teamNameKey(name),
      description: normalizeTeamDescription(body.description),
      logoData: normalizeTeamLogo(body.logoData),
      leaderUserId: user.id
    });
    const membership = await teamsRepo.addMembership(client, team.id, user, "leader");
    await teamsRepo.audit(client, {
      teamId: team.id,
      actorUserId: user.id,
      eventType: "team_create",
      entityType: "team",
      entityId: team.id,
      after: team,
      metadata: { membershipId: membership.id }
    });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "A team with this name already exists");
    throw err;
  }
  return { status: 201, body: { team: teamView(team) } };
}

async function list({ client, query }) {
  const teams = await teamsRepo.listPublic(client, query?.get("q") || "");
  return { teams: teams.map(teamView) };
}

async function administration({ client }) {
  return { teams: (await teamsRepo.listAdministration(client)).map(teamView) };
}

async function leaderboard({ client, query }) {
  return { teams: (await teamsRepo.listLeaderboard(client, query?.get("venue"))).map(teamView) };
}

async function profileData(client, team, user) {
  const memberships = await teamsRepo.listMemberships(client, team.id);
  const rosters = await rostersRepo.listByTeam(client, team.id);
  const { rows: tournamentRows } = await client.query(
    `SELECT id, slug, name, format, venue_mode, status, starts_at
     FROM tournaments WHERE id = ANY($1::int[])`,
    [rosters.map((roster) => roster.tournamentId)]
  );
  const tournamentById = new Map(tournamentRows.map((row) => [row.id, {
    id: row.id,
    slug: row.slug,
    name: row.name,
    format: row.format,
    venueMode: row.venue_mode,
    status: row.status,
    startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : row.starts_at
  }]));
  const { rows: statsRows } = await client.query(
    `SELECT
       COUNT(DISTINCT r.tournament_id)::int AS tournaments,
       COUNT(DISTINCT r.id)::int AS rosters,
       COUNT(tm.id) FILTER (WHERE tm.phase = 'completed' AND ra.team_id <> rb.team_id)::int AS team_matches,
       COUNT(tm.id) FILTER (WHERE tm.phase = 'completed' AND ra.team_id <> rb.team_id AND
         ((ra.team_id = $1 AND tm.team_tournament_points_a = 2) OR (rb.team_id = $1 AND tm.team_tournament_points_b = 2)))::int AS wins,
       COUNT(tm.id) FILTER (WHERE tm.phase = 'completed' AND ra.team_id <> rb.team_id AND
         tm.team_tournament_points_a = 1 AND tm.team_tournament_points_b = 1)::int AS draws,
       COALESCE(SUM(CASE WHEN ra.team_id = $1 THEN tm.team_tournament_points_a WHEN rb.team_id = $1 THEN tm.team_tournament_points_b ELSE 0 END), 0)::int AS tournament_points,
       COALESCE(SUM(CASE WHEN ra.team_id = $1 THEN tm.team_game_points_a WHEN rb.team_id = $1 THEN tm.team_game_points_b ELSE 0 END), 0)::int AS game_points
     FROM tournament_team_rosters r
     LEFT JOIN tournament_team_matches tm ON tm.roster_a_id = r.id OR tm.roster_b_id = r.id
     LEFT JOIN tournament_team_rosters ra ON ra.id = tm.roster_a_id
     LEFT JOIN tournament_team_rosters rb ON rb.id = tm.roster_b_id
     WHERE r.team_id = $1`,
    [team.id]
  );
  const { rows: gameRows } = await client.query(
    `SELECT g.id, g.status, g.result, g.elo, g.venue_mode, g.submitted_at,
            tm.round_number, l.mission, l.table_id, l.game_points_a, l.game_points_b,
            ra.id AS roster_a_id, ra.name AS roster_a_name, ra.team_id AS team_a_id,
            rb.id AS roster_b_id, rb.name AS roster_b_name, rb.team_id AS team_b_id,
            t.id AS tournament_id, t.slug AS tournament_slug, t.name AS tournament_name
     FROM tournament_team_match_games l
     JOIN games g ON g.id = l.game_id
     JOIN tournament_team_matches tm ON tm.id = l.team_match_id
     JOIN tournament_team_rosters ra ON ra.id = tm.roster_a_id
     JOIN tournament_team_rosters rb ON rb.id = tm.roster_b_id
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE ra.team_id = $1 OR rb.team_id = $1
     ORDER BY COALESCE(g.submitted_at, g.created_at) DESC, g.id DESC LIMIT 50`,
    [team.id]
  );
  const viewerMembership = user ? memberships.find((item) => !item.endedAt && item.userId === user.id) : null;
  return {
    team: { ...teamView(team), viewer: {
      isMember: Boolean(viewerMembership),
      isLeader: viewerMembership?.role === "leader",
      canAdmin: Boolean(user?.isAdmin)
    } },
    currentMembers: memberships.filter((item) => !item.endedAt),
    formerMembers: memberships.filter((item) => item.endedAt),
    rosters: rosters.map((roster) => ({ ...roster, tournament: tournamentById.get(roster.tournamentId) || null })),
    recentGames: gameRows.map((row) => ({
      id: row.id,
      status: row.status,
      result: row.result,
      elo: row.elo,
      venueMode: row.venue_mode,
      submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at,
      roundNumber: row.round_number,
      mission: row.mission,
      tableId: row.table_id,
      gamePointsA: row.game_points_a,
      gamePointsB: row.game_points_b,
      tournament: { id: row.tournament_id, slug: row.tournament_slug, name: row.tournament_name },
      rosterA: { id: row.roster_a_id, name: row.roster_a_name, teamId: row.team_a_id },
      rosterB: { id: row.roster_b_id, name: row.roster_b_name, teamId: row.team_b_id }
    })),
    stats: statsRows[0] || {}
  };
}

async function get({ client, user, params }) {
  const team = await teamsRepo.findBySlug(client, params.slug);
  if (!team) throw new HttpError(404, "Team not found");
  return profileData(client, team, user);
}

async function dashboard({ client, user, query }) {
  const myTeams = await teamsRepo.listForUser(client, user.id);
  const invitations = await teamsRepo.listInvitationsForUser(client, user.id);
  const publicTeams = await teamsRepo.listPublic(client, query?.get("q") || "");
  return {
    myTeams: myTeams.map(teamView),
    incomingInvitations: invitations.filter((item) => item.inviteeUserId === user.id),
    outgoingInvitations: invitations.filter((item) => item.invitedByUserId === user.id),
    teams: publicTeams.map(teamView)
  };
}

async function update({ client, user, params, body }) {
  const team = await requireTeam(client, params.id, true);
  await requireMembership(client, team, user, { leader: true });
  if (team.archivedAt && !user.isAdmin) throw new HttpError(409, "Archived teams can be edited only by an administrator");
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    patch.name = normalizeTeamName(body.name);
    patch.nameKey = teamNameKey(patch.name);
  }
  if (Object.prototype.hasOwnProperty.call(body, "description")) patch.description = normalizeTeamDescription(body.description);
  if (Object.prototype.hasOwnProperty.call(body, "logoData")) patch.logoData = normalizeTeamLogo(body.logoData);
  try {
    const updated = await teamsRepo.update(client, team.id, patch);
    await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "team_update", entityType: "team", entityId: team.id, before: team, after: updated });
    return { team: teamView(updated) };
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "A team with this name already exists");
    throw err;
  }
}

async function invite({ client, user, params, body }) {
  const team = await requireTeam(client, params.id, true);
  await requireMembership(client, team, user);
  if (team.archivedAt) throw new HttpError(409, "Archived teams cannot send invitations");
  const inviteeId = requirePositiveIntId(body.userId, 400, "Choose a player to invite");
  const invitee = await usersRepo.findById(client, inviteeId);
  if (!invitee) throw new HttpError(404, "Player not found");
  if (await teamsRepo.activeMembership(client, team.id, invitee.id)) {
    throw new HttpError(409, "This player is already a team member");
  }
  try {
    const invitation = await teamsRepo.insertInvitation(client, { teamId: team.id, inviteeUserId: invitee.id, invitedByUserId: user.id });
    await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "invitation_create", entityType: "invitation", entityId: invitation.id, after: invitation });
    return { status: 201, body: { invitation } };
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "A pending invitation already exists");
    throw err;
  }
}

async function respondInvitation({ client, user, params, action }) {
  const id = requirePositiveIntId(params.id, 404, "Invitation not found");
  const invitation = await teamsRepo.invitationById(client, id, true);
  if (!invitation) throw new HttpError(404, "Invitation not found");
  if (invitation.status !== "pending") throw new HttpError(409, "This invitation is no longer pending");
  const team = await requireTeam(client, invitation.teamId, true);
  if (team.archivedAt) throw new HttpError(409, "Archived team invitations cannot be accepted");
  if (action === "accept") {
    if (invitation.inviteeUserId !== user.id) throw new HttpError(403, "Only the invited player can accept");
    let membership;
    try {
      membership = await teamsRepo.addMembership(client, team.id, user, "member");
    } catch (err) {
      if (err.code === "23505") throw new HttpError(409, "You are already a member of this team");
      throw err;
    }
    await teamsRepo.updateInvitationStatus(client, invitation.id, "accepted");
    await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "invitation_accept", entityType: "membership", entityId: membership.id, metadata: { invitationId: invitation.id } });
    return { membership };
  }
  if (invitation.inviteeUserId !== user.id) throw new HttpError(403, "Only the invited player can decline");
  const updated = await teamsRepo.updateInvitationStatus(client, invitation.id, "declined");
  await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "invitation_decline", entityType: "invitation", entityId: invitation.id });
  return { invitation: updated };
}

async function revokeInvitation({ client, user, params }) {
  const id = requirePositiveIntId(params.id, 404, "Invitation not found");
  const invitation = await teamsRepo.invitationById(client, id, true);
  if (!invitation) throw new HttpError(404, "Invitation not found");
  if (invitation.status !== "pending") throw new HttpError(409, "This invitation is no longer pending");
  const team = await requireTeam(client, invitation.teamId, true);
  const membership = await teamsRepo.activeMembership(client, team.id, user.id);
  if (!user.isAdmin && invitation.invitedByUserId !== user.id && membership?.role !== "leader") {
    throw new HttpError(403, "Only the sender, team leader, or administrator can revoke this invitation");
  }
  const updated = await teamsRepo.updateInvitationStatus(client, invitation.id, "revoked");
  await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "invitation_revoke", entityType: "invitation", entityId: invitation.id });
  return { invitation: updated };
}

async function chooseSuccessor(client, team, leavingMembership) {
  const members = (await teamsRepo.listMemberships(client, team.id))
    .filter((item) => !item.endedAt && item.id !== leavingMembership.id && item.userId);
  return members.sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)) || a.id - b.id)[0] || null;
}

async function leaveMembership(client, team, membership, actor, reason) {
  if (await teamsRepo.hasLockedActiveRoster(client, team.id, membership.userId)) {
    throw new HttpError(409, "A player in an active tournament roster cannot leave or be removed");
  }
  const wasLeader = membership.role === "leader";
  const successor = wasLeader ? await chooseSuccessor(client, team, membership) : null;
  const ended = await teamsRepo.endMembership(client, membership.id, reason, actor.id);
  await client.query(
    `UPDATE tournament_team_roster_members rm
     SET ended_at = NOW(), changed_by_user_id = $3, updated_at = NOW()
     FROM tournament_team_rosters r, tournaments t
     WHERE rm.roster_id = r.id AND r.tournament_id = t.id
       AND r.team_id = $1 AND rm.user_id = $2 AND rm.ended_at IS NULL
       AND t.status IN ('draft','registration_open','registration_closed')`,
    [team.id, membership.userId, actor.id]
  );
  await client.query(
    `UPDATE tournament_team_rosters r SET status = 'incomplete', updated_at = NOW()
     WHERE r.team_id = $1 AND r.status = 'registered'
       AND EXISTS (
         SELECT 1 FROM tournaments t
         WHERE t.id = r.tournament_id AND t.status IN ('draft','registration_open','registration_closed')
       )
       AND (SELECT COUNT(*) FROM tournament_team_roster_members rm WHERE rm.roster_id = r.id AND rm.ended_at IS NULL) < 3`,
    [team.id]
  );
  if (wasLeader && successor) {
    await teamsRepo.setMembershipRole(client, successor.id, "leader");
    await teamsRepo.update(client, team.id, { leaderUserId: successor.userId });
  } else if (wasLeader) {
    await teamsRepo.update(client, team.id, { leaderUserId: null, archivedAt: new Date().toISOString() });
  }
  await teamsRepo.audit(client, {
    teamId: team.id,
    actorUserId: actor.id,
    eventType: reason === "left" ? "membership_leave" : "membership_remove",
    entityType: "membership",
    entityId: membership.id,
    before: membership,
    after: ended,
    metadata: { successorUserId: successor?.userId || null }
  });
  return ended;
}

async function leave({ client, user, params }) {
  const team = await requireTeam(client, params.id, true);
  const membership = await teamsRepo.activeMembership(client, team.id, user.id, true);
  if (!membership) throw new HttpError(409, "You are not a member of this team");
  return { membership: await leaveMembership(client, team, membership, user, "left") };
}

async function removeMember({ client, user, params }) {
  const team = await requireTeam(client, params.id, true);
  await requireMembership(client, team, user, { leader: true });
  const membershipId = requirePositiveIntId(params.membershipId, 404, "Membership not found");
  const membership = await teamsRepo.membershipById(client, membershipId, true);
  if (!membership || membership.teamId !== team.id || membership.endedAt) throw new HttpError(404, "Membership not found");
  if (membership.userId === user.id && !user.isAdmin) throw new ValidationError("Use the leave action to leave your own team");
  return { membership: await leaveMembership(client, team, membership, user, "removed") };
}

async function transferLeadership({ client, user, params, body }) {
  const team = await requireTeam(client, params.id, true);
  await requireMembership(client, team, user, { leader: true });
  const targetUserId = requirePositiveIntId(body.userId, 400, "Choose a current member");
  const target = await teamsRepo.activeMembership(client, team.id, targetUserId, true);
  if (!target) throw new ValidationError("Leadership can be transferred only to a current member");
  if (target.role === "leader") return { team: teamView(team) };
  const oldLeader = await teamsRepo.activeMembership(client, team.id, team.leaderUserId, true);
  if (oldLeader) await teamsRepo.setMembershipRole(client, oldLeader.id, "member");
  await teamsRepo.setMembershipRole(client, target.id, "leader");
  const updated = await teamsRepo.update(client, team.id, { leaderUserId: target.userId });
  await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "leadership_transfer", entityType: "team", entityId: team.id, before: { leaderUserId: team.leaderUserId }, after: { leaderUserId: target.userId } });
  return { team: teamView(updated) };
}

async function archive({ client, user, params }) {
  const team = await requireTeam(client, params.id, true);
  await requireMembership(client, team, user, { leader: true });
  if (team.archivedAt) return { team: teamView(team) };
  if (await teamsRepo.hasUnfinishedRoster(client, team.id)) {
    throw new HttpError(409, "A team with a roster in an unfinished tournament cannot be archived");
  }
  const updated = await teamsRepo.update(client, team.id, { archivedAt: new Date().toISOString() });
  await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "team_archive", entityType: "team", entityId: team.id, before: team, after: updated });
  return { team: teamView(updated) };
}

async function restore({ client, user, params }) {
  const team = await requireTeam(client, params.id, true);
  const updated = await teamsRepo.update(client, team.id, { archivedAt: null });
  await teamsRepo.audit(client, { teamId: team.id, actorUserId: user.id, eventType: "team_restore", entityType: "team", entityId: team.id, before: team, after: updated });
  return { team: teamView(updated) };
}

module.exports = {
  create,
  list,
  administration,
  leaderboard,
  get,
  dashboard,
  update,
  invite,
  acceptInvitation: (ctx) => respondInvitation({ ...ctx, action: "accept" }),
  declineInvitation: (ctx) => respondInvitation({ ...ctx, action: "decline" }),
  revokeInvitation,
  leave,
  removeMember,
  transferLeadership,
  archive,
  restore,
  profileData,
  teamView
};

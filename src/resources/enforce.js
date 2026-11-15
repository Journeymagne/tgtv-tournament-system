const q = require('./quotas');
const HOUR = 3600, DAY = 86400;
async function count(client, sql, values) { return Number((await client.query(sql, values)).rows[0].count); }
async function activeTeams(client, userId, increment = 1) {
  await q.lock(client, userId);
  const limits = await q.limits(client, userId);
  const used = await count(client, 'SELECT count(*) FROM player_teams WHERE leader_user_id=$1 AND archived_at IS NULL', [userId]);
  q.check('teamsActive', limits.teamsActive, used, used + increment);
}
async function activeTournaments(client, userId, increment = 1) {
  await q.lock(client, userId);
  const limits = await q.limits(client, userId);
  const used = await count(client, "SELECT count(*) FROM tournaments WHERE owner_user_id=$1 AND status NOT IN ('completed','cancelled')", [userId]);
  q.check('tournamentsActive', limits.tournamentsActive, used, used + increment);
}
// This runs inside the same transaction as the mutation; rejected writes do not
// spend successful-operation budgets. Transport attempt limits are independent.
async function before(route, ctx) {
  const { client, user, body } = ctx;
  if (!user || !route.tx) return;
  const action = route.method + ' ' + route.path;
  if (action === 'POST /api/teams') {
    await activeTeams(client, user.id);
    await q.spend(client, user.id, 'teamsCreateDay', DAY);
  } else if (action === 'POST /api/teams/:id/invitations') {
    await q.spend(client, user.id, 'inviteDay', DAY);
    await q.spend(client, user.id, 'inviteRecipientDay', DAY, String(Number(body.userId)));
  } else if (action === 'POST /api/challenges') {
    await q.lock(client, user.id);
    const limits = await q.limits(client, user.id);
    const used = await count(client, "SELECT count(*) FROM challenges WHERE from_user_id=$1 AND status='pending'", [user.id]);
    q.check('challengeActive', limits.challengeActive, used, used + 1);
    await q.spend(client, user.id, 'challengeDay', DAY, '', limits);
    await q.spend(client, user.id, 'challengeRecipientDay', DAY, String(Number(body.toUserId)), limits);
  } else if (action === 'POST /api/admin/tournaments') {
    await activeTournaments(client, user.id);
    const limits = await q.limits(client, user.id);
    q.check('tournamentRounds', limits.tournamentRounds, 0, Number(body.swissRoundCount || 0));
    await q.spend(client, user.id, 'tournamentsCreateDay', DAY, '', limits);
  } else if (action === 'POST /api/feedback') {
    await q.lock(client, user.id);
    const limits = await q.limits(client, user.id);
    const used = await count(client, "SELECT count(*) FROM feedback WHERE user_id=$1 AND status='open'", [user.id]);
    q.check('feedbackOpen', limits.feedbackOpen, used, used + 1);
    await q.spend(client, user.id, 'feedbackDay', DAY, '', limits);
  } else if (action === 'POST /api/achievements') {
    await q.spend(client, user.id, 'achievementCreateDay', DAY);
  } else if (action === 'PATCH /api/achievements/:id' || action === 'PATCH /api/faq/entries/:id') {
    await q.spend(client, user.id, 'contentEditHour', HOUR);
  }
}
module.exports = { before, activeTeams, activeTournaments };

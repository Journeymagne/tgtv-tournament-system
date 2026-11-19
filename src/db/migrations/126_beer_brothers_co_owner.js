const repo = require('../repositories/tournament-providers');
const notifications = require('../../notifications/publish');

module.exports = {
  version: 126, name: 'beer_brothers_co_owner',
  async up(client) {
    const { rows: [provider] } = await client.query(`SELECT id, owner_user_id, co_owner_user_id, archived_at
      FROM tournaments.tournament_providers WHERE slug='beer-brothers-tournament-series' AND id=3 FOR UPDATE`);
    if (!provider) return;
    const userId = 298;
    const { rowCount } = await client.query(`SELECT id FROM accounts.users WHERE id=$1 AND name_key='acolyte'
      AND (suspended_until IS NULL OR suspended_until <= NOW()) FOR UPDATE`, [userId]);
    if (!rowCount || provider.owner_user_id !== 169 || provider.archived_at ||
        (provider.co_owner_user_id != null && provider.co_owner_user_id !== userId)) {
      throw new Error('Beer Brothers leadership or the acolyte account has changed. Verify the assignment.');
    }
    if (provider.co_owner_user_id === userId) return;

    const member = await repo.activeMembership(client, provider.id, userId);
    if (!member) await repo.addMembership(client, provider.id, userId, 'organizer');
    else if (member.role !== 'organizer') await repo.setMembershipRole(client, member.id, 'organizer');
    const pending = await repo.pendingInvitation(client, provider.id, userId);
    if (pending) {
      await repo.setInvitationStatus(client, pending.id, 'revoked');
      await notifications.retract(client, 'tournaments', 'tournament_provider_invitation:' + pending.id);
    }
    await repo.update(client, provider.id, {coOwnerUserId: userId});
    await repo.audit(client, {
      providerId: provider.id, eventType: 'provider_chief_added', entityType: 'user', entityId: userId,
      before: {role: member?.role ?? null, isOwner: false}, after: {role: 'organizer', isOwner: true}
    });
  }
};

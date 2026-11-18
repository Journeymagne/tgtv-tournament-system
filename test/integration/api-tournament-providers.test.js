const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { poolOptions, resetSchemas } = require('../helpers/schema');
const { migrateThrough } = require('../helpers/migrate-through');
const { migrate } = require('../../src/db/migrate');
const providers = require('../../src/db/repositories/tournament-providers');
const users = require('../../src/db/repositories/users');
const { contentVersion } = require('../../src/domain/data-url');

const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+WZl8AAAAASUVORK5CYII=';
let pool;
let owner;
let other;
let legacyTournamentId;

function providerInput(slug) {
  return { slug, name: slug, nameKey: slug, description: '', city: 'Yerevan', logoData, createdByUserId: owner.id };
}

async function transaction(action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

test.before(async () => {
  pool = new Pool(poolOptions);
  await resetSchemas(pool);
  await migrateThrough(pool, 115);
  const { rows: [tournament] } = await pool.query(
    `INSERT INTO tournaments.tournaments (slug, name, status, format, swiss_round_count)
     VALUES ('historic-organizer-cup', 'Historic Organizer Cup', 'draft', 'swiss', 3) RETURNING id`
  );
  legacyTournamentId = tournament.id;
  await pool.query(
    `INSERT INTO tournaments.calendar_events
       (name, event_date, city, venue, tournament_type, participant_limit, entry_fee, tournament_id)
     VALUES ('Historic Organizer Cup','2026-10-18','Yerevan','Club','solo',16,0,$1)`,
    [legacyTournamentId]
  );
  await migrate(pool);
  owner = await users.insert(pool, { name: 'StorageProviderOwner', passwordHash: 's:h', rating: 1000 });
  other = await users.insert(pool, { name: 'StorageProviderPlayer', passwordHash: 's:h', rating: 1000 });
});

test.after(async () => { if (pool) await pool.end(); });

test('provider and creator membership commit or roll back together', async () => {
  const provider = await transaction(client => providers.insert(client, providerInput('committed-provider')));
  assert.equal(provider.ownerUserId, owner.id);
  assert.equal(provider.createdByUserId, owner.id);
  assert.match(provider.logoUrl, /^\/api\/tournament-provider-logos\/\d+\?v=[0-9a-f]{16}$/);
  assert.equal(Object.hasOwn(provider, 'logoData'), false);
  const membership = await providers.activeMembership(pool, provider.id, owner.id);
  assert.equal(membership.role, 'organizer');
  assert.equal(membership.endedAt, null);

  let rolledBackId;
  await assert.rejects(transaction(async client => {
    const created = await providers.insert(client, providerInput('rolled-back-provider'));
    rolledBackId = created.id;
    throw new Error('rollback after provider insert');
  }), /rollback after provider insert/);
  assert.equal(await providers.findBySlug(pool, 'rolled-back-provider'), null);
  assert.equal(await providers.activeMembership(pool, rolledBackId, owner.id), null);
});

test('a provider permits one active membership per user and retains ended rows', async () => {
  const provider = await providers.insert(pool, providerInput('unique-active-membership'));
  const first = await providers.addMembership(pool, provider.id, other.id, 'judge');
  await assert.rejects(providers.addMembership(pool, provider.id, other.id, 'organizer'), {
    code: '23505', constraint: 'tournament_provider_memberships_active_user_idx'
  });
  await providers.endMembership(pool, first.id);
  const second = await providers.addMembership(pool, provider.id, other.id, 'organizer');
  assert.notEqual(second.id, first.id);
  assert.equal((await providers.activeMembership(pool, provider.id, other.id)).id, second.id);
  const { rows: [ended] } = await pool.query(
    'SELECT ended_at FROM tournaments.tournament_provider_memberships WHERE id=$1', [first.id]
  );
  assert.ok(ended.ended_at);
});

test('a provider permits one pending invitation per recipient', async () => {
  const provider = await providers.insert(pool, providerInput('unique-pending-invitation'));
  const invitation = { providerId: provider.id, inviteeUserId: other.id, invitedByUserId: owner.id, role: 'judge' };
  const first = await providers.insertInvitation(pool, invitation);
  await assert.rejects(providers.insertInvitation(pool, { ...invitation, role: 'organizer' }), {
    code: '23505', constraint: 'tournament_provider_invitations_pending_invitee_idx'
  });
  await providers.setInvitationStatus(pool, first.id, 'declined');
  const second = await providers.insertInvitation(pool, invitation);
  assert.notEqual(second.id, first.id);
  assert.equal((await providers.pendingInvitation(pool, provider.id, other.id)).id, second.id);
});

test('provider ownership requires an active organizer at commit', async () => {
  const provider = await providers.insert(pool, providerInput('active-owner-invariant'));
  const judge = await providers.addMembership(pool, provider.id, other.id, 'judge');
  const original = await providers.activeMembership(pool, provider.id, owner.id);
  const invalidOwner = { code: '23503', constraint: 'tournament_providers_active_owner_fkey' };

  await assert.rejects(pool.query(
    `INSERT INTO tournaments.tournament_providers (slug, name, name_key, city, logo_data, owner_user_id)
     VALUES ('orphan-provider', 'Orphan Provider', 'orphan provider', 'Yerevan', $1, $2)`, [logoData, owner.id]
  ), invalidOwner);
  await assert.rejects(transaction(client => providers.update(client, provider.id, { ownerUserId: other.id })), invalidOwner);
  await assert.rejects(transaction(client => providers.setMembershipRole(client, original.id, 'judge')), invalidOwner);
  await assert.rejects(transaction(client => providers.endMembership(client, original.id)), invalidOwner);

  await transaction(async client => {
    await providers.update(client, provider.id, { ownerUserId: other.id });
    await providers.setMembershipRole(client, judge.id, 'organizer');
    await providers.endMembership(client, original.id);
  });
  const transferred = await providers.findById(pool, provider.id);
  assert.equal(transferred.ownerUserId, other.id);
  assert.equal(transferred.createdByUserId, owner.id);
  assert.equal(await providers.activeMembership(pool, provider.id, owner.id), null);
});

test('preexisting linked tournaments and calendar entries keep null providers', async () => {
  const { rows } = await pool.query(
    `SELECT t.provider_id AS tournament_provider, e.provider_id AS event_provider
     FROM tournaments.tournaments t JOIN tournaments.calendar_events e ON e.tournament_id=t.id
     WHERE t.id=$1`, [legacyTournamentId]
  );
  assert.deepEqual(rows, [{ tournament_provider: null, event_provider: null }]);
});

test('provider lists expose versioned logos and audit snapshots omit image data', async () => {
  const provider = await providers.insert(pool, providerInput('provider-logo-history'));
  const newLogo = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  const updated = await transaction(async client => {
    await providers.findById(client, provider.id, { lock: true });
    const current = await providers.update(client, provider.id, { logoData: newLogo });
    await providers.audit(client, {
      providerId: provider.id, actorUserId: owner.id, eventType: 'profile_updated',
      before: { logoData }, after: { logoData: newLogo }
    });
    return current;
  });
  assert.notEqual(updated.logoUrl, provider.logoUrl);
  assert.ok(updated.logoUrl.endsWith(contentVersion(newLogo)));
  assert.equal(await providers.getLogo(pool, provider.id), newLogo);
  const { providers: listed, pagination } = await providers.list(pool, { search: 'LOGO-HISTORY', userId: owner.id });
  assert.equal(pagination.total, 1);
  assert.equal(listed[0].logoUrl, updated.logoUrl);
  assert.equal(listed[0].memberCount, 1);
  assert.equal(Object.hasOwn(listed[0], 'logoData'), false);
  const { rows: [event] } = await pool.query(
    'SELECT before, after FROM tournaments.tournament_provider_audit_events WHERE provider_id=$1', [provider.id]
  );
  assert.match(event.before.logoData.mediaSha256, /^[0-9a-f]{64}$/);
  assert.match(event.after.logoData.mediaSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(event.before.logoData.mediaSha256, event.after.logoData.mediaSha256);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProvider, providerPermissions } = require('../../src/domain/tournament-providers');
const { ValidationError } = require('../../src/http/io');

const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+WZl8AAAAASUVORK5CYII=';

test('provider creation normalizes its name, city, description and name key', () => {
  assert.deepEqual(normalizeProvider({
    name: '  МОСКВА\t Open  ', city: '  New\t York ', logoData,
    description: '  **First**  \r\n\r\n\r\n- Second   '
  }), {
    name: 'МОСКВА Open', nameKey: 'москва open', city: 'New York',
    logoData, description: '**First**\n\n- Second'
  });
});

test('provider creation requires its name, city and supported logo', () => {
  for (const patch of [
    { name: ' ' }, { city: ' ' }, { logoData: '' }, { logoData: 'data:image/png;base64,===' },
    { logoData: 'data:image/svg+xml;base64,eA==' }
  ]) {
    assert.throws(() => normalizeProvider({ name: 'Open Cup', city: 'City', logoData, ...patch }), ValidationError);
  }
});

test('provider validation enforces profile and logo size limits', () => {
  const oversizedLogo = `data:image/png;base64,${Buffer.alloc(1024 * 1024 + 1).toString('base64')}`;
  for (const patch of [
    { name: 'x'.repeat(81) }, { city: 'x'.repeat(81) }, { description: 'x'.repeat(6001) }, { logoData: oversizedLogo }
  ]) {
    assert.throws(() => normalizeProvider(patch, { partial: true }), ValidationError);
  }
});

test('provider name bounds count supplementary Unicode characters once', () => {
  const trophy = '🏆';
  assert.throws(() => normalizeProvider({ name: trophy }, { partial: true }), ValidationError);
  assert.equal(normalizeProvider({ name: trophy.repeat(2) }, { partial: true }).name, trophy.repeat(2));
  assert.equal(normalizeProvider({ name: trophy.repeat(80) }, { partial: true }).name, trophy.repeat(80));
  assert.throws(() => normalizeProvider({ name: trophy.repeat(81) }, { partial: true }), ValidationError);
});

test('provider edits preserve omitted fields and may clear the description', () => {
  assert.deepEqual(normalizeProvider({ name: '  New   Name ', description: null }, { partial: true }), {
    name: 'New Name', nameKey: 'new name', description: ''
  });
  assert.throws(() => normalizeProvider({ logoData: null }, { partial: true }), ValidationError);
});

const permissionKeys = [
  'canEdit', 'canCreateEvents', 'canManageMembers', 'canTransferOwnership', 'canArchive', 'canRestore', 'isMember', 'isOwner'
];

test('provider permissions are scoped to current membership and archive state', () => {
  const provider = { id: 21, ownerUserId: 1, archivedAt: null };
  const owner = { providerId: 21, userId: 1, role: 'organizer', endedAt: null };
  const organizer = { ...owner, userId: 2 };
  const judge = { ...owner, userId: 2, role: 'judge' };
  const archive = { ...provider, archivedAt: '2026-11-18T12:00:00.000Z' };
  for (const [user, record, membership, expected] of [
    [null, provider, null, []],
    [{ id: 2, capabilities: { canCreateTournaments: true } }, provider, null, []],
    [{ id: 1 }, provider, { ...owner, endedAt: archive.archivedAt }, []],
    [{ id: 2 }, provider, { ...organizer, providerId: 22 }, []],
    [{ id: 1 }, provider, owner, ['canEdit', 'canCreateEvents', 'canManageMembers', 'canTransferOwnership', 'canArchive', 'isMember', 'isOwner']],
    [{ id: 1 }, archive, owner, ['canEdit', 'canManageMembers', 'canTransferOwnership', 'canRestore', 'isMember', 'isOwner']],
    [{ id: 2 }, provider, organizer, ['canEdit', 'canCreateEvents', 'isMember']],
    [{ id: 2 }, archive, organizer, ['isMember']],
    [{ id: 2 }, provider, judge, ['isMember']],
    [{ id: 3, isAdmin: true }, provider, null, ['canEdit', 'canCreateEvents', 'canManageMembers', 'canTransferOwnership', 'canArchive']],
    [{ id: 3, isSuperAdmin: true }, archive, null, ['canEdit', 'canManageMembers', 'canTransferOwnership', 'canRestore']]
  ]) {
    const permissions = providerPermissions(user, record, membership);
    assert.deepEqual(permissionKeys.filter(key => permissions[key]), expected);
    assert.deepEqual(Object.keys(permissions).sort(), [...permissionKeys].sort());
  }
});

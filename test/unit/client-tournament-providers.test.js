const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  eventCreationOptions, profileActions, refreshAfterProviderError
} = require('../../public/tournament-providers');
const { calendarActions } = require('../../public/calendar');

const appSource = fs.readFileSync(require.resolve('../../public/app'), 'utf8');
function appFunctions(names, expression, bindings = {}) {
  const source = names.map(name => {
    const match = appSource.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
    assert.ok(match, name);
    return match[0];
  }).join('\n');
  return vm.runInNewContext(`${source}\n${expression}`, { URL, URLSearchParams, ...bindings });
}

test('guest can open the organizations tab and read an organization profile', () => {
  const functions = ['hashSegments', 'tournamentSlugFromHash', 'appRouteFromHash', 'publicAppRoute', 'activeTournamentTab'];
  for (const [hash, slug] of [
    ['#/tournaments/organizations', ''],
    ['#/tournaments/organizations/independent-club', 'independent-club']
  ]) {
    const parsed = appFunctions(functions, `const tournamentSlugFromLocation = tournamentSlugFromHash;
      const route = appRouteFromHash(); ({
      tab: activeTournamentTab(route.tournamentsTab, false), slug: route.providerSlug, public: publicAppRoute(route)
    })`, {
      window: { location: { hash } },
      sharedChallengeTokenFromHash: () => ''
    });
    assert.equal(parsed.tab, 'organizations');
    assert.equal(parsed.slug, slug);
    assert.equal(parsed.public, true);
  }
});

test('a provider notification focuses its pending invitation on the public profile', () => {
  const parsed = appFunctions([
    'providerInvitationDestination', 'hashSegments', 'tournamentSlugFromHash', 'appRouteFromHash'
  ], `const tournamentSlugFromLocation = tournamentSlugFromHash;
      window.location.hash = new URL(providerInvitationDestination(item), 'https://example.com').hash;
      appRouteFromHash()`, {
    item: { sourceId: 19, provider: { slug: 'local-cup' } },
    window: { location: {} },
    sharedChallengeTokenFromHash: () => ''
  });
  assert.equal(parsed.providerSlug, 'local-cup');
  assert.equal(parsed.providerInvitationId, '19');
});

test('scoped creation offers only organizations where an organizer can create events', () => {
  const organizer = { capabilities: { canCreateProviderEvents: true, canCreateTournaments: false } };
  const providers = [
    { id: 3, name: 'Local cup', viewer: { canCreateEvents: true } },
    { id: 4, name: 'Judges club', viewer: { canCreateEvents: false } }
  ];
  assert.deepEqual(eventCreationOptions(organizer, providers, 'tournament').map(option => option.value), ['3']);
  assert.deepEqual(eventCreationOptions(organizer, providers, 'calendar').map(option => option.value), ['3']);
  assert.deepEqual(eventCreationOptions(organizer, providers, 'tournament', 4), []);
});

test('personal calendar creation requires administration while personal tournament creation uses the global grant', () => {
  const globalOrganizer = { capabilities: { canCreateTournaments: true } };
  assert.deepEqual(eventCreationOptions(globalOrganizer, [], 'tournament').map(option => option.value), ['']);
  assert.deepEqual(eventCreationOptions(globalOrganizer, [], 'calendar'), []);
  assert.equal(calendarActions({ canCreateEvents: true }, { canEdit: false, canCreateTournament: true }).createTournament, true);
  assert.equal(calendarActions({ canCreateEvents: false }, { canEdit: false }).edit, false);
});

test('a judge can leave but an administrator without membership can manage the organization', () => {
  assert.deepEqual(profileActions({ isMember: true }), ['leave']);
  assert.deepEqual(profileActions({
    canEdit: true, canCreateEvents: true, canManageMembers: true,
    canTransferOwnership: true, canArchive: true, isMember: false
  }), ['edit', 'createTournament', 'createCalendar', 'invite', 'transfer', 'archive']);
});

test('an open form loses its write controls after a forbidden response', async () => {
  const submit = { disabled: false };
  const effect = [];
  await refreshAfterProviderError({ status: 403 }, submit, async () => {
    assert.equal(submit.disabled, true);
    effect.push('reload');
  });
  assert.deepEqual(effect, ['reload']);
  assert.equal(submit.disabled, true);
});

test('a stale profile edit leaves its form open for explicit reloading', async () => {
  const submit = { disabled: true };
  const effect = [];
  await refreshAfterProviderError({ status: 409 }, submit, async () => effect.push('reload'));
  assert.deepEqual(effect, []);
  assert.equal(submit.disabled, false);
});

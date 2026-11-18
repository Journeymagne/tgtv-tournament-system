const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  eventCreationOptions, profileActions, refreshAfterProviderError
} = require('../../public/tournament-providers');
const { calendarActions } = require('../../public/calendar');

const appSource = ['app', 'admin'].map(name => fs.readFileSync(require.resolve(`../../public/${name}`), 'utf8')).join('\n');
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
  assert.deepEqual(eventCreationOptions(organizer, providers).map(option => option.value), ['3']);
  assert.deepEqual(eventCreationOptions(organizer, providers, 4), []);
});

test('personal event creation uses the global grant while calendar event actions follow server permissions', () => {
  const globalOrganizer = { capabilities: { canCreateTournaments: true } };
  assert.deepEqual(eventCreationOptions(globalOrganizer, []).map(option => option.value), ['']);
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

test('staff panel can revoke an explicit judge assignment that overlaps organization membership', () => {
  const { inherited, overlapping } = appFunctions(['adminTournamentStaffContent'], `({
    inherited: adminTournamentStaffContent({ tournament: { providerId: 3 }, staff: { staff: [
      { userId: 5, name: 'Organization judge', role: 'judge', providerRole: 'judge', automatic: true, active: true }
    ] } }),
    overlapping: adminTournamentStaffContent({ tournament: { providerId: 3 }, staff: { staff: [
      { userId: 5, name: 'Organization judge', role: 'judge', providerRole: 'judge', automatic: true,
        assigned: true, active: true, canRevoke: true, expiresAt: '2026-12-01' }
    ] } })
  })`, {
    state: { me: { isSuperAdmin: false } },
    adminLabel: (_ru, en) => en,
    escapeHtml: String,
    fmtDate: String
  });
  assert.match(inherited, /Organization membership/);
  assert.doesNotMatch(inherited, /Platform role access|data-judge-revoke/);
  assert.match(overlapping, /Organization membership/);
  assert.match(overlapping, /Tournament judge assignment · 2026-12-01/);
  assert.match(overlapping, /data-judge-revoke="5"/);
});

test('staff ownership transfer is limited to personal tournaments', () => {
  const controls = appFunctions(['adminTournamentStaffContent'], `[
    adminTournamentStaffContent({ tournament: { providerId: null }, staff: { staff: [] } }),
    adminTournamentStaffContent({ tournament: { providerId: 7 }, staff: { staff: [] } })
  ]`, { state: { me: { isSuperAdmin: true } }, adminLabel: (_ru, en) => en });
  assert.match(controls[0], /data-transfer-owner/);
  assert.doesNotMatch(controls[1], /data-transfer-owner/);
});

test('the unchanged organization calendar prefill keeps the authoritative start instant', () => {
  const defaultStart = '2026-11-01T06:30:00.000Z';
  const schedule = appFunctions(['adminTournamentSchedule'], `adminTournamentSchedule('2026-11-01T01:30', {
    event: { providerId: 12, timeZone: 'America/New_York' },
    tournamentDefaults: { startsAt: defaultStart }
  })`, {
    defaultStart,
    datetimeLocalValue: value => value === defaultStart ? '2026-11-01T01:30' : '',
    datetimeLocalToIso: () => '2026-11-01T05:30:00.000Z'
  });
  assert.equal(schedule.startsAt, defaultStart);
  assert.equal(schedule.calendarTimeZone, 'America/New_York');
});

test('an edited calendar prefill sends the changed start and keeps the organization event time zone', () => {
  const schedule = appFunctions(['adminTournamentSchedule'], `adminTournamentSchedule('2026-11-01T02:30', {
    event: { providerId: 12, timeZone: 'America/Chicago' },
    tournamentDefaults: { startsAt: '2026-11-01T07:30:00.000Z' }
  })`, {
    datetimeLocalValue: () => '2026-11-01T01:30',
    datetimeLocalToIso: value => value === '2026-11-01T02:30' ? '2026-11-01T08:30:00.000Z' : ''
  });
  assert.equal(schedule.startsAt, '2026-11-01T08:30:00.000Z');
  assert.equal(schedule.calendarTimeZone, 'America/Chicago');
});


test('platform administrators can choose active nonmember organizations on later catalog pages', async () => {
  const catalog = [
    [{ id: 3, name: 'First club', viewer: { canCreateEvents: true } }],
    [{ id: 4, name: 'Second club', viewer: { canCreateEvents: true } },
      { id: 5, name: 'Archived club', viewer: { canCreateEvents: false } }]
  ];
  for (const permission of ['isAdmin', 'isSuperAdmin']) {
    const paths = [];
    const picker = await appFunctions(['loadCreationProviders', 'loadEventProviderOptions'],
      `loadEventProviderOptions()`, {
        state: { me: { id: 1, [permission]: true, providerMemberships: [] } },
        loadTournamentProvidersUi: async () => ({ eventCreationOptions }),
        api: async path => {
          paths.push(path);
          const page = Number(new URL(path, 'https://example.com').searchParams.get('page'));
          return { providers: catalog[page - 1], pagination: { page, totalPages: 2 } };
        }
      });
    assert.deepEqual(paths, ['/api/tournament-providers?page=1', '/api/tournament-providers?page=2']);
    assert.deepEqual(picker.options.map(option => option.value), ['', '3', '4']);
  }
});

test('an organization organizer loads event choices from their membership dashboard', async () => {
  const paths = [];
  const picker = await appFunctions(['loadCreationProviders', 'loadEventProviderOptions'],
    `loadEventProviderOptions()`, {
      state: { me: { id: 2, capabilities: { canCreateProviderEvents: true } } },
      loadTournamentProvidersUi: async () => ({ eventCreationOptions }),
      api: async path => {
        paths.push(path);
        return { providers: [
          { id: 8, name: 'Organizer club', viewer: { canCreateEvents: true } },
          { id: 9, name: 'Judge club', viewer: { canCreateEvents: false } }
        ] };
      }
    });
  assert.deepEqual(paths, ['/api/tournament-providers/dashboard']);
  assert.deepEqual(picker.options.map(option => option.value), ['8']);
});


test('an inherited organization judge can receive a separate tournament assignment', async () => {
  const listener = [];
  const playerPicker = [];
  const staff = [{ userId: 5, active: true, providerRole: 'judge' }, { userId: 6, active: true, assigned: true }];
  appFunctions(['wireAdminTournamentStaff'], 'wireAdminTournamentStaff()', {
    state: {
      adminTournamentDetail: { tournament: { providerId: 3 }, staff: { staff } },
      adminUsers: [{ id: 5, name: 'Inherited judge' }, { id: 6, name: 'Assigned judge' }]
    },
    document: {
      querySelector: selector => selector === '[data-judge-assign]'
        ? { addEventListener: (_, handler) => listener.push(handler) } : null,
      querySelectorAll: () => []
    },
    adminLabel: (_ru, en) => en,
    escapeHtml: String,
    loadAdminUsers: async () => {},
    administrationDialog: (_title, markup) => {
      playerPicker.push(markup);
      return { querySelector: () => ({}) };
    },
    wireComboFields: () => {}
  });
  await listener[0]();
  assert.match(playerPicker[0], /value="5">Inherited judge/);
  assert.doesNotMatch(playerPicker[0], /value="6">Assigned judge/);
  assert.match(playerPicker[0], /data-user-search-remote data-user-search-exclude="6"/);
});

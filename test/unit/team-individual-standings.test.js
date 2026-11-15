const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTeamIndividualStandings } = require('../../src/domain/team-individual-standings');

const member = (id, userId, name, extra = {}) => ({ id, userId, displayNameSnapshot: name, slot: 1,
  joinedAt: '2026-11-01T00:00:00Z', endedAt: null, ...extra });
const rosters = () => [{ id: 10, name: 'Alpha', members: [member(101, 1, 'Alice'), member(103, 3, 'Zero', { slot: 2 })] },
  { id: 20, name: 'Beta', members: [member(102, 2, 'Bob')] }];
function match(id, a = 15, b = 8, extra = {}) {
  const game = { id, status: 'completed', resultPlayerIds: [1, 2],
    players: [{ id: 1, userId: 1, name: 'Alice' }, { id: 2, userId: 2, name: 'Bob' }],
    result: { winnerId: a === b ? null : a > b ? 1 : 2, scores: { 1: { total: a }, 2: { total: b } } } };
  return { id, rosterAId: 10, rosterBId: 20, phase: 'in_progress',
    games: [{ slot: 1, rosterAMemberId: 101, rosterBMemberId: 102, game }], ...extra };
}

for (const pairingType of ['shield_sword', 'sword_shield_classic', 'doubles']) {
  test(`personal TP is solo 3/1/0 with actual GP/Diff in ${pairingType}`, () => {
    const rows = buildTeamIndividualStandings(rosters(), [match(1, 15, 8, { pairingType }),
      match(2, 10, 10, { pairingType }), match(3, 5, 12, { pairingType })]);
    const a = rows.find(row => row.userId === 1);
    assert.deepEqual([a.gamesPlayed, a.wins, a.draws, a.losses, a.matchPoints, a.totalGp, a.gpDiff], [3, 1, 1, 1, 4, 30, 0]);
    const b = rows.find(row => row.userId === 2);
    assert.equal(b.matchPoints, 4);
    assert.equal(b.rank, a.rank, 'equal personal metrics share solo-style place');
    assert.equal(rows.find(row => row.userId === 3).gamesPlayed, 0);
    assert.equal(rows.find(row => row.userId === 3).rank, 3);
  });
}

test('completed personal games count during a running team match; pending/open games do not', () => {
  const completed = match(1), pending = match(2), reopened = match(3);
  pending.games[0].game.status = 'pending_confirmation';
  reopened.games[0].game.status = 'open';
  const rows = buildTeamIndividualStandings(rosters(), [completed, pending, reopened]);
  assert.equal(rows.find(row => row.userId === 1).matchPoints, 3);
  assert.equal(rows.find(row => row.userId === 1).gamesPlayed, 1);
  assert.equal(rows.find(row => row.userId === 1).gpDiff, 14);
});

test('ranking uses TP then GP then Diff with deterministic names and shared places', () => {
  const input = rosters();
  input[0].members.push(member(104, 4, 'Dora', { slot: 3 }));
  const a = match(1, 15, 8), b = match(2, 15, 5);
  b.games[0].rosterAMemberId = 104;
  b.games[0].game.players[0] = { id: 4, userId: 4, name: 'Dora' };
  b.games[0].game.resultPlayerIds = [4, 2];
  b.games[0].game.result = { winnerId: 4, scores: { 4: { total: 15 }, 2: { total: 5 } } };
  const rows = buildTeamIndividualStandings(input, [a, b]);
  assert.deepEqual(rows.slice(0, 2).map(row => [row.name, row.matchPoints, row.totalGp, row.gpDiff]),
    [['Dora', 3, 20, 20], ['Alice', 3, 17, 14]]);
});

test('saved participant identity owns results after its roster slot is replaced', () => {
  const input = rosters(), saved = match(1);
  input[0].members = [member(101, 4, 'Replacement')];
  const rows = buildTeamIndividualStandings(input, [saved]);
  assert.equal(rows.find(row => row.userId === 1).matchPoints, 3);
  assert.equal(rows.find(row => row.userId === 4).matchPoints, 0);
});

test('proxy identities stay distinct from accounts and subsequent proxies at one recorded seat', () => {
  const input = rosters();
  input[0].members = [member(101, null, 'Proxy 3', { isProxy: true })];
  const first = match(1), second = match(2);
  for (const [item, name] of [[first, 'Proxy 1'], [second, 'Proxy 2']]) {
    const game = item.games[0].game;
    game.players[0] = { id: -101, userId: null, name, isProxy: true, hasProfile: false };
    game.resultPlayerIds = [-101, 2];
    game.result = { winnerId: -101, scores: { '-101': { total: 15 }, 2: { total: 8 } } };
  }
  const rows = buildTeamIndividualStandings(input, [first, second]);
  const proxies = rows.filter(row => row.isProxy);
  assert.equal(proxies.length, 3);
  assert.equal(new Set(proxies.map(row => row.key)).size, 3);
  assert.deepEqual(proxies.map(row => row.matchPoints).sort(), [0, 3, 3]);
  assert.ok(proxies.every(row => row.userId === null));
});

test('a bye awards solo TP to the historical lineup and 20 GP and +20 Diff', () => {
  const input = rosters();
  input[0].members = [member(101, 1, 'Original', { endedAt: '2026-11-11T00:00:00Z' }),
    member(104, 4, 'Replacement', { joinedAt: '2026-11-11T00:00:00Z' })];
  const rows = buildTeamIndividualStandings(input, [{ id: 1, rosterAId: 10, rosterBId: null, phase: 'completed',
    resolution: 'bye', createdAt: '2026-11-10T00:00:00Z', completedAt: '2026-11-10T00:00:00Z', games: [] }]);
  const original = rows.find(row => row.userId === 1), replacement = rows.find(row => row.userId === 4);
  assert.deepEqual([original.matchPoints, original.totalGp, original.gpDiff, original.wins, original.byes, original.gamesPlayed], [3, 20, 20, 1, 1, 0]);
  assert.equal(replacement.matchPoints, 0);
});

test('team forfeits retain played personal games without inventing unplayed wins', () => {
  const rows = buildTeamIndividualStandings(rosters(), [match(1, 15, 8, { phase: 'completed', resolution: 'forfeit',
    teamTournamentPointsA: 0, teamTournamentPointsB: 2 })]);
  assert.equal(rows.find(row => row.userId === 1).matchPoints, 3);
  assert.equal(rows.find(row => row.userId === 3).matchPoints, 0);
});

test('one account aggregates across rosters, duplicates do not double count and source data stays intact', () => {
  const input = rosters(), games = [match(1)];
  input[1].members.push(member(105, 1, 'Alice', { slot: 2 }));
  const before = structuredClone({ input, games });
  const rows = buildTeamIndividualStandings(input, [games[0], games[0]]);
  const a = rows.find(row => row.userId === 1);
  assert.deepEqual(a.rosterIds, [10, 20]);
  assert.deepEqual(a.rosterNames, ['Alpha', 'Beta']);
  assert.equal(a.gamesPlayed, 1);
  assert.deepEqual({ input, games }, before);
});

test('withdrawn and zero-game participants remain visible; rows expose only public identity and statistics', () => {
  const input = rosters(); input[0].status = 'withdrawn';
  input[0].members[0].user = { passwordHash: 'secret', telegramContact: 'private' };
  input[0].members[0].factionSnapshot = 'Hidden faction';
  const rows = buildTeamIndividualStandings(input, []);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.matchPoints === 0 && row.totalGp === 0 && row.gpDiff === 0));
  assert.doesNotMatch(JSON.stringify(rows), /secret|private|Hidden faction|factionSnapshot|telegramContact/);
});

test('GP totals use the canonical capped 20-point split rather than raw VP', () => {
  const rows = buildTeamIndividualStandings(rosters(), [match(1, 21, 0)]);
  const a = rows.find(row => row.userId === 1), b = rows.find(row => row.userId === 2);
  assert.deepEqual([a.totalGp, b.totalGp, a.gpDiff, b.gpDiff], [20, 0, 20, -20]);
  assert.equal(a.totalGp + b.totalGp, 20);
  assert.equal(a.gpDiff + b.gpDiff, 0);
  const drawn = buildTeamIndividualStandings(rosters(), [match(2, 0, 0)]);
  assert.equal(drawn.find(row => row.userId === 1).totalGp, 10);
  assert.equal(drawn.find(row => row.userId === 1).matchPoints, 1);
});

test('missing or malformed recorded VP never creates fictitious 10:10 GP', () => {
  for (const scores of [{}, { 1: { total: 10 } }, { 1: { total: 'invalid' }, 2: { total: 0 } }]) {
    const item = match(1);
    item.games[0].game.result.scores = scores;
    const rows = buildTeamIndividualStandings(rosters(), [item]);
    assert.equal(rows.find(row => row.userId === 1).gamesPlayed, 0);
    assert.equal(rows.find(row => row.userId === 1).totalGp, 0);
  }
});

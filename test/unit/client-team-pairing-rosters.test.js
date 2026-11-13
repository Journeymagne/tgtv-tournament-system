const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const messages = require('../../public/i18n/en');
const translate = (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]);
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const names = ['teamPairingRostersMarkup', 'activeRosterMembersForUi', 'teamSizeFor',
  'teamRosterLabel', 'tournamentRegisteredFactions', 'tournamentFactionsLabel',
  'tournamentParticipantProfileLink', 'playerProfileLink'];
const render = new Function('t', 'escapeHtml', names.map(name => {
  const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, `renderer dependency ${name}`);
  return body;
}).join('\n') + '\nreturn teamPairingRostersMarkup;')(translate, escape);

function fixture() {
  const member = (id, slot) => ({ id, slot, userId: id + 100, displayNameSnapshot: `Player ${id}`, factionSnapshot: `Faction ${id}` });
  return { id: 7, phase: 'in_progress', pairingType: 'shield_sword',
    rosterA: { id: 1, name: 'Alpha', members: [member(3, 3), member(1, 1), member(2, 2)] },
    rosterB: { id: 2, name: 'Beta', members: [member(5, 2), member(6, 3), member(4, 1)] },
    pairings: [
      { slot: 3, rosterAMemberId: 3, rosterBMemberId: 4 },
      { slot: 1, rosterAMemberId: '2', rosterBMemberId: '6' },
      { slot: 2, rosterAMemberId: 1, rosterBMemberId: 5 }
    ], games: [] };
}

function playerRows(html) {
  const ids = [...html.matchAll(/class="team-pairing-roster-member"[\s\S]*?<strong>[\s\S]*?data-profile-user="(\d+)"/g)].map(match => Number(match[1]));
  return Array.from({ length: ids.length / 2 }, (_, index) => ids.slice(index * 2, index * 2 + 2));
}

test('pairing roster rows follow matchup slots and member IDs on both sides, not roster order', () => {
  const match = fixture(), before = structuredClone(match);
  assert.deepEqual(playerRows(render(match)), [[102, 106], [101, 105], [103, 104]]);
  assert.deepEqual(match, before, 'rendering must not reorder the live match data');
});

test('roster rows agree with personal game participants when game links override pairing data', () => {
  const match = fixture();
  match.games = [
    { slot: 2, rosterAMemberId: 3, rosterBMemberId: 6 },
    { slot: 3, rosterAMemberId: 1, rosterBMemberId: 5 },
    { slot: 1, rosterAMemberId: 2, rosterBMemberId: 4 }
  ];
  assert.deepEqual(playerRows(render(match)), [[102, 104], [103, 106], [101, 105]]);
  match.pairings = [];
  assert.deepEqual(playerRows(render(match)), [[102, 104], [103, 106], [101, 105]]);
});

test('before pairings exist the roster retains active player slot order', () => {
  const match = { ...fixture(), phase: 'shield_selection', pairings: [] };
  match.rosterA.members.push({ id: 8, slot: 1, userId: 108, displayNameSnapshot: 'Former player', endedAt: '2026-11-01' });
  assert.deepEqual(playerRows(render(match)), [[101, 104], [102, 105], [103, 106]]);
  assert.doesNotMatch(render(match), /Former player/);
});

test('partial pairings keep the confirmed opponents together without duplicating or dropping remaining players', () => {
  const match = fixture(); match.pairings = [match.pairings[1]];
  assert.deepEqual(playerRows(render(match)), [[102, 106], [101, 104], [103, 105]]);
});

test('doubles roster rows follow their two matchups', () => {
  const match = fixture(); match.pairingType = 'doubles';
  match.rosterA.members = match.rosterA.members.filter(member => member.slot <= 2);
  match.rosterB.members = match.rosterB.members.filter(member => member.slot <= 2);
  match.pairings = [{ slot: 2, rosterAMemberId: 1, rosterBMemberId: 5 }, { slot: 1, rosterAMemberId: 2, rosterBMemberId: 4 }];
  assert.deepEqual(playerRows(render(match)), [[102, 104], [101, 105]]);
});

test('matchup ordering retains profile links, escaped names and hidden factions', () => {
  const match = fixture();
  match.rosterA.members.find(member => member.id === 2).displayNameSnapshot = '<Player & 2>';
  const hidden = match.rosterB.members.find(member => member.id === 6);
  hidden.factionHidden = true; hidden.factionSnapshot = 'PRIVATE FACTION'; hidden.factions = ['PRIVATE SECOND FACTION'];
  const html = render(match);
  assert.match(html, /href="\/tournament#\/players\/102"/);
  assert.match(html, /&lt;Player &amp; 2&gt;/);
  assert.match(html, new RegExp(messages['tournaments.participant.factionHidden']));
  assert.doesNotMatch(html, /PRIVATE|<Player/);
  assert.deepEqual(playerRows(html), [[102, 106], [101, 105], [103, 104]]);
});

test('formed game rows retain the actual historical player rather than adding an unpaired replacement', () => {
  const match = fixture();
  match.rosterA.members.find(member => member.id === 1).endedAt = '2026-11-01';
  match.rosterA.members.push({ id: 8, slot: 1, userId: 108, displayNameSnapshot: 'Replacement', factionSnapshot: 'Kasrkin' });
  match.games = match.pairings;
  assert.deepEqual(playerRows(render(match)), [[102, 106], [101, 105], [103, 104]]);
  assert.doesNotMatch(render(match), /Replacement/);
});

test('completed matches and byes do not gain a roster panel', () => {
  assert.equal(render({ ...fixture(), phase: 'completed' }), '');
  assert.equal(render({ ...fixture(), rosterB: null }), '');
});

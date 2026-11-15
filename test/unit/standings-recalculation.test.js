const test = require('node:test');
const assert = require('node:assert/strict');
const { recalculateMatch } = require('../../src/domain/tournaments/recalculate');
const { buildStandings } = require('../../src/domain/tournaments/standings');
const participants = [{ id: 124, userId: null, tournamentId: 10 }, { id: 108, userId: 124, tournamentId: 10 }];
const match = { id: 199, tournamentId: 10, participantAId: 124, participantBId: 108, status: 'completed' };

test('recalculation distinguishes guest keys, draws and registered-user collisions', () => {
  const result = { winnerId: -124, scores: { '-124': { total: 15 }, 124: { total: 13 } } };
  assert.equal(recalculateMatch({ ...match, result }, participants).winnerParticipantId, 124);
  assert.equal(recalculateMatch({ ...match, result: { ...result, winnerId: 124 } }, participants).winnerParticipantId, 108);
  assert.deepEqual(recalculateMatch({ ...match, result: { ...result, winnerId: null } }, participants).matchPoints, { 108: 1, 124: 1 });
  const bye = recalculateMatch({ ...match, isBye: true, participantBId: null }, participants);
  assert.deepEqual(bye, { winnerParticipantId: 124, matchPoints: { 124: 3 } });
});

test('recalculation restores head-to-head order and refuses cross-tournament identities', () => {
  const entrants = [...participants, { id: 200, userId: 300, tournamentId: 10 }];
  const matches = [
    { ...match, result: { winnerId: 124, scores: { '-124': { total: 13 }, 124: { total: 15 } } } },
    { ...match, id: 200, participantBId: 200,
      result: { winnerId: -124, scores: { '-124': { total: 15 }, 300: { total: 13 } } } }
  ].map(m => ({ ...m, ...recalculateMatch(m, entrants) }));
  const standings = buildStandings(entrants, matches, ['head_to_head']);
  assert.equal(standings[0].participant.id, 108);
  assert.equal(standings[0].headToHeadWins, 1);
  assert.throws(() => recalculateMatch(matches[0], [participants[0], { ...participants[1], tournamentId: 11 }]), /this tournament/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildStandings } = require('../../src/domain/tournaments/standings');
const { winnerParticipantIdFromResult, matchWinnerParticipantId, assertMatchWinner, participantScore, tournamentResultSnapshot } = require('../../src/domain/tournaments/results');
const a = { id: 124, userId: 178, displayName: 'Tony Te Amo', status: 'finished', seed: 13 };
const b = { id: 108, userId: 124, displayName: 'corias', status: 'finished', seed: 3 };
const result = { winnerId: 124, scores: { 178: { total: 13 }, 124: { total: 15 } } };
const match = { id: 199, gameId: 369, status: 'completed', participantAId: a.id, participantBId: b.id, winnerParticipantId: b.id, result };

test('registered winner IDs cannot be mistaken for the opposing tournament participant ID', () => {
  assert.equal(winnerParticipantIdFromResult(result, a, b), b.id);
  assert.equal(winnerParticipantIdFromResult(result, b, a), b.id);
  assert.equal(winnerParticipantIdFromResult({ ...result, winnerId: a.userId }, a, b), a.id);
});

test('guests use negative result keys; draws and tiebreak winners retain their meaning', () => {
  const guest = { id: 124, userId: null };
  assert.equal(winnerParticipantIdFromResult(result, guest, b), b.id);
  assert.equal(winnerParticipantIdFromResult({ winnerId: -124 }, guest, b), guest.id);
  assert.equal(winnerParticipantIdFromResult({ winnerId: null }, a, b), null);
  assert.equal(winnerParticipantIdFromResult({ winnerId: 124, scores: { 178: { total: 13 }, 124: { total: 13 } }, tiebreakers: { decidedBy: 'primary' } }, a, b), b.id);
  assert.throws(() => winnerParticipantIdFromResult({ winnerId: 108 }, a, b), /does not match/);
});

test('standings give only the canonical participant winner a win under colliding IDs', () => {
  const standings = buildStandings([a, b], [match], ['head_to_head']);
  assert.equal(standings.find(row => row.participant.id === b.id).wins, 1);
  assert.equal(standings.find(row => row.participant.id === b.id).matchPoints, 3);
  assert.equal(standings.find(row => row.participant.id === a.id).wins, 0);
  assert.equal(standings.find(row => row.participant.id === a.id).losses, 1);
  assert.equal(standings.find(row => row.participant.id === a.id).matchPoints, 0);
});

test('public match preview uses the canonical participant winner under colliding IDs', () => {
  const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
  const body = app.match(/function publicMatchScore\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];
  const render = new Function('t', body + ';return publicMatchScore;')((key, values) => values ? `${values.score}, ${values.name} won` : key);
  assert.equal(render({ ...match, participantA: a, participantB: b }), '13-15, corias won');
  assert.equal(render({ ...match, winnerParticipantId: null, participantA: a, participantB: b, result: { ...result, winnerId: null } }), '13-15');
  assert.equal(render({ ...match, winnerParticipantId: a.id, participantA: { ...a, userId: null }, participantB: b,
    result: { winnerId: -a.id, scores: { [-a.id]: { total: 16 }, [b.userId]: { total: 15 } } } }), '16-15, Tony Te Amo won');
  const { tournamentMatchView } = require('../../src/api/views');
  const pending = tournamentMatchView({ ...match, result: null, winnerParticipantId: null,
    pendingResult: { result } }, new Map([[a.id, a], [b.id, b]]));
  assert.equal(pending.pendingResult.winnerParticipantId, b.id);
  assert.equal(render(pending), '13-15, corias won');
});

test('head-to-head breaks a points tie using the canonical participant winner', () => {
  const c = { id: 200, userId: 300, status: 'active', seed: 4 };
  const aWin = { ...match, id: 200, participantAId: a.id, participantBId: c.id, winnerParticipantId: a.id,
    result: { winnerId: a.userId, scores: { [a.userId]: { total: 15 }, [c.userId]: { total: 10 } } } };
  const standings = buildStandings([a, b, c], [match, aWin], ['head_to_head']);
  assert.equal(standings[0].participant.id, b.id);
  assert.equal(standings[0].headToHeadWins, 1);
  assert.equal(standings[1].headToHeadWins, 0);
});

test('withdrawn opponents still supply their result identity when calculating standings', () => {
  const standings = buildStandings([a, { ...b, status: 'withdrawn' }], [match]);
  assert.equal(standings.length, 1);
  assert.equal(standings[0].wins, 0);
  assert.equal(standings[0].losses, 1);
  assert.equal(standings[0].vpDiff, -2);
});

test('byes and unresolvable deleted-account history retain their recorded winner', () => {
  assert.equal(matchWinnerParticipantId({ isBye: true, participantAId: a.id, winnerParticipantId: a.id }), a.id);
  assert.equal(matchWinnerParticipantId({ ...match, winnerParticipantId: b.id }, [a, { ...b, userId: null }]), b.id);
});

test('tournament reads never reinterpret legacy game winner metadata', () => {
  const staleGame = { ...match, result: { ...result, winnerId: a.userId } };
  assert.equal(matchWinnerParticipantId(staleGame), b.id);
  assert.equal(buildStandings([a, b], [staleGame])[0].participant.id, b.id);
  assert.equal(buildStandings([a, b], [{ ...staleGame, winnerParticipantId: null }])[0].draws, 1);
});

test('missing user scores never fall back to an overlapping participant ID', () => {
  assert.deepEqual(participantScore({ scores: { [a.id]: { total: 99 } } }, a), {});
  const guest = { ...a, userId: null };
  assert.deepEqual(participantScore(result, guest), {});
  const snapshot = tournamentResultSnapshot(result, [a, b]);
  assert.equal(participantScore(snapshot, { ...b, userId: null }).total, 15);
  assert.equal(buildStandings([a, { ...b, userId: null }], [{ ...match, result: snapshot }])[0].totalVp, 15);
});

test('write invariants reject unrelated winners, foreign tournaments and ambiguous identities', () => {
  assert.throws(() => assertMatchWinner({ ...match, winnerParticipantId: 999 }), /this match/);
  assert.throws(() => assertMatchWinner({ ...match, tournamentId: 5 }, [
    { ...a, tournamentId: 5 }, { ...b, tournamentId: 6 }
  ]), /this tournament/);
  assert.throws(() => winnerParticipantIdFromResult(result, b, { ...a, userId: b.userId }), /uniquely/);
  for (const winnerId of [0, '124', true, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => winnerParticipantIdFromResult({ winnerId }, a, b), /Invalid/);
  }
});

test('a deleted game player result key cannot grant UI controls to a matching user ID', () => {
  const { renderDetail, gameFixture } = require('../helpers/game-detail-harness');
  const { html } = renderDetail({ me: { id: 124, isAdmin: false }, game: gameFixture({
    players: [{ id: 124, userId: null, name: 'Deleted account' }, { id: 178, userId: 178, name: 'Tony' }]
  }) });
  assert.ok(!html.includes('data-game-result='));
});

test('team scoring and permissions keep roster IDs separate from colliding user IDs', () => {
  const { teamMatchProgress } = require('../../src/domain/team-tournaments');
  const { teamGamePermissions } = require('../../src/domain/team-game-permissions');
  const game = { playerIds: [a.userId, b.userId], status: 'completed', result };
  const progress = teamMatchProgress({ rosterAId: b.userId, rosterBId: a.userId,
    games: [{ slot: 1, game }] });
  assert.equal(progress.details[0].winnerSide, 'b');
  assert.equal(progress.gpA, 8);
  assert.equal(progress.gpB, 12);
  assert.equal(teamGamePermissions({ ...game, status: 'open' },
    { id: 200, captainUserId: 300 }, { id: 400, captainUserId: 500 }, { id: 200 }).canSubmit, false);
});

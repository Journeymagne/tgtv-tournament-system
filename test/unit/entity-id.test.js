const test = require('node:test');
const assert = require('node:assert/strict');
const { publicId, parsePublicId } = require('../../src/domain/entity-id');
const { publicUser, tournamentParticipantView, tournamentMatchView, gameView } = require('../../src/api/views');

test('overlapping internal IDs have distinct public references without changing legacy IDs', () => {
  const user = publicUser({ id: 124 });
  const participant = tournamentParticipantView({ id: 124, userId: 178 });
  const match = tournamentMatchView({ id: 124, winnerParticipantId: 108, gameId: 124 });
  const game = gameView({ id: 124, playerIds: [] }, []);
  assert.deepEqual([user.id, participant.id, match.id, game.id], [124, 124, 124, 124]);
  assert.deepEqual([user.publicId, participant.publicId, match.publicId, game.publicId],
    ['usr_124', 'tpt_124', 'match_124', 'game_124']);
  assert.equal(match.winnerParticipantPublicId, 'tpt_108');
  assert.throws(() => parsePublicId('tournamentParticipant', user.publicId), /namespace/);
  assert.equal(parsePublicId('tournamentParticipant', participant.publicId), '124');
});

test('public IDs preserve bigint precision and reject coerced or malformed IDs', () => {
  assert.equal(parsePublicId('user', publicId('user', 9007199254740993n)), '9007199254740993');
  for (const id of [0, -1, true, 1.2, '01', '1e3', ' 1', 9007199254740992]) {
    assert.throws(() => publicId('user', id), /Invalid/);
  }
});

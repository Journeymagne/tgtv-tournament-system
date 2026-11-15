const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateParticipantElo, calculateElo } = require("../../src/domain/elo");

for (const guestFirst of [false, true]) {
  for (const rating of [800, 1000, 1200]) {
    for (const [outcome, winnerId, score] of [["win", 7, 1], ["loss", -31, 0], ["draw", null, 0.5]]) {
      test(`guest Elo: ${outcome}, rating ${rating}, guest first ${guestFirst}`, () => {
        const participants = [{ userId: 7, resultKey: 7 }, { userId: null, resultKey: -31 }];
        if (guestFirst) participants.reverse();
        const ratings = new Map([[7, rating]]);
        const elo = calculateParticipantElo(participants, ratings, { winnerId });
        const expected = calculateElo(rating, 1000, score).deltaA;
        assert.equal(elo[7].delta + 0, expected + 0);
        assert.equal(elo[7].after, rating + expected);
        assert.deepEqual(elo[-31], { before: 1000, after: 1000, delta: 0, fixed: true });
        assert.equal(ratings.get(7), rating, "calculation must not mutate input ratings");
      });
    }
  }
}

test("two registered players retain symmetric Elo; two guests receive none", () => {
  const players = [{ userId: 7, resultKey: 7 }, { userId: 8, resultKey: 8 }];
  const elo = calculateParticipantElo(players, new Map([[7, 1000], [8, 1000]]), { winnerId: 8 });
  assert.equal(elo[7].delta, -16);
  assert.equal(elo[8].delta, 16);
  assert.equal(calculateParticipantElo(players.map(p => ({ ...p, userId: null })), new Map(), { winnerId: 8 }), null);
});

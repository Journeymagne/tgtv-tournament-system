const test = require("node:test");
const assert = require("node:assert/strict");

const { ELO_K, calculateElo } = require("../../src/domain/elo");

test("K равен 32", () => {
  assert.equal(ELO_K, 32);
});

test("победа при равных рейтингах даёт +16 и -16", () => {
  assert.deepEqual(calculateElo(1000, 1000, 1), { deltaA: 16, deltaB: -16 });
});

test("ничья при равных рейтингах не меняет рейтинги", () => {
  assert.deepEqual(calculateElo(1000, 1000, 0.5), { deltaA: 0, deltaB: -0 });
});

test("поражение при равных рейтингах даёт -16", () => {
  assert.deepEqual(calculateElo(1000, 1000, 0), { deltaA: -16, deltaB: 16 });
});

test("дельты всегда симметричны", () => {
  for (const [a, b, score] of [
    [1000, 1400, 1],
    [1400, 1000, 1],
    [1200, 1000, 0.5],
    [800, 1600, 0]
  ]) {
    const { deltaA, deltaB } = calculateElo(a, b, score);
    assert.equal(deltaA + deltaB, 0, `несимметрично для ${a}/${b}/${score}`);
  }
});

test("победа над сильным даёт больше, чем над слабым", () => {
  const overStronger = calculateElo(1000, 1400, 1).deltaA;
  const overWeaker = calculateElo(1400, 1000, 1).deltaA;
  assert.ok(overStronger > overWeaker);
  assert.ok(overStronger <= ELO_K);
});

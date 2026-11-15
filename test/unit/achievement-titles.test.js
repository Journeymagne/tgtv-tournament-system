const test = require("node:test");
const assert = require("node:assert/strict");
const { tournamentNumber } = require("../../src/domain/achievements");
test("tournament editions support decimal, E-prefixed and Roman numbers", () => {
  for (const [name, expected] of [["GachiChamp E10", 10], ["TGTT 3 Champ", 3], ["Yerevan Open I", 1], ["Cup XIV", 14], ["Paintmaster", null]]) {
    assert.equal(tournamentNumber(name), expected);
  }
  assert.equal(tournamentNumber("TGTT Champ", "Winner of Tournament E1"), 1);
  assert.equal(tournamentNumber("Champ E7", "2026 tournament"), 7);
  assert.equal(tournamentNumber("Обманули дурака на 4 кулака", "Победитель в Фистинге среди конфы"), null);
  assert.equal(tournamentNumber("Рамблер x2", "Двухкратный победитель вечерников!"), null);
});

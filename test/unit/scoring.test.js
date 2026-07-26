const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateApprovedOps,
  parseKillzone,
  calculateTieBreakers,
  calculateSubmittedResult,
  matchScoreFor
} = require("../../src/domain/scoring");
const { ValidationError } = require("../../src/http/io");

function ops(overrides = {}) {
  return { crit: 3, kill: 2, tac: 1, primary: "crit", faction: "Kasrkin", ...overrides };
}

test("итог складывается с бонусом за primary, округлённым вверх", () => {
  const score = calculateApprovedOps(ops({ crit: 5, kill: 2, tac: 1, primary: "crit" }));
  assert.equal(score.primaryScore, 5);
  assert.equal(score.primaryBonus, 3);
  assert.equal(score.total, 5 + 2 + 1 + 3);
});

test("бонус за чётный primary не округляется", () => {
  const score = calculateApprovedOps(ops({ crit: 4, kill: 0, tac: 0, primary: "crit" }));
  assert.equal(score.primaryBonus, 2);
  assert.equal(score.total, 6);
});

test("primary может указывать на kill и tac", () => {
  assert.equal(calculateApprovedOps(ops({ kill: 6, primary: "kill" })).primaryBonus, 3);
  assert.equal(calculateApprovedOps(ops({ tac: 3, primary: "tac" })).primaryBonus, 2);
});

test("faction приводится к каноническому имени", () => {
  assert.equal(calculateApprovedOps(ops({ faction: "xv26 stealth suits" })).faction,
    "XV26 Stealth Battlesuits");
  assert.equal(calculateApprovedOps(ops({ faction: "Tempestus Aquillons" })).faction,
    "Tempestus Aquilons");
});

test("недопустимые очки и Kill Team отклоняются", () => {
  assert.throws(() => calculateApprovedOps(ops({ crit: 7 })), ValidationError);
  assert.throws(() => calculateApprovedOps(ops({ primary: "nope" })), ValidationError);
  assert.throws(() => calculateApprovedOps(ops({ faction: "Nope" })), ValidationError);
});

test("parseKillzone принимает пустой ввод", () => {
  assert.equal(parseKillzone(undefined), null);
  assert.equal(parseKillzone({}), null);
});

test("parseKillzone проверяет справочники и layout", () => {
  assert.deepEqual(parseKillzone({ killzone: "Volkus", critOp: "Loot", layout: "3" }), {
    killzone: "Volkus",
    critOp: "Loot",
    layout: 3
  });
  assert.throws(() => parseKillzone({ killzone: "Nowhere" }), ValidationError);
  assert.throws(() => parseKillzone({ critOp: "Nothing" }), ValidationError);
  assert.throws(() => parseKillzone({ layout: "7" }), ValidationError);
});

test("тайбрейкер решается по primary", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 6, kill: 0, tac: 0, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 0, kill: 2, tac: 4, primary: "kill" }));
  const result = calculateTieBreakers(
    { enabled: true, apl: { 1: 5, 2: 5 } },
    1,
    2,
    scoreA,
    scoreB
  );
  assert.equal(result.decidedBy, "primary");
  assert.equal(result.winnerId, 1);
});

test("тайбрейкер решается по сумме crit и tac", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 4, kill: 0, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 0, kill: 4, tac: 2, primary: "kill" }));
  const result = calculateTieBreakers(
    { enabled: true, apl: { 1: 5, 2: 5 } },
    1,
    2,
    scoreA,
    scoreB
  );
  assert.equal(result.decidedBy, "critTac");
  assert.equal(result.winnerId, 1);
});

test("тайбрейкер решается по APL", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "kill" }));
  const result = calculateTieBreakers(
    { enabled: true, apl: { 1: 9, 2: 4 } },
    1,
    2,
    scoreA,
    scoreB
  );
  assert.equal(result.decidedBy, "apl");
  assert.equal(result.winnerId, 1);
});

test("при полном равенстве нужен победитель roll-off", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "kill" }));
  const input = { enabled: true, apl: { 1: 5, 2: 5 } };

  assert.throws(() => calculateTieBreakers(input, 1, 2, scoreA, scoreB), ValidationError);

  const decided = calculateTieBreakers({ ...input, rollOffWinnerId: 2 }, 1, 2, scoreA, scoreB);
  assert.equal(decided.decidedBy, "rollOff");
  assert.equal(decided.winnerId, 2);
  assert.equal(decided.rollOffWinnerId, 2);
});

test("roll-off не принимает постороннего игрока", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 2, kill: 2, tac: 2, primary: "kill" }));
  assert.throws(
    () =>
      calculateTieBreakers(
        { enabled: true, apl: { 1: 5, 2: 5 }, rollOffWinnerId: 99 },
        1,
        2,
        scoreA,
        scoreB
      ),
    ValidationError
  );
});

test("тайбрейкер требует APL обоих игроков и отклоняет пропуск", () => {
  const scoreA = calculateApprovedOps(ops({ crit: 6, kill: 0, tac: 0, primary: "crit" }));
  const scoreB = calculateApprovedOps(ops({ crit: 0, kill: 2, tac: 4, primary: "kill" }));
  assert.throws(
    () => calculateTieBreakers({ enabled: true }, 1, 2, scoreA, scoreB),
    ValidationError
  );
});

test("calculateSubmittedResult определяет победителя по сумме", () => {
  const result = calculateSubmittedResult(
    {
      scores: {
        1: ops({ crit: 6, kill: 6, tac: 6, primary: "crit" }),
        2: ops({ crit: 0, kill: 0, tac: 0, primary: "kill", faction: "Legionaries" })
      }
    },
    1,
    2
  );
  assert.equal(result.winnerId, 1);
  assert.equal(result.tiebreakers, null);
  assert.equal(result.scores[1].total, 21);
  assert.equal(result.scores[2].total, 0);
});

test("ничья без тайбрейкеров оставляет winnerId пустым", () => {
  const same = ops({ crit: 2, kill: 2, tac: 2, primary: "crit" });
  const result = calculateSubmittedResult(
    { scores: { 1: same, 2: { ...same, faction: "Legionaries" } } },
    1,
    2
  );
  assert.equal(result.winnerId, null);
});

test("matchScoreFor переводит результат в очки для Elo", () => {
  assert.equal(matchScoreFor({ winnerId: 1 }, 1, 2), 1);
  assert.equal(matchScoreFor({ winnerId: 2 }, 1, 2), 0);
  assert.equal(matchScoreFor({ winnerId: null }, 1, 2), 0.5);
});

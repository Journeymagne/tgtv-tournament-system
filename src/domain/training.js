const { randomInt } = require("node:crypto");
const questions = require("../training-data/questions.json");
const BANK_VERSION = "2026-10-15.1";
const byId = new Map(questions.map(question => [question.id, question]));

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sessionItems(mode) {
  const pool = questions.filter(question => mode === "mixed" || question.difficulty === Number(mode));
  return shuffled(pool).slice(0, 20).map(question => ({
    questionId: question.id,
    optionOrder: shuffled([0, 1, 2, 3]),
    selected: null,
    correct: null,
    answeredAt: null
  }));
}

module.exports = { questions, byId, BANK_VERSION, sessionItems };

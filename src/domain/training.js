const { randomInt } = require("node:crypto");
const questions = require("../training-data/questions.json");
const BANK_VERSION = "2026-10-22.1";
// This release only appends questions; all original IDs, options and answers are unchanged.
const COMPATIBLE_VERSIONS = ["2026-10-15.1", BANK_VERSION];
const byId = new Map(questions.map(question => [question.id, question]));

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sessionItem(question) {
  return {
    questionId: question.id,
    question: require('../../public/training/session-bank').snapshot(question),
    optionOrder: shuffled([0, 1, 2, 3]),
    selected: null,
    correct: null,
    answeredAt: null
  };
}
function sessionItems(mode, questionsInPool = questions) {
  const pool = questionsInPool.filter(question => mode === 'mixed' || question.difficulty === Number(mode));
  return shuffled(pool).slice(0, 20).map(sessionItem);
}

module.exports = { questions, byId, BANK_VERSION, COMPATIBLE_VERSIONS, sessionItems, sessionItem, shuffled };

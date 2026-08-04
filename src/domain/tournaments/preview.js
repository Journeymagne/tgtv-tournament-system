const { ValidationError } = require("../../http/io");
const { TOURNAMENT_FORMATS } = require("./constants");
const { validateSeedOrder } = require("./seeding");
const { buildSingleElimination } = require("./single-elimination");
const { buildSwissRoundOne } = require("./swiss");

function buildTournamentPreview(tournament, participants) {
  const active = validateSeedOrder(participants);
  if (tournament.format === TOURNAMENT_FORMATS.SINGLE_ELIMINATION) {
    return buildSingleElimination(active, tournament.singleEliminationSize);
  }
  if (tournament.format === TOURNAMENT_FORMATS.SWISS) {
    return buildSwissRoundOne(active, tournament.swissRoundCount);
  }
  throw new ValidationError("Choose single elimination or Swiss");
}

module.exports = { buildTournamentPreview };

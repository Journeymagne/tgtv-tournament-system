const { HttpError } = require("../http/io");
const roundsRepo = require("../db/repositories/tournament-rounds");

async function clearPreparedRounds(client, tournament) {
  if (tournament.status !== "registration_closed" || tournament.startedAt) return;
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  if (rounds.some((round) => round.status !== "not_ready" || round.startedAt)) {
    throw new HttpError(409, "An activated round cannot be replaced before tournament start");
  }
  if (rounds.length) {
    await client.query("DELETE FROM tournament_rounds WHERE tournament_id = $1", [tournament.id]);
  }
}

function requirePreparedFirstRound(rounds) {
  const first = rounds.find((round) => round.roundNumber === 1);
  if (!first || first.status !== "not_ready" || first.startedAt) {
    throw new HttpError(409, "Generate the first round before starting the tournament");
  }
  return first;
}

module.exports = { clearPreparedRounds, requirePreparedFirstRound };

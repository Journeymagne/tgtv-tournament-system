const { HttpError } = require("../http/io");
const roundsRepo = require("../db/repositories/tournament-rounds");
const { competitiveParticipants } = require("../domain/tournaments/seeding");
const { SWISS_ENTRY_LIMITS } = require("../domain/tournaments/constants");

function firstRoundEntryIssue({ tournament, participants, rosters }) {
  const team = tournament.participantMode === "team";
  if (team && rosters.some(roster => roster.status === "incomplete")) return { reason: "incompleteRosters" };
  const count = team ? rosters.filter(roster => ["registered", "active"].includes(roster.status)).length
    : competitiveParticipants(participants).length;
  const bracket = tournament.format === "single_elimination" ? Number(tournament.singleEliminationSize || 8) : 0;
  const minimum = bracket || SWISS_ENTRY_LIMITS.min;
  const maximum = bracket || SWISS_ENTRY_LIMITS.max;
  if (count < minimum) return { reason: team ? "missingRosters" : "missingPlayers", missing: minimum - count };
  if (count > maximum) return { reason: team ? "tooManyRosters" : "tooManyPlayers", maximum };
  if (team && count % 2) return { reason: "oddRosters" };
  return null;
}

async function clearPreparedRounds(client, tournament, expectedFirstRoundId) {
  if (tournament.status !== "registration_closed" || tournament.startedAt) return;
  const rounds = await roundsRepo.listByTournament(client, tournament.id);
  if (expectedFirstRoundId !== undefined && (rounds.find(round => round.roundNumber === 1)?.id ?? null) !== expectedFirstRoundId) {
    throw new HttpError(409, "First round preparation changed");
  }
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

module.exports = { firstRoundEntryIssue, clearPreparedRounds, requirePreparedFirstRound };

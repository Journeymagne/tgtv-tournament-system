const { HttpError, ValidationError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const tournaments = require("../db/repositories/tournaments");
const rounds = require("../db/repositories/tournament-rounds");
const tables = require("../db/repositories/tournament-tables");
const matches = require("../db/repositories/team-matches");
const teams = require("../db/repositories/player-teams");
const { validateTeamTables, numberTeamTables } = require("../domain/team-tournaments");
const { saveTableImage } = require("./tournament-table-images");
const { tournamentTableView } = require("./views");

async function context(client, user, params, forUpdate = false) {
  if (!user?.isAdmin) throw new HttpError(403, "Only administrators can edit round tables");
  const id = requirePositiveIntId(params.id, 404, "Tournament not found");
  const tournament = forUpdate ? await tournaments.lockById(client, id) : await tournaments.findById(client, id);
  if (!tournament) throw new HttpError(404, "Tournament not found");
  if (tournament.participantMode !== "team") throw new HttpError(409, "This is not a team tournament");
  if (!["registration_closed", "in_progress"].includes(tournament.status)) {
    throw new HttpError(409, "Round tables cannot be edited in this tournament state");
  }
  const roundId = requirePositiveIntId(params.roundId, 404, "Round not found");
  const round = (await rounds.listByTournament(client, id)).find(item => item.id === roundId);
  if (!round) throw new HttpError(404, "Round not found");
  const previous = round.metadata?.tables || await tables.listByTournament(client, id);
  return { tournament, round, previous };
}

function view(round, selected) {
  return { round: { id: round.id, roundNumber: round.roundNumber, updatedAt: round.updatedAt },
    tables: selected.map(tournamentTableView) };
}

async function getAdmin({ client, user, params }) {
  const { round, previous } = await context(client, user, params);
  return view(round, previous);
}

function tableMission(mission, table) {
  if (!table) return mission;
  const updated = { ...mission, killzone: table.killzone, layout: table.deployment };
  if (table.imageId) updated.imageId = table.imageId;
  else delete updated.imageId;
  return updated;
}

function environmentTables(environment, selected) {
  if (!environment?.assignments) return environment;
  return { ...environment, assignments: environment.assignments.map(assignment => ({
    ...assignment, mission: tableMission(assignment.mission, selected.find(table => table.id === assignment.tableId))
  })) };
}

async function updateAdmin({ client, user, params, body = {} }) {
  const { tournament, round, previous } = await context(client, user, params, true);
  if (Object.keys(body).some(key => !["tables", "expectedUpdatedAt"].includes(key))) {
    throw new ValidationError("Only round tables can be changed here");
  }
  if (!Object.hasOwn(body, "expectedUpdatedAt") || body.expectedUpdatedAt !== round.updatedAt) {
    throw new HttpError(409, "Round changed. Reopen the table editor and try again");
  }
  const allowed = new Set(["id", "tableNumber", "killzone", "deployment", "imageId", "imageData"]);
  const input = numberTeamTables(validateTeamTables(body.tables));
  if (input.some(table => Object.keys(table).some(key => !allowed.has(key))) ||
      input.some(table => !previous.some(old => old.id === table.id)) ||
      new Set(input.map(table => table.id)).size !== previous.length) {
    throw new ValidationError("Include each existing round table exactly once");
  }
  // Keep slot IDs and their order: captain assignments refer to these IDs.
  const selected = [];
  for (const old of previous) {
    const table = input.find(item => item.id === old.id);
    selected.push({ id: old.id, tournamentId: tournament.id, tableNumber: table.tableNumber,
      killzone: table.killzone, deployment: Number(table.deployment),
      imageId: await saveTableImage(client, tournament.id, table, old) });
  }
  const updated = await rounds.update(client, round.id, { metadata: { ...round.metadata, tables: selected } });
  // Only terrain is refreshed in existing assignments and personal-game links.
  // Saved captain choices must also retain the new terrain if a pairing action is undone.
  for (const match of await matches.listByRound(client, round.id)) {
    if (match.environment || match.pairingHistory.length) {
      await matches.update(client, match.id, {
        environment: environmentTables(match.environment, selected),
        pairingHistory: match.pairingHistory.map(entry => ({ ...entry, before: {
          ...entry.before, environment: environmentTables(entry.before?.environment, selected)
        } }))
      });
    }
  }
  await matches.updateRoundTableMissions(client, round.id, selected);
  await teams.audit(client, { tournamentId: tournament.id, actorUserId: user.id,
    eventType: "team_round_tables_update", entityType: "round", entityId: round.id,
    before: { tables: previous }, after: { tables: selected } });
  return view(updated, selected);
}

module.exports = { getAdmin, updateAdmin };

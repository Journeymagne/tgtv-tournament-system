const { HttpError } = require("../http/io");
const access = require("../db/repositories/access");
const tournaments = require("../db/repositories/tournaments");
const { canManageTournament, canManageJudges, canCreateTournament, canOpenAdministration } = require("../domain/access");

async function authorize({ client, user, params, route }) {
  if (!route.permission) return user;
  if (!user) throw new HttpError(401, "You need to sign in");
  if (route.permission === "super") {
    if (!user.isSuperAdmin) throw new HttpError(403, "Super administrator rights required");
    return user;
  }
  if (route.permission === "administration") {
    if (!canOpenAdministration(user)) throw new HttpError(403, "Administration access required");
    return user;
  }
  if (route.permission === "tournaments.create") {
    if (!canCreateTournament(user)) throw new HttpError(403, "Tournament creation permission required");
    return user;
  }
  let id = Number(params.id);
  if (route.permission === "game.manage") {
    const game = await require("./games").findGame(client, params.id);
    if (user.isAdmin) return user;
    const view = await require("./games").viewOf(client, game);
    id = view.tournament?.id || view.teamTournamentGame?.tournamentId || view.teamMatch?.tournamentId;
    if (!id) throw new HttpError(403, "Administrator rights required");
  }
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, "Tournament not found");
  const tournament = route.tx ? await tournaments.lockById(client, id) : await tournaments.findById(client, id);
  if (!tournament) throw new HttpError(404, "Tournament not found");
  // Refresh after acquiring the tournament lock: a preceding judge revocation
  // must be visible even if this request waited for that transaction.
  user = await access.hydrate(client, user);
  access.assertActive(user);
  const allowed = route.permission === "judges.manage"
    ? canManageJudges(user, tournament) : canManageTournament(user, tournament);
  if (!allowed) throw new HttpError(403, "You do not have permission to manage this tournament");
  return user;
}

module.exports = { authorize };

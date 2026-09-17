const { HttpError, ValidationError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const tournaments = require("../db/repositories/tournaments");
const participants = require("../db/repositories/tournament-participants");
const rosters = require("../db/repositories/team-rosters");
const audit = require("../db/repositories/tournament-audit-events");
const teams = require("../db/repositories/player-teams");

function paymentHandler(team) {
  return async ({ client, user, params, body }) => {
    if (!user?.isAdmin) throw new HttpError(403, "Administrator rights required");
    if (typeof body.paid !== "boolean") throw new ValidationError("Paid must be true or false");
    const id = requirePositiveIntId(params.id, 404, "Tournament not found");
    const tournament = await tournaments.lockById(client, id);
    if (!tournament || (tournament.participantMode === "team") !== team) throw new HttpError(404, "Tournament not found");
    const entryId = requirePositiveIntId(team ? params.rosterId : params.participantId, 404, "Registration not found");
    const entry = team ? await rosters.findById(client, entryId, true) : await participants.lockById(client, entryId);
    if (!entry || entry.tournamentId !== id) throw new HttpError(404, "Registration not found");
    const repo = team ? rosters : participants;
    const updated = await repo.update(client, entryId, { paid: body.paid });
    if (entry.paid !== updated.paid) {
      const event = {
        tournamentId: id, actorUserId: user.id,
        eventType: "registration_payment_update", entityType: team ? "roster" : "participant", entityId: entryId,
        before: { paid: entry.paid }, after: { paid: updated.paid }
      };
      if (team) await teams.audit(client, { ...event, teamId: entry.teamId });
      else await audit.insert(client, event);
    }
    return { id: entryId, paid: updated.paid };
  };
}

module.exports = { participantPayment: paymentHandler(false), rosterPayment: paymentHandler(true) };

const { ValidationError } = require("../../http/io");
const { requireKillTeam } = require("../kill-teams");
const { participantResultKey } = require("./results");

function normalizeFactionCount(value) {
  const count = Number(value);
  if (!["number", "string"].includes(typeof value) || !Number.isInteger(count) || count < 1 || count > 3) {
    throw new ValidationError("Faction count must be 1, 2, or 3");
  }
  return count;
}

function registeredFactions(participant = {}) {
  if (participant.factions?.length) return participant.factions;
  const faction = participant.faction || participant.factionSnapshot;
  return faction ? [faction] : [];
}

function normalizeFactions(body, tournament, { allowEmpty = false } = {}) {
  const values = Object.hasOwn(body, "factions") ? body.factions : [body.faction || ""];
  if (!Array.isArray(values) || values.some(value => typeof value !== "string")) {
    throw new ValidationError("Choose valid factions");
  }
  const factions = values.filter(value => value.trim()).map(requireKillTeam);
  if (!allowEmpty && !factions.length) throw new ValidationError("Choose at least one faction");
  if (factions.length > (tournament.factionCount || 1)) {
    throw new ValidationError("Too many factions for this tournament");
  }
  if (new Set(factions).size !== factions.length) throw new ValidationError("Factions must be unique");
  return factions;
}

function validateResultFactions(tournament, result, participants) {
  if ((tournament.factionCount || 1) === 1) return;
  for (const participant of participants) {
    const factions = registeredFactions(participant);
    if (factions.length && !factions.includes(result.scores?.[participantResultKey(participant)]?.faction)) {
      throw new ValidationError("Choose a registered faction for each player");
    }
  }
}

module.exports = { normalizeFactionCount, registeredFactions, normalizeFactions, validateResultFactions };

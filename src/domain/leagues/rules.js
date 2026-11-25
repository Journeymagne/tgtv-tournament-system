const { ValidationError } = require("../../http/io");
const { DEFAULT_DOUBLES_TIEBREAKERS } = require("../tournaments/constants");

const DEFAULT_SCALE = [10, 8, 6, 4, 0];
const COMMON = ["total_vp", "vp_diff", "individual_wins", "tac_op", "events"];
const METRICS = [...COMMON, "strength_of_schedule", "average_sos", "buchholz", "head_to_head"];

function leagueFormat(tournament) {
  if (tournament.participantMode !== "team") return "solo";
  return ["doubles", "wtc_doubles"].includes(tournament.pairingType) ? "doubles" : "team";
}

function supportedMetrics(tournament) {
  const format = leagueFormat(tournament);
  if (format === "solo") return [...COMMON, "strength_of_schedule", "buchholz", "head_to_head"];
  if (format === "team") return [...COMMON];
  return [...COMMON, tournament.pairingType === "wtc_doubles" ? "average_sos" : "strength_of_schedule"];
}

function supportedTrackMetrics(track, formats) {
  if (track === "solo") return supportedMetrics({});
  const allowed = new Set(COMMON);
  if (formats.includes("doubles")) {
    allowed.add("average_sos");
    allowed.add("strength_of_schedule");
  }
  return [...allowed];
}

function resolveTournamentOrder(tournament) {
  if (leagueFormat(tournament) === "solo") return [...(tournament.tiebreakerOrder ?? [])];
  if (tournament.pairingType === "wtc_doubles") return ["individual_wins", "average_sos", "total_vp", "tac_op"];
  const fallback = tournament.pairingType === "doubles" ? DEFAULT_DOUBLES_TIEBREAKERS : ["individual_wins", "total_vp", "tac_op"];
  return [...(tournament.teamTiebreakerOrder ?? fallback)];
}

function validateLeagueRules(rule = {}, sources = []) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new ValidationError("Invalid league rules");
  const { primary = "tp", scale = DEFAULT_SCALE, criteria = [] } = rule;
  if (!["tp", "place"].includes(primary)) throw new ValidationError("Choose tournament points or place points");
  if (!Array.isArray(scale) || !scale.length || scale.length > 256 ||
    scale.some((value, i) => !Number.isSafeInteger(value) || value < 0 || (i > 0 && value > scale[i - 1]))) {
    throw new ValidationError("Use a non-increasing place scale of nonnegative integers, ending with the value for later places");
  }
  if (!Array.isArray(criteria) || criteria.length > METRICS.length * 2) throw new ValidationError("Invalid league criteria");
  const seen = new Set();
  const normalized = criteria.map(criterion => {
    const definition = typeof criterion === "string" ? { metric: criterion } : criterion;
    const { metric, aggregate = "sum", name } = definition || {};
    if (!METRICS.includes(metric) || !["sum", "max"].includes(aggregate) ||
        (["events", "head_to_head"].includes(metric) && aggregate !== "sum")) {
      throw new ValidationError("Invalid league metric or aggregation");
    }
    if (name != null && (typeof name !== "string" || name.trim().length > 80)) throw new ValidationError("Invalid criterion name");
    const key = metric + ":" + aggregate;
    if (seen.has(key)) throw new ValidationError("Each metric and aggregation can appear only once");
    seen.add(key);
    for (const source of sources) {
      const tournament = source.tournament || source;
      if (!supportedMetrics(tournament).includes(metric)) {
        throw new ValidationError((tournament.name || tournament.id || "Tournament") + ": incompatible metric " + metric);
      }
    }
    return { metric, aggregate, ...(name?.trim() ? { name: name.trim() } : {}) };
  });
  return { primary, scale: [...scale], criteria: normalized,
    ...(rule.sourceTournamentId != null ? { sourceTournamentId: rule.sourceTournamentId, sourceName: rule.sourceName || "" } : {}) };
}

module.exports = { DEFAULT_SCALE, METRICS, leagueFormat, supportedMetrics, supportedTrackMetrics, resolveTournamentOrder, validateLeagueRules };

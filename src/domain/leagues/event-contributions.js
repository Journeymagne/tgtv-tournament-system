const { leagueFormat, supportedMetrics, validateLeagueRules } = require("./rules");
const { soloContributions } = require("./solo-contributions");
const { teamContributions } = require("./team-contributions");

function buildEventContributions(bundle, bindings = {}, rule = {}) {
  const { tournament } = bundle;
  const format = leagueFormat(tournament);
  const track = format === "solo" ? "solo" : "org";
  const result = { format, track, status: "pending", supportedMetrics: supportedMetrics(tournament),
    contributions: [], encounters: [], issues: [], identities: [] };
  const normalized = validateLeagueRules(rule);
  if (["draft", "cancelled"].includes(tournament.status)) return { ...result, status: "excluded" };
  const blocking = [];
  const missing = (field, context = {}) => {
    blocking.push({ code: "missing_data", tournamentId: tournament.id, field, ...context, action: "correct_published_results" });
  };
  for (const { metric } of normalized.criteria) {
    if (!result.supportedMetrics.includes(metric)) blocking.push({ code: "incompatible_metric", tournamentId: tournament.id,
      field: metric, action: "change_league_criteria" });
  }
  if (tournament.status !== "completed") return { ...result, issues: blocking, status: blocking.length ? "needs_data" : "pending" };
  const publication = tournament.finalResults;
  if (!Array.isArray(publication) || !publication.length) missing("finalResults");
  else {
    const idField = track === "solo" ? "participantId" : "rosterId";
    const ids = publication.map(row => row?.[idField]);
    if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || (new Set(ids)).size !== ids.length) {
      missing(idField);
    } else {
      const base = { tournamentId: tournament.id, tournamentName: tournament.name, tournamentSlug: tournament.slug,
        tournamentDate: tournament.startsAt || tournament.completedAt, format, track, pairingType: tournament.pairingType ?? null };
      const output = { ...result, missing };
      if (track === "solo") soloContributions(bundle, bindings, normalized, output, base);
      else teamContributions(bundle, output, base);
    }
  }
  for (const source of result.contributions) {
    const context = { sourceKey: source.sourceKey };
    if (normalized.primary === "tp" && !Number.isFinite(source.rawTp)) missing(track === "solo" ? "matchPoints" : "teamTournamentPoints", context);
    if (normalized.primary === "place" && (!Number.isSafeInteger(source.rank) || source.rank < 1)) missing("rank", context);
    for (const { metric } of normalized.criteria) {
      if (["head_to_head", "events"].includes(metric) || !result.supportedMetrics.includes(metric)) continue;
      if (!Number.isFinite(source.metrics[metric])) missing(metric, context);
    }
    if (source.identityStatus === "guest") result.issues.push({ code: "guest", tournamentId: tournament.id, participantId: source.participantId,
      sourceKey: source.sourceKey, field: "registerNickname", action: "confirm_registry_identity" });
  }
  if (blocking.length) return { ...result, status: "needs_data", issues: [...blocking, ...result.issues], contributions: [], encounters: [] };
  return { ...result, status: "counted" };
}

module.exports = { buildEventContributions };


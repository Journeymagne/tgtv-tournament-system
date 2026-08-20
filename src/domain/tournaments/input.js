const { ValidationError } = require("../../http/io");
const {
  normalizeName,
  profileText,
  requiredProfileText,
  requireInteger
} = require("../validation");
const {
  TOURNAMENT_FORMATS,
  RATING_POLICIES,
  CHALLENGE_CREDIT_POLICIES,
  VENUE_MODES,
  SINGLE_ELIMINATION_SIZES,
  STANDINGS_TIEBREAKERS
} = require("./constants");

const NAME_MAX = 120;
const DESCRIPTION_MAX = 6000;
const RULES_MAX = 6000;
const GAME_SYSTEM_MAX = 80;
const SEASON_ID_MAX = 80;
const FACTION_RULES_MAX = 1000;
const RULES_LINK_MAX = 2_800_000;
const GAME_SYSTEMS = ["Warhammer 40k Kill Team"];

function optionalTournamentText(value, label, maxLength) {
  return profileText(value, label, maxLength);
}

function requiredTournamentText(value, label, maxLength) {
  return requiredProfileText(value, label, maxLength);
}

function normalizeFormat(value) {
  const format = String(value || TOURNAMENT_FORMATS.SINGLE_ELIMINATION);
  if (!Object.values(TOURNAMENT_FORMATS).includes(format)) {
    throw new ValidationError("Choose single elimination or Swiss");
  }
  return format;
}

function normalizeSwissRoundCount(value, format) {
  if (format !== TOURNAMENT_FORMATS.SWISS) return null;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new ValidationError("Swiss round count must be 1 or greater");
  }
  return count;
}

function normalizeSingleEliminationSize(value, format) {
  if (format !== TOURNAMENT_FORMATS.SINGLE_ELIMINATION) return null;
  const size = requireInteger(value || 8, {
    min: 8,
    max: 64,
    message: "Single elimination bracket size must be 8, 16, 32, or 64"
  });
  if (!SINGLE_ELIMINATION_SIZES.includes(size)) {
    throw new ValidationError("Single elimination bracket size must be 8, 16, 32, or 64");
  }
  return size;
}

function normalizePolicy(value, allowed, fallback, label) {
  const policy = String(value || fallback);
  if (!allowed.includes(policy)) throw new ValidationError(`Choose a valid ${label}`);
  return policy;
}

function normalizeTiebreakerOrder(value) {
  const input = Array.isArray(value) ? value : [];
  if (input.length > 4) throw new ValidationError("Choose up to four standings tiebreakers");
  const seen = new Set();
  const result = [];
  for (const item of input) {
    const key = String(item || "");
    if (!STANDINGS_TIEBREAKERS.includes(key)) {
      throw new ValidationError("Choose valid standings tiebreakers");
    }
    if (seen.has(key)) throw new ValidationError("Standings tiebreakers must be unique");
    seen.add(key);
    result.push(key);
  }
  return result;
}

function normalizeStartsAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError("Start date must be valid");
  return date.toISOString();
}

function normalizeGameSystem(value) {
  const gameSystem = optionalTournamentText(value, "Game system", GAME_SYSTEM_MAX) || GAME_SYSTEMS[0];
  if (!GAME_SYSTEMS.includes(gameSystem)) {
    throw new ValidationError("Choose a valid game system");
  }
  return gameSystem;
}

function normalizeSeasonId(value) {
  const seasonId = optionalTournamentText(value, "Season", SEASON_ID_MAX) || "2026-q2-dataslate";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(seasonId)) {
    throw new ValidationError("Choose a valid season");
  }
  return seasonId;
}

function normalizeRulesLink(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > RULES_LINK_MAX) {
    throw new ValidationError("Tournament rules link or PDF is too large");
  }
  if (/^https?:\/\/\S+$/i.test(text)) return text;
  if (/^data:application\/pdf;base64,[a-z0-9+/=]+$/i.test(text)) return text;
  throw new ValidationError("Tournament rules link must be an http(s) URL or a PDF file");
}

function normalizeTournamentPatch(body = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, "tournamentRules")) {
    const tournamentRules = optionalTournamentText(body.tournamentRules, "Tournament rules", RULES_MAX);
    patch.description = tournamentRules;
    patch.rulesSummary = tournamentRules;
  }
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    patch.name = optionalTournamentText(body.name, "Tournament name", NAME_MAX);
  }
  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    patch.description = optionalTournamentText(body.description, "Description", DESCRIPTION_MAX);
  }
  if (Object.prototype.hasOwnProperty.call(body, "gameSystem")) {
    patch.gameSystem = normalizeGameSystem(body.gameSystem);
  }
  if (Object.prototype.hasOwnProperty.call(body, "startsAt")) {
    patch.startsAt = normalizeStartsAt(body.startsAt);
  }
  if (Object.prototype.hasOwnProperty.call(body, "rulesSummary")) {
    patch.rulesSummary = optionalTournamentText(body.rulesSummary, "Rules summary", RULES_MAX);
  }
  if (Object.prototype.hasOwnProperty.call(body, "format")) {
    patch.format = normalizeFormat(body.format);
  }

  const format = patch.format || body.format;
  if (Object.prototype.hasOwnProperty.call(body, "swissRoundCount")) {
    patch.swissRoundCount = normalizeSwissRoundCount(body.swissRoundCount, normalizeFormat(format));
  } else if (patch.format && patch.format !== TOURNAMENT_FORMATS.SWISS) {
    patch.swissRoundCount = null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "singleEliminationSize")) {
    patch.singleEliminationSize = normalizeSingleEliminationSize(
      body.singleEliminationSize,
      normalizeFormat(format)
    );
  } else if (patch.format === TOURNAMENT_FORMATS.SINGLE_ELIMINATION) {
    patch.singleEliminationSize = normalizeSingleEliminationSize(8, patch.format);
  } else if (patch.format && patch.format !== TOURNAMENT_FORMATS.SINGLE_ELIMINATION) {
    patch.singleEliminationSize = null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "tiebreakerOrder")) {
    patch.tiebreakerOrder = normalizeTiebreakerOrder(body.tiebreakerOrder);
  }
  if (Object.prototype.hasOwnProperty.call(body, "rulesLink")) {
    patch.rulesLink = normalizeRulesLink(body.rulesLink);
  }
  if (Object.prototype.hasOwnProperty.call(body, "ratingPolicy")) {
    patch.ratingPolicy = normalizePolicy(body.ratingPolicy, RATING_POLICIES, "ranked", "rating policy");
  }
  if (Object.prototype.hasOwnProperty.call(body, "challengeCreditPolicy")) {
    patch.challengeCreditPolicy = normalizePolicy(
      body.challengeCreditPolicy,
      CHALLENGE_CREDIT_POLICIES,
      "count",
      "challenge credit policy"
    );
  }
  if (Object.prototype.hasOwnProperty.call(body, "seasonId")) {
    patch.seasonId = normalizeSeasonId(body.seasonId);
  }
  if (Object.prototype.hasOwnProperty.call(body, "venueMode")) {
    patch.venueMode = normalizePolicy(body.venueMode, VENUE_MODES, "tts", "venue");
  }
  return patch;
}

function normalizeNewTournament(body = {}, ownerUserId, slug) {
  const patch = normalizeTournamentPatch({
    format: TOURNAMENT_FORMATS.SINGLE_ELIMINATION,
    gameSystem: "Warhammer 40k Kill Team",
    seasonId: "2026-q2-dataslate",
    venueMode: "tts",
    singleEliminationSize: 8,
    ratingPolicy: "ranked",
    challengeCreditPolicy: "count",
    ...body
  });
  return {
    ownerUserId,
    slug,
    name: patch.name || "",
    description: patch.description || "",
    gameSystem: patch.gameSystem || "Warhammer 40k Kill Team",
    startsAt: patch.startsAt || null,
    rulesSummary: patch.rulesSummary || "",
    rulesLink: patch.rulesLink || "",
    format: patch.format || TOURNAMENT_FORMATS.SINGLE_ELIMINATION,
    swissRoundCount: patch.swissRoundCount || null,
    singleEliminationSize: patch.singleEliminationSize || null,
    tiebreakerOrder: patch.tiebreakerOrder || [],
    ratingPolicy: patch.ratingPolicy || "ranked",
    challengeCreditPolicy: patch.challengeCreditPolicy || "count",
    seasonId: patch.seasonId || "2026-q2-dataslate",
    venueMode: patch.venueMode || "tts"
  };
}

function validatePublishable(tournament) {
  requiredTournamentText(tournament.name, "Tournament name", NAME_MAX);
  requiredTournamentText(tournament.gameSystem, "Game system", GAME_SYSTEM_MAX);
  if (!tournament.startsAt) throw new ValidationError("Start date is required");
  normalizeFormat(tournament.format);
  if (tournament.format === TOURNAMENT_FORMATS.SWISS && !tournament.swissRoundCount) {
    throw new ValidationError("Swiss round count is required");
  }
  if (tournament.format === TOURNAMENT_FORMATS.SINGLE_ELIMINATION) {
    normalizeSingleEliminationSize(tournament.singleEliminationSize, tournament.format);
  }
  normalizeTiebreakerOrder(tournament.tiebreakerOrder);
  normalizeRulesLink(tournament.rulesLink);
  normalizeSeasonId(tournament.seasonId);
  normalizePolicy(tournament.venueMode, VENUE_MODES, "tts", "venue");
}

function normalizeParticipantName(value) {
  const name = normalizeName(value);
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("Participant name must be 2-80 characters");
  }
  return name;
}

function participantNameKey(value) {
  return normalizeName(value).toLowerCase();
}

function normalizeFactionRules(value) {
  return optionalTournamentText(value, "Faction rules", FACTION_RULES_MAX);
}

module.exports = {
  normalizeTournamentPatch,
  normalizeNewTournament,
  validatePublishable,
  normalizeParticipantName,
  participantNameKey,
  normalizeFactionRules,
  normalizeFormat,
  normalizeTiebreakerOrder,
  normalizeSingleEliminationSize,
  normalizeRulesLink
};

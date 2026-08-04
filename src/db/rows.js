const USER_COLUMNS = `
  id, name, name_key, password_hash, avatar_data, register_nickname,
  telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at
`;

const CHALLENGE_COLUMNS = `
  id, from_user_id, to_user_id, status, game_id, share_token, created_at, updated_at
`;

const GAME_COLUMNS = `
  id, challenge_id, player_ids, status, created_at,
  submitted_by, submitted_at, pending_result, result, elo, source_type, source_id
`;

const FEEDBACK_COLUMNS = `
  id, user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at
`;

const TOURNAMENT_COLUMNS = `
  id, owner_user_id, slug, name, description, game_system, starts_at,
  rules_summary, rules_link, status, format, swiss_round_count,
  single_elimination_size, tiebreaker_order, rating_policy,
  challenge_credit_policy, final_results, published_at, started_at,
  completed_at, cancelled_at, created_at, updated_at
`;

const TOURNAMENT_PARTICIPANT_COLUMNS = `
  id, tournament_id, user_id, display_name, display_name_key, faction,
  faction_rules, seed, status, source, joined_at, withdrawn_at, removed_at,
  placed_at, updated_at
`;

const TOURNAMENT_ROUND_COLUMNS = `
  id, tournament_id, round_number, status, generated_by, metadata,
  started_at, completed_at, created_at, updated_at
`;

const TOURNAMENT_MATCH_COLUMNS = `
  id, tournament_id, round_id, round_number, bracket_position, status,
  is_bye, participant_a_id, participant_b_id, source_match_a_id,
  source_match_b_id, winner_participant_id, pending_result, result,
  match_points, elo, game_id, submitted_by_user_id, completed_at, created_at,
  updated_at
`;

const TOURNAMENT_AUDIT_EVENT_COLUMNS = `
  id, tournament_id, actor_user_id, event_type, entity_type, entity_id,
  before, after, metadata, created_at
`;

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// Prefixes each column in a COLUMNS constant with a table alias, e.g.
// aliasColumns(USER_COLUMNS, "u") => "u.id, u.name, ...". Lets joined
// queries reuse the same column list the unqualified selects use, so a
// column added to a *_COLUMNS constant is picked up everywhere without
// hand-copying the list.
function aliasColumns(columns, alias) {
  return columns
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .map((column) => `${alias}.${column}`)
    .join(", ");
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    passwordHash: row.password_hash,
    avatarData: row.avatar_data || null,
    registerNickname: row.register_nickname || "",
    telegramContact: row.telegram_contact || "",
    challengeCredits: Array.isArray(row.challenge_credits) ? row.challenge_credits : [],
    rating: row.rating,
    isAdmin: row.is_admin,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status,
    gameId: row.game_id,
    shareToken: row.share_token || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    challengeId: row.challenge_id,
    playerIds: row.player_ids || [],
    status: row.status,
    createdAt: toIso(row.created_at),
    submittedBy: row.submitted_by,
    submittedAt: toIso(row.submitted_at),
    pendingResult: row.pending_result,
    result: row.result,
    elo: row.elo,
    sourceType: row.source_type || "challenge",
    sourceId: row.source_id || null
  };
}

function mapFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    screen: row.screen,
    description: row.description,
    status: row.status || "open",
    resolvedBy: row.resolved_by,
    resolvedAt: toIso(row.resolved_at),
    updatedAt: toIso(row.updated_at),
    createdAt: toIso(row.created_at)
  };
}

function mapTournament(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    slug: row.slug,
    name: row.name || "",
    description: row.description || "",
    gameSystem: row.game_system || "",
    startsAt: toIso(row.starts_at),
    rulesSummary: row.rules_summary || "",
    rulesLink: row.rules_link || "",
    status: row.status,
    format: row.format,
    swissRoundCount: row.swiss_round_count,
    singleEliminationSize: row.single_elimination_size,
    tiebreakerOrder: row.tiebreaker_order || [],
    ratingPolicy: row.rating_policy || "ranked",
    challengeCreditPolicy: row.challenge_credit_policy || "count",
    finalResults: row.final_results || null,
    participantCount: row.participant_count === undefined ? undefined : Number(row.participant_count || 0),
    roundCount: row.round_count === undefined ? undefined : Number(row.round_count || 0),
    publishedAt: toIso(row.published_at),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    cancelledAt: toIso(row.cancelled_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTournamentParticipant(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    userId: row.user_id,
    displayName: row.display_name,
    displayNameKey: row.display_name_key,
    faction: row.faction || "",
    factionRules: row.faction_rules || "",
    seed: row.seed,
    status: row.status,
    source: row.source,
    joinedAt: toIso(row.joined_at),
    withdrawnAt: toIso(row.withdrawn_at),
    removedAt: toIso(row.removed_at),
    placedAt: toIso(row.placed_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTournamentRound(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundNumber: row.round_number,
    status: row.status,
    generatedBy: row.generated_by,
    metadata: row.metadata || null,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTournamentMatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    roundId: row.round_id,
    roundNumber: row.round_number,
    bracketPosition: row.bracket_position,
    status: row.status,
    isBye: Boolean(row.is_bye),
    participantAId: row.participant_a_id,
    participantBId: row.participant_b_id,
    sourceMatchAId: row.source_match_a_id,
    sourceMatchBId: row.source_match_b_id,
    winnerParticipantId: row.winner_participant_id,
    pendingResult: row.pending_result || null,
    result: row.result || null,
    matchPoints: row.match_points || null,
    elo: row.elo || null,
    gameId: row.game_id,
    submittedByUserId: row.submitted_by_user_id,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapTournamentAuditEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    before: row.before || null,
    after: row.after || null,
    metadata: row.metadata || null,
    createdAt: toIso(row.created_at)
  };
}

module.exports = {
  USER_COLUMNS,
  CHALLENGE_COLUMNS,
  GAME_COLUMNS,
  FEEDBACK_COLUMNS,
  TOURNAMENT_COLUMNS,
  TOURNAMENT_PARTICIPANT_COLUMNS,
  TOURNAMENT_ROUND_COLUMNS,
  TOURNAMENT_MATCH_COLUMNS,
  TOURNAMENT_AUDIT_EVENT_COLUMNS,
  toIso,
  aliasColumns,
  mapUser,
  mapChallenge,
  mapGame,
  mapFeedback,
  mapTournament,
  mapTournamentParticipant,
  mapTournamentRound,
  mapTournamentMatch,
  mapTournamentAuditEvent
};

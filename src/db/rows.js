const USER_COLUMNS = `
  id, name, name_key, password_hash, avatar_data, register_nickname,
  telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at
`;

const CHALLENGE_COLUMNS = `
  id, from_user_id, to_user_id, status, game_id, share_token, created_at, updated_at
`;

const GAME_COLUMNS = `
  id, challenge_id, player_ids, status, created_at,
  submitted_by, submitted_at, pending_result, result, elo
`;

const FEEDBACK_COLUMNS = `
  id, user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at
`;

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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
    elo: row.elo
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

module.exports = {
  USER_COLUMNS,
  CHALLENGE_COLUMNS,
  GAME_COLUMNS,
  FEEDBACK_COLUMNS,
  toIso,
  mapUser,
  mapChallenge,
  mapGame,
  mapFeedback
};

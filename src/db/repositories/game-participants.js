function mapParticipant(row) {
  if (!row) return null;
  return {
    id: row.id,
    gameId: row.game_id,
    slot: row.slot,
    userId: row.user_id,
    tournamentParticipantId: row.tournament_participant_id,
    resultKey: row.result_key,
    displayNameSnapshot: row.display_name_snapshot,
    factionSnapshot: row.faction_snapshot || "",
    user: row.user_id
      ? {
          id: row.user_id,
          name: row.user_name || row.display_name_snapshot,
          avatarData: row.avatar_data || null,
          registerNickname: row.register_nickname || "",
          telegramContact: row.telegram_contact || "",
          rating: row.rating,
          isAdmin: Boolean(row.is_admin),
          createdAt: row.user_created_at instanceof Date
            ? row.user_created_at.toISOString()
            : row.user_created_at || null
        }
      : null
  };
}

async function replaceForGame(client, gameId, participants) {
  await client.query("DELETE FROM game_participants WHERE game_id = $1", [gameId]);
  const saved = [];
  for (let index = 0; index < participants.length; index += 1) {
    const participant = participants[index];
    const { rows } = await client.query(
      `INSERT INTO game_participants (
         game_id, slot, user_id, tournament_participant_id, result_key,
         display_name_snapshot, faction_snapshot
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        gameId,
        index + 1,
        participant.userId || null,
        participant.tournamentParticipantId || null,
        participant.resultKey,
        participant.displayNameSnapshot,
        participant.factionSnapshot || ""
      ]
    );
    saved.push(mapParticipant(rows[0]));
  }
  return saved;
}

async function replaceFromUserIds(client, gameId, userIds) {
  const { rows } = await client.query(
    `SELECT id, name FROM users WHERE id = ANY($1::int[])`,
    [userIds]
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return replaceForGame(
    client,
    gameId,
    userIds.map((userId) => ({
      userId,
      tournamentParticipantId: null,
      resultKey: userId,
      displayNameSnapshot: byId.get(userId)?.name || "Player",
      factionSnapshot: ""
    }))
  );
}

async function listByGameIds(client, gameIds) {
  const ids = [...new Set(gameIds)].filter(Number.isInteger);
  if (!ids.length) return [];
  const { rows } = await client.query(
    `SELECT
       gp.*,
       u.name AS user_name,
       u.avatar_data,
       u.register_nickname,
       u.telegram_contact,
       u.rating,
       u.is_admin,
       u.created_at AS user_created_at
     FROM game_participants gp
     LEFT JOIN users u ON u.id = gp.user_id
     WHERE gp.game_id = ANY($1::int[])
     ORDER BY gp.game_id, gp.slot`,
    [ids]
  );
  return rows.map(mapParticipant);
}

module.exports = {
  replaceForGame,
  replaceFromUserIds,
  listByGameIds
};

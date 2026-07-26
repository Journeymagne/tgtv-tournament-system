#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { ROOT, requireDatabaseUrl } = require("../src/config");
const { getPool, closePool, withTransaction } = require("../src/db/pool");
const { migrate } = require("../src/db/migrate");

const DB_PATH = process.argv[2] || path.join(ROOT, "data", "db.json");

async function main() {
  requireDatabaseUrl();

  if (!fs.existsSync(DB_PATH)) {
    console.error(`No JSON database at ${DB_PATH}`);
    process.exit(1);
  }

  await migrate(getPool());

  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  const idMap = new Map();

  await withTransaction(async (client) => {
    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users");
    if (rows[0].count > 0) {
      throw new Error("Target database already has users. Import aborted.");
    }

    for (const user of data.users || []) {
      const { rows: inserted } = await client.query(
        `INSERT INTO users
           (name, name_key, password_hash, avatar_data, register_nickname,
            telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING id`,
        [
          user.name,
          String(user.name || "").toLowerCase(),
          user.passwordHash,
          user.avatarData || null,
          user.registerNickname || null,
          user.telegramContact || null,
          JSON.stringify(user.challengeCredits || []),
          user.rating,
          Boolean(user.isAdmin),
          user.createdAt || new Date().toISOString(),
          user.updatedAt || null
        ]
      );
      idMap.set(user.id, inserted[0].id);
    }

    const challengeMap = new Map();
    for (const challenge of data.challenges || []) {
      const from = idMap.get(challenge.fromUserId);
      const to = idMap.get(challenge.toUserId);
      if (!from || !to) continue;

      const { rows: inserted } = await client.query(
        `INSERT INTO challenges (from_user_id, to_user_id, status, share_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          from,
          to,
          challenge.status,
          challenge.shareToken || null,
          challenge.createdAt || new Date().toISOString(),
          challenge.updatedAt || null
        ]
      );
      challengeMap.set(challenge.id, inserted[0].id);
    }

    for (const game of data.games || []) {
      const playerIds = (game.playerIds || []).map((id) => idMap.get(id)).filter(Boolean);
      if (playerIds.length !== (game.playerIds || []).length) continue;

      const { rows: inserted } = await client.query(
        `INSERT INTO games
           (challenge_id, player_ids, status, created_at, submitted_by,
            submitted_at, pending_result, result, elo)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
         RETURNING id`,
        [
          challengeMap.get(game.challengeId) || null,
          playerIds,
          game.status,
          game.createdAt || new Date().toISOString(),
          idMap.get(game.submittedBy) || null,
          game.submittedAt || null,
          game.pendingResult ? JSON.stringify(game.pendingResult) : null,
          game.result ? JSON.stringify(game.result) : null,
          game.elo ? JSON.stringify(game.elo) : null
        ]
      );
      if (game.challengeId && challengeMap.has(game.challengeId)) {
        await client.query("UPDATE challenges SET game_id = $2 WHERE id = $1", [
          challengeMap.get(game.challengeId),
          inserted[0].id
        ]);
      }
    }

    for (const item of data.feedback || []) {
      await client.query(
        `INSERT INTO feedback
           (user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          idMap.get(item.userId) || null,
          item.screen,
          item.description,
          item.status || "open",
          idMap.get(item.resolvedBy) || null,
          item.resolvedAt || null,
          item.updatedAt || null,
          item.createdAt || new Date().toISOString()
        ]
      );
    }
  });

  console.log(`Imported ${idMap.size} users from ${DB_PATH}`);
  await closePool();
}

main().catch(async (err) => {
  console.error(err.message);
  await closePool();
  process.exit(1);
});

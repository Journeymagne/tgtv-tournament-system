#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { ROOT, requireDatabaseUrl } = require("../src/config");
const { getPool, closePool, withTransaction } = require("../src/db/pool");
const { migrate } = require("../src/db/migrate");

const DB_PATH = process.argv[2] || path.join(ROOT, "data", "db.json");

// Original ids are preserved on import (explicit INSERT + setval) rather
// than remapped through a fresh SERIAL sequence.
//
// The reason: pending_result, result, and elo are JSON documents keyed BY
// user id -- result.winnerId, result.scores[userId],
// result.tiebreakers.primary/critTac/apl[userId], and elo[userId]. A prior
// version of this script remapped the relational columns (player_ids,
// submitted_by, from_user_id, ...) through an id map but passed those three
// JSON documents through JSON.stringify verbatim. Once users landed on new
// ids, every one of those JSON keys pointed at the wrong player (or at
// nobody): winners silently became losers and scores/elo became unresolvable
// -- Elo *ratings* looked fine because they are a plain column, so nothing
// appeared broken.
//
// Preserving ids sidesteps ever having to walk those documents by hand, and
// matches what the pre-refactor server.js did for its full-state save
// (explicit id INSERT ... ON CONFLICT, then setval on each sequence -- see
// git history prior to the "replace monolithic handler" commit). Deep
// remapping every id-keyed field inside those documents was the alternative,
// but it is exactly the kind of easy-to-miss-a-field logic that caused this
// bug in the first place.
async function resetSequence(client, table, column) {
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence($1, $2),
       GREATEST((SELECT COALESCE(MAX(${column}), 0) FROM ${table}), 1),
       (SELECT COALESCE(MAX(${column}), 0) FROM ${table}) > 0
     )`,
    [table, column]
  );
}

// A malformed export (hand-edited JSON, a partial write, a future format
// change) can have `users`/`challenges`/`games`/`feedback` present but not
// arrays. Without this check, `for (const x of data.users)` throws a bare
// "... is not iterable" TypeError that gives the operator no clue which
// field is wrong.
function arrayField(data, name) {
  const value = data[name];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Invalid JSON database: "${name}" must be an array, found ${typeof value}.`);
  }
  return value;
}

function readData(dbPath) {
  const raw = fs.readFileSync(dbPath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse ${dbPath} as JSON: ${err.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Invalid JSON database: expected a top-level object in ${dbPath}.`);
  }
  return data;
}

async function main() {
  requireDatabaseUrl();

  if (!fs.existsSync(DB_PATH)) {
    console.error(`No JSON database at ${DB_PATH}`);
    process.exit(1);
  }

  await migrate(getPool());

  const data = readData(DB_PATH);
  const users = arrayField(data, "users");
  const challenges = arrayField(data, "challenges");
  const games = arrayField(data, "games");
  const feedback = arrayField(data, "feedback");

  const userIds = new Set(users.map((user) => user.id));
  const challengeIds = new Set(challenges.map((challenge) => challenge.id));

  await withTransaction(async (client) => {
    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users");
    if (rows[0].count > 0) {
      throw new Error("Target database already has users. Import aborted.");
    }

    for (const user of users) {
      await client.query(
        `INSERT INTO users
           (id, name, name_key, password_hash, avatar_data, register_nickname,
            telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12)`,
        [
          user.id,
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
    }
    await resetSequence(client, "users", "id");

    for (const challenge of challenges) {
      if (!userIds.has(challenge.fromUserId) || !userIds.has(challenge.toUserId)) continue;

      await client.query(
        `INSERT INTO challenges (id, from_user_id, to_user_id, status, share_token, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          challenge.id,
          challenge.fromUserId,
          challenge.toUserId,
          challenge.status,
          challenge.shareToken || null,
          challenge.createdAt || new Date().toISOString(),
          challenge.updatedAt || null
        ]
      );
    }
    await resetSequence(client, "challenges", "id");

    for (const game of games) {
      const playerIds = game.playerIds || [];
      if (!playerIds.length || !playerIds.every((id) => userIds.has(id))) continue;

      const challengeId = challengeIds.has(game.challengeId) ? game.challengeId : null;

      await client.query(
        `INSERT INTO games
           (id, challenge_id, player_ids, status, created_at, submitted_by,
            submitted_at, pending_result, result, elo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)`,
        [
          game.id,
          challengeId,
          playerIds,
          game.status,
          game.createdAt || new Date().toISOString(),
          userIds.has(game.submittedBy) ? game.submittedBy : null,
          game.submittedAt || null,
          game.pendingResult ? JSON.stringify(game.pendingResult) : null,
          game.result ? JSON.stringify(game.result) : null,
          game.elo ? JSON.stringify(game.elo) : null
        ]
      );
      if (challengeId !== null) {
        await client.query("UPDATE challenges SET game_id = $2 WHERE id = $1", [
          challengeId,
          game.id
        ]);
      }
    }
    await resetSequence(client, "games", "id");

    for (const item of feedback) {
      await client.query(
        `INSERT INTO feedback
           (id, user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.id,
          userIds.has(item.userId) ? item.userId : null,
          item.screen,
          item.description,
          item.status || "open",
          userIds.has(item.resolvedBy) ? item.resolvedBy : null,
          item.resolvedAt || null,
          item.updatedAt || null,
          item.createdAt || new Date().toISOString()
        ]
      );
    }
    await resetSequence(client, "feedback", "id");
  });

  console.log(`Imported ${users.length} users from ${DB_PATH}`);
  await closePool();
}

main().catch(async (err) => {
  console.error(err.message);
  await closePool();
  process.exit(1);
});

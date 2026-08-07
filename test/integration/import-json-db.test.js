const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");
const { buildChallengeTracks } = require("../../src/domain/challenge-progress");

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = path.join(__dirname, "..", "..", "scripts", "import-json-db.js");

let pool;
let client;
let scratchDir;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "import-json-db-test-"));
});

test.after(async () => {
  await pool.end();
  fs.rmSync(scratchDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  client = await pool.connect();
});

test.afterEach(() => {
  client.release();
});

// Ids are chosen non-contiguous and not starting at 1 -- that is exactly
// what exposes the bug: a fresh SERIAL sequence assigns 1, 2, ... regardless
// of what the JSON says, so any test using ids 1 and 2 would pass even with
// the broken remap-only-columns script by coincidence.
function buildFixture() {
  return {
    users: [
      {
        id: 2,
        name: "Alice",
        passwordHash: "salt:hash-alice",
        rating: 1000,
        isAdmin: false,
        createdAt: "2024-01-01T00:00:00.000Z"
      },
      {
        id: 5,
        name: "Bob",
        passwordHash: "salt:hash-bob",
        rating: 1000,
        isAdmin: false,
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    challenges: [
      {
        id: 7,
        fromUserId: 2,
        toUserId: 5,
        status: "accepted",
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ],
    games: [
      {
        id: 9,
        challengeId: 7,
        playerIds: [2, 5],
        status: "completed",
        createdAt: "2024-01-01T00:00:00.000Z",
        submittedBy: 5,
        submittedAt: "2024-01-02T00:00:00.000Z",
        pendingResult: null,
        // Alice (id 2) won this match: her score (11) beats Bob's (4).
        result: {
          winnerId: 2,
          scores: {
            2: {
              crit: 3,
              kill: 3,
              tac: 3,
              faction: "Kasrkin",
              tacOp: "",
              primary: "crit",
              primaryScore: 3,
              primaryBonus: 2,
              total: 11
            },
            5: {
              crit: 1,
              kill: 1,
              tac: 1,
              faction: "Plague Marines",
              tacOp: "",
              primary: "crit",
              primaryScore: 1,
              primaryBonus: 1,
              total: 4
            }
          },
          killzone: null,
          tiebreakers: null,
          confirmedBy: 5,
          confirmedAt: "2024-01-02T00:00:00.000Z"
        },
        elo: {
          k: 32,
          2: { before: 1000, after: 1016, delta: 16 },
          5: { before: 1000, after: 984, delta: -16 }
        }
      }
    ],
    feedback: [
      {
        id: 11,
        userId: 2,
        screen: "games",
        description: "test feedback",
        status: "open",
        resolvedBy: 5,
        resolvedAt: "2024-01-03T00:00:00.000Z",
        updatedAt: "2024-01-03T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z"
      }
    ]
  };
}

function writeFixture(name, data) {
  const filePath = path.join(scratchDir, name);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

async function runImport(fixturePath) {
  return execFileAsync(process.execPath, [SCRIPT_PATH, fixturePath], {
    cwd: path.join(__dirname, "..", ".."),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }
  });
}

test("import preserves ids so result/elo JSON keyed by user id stays valid", async () => {
  const fixturePath = writeFixture("db.json", buildFixture());

  await runImport(fixturePath);

  // The two users must land on exactly their original ids -- if the script
  // instead reassigned fresh ids (1 and 2) starting from the SERIAL
  // sequence, this lookup would come back empty.
  const alice = await usersRepo.findById(client, 2);
  const bob = await usersRepo.findById(client, 5);
  assert.ok(alice, "expected user id 2 (Alice) to exist after import");
  assert.equal(alice.name, "Alice");
  assert.ok(bob, "expected user id 5 (Bob) to exist after import");
  assert.equal(bob.name, "Bob");

  const game = await gamesRepo.findById(client, 9);
  assert.ok(game, "expected game id 9 to exist after import");

  // The winner must still be the human who actually won (Alice), not
  // whichever player happens to hold the id that used to be Alice's.
  const winner = await usersRepo.findById(client, game.result.winnerId);
  assert.ok(winner, "result.winnerId must name a user that exists");
  assert.equal(winner.name, "Alice", "the original winner must still be reported as the winner");

  // result.scores and elo are objects keyed BY USER ID. Every key must
  // resolve to a real row in `users`.
  const scoreKeys = Object.keys(game.result.scores).map(Number);
  assert.deepEqual(scoreKeys.sort(), [2, 5]);
  const scoredUsers = await usersRepo.findByIds(client, scoreKeys);
  assert.equal(scoredUsers.length, scoreKeys.length, "every result.scores key must match a real user");

  const eloKeys = Object.keys(game.elo)
    .filter((key) => key !== "k")
    .map(Number);
  assert.deepEqual(eloKeys.sort(), [2, 5]);
  const eloUsers = await usersRepo.findByIds(client, eloKeys);
  assert.equal(eloUsers.length, eloKeys.length, "every elo key must match a real user");

  // Challenge-track credit must resolve for the winner: buildChallengeTracks
  // reads game.result.winnerId and game.result.scores[user.id].faction, so
  // this only works end-to-end if those ids still line up with the winner's
  // actual row.
  const winnersGames = await gamesRepo.listCompletedForUser(client, alice.id);
  const tracks = buildChallengeTracks(winnersGames, alice);
  const credited =
    tracks.classified.completed.find((item) => item.team === "Kasrkin") ||
    tracks.allKillTeam.completed.find((item) => item.team === "Kasrkin");
  assert.ok(credited, "Alice should be credited for Kasrkin on a challenge track");
  assert.equal(credited.gameId, 9);

  // Subsequent inserts must not collide with the imported ids -- this is
  // only a risk once the script starts inserting explicit ids and must
  // advance the SERIAL sequence past them afterwards.
  const carol = await usersRepo.insert(client, {
    name: "Carol",
    passwordHash: "salt:hash-carol",
    rating: 1000,
    isAdmin: false
  });
  assert.ok(![2, 5].includes(carol.id), "new user id must not collide with imported ids");

  const newGame = await gamesRepo.insert(client, { challengeId: null, playerIds: [2, 5] });
  assert.notEqual(newGame.id, 9, "new game id must not collide with the imported game id");
});

test("import rejects a malformed JSON database instead of throwing an uncaught TypeError", async () => {
  const fixturePath = writeFixture("malformed.json", {
    users: [{ id: 1, name: "Alice", passwordHash: "salt:hash", rating: 1000 }],
    // A real-world malformed export: an object instead of an array.
    challenges: { oops: true }
  });

  await assert.rejects(
    runImport(fixturePath),
    (err) => {
      assert.equal(err.code, 1);
      const stderrLines = err.stderr.trim().split("\n");
      assert.equal(
        stderrLines.length,
        1,
        `expected a single clear error line on stderr, not a stack trace, got:\n${err.stderr}`
      );
      assert.match(err.stderr, /"challenges"/);
      assert.match(err.stderr, /array/i);
      return true;
    }
  );

  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  assert.equal(rows[0].count, 0, "a rejected import must not partially apply");
});

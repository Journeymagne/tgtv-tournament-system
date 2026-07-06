const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DEFAULT_DATA_DIR = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join(require("os").tmpdir(), "tgtv-ranking-tournament-data")
  : path.join(ROOT, "data");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : DEFAULT_DATA_DIR;
const DB_PATH = path.join(DATA_DIR, "db.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
const USE_POSTGRES = Boolean(DATABASE_URL);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const INITIAL_RATING = 1000;
const ELO_K = 32;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 1500000;

const CHALLENGE_TEAMS = [
  "Kasrkin",
  "Inquisitorial Agents",
  "Exaction Squad",
  "Angels of Death",
  "Chaos Cult",
  "Fellgor Ravagers",
  "Hand of the Archon",
  "Farstalker Kinband",
  "Hearthkyn Salvagers",
  "Hierotek Circle",
  "Scout Squad",
  "Blades of Khaine",
  "Plague Marines",
  "Mandrakes",
  "Nemesis Claw",
  "Brood Brothers",
  "Hernkyn Yaegirs",
  "Tempestus Aquillons",
  "Wrecka Krew",
  "Vespid Stingwings",
  "Ratlings",
  "Sanctifiers",
  "Goremongers",
  "Raveners",
  "Battleclade",
  "Deathwatch",
  "Canoptek Circle",
  "Wolf Scouts",
  "Celestian Insidiants",
  "Murderwing"
];

const CHALLENGE_WILDCARDS = [
  "Navy Breachers",
  "XV26 Stealth Suits"
];

const KILL_TEAM_OPTIONS = [
  "Celestian Insidiants",
  "Novitiates",
  "Battleclade",
  "Hunter Clade",
  "Elucidian Starstriders",
  "Exaction Squad",
  "Navy Breachers",
  "Inquisitorial Agents",
  "Sanctifiers",
  "Death Korps",
  "Kasrkin",
  "Ratlings",
  "Spectre Squad",
  "Tempestus Aquilons",
  "Angels of Death",
  "Deathwatch",
  "Phobos Strike Team",
  "Scout Squad",
  "Wolf Scouts",
  "Gellerpox Infected",
  "Legionaries",
  "Murderwing",
  "Nemesis Claw",
  "Blooded",
  "Chaos Cult",
  "Fellgor Ravagers",
  "Plague Marines",
  "Warpcoven",
  "Goremongers",
  "Corsair Voidscarred",
  "Blades of Khaine",
  "Hand of the Archon",
  "Mandrakes",
  "Void-dancer Troupe",
  "Brood Brothers",
  "Wyrmblade",
  "Hearthkyn Salvagers",
  "Hernkyn Yaegirs",
  "Canoptek Circle",
  "Hierotek Circle",
  "Kommandos",
  "Wrecka Krew",
  "Farstalker Kinband",
  "Pathfinders",
  "Vespid Stingwings",
  "XV26 Stealth Battlesuits",
  "Raveners"
];

const KILLZONE_OPTIONS = [
  "Volkus",
  "Gallowdark",
  "Bheta-Decima",
  "Octarius",
  "WTC ITD",
  "WTC Open",
  "Non-specific"
];

const CRIT_OP_OPTIONS = [
  "Secure",
  "Loot",
  "Transmission",
  "Orb",
  "Stake Claim",
  "Energy Cells",
  "Download",
  "Data",
  "Reboot"
];

const KILL_TEAM_ALIASES = new Map([
  ["angel of death", "Angels of Death"],
  ["angels of death", "Angels of Death"],
  ["brood brother", "Brood Brothers"],
  ["brood brothers", "Brood Brothers"],
  ["celestian insidiant", "Celestian Insidiants"],
  ["celestian insidiants", "Celestian Insidiants"],
  ["elucidian starstrider", "Elucidian Starstriders"],
  ["elucidian starstriders", "Elucidian Starstriders"],
  ["farstalker kinband", "Farstalker Kinband"],
  ["fellgor ravager", "Fellgor Ravagers"],
  ["fellgor ravagers", "Fellgor Ravagers"],
  ["goremonger", "Goremongers"],
  ["goremongers", "Goremongers"],
  ["hearthkyn salvager", "Hearthkyn Salvagers"],
  ["hearthkyn salvagers", "Hearthkyn Salvagers"],
  ["hernkyn yaegir", "Hernkyn Yaegirs"],
  ["hernkyn yaegirs", "Hernkyn Yaegirs"],
  ["imperial navy breacher", "Navy Breachers"],
  ["imperial navy breachers", "Navy Breachers"],
  ["inquisitorial agent", "Inquisitorial Agents"],
  ["inquisitorial agents", "Inquisitorial Agents"],
  ["legionary", "Legionaries"],
  ["legionaries", "Legionaries"],
  ["navy breacher", "Navy Breachers"],
  ["navy breachers", "Navy Breachers"],
  ["tempestus aquilons", "Tempestus Aquillons"],
  ["tempestus aquillons", "Tempestus Aquillons"],
  ["vespid stingwings", "Vespid Stingwings"],
  ["xv26 stealth battlesuits", "XV26 Stealth Suits"],
  ["xv26 stealth suits", "XV26 Stealth Suits"]
]);

const RESULT_KILL_TEAM_ALIASES = new Map([
  ...KILL_TEAM_ALIASES,
  ["tempestus aquilons", "Tempestus Aquilons"],
  ["tempestus aquillons", "Tempestus Aquilons"],
  ["xv26 stealth suits", "XV26 Stealth Battlesuits"]
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

let pool = null;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function emptyDb() {
  return {
    users: [],
    sessions: [],
    challenges: [],
    games: [],
    feedback: [],
    nextIds: { user: 1, challenge: 1, game: 1, feedback: 1 }
  };
}

async function ensureDb() {
  if (USE_POSTGRES) {
    await ensurePostgres();
    return;
  }
  ensureJsonDb();
}

function ensureJsonDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb(), null, 2));
  }
}

async function readDb() {
  if (USE_POSTGRES) return readPostgresDb();
  return readJsonDb();
}

async function writeDb(db) {
  if (USE_POSTGRES) return writePostgresDb(db);
  return writeJsonDb(db);
}

function readJsonDb() {
  ensureJsonDb();
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return { ...emptyDb(), ...db, nextIds: { ...emptyDb().nextIds, ...(db.nextIds || {}) } };
  } catch {
    const backup = `${DB_PATH}.broken-${Date.now()}`;
    fs.copyFileSync(DB_PATH, backup);
    const db = emptyDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return db;
  }
}

function writeJsonDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function getPool() {
  if (pool) return pool;
  const sslEnabled = ["1", "true", "yes"].includes(String(process.env.PGSSL || process.env.DATABASE_SSL || "").toLowerCase());
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

async function ensurePostgres() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      name_key TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_data TEXT,
      register_nickname TEXT,
      telegram_contact TEXT,
      challenge_credits JSONB,
      rating INTEGER NOT NULL DEFAULT 1000,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      game_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      challenge_id INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
      player_ids INTEGER[] NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ,
      pending_result JSONB,
      result JSONB,
      elo JSONB
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      screen TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_challenges_from_user_id ON challenges(from_user_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_to_user_id ON challenges(to_user_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
    CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
  `);
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT");
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS register_nickname TEXT");
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_contact TEXT");
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS challenge_credits JSONB");
  await db.query("ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_result JSONB");
  await db.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'");
  await db.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
  await db.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ");
  await db.query("ALTER TABLE feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ");
  await seedPostgresFromJsonIfEmpty();
}

async function seedPostgresFromJsonIfEmpty() {
  if (!fs.existsSync(DB_PATH)) return;
  const { rows } = await getPool().query("SELECT COUNT(*)::int AS count FROM users");
  if (rows[0].count > 0) return;
  const db = readJsonDb();
  if (!db.users.length) return;
  await writePostgresDb(db);
}

async function readPostgresDb() {
  const db = getPool();
  await db.query("DELETE FROM sessions WHERE expires_at <= NOW()");
  const [users, sessions, challenges, games, feedback] = await Promise.all([
    db.query("SELECT * FROM users ORDER BY id"),
    db.query("SELECT * FROM sessions ORDER BY created_at"),
    db.query("SELECT * FROM challenges ORDER BY id"),
    db.query("SELECT * FROM games ORDER BY id"),
    db.query("SELECT * FROM feedback ORDER BY id")
  ]);
  const state = {
    users: users.rows.map(mapUser),
    sessions: sessions.rows.map(mapSession),
    challenges: challenges.rows.map(mapChallenge),
    games: games.rows.map(mapGame),
    feedback: feedback.rows.map(mapFeedback),
    nextIds: {
      user: maxNext(users.rows),
      challenge: maxNext(challenges.rows),
      game: maxNext(games.rows),
      feedback: maxNext(feedback.rows)
    }
  };
  return state;
}

async function writePostgresDb(state) {
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    await deleteMissing(client, "sessions", "token", state.sessions.map((item) => item.token), "text");
    await deleteMissing(client, "feedback", "id", state.feedback.map((item) => item.id), "int");
    await deleteMissing(client, "games", "id", state.games.map((item) => item.id), "int");
    await deleteMissing(client, "challenges", "id", state.challenges.map((item) => item.id), "int");
    await deleteMissing(client, "users", "id", state.users.map((item) => item.id), "int");

    for (const user of state.users) {
      await client.query(`
        INSERT INTO users (id, name, name_key, password_hash, avatar_data, register_nickname, telegram_contact, challenge_credits, rating, is_admin, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          name_key = EXCLUDED.name_key,
          password_hash = EXCLUDED.password_hash,
          avatar_data = EXCLUDED.avatar_data,
          register_nickname = EXCLUDED.register_nickname,
          telegram_contact = EXCLUDED.telegram_contact,
          challenge_credits = EXCLUDED.challenge_credits,
          rating = EXCLUDED.rating,
          is_admin = EXCLUDED.is_admin,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        user.id,
        user.name,
        user.name.toLowerCase(),
        user.passwordHash,
        user.avatarData || null,
        user.registerNickname || null,
        user.telegramContact || null,
        JSON.stringify(user.challengeCredits || []),
        user.rating,
        Boolean(user.isAdmin),
        user.createdAt || nowIso(),
        user.updatedAt || null
      ]);
    }

    for (const session of state.sessions) {
      await client.query(`
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (token) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          created_at = EXCLUDED.created_at,
          expires_at = EXCLUDED.expires_at
      `, [session.token, session.userId, session.createdAt || nowIso(), session.expiresAt]);
    }

    for (const challenge of state.challenges) {
      await client.query(`
        INSERT INTO challenges (id, from_user_id, to_user_id, status, game_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          from_user_id = EXCLUDED.from_user_id,
          to_user_id = EXCLUDED.to_user_id,
          status = EXCLUDED.status,
          game_id = EXCLUDED.game_id,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `, [
        challenge.id,
        challenge.fromUserId,
        challenge.toUserId,
        challenge.status,
        challenge.gameId || null,
        challenge.createdAt || nowIso(),
        challenge.updatedAt || null
      ]);
    }

    for (const game of state.games) {
      await client.query(`
        INSERT INTO games (id, challenge_id, player_ids, status, created_at, submitted_by, submitted_at, pending_result, result, elo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          challenge_id = EXCLUDED.challenge_id,
          player_ids = EXCLUDED.player_ids,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          submitted_by = EXCLUDED.submitted_by,
          submitted_at = EXCLUDED.submitted_at,
          pending_result = EXCLUDED.pending_result,
          result = EXCLUDED.result,
          elo = EXCLUDED.elo
      `, [
        game.id,
        game.challengeId || null,
        game.playerIds,
        game.status,
        game.createdAt || nowIso(),
        game.submittedBy || null,
        game.submittedAt || null,
        game.pendingResult ? JSON.stringify(game.pendingResult) : null,
        game.result ? JSON.stringify(game.result) : null,
        game.elo ? JSON.stringify(game.elo) : null
      ]);
    }

    for (const item of state.feedback) {
      await client.query(`
        INSERT INTO feedback (id, user_id, screen, description, status, resolved_by, resolved_at, updated_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          screen = EXCLUDED.screen,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          resolved_by = EXCLUDED.resolved_by,
          resolved_at = EXCLUDED.resolved_at,
          updated_at = EXCLUDED.updated_at,
          created_at = EXCLUDED.created_at
      `, [
        item.id,
        item.userId || null,
        item.screen,
        item.description,
        item.status || "open",
        item.resolvedBy || null,
        item.resolvedAt || null,
        item.updatedAt || null,
        item.createdAt || nowIso()
      ]);
    }

    await resetSequence(client, "users", "id", "users_id_seq");
    await resetSequence(client, "challenges", "id", "challenges_id_seq");
    await resetSequence(client, "games", "id", "games_id_seq");
    await resetSequence(client, "feedback", "id", "feedback_id_seq");

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function deleteMissing(client, table, column, values, type) {
  if (!values.length) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  await client.query(`DELETE FROM ${table} WHERE NOT (${column} = ANY($1::${type}[]))`, [values]);
}

async function resetSequence(client, table, column, sequence) {
  await client.query(`
    SELECT setval(
      $1::regclass,
      GREATEST((SELECT COALESCE(MAX(${column}), 0) FROM ${table}), 1),
      (SELECT COALESCE(MAX(${column}), 0) FROM ${table}) > 0
    )
  `, [sequence]);
}

function mapUser(row) {
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

function mapSession(row) {
  return {
    token: row.token,
    userId: row.user_id,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at)
  };
}

function mapChallenge(row) {
  return {
    id: row.id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    status: row.status,
    gameId: row.game_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function mapGame(row) {
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

function maxNext(rows) {
  return rows.reduce((max, row) => Math.max(max, row.id + 1), 1);
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeKillTeam(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const key = text.toLowerCase().replace(/\s+/g, " ");
  const direct = [...CHALLENGE_TEAMS, ...CHALLENGE_WILDCARDS].find((team) => team.toLowerCase() === key);
  return direct || KILL_TEAM_ALIASES.get(key) || text;
}

function teamKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[`']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function resultKillTeamInput(value) {
  const text = optionalTextInput(value, "Kill Team");
  if (!text) return "";
  const key = teamKey(text);
  const alias = RESULT_KILL_TEAM_ALIASES.get(key);
  const direct = KILL_TEAM_OPTIONS.find((team) => teamKey(team) === key);
  const team = alias || direct;
  if (!team || !KILL_TEAM_OPTIONS.includes(team)) {
    throw new Error("Choose a valid Kill Team from the list");
  }
  return team;
}

function challengeEventsForUser(db, user) {
  const gameEvents = db.games
    .filter((game) => game.status === "completed" && game.result?.winnerId === user.id)
    .map((game) => {
      const score = game.result.scores?.[user.id] || {};
      return {
        team: normalizeKillTeam(score.faction),
        source: "game",
        action: "credit",
        gameId: game.id,
        at: game.submittedAt || game.createdAt || nowIso()
      };
    });
  const manualEvents = (user.challengeCredits || []).map((credit) => {
    const action = credit.action === "deduct" ? "deduct" : "credit";
    return {
      team: normalizeKillTeam(credit.team),
      source: "manual",
      action,
      creditedBy: credit.creditedBy || credit.deductedBy || null,
      at: credit.creditedAt || credit.deductedAt || nowIso()
    };
  });

  return [...gameEvents, ...manualEvents]
    .filter((event) => event.team)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function challengeProgressForUser(db, user) {
  const events = challengeEventsForUser(db, user);
  let nextIndex = 0;
  const completed = [];
  const wildcardCompleted = [];

  for (const event of events) {
    if (CHALLENGE_WILDCARDS.includes(event.team)) {
      if (event.action === "deduct") {
        const wildcardIndex = wildcardCompleted.findIndex((item) => item.team === event.team);
        if (wildcardIndex !== -1) wildcardCompleted.splice(wildcardIndex, 1);
        continue;
      }
      if (!wildcardCompleted.some((item) => item.team === event.team)) {
        wildcardCompleted.push({ ...event });
      }
      continue;
    }

    if (event.action === "deduct") {
      const completedIndex = completed.findIndex((item) => item.team === event.team);
      if (completedIndex !== -1) {
        completed.splice(completedIndex);
        nextIndex = completed.length;
      }
      continue;
    }

    const expected = CHALLENGE_TEAMS[nextIndex];
    if (event.team === expected) {
      completed.push({ ...event, order: nextIndex + 1 });
      nextIndex += 1;
    }
  }

  const completedTeams = new Set(completed.map((item) => item.team));
  return {
    user: publicUser(user),
    total: CHALLENGE_TEAMS.length,
    completedCount: completed.length,
    nextTeam: CHALLENGE_TEAMS[nextIndex] || null,
    completed,
    wildcardCompleted,
    teams: CHALLENGE_TEAMS.map((team, index) => ({
      order: index + 1,
      team,
      status: completedTeams.has(team) ? "completed" : index === nextIndex ? "current" : "locked",
      credit: completed.find((item) => item.team === team) || null
    })),
    wildcards: CHALLENGE_WILDCARDS.map((team) => ({
      team,
      status: wildcardCompleted.some((item) => item.team === team) ? "completed" : "available",
      credit: wildcardCompleted.find((item) => item.team === team) || null
    }))
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    avatarData: user.avatarData || null,
    registerNickname: user.registerNickname || "",
    telegramContact: user.telegramContact || "",
    challengeCredits: user.challengeCredits || [],
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function validateName(name) {
  return /^[\p{L}0-9 _.-]{2,24}$/u.test(name);
}

function profileText(value, label, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (text.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return text;
}

function requiredProfileText(value, label, maxLength) {
  const text = profileText(value, label, maxLength);
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function validateAvatarData(value) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Avatar must be an image data URL");
  }
  if (value.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("Avatar image is too large");
  }
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    throw new Error("Avatar must be a PNG, JPG, WebP, or GIF image");
  }
  return value;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.sessions = db.sessions.filter((session) => new Date(session.expiresAt).getTime() > Date.now());
  db.sessions.push({ token, userId, createdAt: nowIso(), expiresAt });
  return token;
}

function parseCookies(req) {
  const cookie = req.headers.cookie || "";
  return Object.fromEntries(cookie.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index === -1) return ["", ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

function currentUser(db, req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders
  });
  res.end(payload);
}

function error(res, status, message) {
  json(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BYTES) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Could not parse JSON"));
      }
    });
    req.on("error", reject);
  });
}

function requireAuth(db, req, res) {
  const user = currentUser(db, req);
  if (!user) {
    error(res, 401, "You need to sign in");
    return null;
  }
  return user;
}

function requireAdmin(db, req, res) {
  const user = requireAuth(db, req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    error(res, 403, "Administrator rights required");
    return null;
  }
  return user;
}

function scoreInput(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 6) {
    throw new Error("VP for each op must be between 0 and 6");
  }
  return number;
}

function primaryInput(value) {
  if (!["crit", "kill", "tac"].includes(value)) {
    throw new Error("Primary Op must be crit, kill, or tac");
  }
  return value;
}

function optionalTextInput(value, label, maxLength = 80) {
  const text = String(value || "").trim();
  if (text.length > maxLength) {
    throw new Error(`${label} is too long`);
  }
  return text;
}

function optionalKillzone(input = {}) {
  const source = input || {};
  const killzone = optionalTextInput(source.killzone, "Killzone");
  const critOp = optionalTextInput(source.critOp, "Crit Op");
  const layoutText = String(source.layout || "").trim();
  let layout = null;
  if (layoutText) {
    const number = Number(layoutText);
    if (!Number.isInteger(number) || number < 1 || number > 6) {
      throw new Error("Killzone layout must be between 1 and 6");
    }
    layout = number;
  }
  if (killzone && !KILLZONE_OPTIONS.includes(killzone)) {
    throw new Error("Choose a valid Killzone");
  }
  if (critOp && !CRIT_OP_OPTIONS.includes(critOp)) {
    throw new Error("Choose a valid Crit Op");
  }
  return killzone || critOp || layout ? { killzone, critOp, layout } : null;
}

function aplInput(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    throw new Error("APL on table must be an integer between 0 and 99");
  }
  return number;
}

function calculateApprovedOps(player) {
  const ops = {
    crit: scoreInput(player.crit),
    kill: scoreInput(player.kill),
    tac: scoreInput(player.tac)
  };
  const primary = primaryInput(player.primary);
  const primaryBonus = Math.ceil(ops[primary] / 2);
  return {
    crit: ops.crit,
    kill: ops.kill,
    tac: ops.tac,
    faction: resultKillTeamInput(player.faction),
    tacOp: optionalTextInput(player.tacOp, "Tac Op"),
    primary,
    primaryScore: ops[primary],
    primaryBonus,
    total: ops.crit + ops.kill + ops.tac + primaryBonus
  };
}

function calculateSubmittedResult(body, game, playerA, playerB) {
  const scoresByUser = body.scores || {};
  const scoreA = calculateApprovedOps(scoresByUser[playerA.id] || {});
  const scoreB = calculateApprovedOps(scoresByUser[playerB.id] || {});
  let winnerId = null;
  let tiebreakers = null;

  if (scoreA.total > scoreB.total) {
    winnerId = playerA.id;
  } else if (scoreB.total > scoreA.total) {
    winnerId = playerB.id;
  } else if (body.tiebreakers?.enabled) {
    tiebreakers = calculateTieBreakers(body.tiebreakers, playerA, playerB, scoreA, scoreB);
    winnerId = tiebreakers.winnerId;
  }

  return {
    winnerId,
    scores: {
      [playerA.id]: scoreA,
      [playerB.id]: scoreB
    },
    killzone: optionalKillzone(body.killzone),
    tiebreakers
  };
}

function calculateTieBreakers(input, playerA, playerB, scoreA, scoreB) {
  const primary = {
    [playerA.id]: scoreA.primaryBonus,
    [playerB.id]: scoreB.primaryBonus
  };
  const critTac = {
    [playerA.id]: scoreA.crit + scoreA.tac,
    [playerB.id]: scoreB.crit + scoreB.tac
  };
  const apl = {
    [playerA.id]: aplInput(input.apl?.[playerA.id]),
    [playerB.id]: aplInput(input.apl?.[playerB.id])
  };
  const rollOffWinnerId = input.rollOffWinnerId ? Number(input.rollOffWinnerId) : null;
  let winnerId = null;
  let decidedBy = null;

  if (primary[playerA.id] !== primary[playerB.id]) {
    winnerId = primary[playerA.id] > primary[playerB.id] ? playerA.id : playerB.id;
    decidedBy = "primary";
  } else if (critTac[playerA.id] !== critTac[playerB.id]) {
    winnerId = critTac[playerA.id] > critTac[playerB.id] ? playerA.id : playerB.id;
    decidedBy = "critTac";
  } else if (apl[playerA.id] !== apl[playerB.id]) {
    winnerId = apl[playerA.id] > apl[playerB.id] ? playerA.id : playerB.id;
    decidedBy = "apl";
  } else {
    if (![playerA.id, playerB.id].includes(rollOffWinnerId)) {
      throw new Error("Choose the roll-off winner for this tied match");
    }
    winnerId = rollOffWinnerId;
    decidedBy = "rollOff";
  }

  return {
    enabled: true,
    winnerId,
    decidedBy,
    primary,
    critTac,
    apl,
    rollOffWinnerId: decidedBy === "rollOff" ? rollOffWinnerId : null
  };
}

function applyFinalResult(game, playerA, playerB, result, confirmedBy = null) {
  const matchScoreA = result.winnerId === playerA.id ? 1 : result.winnerId === playerB.id ? 0 : 0.5;
  const beforeA = playerA.rating;
  const beforeB = playerB.rating;
  const elo = calculateElo(beforeA, beforeB, matchScoreA);

  playerA.rating += elo.deltaA;
  playerB.rating += elo.deltaB;
  game.status = "completed";
  game.result = {
    ...result,
    confirmedBy,
    confirmedAt: confirmedBy ? nowIso() : null
  };
  game.pendingResult = null;
  game.elo = {
    k: ELO_K,
    [playerA.id]: { before: beforeA, after: playerA.rating, delta: elo.deltaA },
    [playerB.id]: { before: beforeB, after: playerB.rating, delta: elo.deltaB }
  };
}

function reverseGameElo(game, players) {
  if (!game.elo) return;
  for (const player of players) {
    player.rating -= Number(game.elo?.[player.id]?.delta || 0);
  }
}

function calculateElo(ratingA, ratingB, scoreA) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(ELO_K * (scoreA - expectedA));
  return { deltaA, deltaB: -deltaA };
}

function challengeView(challenge, db) {
  const from = db.users.find((user) => user.id === challenge.fromUserId);
  const to = db.users.find((user) => user.id === challenge.toUserId);
  const game = challenge.gameId ? db.games.find((item) => item.id === challenge.gameId) : null;
  return {
    ...challenge,
    from: from ? publicUser(from) : null,
    to: to ? publicUser(to) : null,
    gameId: game ? game.id : challenge.gameId || null
  };
}

function gameView(game, db) {
  const players = game.playerIds.map((id) => db.users.find((user) => user.id === id)).filter(Boolean);
  return {
    ...game,
    players: players.map(publicUser)
  };
}

function feedbackView(item, db) {
  const user = db.users.find((entry) => entry.id === item.userId);
  const resolvedBy = db.users.find((entry) => entry.id === item.resolvedBy);
  return {
    ...item,
    status: item.status || "open",
    user: user ? publicUser(user) : null,
    resolvedByUser: resolvedBy ? publicUser(resolvedBy) : null
  };
}

function userSummary(db, user) {
  const challenges = db.challenges
    .filter((challenge) => challenge.fromUserId === user.id || challenge.toUserId === user.id)
    .map((challenge) => challengeView(challenge, db))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const games = db.games
    .filter((game) => game.playerIds.includes(user.id))
    .map((game) => gameView(game, db))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return {
    user: publicUser(user),
    hasAdmin: db.users.some((item) => item.isAdmin),
    challenges,
    games
  };
}

function publicProfileSummary(db, user, viewer = null) {
  const completedGames = db.games
    .filter((game) => game.status === "completed" && game.playerIds.includes(user.id))
    .sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)));
  const wins = completedGames.filter((game) => game.result?.winnerId === user.id).length;
  const draws = completedGames.filter((game) => game.result && !game.result.winnerId).length;
  const losses = completedGames.filter((game) => game.result?.winnerId && game.result.winnerId !== user.id).length;
  const eloDelta = completedGames.reduce((sum, game) => sum + Number(game.elo?.[user.id]?.delta || 0), 0);
  const winRate = completedGames.length ? Math.round((wins / completedGames.length) * 100) : 0;

  const activeGame = viewer && viewer.id !== user.id ? activeGameBetween(db, viewer.id, user.id) : null;
  const pendingChallenge = viewer && viewer.id !== user.id ? pendingChallengeBetween(db, viewer.id, user.id) : null;
  const adminPendingGames = viewer?.isAdmin
    ? db.games
        .filter((game) => game.status === "pending_confirmation" && game.playerIds.includes(user.id))
        .sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)))
        .map((game) => gameView(game, db))
    : [];

  return {
    user: publicUser(user),
    stats: {
      matches: completedGames.length,
      wins,
      draws,
      losses,
      eloDelta,
      winRate
    },
    challengeProgress: challengeProgressForUser(db, user),
    activeMatchup: {
      game: activeGame ? gameView(activeGame, db) : null,
      challenge: pendingChallenge ? challengeView(pendingChallenge, db) : null
    },
    pendingGames: adminPendingGames,
    recentGames: completedGames.slice(0, 5).map((game) => gameView(game, db))
  };
}

function samePlayerPair(ids, a, b) {
  return ids.includes(a) && ids.includes(b);
}

function activeGameBetween(db, userId, otherUserId) {
  return db.games.find((game) =>
    ["open", "pending_confirmation"].includes(game.status) &&
    samePlayerPair(game.playerIds || [], userId, otherUserId)
  ) || null;
}

function cancelGameWithoutElo(db, game) {
  game.status = "cancelled";
  game.submittedBy = null;
  game.submittedAt = null;
  game.pendingResult = null;
  game.result = null;
  game.elo = null;

  const challenge = db.challenges.find((item) => item.id === game.challengeId);
  if (challenge && challenge.status === "accepted") {
    challenge.status = "cancelled";
    challenge.updatedAt = nowIso();
  }
}

function pendingChallengeBetween(db, userId, otherUserId) {
  return db.challenges.find((challenge) =>
    challenge.status === "pending" &&
    ((challenge.fromUserId === userId && challenge.toUserId === otherUserId) ||
      (challenge.fromUserId === otherUserId && challenge.toUserId === userId))
  ) || null;
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store, max-age=0"
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  url.pathname = normalizeApiPath(url.pathname);
  const method = req.method || "GET";

  try {
    const db = await readDb();

    if (method === "GET" && url.pathname === "/api/me") {
      const user = currentUser(db, req);
      return json(res, 200, user ? userSummary(db, user) : {
        user: null,
        hasAdmin: db.users.some((item) => item.isAdmin)
      });
    }

    if (method === "PATCH" && url.pathname === "/api/me") {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const body = await readBody(req);

      if (Object.prototype.hasOwnProperty.call(body, "name")) {
        const name = normalizeName(body.name);
        if (!validateName(name)) return error(res, 400, "Name must be 2-24 characters: letters, numbers, spaces, ._-");
        const taken = db.users.some((item) => item.id !== user.id && item.name.toLowerCase() === name.toLowerCase());
        if (taken) return error(res, 409, "This name is already taken");
        user.name = name;
        user.updatedAt = nowIso();
      }

      if (Object.prototype.hasOwnProperty.call(body, "avatarData")) {
        user.avatarData = validateAvatarData(body.avatarData);
        user.updatedAt = nowIso();
      }

      if (Object.prototype.hasOwnProperty.call(body, "registerNickname")) {
        user.registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
        user.updatedAt = nowIso();
      }

      if (Object.prototype.hasOwnProperty.call(body, "telegramContact")) {
        user.telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
        user.updatedAt = nowIso();
      }

      if (body.currentPassword || body.newPassword) {
        const currentPassword = String(body.currentPassword || "");
        const newPassword = String(body.newPassword || "");
        if (!verifyPassword(currentPassword, user.passwordHash)) {
          return error(res, 401, "Current password is incorrect");
        }
        if (newPassword.length < 6) {
          return error(res, 400, "New password must be at least 6 characters");
        }
        user.passwordHash = hashPassword(newPassword);
        user.updatedAt = nowIso();
      }

      await writeDb(db);
      return json(res, 200, userSummary(db, user));
    }

    if (method === "POST" && url.pathname === "/api/register") {
      const body = await readBody(req);
      const name = normalizeName(body.name);
      const password = String(body.password || "");
      const registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
      const telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
      if (!validateName(name)) return error(res, 400, "Name must be 2-24 characters: letters, numbers, spaces, ._-");
      if (password.length < 6) return error(res, 400, "Password must be at least 6 characters");
      if (db.users.some((user) => user.name.toLowerCase() === name.toLowerCase())) {
        return error(res, 409, "This name is already taken");
      }

      const firstAdmin = !db.users.some((user) => user.isAdmin);
      const user = {
        id: db.nextIds.user++,
        name,
        passwordHash: hashPassword(password),
        avatarData: null,
        registerNickname,
        telegramContact,
        challengeCredits: [],
        rating: INITIAL_RATING,
        isAdmin: firstAdmin,
        createdAt: nowIso()
      };
      db.users.push(user);
      const token = createSession(db, user.id);
      await writeDb(db);
      return json(res, 201, userSummary(db, user), {
        "Set-Cookie": `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
      });
    }

    if (method === "POST" && url.pathname === "/api/setup-admin") {
      if (db.users.some((user) => user.isAdmin)) return error(res, 409, "An administrator already exists");
      const body = await readBody(req);
      const name = normalizeName(body.name);
      const password = String(body.password || "");
      const registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
      const telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
      if (!validateName(name)) return error(res, 400, "Name must be 2-24 characters: letters, numbers, spaces, ._-");
      if (password.length < 8) return error(res, 400, "Administrator password must be at least 8 characters");
      if (db.users.some((user) => user.name.toLowerCase() === name.toLowerCase())) {
        return error(res, 409, "This name is already taken");
      }
      const user = {
        id: db.nextIds.user++,
        name,
        passwordHash: hashPassword(password),
        avatarData: null,
        registerNickname,
        telegramContact,
        challengeCredits: [],
        rating: INITIAL_RATING,
        isAdmin: true,
        createdAt: nowIso()
      };
      db.users.push(user);
      const token = createSession(db, user.id);
      await writeDb(db);
      return json(res, 201, userSummary(db, user), {
        "Set-Cookie": `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
      });
    }

    if (method === "POST" && url.pathname === "/api/login") {
      const body = await readBody(req);
      const name = normalizeName(body.name);
      const user = db.users.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!user || !verifyPassword(body.password || "", user.passwordHash)) {
        return error(res, 401, "Invalid name or password");
      }
      const token = createSession(db, user.id);
      await writeDb(db);
      return json(res, 200, userSummary(db, user), {
        "Set-Cookie": `sid=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
      });
    }

    if (method === "POST" && url.pathname === "/api/logout") {
      const token = parseCookies(req).sid;
      if (token) db.sessions = db.sessions.filter((session) => session.token !== token);
      await writeDb(db);
      return json(res, 200, { ok: true }, {
        "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      });
    }

    if (method === "GET" && url.pathname === "/api/users") {
      const users = db.users.map(publicUser).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
      return json(res, 200, { users });
    }

    if (method === "GET" && url.pathname === "/api/games") {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const games = db.games
        .filter((game) => game.status === "completed")
        .map((game) => gameView(game, db))
        .sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)));
      return json(res, 200, { games });
    }

    if (method === "POST" && url.pathname === "/api/feedback") {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const body = await readBody(req);
      const screen = requiredProfileText(body.screen, "Screen", 80);
      const description = requiredProfileText(body.description, "Description", 1200);
      const item = {
        id: db.nextIds.feedback++,
        userId: user.id,
        screen,
        description,
        status: "open",
        resolvedBy: null,
        resolvedAt: null,
        updatedAt: null,
        createdAt: nowIso()
      };
      db.feedback.push(item);
      await writeDb(db);
      return json(res, 201, { feedback: feedbackView(item, db) });
    }

    if (method === "GET" && url.pathname === "/api/admin/feedback") {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const feedback = db.feedback
        .map((item) => feedbackView(item, db))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json(res, 200, { feedback });
    }

    const adminFeedbackMatch = url.pathname.match(/^\/api\/admin\/feedback\/(\d+)$/);
    if (adminFeedbackMatch) {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const item = db.feedback.find((entry) => entry.id === Number(adminFeedbackMatch[1]));
      if (!item) return error(res, 404, "Feedback not found");

      if (method === "PATCH") {
        const body = await readBody(req);
        const status = body.status === "resolved" ? "resolved" : "open";
        item.status = status;
        item.updatedAt = nowIso();
        if (status === "resolved") {
          item.resolvedBy = admin.id;
          item.resolvedAt = item.updatedAt;
        } else {
          item.resolvedBy = null;
          item.resolvedAt = null;
        }
        await writeDb(db);
        return json(res, 200, { feedback: feedbackView(item, db) });
      }

      if (method === "DELETE") {
        db.feedback = db.feedback.filter((entry) => entry.id !== item.id);
        await writeDb(db);
        return json(res, 200, { ok: true });
      }
    }

    if (method === "GET" && url.pathname === "/api/challenge-progress") {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const users = db.users
        .map((item) => challengeProgressForUser(db, item))
        .sort((a, b) => b.completedCount - a.completedCount || b.user.rating - a.user.rating || a.user.name.localeCompare(b.user.name));
      return json(res, 200, {
        teams: CHALLENGE_TEAMS,
        wildcards: CHALLENGE_WILDCARDS,
        users
      });
    }

    if (method === "GET" && url.pathname === "/api/users/search") {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const q = normalizeName(url.searchParams.get("q")).toLowerCase();
      const users = db.users
        .filter((item) => item.id !== user.id)
        .filter((item) => {
          if (!q) return true;
          return [
            item.name,
            item.registerNickname,
            item.telegramContact
          ].some((value) => String(value || "").toLowerCase().includes(q));
        })
        .slice(0, 10)
        .map(publicUser);
      return json(res, 200, { users });
    }

    const userProfileMatch = url.pathname.match(/^\/api\/users\/(\d+)$/);
    if (method === "GET" && userProfileMatch) {
      const viewer = requireAuth(db, req, res);
      if (!viewer) return;
      const profileUser = db.users.find((item) => item.id === Number(userProfileMatch[1]));
      if (!profileUser) return error(res, 404, "User not found");
      return json(res, 200, publicProfileSummary(db, profileUser, viewer));
    }

    if (method === "POST" && url.pathname === "/api/challenges") {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const body = await readBody(req);
      const toUser = db.users.find((item) => item.id === Number(body.toUserId));
      if (!toUser || toUser.id === user.id) return error(res, 400, "Challenge target user not found");
      const existingChallenge = pendingChallengeBetween(db, user.id, toUser.id);
      if (existingChallenge) return error(res, 409, "These players already have a pending challenge");
      const existingGame = activeGameBetween(db, user.id, toUser.id);
      if (existingGame) return error(res, 409, "These players already have an active game");
      const challenge = {
        id: db.nextIds.challenge++,
        fromUserId: user.id,
        toUserId: toUser.id,
        status: "pending",
        createdAt: nowIso()
      };
      db.challenges.push(challenge);
      await writeDb(db);
      return json(res, 201, { challenge: challengeView(challenge, db) });
    }

    const challengeMatch = url.pathname.match(/^\/api\/challenges\/(\d+)\/(accept|decline|cancel)$/);
    if (method === "POST" && challengeMatch) {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const id = Number(challengeMatch[1]);
      const action = challengeMatch[2];
      const challenge = db.challenges.find((item) => item.id === id);
      if (!challenge) return error(res, 404, "Challenge not found");
      if (challenge.status !== "pending") return error(res, 409, "This challenge has already been handled");

      if (action === "cancel") {
        if (challenge.fromUserId !== user.id) return error(res, 403, "Only the sender can cancel this challenge");
        challenge.status = "cancelled";
      } else {
        if (challenge.toUserId !== user.id) return error(res, 403, "Only the recipient can answer this challenge");
        if (action === "decline") {
          challenge.status = "declined";
        } else {
          const existingGame = activeGameBetween(db, challenge.fromUserId, challenge.toUserId);
          if (existingGame) return error(res, 409, "These players already have an active game");
          challenge.status = "accepted";
          const game = {
            id: db.nextIds.game++,
            challengeId: challenge.id,
            playerIds: [challenge.fromUserId, challenge.toUserId],
            status: "open",
            createdAt: nowIso(),
            submittedBy: null,
            submittedAt: null,
            pendingResult: null,
            result: null,
            elo: null
          };
          db.games.push(game);
          challenge.gameId = game.id;
        }
      }
      challenge.updatedAt = nowIso();
      await writeDb(db);
      return json(res, 200, { challenge: challengeView(challenge, db) });
    }

    const gameSubmitMatch = url.pathname.match(/^\/api\/games\/(\d+)\/result$/);
    if (method === "POST" && gameSubmitMatch) {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const id = Number(gameSubmitMatch[1]);
      const game = db.games.find((item) => item.id === id);
      if (!game) return error(res, 404, "Game not found");
      if (!game.playerIds.includes(user.id)) return error(res, 403, "Only a game participant can submit the result");
      if (game.status === "completed") return error(res, 409, "This game result has already been saved");
      if (game.status === "pending_confirmation" && game.pendingResult?.submittedBy !== user.id) {
        return error(res, 409, "This result is waiting for your confirmation");
      }

      const body = await readBody(req);
      const playerA = db.users.find((item) => item.id === game.playerIds[0]);
      const playerB = db.users.find((item) => item.id === game.playerIds[1]);
      if (!playerA || !playerB) return error(res, 409, "One of the players has been deleted");

      const result = calculateSubmittedResult(body, game, playerA, playerB);
      game.status = "pending_confirmation";
      game.submittedBy = user.id;
      game.submittedAt = nowIso();
      game.pendingResult = {
        submittedBy: user.id,
        submittedAt: game.submittedAt,
        result
      };
      game.result = null;
      game.elo = null;
      await writeDb(db);
      return json(res, 200, { game: gameView(game, db) });
    }

    const gameExitMatch = url.pathname.match(/^\/api\/games\/(\d+)\/exit$/);
    if (method === "POST" && gameExitMatch) {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const id = Number(gameExitMatch[1]);
      const game = db.games.find((item) => item.id === id);
      if (!game) return error(res, 404, "Game not found");
      if (!game.playerIds.includes(user.id)) return error(res, 403, "Only a game participant can exit this game");
      if (!["open", "pending_confirmation"].includes(game.status)) {
        return error(res, 409, "Only open or pending games can be exited");
      }
      if (game.status === "pending_confirmation" && game.pendingResult?.submittedBy !== user.id) {
        return error(res, 403, "Only the player waiting for confirmation can delete this pending game");
      }

      cancelGameWithoutElo(db, game);
      await writeDb(db);
      return json(res, 200, { game: gameView(game, db) });
    }

    const gameConfirmMatch = url.pathname.match(/^\/api\/games\/(\d+)\/(confirm-result|reject-result)$/);
    if (method === "POST" && gameConfirmMatch) {
      const user = requireAuth(db, req, res);
      if (!user) return;
      const id = Number(gameConfirmMatch[1]);
      const action = gameConfirmMatch[2];
      const game = db.games.find((item) => item.id === id);
      if (!game) return error(res, 404, "Game not found");
      if (!game.playerIds.includes(user.id)) return error(res, 403, "Only a game participant can confirm the result");
      if (game.status !== "pending_confirmation" || !game.pendingResult?.result) {
        return error(res, 409, "There is no submitted result to confirm");
      }
      if (game.pendingResult.submittedBy === user.id) {
        return error(res, 403, "The other player must confirm this result");
      }

      if (action === "reject-result") {
        game.status = "open";
        game.submittedBy = null;
        game.submittedAt = null;
        game.pendingResult = null;
        game.result = null;
        game.elo = null;
        await writeDb(db);
        return json(res, 200, { game: gameView(game, db) });
      }

      const playerA = db.users.find((item) => item.id === game.playerIds[0]);
      const playerB = db.users.find((item) => item.id === game.playerIds[1]);
      if (!playerA || !playerB) return error(res, 409, "One of the players has been deleted");
      const normalizedResult = calculateSubmittedResult({
        scores: game.pendingResult.result.scores,
        killzone: game.pendingResult.result.killzone,
        tiebreakers: game.pendingResult.result.tiebreakers
      }, game, playerA, playerB);
      game.pendingResult.result = normalizedResult;
      applyFinalResult(game, playerA, playerB, normalizedResult, user.id);
      await writeDb(db);
      return json(res, 200, { game: gameView(game, db) });
    }

    const adminGameDeleteMatch = url.pathname.match(/^\/api\/admin\/games\/(\d+)$/);
    if (method === "DELETE" && adminGameDeleteMatch) {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const id = Number(adminGameDeleteMatch[1]);
      const game = db.games.find((item) => item.id === id);
      if (!game) return error(res, 404, "Game not found");
      if (game.status !== "pending_confirmation") return error(res, 409, "Only pending games can be deleted here");

      cancelGameWithoutElo(db, game);
      await writeDb(db);
      return json(res, 200, { game: gameView(game, db) });
    }

    const adminGameResultMatch = url.pathname.match(/^\/api\/admin\/games\/(\d+)\/result$/);
    if ((method === "POST" || method === "PATCH") && adminGameResultMatch) {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const id = Number(adminGameResultMatch[1]);
      const game = db.games.find((item) => item.id === id);
      if (!game) return error(res, 404, "Game not found");

      const playerA = db.users.find((item) => item.id === game.playerIds[0]);
      const playerB = db.users.find((item) => item.id === game.playerIds[1]);
      if (!playerA || !playerB) return error(res, 409, "One of the players has been deleted");

      const body = await readBody(req);
      reverseGameElo(game, [playerA, playerB]);
      const result = calculateSubmittedResult(body, game, playerA, playerB);
      game.submittedBy = admin.id;
      game.submittedAt = nowIso();
      applyFinalResult(game, playerA, playerB, result, admin.id);
      await writeDb(db);
      return json(res, 200, { game: gameView(game, db) });
    }

    const adminChallengeCreditMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/challenge-credit$/);
    if (method === "POST" && adminChallengeCreditMatch) {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const target = db.users.find((user) => user.id === Number(adminChallengeCreditMatch[1]));
      if (!target) return error(res, 404, "User not found");
      const body = await readBody(req);
      const team = normalizeKillTeam(body.team);
      const action = body.action === "remove" ? "remove" : "credit";
      const validTeam = CHALLENGE_TEAMS.includes(team) || CHALLENGE_WILDCARDS.includes(team);
      if (!validTeam) return error(res, 400, "Unknown Kill Team for this challenge");

      target.challengeCredits = target.challengeCredits || [];
      if (action === "remove") {
        target.challengeCredits.push({
          team,
          action: "deduct",
          deductedBy: admin.id,
          deductedAt: nowIso()
        });
        target.updatedAt = nowIso();
        await writeDb(db);
        return json(res, 200, { progress: challengeProgressForUser(db, target) });
      }

      const progress = challengeProgressForUser(db, target);
      const mainStatus = progress.teams.find((item) => item.team === team)?.status;
      if (CHALLENGE_TEAMS.includes(team) && mainStatus === "locked") {
        return error(res, 409, "Previous Kill Teams must be completed first");
      }
      if (mainStatus === "completed" || progress.wildcards.find((item) => item.team === team)?.status === "completed") {
        return json(res, 200, { progress });
      }
      target.challengeCredits.push({
        team,
        action: "credit",
        creditedBy: admin.id,
        creditedAt: nowIso()
      });
      target.updatedAt = nowIso();
      await writeDb(db);
      return json(res, 200, { progress: challengeProgressForUser(db, target) });
    }

    if (method === "GET" && url.pathname === "/api/admin/users") {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const users = db.users.map((user) => {
        const games = db.games.filter((game) => game.playerIds.includes(user.id) && game.status === "completed");
        return { ...publicUser(user), gamesPlayed: games.length };
      }).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
      return json(res, 200, { users });
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (adminUserMatch) {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const target = db.users.find((user) => user.id === Number(adminUserMatch[1]));
      if (!target) return error(res, 404, "User not found");

      if (method === "PATCH") {
        const body = await readBody(req);
        if (body.rating !== undefined) {
          const rating = Number(body.rating);
          if (!Number.isInteger(rating) || rating < 0 || rating > 5000) {
            return error(res, 400, "Rating must be an integer between 0 and 5000");
          }
          target.rating = rating;
        }
        if (body.isAdmin !== undefined) {
          target.isAdmin = Boolean(body.isAdmin);
          if (target.id === admin.id && !target.isAdmin) {
            return error(res, 400, "You cannot remove administrator rights from yourself");
          }
        }
        target.updatedAt = nowIso();
        await writeDb(db);
        return json(res, 200, { user: publicUser(target) });
      }

      if (method === "DELETE") {
        if (target.id === admin.id) return error(res, 400, "You cannot delete yourself");
        db.users = db.users.filter((user) => user.id !== target.id);
        db.sessions = db.sessions.filter((session) => session.userId !== target.id);
        db.challenges = db.challenges.filter((challenge) =>
          challenge.fromUserId !== target.id && challenge.toUserId !== target.id
        );
        db.games = db.games.filter((game) => !game.playerIds.includes(target.id));
        await writeDb(db);
        return json(res, 200, { ok: true });
      }
    }

    error(res, 404, "Route not found");
  } catch (err) {
    error(res, 400, err.message || "Request failed");
  }
}

function normalizeApiPath(pathname) {
  const functionPrefix = "/.netlify/functions/api";
  let normalized = pathname || "/";
  if (normalized.startsWith(functionPrefix)) {
    normalized = `/api${normalized.slice(functionPrefix.length) || ""}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

const server = http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) {
    handleApi(req, res).catch((err) => error(res, 500, err.message || "Server error"));
    return;
  }
  sendStatic(req, res);
});

if (require.main === module) {
  ensureDb()
    .then(() => {
      server.listen(PORT, HOST, () => {
        const storage = USE_POSTGRES ? "PostgreSQL" : "JSON";
        console.log(`TGTV Ranking Tournament System is running at http://${HOST}:${PORT} using ${storage}`);
      });
    })
    .catch((err) => {
      console.error("Failed to initialize database:", err);
      process.exit(1);
    });
}

module.exports = {
  ensureDb,
  handleApi
};

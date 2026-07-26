const crypto = require("node:crypto");

const { SESSION_TTL_MS, INITIAL_RATING, COOKIE_SECURE } = require("../config");
const { HttpError, ValidationError, parseCookies, sessionCookie, clearedSessionCookie } = require("../http/io");
const users = require("../db/repositories/users");
const sessions = require("../db/repositories/sessions");
const challenges = require("../db/repositories/challenges");
const games = require("../db/repositories/games");
const { hashPassword, verifyPassword } = require("../domain/passwords");
const { requireName, normalizeName, profileText, requiredProfileText, validateAvatarData } =
  require("../domain/validation");
const { userSummary } = require("./views");

async function loadUserFromRequest(client, req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  return sessions.findActiveUser(client, token);
}

async function startSession(client, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sessions.deleteExpired(client);
  await sessions.create(client, { token, userId, expiresAt });
  return token;
}

async function buildUserSummary(client, user) {
  const [userChallenges, userGames] = await Promise.all([
    challenges.listForUser(client, user.id),
    games.listForUser(client, user.id)
  ]);

  const peopleIds = new Set([user.id]);
  for (const challenge of userChallenges) {
    peopleIds.add(challenge.fromUserId);
    peopleIds.add(challenge.toUserId);
  }
  for (const game of userGames) {
    for (const id of game.playerIds) peopleIds.add(id);
  }

  const people = await users.findByIds(client, [...peopleIds]);
  const hasAdmin = await users.hasAdmin(client);

  return userSummary({
    user,
    hasAdmin,
    challenges: userChallenges,
    games: userGames,
    people
  });
}

function readCredentials(body, minPasswordLength, tooShortMessage) {
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
  const telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
  const name = requireName(body.name);

  if (password.length < minPasswordLength) throw new ValidationError(tooShortMessage);
  if (password !== confirmPassword) throw new ValidationError("Passwords do not match");

  return { name, password, registerNickname, telegramContact };
}

async function createAccount(client, credentials, isAdmin) {
  if (await users.isNameTaken(client, credentials.name)) throw new HttpError(409, "This name is already taken");

  const user = await users.insert(client, {
    name: credentials.name,
    passwordHash: await hashPassword(credentials.password),
    avatarData: null,
    registerNickname: credentials.registerNickname,
    telegramContact: credentials.telegramContact,
    challengeCredits: [],
    rating: INITIAL_RATING,
    isAdmin
  });

  const token = await startSession(client, user.id);
  return {
    status: 201,
    body: await buildUserSummary(client, user),
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE) }
  };
}

async function me({ client, user }) {
  if (!user) return { user: null, hasAdmin: await users.hasAdmin(client) };
  return buildUserSummary(client, user);
}

async function updateMe({ client, user, body }) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = requireName(body.name);
    if (await users.isNameTaken(client, name, user.id)) throw new HttpError(409, "This name is already taken");
    patch.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "avatarData")) {
    patch.avatarData = validateAvatarData(body.avatarData);
  }
  if (Object.prototype.hasOwnProperty.call(body, "registerNickname")) {
    patch.registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
  }
  if (Object.prototype.hasOwnProperty.call(body, "telegramContact")) {
    patch.telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
  }

  // Validate the password change (if any) before any write happens below,
  // so a wrong currentPassword can never leave a partially-applied patch.
  let newPasswordHash = null;
  if (body.currentPassword || body.newPassword) {
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, "Current password is incorrect");
    }
    if (newPassword.length < 6) throw new ValidationError("New password must be at least 6 characters");
    newPasswordHash = await hashPassword(newPassword);
  }

  let updated = Object.keys(patch).length ? await users.updateProfile(client, user.id, patch) : user;
  if (newPasswordHash) updated = await users.setPasswordHash(client, user.id, newPasswordHash);

  return buildUserSummary(client, updated);
}

// Serializes the first-admin check-and-insert across concurrent register/setup-admin
// requests. pg_advisory_xact_lock is scoped to the ambient transaction and releases
// automatically at commit or rollback of THAT transaction — this helper must not open
// its own: routes carrying this helper are registered with tx: true, so the router
// (src/http/router.js, via withTransaction in src/db/pool.js) already has one open
// around the whole handler call. If this helper issued its own BEGIN/COMMIT here, the
// COMMIT would commit the router's transaction early, making the rest of the handler's
// work durable before the router can roll it back on a later failure.
const FIRST_ADMIN_LOCK_KEY = 847362951;

async function withFirstAdminLock(client, run) {
  await client.query("SELECT pg_advisory_xact_lock($1)", [FIRST_ADMIN_LOCK_KEY]);
  return run(await users.hasAdmin(client));
}

async function register({ client, body }) {
  const credentials = readCredentials(body, 6, "Password must be at least 6 characters");
  return withFirstAdminLock(client, (hasAdmin) => createAccount(client, credentials, !hasAdmin));
}

async function setupAdmin({ client, body }) {
  return withFirstAdminLock(client, (hasAdmin) => {
    if (hasAdmin) throw new HttpError(409, "An administrator already exists");
    const credentials = readCredentials(body, 8, "Administrator password must be at least 8 characters");
    return createAccount(client, credentials, true);
  });
}

// Заглушка нужной длины: verifyPassword на ней действительно считает scrypt,
// поэтому время ответа не выдаёт, существует ли учётная запись.
const ABSENT_USER_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

async function login({ client, body }) {
  const name = normalizeName(body.name);
  const user = await users.findByNameKey(client, name);
  const stored = user ? user.passwordHash : ABSENT_USER_HASH;
  const matches = await verifyPassword(String(body.password || ""), stored);
  if (!user || !matches) throw new HttpError(401, "Invalid name or password");

  const token = await startSession(client, user.id);
  return {
    status: 200,
    body: await buildUserSummary(client, user),
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE) }
  };
}

async function logout({ client, req }) {
  await sessions.deleteByToken(client, parseCookies(req).sid);
  return {
    status: 200,
    body: { ok: true },
    headers: { "Set-Cookie": clearedSessionCookie(COOKIE_SECURE) }
  };
}

module.exports = {
  loadUserFromRequest,
  buildUserSummary,
  me,
  updateMe,
  register,
  setupAdmin,
  login,
  logout
};

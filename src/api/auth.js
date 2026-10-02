const crypto = require("node:crypto");

const { SESSION_TTL_MS, SESSION_RENEW_AFTER_MS, INITIAL_RATING, COOKIE_SECURE } = require("../config");
const { HttpError, ValidationError, sessionToken, sessionCookie, clearedSessionCookie } = require("../http/io");
const users = require("../db/repositories/users");
const sessions = require("../db/repositories/sessions");
const access = require("../db/repositories/access");
const mail = require("../email/service");
const emailConfig = require("../email/config");
const emailSecurity = require("../email/security");
const challenges = require("../db/repositories/challenges");
const games = require("../db/repositories/games");
const teamMatches = require("../db/repositories/team-matches");
const { hashPassword, verifyPassword } = require("../domain/passwords");
const { requireName, normalizeName, profileText, requiredProfileText, validateAvatarData } = require("../domain/validation");
const { userSummary } = require("./views");
const {
  attachTournamentGameDetails,
  sortGameViews
} = require("./tournament-game-details");


async function loadUserFromRequest(client, req) {
  const token = sessionToken(req);
  if (!token) return null;
  const session = await sessions.findActiveSession(client, token);
  if (!session) return null;

  // Sliding expiry. Without it a session dies exactly SESSION_TTL_MS after
  // sign-in no matter how actively it is used, so a group that signed up
  // together is signed out together on a fixed date. Renewing only once a
  // session has burned through SESSION_RENEW_AFTER_MS keeps this off the hot
  // path: one UPDATE per session per day, not one per request. The cookie is
  // stashed on the request; the router turns it into a Set-Cookie header on
  // responses it actually completes, so a rolled-back transaction never ships
  // a renewal its UPDATE just lost.
  const remainingMs = new Date(session.expiresAt).getTime() - Date.now();
  if (remainingMs <= SESSION_TTL_MS - SESSION_RENEW_AFTER_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await sessions.extend(client, token, expiresAt);
    req.renewedSessionCookie = sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE);
  }

  const user = await access.hydrate(client, session.user);
  access.assertActive(user);
  return user;
}

async function startSession(client, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await sessions.deleteExpired(client);
  await sessions.create(client, { token, userId, expiresAt });
  return token;
}

async function buildUserSummary(client, user) {
  user = await access.hydrate(client, user);
  // A route-scoped pg Client executes one query at a time. Keep these reads
  // sequential so a busy dashboard refresh never overlaps operations on it.
  const userChallenges = await challenges.listForUser(client, user.id);
  const userGames = await games.listForUser(client, user.id);
  const teamPairings = await teamMatches.listActivePairingsForCaptain(client, user.id);

  const detailedGames = await attachTournamentGameDetails(client, userGames);

  const peopleIds = new Set([user.id]);
  for (const challenge of userChallenges) {
    peopleIds.add(challenge.fromUserId);
    peopleIds.add(challenge.toUserId);
  }
  for (const game of detailedGames) {
    for (const id of game.playerIds) peopleIds.add(id);
  }

  const people = await users.findByIds(client, [...peopleIds]);
  const hasAdmin = await users.hasAdmin(client);
  const result = userSummary({
    user,
    hasAdmin,
    challenges: userChallenges,
    games: sortGameViews(detailedGames),
    teamPairings,
    people
  });
  result.user.emailAccount = await mail.summary(client, user.id);
  return result;
}

function readCredentials(body, minPasswordLength, tooShortMessage) {
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const registerNickname = profileText(body.registerNickname, "Register Nickname", 40);
  const telegramContact = requiredProfileText(body.telegramContact, "Telegram Contact", 80);
  const name = requireName(body.name);

  if (password.length < minPasswordLength) throw new ValidationError(tooShortMessage);
  if (password.length > 256) throw new ValidationError("Password must contain 6 to 256 characters");
  if (password !== confirmPassword) throw new ValidationError("Passwords do not match");

  const email = emailConfig.configuration().enabled ? emailSecurity.normalizeEmail(body.email) : null;
  return { name, password, registerNickname, telegramContact, email, locale: body.locale === "en" ? "en" : "ru" };
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

  await mail.beginRegistration(client, user, credentials.email, credentials.locale);
  const token = await startSession(client, user.id);
  return {
    status: 201,
    body: await buildUserSummary(client, user),
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE) }
  };
}

async function myTeamPairings({ client, user }) {
  return { teamPairings: await teamMatches.listActivePairingsForCaptain(client, user.id) };
}

async function me({ client, user }) {
  if (!user) return { user: null, hasAdmin: await users.hasAdmin(client) };
  return buildUserSummary(client, user);
}

async function updateMe({ client, user, body, req }) {
  user = await require('./email').lockedUser(client, user.id, req);
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
    const newPassword = emailSecurity.password(body.newPassword);
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, "Current password is incorrect");
    }
    if (newPassword.length < 6) throw new ValidationError("New password must be at least 6 characters");
    newPasswordHash = await hashPassword(newPassword);
  }

  let updated = Object.keys(patch).length ? await applyProfilePatch(client, user.id, patch) : user;
  if (newPasswordHash) {
    updated = await users.setPasswordHash(client, user.id, newPasswordHash);
    await mail.passwordChanged(client, updated, req ? sessionToken(req) : null);
  }

  return buildUserSummary(client, updated);
}

// MEDIUM 1: isNameTaken-then-write is a TOCTOU gap; map the resulting unique violation to 409, not 500.
async function applyProfilePatch(client, id, patch) {
  try {
    return await users.updateProfile(client, id, patch);
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "This name is already taken");
    throw err;
  }
}

// Serializes the first-admin check-and-insert via a transaction-scoped lock.
// Must not open its own transaction: callers below are tx: true routes already inside one.
async function register({ client, body }) {
  const credentials = readCredentials(body, 6, "Password must be at least 6 characters");
  return createAccount(client, credentials, false);
}

async function setupAdmin() {
  throw new HttpError(410, "Register an account, then initialize its owner role using the local setup command");
}

// Заглушка нужной длины: verifyPassword на ней всё равно считает scrypt, так что время ответа не выдаёт существование учётной записи.
const ABSENT_USER_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

async function login({ client, body }) {
  const identifier = normalizeName(body.name);
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;
  let user = email
    ? await users.findByVerifiedEmail(client, email)
    : await users.findByNameKey(client, identifier);
  if (user) user = (await users.lockByIds(client, [user.id]))[0] || null;
  if (user && email) {
    // Email changes lock the same user. Recheck after acquiring that lock so
    // a replaced address cannot start a session using an earlier lookup.
    const account = await mail.account(client, user.id);
    if (account?.email !== email || !account.verified_at) user = null;
  }
  const stored = user ? user.passwordHash : ABSENT_USER_HASH;
  const matches = await verifyPassword(String(body.password || ""), stored);
  if (!user || !matches) throw new HttpError(401, "Invalid name or password");

  access.assertActive(await access.hydrate(client, user));

  const token = await startSession(client, user.id);
  return {
    status: 200,
    body: await buildUserSummary(client, user),
    headers: { "Set-Cookie": sessionCookie(token, SESSION_TTL_MS, COOKIE_SECURE) }
  };
}

async function logout({ client, req }) {
  await sessions.deleteByToken(client, sessionToken(req));
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
  myTeamPairings,
  updateMe,
  applyProfilePatch,
  register,
  setupAdmin,
  login,
  logout
};

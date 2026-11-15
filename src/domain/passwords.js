const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

async function hashPassword(password, salt = crypto.randomBytes(SALT_BYTES).toString("hex")) {
  const derived = await scrypt(String(password), salt, KEY_LENGTH);
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;

  let expectedBuffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (expectedBuffer.length !== KEY_LENGTH) return false;

  const actual = await scrypt(String(password), salt, KEY_LENGTH);
  return crypto.timingSafeEqual(expectedBuffer, actual);
}

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

module.exports = { hashPassword, verifyPassword, generateTemporaryPassword };

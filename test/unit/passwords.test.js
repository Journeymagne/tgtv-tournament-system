const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hashPassword,
  verifyPassword,
  generateTemporaryPassword
} = require("../../src/domain/passwords");

test("хеш имеет вид salt:hash и не совпадает с паролем", async () => {
  const stored = await hashPassword("password123");
  const [salt, hash] = stored.split(":");
  assert.equal(salt.length, 32);
  assert.equal(hash.length, 128);
  assert.ok(!stored.includes("password123"));
});

test("один пароль даёт разные хеши", async () => {
  assert.notEqual(await hashPassword("password123"), await hashPassword("password123"));
});

test("verifyPassword подтверждает верный пароль", async () => {
  const stored = await hashPassword("password123");
  assert.equal(await verifyPassword("password123", stored), true);
});

test("verifyPassword отвергает неверный пароль", async () => {
  const stored = await hashPassword("password123");
  assert.equal(await verifyPassword("wrong", stored), false);
});

test("verifyPassword не падает на битом хеше", async () => {
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "no-colon"), false);
  assert.equal(await verifyPassword("x", "salt:zzzz"), false);
});

test("verifyPassword совместим с хешами, созданными scryptSync", async () => {
  const crypto = require("node:crypto");
  const salt = crypto.randomBytes(16).toString("hex");
  const legacy = `${salt}:${crypto.scryptSync("legacy-pass", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("legacy-pass", legacy), true);
});

test("временный пароль достаточно длинный и каждый раз новый", () => {
  const first = generateTemporaryPassword();
  assert.ok(first.length >= 12);
  assert.notEqual(first, generateTemporaryPassword());
});

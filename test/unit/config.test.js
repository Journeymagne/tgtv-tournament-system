const test = require("node:test");
const assert = require("node:assert/strict");

const config = require("../../src/config");

test("конфигурация отдаёт значения по умолчанию", () => {
  assert.equal(config.PORT, Number(process.env.PORT) || 3000);
  assert.equal(config.SESSION_TTL_MS, 1000 * 60 * 60 * 24 * 14);
  assert.equal(config.INITIAL_RATING, 1000);
  assert.equal(config.MAX_REQUEST_BYTES, 2 * 1024 * 1024);
  assert.equal(config.MAX_AVATAR_DATA_URL_LENGTH, 1024 * 1024);
  assert.equal(config.LOGIN_RATE_LIMIT.max, 10);
});

test("requireDatabaseUrl бросает понятную ошибку при пустом значении", () => {
  assert.throws(
    () => config.requireDatabaseUrl(""),
    /DATABASE_URL is required/
  );
});

test("requireDatabaseUrl возвращает строку подключения", () => {
  const url = "postgres://user:pass@localhost:5432/db";
  assert.equal(config.requireDatabaseUrl(url), url);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const { createRateLimiter } = require("../../src/http/rate-limit");
const { HttpError } = require("../../src/http/io");

test("пропускает попытки в пределах лимита", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  limiter.check("1.2.3.4");
  limiter.recordFailure("1.2.3.4");
  limiter.check("1.2.3.4");
  limiter.recordFailure("1.2.3.4");
  assert.doesNotThrow(() => limiter.check("1.2.3.4"));
});

test("на превышении бросает 429", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  limiter.check("1.2.3.4");
  limiter.recordFailure("1.2.3.4");
  limiter.check("1.2.3.4");
  limiter.recordFailure("1.2.3.4");

  assert.throws(
    () => limiter.check("1.2.3.4"),
    (err) => err instanceof HttpError && err.status === 429
  );
});

test("считает каждый ключ отдельно", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  limiter.check("1.1.1.1");
  limiter.recordFailure("1.1.1.1");
  assert.doesNotThrow(() => limiter.check("2.2.2.2"));
});

test("окно истекает и счётчик сбрасывается", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, clock: () => now });
  limiter.check("1.2.3.4");
  limiter.recordFailure("1.2.3.4");
  assert.throws(() => limiter.check("1.2.3.4"));

  now = 1001;
  assert.doesNotThrow(() => limiter.check("1.2.3.4"));
});

test("пустой ключ не блокирует всех разом", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.doesNotThrow(() => limiter.check(null));
  limiter.recordFailure(null);
  assert.doesNotThrow(() => limiter.check(null));
});

test("Blocker 1: check() сам по себе не расходует бюджет — только recordFailure", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  // Calling check() alone, repeatedly, must never trip the limit: only a
  // reported failure may spend budget (a successful attempt costs nothing).
  limiter.check("1.2.3.4");
  limiter.check("1.2.3.4");
  limiter.check("1.2.3.4");
  assert.doesNotThrow(() => limiter.check("1.2.3.4"));

  limiter.recordFailure("1.2.3.4");
  assert.throws(
    () => limiter.check("1.2.3.4"),
    (err) => err instanceof HttpError && err.status === 429
  );
});

const { HttpError } = require("./io");

function createRateLimiter({ windowMs, max, clock = Date.now }) {
  const hits = new Map();

  function freshHits(key, now) {
    return (hits.get(key) || []).filter((time) => now - time < windowMs);
  }

  function prune(now) {
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((time) => now - time < windowMs);
      if (fresh.length) {
        hits.set(key, fresh);
      } else {
        hits.delete(key);
      }
    }
  }

  return {
    // Verifies `key` is under budget WITHOUT spending any of it. Callers that
    // only want failures to cost budget (Blocker 1: a successful sign-in
    // must not) call this up front, then call recordFailure only once they
    // know the attempt actually failed.
    check(key) {
      if (!key) return;
      const now = clock();
      if (hits.size > 1000) prune(now);
      if (freshHits(key, now).length >= max) {
        throw new HttpError(429, "Too many attempts. Try again later.");
      }
    },
    // Spends one unit of `key`'s budget. Called only for attempts judged to
    // have failed (wrong password, name already taken, ...) -- see
    // src/http/router.js, which records a failure whenever a rateLimit:
    // "auth" route's handler throws and never when it returns normally.
    recordFailure(key) {
      if (!key) return;
      const now = clock();
      const timestamps = freshHits(key, now);
      timestamps.push(now);
      hits.set(key, timestamps);
    },
    reset() {
      hits.clear();
    }
  };
}

module.exports = { createRateLimiter };

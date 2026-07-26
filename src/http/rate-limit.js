const { HttpError } = require("./io");

function createRateLimiter({ windowMs, max, clock = Date.now }) {
  const hits = new Map();

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
    check(key) {
      if (!key) return;
      const now = clock();
      if (hits.size > 1000) prune(now);

      const timestamps = (hits.get(key) || []).filter((time) => now - time < windowMs);
      if (timestamps.length >= max) {
        throw new HttpError(429, "Too many attempts. Try again later.");
      }
      timestamps.push(now);
      hits.set(key, timestamps);
    },
    reset() {
      hits.clear();
    }
  };
}

module.exports = { createRateLimiter };

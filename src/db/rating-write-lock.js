// Rating replay touches games and users across tournaments. Acquire this before
// business row locks, never only after a result has locked its own players.
async function acquireRatingWriteLock(client) {
  await client.query("SELECT pg_advisory_xact_lock(847362960)");
}

function withRatingWriteLock(handler) {
  return Object.assign(async function ratingWrite(request, ...args) {
    await acquireRatingWriteLock(request.client);
    return handler(request, ...args);
  }, { ratingMutation: true });
}

module.exports = { acquireRatingWriteLock, withRatingWriteLock };

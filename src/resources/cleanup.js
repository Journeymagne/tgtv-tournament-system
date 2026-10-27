const { withTransaction } = require('../db/pool');
const { logError } = require('../http/logger');
function start() {
  let pending = null;
  const tick = () => {
    if (pending) return;
    pending = withTransaction(async client => {
      await client.query(`DELETE FROM accounts.resource_budgets WHERE key IN
        (SELECT key FROM accounts.resource_budgets WHERE expires_at<NOW() ORDER BY expires_at LIMIT 500)`);
      await client.query(`DELETE FROM accounts.sessions WHERE token IN
        (SELECT token FROM accounts.sessions WHERE expires_at<NOW() ORDER BY expires_at LIMIT 500)`);
    })
      .catch(error => logError('resource budget cleanup failed', error)).finally(() => { pending = null; });
  };
  const timer = setInterval(tick, 60000); timer.unref();
  return async () => { clearInterval(timer); await pending; };
}
module.exports = { start };

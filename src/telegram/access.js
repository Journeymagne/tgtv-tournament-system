const { adminOnly } = require('./config');
const { HttpError } = require('../http/io');

// Read current database roles, never a cached session flag or Telegram username.
async function allowed(client, userId) {
  if (!adminOnly()) return true;
  if (!userId) return false;
  const { rows } = await client.query(`SELECT 1 FROM users u WHERE u.id=$1
    AND (u.suspended_until IS NULL OR u.suspended_until<=NOW())
    AND (u.is_admin OR EXISTS (SELECT 1 FROM platform_ownership p WHERE p.owner_user_id=u.id))`, [userId]);
  return rows.length > 0;
}

async function assertAllowed(client, userId) {
  if (!await allowed(client, userId)) throw new HttpError(403, 'Telegram и Mini App доступны только администраторам во время тестирования.');
}

async function chatAllowed(client, chatId) {
  if (!adminOnly()) return true;
  // A claimed, unexpired administrator link may receive the confirmation prompt.
  const { rows } = await client.query(`SELECT user_id FROM telegram_links WHERE telegram_id=$1
    UNION SELECT user_id FROM telegram_link_tokens WHERE telegram_id=$1 AND expires_at>NOW()`, [chatId]);
  for (const row of rows) if (await allowed(client, row.user_id)) return true;
  return false;
}

module.exports = { allowed, assertAllowed, chatAllowed };

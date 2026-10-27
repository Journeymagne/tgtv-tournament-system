const { HttpError } = require('../http/io');
const { DEFAULTS, CATALOG } = require('./policy');

async function limits(client, userId) {
  const { rows: [row] } = await client.query('SELECT limits FROM accounts.resource_quotas WHERE user_id=$1', [userId]);
  return { ...DEFAULTS, ...row?.limits };
}
async function lock(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['resource-quota:' + userId]);
}
function exceeded(key, limit, usage) {
  const title = CATALOG.find(item => item.key === key)?.ru || key;
  const error = new HttpError(409, `${title}: лимит ${limit}. Освободите место или обратитесь к superadmin для повышения квоты.`);
  error.quota = { key, limit, usage };
  return error;
}
function check(key, limit, current, next) {
  // Grandfather existing data: shrinking or unchanged usage remains allowed.
  if (next > limit && next > current) throw exceeded(key, limit, current);
}
async function spendKey(client, key, budget, seconds, label, amount = 1) {
  const { rows: [row] } = await client.query('SELECT accounts.spend_resource_budget($1,$2,$3,$4) AS retry', [key, budget, seconds, amount]);
  if (row.retry > 0) {
    const error = new HttpError(429, `${label}: лимит ${budget}. Повторите через ${row.retry} сек.`);
    error.headers = { 'Retry-After': String(row.retry) };
    throw error;
  }
}
async function spend(client, userId, key, seconds, suffix = '', effective = null) {
  effective ||= await limits(client, userId);
  await spendKey(client, `user:${userId}:${key}:${suffix}`, effective[key], seconds, CATALOG.find(item => item.key === key).ru);
}
async function studioUsage(client, owner) {
  const { rows: [row] } = await client.query(`SELECT
    (SELECT count(*)::int FROM studio.studio_projects WHERE owner_id=$1 AND deleted_at IS NULL) AS projects,
    COALESCE((SELECT sum(storage_bytes) FROM studio.studio_projects WHERE owner_id=$1),0)::text AS project_bytes,
    COALESCE((SELECT sum(byte_size + octet_length(manifest::text)) FROM studio.studio_tts_exports WHERE owner_id=$1),0)::text AS tts_bytes`, [owner]);
  return { projects: row.projects, bytes: Number(row.project_bytes) + Number(row.tts_bytes), ttsBytes: Number(row.tts_bytes) };
}
module.exports = { limits, lock, check, exceeded, spend, spendKey, studioUsage };

const { HttpError, ValidationError } = require('../http/io');
const { requirePositiveIntId } = require('./params');
const access = require('../db/repositories/access');
const quotas = require('../resources/quotas');
const { DEFAULTS, CATALOG, validateOverrides } = require('../resources/policy');

async function get({ client, user, params = {} }) {
  const id = params.id ? requirePositiveIntId(params.id, 404, 'User not found') : user.id;
  if (id !== user.id && !user.isSuperAdmin) throw new HttpError(403, 'Super administrator rights required');
  const { rows: [target] } = await client.query('SELECT id,name FROM users WHERE id=$1', [id]);
  if (!target) throw new HttpError(404, 'User not found');
  const { rows: [row] } = await client.query('SELECT * FROM accounts.resource_quotas WHERE user_id=$1', [id]);
  const { rows: [usage] } = await client.query('SELECT accounts.resource_usage($1) AS value', [id]);
  return { user: target, catalog: CATALOG, limits: { ...DEFAULTS, ...row?.limits }, overrides: row?.limits || {},
    usage: usage.value, revision: row?.revision || 0, reason: row?.reason || '', updatedAt: row?.updated_at || null };
}
async function update(ctx) {
  const { client, user, body } = ctx;
  if (ctx.req) {
    if (!/^application\/json(?:\s*;|$)/i.test(String(ctx.req.headers['content-type'] || ''))) throw new HttpError(415, 'Use application/json');
    if (ctx.req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site requests are not allowed');
    if (ctx.req.headers.origin) {
      let origin; try { origin = new URL(ctx.req.headers.origin); } catch { throw new HttpError(403, 'Invalid origin'); }
      if (origin.host !== ctx.req.headers.host) throw new HttpError(403, 'Cross-site requests are not allowed');
    }
  }
  if (!user.isSuperAdmin || await access.ownerId(client) !== user.id) throw new HttpError(403, 'Super administrator rights required');
  const id = requirePositiveIntId(ctx.params.id, 404, 'User not found');
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new ValidationError('Укажите версию квот.');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 1000) throw new ValidationError('Укажите причину изменения: 3–1000 символов.');
  const limits = validateOverrides(body.overrides);
  await quotas.lock(client, id);
  const before = await get(ctx);
  if (before.revision !== body.revision) throw new HttpError(409, 'Квоты уже изменены. Обновите окно перед сохранением.');
  if (JSON.stringify(before.overrides) === JSON.stringify(limits)) return before;
  await client.query(`INSERT INTO accounts.resource_quotas(user_id,limits,changed_by,reason) VALUES($1,$2,$3,$4)
    ON CONFLICT(user_id) DO UPDATE SET limits=$2,changed_by=$3,reason=$4,revision=resource_quotas.revision+1,updated_at=NOW()`, [id, limits, user.id, reason]);
  await access.audit(client, user, 'resource_quotas_changed', 'user', id, before.overrides, limits, reason);
  return get(ctx);
}
module.exports = { get, update };

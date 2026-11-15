const crypto = require('node:crypto');
const { HttpError, clientKey } = require('../http/io');
const { TRUST_PROXY } = require('../config');
const { siteOrigin } = require('../http/sites');
const { normalizeName } = require('./validation');

const EXPIRED = 'Telegram linking expired. Sign in again.';
const LIMITED = 'Too many linking attempts. Try again later.';
const CONFLICT = 'This account is already linked.';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const secret = () => crypto.randomBytes(32).toString('base64url');
const expired = () => new HttpError(401, EXPIRED);
const noStore = body => ({ body, headers: { 'Cache-Control': 'private, no-store' } });

// This module is also loaded by accounts, which has no Telegram configuration.
function validateRequest(req, body, kind) {
  const expected = (siteOrigin(req) || process.env.SITE_URL || `${req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`).replace(/\/+$/, '');
  if (!req.headers.origin || req.headers.origin !== expected) throw new HttpError(403, 'Invalid origin');
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) throw new HttpError(415, 'Use application/json');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request body');
  if (kind !== 'challenge' && (typeof body.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.challenge))) throw expired();
  if (kind === 'credentials' && (typeof body.name !== 'string' || body.name.length > 254 ||
    typeof body.password !== 'string' || body.password.length > 256)) throw new HttpError(400, 'Invalid request body');
  if (kind === 'confirm' && (typeof body.proof !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.proof))) throw expired();
  if (kind !== 'credentials' && (typeof body.initData !== 'string' || !body.initData || body.initData.length > 16384)) throw expired();
  if (kind === 'confirm' && body.locale !== undefined && !['ru', 'en'].includes(body.locale)) throw new HttpError(400, 'Invalid request body');
}

async function spend(client, policy, value) {
  const { rows: [row] } = await client.query('SELECT accounts.miniapp_link_budget($1,$2) AS allowed', [policy, hash(value)]);
  if (!row.allowed) {
    const error = new HttpError(429, LIMITED);
    error.headers = { 'Retry-After': '900', 'Cache-Control': 'private, no-store' };
    throw error;
  }
}
// Called on an autocommit client before the route's business transaction. Spend
// each budget even if an earlier one fails, and never undo a failed-password hit.
async function checkRequest(client, req, body, kind) {
  validateRequest(req, body, kind);
  let rejected;
  const budgets = [['ip', clientKey(req, TRUST_PROXY) || 'unknown']];
  if (kind === 'credentials') budgets.push(['challenge', body.challenge], ['identifier', normalizeName(body.name).toLowerCase()]);
  for (const [policy, value] of budgets) {
    try { await spend(client, policy, value); } catch (error) { if (error.status !== 429) throw error; rejected ||= error; }
  }
  if (rejected) throw rejected;
}

module.exports = { validateRequest, checkRequest, spend, hash, secret, expired, noStore, EXPIRED, LIMITED, CONFLICT };

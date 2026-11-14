const { HttpError } = require('../http/io');
const security = require('../domain/miniapp-link-security');
const miniAuth = require('./miniapp-auth');
const { configuration } = require('./config');
const access = require('./access');
const users = require('../db/repositories/users');
const accountAccess = require('../db/repositories/access');
const { publicUser } = require('../api/views');
const { queueReply } = require('./data');
const messages = require('./messages');

async function lockTelegram(client, id) {
  await client.query('SELECT pg_advisory_xact_lock(91827,$1)', [Number(BigInt(id) % 2147483647n)]);
}
function personFor(body) {
  const config = configuration();
  if (!config.enabled || !config.token) throw new HttpError(503, 'Вход через Telegram пока не настроен.');
  return { person: miniAuth.validateInitData(body.initData, config.token), config };
}
// The router runs this on an autocommit connection; only verified Telegram IDs
// can spend their admission budget. Accounts never imports this module.
async function preflight(client, req, body) {
  if (body?.initData === undefined) return;
  miniAuth.checkOrigin(req);
  const { person } = personFor(body);
  if ((await client.query('SELECT 1 FROM telegram_links WHERE telegram_id=$1', [person.id])).rowCount) return;
  await security.checkRequest(client, req, body, 'challenge');
  await security.spend(client, 'telegram', String(person.id));
  req.miniappLinkAdmission = security.hash(body.initData);
}
async function createChallenge(ctx, person) {
  // An unlink can commit between preflight and this transaction. A request that
  // skipped admission as already linked must re-bootstrap before creating a flow.
  if (ctx.req.miniappLinkAdmission !== security.hash(ctx.body.initData)) throw security.expired();
  const challenge = security.secret();
  const telegram = { id: String(person.id), username: messages.short(person.username, 32) || null,
    displayName: messages.short([person.first_name, person.last_name].filter(Boolean).join(' '), 120) };
  const { rows: [row] } = await ctx.client.query('SELECT accounts.miniapp_link_create($1,$2,$3,$4,$5) AS expires_at',
    [security.hash(challenge), telegram.id, security.hash(ctx.body.initData), telegram.username, telegram.displayName]);
  if (!row.expires_at) throw new HttpError(429, security.LIMITED);
  return { challenge, expiresAt: new Date(row.expires_at).toISOString(), telegram };
}
async function confirm(ctx) {
  security.validateRequest(ctx.req, ctx.body, 'confirm');
  const { person, config } = personFor(ctx.body);
  await lockTelegram(ctx.client, person.id);
  const challengeHash = security.hash(ctx.body.challenge);
  const { rows: [found] } = await ctx.client.query('SELECT accounts.miniapp_link_inspect($1) AS flow', [challengeHash]);
  const flow = found.flow;
  // Do not disclose account state for a guessed flow, mismatched launch or proof.
  if (!flow?.user_id || String(flow.telegram_id) !== String(person.id) || flow.init_data_hash !== security.hash(ctx.body.initData)) throw security.expired();
  await ctx.client.query('SELECT id FROM accounts.users WHERE id=$1 FOR UPDATE', [flow.user_id]);
  const { rows: [consumed] } = await ctx.client.query('SELECT accounts.miniapp_link_consume($1,$2,$3,$4,$5) AS ok',
    [challengeHash, security.hash(ctx.body.proof), person.id, security.hash(ctx.body.initData), flow.user_id]);
  if (!consumed.ok) throw security.expired();
  const user = await accountAccess.hydrate(ctx.client, await users.findById(ctx.client, flow.user_id));
  if (!user) throw security.expired();
  accountAccess.assertActive(user);
  await access.assertAllowed(ctx.client, user.id);
  if ((await ctx.client.query('SELECT 1 FROM telegram_links WHERE user_id=$1 OR telegram_id=$2', [user.id, person.id])).rowCount) throw new HttpError(409, security.CONFLICT);
  let link;
  try {
    ({ rows: [link] } = await ctx.client.query(`INSERT INTO telegram_links(user_id,telegram_id,chat_id,username,display_name,locale)
      VALUES($1,$2,$2,$3,$4,$5) RETURNING *`, [user.id, person.id, messages.short(person.username, 32),
      messages.short([person.first_name, person.last_name].filter(Boolean).join(' ')), ctx.body.locale === 'en' ? 'en' : 'ru']));
  } catch (error) { if (error.code === '23505') throw new HttpError(409, security.CONFLICT); throw error; }
  await queueReply(ctx.client, link.chat_id, messages.welcome(link.locale, true), `linked:${link.id}`, link.id);
  return security.noStore({ authenticated: true, user: publicUser(user), locale: link.locale, adminOnly: config.adminOnly,
    accessToken: miniAuth.issueToken(link, config.token), expiresIn: miniAuth.SESSION_SECONDS });
}
async function cancel(ctx) {
  security.validateRequest(ctx.req, ctx.body, 'cancel');
  const { person } = personFor(ctx.body);
  await lockTelegram(ctx.client, person.id);
  const challengeHash = security.hash(ctx.body.challenge);
  const { rows: [found] } = await ctx.client.query('SELECT accounts.miniapp_link_inspect($1) AS flow', [challengeHash]);
  if (found.flow?.user_id) await ctx.client.query('SELECT id FROM accounts.users WHERE id=$1 FOR UPDATE', [found.flow.user_id]);
  const { rows: [row] } = await ctx.client.query('SELECT accounts.miniapp_link_cancel($1,$2,$3) AS ok', [challengeHash, person.id, security.hash(ctx.body.initData)]);
  if (!row.ok) throw security.expired();
  return security.noStore({ ok: true });
}
module.exports = { createChallenge, confirm, cancel, preflight, lockTelegram };

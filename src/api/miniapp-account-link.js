const { HttpError } = require('../http/io');
const auth = require('./auth');
const security = require('../domain/miniapp-link-security');

async function login({ client, body, req }) {
  security.validateRequest(req, body, 'credentials');
  const challengeHash = security.hash(body.challenge);
  // Lookup does not lock the flow before the account. Password/reset/link paths
  // all lock account -> flow; recheck every property after those locks are held.
  const { rows: [initial] } = await client.query('SELECT user_id,revoked_at,expires_at FROM accounts.telegram_miniapp_link_flows WHERE challenge_hash=$1', [challengeHash]);
  if (!initial || initial.user_id || initial.revoked_at || new Date(initial.expires_at).getTime() <= Date.now()) throw security.expired();
  const user = await auth.verifyCredentials(client, body);
  const { rows: [flow] } = await client.query('SELECT * FROM accounts.telegram_miniapp_link_flows WHERE challenge_hash=$1 FOR UPDATE', [challengeHash]);
  if (!flow || flow.user_id || flow.revoked_at || new Date(flow.expires_at).getTime() <= Date.now()) throw security.expired();
  if ((await client.query('SELECT accounts.miniapp_link_account_linked($1) AS linked', [user.id])).rows[0].linked) throw new HttpError(409, security.CONFLICT);
  const proof = security.secret();
  await client.query('UPDATE accounts.telegram_miniapp_link_flows SET user_id=$2,proof_hash=$3 WHERE challenge_hash=$1', [challengeHash, user.id, security.hash(proof)]);
  return security.noStore({ account: { id: user.id, name: user.name },
    telegram: { id: String(flow.telegram_id), username: flow.username || null, displayName: flow.display_name },
    proof, expiresAt: new Date(flow.expires_at).toISOString() });
}
module.exports = { login };

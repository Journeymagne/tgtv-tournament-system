const test = require('node:test');
const assert = require('node:assert/strict');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool, withClient, withTransaction } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { createRouter } = require('../../src/http/router');
const { createRateLimiter } = require('../../src/http/rate-limit');
const { loadUserFromRequest } = require('../../src/api/auth');
const access = require('../../src/db/repositories/access');
const routes = require('../../src/api/routes');
const seed = require('../../src/faq-data/seed.json');
const { startApiServer } = require('../helpers/client');
const limiter = createRateLimiter({ max: 1000, windowMs: 60000 });
let server, owner, moderator, player, other;

function client() {
  let cookie = '', account;
  return {
    async request(method, path, body, extra = {}) {
      const headers = { ...(cookie ? { cookie } : {}),
        ...(account ? { 'x-faq-account': String(account) } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra };
      const response = await fetch(server.baseUrl + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body)
      });
      for (const value of response.headers.getSetCookie()) {
        if (value.startsWith('sid=')) cookie = value.split(';')[0];
      }
      const result = { status: response.status, body: await response.json() };
      if (result.body.user?.id) account = result.body.user.id;
      return result;
    }
  };
}
async function expect(request, status = 200) {
  const result = await request;
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body;
}
async function register(name) {
  const http = client();
  const { user } = await expect(http.request('POST', '/api/register', {
    name, password: 'password123', confirmPassword: 'password123', telegramContact: '@' + name
  }), 201);
  return { ...user, http };
}
const ruling = (changes = {}) => ({ category: 'community', rulingType: 'RAW',
  teams: ['Все команды'], question: 'How does this interaction work?',
  answer: 'Use the stated rule.', topic: 'Действия и способности', ...changes });

test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && /test/.test(target.pathname));
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, {
    withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter: limiter
  }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await getPool().query('TRUNCATE users, faq_entries, faq_history RESTART IDENTITY CASCADE');
  await getPool().query(`INSERT INTO faq_entries(id,content)
    SELECT value->>'id',value-'id' FROM jsonb_array_elements($1::jsonb)`, [JSON.stringify(seed.entries)]);
  limiter.reset();
  owner = await register('FAQOwner'); moderator = await register('FAQModerator');
  player = await register('FAQPlayer'); other = await register('FAQOther');
  await withTransaction(c => access.initializeOwner(c, owner.id));
  await expect(owner.http.request('PATCH', '/api/faq/moderators/' + moderator.id, { enabled: true }));
});

test('guests read the catalogue; shared sessions expose the scoped moderator role', async () => {
  const guest = client();
  const catalogue = await expect(guest.request('GET', '/api/faq'));
  assert.equal(catalogue.canModerate, false);
  assert.equal(catalogue.entries.filter(e => ['community', 'official'].includes(e.category)).length, 131);
  assert.equal(catalogue.entries.filter(e => e.category === 'conduct').length, 17);
  assert.equal(catalogue.entries.filter(e => e.category === 'info').length, 1);
  await expect(guest.request('POST', '/api/faq/submissions', ruling()), 401);
  const session = await expect(moderator.http.request('GET', '/api/session'));
  assert.equal(session.user.id, moderator.id);
  assert.equal(session.user.isFAQModerator, true);
  assert.equal(session.user.isAdmin, false);
  await expect(moderator.http.request('GET', '/api/admin/users'), 403);
  await expect(moderator.http.request('PATCH', '/api/faq/moderators/' + player.id, { enabled: true }), 403);
  await expect(owner.http.request('PATCH', '/api/faq/moderators/' + moderator.id, { enabled: false }));
  await expect(moderator.http.request('POST', '/api/faq/entries', ruling()), 403);
});

test('private reads and writes reject an editor bound to a different Companion account', async () => {
  const stale = { 'x-faq-account': String(moderator.id) };
  await expect(player.http.request('GET', '/api/faq/submissions', undefined, stale), 409);
  await expect(player.http.request('POST', '/api/faq/submissions', ruling(), stale), 409);
  await expect(player.http.request('GET', '/api/faq/submissions', undefined, { 'x-faq-account': '' }), 409);
  await expect(player.http.request('POST', '/api/faq/entries', ruling()), 403);
  const count = await getPool().query('SELECT COUNT(*)::int n FROM faq_submissions');
  assert.equal(count.rows[0].n, 0);
});

test('a returned submission is private to its author and can be revised and published', async () => {
  const { id } = await expect(player.http.request('POST', '/api/faq/submissions', ruling({ answer: '' })), 201);
  assert.equal((await expect(other.http.request('GET', '/api/faq/submissions'))).submissions.length, 0);
  const path = '/api/faq/submissions/' + id;
  await expect(moderator.http.request('POST', path + '/decision', { status: 'needs_changes', resolution: 'Add context' }));
  await expect(other.http.request('PATCH', path, ruling()), 403);
  await expect(player.http.request('PATCH', path, ruling()));
  const published = await expect(moderator.http.request('POST', path + '/decision', { status: 'accepted', entry: ruling() }));
  const entry = (await getPool().query('SELECT * FROM faq_entries WHERE id=$1', [published.entryId])).rows[0];
  assert.equal(entry.content.answer, 'Use the stated rule.');
  assert.equal(entry.created_by, moderator.id);
  await expect(moderator.http.request('POST', path + '/decision', { status: 'accepted', entry: ruling() }), 409);
  const history = await expect(moderator.http.request('GET', '/api/faq/entries/' + entry.id + '/history'));
  assert.equal(history.history[0].action, 'submission_accepted');
});

test('a conflicting correction leaves its submission pending and the published text intact', async () => {
  const { entry } = await expect(moderator.http.request('POST', '/api/faq/entries', ruling()));
  const { id } = await expect(player.http.request('POST', '/api/faq/submissions', ruling({ entryId: entry.id })), 201);
  await expect(moderator.http.request('PATCH', '/api/faq/entries/' + entry.id, ruling({ revision: entry.revision, answer: 'Updated answer' })));
  await expect(moderator.http.request('POST', '/api/faq/submissions/' + id + '/decision', {
    status: 'accepted', entry: ruling({ revision: entry.revision })
  }), 409);
  assert.equal((await getPool().query('SELECT status FROM faq_submissions WHERE id=$1', [id])).rows[0].status, 'pending');
  assert.equal((await getPool().query('SELECT content FROM faq_entries WHERE id=$1', [entry.id])).rows[0].content.answer, 'Updated answer');
});

test('an accepted correction to a GW answer creates a separate community clarification', async () => {
  const official = seed.entries.find(e => e.category === 'official');
  const before = (await getPool().query('SELECT content,revision FROM faq_entries WHERE id=$1', [official.id])).rows[0];
  const { id } = await expect(player.http.request('POST', '/api/faq/submissions', ruling({ entryId: official.id })), 201);
  const decision = await expect(moderator.http.request('POST', '/api/faq/submissions/' + id + '/decision', { status: 'accepted', entry: ruling() }));
  assert.notEqual(decision.entryId, official.id);
  assert.deepEqual((await getPool().query('SELECT content,revision FROM faq_entries WHERE id=$1', [official.id])).rows[0], before);
});

test('questions use the signed-in author; only moderators can reply', async () => {
  const entryId = seed.entries.find(e => e.category === 'community').id;
  const { id } = await expect(player.http.request('POST', '/api/faq/entries/' + entryId + '/questions', { body: 'What happens in this case?' }), 201);
  await expect(other.http.request('PATCH', '/api/faq/questions/' + id, { reply: 'Use this ruling' }), 403);
  await expect(moderator.http.request('PATCH', '/api/faq/questions/' + id, { reply: 'Use this ruling' }));
  const { questions } = await expect(client().request('GET', '/api/faq/entries/' + entryId + '/questions'));
  assert.equal(questions[0].author_id, player.id);
  assert.equal(questions[0].reply, 'Use this ruling');
  assert.equal(questions[0].moderator, moderator.name);
});

test('unsafe Markdown, uploaded image types and cross-origin writes are rejected or escaped', async () => {
  const { html } = await expect(client().request('POST', '/api/faq/render', { markdown: '<script>alert(1)</script>\n[x](javascript:alert(1))' }));
  assert.doesNotMatch(html, /<script|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
  await expect(moderator.http.request('POST', '/api/faq/entries', ruling({ images: [{ src: 'data:image/svg+xml;base64,PHN2Zz4=' }] })), 400);
  await expect(player.http.request('POST', '/api/faq/submissions', ruling(), { origin: 'https://other.example' }), 403);
  await expect(player.http.request('POST', '/api/faq/submissions', ruling(), { 'content-type': 'text/plain' }), 415);
});

test('authors can edit and delete comments, with account and revision guards and scoped moderation', async () => {
  const entryId = seed.entries.find(e => e.category === 'community').id;
  const path = '/api/faq/entries/' + entryId + '/questions';
  const { id } = await expect(player.http.request('POST', path, { body: 'Original comment' }), 201);
  const comment = '/api/faq/questions/' + id;
  await expect(other.http.request('PATCH', comment, { body: 'Other text', revision: 1 }), 403);
  await expect(moderator.http.request('PATCH', comment, { body: 'Other text', revision: 1 }), 403);
  await expect(other.http.request('DELETE', comment, { revision: 1 }), 403);
  await expect(player.http.request('PATCH', comment, { body: 'Edited comment', revision: 1 }, { 'x-faq-account': String(other.id) }), 409);
  await expect(player.http.request('PATCH', comment, { body: 'Edited comment', revision: 1 }));
  let q = (await expect(player.http.request('GET', path))).questions[0];
  assert.equal(q.body, 'Edited comment');
  assert.equal(q.revision, 2);
  assert.ok(q.updated_at);
  assert.equal(q.canEdit, true);
  assert.equal((await expect(moderator.http.request('GET', path))).questions[0].canEdit, false);
  await expect(player.http.request('DELETE', comment, { revision: 1 }), 409);
  await expect(player.http.request('DELETE', comment, { revision: q.revision }));
  assert.equal((await expect(player.http.request('GET', path))).questions.length, 0);
  await expect(moderator.http.request('PATCH', comment, { reply: 'Reply after deletion' }), 404);
  const next = await expect(player.http.request('POST', path, { body: 'Moderator may remove this' }), 201);
  await expect(moderator.http.request('DELETE', '/api/faq/questions/' + next.id, { revision: 1 }));
});

test('avatars use Companion endpoints and deleting a moderator reply preserves its question', async () => {
  await getPool().query('UPDATE users SET avatar_version=$2 WHERE id=ANY($1::int[])', [[player.id, moderator.id], 'faq-avatar']);
  const entryId = seed.entries.find(e => e.category === 'community').id;
  const path = '/api/faq/entries/' + entryId + '/questions';
  const { id } = await expect(player.http.request('POST', path, { body: 'Please clarify this rule' }), 201);
  const comment = '/api/faq/questions/' + id;
  await expect(moderator.http.request('PATCH', comment, { reply: 'First reply', revision: 1 }));
  let q = (await expect(player.http.request('GET', path))).questions[0];
  assert.equal(q.authorAvatarUrl, '/api/users/' + player.id + '/avatar?v=faq-avatar');
  assert.equal(q.moderatorAvatarUrl, '/api/users/' + moderator.id + '/avatar?v=faq-avatar');
  assert.equal(q.canEditReply, false);
  await expect(moderator.http.request('PATCH', comment, { reply: 'Edited reply', revision: q.revision }));
  q = (await expect(player.http.request('GET', path))).questions[0];
  assert.ok(q.reply_updated_at);
  await expect(player.http.request('DELETE', comment + '/reply', { revision: q.revision }), 403);
  await expect(moderator.http.request('DELETE', comment + '/reply', { revision: q.revision - 1 }), 409);
  await expect(moderator.http.request('DELETE', comment + '/reply', { revision: q.revision }));
  q = (await expect(client().request('GET', path))).questions[0];
  assert.equal(q.body, 'Please clarify this rule');
  assert.equal(q.reply, '');
  assert.equal(q.moderatorAvatarUrl, null);
});

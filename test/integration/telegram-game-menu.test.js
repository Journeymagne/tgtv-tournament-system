const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
process.env.DATABASE_URL = require('../helpers/db').TEST_DATABASE_URL;
Object.assign(process.env, { SERVICE_NAME: 'tournaments', TGTV_ENV_LOADED: '1', TELEGRAM_MODE: 'polling', TELEGRAM_BOT_USERNAME: 'ExampleBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32), TELEGRAM_ADMIN_ONLY: 'false', SITE_URL: 'https://example.com', TELEGRAM_MINI_APP_URL: '' });
const { migrate } = require('../../src/db/migrate');
const users = require('../../src/db/repositories/users');
const games = require('../../src/db/repositories/games');
const bot = require('../../src/telegram/bot');
const data = require('../../src/telegram/data');
const drafts = require('../../src/telegram/game-drafts');
const engine = require('../../src/telegram/game-draft-steps');
const website = require('../../src/api/games');
const optional = name => { const file = path.resolve(__dirname, '../../src/telegram/' + name + '.js'); return fs.existsSync(file) ? require(file) : {}; };
const messages = optional('game-messages'); const delivery = optional('interactive-delivery');
const ready = (api, name) => assert.equal(typeof api[name], 'function', `${name} provides native durable game screens`);
let pool, alpha, bravo, link, game, updateId = 100;
test.before(async () => { pool = new Pool(require('../helpers/schema').poolOptions); await require('../helpers/schema').resetSchemas(pool); await migrate(pool); });
test.after(async () => { await pool?.end(); await require('../../src/db/pool').closePool(); });
test.beforeEach(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE telegram_updates');
  alpha = await users.insert(pool, { name: 'MenuAlpha', passwordHash: 's:h', rating: 1000 });
  bravo = await users.insert(pool, { name: 'MenuBravo', passwordHash: 's:h', rating: 1000 });
  link = (await pool.query("INSERT INTO telegram_links(user_id,telegram_id,chat_id,locale) VALUES($1,870001,870001,'en') RETURNING *", [alpha.id])).rows[0];
  game = await games.insert(pool, { playerIds: [alpha.id, bravo.id] });
});
async function tx(fn) { const client = await pool.connect(); try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); } }
function update(action, messageId = 777) { return { update_id: ++updateId, callback_query: { id: String(updateId), from: { id: 870001, language_code: 'ru' }, data: action, message: { message_id: messageId, chat: { id: 870001, type: 'private' } } } }; }
async function act(action, messageId) { const value = update(action, messageId); await tx(client => bot.handleUpdate(client, value)); return value; }
async function latest() { return (await pool.query('SELECT * FROM telegram_outbox WHERE link_id=$1 ORDER BY id DESC LIMIT 1', [link.id])).rows[0]; }
const buttons = payload => payload.reply_markup.inline_keyboard.flat();
async function current() { const token = (await pool.query('SELECT token FROM telegram_game_drafts WHERE link_id=$1', [link.id])).rows[0].token; return tx(client => drafts.readDraft(client, { user: alpha, link, token })); }
async function fill(values = [6, 4, 5, 'crit', 2, 3, 1, 'kill']) {
  await act(`g:s:${game.id}:submit`);
  for (const value of values) {
    const view = await current(); const index = view.choices.findIndex(choice => choice.value === value); assert.ok(index >= 0, `choice ${value} for ${view.step?.field}`);
    const callback = buttons((await latest()).payload).find(button => button.callback_data === `g:d:${view.token}:${view.version}:choose:${index}`);
    assert.ok(callback, 'real bot payload exposes the selected score'); await act(callback.callback_data);
  }
  return current();
}
test('games command queues one compact screen without activeItems or per-game hydration', async t => {
  ready(data, 'queueScreen');
  for (let i = 0; i < 9; i++) await games.insert(pool, { playerIds: [alpha.id, bravo.id] });
  t.mock.method(data, 'activeGames', () => assert.fail('menu must use bounded summaries'));
  t.mock.method(data, 'activeItems', () => assert.fail('menu must not expand notifications'));
  await act('m:games'); const rows = (await pool.query('SELECT * FROM telegram_outbox WHERE link_id=$1', [link.id])).rows;
  assert.equal(rows.length, 1); assert.equal(buttons(rows[0].payload).filter(b => /^g:v:/.test(b.callback_data)).length, 6);
  assert.match(rows[0].payload.text, /My games/);
});
test('real bot score flow survives eight steps and commits a saved receipt with its durable screen', async () => {
  ready(messages, 'renderDraft'); const view = await fill(); assert.equal(view.screen, 'summary');
  assert.equal((await games.findById(pool, game.id)).status, 'open');
  const callback = buttons((await latest()).payload).find(b => b.callback_data === `g:d:${view.token}:${view.version}:submit`); assert.ok(callback);
  const final = await act(callback.callback_data); const saved = await games.findById(pool, game.id);
  assert.equal(saved.status, 'pending_confirmation'); assert.match((await latest()).payload.text, /submitted|confirmation/i);
  const receipt = (await pool.query('SELECT state FROM telegram_game_drafts WHERE token=$1', [view.token])).rows[0].state;
  assert.ok(receipt);
  await tx(client => bot.handleUpdate(client, final)); assert.deepEqual(await games.findById(pool, game.id), saved);
  await act(callback.callback_data); assert.deepEqual(await games.findById(pool, game.id), saved);
});
test('stale duplicate malformed and replaced-draft callbacks leave the current field unchanged with useful errors', async () => {
  ready(messages, 'renderDraft'); await act(`g:s:${game.id}:submit`); const first = await current();
  const callback = `g:d:${first.token}:0:choose:6`; await act(callback); const next = await current();
  await act(callback); assert.equal((await current()).version, next.version); assert.match((await latest()).payload.text, /changed|old|refresh|current/i);
  await act('g:d:bad:0:choose:6'); assert.equal((await current()).version, next.version);
  await act(`g:s:${game.id}:submit`); const replacement = await current(); assert.notEqual(replacement.token, first.token);
  await act(`g:d:${first.token}:1:choose:1`); assert.equal((await current()).token, replacement.token);
});
test('numeric callbacks avoid full hydration and start/final acquire rating before generic user locks', async t => {
  ready(messages, 'renderDraft'); const queries = [];
  await tx(client => bot.handleUpdate({ query: async (sql, args) => { queries.push(sql); return client.query(sql, args); } }, update(`g:s:${game.id}:submit`)));
  const rating = queries.findIndex(sql => sql.includes('847362960') || sql.includes('pg_advisory_xact_lock($1)'));
  const user = queries.findIndex(sql => sql.includes('91827,') || /accounts.users.*FOR UPDATE/s.test(sql));
  assert.ok(rating >= 0 && rating < user, 'rating lock precedes Telegram and account locks');
  t.mock.method(require('../../src/api/game-results'), 'gameDetail', () => assert.fail('numeric callback cannot hydrate full game'));
  const view = await current(); await act(`g:d:${view.token}:${view.version}:choose:6`); assert.equal((await current()).version, 1);
});
test('website conflict and suspended/relinked identities cannot submit a stale bot result', async () => {
  ready(messages, 'renderDraft'); const view = await fill();
  await tx(client => website.submitResult({ client, user: bravo, params: { id: String(game.id) }, body: { scores: { [alpha.id]: { crit: 1, kill: 2, tac: 3, primary: 'crit' }, [bravo.id]: { crit: 6, kill: 5, tac: 4, primary: 'kill' } } } }));
  const before = await games.findById(pool, game.id); await act(`g:d:${view.token}:${view.version}:submit`); assert.deepEqual(await games.findById(pool, game.id), before);
  await pool.query("UPDATE users SET suspended_until=NOW()+INTERVAL '1 day' WHERE id=$1", [alpha.id]);
  await act(`g:d:${view.token}:${view.version}:submit`); assert.deepEqual(await games.findById(pool, game.id), before);
  await pool.query('UPDATE users SET suspended_until=NULL WHERE id=$1', [alpha.id]);
  await pool.query('DELETE FROM telegram_links WHERE id=$1', [link.id]);
  await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,870001,870001)', [alpha.id]);
  await act(`g:d:${view.token}:${view.version}:submit`); assert.deepEqual(await games.findById(pool, game.id), before);
});
test('screen generation suppresses obsolete jobs and deleted targets fall back to send once', async () => {
  ready(data, 'queueScreen'); ready(delivery, 'deliver');
  await tx(client => data.queueScreen(client, { link, chatId: 870001, targetMessageId: 777, payload: { text: 'old' }, generation: 10, dedupKey: 'screen-old' }));
  const old = await latest();
  await tx(client => data.queueScreen(client, { link, chatId: 870001, targetMessageId: 777, payload: { text: 'new' }, generation: 11, dedupKey: 'screen-new' }));
  const fresh = await latest(); const calls = [];
  const send = async (method, body) => { calls.push([method, body]); if (method === 'editMessageText') throw Object.assign(Error('telegram_http_400'), { code: 400, description: 'Bad Request: message to edit not found', retryable: false }); return { message_id: 888 }; };
  await delivery.deliver(pool, old, { send }); assert.equal(calls.length, 0);
  await delivery.deliver(pool, fresh, { send }); assert.deepEqual(calls.map(row => row[0]), ['editMessageText', 'sendMessage']);
  assert.equal(Number((await pool.query('SELECT target_message_id FROM telegram_chat_screens WHERE link_id=$1', [link.id])).rows[0].target_message_id), 888);
  await delivery.deliver(pool, fresh, { send }); assert.equal(calls.length, 2, 'sent job cannot be delivered twice');
});
test('old-message taps cannot replace a newer delivered screen or start another draft', async () => {
  ready(data, 'queueScreen'); ready(delivery, 'deliver');
  await act(`g:s:${game.id}:submit`); const before = await current();
  await pool.query('UPDATE telegram_chat_screens SET target_message_id=999 WHERE link_id=$1', [link.id]);
  await act(`g:d:${before.token}:0:choose:6`, 777); assert.equal((await current()).version, before.version);
  await act(`g:s:${game.id}:submit`, 777); assert.equal((await current()).token, before.token);
});
test('429 leaves game state untouched and a newer screen supersedes its pending retry', async () => {
  ready(data, 'queueScreen'); ready(delivery, 'deliver');
  await act(`g:s:${game.id}:submit`); const job = await latest();
  const before = await games.findById(pool, game.id);
  await delivery.deliver(pool, job, { send: async () => { throw Object.assign(Error('telegram_http_429'), { code: 429, retryAfter: 19, retryable: true }); } });
  const retry = (await pool.query('SELECT * FROM telegram_outbox WHERE id=$1', [job.id])).rows[0];
  assert.equal(retry.state, 'pending'); assert.ok(new Date(retry.next_attempt_at) > Date.now() + 15000);
  const view = await current(); await act(`g:d:${view.token}:0:choose:6`);
  let calls = 0; await delivery.deliver(pool, retry, { send: async () => { calls++; return { message_id: 777 }; } });
  assert.equal(calls, 0); assert.deepEqual(await games.findById(pool, game.id), before);
});
test('delivery revalidates current account permissions before making a remote call', async () => {
  ready(data, 'queueScreen'); ready(delivery, 'deliver'); await act('games');
  await pool.query("UPDATE users SET suspended_until=NOW()+INTERVAL '1 day' WHERE id=$1", [alpha.id]);
  let calls = 0; await delivery.deliver(pool, await latest(), { send: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal((await latest()).state, 'cancelled');
});
test('bounded request admission permits a complete wizard but does not create unlimited errors', async () => {
  ready(messages, 'renderDraft'); await fill();
  for (let i = 0; i < 150; i++) await act('g:invalid');
  const count = Number((await pool.query('SELECT COUNT(*) FROM telegram_outbox WHERE link_id=$1', [link.id])).rows[0].count);
  assert.ok(count < 100, `bounded error rows: ${count}`); assert.equal((await current()).screen, 'summary');
});
test('elimination bot flow final-submits APL tie resolution and replays without another result effect', async () => {
  ready(messages, 'renderDraft');
  const tournament = (await pool.query("INSERT INTO tournaments(slug,name,status,format,single_elimination_size) VALUES('menu-elimination','Elimination','in_progress','single_elimination',8) RETURNING id")).rows[0];
  const participants = [];
  for (const actor of [alpha, bravo]) participants.push((await pool.query("INSERT INTO tournament_participants(tournament_id,user_id,display_name,display_name_key,faction,status,source) VALUES($1,$2,$3,$4,'Kasrkin','active','admin_manual') RETURNING id", [tournament.id, actor.id, actor.name, actor.name.toLowerCase()])).rows[0]);
  const round = (await pool.query("INSERT INTO tournament_rounds(tournament_id,round_number,status) VALUES($1,1,'active') RETURNING id", [tournament.id])).rows[0];
  const match = (await pool.query("INSERT INTO tournament_matches(tournament_id,round_id,round_number,bracket_position,status,participant_a_id,participant_b_id) VALUES($1,$2,1,1,'active',$3,$4) RETURNING id", [tournament.id, round.id, participants[0].id, participants[1].id])).rows[0];
  game = await games.insert(pool, { playerIds: [alpha.id, bravo.id], sourceType: 'tournament_match', sourceId: match.id, participants: [alpha, bravo].map((actor, i) => ({ userId: actor.id, resultKey: actor.id, tournamentParticipantId: participants[i].id, displayNameSnapshot: actor.name, factionSnapshot: 'Kasrkin' })) });
  await pool.query('UPDATE tournament_matches SET game_id=$2 WHERE id=$1', [match.id, game.id]);
  const view = await fill([3, 3, 3, 'crit', 3, 3, 3, 'crit', 0, 5, 0, 4]); assert.equal(view.screen, 'summary');
  const callback = `g:d:${view.token}:${view.version}:submit`; await act(callback);
  const saved = await games.findById(pool, game.id); assert.equal(saved.status, 'completed'); assert.equal(saved.result.winnerId, alpha.id);
  const ratings = (await pool.query('SELECT id,rating FROM users ORDER BY id')).rows;
  await act(callback); assert.deepEqual(await games.findById(pool, game.id), saved); assert.deepEqual((await pool.query('SELECT id,rating FROM users ORDER BY id')).rows, ratings);
});

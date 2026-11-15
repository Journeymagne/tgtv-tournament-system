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
  await pool.query('TRUNCATE telegram_updates,telegram_state');
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
async function captainGame() {
  const tournament = (await pool.query("INSERT INTO tournaments(slug,name,status,format,participant_mode,team_size,pairing_type) VALUES('menu-captains','Captain event','in_progress','swiss','team',3,'shield_sword') RETURNING id")).rows[0];
  const round = (await pool.query("INSERT INTO tournament_rounds(tournament_id,round_number,status) VALUES($1,1,'active') RETURNING id", [tournament.id])).rows[0];
  const sides = [];
  for(const [i, captain] of [alpha, bravo].entries()) {
    const team = (await pool.query('INSERT INTO player_teams(slug,name,name_key,leader_user_id) VALUES($1,$1,$1,$2) RETURNING id', ['menu-team-' + i, captain.id])).rows[0];
    const roster = (await pool.query("INSERT INTO tournament_team_rosters(tournament_id,team_id,name,name_key,captain_user_id,team_name_snapshot,status) VALUES($1,$2,$3,$3,$4,$3,'active') RETURNING id", [tournament.id, team.id, 'Menu roster ' + i, captain.id])).rows[0];
    const member = (await pool.query("INSERT INTO tournament_team_roster_members(tournament_id,roster_id,slot,display_name_snapshot,faction_snapshot) VALUES($1,$2,1,$3,'Kasrkin') RETURNING id", [tournament.id, roster.id, 'Proxy ' + i])).rows[0];
    sides.push({ roster, member });
  }
  const match = (await pool.query("INSERT INTO tournament_team_matches(tournament_id,round_id,round_number,bracket_position,roster_a_id,roster_b_id,phase) VALUES($1,$2,1,1,$3,$4,'in_progress') RETURNING id", [tournament.id, round.id, sides[0].roster.id, sides[1].roster.id])).rows[0];
  const record = await games.insert(pool, { playerIds: [], sourceType: 'team_match_game', sourceId: match.id, sourceSlot: 1,
    participants: sides.map((side, i) => ({ userId: null, resultKey: -side.member.id, isProxy: true, displayNameSnapshot: 'Proxy ' + i, factionSnapshot: 'Kasrkin' })) });
  await pool.query("INSERT INTO tournament_team_match_games(team_match_id,game_id,slot,roster_a_member_id,roster_b_member_id,mission) VALUES($1,$2,1,$3,$4,'{}')", [match.id, record.id, sides[0].member.id, sides[1].member.id]);
  return record;
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
  const nextScreen = await latest();
  await act(callback); assert.equal((await current()).version, next.version); assert.match((await latest()).payload.text, /changed|old|refresh|current/i);
  const preserved = (await pool.query('SELECT generation FROM telegram_chat_screens WHERE link_id=$1', [link.id])).rows[0];
  assert.equal(String(preserved.generation), String(nextScreen.screen_generation), 'a stale tap must retain the latest working screen generation');
  const pendingScreen = (await pool.query('SELECT state,payload FROM telegram_outbox WHERE id=$1', [nextScreen.id])).rows[0];
  assert.equal(pendingScreen.state, 'pending'); assert.deepEqual(pendingScreen.payload, nextScreen.payload);
  await act('g:d:bad:0:choose:6'); assert.equal((await current()).version, next.version);
  await act(`g:s:${game.id}:submit`); const replacement = await current(); assert.notEqual(replacement.token, first.token);
  await act(`g:d:${first.token}:1:choose:1`); assert.equal((await current()).token, replacement.token);
});
test('Back Edit Extras and Cancel preserve choices and never reuse a version for a different field', async () => {
  ready(messages, 'renderDraft'); await act(`g:s:${game.id}:submit`);
  let view = await current(); await act(`g:d:${view.token}:0:choose:6`); view = await current();
  await act(`g:d:${view.token}:${view.version}:back`); const back = await current(); assert.equal(back.step.field, 'crit'); assert.equal(back.step.value, 6);
  await act(`g:d:${view.token}:1:choose:0`); assert.equal((await current()).version, back.version, 'old Kill choice cannot overwrite Crit after Back');
  view = await fill(); await act(`g:d:${view.token}:${view.version}:extras`); view = await current();
  const index = view.editableFields.findIndex(field => field.extra && field.field === 'faction'); assert.ok(index >= 0);
  await act(`g:d:${view.token}:${view.version}:edit:${index}`); view = await current(); assert.equal(view.step.field, 'faction');
  await act(`g:p:${view.token}:${view.version}:1`); assert.equal((await current()).version, view.version, 'dictionary paging does not advance the field');
  await act(`g:d:${view.token}:${view.version}:choose:0`); view = await current(); assert.equal(view.screen, 'extras');
  await act(`g:d:${view.token}:${view.version}:back`); view = await current(); assert.equal(view.screen, 'summary');
  await act(`g:d:${view.token}:${view.version}:cancel`); assert.equal((await current()).screen, 'cancelled'); assert.equal((await games.findById(pool, game.id)).status, 'open');
});
test('another linked private chat cannot advance a token owned by the first account', async () => {
  ready(messages, 'renderDraft'); await act(`g:s:${game.id}:submit`); const view = await current();
  await pool.query("INSERT INTO telegram_links(user_id,telegram_id,chat_id,locale) VALUES($1,870002,870002,'en')", [bravo.id]);
  const foreign = update(`g:d:${view.token}:0:choose:6`); foreign.callback_query.from.id = 870002; foreign.callback_query.message.chat.id = 870002;
  await tx(client => bot.handleUpdate(client, foreign)); assert.equal((await current()).version, 0);
  const reply = (await pool.query('SELECT payload FROM telegram_outbox WHERE chat_id=870002')).rows[0]; assert.match(reply.payload.text, /no longer available|unavailable/i);
});
test('a delayed start from an older card on the same edited message cannot replace the new draft', async () => {
  ready(messages, 'renderDraft'); await act(`g:v:${game.id}`);
  const start = buttons((await latest()).payload).find(button => button.callback_data?.startsWith(`g:s:${game.id}:submit`)); assert.ok(start);
  await act(start.callback_data); const first = await current();
  await act(`g:d:${first.token}:0:choose:6`); const next = await current();
  await act(start.callback_data); const after = await current(); assert.equal(after.token, first.token); assert.equal(after.version, next.version);
});
test('captain-only proxy bot submission retains negative result keys and revocation blocks a replacement draft', async () => {
  ready(messages, 'renderDraft'); game = await captainGame();
  await act('games'); assert.ok(buttons((await latest()).payload).some(button => button.callback_data === `g:v:${game.id}`));
  const view = await fill(); assert.ok(view.game.playerIds.every(id => id < 0));
  await act(`g:d:${view.token}:${view.version}:submit`); const saved = await games.findById(pool, game.id); assert.equal(saved.status, 'pending_confirmation');
  assert.ok(Object.keys(saved.pendingResult.result.scores).every(key => Number(key) < 0));
  await pool.query('UPDATE tournament_team_rosters SET captain_user_id=NULL WHERE captain_user_id=$1', [alpha.id]);
  await act(`g:s:${game.id}:submit`); assert.deepEqual(await games.findById(pool, game.id), saved); assert.match((await latest()).payload.text, /unavailable|changed/i);
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
test('My games from the welcome or an error message always reopens the current game screen', async () => {
  ready(data, 'queueScreen'); await act(`g:s:${game.id}:submit`); const draft = await current();
  const screen = (await pool.query('SELECT generation FROM telegram_chat_screens WHERE link_id=$1', [link.id])).rows[0];
  await pool.query('UPDATE telegram_chat_screens SET target_message_id=999 WHERE link_id=$1', [link.id]);
  await act(`g:d:${draft.token}:0:choose:6`, 777);
  const notice = await latest();
  assert.equal(notice.screen_generation, null, 'old-message guidance must not overwrite the current screen');
  assert.ok(buttons(notice.payload).some(button => button.callback_data === 'm:games'));
  assert.equal(String((await pool.query('SELECT generation FROM telegram_chat_screens WHERE link_id=$1', [link.id])).rows[0].generation), String(screen.generation));
  await act('m:games', 778);
  const reopened = await latest(); assert.match(reopened.payload.text, /My games/);
  assert.ok(buttons(reopened.payload).some(button => button.callback_data === `g:v:${game.id}`));
  assert.equal(String(reopened.target_message_id), '999');
  assert.equal((await current()).version, draft.version);
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
test('same-chat concurrent delivery is serialized and the latest edit follows an older in-flight call', { timeout: 10000 }, async () => {
  ready(delivery, 'deliver'); await act(`g:s:${game.id}:submit`);
  const old = await latest(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; }); const wait = new Promise(resolve => { release = resolve; });
  const calls = [];
  const send = async (method, body) => { calls.push([method, body.text]); if(calls.length === 1) { entered(); await wait; } return { message_id: 777 }; };
  const first = delivery.deliver(pool, old, { send });
  try {
    await started; const view = await current(); await act(`g:d:${view.token}:0:choose:6`);
    const fresh = await latest(); await delivery.deliver(pool, fresh, { send }); assert.equal(calls.length, 1, 'second worker does not overlap a chat request');
    release(); await first; await delivery.deliver(pool, fresh, { send }); assert.equal(calls.length, 2);
    assert.equal(calls[1][1], fresh.payload.text); assert.notEqual(calls[0][1], calls[1][1]); assert.equal((await latest()).state, 'sent');
  } finally { release(); await first; }
});

for(const scope of ['game','pairing']) for(const change of ['captain','publication']) test(`queued ${scope} menu is cancelled after ${change} access changes`, async () => {
  const captain = await captainGame();
  if(scope==='pairing') {
    await pool.query("UPDATE games SET status='cancelled' WHERE id=$1",[captain.id]);
    await pool.query("UPDATE tournament_team_matches SET phase='awaiting_roll'");
  }
  await act('games'); const job = await latest();
  assert.ok(scope==='game' ? buttons(job.payload).some(b=>b.callback_data===`g:v:${captain.id}`) : buttons(job.payload).some(b=>b.url?.includes('/team-matches/')));
  if(change==='captain') await pool.query('UPDATE tournament_team_rosters SET captain_user_id=NULL WHERE captain_user_id=$1',[alpha.id]);
  else await pool.query("UPDATE tournaments SET status='draft' WHERE slug='menu-captains'");
  let calls=0;
  await delivery.deliver(pool,job,{send:async()=>{calls++;return {message_id:777};}});
  assert.equal(calls,0,'queued menu must not disclose content after access is revoked');
  assert.equal((await latest()).state,'cancelled');
});

test('menu delivery retains valid access and rechecks it before deleted-message fallback', async () => {
  await captainGame(); await act('games');
  let calls=0;
  await delivery.deliver(pool,await latest(),{send:async()=>{calls++;return {message_id:777};}});
  assert.equal(calls,1); assert.equal((await latest()).state,'sent');
  await act('games'); const job=await latest(); const methods=[];
  await delivery.deliver(pool,job,{send:async method=>{
    methods.push(method);
    await pool.query('UPDATE tournament_team_rosters SET captain_user_id=NULL WHERE captain_user_id=$1',[alpha.id]);
    throw Object.assign(Error('telegram_http_400'),{code:400,description:'Bad Request: message to edit not found',retryable:false});
  }});
  assert.deepEqual(methods,['editMessageText'],'revocation during edit must suppress the fallback send');
  assert.equal((await latest()).state,'cancelled');
});
for(const mode of ['confirm', 'reject']) test(`bot ${mode} review requires explicit final confirmation and replays exactly once`, async () => {
  ready(messages, 'renderDraft');
  await tx(client => website.submitResult({ client, user: bravo, params: { id: String(game.id) }, body: { scores: {
    [alpha.id]: { crit: 6, kill: 4, tac: 5, primary: 'crit' }, [bravo.id]: { crit: 2, kill: 3, tac: 1, primary: 'kill' }
  } } }));
  await act(`g:s:${game.id}:${mode}`); const view = await current(); assert.equal(view.screen, 'review'); assert.equal((await games.findById(pool, game.id)).status, 'pending_confirmation');
  assert.ok(!buttons((await latest()).payload).some(button => /:edit:|:choose:/.test(button.callback_data || '')));
  const action = `g:d:${view.token}:${view.version}:submit`; const queries = [];
  await tx(client => bot.handleUpdate({ query: async (sql, args) => { queries.push(sql); return client.query(sql, args); } }, update(action)));
  const rating = queries.findIndex(sql => sql.includes('847362960')); const generic = queries.findIndex(sql => sql.includes('91827,')); assert.ok(rating >= 0 && rating < generic);
  const saved = await games.findById(pool, game.id); assert.equal(saved.status, mode === 'confirm' ? 'completed' : 'open');
  await act(action); assert.deepEqual(await games.findById(pool, game.id), saved);
});
test('interactive work gets priority while aged notifications and other chats keep making progress', async () => {
  ready(data, 'queueScreen'); const worker = require('../../src/telegram/worker');
  await act('games');
  const other = (await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,870002,870002) RETURNING *', [bravo.id])).rows[0];
  await data.queueReply(pool, other.chat_id, { text: 'other chat' }, 'fair-other', other.id);
  const insert = () => pool.query("INSERT INTO telegram_outbox(link_id,chat_id,notification,dedup_key) VALUES($1,870001,'{}','fair-notification') RETURNING *", [link.id]);
  const notification = (await insert()).rows[0];
  assert.equal(await tx(client => worker.claim(client, 'notification')), undefined, 'fresh notification yields to a due interactive request');
  const first = await tx(client => worker.claim(client)); assert.equal(first.notification, null);
  const otherJob = await tx(client => worker.claim(client)); assert.equal(String(otherJob.chat_id), '870002', 'one busy chat cannot block another');
  await pool.query("UPDATE telegram_outbox SET state='sent',sent_at=NOW()-INTERVAL '2 seconds',locked_until=NULL WHERE id=ANY($1::bigint[])", [[first.id, otherJob.id]]);
  await act('games');
  await pool.query("UPDATE telegram_outbox SET created_at=NOW()-INTERVAL '20 seconds' WHERE id=$1", [notification.id]);
  assert.equal(await tx(client => worker.claim(client)), undefined, 'aged notification reserves one fair turn');
  const fair = await tx(client => worker.claim(client, 'notification')); assert.equal(fair.id, notification.id);
});

test('an aged notification backlog alternates with pending interactive replies before it drains', async () => {
  const worker=require('../../src/telegram/worker');
  await act('games');
  for(let i=0;i<4;i++) await pool.query("INSERT INTO telegram_outbox(link_id,chat_id,notification,dedup_key,created_at) VALUES($1,870001,'{}',$2,NOW()-INTERVAL '30 seconds')",[link.id,'backlog-'+i]);
  const sent=job=>pool.query("UPDATE telegram_outbox SET state='sent',sent_at=NOW()-INTERVAL '2 seconds',locked_until=NULL WHERE id=$1",[job.id]);
  assert.equal(await tx(client=>worker.claim(client)),undefined);
  const first=await tx(client=>worker.claim(client,'notification')); assert.ok(first?.notification); await sent(first);
  assert.equal(await tx(client=>worker.claim(client,'notification')),undefined,'one aged notification yields the next turn');
  const answer=await tx(client=>worker.claim(client)); assert.ok(answer && answer.notification===null,'interactive work proceeds while three old notifications remain'); await sent(answer);
  await act('games');
  assert.equal(await tx(client=>worker.claim(client)),undefined,'notifications also retain a bounded fair turn');
  const second=await tx(client=>worker.claim(client,'notification')); assert.ok(second?.notification); await sent(second);
  assert.equal(await tx(client=>worker.claim(client,'notification')),undefined);
  assert.ok(await tx(client=>worker.claim(client)));
});
test('a permanent command error rolls back partial work and advances the poll offset with one durable error reply', async t => {
  ready(data, 'queueScreen');
  t.mock.method(data, 'queueScreen', () => { throw Error('synthetic renderer outage'); });
  const logs = []; t.mock.method(console, 'error', line => logs.push(line));
  const event = update(`g:s:${game.id}:submit`); const worker = require('../../src/telegram/worker');
  await worker.processUpdate(event, { answer: async () => {}, transaction: tx });
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_game_drafts')).rows[0].n, 0);
  assert.equal((await games.findById(pool, game.id)).status, 'open');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_outbox WHERE link_id=$1', [link.id])).rows[0].n, 1);
  assert.equal(Number((await pool.query("SELECT value FROM telegram_state WHERE key='poll-offset'")).rows[0].value), event.update_id + 1);
  assert.equal(logs.length, 1);
});
test('fan-out cursors bound each expansion to ten links and eventually include every eligible recipient', async () => {
  ready(data, 'queueScreen');
  for(let i = 0; i < 12; i++) {
    const actor = await users.insert(pool, { name: 'Fanout' + i, passwordHash: 's:h', rating: 1000 });
    await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,$2,$2)', [actor.id, 880000 + i]);
  }
  await pool.query('TRUNCATE telegram_events');
  await pool.query("INSERT INTO telegram_events(entity,entity_id) VALUES('games',$1)", [game.id]);
  const recipients = [];
  // Observe recipient lookup through the real expansion and real SQL client.
  const observed = { query: async (sql, args) => { const result = await pool.query(sql, args); if(sql.includes('SELECT DISTINCT g.id')) recipients.push(args[0]); return result; } };
  await data.expandEvents(observed); assert.equal(recipients.length, 10);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM telegram_state WHERE key='event-expansion'")).rows[0].n, 1);
  await data.expandEvents(observed); assert.equal(new Set(recipients).size, 13);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_events WHERE processed_at IS NULL')).rows[0].n, 0);
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
  ready(delivery, 'deliver'); await delivery.deliver(pool, await latest(), { send: async () => { throw Object.assign(Error('telegram_network_error'), { retryable: true }); } });
  await act(callback); assert.deepEqual(await games.findById(pool, game.id), saved); assert.deepEqual((await pool.query('SELECT id,rating FROM users ORDER BY id')).rows, ratings);
});
test('restricted tournaments role runs the actual bot wizard and screen delivery without account secrets', async () => {
  ready(delivery, 'deliver');
  for(const schema of require('../../src/db/schemas').SCHEMAS) process.env[schema.toUpperCase() + '_DB_PASSWORD'] = 'isolated-menu-role-test-' + schema;
  await require('../../scripts/provision-service-roles').provision();
  const restricted = fn => tx(async client => { await client.query('SET LOCAL ROLE kt_tournaments'); return fn(client); });
  await restricted(client => bot.handleUpdate(client, update(`g:s:${game.id}:submit`)));
  for(const value of [6, 4, 5, 'crit', 2, 3, 1, 'kill']) {
    const view = await current(); const index = view.choices.findIndex(choice => choice.value === value);
    await restricted(client => bot.handleUpdate(client, update(`g:d:${view.token}:${view.version}:choose:${index}`)));
  }
  const view = await current(); await restricted(client => bot.handleUpdate(client, update(`g:d:${view.token}:${view.version}:submit`)));
  assert.equal((await games.findById(pool, game.id)).status, 'pending_confirmation');
  const client = await pool.connect();
  try {
    await client.query('SET ROLE kt_tournaments'); let calls = 0;
    await delivery.deliver(client, await latest(), { send: async () => { calls++; return { message_id: 777 }; } }); assert.equal(calls, 1);
    for(const sql of ['SELECT password_hash FROM accounts.users', 'SELECT * FROM accounts.sessions']) await assert.rejects(client.query(sql), error => error.code === '42501');
  } finally { await client.query('RESET ROLE'); client.release(); }
});

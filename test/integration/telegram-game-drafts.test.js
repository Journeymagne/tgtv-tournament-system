const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
process.env.DATABASE_URL = require('../helpers/db').TEST_DATABASE_URL;
// Match the dedicated worker's public account projection before rows.js loads.
process.env.SERVICE_NAME = 'tournaments';
const { migrate } = require('../../src/db/migrate');
const users = require('../../src/db/repositories/users');
const games = require('../../src/db/repositories/games');
const website = require('../../src/api/games');
const scoring = require('../../src/domain/scoring');
function optional(name) {
  const filename = path.resolve(__dirname, '../../src/' + name + '.js');
  return fs.existsSync(filename) ? require(filename) : {};
}
const drafts = optional('telegram/game-drafts');
const menu = optional('telegram/game-menu-data');
const shared = optional('api/game-results');
process.env.TELEGRAM_ADMIN_ONLY = 'false';
let pool, alpha, bravo, stranger, link, game;
test.before(async () => {
  pool = new Pool(require('../helpers/schema').poolOptions);
  await require('../helpers/schema').resetSchemas(pool);
  await migrate(pool);
});
test.after(async () => { await pool?.end(); await require('../../src/db/pool').closePool(); });
test.beforeEach(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  const create = (name, isAdmin = false) => users.insert(pool, { name, passwordHash: 's:h', rating: 1000, isAdmin });
  alpha = await create('DraftAlpha'); bravo = await create('DraftBravo'); stranger = await create('DraftStranger', true);
  link = (await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,850001,850001) RETURNING *', [alpha.id])).rows[0];
  game = await games.insert(pool, { playerIds: [alpha.id, bravo.id] });
});
async function tx(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function available(api, name) { assert.equal(typeof api[name], 'function', `${name} implements the approved shared game contract`); }
async function start(mode = 'submit', user = alpha, ownLink = link) {
  available(drafts, 'startDraft');
  return tx(client => drafts.startDraft(client, { user, link: ownLink, gameId: game.id, mode }));
}
async function move(view, event, user = alpha, ownLink = link) {
  return tx(client => drafts.transitionDraft(client, { user, link: ownLink, token: view.token, version: view.version, event }));
}
async function filled(user = alpha, ownLink = link) {
  let view = await start('submit', user, ownLink);
  for (const value of [6, 4, 5, 'crit', 2, 3, 1, 'kill']) {
    assert.equal(view.screen, 'choice');
    const index = view.choices.findIndex(choice => choice.value === value);
    assert.ok(index >= 0, `offers ${value} for ${view.step?.field}`);
    view = await move(view, { type: 'choose', index }, user, ownLink);
  }
  assert.equal(view.screen, 'summary');
  return view;
}
const scoreBody = () => ({ scores: { [alpha.id]: { crit: 6, kill: 4, tac: 5, primary: 'crit' },
  [bravo.id]: { crit: 2, kill: 3, tac: 1, primary: 'kill' } } });

async function captainGame() {
  const event = (await pool.query("INSERT INTO tournaments(slug,name,status,format,participant_mode,team_size,pairing_type) VALUES('draft-captain','Captain event','in_progress','swiss','team',3,'shield_sword') RETURNING id")).rows[0];
  const round = (await pool.query("INSERT INTO tournament_rounds(tournament_id,round_number,status) VALUES($1,1,'active') RETURNING id", [event.id])).rows[0];
  const sides = [];
  for (const [index, captain] of [alpha, stranger].entries()) {
    const team = (await pool.query('INSERT INTO player_teams(slug,name,name_key,leader_user_id) VALUES($1,$1,$1,$2) RETURNING id', ['draft-team-' + index, captain.id])).rows[0];
    const roster = (await pool.query("INSERT INTO tournament_team_rosters(tournament_id,team_id,name,name_key,captain_user_id,team_name_snapshot,status) VALUES($1,$2,$3,$3,$4,$3,'active') RETURNING id", [event.id, team.id, 'Roster ' + index, captain.id])).rows[0];
    const member = (await pool.query("INSERT INTO tournament_team_roster_members(tournament_id,roster_id,slot,display_name_snapshot,faction_snapshot) VALUES($1,$2,1,$3,'Kasrkin') RETURNING id", [event.id, roster.id, 'Proxy ' + index])).rows[0];
    sides.push({ roster, member });
  }
  const match = (await pool.query("INSERT INTO tournament_team_matches(tournament_id,round_id,round_number,bracket_position,roster_a_id,roster_b_id,phase) VALUES($1,$2,1,1,$3,$4,'in_progress') RETURNING id", [event.id, round.id, sides[0].roster.id, sides[1].roster.id])).rows[0];
  const proxyGame = await games.insert(pool, { playerIds: [], sourceType: 'team_match_game', sourceId: match.id, sourceSlot: 1,
    participants: sides.map((side, index) => ({ userId: null, resultKey: -side.member.id, isProxy: true, displayNameSnapshot: 'Proxy ' + index, factionSnapshot: 'Kasrkin' })) });
  await pool.query("INSERT INTO tournament_team_match_games(team_match_id,game_id,slot,roster_a_member_id,roster_b_member_id,mission) VALUES($1,$2,1,$3,$4,'{}')", [match.id, proxyGame.id, sides[0].member.id, sides[1].member.id]);
  return proxyGame;
}

async function soloGame(format = 'swiss') {
  const tournament = (await pool.query("INSERT INTO tournaments(slug,name,status,format,swiss_round_count,single_elimination_size) VALUES('draft-solo','Solo event','in_progress',$1,3,$2) RETURNING id", [format, format === 'single_elimination' ? 8 : null])).rows[0];
  const participants = [];
  for (const actor of [alpha, bravo]) {
    participants.push((await pool.query("INSERT INTO tournament_participants(tournament_id,user_id,display_name,display_name_key,faction,status,source) VALUES($1,$2,$3,$4,'Kasrkin','active','admin_manual') RETURNING id", [tournament.id, actor.id, actor.name, actor.name.toLowerCase()])).rows[0]);
  }
  const round = (await pool.query("INSERT INTO tournament_rounds(tournament_id,round_number,status) VALUES($1,1,'active') RETURNING id", [tournament.id])).rows[0];
  const match = (await pool.query("INSERT INTO tournament_matches(tournament_id,round_id,round_number,bracket_position,status,participant_a_id,participant_b_id) VALUES($1,$2,1,1,'active',$3,$4) RETURNING id", [tournament.id, round.id, participants[0].id, participants[1].id])).rows[0];
  const record = await games.insert(pool, { playerIds: [alpha.id, bravo.id], sourceType: 'tournament_match', sourceId: match.id,
    participants: [alpha, bravo].map((actor, index) => ({ userId: actor.id, resultKey: actor.id, tournamentParticipantId: participants[index].id, displayNameSnapshot: actor.name, factionSnapshot: 'Kasrkin' })) });
  await pool.query('UPDATE tournament_matches SET game_id=$2 WHERE id=$1', [match.id, record.id]);
  return record;
}

test('captain-only proxy games appear on every eligible menu page without widening other users', async () => {
  available(menu, 'listGames');
  const proxy = await captainGame();
  assert.ok((await menu.listGames(pool, alpha.id, { filter: 'active' })).games.some(row => row.id === proxy.id));
  assert.ok((await menu.listGames(pool, stranger.id, { filter: 'active' })).games.some(row => row.id === proxy.id));
  assert.ok(!(await menu.listGames(pool, bravo.id, { filter: 'all' })).games.some(row => row.id === proxy.id));
  await pool.query('UPDATE tournament_team_rosters SET captain_user_id=NULL WHERE captain_user_id=$1', [alpha.id]);
  assert.ok(!(await menu.listGames(pool, alpha.id, { filter: 'all' })).games.some(row => row.id === proxy.id));
});

test('six-row keyset paging stays authorized and bounded across hundreds of historical games', async () => {
  available(menu, 'listGames');
  const ids = [];
  for (let index = 0; index < 205; index++) {
    const row = await games.insert(pool, { playerIds: [alpha.id, bravo.id] }); ids.push(row.id);
    await pool.query('UPDATE games SET status=$2 WHERE id=$1', [row.id, index % 2 ? 'completed' : 'cancelled']);
  }
  await games.insert(pool, { playerIds: [bravo.id, stranger.id] });
  let queries = 0, returned = 0;
  const bounded = { query: async (...args) => { queries++; const result = await pool.query(...args); returned += result.rows.length; return result; } };
  const first = await menu.listGames(bounded, alpha.id, { filter: 'all' });
  assert.equal(first.games.length, 6);
  assert.deepEqual(first.games.map(row => row.id), ids.slice(-6).reverse());
  assert.equal(first.previousCursor, null); assert.ok(first.nextCursor);
  assert.ok(queries <= 3, `bounded queries: ${queries}`); assert.ok(returned <= 21, `bounded returned rows: ${returned}`);
  assert.ok(first.games.every(row => !('avatarUrl' in row) && !('elo' in row) && !('pendingResult' in row)));
  const second = await menu.listGames(pool, alpha.id, { filter: 'all', cursor: first.nextCursor, direction: 'next' });
  assert.deepEqual(second.games.map(row => row.id), ids.slice(-12, -6).reverse());
  const previous = await menu.listGames(pool, alpha.id, { filter: 'all', cursor: second.previousCursor, direction: 'previous' });
  assert.deepEqual(previous.games.map(row => row.id), first.games.map(row => row.id));
  assert.deepEqual((await menu.listGames(pool, alpha.id, { filter: 'active' })).games.map(row => row.id), [game.id]);
  const administrator = await menu.listGames(pool, stranger.id, { filter: 'all' });
  assert.equal(administrator.games.length, 1, 'administrator role does not widen personal menu');
});

test('draft choices do not mutate the game until explicit submit and preserve a fixed thirty-minute expiry', async () => {
  const before = await games.findById(pool, game.id);
  const began = Date.now();
  const view = await filled();
  assert.ok(Date.parse(view.expiresAt) >= began + 1790000 && Date.parse(view.expiresAt) <= Date.now() + 1800000);
  assert.deepEqual(await games.findById(pool, game.id), before);
  const reopened = await tx(client => drafts.readDraft(client, { user: alpha, link, token: view.token }));
  assert.equal(reopened.expiresAt, view.expiresAt);
  const saved = await move(view, { type: 'submit' });
  assert.equal(saved.screen, 'saved'); assert.equal(saved.game.status, 'pending_confirmation');
  const actual = await games.findById(pool, game.id);
  assert.equal(actual.status, 'pending_confirmation');
  assert.deepEqual(actual.pendingResult.result, scoring.calculateSubmittedResult(scoreBody(), alpha.id, bravo.id));
});

test('stale versions, old tokens, malformed events and foreign private chats cannot advance a draft', async () => {
  const original = await start();
  const next = await move(original, { type: 'choose', index: 6 });
  await assert.rejects(() => move(original, { type: 'choose', index: 0 }), error => error.status === 409);
  for (const event of [{ type: 'choose', index: -1 }, { type: 'choose', index: '1' }, { type: 'edit', index: 99 }, { type: 'submit' }]) {
    await assert.rejects(() => move(next, event), error => [400, 409].includes(error.status));
  }
  await assert.rejects(() => move(next, { type: 'back' }, stranger), error => [403, 404].includes(error.status));
  await assert.rejects(() => move(next, { type: 'back' }, alpha, { ...link, chat_id: '850002' }), error => [403, 404].includes(error.status));
  const replacement = await start(); assert.notEqual(replacement.token, original.token);
  await assert.rejects(() => move(next, { type: 'choose', index: 1 }), error => [404, 409].includes(error.status));
});

test('expired, suspended and relinked identities cannot read or submit old draft state', async () => {
  const view = await filled();
  await pool.query("UPDATE telegram_game_drafts SET expires_at=NOW()-INTERVAL '1 second' WHERE token=$1", [view.token]);
  await assert.rejects(() => move(view, { type: 'submit' }), error => [404, 409, 410].includes(error.status));
  const fresh = await filled();
  await pool.query("UPDATE users SET suspended_until=NOW()+INTERVAL '1 day' WHERE id=$1", [alpha.id]);
  await assert.rejects(() => move(fresh, { type: 'submit' }), error => error.status === 403);
  await pool.query('UPDATE users SET suspended_until=NULL WHERE id=$1', [alpha.id]);
  await pool.query('DELETE FROM telegram_links WHERE id=$1', [link.id]);
  const replacement = (await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,850001,850001) RETURNING *', [alpha.id])).rows[0];
  await assert.rejects(() => move(fresh, { type: 'submit' }, alpha, replacement), error => [403, 404, 409].includes(error.status));
  assert.equal((await games.findById(pool, game.id)).status, 'open');
});

test('a website result or participant snapshot change invalidates final draft submission without overwriting it', async () => {
  let view = await filled();
  await tx(client => website.submitResult({ client, user: bravo, params: { id: String(game.id) }, body: scoreBody() }));
  const websiteState = await games.findById(pool, game.id);
  await assert.rejects(() => move(view, { type: 'submit' }), error => error.status === 409);
  assert.deepEqual(await games.findById(pool, game.id), websiteState);
  await pool.query("UPDATE games SET status='open',pending_result=NULL WHERE id=$1", [game.id]);
  view = await filled();
  await pool.query("UPDATE game_participants SET faction_snapshot='Kasrkin' WHERE game_id=$1 AND slot=1", [game.id]);
  await assert.rejects(() => move(view, { type: 'submit' }), error => error.status === 409);
  assert.equal((await games.findById(pool, game.id)).status, 'open');
});

test('duplicate final clicks replay an atomic saved receipt and website confirmation applies identical Elo once', async () => {
  const view = await filled();
  const [first, duplicate] = await Promise.all([move(view, { type: 'submit' }), move(view, { type: 'submit' })]);
  assert.equal(first.screen, 'saved'); assert.equal(duplicate.screen, 'saved');
  assert.deepEqual(first.summary, duplicate.summary);
  const otherLink = (await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,850002,850002) RETURNING *', [bravo.id])).rows[0];
  const review = await start('confirm', bravo, otherLink);
  assert.equal(review.screen, 'review');
  const saved = await move(review, { type: 'submit' }, bravo, otherLink);
  assert.equal(saved.game.status, 'completed');
  assert.equal((await users.findById(pool, alpha.id)).rating, 1016);
  assert.equal((await users.findById(pool, bravo.id)).rating, 984);
  const replay = await move(review, { type: 'submit' }, bravo, otherLink);
  assert.equal(replay.screen, 'saved'); assert.equal(replay.game.status, 'completed');
  assert.equal((await users.findById(pool, alpha.id)).rating, 1016);
  available(shared, 'gameDetail');
  const websiteView = await shared.gameDetail({ client: pool, user: bravo, params: { id: String(game.id) } });
  assert.deepEqual(saved.game.result, websiteView.game.result);
});

test('a simultaneous committed website write wins over an older draft waiting on the shared rating lock', { timeout: 10000 }, async () => {
  const view = await filled();
  const writer = await pool.connect();
  let pending;
  try {
    await writer.query('BEGIN');
    await require('../../src/db/rating-write-lock').acquireRatingWriteLock(writer);
    await website.submitResult({ client: writer, user: bravo, params: { id: String(game.id) }, body: scoreBody() });
    let notify;
    const enteredRatingLock = new Promise(resolve => { notify = resolve; });
    pending = tx(async client => {
      const tracked = { query: (...args) => {
        if (/pg_advisory_xact_lock/.test(String(args[0]))) notify();
        return client.query(...args);
      } };
      return drafts.transitionDraft(tracked, { user: alpha, link, token: view.token, version: view.version, event: { type: 'submit' } });
    });
    const rejected = assert.rejects(pending, error => error.status === 409);
    await enteredRatingLock;
    await writer.query('COMMIT');
    await rejected;
    assert.equal((await games.findById(pool, game.id)).pendingResult.submittedBy, bravo.id);
  } finally {
    await writer.query('ROLLBACK'); writer.release();
    if (pending) await pending.catch(() => {});
  }
});

test('final submit declares rating lock acquisition before business row locks for direct and bot callers', async () => {
  available(drafts, 'requiresRatingLock');
  assert.equal(drafts.requiresRatingLock({ type: 'start' }, 'submit'), true, 'start FK lock also precedes generic bot user locks');
  assert.equal(drafts.requiresRatingLock({ type: 'submit' }, 'submit'), true);
  assert.equal(drafts.requiresRatingLock({ type: 'submit' }, 'confirm'), true);
  assert.equal(drafts.requiresRatingLock({ type: 'submit' }, 'reject'), true);
  assert.equal(drafts.requiresRatingLock({ type: 'choose', index: 0 }, 'submit'), false);
  const view = await filled();
  const queries = [];
  await tx(async client => {
    const tracked = { query: (...args) => { queries.push(String(args[0]?.text || args[0])); return client.query(...args); } };
    await drafts.transitionDraft(tracked, { user: alpha, link, token: view.token, version: view.version, event: { type: 'submit' } });
  });
  const rating = queries.findIndex(sql => /pg_advisory_xact_lock/.test(sql));
  const business = queries.findIndex(sql => /FOR\s+(?:NO\s+KEY\s+)?UPDATE|FOR\s+SHARE/i.test(sql));
  assert.ok(rating >= 0, 'shared rating advisory lock is acquired');
  assert.ok(business < 0 || rating < business, 'rating advisory lock precedes every business row lock');
});

test('ordinary numeric taps have bounded narrow reads and never hydrate website game details', async () => {
  const initial = await start();
  const queries = [];
  await tx(async client => {
    const tracked = { query: (...args) => { queries.push(String(args[0]?.text || args[0])); return client.query(...args); } };
    const next = await drafts.transitionDraft(tracked, { user: alpha, link, token: initial.token, version: initial.version, event: { type: 'choose', index: 6 } });
    assert.equal(next.step.field, 'kill');
  });
  assert.ok(queries.length <= 7, `tap has at most seven SQL statements including savepoint: ${queries.length}`);
  assert.ok(!queries.some(sql => /avatar|logo_data|description|tournament_match_results|password_hash|sessions/i.test(sql)), 'tap reads no heavy game detail or credentials');
  assert.ok(!queries.some(sql => /FROM games[^]*FOR (?:UPDATE|SHARE)/i.test(sql)), 'tap does not take business game row locks');
});

test('savepoint rolls back an already-written business result while permitting a durable localized reply', async () => {
  const view = await filled();
  await tx(async client => {
    const injected = { query: (...args) => {
      const sql = String(args[0]?.text || args[0]);
      if (/^UPDATE telegram_game_drafts SET state/.test(sql)) throw new (require('../../src/http/io').HttpError)(409, 'Injected receipt conflict');
      return client.query(...args);
    } };
    await assert.rejects(() => drafts.transitionDraft(injected, { user: alpha, link, token: view.token, version: view.version, event: { type: 'submit' } }), error => error.status === 409);
    assert.equal((await games.findById(client, game.id)).status, 'open', 'pending result was rolled back');
    await client.query("INSERT INTO telegram_outbox(link_id,chat_id,payload,dedup_key) VALUES($1,$2,'{\"text\":\"Refresh this game\"}','draft-conflict-reply')", [link.id, link.chat_id]);
  });
  assert.equal((await games.findById(pool, game.id)).status, 'open');
  const read = await tx(client => drafts.readDraft(client, { user: alpha, link, token: view.token }));
  assert.equal(read.version, view.version); assert.equal(read.screen, 'summary');
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM telegram_outbox WHERE dedup_key='draft-conflict-reply'")).rows[0].n, 1);
});

test('captain draft uses proxy result keys and current opposing-captain review policy', async () => {
  game = await captainGame();
  const view = await filled();
  const saved = await move(view, { type: 'submit' });
  const keys = saved.game.players.map(player => String(player.id));
  assert.ok(keys.every(id => Number(id) < 0));
  assert.deepEqual(Object.keys(saved.summary.result.scores).sort(), keys.sort());
  const otherLink = (await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,850002,850002) RETURNING *', [stranger.id])).rows[0];
  const review = await start('reject', stranger, otherLink);
  assert.equal(review.screen, 'review');
  const rejected = await move(review, { type: 'submit' }, stranger, otherLink);
  assert.equal(rejected.game.status, 'open'); assert.equal(rejected.summary.outcome, 'rejected');
});

test('mission edits, captain replacement, tournament closure and game deletion revoke unsaved drafts', async () => {
  game = await captainGame();
  let view = await filled();
  await pool.query('UPDATE tournament_team_match_games SET mission=$2 WHERE game_id=$1', [game.id, { killzone: 'Gallowdark', critOp: 'Secure', layout: 1 }]);
  await assert.rejects(() => move(view, { type: 'submit' }), error => error.status === 409);
  view = await filled();
  await pool.query("UPDATE tournaments SET status='completed' WHERE id=(SELECT tournament_id FROM tournament_team_match_games WHERE game_id=$1)", [game.id]);
  await assert.rejects(() => move(view, { type: 'submit' }), error => error.status === 409);
  await pool.query("UPDATE tournaments SET status='in_progress' WHERE id=(SELECT tournament_id FROM tournament_team_match_games WHERE game_id=$1)", [game.id]);
  view = await filled();
  await pool.query('UPDATE tournament_team_rosters SET captain_user_id=NULL WHERE captain_user_id=$1', [alpha.id]);
  await assert.rejects(() => move(view, { type: 'submit' }), error => error.status === 403);
  await pool.query('DELETE FROM games WHERE id=$1', [game.id]);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_game_drafts WHERE token=$1', [view.token])).rows[0].n, 0);
});

test('Swiss draft submits through canonical website rules and completes without an extra confirmation step', async () => {
  game = await soloGame();
  const view = await filled();
  assert.equal(view.game.confirmationRequired, false);
  const saved = await move(view, { type: 'submit' });
  assert.equal(saved.screen, 'saved'); assert.equal(saved.game.status, 'completed');
  const current = await shared.gameDetail({ client: pool, user: alpha, params: { id: String(game.id) } });
  assert.deepEqual(saved.game.result, current.game.result);
  assert.equal(saved.summary.outcome, 'completed');
});

test('single-elimination draft requires the APL/roll-off branch before it can submit an exact tie', async () => {
  game = await soloGame('single_elimination');
  let view = await start();
  for (const value of [0, 0, 0, 'crit', 0, 0, 0, 'crit']) {
    view = await move(view, { type: 'choose', index: view.choices.findIndex(choice => choice.value === value) });
  }
  assert.equal(view.step.field, 'aplTens');
  await assert.rejects(() => move(view, { type: 'submit' }), error => error.status === 409);
  for (const value of [0, 1, 0, 0]) view = await move(view, { type: 'choose', index: view.choices.findIndex(choice => choice.value === value) });
  assert.equal(view.screen, 'summary'); assert.equal(view.summary.result.tiebreakers.decidedBy, 'apl');
  assert.equal(view.summary.result.winnerId, alpha.id);
  assert.equal((await games.findById(pool, game.id)).status, 'open', 'a ready review still has no business effect');
});

test('actual restricted tournaments role creates and submits drafts without password or session access', async () => {
  available(drafts, 'startDraft');
  for (const schema of require('../../src/db/schemas').SCHEMAS) process.env[schema.toUpperCase() + '_DB_PASSWORD'] = 'isolated-draft-role-test-password-' + schema;
  await require('../../scripts/provision-service-roles').provision();
  await tx(async client => {
    await client.query('SET LOCAL ROLE kt_tournaments');
    let view = await drafts.startDraft(client, { user: alpha, link, gameId: game.id, mode: 'submit' });
    for (const value of [6, 4, 5, 'crit', 2, 3, 1, 'kill']) {
      view = await drafts.transitionDraft(client, { user: alpha, link, token: view.token, version: view.version,
        event: { type: 'choose', index: view.choices.findIndex(choice => choice.value === value) } });
    }
    view = await drafts.transitionDraft(client, { user: alpha, link, token: view.token, version: view.version, event: { type: 'submit' } });
    assert.equal(view.screen, 'saved');
    assert.equal(view.game.status, 'pending_confirmation');
  });
  for (const sql of ['SELECT password_hash FROM accounts.users', 'SELECT * FROM accounts.sessions']) {
    await assert.rejects(() => tx(async client => { await client.query('SET LOCAL ROLE kt_tournaments'); await client.query(sql); }), error => error.code === '42501');
  }
});

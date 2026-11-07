const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { TGTV_ENV_LOADED: '1', TELEGRAM_MODE: 'polling', TELEGRAM_ADMIN_ONLY: 'true',
  TELEGRAM_BOT_USERNAME: 'PreviewTestBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32),
  SITE_URL: 'https://example.com', TELEGRAM_MINI_APP_URL: 'https://example.com/miniapp', TELEGRAM_TUNNEL_PORT: '' });
const { notification, CATEGORY } = require('../../src/telegram/messages');
const injected = '<b>Injected</b>&<a href="https://evil.example">link</a>';
function item(type) {
  return { type, href: '/tournament#/mygames', actor: { name: injected }, team: { name: injected },
    title: injected, tournament: { name: injected }, opponent: { name: injected }, opponentFaction: injected,
    ownTeam: { name: injected }, opponentTeam: { name: injected }, roundNumber: 2,
    table: { number: 4, killzone: injected }, mission: { critOp: injected } };
}
for (const locale of ['ru', 'en']) test(`all notification kinds escape user text in ${locale} HTML`, () => {
  for (const type of Object.keys(CATEGORY)) {
    const payload = notification(item(type), locale);
    assert.equal(payload.parse_mode, 'HTML');
    assert.ok(payload.text.startsWith('🔶 <b>KT COMPANION</b>\n<b>'));
    assert.ok(payload.text.includes('&lt;b&gt;Injected&lt;/b&gt;&amp;&lt;a href='), type);
    assert.ok(!payload.text.includes('<b>Injected</b>'), type);
    assert.ok(!payload.text.includes('<a href='), type);
    assert.deepEqual([...payload.text.matchAll(/<\/?([a-z]+)[^>]*>/g)].map(m => m[1]).filter(tag => tag !== 'b'), []);
    assert.equal(payload.reply_markup.inline_keyboard.length, 1);
    assert.equal(payload.reply_markup.inline_keyboard[0].length, 1);
    assert.ok(payload.text.length < 4096);
    if (locale === 'en') assert.doesNotMatch(payload.text, /[А-Яа-яЁё]/);
  }
});
test('action buttons keep canonical game and website-only destinations', () => {
  for (const type of ['tournament_pairing', 'team_tournament_pairing', 'result_pending']) {
    const payload = notification({ ...item(type), gameId: 123, href: '#/games/tournament-match/999' }, 'ru');
    const button = payload.reply_markup.inline_keyboard[0][0];
    assert.equal(new URL(button.web_app.url).searchParams.get('game'), '123');
  }
  for (const [type, href] of [['game_challenge', '#/mygames/challenge/17'], ['team_invitation', '#/teams/invitation/18'], ['team_pairing', '#/team-matches/19']]) {
    const button = notification({ ...item(type), href }, 'en').reply_markup.inline_keyboard[0][0];
    assert.equal(button.url, 'https://example.com/tournament' + href);
    assert.equal(button.web_app, undefined);
  }
});
test('missing optional metadata stays readable and long metadata remains within Telegram limits', () => {
  const minimal = notification({ type: 'tournament_pairing', href: '/tournament#/mygames' }, 'en');
  assert.doesNotMatch(minimal.text, /undefined|null|\n{3}/);
  const long = '<'.repeat(10000);
  const payload = notification({ ...item('team_tournament_pairing'), opponent: {name:long}, opponentFaction:long,
    tournament:{name:long}, ownTeam:{name:long}, opponentTeam:{name:long}, table:{number:4,killzone:long}, mission:long }, 'en');
  // Limit concerns decoded Telegram text; this stronger bound includes HTML entities.
  assert.ok(payload.text.length < 4096);
});

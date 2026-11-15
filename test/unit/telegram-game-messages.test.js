const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
Object.assign(process.env, { TGTV_ENV_LOADED: '1', TELEGRAM_MODE: 'polling', TELEGRAM_BOT_USERNAME: 'ExampleBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32), SITE_URL: 'https://example.com', TELEGRAM_MINI_APP_URL: '' });
const filename = path.resolve(__dirname, '../../src/telegram/game-messages.js');
const messages = fs.existsSync(filename) ? require(filename) : {};
const engine = require('../../src/telegram/game-draft-steps');
const game = { id: 42, status: 'open', sourceType: 'challenge', playerIds: [1, 2],
  players: [{ id: 1, name: '<Alpha & Co>' }, { id: 2, name: 'Bravo' }],
  resultPermissions: { canSubmit: true, canReview: false }, confirmationRequired: true };
function ready(name) { assert.equal(typeof messages[name], 'function', `${name} renders native game buttons`); }
function buttons(payload) { return payload.reply_markup.inline_keyboard.flat(); }
function valid(payload) {
  assert.ok(payload.text.length <= 4096); assert.equal(payload.parse_mode, 'HTML');
  for (const button of buttons(payload)) if (button.callback_data) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  assert.ok(!payload.text.includes('<Alpha & Co>')); assert.ok(payload.text.includes('&lt;Alpha &amp; Co&gt;'));
}
test('menu renders six compact native game entries with Active All and keyset navigation', () => {
  ready('renderMenu');
  const page = { games: Array.from({ length: 6 }, (_, i) => ({ ...game, id: 42 + i })), filter: 'all', previousCursor: 48, nextCursor: 42 };
  const payload = messages.renderMenu(page, 'en'); valid(payload);
  assert.equal(buttons(payload).filter(b => /^g:v:/.test(b.callback_data)).length, 6);
  assert.ok(buttons(payload).some(b => b.callback_data === 'g:l:active:next:0'));
  assert.ok(buttons(payload).some(b => b.callback_data === 'g:l:all:previous:48'));
});
test('card exposes only current permitted actions and retains Companion fallback', () => {
  ready('renderGame');
  const payload = messages.renderGame(game, 'en'); valid(payload);
  assert.ok(buttons(payload).some(b => b.callback_data === 'g:s:42:submit'));
  assert.ok(!buttons(payload).some(b => /:confirm$/.test(b.callback_data || '')));
  assert.ok(buttons(payload).some(b => b.url));
  const review = messages.renderGame({ ...game, status: 'pending_confirmation', resultPermissions: { canSubmit: false, canReview: true } }, 'ru');
  assert.ok(buttons(review).some(b => b.callback_data === 'g:s:42:confirm'));
  assert.ok(buttons(review).some(b => b.callback_data === 'g:s:42:reject'));
});
test('renderer walks every score primary and summary using the real pure engine', () => {
  ready('renderDraft'); let state = engine.createState(game); let version = 0;
  for (const value of [6, 4, 5, 'crit', 2, 3, 1, 'kill']) {
    const view = { ...engine.view(game, state), game, token: 'abcdefghijklmnop', version };
    const payload = messages.renderDraft(view, 'en'); valid(payload);
    const index = view.choices.findIndex(choice => choice.value === value);
    assert.ok(buttons(payload).some(b => b.callback_data === `g:d:abcdefghijklmnop:${version}:choose:${index}`));
    assert.ok(!buttons(payload).some(b => /:submit$/.test(b.callback_data || '')));
    state = engine.transition(game, state, { type: 'choose', index }); version++;
  }
  const view = { ...engine.view(game, state), game, token: 'abcdefghijklmnop', version };
  const summary = messages.renderDraft(view, 'ru'); valid(summary);
  assert.ok(buttons(summary).some(b => b.callback_data === `g:d:abcdefghijklmnop:${version}:submit`));
  assert.ok(buttons(summary).some(b => /:extras$/.test(b.callback_data || '')));
  assert.ok(summary.text.includes('6') && summary.text.includes('4'));
});
test('large optional dictionaries page within one version without losing absolute choice indices', () => {
  ready('renderDraft'); const state = engine.createState(game);
  const base = { ...engine.view(game, state), game, token: 'abcdefghijklmnop', version: 17,
    choices: Array.from({ length: 100 }, (_, value) => ({ value: `Faction ${value}`, labelKey: null })) };
  const first = messages.renderDraft(base, 'en');
  const next = messages.renderDraft({ ...base, choicePage: 1 }, 'en');
  assert.ok(buttons(first).length < 30); assert.ok(buttons(next).some(b => /:choose:12$/.test(b.callback_data || '')));
  assert.ok(buttons(first).some(b => b.callback_data === 'g:p:abcdefghijklmnop:17:1'));
});

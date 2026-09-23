const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../public/studio/model');
const Text = require('../../public/studio/rich-text');
const Cards = require('../../public/studio/card-renderer');
const Roster = require('../../public/studio/new-recruit');
const TTS = require('../../public/studio/tts-export');
const { buildTeamPDF } = require('../../public/studio/pdf-template');
const Store = require('../../src/db/repositories/studio');
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function project() {
 const data = Model.newProject('card-options', 'CARD OPTIONS');
 data.team.logo = LOGO;
 data.operatives.push({ ...Model.blank('operative', 'operative'), name: 'ASSASSIN',
  stats: { APL: 3, MOVE: '6″', SAVE: '5+', WOUNDS: 8 }, keywords: ['ASSASSIN'], loadouts: [],
  weapons: [{ id: 'knife', name: 'Knife', kind: 'melee', attacks: 4, hit: '3+', damage: '3/4', special: 'Balanced', critical: 'Lethal 5+' }],
  actions: [{ id: 'trained', name: 'TRAINED ASSASSIN', cost: '1AP', body: '▶ Change this operative’s order.\n\n◆ This operative cannot perform this action while within control range of an enemy operative.' }] });
 return data;
}

test('legacy recruitment and weapon fields migrate without losing content or duplicating critical rules', () => {
 const data = project();
 data.teamCards.push({ ...Model.blank('recruitment', 'recruitment'), name: 'SELECTION', body: 'Existing recruitment rule', image: LOGO });
 const migrated = Model.validate(Model.migrate(data));
 assert.equal(migrated.teamCards[0].kind, 'faction');
 assert.equal(migrated.teamCards[0].body, data.teamCards[0].body);
 assert.equal(migrated.teamCards[0].image, LOGO);
 assert.equal(migrated.operatives[0].weapons[0].rules, 'Balanced; CR: Lethal 5+');
 assert.equal(migrated.operatives[0].weapons[0].critical, undefined);
 assert.deepEqual(Model.migrate(migrated), migrated);
 migrated.operatives[0].weapons[0].rules = '';
 assert.equal(Model.migrate(migrated).operatives[0].weapons[0].rules, '');
 assert.equal(data.teamCards[0].kind, 'recruitment', 'migration leaves its input intact');
});

test('action markers wrap with a hanging indent, retain fixed colours and survive distance conversion', () => {
 const source = '▶ Change the order and perform this action.\n\n◆ Cannot act within control range.';
 assert.equal(Model.toInches(source), source);
 assert.equal(Model.toInches('▲'), '1″', 'legacy distance conversion stays supported');
 const lines = Text.layout(source, 85, 10), svg = lines.map((line, i) => Text.svg(line, 0, 12 + 14 * i)).join('');
 assert(lines.every(line => line.width <= 85));
 assert(lines.some(line => line.indent > 0));
 assert.equal(lines.find(line => line.text.startsWith('◆')).indent, 0);
 assert.equal((svg.match(/class="text-triangle"/g) || []).length, 1);
 assert.equal((svg.match(/class="text-diamond"/g) || []).length, 1);
 assert(svg.includes('fill="#269b48"'));assert(svg.includes('fill="#c52b26"'));
 assert.equal(Text.plain(source), source);
});

test('long formatted weapon rules paginate without clipping and survive every export', () => {
 const data = Model.migrate(project());
 const rules = Array.from({ length: 35 }, (_, i) => 'RULE' + String(i).padStart(3, '0'));
 data.operatives[0].weapons[0].rules = '[color=orange]**[size=12]' + rules.join('\n') + '[/size]**[/color]';
 const rendered = Cards.renderCard(data.operatives[0], data);
 assert(rendered.length > 1 && rendered.length < 20);
 const svg = rendered.map(card => card.svg).join('');
 for (const rule of rules) assert.equal(svg.split(rule).length - 1, 1, rule);
 assert(svg.includes('fill="#f4511e"'));assert(svg.includes('font-size="12"'));
 for (const card of rendered) for (const box of card.boxes) {
  assert(box.x >= 0 && box.x + box.w <= card.width);
  assert(box.y >= 0 && box.y + box.h < card.height - 22);
 }
 const pdf = buildTeamPDF(data, {}, { section: 'operatives', index: 0 });
 assert.deepEqual(pdf.content.filter(item => item.svg).map(item => item.svg), rendered.map(card => card.svg));
 const tts = JSON.stringify(TTS.plan(data, {}));
 assert(tts.includes('RULE034'));assert(tts.includes('text-triangle'));
 const ros = Roster.build(data).xml;
 for (const rule of rules) assert(ros.includes(rule));
 assert(!ros.includes('[color=orange]'));assert(!ros.includes('[size=12]'));
});

test('card headers omit logos while watermarks, operative footers and deck backs retain them', () => {
 const data = project();
 data.teamCards.push({ ...Model.blank('faction', 'faction'), name: 'Coordinate', body: 'When: Select Operatives.', abilities: [{ id: 'extra', name: 'Extra CP', body: 'Gain 1 CP.' }] });
 assert(!Cards.renderCard(data.selectionCards[0], data)[0].svg.includes('class="team-logo"'));
 for (const card of [data.teamCards[0], data.operatives[0], data.strategicPloys[0], data.firefightPloys[0], data.equipment[0]]) {
  const svg = Cards.renderCard(card, data)[0].svg;
  assert(svg.includes('class="team-logo"'));assert(svg.includes(LOGO));
  for (const image of svg.matchAll(/<image class="team-logo"[^>]*\by="([^"]+)"[^>]*\bopacity="1"/g)) assert(Number(image[1]) >= 46, 'logo must stay outside the card header');
 }
 assert(TTS.plan(data).decks[0].cards[0].back.includes(LOGO));
 for (const logo of ['https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', LOGO.repeat(1000)]) {
  data.team.logo = logo;
  assert.throws(() => Model.validate(data), /логотип/);
  assert(!Cards.renderCard(data.operatives[0], data)[0].svg.includes('class="team-logo"'));
 }
});

test('private and published logo summaries use their respective project snapshots', async () => {
 const data = project(), published = structuredClone(data);published.team.logo = '';
 const row = { project_id: 'card-options', publication_id: 'publication', project: data, published, revision: 1, owner_id: 1, author_name: 'Author' };
 const client = { query: async sql => ({ rows: sql.includes('count(*)') ? [{ total: 1 }] : [{ ...row, team: sql.includes("published->'team'") ? published.team : data.team }] }) };
 assert.equal((await Store.draft(client, 1, 'card-options')).logo, LOGO);
 assert.equal((await Store.drafts(client, 1))[0].logo, LOGO);
 assert.equal((await Store.publication(client, 'publication')).logo, '');
 assert.equal((await Store.library(client, '', 0)).teams[0].logo, '');
});

test('optional base sizes survive project migration and JSON while old projects stay valid', () => {
 const data = Model.validate(Model.migrate(project()));
 assert(!Cards.renderCard(data.operatives[0], data)[0].svg.includes('operative-base-size'));
 for (const value of ['25', '28.5', '60×35', '']) {
  data.operatives[0].baseSize = value;
  const restored = Model.validate(Model.migrate(JSON.parse(JSON.stringify(data))));
  assert.equal(restored.operatives[0].baseSize, value);
  assert.equal(Cards.renderCard(restored.operatives[0], restored)[0].svg.includes('operative-base-size'), !!value);
 }
 for (const value of [25, {}, '1'.repeat(17), '25\n32']) {
  data.operatives[0].baseSize = value;
  assert.throws(() => Model.validate(data), /Размер базы/);
 }
});

test('base size appears on every operative side and is retained by PDF and TTS exports', () => {
 const data = Model.validate(Model.migrate(project())), operative = data.operatives[0];
 operative.baseSize = '25';
 operative.body = 'Long rule requiring another side. '.repeat(180);
 const rendered = Cards.renderCard(operative, data);
 assert(rendered.length > 1);
 for (const card of rendered) {
  assert.equal((card.svg.match(/class="operative-base-size"/g) || []).length, 1);
  assert.match(card.svg, /class="operative-base-size"><rect[^>]+stroke="white"[^>]*\/><text[^>]+text-anchor="middle">25<\/text>/);
 }
 const pdf = buildTeamPDF(data, {}, { section: 'operatives', index: 0 });
 assert.deepEqual(pdf.content.filter(item => item.svg).map(item => item.svg), rendered.map(card => card.svg));
 const tts = TTS.plan(data, {}).decks.find(deck => deck.id === 'operatives');
 assert.equal((JSON.stringify(tts.cards).match(/operative-base-size/g) || []).length, rendered.length);
});

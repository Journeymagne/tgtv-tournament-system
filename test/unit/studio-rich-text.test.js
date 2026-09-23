const test = require('node:test');
const assert = require('node:assert/strict');
const Text = require('../../public/studio/rich-text');
const Model = require('../../public/studio/model');
const Cards = require('../../public/studio/card-renderer');
const { buildTeamPDF } = require('../../public/studio/pdf-template');
const TTS = require('../../public/studio/tts-export');
const Roster = require('../../public/studio/new-recruit');
const apply = (value, edit) => value.slice(0, edit.from) + edit.text + value.slice(edit.to);

test('orange text combines with bold, italic and size without colouring adjacent text', () => {
 const source = 'Before [color=orange]***[size=12]KEYWORD💀[/size]***[/color] after';
 const runs = Text.parse(source), keyword = runs.find(run => run.text.includes('KEYWORD'));
 assert.deepEqual([keyword.color, keyword.bold, keyword.italic, keyword.size], [Text.ORANGE, true, true, 12]);
 assert.equal(runs[0].color, undefined);assert.equal(runs.at(-1).color, undefined);
 assert.equal(Text.plain(source), 'Before KEYWORD💀 after');
});

test('colour toolbar toggles a selection and reset preserves the skull', () => {
 const source = 'Use **KEYWORD💀** here', from = source.indexOf('**'), to = source.lastIndexOf('**') + 2;
 const red = Text.format(source, from, to, 'orange'), coloured = apply(source, red);
 assert.equal(coloured, 'Use [color=orange]**KEYWORD💀**[/color] here');
 assert.equal(apply(coloured, Text.format(coloured, red.start, red.end, 'orange')), source);
 const innerStart = coloured.indexOf('KEYWORD'), innerEnd = innerStart + 'KEYWORD💀'.length;
 assert.equal(apply(coloured, Text.format(coloured, innerStart, innerEnd, 'clear')), 'Use KEYWORD💀 here');
 const reset = Text.format(coloured, 0, 0, 'clear');
 assert.equal(apply(coloured, reset), 'Use KEYWORD💀 here');
});

test('skull insertion replaces the selection and leaves the caret after the whole symbol', () => {
 const edit = Text.format('one two', 4, 7, 'skull');
 assert.equal(apply('one two', edit), 'one 💀');assert.equal(edit.start, 6);assert.equal(edit.end, 6);
 const insertion = Text.format('hello', 5, 5, 'skull');
 assert.equal(apply('hello', insertion), 'hello💀');
});

test('multiline orange formatting preserves blank lines and malformed markup stays literal', () => {
 const source = 'first\n\n second ';
 assert.equal(apply(source, Text.format(source, 0, source.length, 'orange')), '[color=orange]first[/color]\n\n [color=orange]second[/color] ');
 for (const literal of ['[color=orange]unclosed', '[color=blue]blue[/color]', '\\[color=orange]literal[/color]']) {
  assert(Text.parse(literal).every(run => !run.color));
 }
 const line = Text.layout('[color=orange]<script>alert(1)</script>[/color]', 400)[0];
 const svg = Text.svg(line, 0, 12);
 assert(svg.includes('&lt;script&gt;'));assert(!svg.includes('<script>'));
});

test('skulls retain colour and fit line wrapping as vector glyphs', () => {
 const source = '[color=orange]KEYWORD💀💀[/color] after';
 const lines = Text.layout(source, 25, 10);
 assert(lines.every(line => line.width <= 25));
 assert.equal(lines.map(line => line.text).join('').replace(/ /g, ''), 'KEYWORD💀💀after');
 const svg = lines.map((line, i) => Text.svg(line, 0, 12 + i * 14)).join('');
 assert.equal((svg.match(/class="text-skull"/g) || []).length, 2);
 assert.equal((svg.match(/<path fill="#f4511e"/g) || []).length, 2);
 assert(!svg.includes('font-family="Skull"'));
 assert.equal(Text.layout('💀', 100, 10)[0].width, 8.5);
});

test('card previews, PDF and TTS preserve orange keywords and skulls', () => {
 const project = Model.newProject('rich-keyword', 'Rich keyword');
 project.strategicPloys[0].name = 'Ploy';
 project.strategicPloys[0].body = 'Select [color=orange]**ELUCIAN STARSTRIDER💀**[/color].';
 const card = Cards.renderCard(project.strategicPloys[0], project)[0];
 assert(card.svg.includes('class="text-skull"'));assert(card.svg.includes('fill="#f4511e"'));
 const pdf = buildTeamPDF(project, {}, { section: 'strategicPloys', index: 0 });
 assert.equal(pdf.content.find(item => item.svg).svg, card.svg);
 const plan = JSON.stringify(TTS.plan(project, {}));
 assert(plan.includes('text-skull'));assert(plan.includes('#f4511e'));
});

function keywordProject(value) {
 const project = Model.newProject('keyword-formatting', 'Red Corsairs');
 project.operatives.push({ ...Model.blank('operative', 'operative'), name: 'Reaver',
  stats: { APL: 3, MOVE: '6″', SAVE: '3+', WOUNDS: 14 }, baseSize: '32',
  keywords: value.split(',').map(text => text.trim()), loadouts: [] });
 return Model.validate(Model.migrate(project));
}

test('keyword formatting across commas survives project reload, every card side, PDF, TTS and ROSZ', () => {
 const project = keywordProject('[color=orange]***[size=12]RED CORSAIRS💀, LEADER[/size]***[/color], CHAOS');
 project.operatives[0].body = 'A long rule that requires several card sides. '.repeat(80);
 const restored = Model.validate(Model.migrate(JSON.parse(JSON.stringify(project))));
 assert.deepEqual(restored.operatives[0].keywords, project.operatives[0].keywords);
 const cards = Cards.renderCard(restored.operatives[0], restored);
 assert(cards.length > 1);
 for (const card of cards) {
  const keywords = card.svg.slice(card.svg.indexOf('<g class="operative-keywords"'));
  assert.match(keywords, /font-size="12" font-weight="bold" font-style="italic" fill="#f4511e"/);
  assert.match(keywords, /class="text-skull"/);
  assert.match(keywords, /class="operative-base-size"/);
  assert(!keywords.includes('[color=orange]') && !keywords.includes('[size=12]'));
 }
 const pdf = buildTeamPDF(restored, {}, { section: 'operatives', index: 0 });
 assert.deepEqual(pdf.content.filter(item => item.svg).map(item => item.svg), cards.map(card => card.svg));
 const deck = TTS.plan(restored).decks.find(deck => deck.id === 'operatives');
 assert.equal((JSON.stringify(deck.cards).match(/operative-keywords/g) || []).length, cards.length);
 const xml = Roster.build(restored).xml;
 assert.match(xml, /<category[^>]+name="RED CORSAIRS💀"/);
 assert.match(xml, /<category[^>]+name="LEADER" primary="true"/);
 assert.match(xml, /<category[^>]+name="CHAOS"/);
 assert(!xml.includes('[color=orange]') && !xml.includes('[size=12]') && !xml.includes('***'));
});

test('large keyword text remains complete and leaves room for the operative rules', () => {
 const names = Array.from({ length: 35 }, (_, index) => 'KEYWORD' + String(index).padStart(2, '0'));
 const project = keywordProject('[size=24]' + names.join(', ') + '[/size]');
 project.operatives[0].body = 'Operative rule still fits.';
 const cards = Cards.renderCard(project.operatives[0], project);
 assert.equal(cards.length, 1);
 for (const name of names) assert(cards[0].svg.includes(name), name);
 assert(cards[0].svg.includes('Operative rule still fits.'));
 const transform = cards[0].svg.match(/class="operative-keywords" transform="translate\(8 ([\d.]+)\) scale\(([\d.]+)\)"/);
 assert(transform);
 assert(Number(transform[1]) > 80);
 assert(Number(transform[2]) > 0 && Number(transform[2]) < 1);
});

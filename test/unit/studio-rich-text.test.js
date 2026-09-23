const test = require('node:test');
const assert = require('node:assert/strict');
const Text = require('../../public/studio/rich-text');
const Model = require('../../public/studio/model');
const Cards = require('../../public/studio/card-renderer');
const { buildTeamPDF } = require('../../public/studio/pdf-template');
const TTS = require('../../public/studio/tts-export');
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

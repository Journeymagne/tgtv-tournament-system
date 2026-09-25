const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../public/studio/model');
const Cards = require('../../public/studio/card-renderer');
const TTS = require('../../public/studio/tts-export');

function project(count = 14) {
 const data = Model.newProject('tts-export', 'One team');
 data.teamCards = Array.from({length: count - 13}, (_, i) => ({...Model.blank('rule-'+i, 'faction'), name: 'RULE '+i, body: 'RULE BODY '+i}));
 return data;
}

test('all card types share one face/back sheet with no changes to the source project', () => {
 const data = Model.validate(Model.migrate(require('../../public/studio/examples/kasrkin.json')));
 const original = structuredClone(data), result = TTS.plan(data);
 assert.deepEqual(data, original);
 assert.equal(result.sheets.length, 1);
 assert.equal(result.sheets[0].count, result.cardCount);
 assert.equal(result.sheets[0].faceFile, 'deck-faces.png');
 assert.equal(result.sheets[0].backFile, 'deck-backs.png');
 assert.deepEqual(result.sheets[0].cards, result.cards);
 for (const group of TTS.GROUPS) for (const key of group.keys) for (const [index, card] of data[key].entries()) {
  const sides = Cards.renderCard(card, data, {}, index);
  const exported = result.cards.filter(item => item.sourceId === card.id);
  assert.equal(exported.length, Math.ceil(sides.length / 2));
  for (const [part, item] of exported.entries()) {
   assert.equal(item.face, sides[part * 2].svg);
   assert.equal(item.landscape, key === 'operatives');
   if (sides[part * 2 + 1]) assert.equal(item.back, sides[part * 2 + 1].svg);
   else assert.match(item.back, /KILL TEAM/);
  }
 }
 assert.equal(result.contentSides, result.cardCount + result.doubleSided);
});

test('sheet limits reserve a hidden slot and split only after 69 playable cards', () => {
 for (const count of [13, 14, 26, 68, 69, 70, 138, 139]) {
  const result = TTS.plan(project(count));
  assert.equal(result.cardCount, count);
  assert.equal(result.sheets.length, Math.ceil(count / 69));
  assert.equal(result.sheets.flatMap(sheet => sheet.cards).length, count);
  assert.equal(new Set(result.cards.map(card => card.sourceId)).size, count);
  for (const [index, sheet] of result.sheets.entries()) {
   assert.equal(sheet.count, Math.min(69, count - index * 69));
   assert(sheet.columns >= 2 && sheet.columns <= 10);
   assert(sheet.rows >= 2 && sheet.rows <= 7);
   assert(sheet.count < sheet.columns * sheet.rows, 'last slot belongs to the hidden face');
   assert(sheet.width <= 4096 && sheet.height <= 4096);
   assert.equal(sheet.width, sheet.columns * sheet.cellWidth);
   assert.equal(sheet.height, sheet.rows * sheet.cellHeight);
   assert(Math.abs(sheet.cellWidth / sheet.cellHeight - 70 / 121) < .001);
   assert(!sheet.hidden.includes('RULE BODY'), 'hidden slot must not reveal any rules');
  }
 }
 assert.deepEqual(TTS.plan(project(70)).sheets.map(s => [s.faceFile, s.backFile]), [
  ['deck-1-faces.png', 'deck-1-backs.png'], ['deck-2-faces.png', 'deck-2-backs.png']
 ]);
});

test('long rules retain every continuation in the matching front/back slots', () => {
 const data = project();
 data.teamCards[0].body = Array.from({length: 110}, (_, i) => 'Paragraph '+i+': '+ 'Detailed rule text. '.repeat(6)).join('\n\n');
 const sides = Cards.renderCard(data.teamCards[0], data), result = TTS.plan(data);
 assert(sides.length > 2);
 assert.equal(result.contentSides, sides.length + 13);
 assert.equal(result.cardCount, Math.ceil(sides.length / 2) + 13);
 const continuations = result.cards.filter(card => card.sourceId === data.teamCards[0].id);
 for (const [index, card] of continuations.entries()) {
  assert.equal(card.part, index + 1);
  assert.equal(card.face, sides[index * 2].svg);
  if (sides[index * 2 + 1]) assert.equal(card.back, sides[index * 2 + 1].svg);
 }
 assert.deepEqual(continuations.flatMap(card => card.sourceSides), sides.map((_, i) => i + 1));
});

test('malformed projects are rejected before export', () => {
 const data = project();data.equipment = [];
 assert.throws(() => TTS.plan(data), /ровно четыре карточки/);
});

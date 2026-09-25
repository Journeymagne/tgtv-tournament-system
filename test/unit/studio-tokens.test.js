const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../public/studio/model');
const Tokens = require('../../public/studio/tokens');
const Cards = require('../../public/studio/card-renderer');
const TTS = require('../../public/studio/tts-export');
const { buildTeamPDF } = require('../../public/studio/pdf-template');
const MM = 72 / 25.4;
const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function project() {
 const data = Model.newProject('tokens', 'TOKEN TEAM'), card = Tokens.newCard('guide');
 card.tokens.push(Tokens.newToken('first')); data.tokenCards.push(card); return data;
}

test('old projects gain an empty token section without changing existing content', () => {
 const old = Model.newProject('legacy', 'OLD TEAM'); old.schemaVersion = 4; delete old.tokenCards;
 const snapshot = structuredClone(old), migrated = Model.validate(Model.migrate(old));
 assert.equal(migrated.schemaVersion, 5); assert.deepEqual(migrated.tokenCards, []);
 assert.deepEqual(migrated.selectionCards, old.selectionCards); assert.deepEqual(old, snapshot);
 assert.deepEqual(Model.migrate(migrated), migrated);
});

test('circles default to 20 mm and retain their diameter across layouts and pagination', () => {
 const data = project(), card = data.tokenCards[0];
 assert.equal(card.tokens[0].diameterMm, 20);
 card.tokens = [20,25,32,40,60].map((diameterMm,i) => ({...Tokens.newToken('t'+i), diameterMm}));
 for (const layout of ['grid2','grid3','compact']) {
  card.layout = layout;
  const pages = Cards.renderCard(card, data), boxes = pages.flatMap(p => p.boxes);
  assert(pages.length > 1); assert.deepEqual(boxes.map(b => b.id), card.tokens.map(t => t.id));
  boxes.forEach((b,i) => {
   assert(Math.abs(b.w / MM - card.tokens[i].diameterMm) < 1e-8);
   assert(Math.abs(b.h - b.w) < 1e-8);
   assert(b.x >= 0 && b.y >= 0 && b.x+b.w <= Cards.SHORT && b.y+b.h <= Cards.LONG);
  });
 }
});

test('large numeric variants continue on more sides without losing a value or shrinking', () => {
 const data = project(), card = data.tokenCards[0], token = card.tokens[0];
 token.diameterMm = 60; token.variants = '0,1,2,3,4,5,6,7,8,9,10,11';
 const pages = Cards.renderCard(card, data), boxes = pages.flatMap(p => p.boxes);
 assert.equal(pages.length, 12); assert.deepEqual(boxes.map(b => b.value), Array.from({length:12},(_,i)=>String(i)));
 assert(boxes.every(b => Math.abs(b.w/MM-60) < 1e-8));
});

test('symbol size changes the artwork without changing token geometry and survives saving', () => {
 const data = project(), card = data.tokenCards[0], token = card.tokens[0];
 const small = Cards.renderCard(card, data)[0]; token.symbolSize = 95;
 const large = Cards.renderCard(card, data)[0]; assert.notEqual(small.svg, large.svg); assert.deepEqual(small.boxes, large.boxes);
 token.symbol = 'custom'; token.symbolImage = IMAGE;
 const restored = Model.validate(Model.migrate(JSON.parse(JSON.stringify(data))));
 assert.equal(restored.tokenCards[0].tokens[0].symbolSize, 95);
 assert.equal(restored.tokenCards[0].tokens[0].symbolImage, IMAGE);
 assert(Cards.renderCard(restored.tokenCards[0], restored)[0].svg.includes(IMAGE));
 assert.deepEqual(Cards.renderCard(restored.tokenCards[0], restored)[0].boxes, large.boxes);
});

test('an oversized caption continues without printing the physical token twice', () => {
 const data=project(),card=data.tokenCards[0];card.fontSize=14;card.tokens[0].diameterMm=60;
 card.tokens[0].label='W'.repeat(160);
 const pages=Cards.renderCard(card,data);
 assert(pages.length>1);assert.equal(pages.flatMap(p=>p.boxes).length,1);
 const lines=pages.flatMap(p=>[...p.svg.matchAll(/<tspan[^>]*>(W+)<\/tspan>/g)].map(m=>m[1]));
 assert.equal(lines.join(''),card.tokens[0].label);
});

test('team renaming and token order propagate to the shared preview, PDF and TTS renderer', () => {
 const data = project(), card = data.tokenCards[0];
 card.tokens.push({...Tokens.newToken('second'),shape:'diamond'}); card.tokens.reverse();
 data.team.name = 'RENAMED <TEAM>';
 const rendered = Cards.renderCard(card,data), pdf = buildTeamPDF(data,{}, {section:'tokenCards',index:0});
 assert(rendered[0].svg.includes('RENAMED &lt;TEAM&gt;'));
 assert.deepEqual(rendered.flatMap(p=>p.boxes.map(b=>b.id)), ['second','first']);
 assert.deepEqual(pdf.content.filter(item=>item.svg).map(item=>item.svg),rendered.map(p=>p.svg));
 const exported = TTS.plan(data).cards.filter(c=>c.groupId==='tokens');
 assert.equal(exported.length,1); assert.equal(exported[0].face,rendered[0].svg);
 assert.equal(exported[0].landscape,false);
 assert(buildTeamPDF(data).content.some(item=>item.svg===rendered[0].svg));
});

test('invalid sizes, removed templates and unsafe uploaded images are rejected', () => {
 for (const patch of [{diameterMm:0},{diameterMm:61},{symbolSize:0},{symbolSize:101},{shape:'arc'},{shape:'strip'},{symbolImage:'https://example.com/a.png'},{symbolImage:'data:image/svg+xml;base64,PHN2Zz4='},{symbol:'custom'},{shape:'image'}]) {
  const data=project();Object.assign(data.tokenCards[0].tokens[0],patch);assert.throws(()=>Model.validate(data));
 }
 const data=project();data.tokenCards[0].tokens.push({...data.tokenCards[0].tokens[0]});assert.throws(()=>Model.validate(data));
});

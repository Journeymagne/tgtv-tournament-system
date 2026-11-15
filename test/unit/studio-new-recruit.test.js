const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../public/studio/model');
const roster = require('../../public/studio/new-recruit');
const zip = require('../../public/studio/vendor/fflate');
const murdasport = require('../../public/studio/examples/murdasport.json');
const kasrkin = require('../../public/studio/team.json');

// Parse just the exported XML hierarchy to check the consumer-facing paths.
function elements(xml) {
 const root = { tag: '#document', attrs: {}, children: [] }, stack = [root];
 for (const match of xml.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
  if (match[1]) { assert.equal(stack.pop().tag, match[2]);continue; }
  const entry = { tag: match[2], attrs: Object.fromEntries([...match[3].matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])), children: [] };
  stack.at(-1).children.push(entry);if (!match[4]) stack.push(entry);
 }
 assert.equal(stack.length, 1);return root.children[0];
}
const child = (element, tag) => element.children.find(c => c.tag === tag);

for (const [name, source] of [['Murdasport', murdasport], ['Kasrkin', kasrkin]]) {
 test(`${name}: ROSZ includes every current operative and weapon variant`, () => {
  const project = model.validate(model.migrate(source)), before = structuredClone(project);
  const result = roster.archive(project), files = zip.unzipSync(result.bytes);
  assert.deepEqual(Object.keys(files), [result.innerFilename]);
  assert.equal(zip.strFromU8(files[result.innerFilename]), result.xml);
  assert.equal(result.filename, project.team.id + '-studio.rosz');
  assert.equal(result.report.count, roster.summary(project).count);
  assert(roster.compatible(project));
  const document = elements(result.xml), force = child(child(document, 'forces'), 'force');
  assert.equal(document.attrs['xmlns:json'], 'http://james.newtonking.com/projects/json');
  const models = child(force, 'selections').children;
  for (const [index, entry] of models.entries()) {
   assert.equal(entry.attrs['json:Array'], 'true', 'Data Team must preserve a model list');
   assert(child(entry, 'profiles').children.every(p => p.attrs.typeName !== 'Weapons'));
   const weapons = child(entry, 'selections').children;
   assert.equal(weapons.length, result.report.operatives[index].weaponIds.length);
   for (const weapon of weapons) {
    assert.equal(weapon.attrs.type, 'upgrade');
    assert.equal(child(weapon, 'profiles').children[0].attrs.typeName, 'Weapons');
   }
  }
  for (const operative of project.operatives) {
   const entries = result.report.operatives.filter(o => o.operativeId === operative.id);
   assert(entries.length > 0, operative.name);
   assert.deepEqual(new Set(entries.flatMap(o => o.weaponIds)), new Set(operative.weapons.map(w => w.id)));
   for (const loadout of operative.loadouts) assert(entries.some(o => loadout.weaponIds.every(id => o.weaponIds.includes(id))));
   assert.equal(entries[0].stats.Move, operative.stats.MOVE ?? operative.stats.M);
   assert.equal(entries[0].stats.Wounds, operative.stats.WOUNDS ?? operative.stats.W);
  }
  assert.deepEqual(project, before, 'Export does not mutate the project');
 });
}

test('custom copies and changed profiles export without stale catalogue bindings', () => {
 const project = model.migrate(kasrkin);
 project.team.id = 'custom-team';project.team.name = 'Custom <Orks> & friends';
 project.operatives = [structuredClone(project.operatives[0])];
 project.selectionCards.forEach(c => { c.selectionGroups = [];c.excludedOperativeIds = []; });
 const operative = project.operatives[0];operative.id = 'new-operative';operative.name = 'New <leader>';
 operative.weapons = [operative.weapons[0]];operative.weapons[0].id = 'new-weapon';operative.loadouts = [];
 operative.abilities = [{ id: 'custom-ability', name: 'Custom ability', body: 'Rule <text> & more' }];
 operative.stats = { APL: 3, M: '7″', SV: '4+', W: 15, GA: 1, DF: 3 };
 const result = roster.build(project);
 assert.equal(result.report.operatives.length, 1);
 assert.deepEqual(result.report.operatives[0].weaponIds, ['new-weapon']);
 assert(result.xml.includes('Custom &lt;Orks&gt; &amp; friends'));
 assert(result.xml.includes('Move" typeId="c996-ffb3-e0b4-ecfa">7&quot;'));
 assert(result.xml.includes('GA: 1, DF: 3'));
 assert(!result.xml.includes('catalogueName="Kasrkin"'));
});

test('published projects with no operatives or partial stats can still be downloaded', () => {
 const project = model.newProject('empty-custom', 'Empty custom');
 assert.equal(roster.archive(project).report.count, 0);
 const emptyForce = child(child(elements(roster.build(project).xml), 'forces'), 'force');
 const reference = child(emptyForce, 'selections').children[0];
 assert.equal(reference.attrs['json:Array'], 'true');
 assert.equal(child(reference, 'categories').children[0].attrs.name, 'Reference');
 const operative = structuredClone(model.migrate(kasrkin).operatives[0]);operative.stats = { APL: 2 };
 project.operatives.push(operative);
 assert.equal(roster.archive(project).report.operatives[0].stats.Wounds, '-');
});

test('a single operative keeps the model list required by Command Node', () => {
 const project = model.newProject('single-model', 'Single model');
 project.operatives.push(structuredClone(model.migrate(kasrkin).operatives[1]));
 const force = child(child(elements(roster.build(project).xml), 'forces'), 'force');
 assert.equal(child(force, 'selections').children.length, 1);
 assert.equal(child(force, 'selections').children[0].attrs['json:Array'], 'true');
});

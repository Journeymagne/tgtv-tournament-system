const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../../public/studio/model');
const Roster = require('../../public/studio/new-recruit');
const weapon = () => ({ id: 'card-weapon', name: 'Ranger Long Rifle', kind: 'ranged', attacks: 4, hit: '2+', damage: '3/3', rules: '**Heavy**, [color=orange]Devastating 3[/color]', group: 'Rifle', mode: 'Aimed' });

test('saved weapon profiles travel with JSON and remain independent from card weapons', () => {
 const project = Model.newProject('profiles', 'Profiles'), original = weapon();
 const saved = Model.saveWeaponProfile(project, original, 'saved-rifle');
 assert.notStrictEqual(saved, original);
 original.rules = 'Private card edit';
 assert.equal(saved.rules, weapon().rules);
 const imported = Model.validate(Model.migrate(JSON.parse(JSON.stringify(project))));
 assert.deepEqual(imported.weaponProfiles, project.weaponProfiles);
 const first = Model.weaponFromProfile(imported, saved.id, 'first-copy');
 const second = Model.weaponFromProfile(imported, saved.id, 'second-copy');
 first.attacks = 7;first.rules = 'Another edit';
 assert.equal(second.attacks, 4);assert.equal(imported.weaponProfiles[0].attacks, 4);
 assert.equal(second.rules, weapon().rules);assert.equal(second.id, 'second-copy');
 assert.equal(Roster.build(imported).report.weaponProfiles, 0, 'unused saved profiles are not roster equipment');
});

test('saving an existing name, type and mode updates only the reusable profile', () => {
 const project = Model.newProject('profiles'), source = weapon();
 Model.saveWeaponProfile(project, source, 'saved-rifle');
 const copy = Model.weaponFromProfile(project, 'saved-rifle', 'on-card');
 source.attacks = 6;source.name = ' ranger long rifle ';
 const updated = Model.saveWeaponProfile(project, source, 'discarded-id');
 assert.equal(updated.id, 'saved-rifle');assert.equal(project.weaponProfiles.length, 1);
 assert.equal(copy.attacks, 4);assert.equal(updated.attacks, 6);
 source.mode = 'Mobile';Model.saveWeaponProfile(project, source, 'mobile-rifle');
 assert.equal(project.weaponProfiles.length, 2);
 project.weaponProfiles = [];
 assert.equal(copy.name, 'Ranger Long Rifle');
 assert.throws(() => Model.weaponFromProfile(project, 'saved-rifle', 'missing'), /не найден/);
});

test('old projects get an empty profile list and legacy weapon rules can be saved', () => {
 const old = Model.newProject('old');delete old.weaponProfiles;
 const migrated = Model.validate(Model.migrate(old));
 assert.deepEqual(migrated.weaponProfiles, []);assert.equal(old.weaponProfiles, undefined);
 const source = weapon();delete source.rules;source.special = 'Heavy';source.critical = 'Devastating 3';
 const saved = Model.saveWeaponProfile(migrated, source, 'legacy');
 assert.equal(saved.rules, 'Heavy; CR: Devastating 3');assert.equal(saved.critical, undefined);
 const other = Model.newProject('other');assert.deepEqual(other.weaponProfiles, []);
});

test('malformed profile libraries are rejected without changing a valid library', () => {
 const project = Model.newProject('profiles');Model.saveWeaponProfile(project, weapon(), 'valid');
 const before = structuredClone(project.weaponProfiles);
 assert.throws(() => Model.saveWeaponProfile(project, { ...weapon(), name: '' }, 'invalid'), /название/);
 assert.deepEqual(project.weaponProfiles, before);
 for (const profiles of [{}, [null], [{ ...before[0], rules: {} }], [before[0], before[0]], [{ ...before[0], attacks: -1 }]]) {
  assert.throws(() => Model.validate({ ...project, weaponProfiles: profiles }));
 }
});

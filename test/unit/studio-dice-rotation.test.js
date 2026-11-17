const test = require('node:test');
const assert = require('node:assert/strict');
const Dice = require('../../public/dice/renderer');
const Model = require('../../public/studio/model');

test('team projects retain each logo orientation through JSON save and migration', () => {
 for (const logoRotation of [0, 90, 180, 270]) {
  const project = Model.newProject('dice-rotation', 'Rotated dice');
  project.dice.logoRotation = logoRotation;
  const restored = Model.validate(Model.migrate(JSON.parse(JSON.stringify(project))));
  assert.equal(restored.dice.logoRotation, logoRotation);
 }
});

test('legacy dice remain valid while unsupported logo rotations are rejected', () => {
 const legacy = Dice.projectDefaults();
 delete legacy.logoRotation;
 assert.doesNotThrow(() => Dice.validate(legacy));
 for (const logoRotation of [-90, 45, 360, '90', null, NaN]) {
  assert.throws(() => Dice.validate({...legacy, logoRotation}), /поворот/i);
 }
});

test('resetting dice clears logo rotation and preserves the selected logo and pack choices', () => {
 const reset = Dice.resetDesign({...Dice.projectDefaults(), name:'My dice', logo:'original-image', logoRotation:270, enabled:true, quantity:12});
 assert.equal(reset.logoRotation, 0);
 assert.equal(reset.logo, 'original-image');
 assert.equal(reset.name, 'My dice');
 assert.equal(reset.enabled, true);
 assert.equal(reset.quantity, 12);
});

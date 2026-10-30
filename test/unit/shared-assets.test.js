const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('both account presentations accept long login identities and enforce registration limits', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../public/companion-auth.js'), 'utf8'), { window });
  for (const formId of ['account-auth-form', 'studio-login-form']) {
    const form = { id: formId, elements: { name: {}, password: {}, confirmPassword: {} } };
    window.KTAuthForm.setMode(form, 'register');
    assert.equal(form.elements.name.minLength, 2);
    assert.equal(form.elements.name.maxLength, 24);
    assert.equal(form.elements.password.minLength, 6);
    assert.equal(form.elements.password.maxLength, 256);
    assert.equal(form.elements.confirmPassword.maxLength, 256);
    assert.equal(form.elements.password.autocomplete, 'new-password');
    window.KTAuthForm.setMode(form, 'login');
    assert.equal(form.elements.name.maxLength, 254);
    assert.equal(form.elements.password.minLength, 1);
    assert.equal(form.elements.password.autocomplete, 'current-password');
  }
});

test('generated static pages and shared version manifest are current', () => {
  const { sync } = require('../../scripts/sync-shared-assets');
  assert.deepEqual(sync(true), []);
});

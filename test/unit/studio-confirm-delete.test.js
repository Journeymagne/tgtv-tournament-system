const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../public/studio/confirm-delete.js'), 'utf8');

function setup() {
  const document = { activeElement: null, body: { append(dialog) { document.dialog = dialog; } } };
  class Element {
    constructor() { this.listeners = {}; this.children = {}; }
    setAttribute() {}
    querySelector(selector) { return this.children[selector] ??= new Element(); }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    emit(type, values = {}) {
      const event = { detail: 1, preventDefault() { this.defaultPrevented = true; }, ...values };
      for (const listener of this.listeners[type] || []) listener(event);
      return event;
    }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    remove() { if (document.dialog === this) document.dialog = null; }
  }
  document.createElement = () => new Element();
  const window = {};
  vm.runInNewContext(source, { window, document });
  return { document, confirm: window.KTDelete.confirm };
}

test('Studio deletion requires two separate confirmations and defaults to cancel on both steps', async () => {
  const { document, confirm } = setup();
  let resolved = false;
  const result = confirm({ subject: '<img src=x onerror=alert(1)>' }).then(value => { resolved = true; return value; });
  const dialog = document.dialog, accept = dialog.querySelector('[data-delete-accept]'), cancel = dialog.querySelector('[data-delete-cancel]');
  assert.equal(dialog.querySelector('#studio-delete-subject').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(document.activeElement, cancel);
  accept.emit('click');
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(document.activeElement, cancel);
  assert.equal(dialog.querySelector('[data-delete-step]').textContent, 'Подтверждение 2 из 2');
  accept.emit('click', { detail: 2 });
  await Promise.resolve();
  assert.equal(resolved, false, 'double click must not bypass the second confirmation');
  assert.equal(dialog.emit('keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  accept.emit('click');
  assert.equal(await result, true);
  assert.equal(document.dialog, null);
});

for (const step of [1, 2]) for (const method of ['button', 'Escape', 'close']) {
  test(`Studio deletion is cancelled at step ${step} via ${method}`, async () => {
    const { document, confirm } = setup();
    const result = confirm(), dialog = document.dialog;
    if (step === 2) dialog.querySelector('[data-delete-accept]').emit('click');
    if (method === 'button') dialog.querySelector('[data-delete-cancel]').emit('click');
    else if (method === 'Escape') assert.equal(dialog.emit('cancel').defaultPrevented, true);
    else dialog.close();
    assert.equal(await result, false);
    assert.equal(document.dialog, null);
    const next = confirm({ alreadyConfirmed: true });
    document.dialog.querySelector('[data-delete-accept]').emit('click');
    assert.equal(await next, true, 'cancelling releases the dialog for the next attempt');
  });
}

test('existing card/team confirmation counts as step one and concurrent attempts are rejected', async () => {
  const { document, confirm } = setup();
  const result = confirm({ alreadyConfirmed: true });
  const dialog = document.dialog;
  assert.equal(dialog.querySelector('[data-delete-step]').textContent, 'Подтверждение 2 из 2');
  assert.equal(await confirm(), false);
  assert.equal(document.dialog, dialog);
  dialog.querySelector('[data-delete-accept]').emit('click');
  assert.equal(await result, true);
});

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

test('Studio deletion requires exactly one confirmation and defaults to cancel', async () => {
  const { document, confirm } = setup();
  let resolved = false;
  const result = confirm({ subject: '<img src=x onerror=alert(1)>' }).then(value => { resolved = true; return value; });
  const dialog = document.dialog, accept = dialog.querySelector('[data-delete-accept]'), cancel = dialog.querySelector('[data-delete-cancel]');
  assert.equal(dialog.querySelector('#studio-delete-subject').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(document.activeElement, cancel);
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(accept.textContent, 'Да, удалить');
  assert(!dialog.innerHTML.includes('data-delete-step'));
  assert.equal(dialog.emit('keydown', { key: 'Enter', repeat: true }).defaultPrevented, true);
  accept.emit('click');
  assert.equal(await result, true);
  assert.equal(document.dialog, null);
});

for (const method of ['button', 'Escape', 'close']) {
  test(`Studio deletion is cancelled via ${method}`, async () => {
    const { document, confirm } = setup();
    const result = confirm(), dialog = document.dialog;
    if (method === 'button') dialog.querySelector('[data-delete-cancel]').emit('click');
    else if (method === 'Escape') assert.equal(dialog.emit('cancel').defaultPrevented, true);
    else dialog.close();
    assert.equal(await result, false);
    assert.equal(document.dialog, null);
    const next = confirm();
    document.dialog.querySelector('[data-delete-accept]').emit('click');
    assert.equal(await next, true, 'cancelling releases the dialog for the next attempt');
  });
}

test('concurrent deletion attempts are rejected without replacing the active confirmation', async () => {
  const { document, confirm } = setup();
  const result = confirm();
  const dialog = document.dialog;
  assert.equal(await confirm(), false);
  assert.equal(document.dialog, dialog);
  dialog.querySelector('[data-delete-accept]').emit('click');
  assert.equal(await result, true);
});

test('replacement also needs only one confirmation with an explicit replacement label', async () => {
  const { document, confirm } = setup();
  const result = confirm({ replace: true });
  const accept = document.dialog.querySelector('[data-delete-accept]');
  assert.equal(accept.textContent, 'Да, заменить');
  accept.emit('click');
  assert.equal(await result, true);
  assert.equal(document.dialog, null);
});

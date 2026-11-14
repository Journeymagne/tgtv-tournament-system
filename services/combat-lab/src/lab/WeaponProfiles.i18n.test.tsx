import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import Model from 'src/Model';
import WeaponProfiles from './WeaponProfiles';

let world: any;
beforeEach(() => {
  localStorage.clear();
  document.body.dataset.companionSection = 'combat';
  world = {KTAppearance: {locale: 'en'}, addEventListener() {}};
  const context = vm.createContext({window: world, document, NodeFilter,
    MutationObserver: class { observe() {} }, queueMicrotask() {},
  });
  for (const file of ['../../../../public/companion-i18n.js', '../../public/companion-ui.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), context);
  }
});
afterEach(() => { jest.restoreAllMocks(); delete document.body.dataset.companionSection; });

it('translates save, load, counts and status in both languages without translating a user profile name', () => {
  render(<WeaponProfiles mode="shoot" model={new Model()} onChange={() => {}} idPrefix="test"/>);
  world.KTUI.translate();
  fireEvent.click(screen.getByRole('button', {name: 'Save weapon profile'}));
  world.KTUI.translate();
  fireEvent.change(screen.getByLabelText('Weapon profile name'), {target: {value: 'Сохранить'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save', exact: true}));
  world.KTUI.translate();
  const select = screen.getByRole('combobox', {name: 'Saved weapon profiles'});
  expect(within(select).getByRole('option', {name: 'My weapon profiles (1)'})).toBeTruthy();
  expect(within(select).getByRole('option', {name: 'Сохранить'})).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Weapon profile “Сохранить” saved in this browser');
  fireEvent.change(select, {target: {value: '0'}}); world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Selected profile “Сохранить”');
  world.KTAppearance.locale = 'ru'; world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Выбран профиль «Сохранить»');
  expect(screen.getByRole('button', {name: 'Сохранить профиль оружия'})).toBeTruthy();
});

it('translates storage errors in the profile form', () => {
  render(<WeaponProfiles mode="shoot" model={new Model()} onChange={() => {}} idPrefix="test"/>);
  world.KTUI.translate();
  fireEvent.click(screen.getByRole('button', {name: 'Save weapon profile'})); world.KTUI.translate();
  fireEvent.change(screen.getByLabelText('Weapon profile name'), {target: {value: 'Example'}});
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  fireEvent.click(screen.getByRole('button', {name: 'Save', exact: true})); world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Could not save the profile: check browser access to local storage');
});

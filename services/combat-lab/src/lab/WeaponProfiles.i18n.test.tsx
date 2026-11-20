import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import Model from 'src/Model';
import WeaponProfiles from './WeaponProfiles';
import DefenderControls from 'src/components/DefenderControls';
import FighterControls from 'src/components/FighterControls';
import Ability from 'src/Ability';
import {SavedProfile} from './weaponProfileLibrary';

let world: any;
const originalFetch = window.fetch;
beforeEach(() => {
  localStorage.clear();
  document.body.dataset.companionSection = 'combat';
  let profiles: SavedProfile[] = [];
  window.fetch = jest.fn(async (_url, init) => {
    if (init?.method === 'PUT') profiles = [{...JSON.parse(String(init.body)), revision: 'revision-1'}];
    if (init?.method === 'DELETE') profiles = [];
    return {ok: true, json: async () => ({accountId: 17, profiles})} as Response;
  });
  world = {KTAppearance: {locale: 'en'}, addEventListener() {}};
  const context = vm.createContext({window: world, document, NodeFilter,
    MutationObserver: class { observe() {} }, queueMicrotask() {},
  });
  for (const file of ['../../../../public/companion-i18n.js', '../../public/companion-ui.js']) {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), context);
  }
});
afterEach(() => { window.fetch = originalFetch; jest.restoreAllMocks(); delete document.body.dataset.companionSection; });

it('translates fight effect frequency labels and choices in both languages', async () => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setAbility(Ability.PuritySeal)} changeHandler={() => {}} />);
  await screen.findByRole('button', {name: 'Сохранить профиль оружия'});
  fireEvent.click(screen.getByRole('tab', {name: /Фракционные правила/}));
  world.KTUI.translate();
  const frequency = screen.getByRole('combobox', {name: 'PuritySeal: frequency'});
  expect(within(frequency).getByRole('option', {name: 'Every fight'})).toBeTruthy();
  expect(within(frequency).getByRole('option', {name: 'Once across all fights'})).toBeTruthy();
  world.KTAppearance.locale = 'ru'; world.KTUI.translate();
  expect(screen.getByRole('combobox', {name: 'PuritySeal: частота'})).toBe(frequency);
});

it('translates account profile actions and preserves user-supplied names', async () => {
  render(<WeaponProfiles mode="shoot" model={new Model()} onChange={() => {}} idPrefix="test"/>);
  await screen.findByRole('combobox');
  world.KTUI.translate();
  fireEvent.click(screen.getByRole('button', {name: 'Save weapon profile'}));
  world.KTUI.translate();
  fireEvent.change(screen.getByLabelText('Weapon profile name'), {target: {value: 'Сохранить'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save profile', exact: true}));
  await screen.findByRole('option', {name: 'Сохранить'});
  world.KTUI.translate();
  const select = screen.getByRole('combobox', {name: 'Saved weapon profiles'});
  expect(within(select).getByRole('option', {name: 'My weapon profiles (1)'})).toBeTruthy();
  expect(within(select).getByRole('option', {name: 'Сохранить'})).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Weapon profile “Сохранить” saved to your account');
  expect(localStorage.getItem('companion-weapon-profiles-shoot')).toBeNull();
  fireEvent.change(select, {target: {value: ''}});
  fireEvent.change(select, {target: {value: 'Сохранить'}}); world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Selected profile “Сохранить”');
  world.KTAppearance.locale = 'ru'; world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Выбран профиль «Сохранить»');
  expect(screen.getByRole('button', {name: 'Сохранить профиль оружия'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Удалить профиль'}));
  world.KTAppearance.locale = 'en'; world.KTUI.translate();
  expect(screen.getByText('Delete profile “Сохранить”?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Delete', exact: true}));
  await screen.findByText('Профиль «Сохранить» удалён'); world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Weapon profile “Сохранить” deleted');
  expect(screen.queryByRole('option', {name: 'Сохранить'})).toBeNull();
});

it('translates account-service errors in the profile form and keeps the draft for retry', async () => {
  render(<WeaponProfiles mode="shoot" model={new Model()} onChange={() => {}} idPrefix="test"/>);
  await screen.findByRole('combobox');
  world.KTUI.translate();
  fireEvent.click(screen.getByRole('button', {name: 'Save weapon profile'})); world.KTUI.translate();
  fireEvent.change(screen.getByLabelText('Weapon profile name'), {target: {value: 'Example'}});
  (window.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));
  fireEvent.click(screen.getByRole('button', {name: 'Save profile', exact: true}));
  await screen.findByRole('status'); world.KTUI.translate();
  expect(screen.getByRole('status').textContent).toBe('Could not save the profile. Try again.');
  expect(screen.getByDisplayValue('Example')).toBeTruthy();
});

it('keeps the defensive Save stat separate from the profile-saving action', () => {
  render(<DefenderControls defender={Model.basicDefender()} changeHandler={() => {}} idPrefix="def"/>);
  world.KTUI.translate();
  world.KTAppearance.locale = 'ru'; world.KTUI.translate();
  expect(document.querySelector('label[for="def-Save"]')?.textContent).toBe('Сейв');
});

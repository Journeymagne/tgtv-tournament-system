import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Ability from 'src/Ability';
import Model from 'src/Model';
import { pack } from 'src/simulation/model';
import WeaponProfiles from './WeaponProfiles';
import {Mode} from 'src/simulation/types';
import {hasLegacy, importBrowserProfiles} from './weaponProfileLibrary';

const originalFetch = window.fetch;
const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
const json = (body: object, status = 200) => ({ok: status === 200, status, json: async () => body} as Response);
beforeEach(() => {
  localStorage.clear();
  document.body.dataset.companionSection = 'combat';
});
afterEach(() => {
  window.fetch = originalFetch;
  if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
  else Reflect.deleteProperty(window, 'crypto');
  delete document.body.dataset.companionSection;
});

it.each<[Mode, boolean]>([['shoot', false], ['shoot', true], ['fight', false], ['fight', true]])(
  'loads account profiles with old or current %s frequency settings (new=%s)', async (mode, newer) => {
  const model = new Model().setAbility(Ability.PuritySeal);
  const frequency = mode === 'shoot' ? 'shootOnceAbilities' : 'fightOnceAbilities';
  model[frequency] = [Ability.PuritySeal];
  const saved = pack(model);
  if (!newer) { delete saved[frequency]; delete saved.woundsStat; delete saved.shootWeaponRounds; }
  window.fetch = jest.fn(async () => json({accountId: 7, profiles: [{name: 'Example', model: saved, revision: 'rev'}]}));
  const changed = jest.fn();
  const fighter = new Model().setProp('wounds', 5).setProp('woundsStat', 10).setProp('fnp', 4);
  render(<WeaponProfiles mode={mode} model={fighter} onChange={changed} idPrefix="a" />);
  fireEvent.change(await screen.findByRole('combobox'), {target: {value: 'Example'}});
  const restored = changed.mock.calls[0][0] as Model;
  expect(restored.has(Ability.PuritySeal)).toBe(true);
  expect(restored[frequency]).toEqual(newer ? [Ability.PuritySeal] : []);
  expect([restored.wounds, restored.woundsStat, restored.fnp]).toEqual([5, 10, 4]);
});

it('keeps a failed browser import bound to its confirmed account and retries the same batch', async () => {
  const key = 'companion-weapon-profiles-shoot';
  localStorage.setItem(key, JSON.stringify([{name: 'Private legacy name', model: pack(new Model())}]));
  Object.defineProperty(window, 'crypto', {configurable: true, value: {randomUUID: () => 'd770a76a-9cfe-42c3-b9fe-c103d54ff84d'}});
  const api = jest.fn().mockResolvedValueOnce(json({accountId: 7, profiles: []}))
    .mockResolvedValueOnce(json({accountId: 7, profiles: []}))
    .mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({accountId: 7}));
  window.fetch = api;
  render(<WeaponProfiles mode="shoot" model={new Model()} onChange={() => {}} idPrefix="a" />);
  await screen.findByRole('button', {name: 'Перенести в мой аккаунт'});
  expect(screen.queryByText('Private legacy name')).toBeNull();
  expect(api).toHaveBeenCalledTimes(1);
  await expect(importBrowserProfiles('shoot', 7)).rejects.toMatchObject({status: 503});
  expect(hasLegacy('shoot', 8)).toBe(false);
  await expect(importBrowserProfiles('shoot', 8)).rejects.toThrow();
  await importBrowserProfiles('shoot', 7);
  expect(api.mock.calls[2][1]).toEqual(api.mock.calls[3][1]);
  expect(localStorage.getItem(key)).toBeNull();
});

it('leaves an unclaimed legacy list intact when the account has already switched', async () => {
  const key = 'companion-weapon-profiles-fight';
  const legacy = JSON.stringify([{name: 'Saved before accounts', model: pack(new Model())}]);
  localStorage.setItem(key, legacy);
  window.fetch = jest.fn(async () => json({}, 401));
  await expect(importBrowserProfiles('fight', 7)).rejects.toMatchObject({status: 401});
  expect(localStorage.getItem(key)).toBe(legacy);
});

it('removes account data and a draft name as soon as the session signs out', async () => {
  window.fetch = jest.fn(async () => json({accountId: 7, profiles: [{name: 'Private', model: pack(new Model()), revision: 'rev'}]}));
  render(<WeaponProfiles mode="fight" model={new Model()} onChange={() => {}} idPrefix="a" />);
  await screen.findByRole('option', {name: 'Private'});
  fireEvent.click(screen.getByRole('button', {name: 'Сохранить профиль оружия'}));
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'Private draft'}});
  fireEvent(window, new CustomEvent('kt:session', {detail: {user: null}}));
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByDisplayValue('Private draft')).toBeNull();
  expect(screen.getByRole('link').getAttribute('href')).toContain('/account?next=');
});

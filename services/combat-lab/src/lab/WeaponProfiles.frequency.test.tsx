import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Ability from 'src/Ability';
import Model from 'src/Model';
import { pack } from 'src/simulation/model';
import WeaponProfiles from './WeaponProfiles';

beforeEach(() => localStorage.clear());

it.each([false, true])('loads weapon profiles with or without frequency settings (new=%s)', newer => {
  const model = new Model().setAbility(Ability.PuritySeal);
  model.fightOnceAbilities = [Ability.PuritySeal];
  const saved = pack(model);
  if (!newer) delete saved.fightOnceAbilities;
  localStorage.setItem('companion-weapon-profiles-fight', JSON.stringify([{name: 'Example', model: saved}]));
  const changed = jest.fn();
  render(<WeaponProfiles mode="fight" model={new Model()} onChange={changed} idPrefix="fa" />);
  fireEvent.change(screen.getByRole('combobox'), {target: {value: '0'}});
  expect(changed).toHaveBeenCalledTimes(1);
  const restored = changed.mock.calls[0][0] as Model;
  expect(restored.has(Ability.PuritySeal)).toBe(true);
  expect(restored.fightOnceAbilities).toEqual(newer ? [Ability.PuritySeal] : []);
});

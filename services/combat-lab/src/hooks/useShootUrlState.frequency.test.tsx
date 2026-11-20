import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Model from 'src/Model';
import Ability from 'src/Ability';
import ShootOptions from 'src/ShootOptions';
import { attackerFrequencyAbilities, defenderFrequencyAbilities, parseShootOnceAbilities } from 'src/ShootEffectFrequency';
import { hydrate, pack } from 'src/simulation/model';
import { getStateFromUrl, useUrlState } from './useUrlState';

afterEach(() => { window.history.replaceState({}, '', '/'); localStorage.clear(); });

it('round-trips all supported shooting frequencies independently through both share actions', () => {
  const a1 = new Model(), a2 = new Model(), d1 = Model.basicDefender(), d2 = Model.basicDefender();
  a1.shootOnceAbilities = [...attackerFrequencyAbilities];
  a2.shootOnceAbilities = [Ability.PuritySeal];
  d1.shootOnceAbilities = [...defenderFrequencyAbilities];
  d2.shootOnceAbilities = [Ability.Punishing];
  a1.shootWeaponRounds = {lethal: 'first', px: 'second'};
  a2.shootWeaponRounds = {apx: 'first'};
  a1.faithPoints = 5;
  d2.faithPoints = 0;
  let share!: ReturnType<typeof useUrlState>;
  function Harness() {
    share = useUrlState(a1, d1, new ShootOptions(), a2, d2, new ShootOptions());
    const location = useLocation();
    return <><button onClick={share.addParamsToUrl}>Share</button><output>{location.search}</output></>;
  }
  render(<MemoryRouter><Harness /></MemoryRouter>);
  for (const action of [
    () => window.history.replaceState({}, '', share.getShareUrl()),
    () => { fireEvent.click(screen.getByRole('button')); window.history.replaceState({}, '', `/${document.querySelector('output')!.textContent}`); },
  ]) {
    action();
    const {s1, s2} = getStateFromUrl();
    expect(s1!.attacker.shootOnceAbilities).toEqual(a1.shootOnceAbilities);
    expect(s1!.defender.shootOnceAbilities).toEqual(d1.shootOnceAbilities);
    expect(s2!.attacker.shootOnceAbilities).toEqual(a2.shootOnceAbilities);
    expect(s2!.defender.shootOnceAbilities).toEqual(d2.shootOnceAbilities);
    expect(s1!.attacker.shootWeaponRounds).toEqual({lethal: 'first', px: 'second'});
    expect(s2!.attacker.shootWeaponRounds).toEqual({apx: 'first'});
    expect(s1!.attacker.faithPoints).toBe(5);
    expect(s2!.defender.faithPoints).toBe(0);
  }
});

it('preserves old URL defaults and filters invalid or unsupported shooting rules', () => {
  const oldAttacker = '4:3:3:4:0:0:0:X:0:0:0:0:0:rend';
  const oldDefender = '3:12:0:0:0:0:0:0:X:ind:0';
  const query = new URLSearchParams({a1: oldAttacker, d1: oldDefender,
    a2: `${oldAttacker}:Rending,Rending,Brutal,invalid`, d2: `${oldDefender}:Indomitus,Balanced,invalid`});
  window.history.replaceState({}, '', `/?${query}`);
  const {s1, s2} = getStateFromUrl();
  expect(s1!.attacker.shootOnceAbilities).toEqual([]);
  expect(s1!.defender.shootOnceAbilities).toEqual([]);
  expect(s2!.attacker.shootOnceAbilities).toEqual([Ability.Rending]);
  expect(s2!.defender.shootOnceAbilities).toEqual([Ability.Indomitus]);
});

it.each([undefined, null, 'Rending', {}, [Ability.Rending, Ability.Brutal, Ability.Rending, 'invalid']])('sanitizes stored shooting frequency %j', raw => {
  const saved = {...pack(new Model()), shootOnceAbilities: raw};
  expect(hydrate(saved).shootOnceAbilities).toEqual(Array.isArray(raw) ? [Ability.Rending] : []);
  expect(parseShootOnceAbilities(raw)).toEqual(Array.isArray(raw) ? [Ability.Rending] : []);
});

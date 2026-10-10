import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Model from 'src/Model';
import Ability from 'src/Ability';
import FightOptions from 'src/FightOptions';
import { FIGHT_CALCULATOR_PATH } from 'src/CalculatorViewChoice';
import { getFightStateFromUrl, useFightUrlState } from './useUrlState';

afterEach(() => window.history.replaceState({}, '', '/'));

function renderFightShare(fighterA: Model, fighterB: Model) {
  let share!: ReturnType<typeof useFightUrlState>;
  function Harness() {
    share = useFightUrlState(fighterA, fighterB, new FightOptions());
    const location = useLocation();
    return <>
      <button type="button" onClick={share.addParamsToUrl}>Add Share Params</button>
      <output data-testid="location">{location.pathname}{location.search}</output>
    </>;
  }
  render(<MemoryRouter initialEntries={['/']}><Harness /></MemoryRouter>);
  return {
    getShareUrl: () => share.getShareUrl(),
    addParamsToUrl: () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Share Params' }));
      window.history.replaceState({}, '', screen.getByTestId('location').textContent || '/');
    },
  };
}

it('shares fight state on /fight so unfurls are not the shoot snapshot', () => {
  const share = renderFightShare(new Model(), new Model());

  const url = new URL(share.getShareUrl());
  expect(url.origin).toBe(window.location.origin);
  expect(url.pathname).toBe(FIGHT_CALCULATOR_PATH);
  expect(url.searchParams.has('view')).toBe(false);
  expect(url.searchParams.get('fa')).toBeTruthy();
  expect(url.searchParams.get('fb')).toBeTruthy();
  expect(url.searchParams.get('fo')).toBeTruthy();

  share.addParamsToUrl();
  expect(window.location.pathname).toBe(FIGHT_CALCULATOR_PATH);
  expect(new URLSearchParams(window.location.search).has('view')).toBe(false);
  expect(getFightStateFromUrl()).not.toBeNull();
});

it.each([
  [Ability.Shock],
  [Ability.JustAScratchNorms],
  [Ability.HalfDamageFirstStrike],
  [Ability.Shock, Ability.JustAScratchNorms, Ability.HalfDamageFirstStrike, Ability.JustAScratch],
])('preserves fight abilities %j without enabling other abilities', (...abilities) => {
  const fighterA = new Model();
  abilities.forEach(ability => fighterA.setAbility(ability));
  const fighterB = new Model().setAbility(Ability.JustAScratch);
  const share = renderFightShare(fighterA, fighterB);
  for (const action of [
    () => window.history.replaceState({}, '', share.getShareUrl()),
    () => share.addParamsToUrl(),
  ]) {
    window.history.replaceState({}, '', '/');
    action();
    const restored = getFightStateFromUrl()!;
    expect(restored.fighterA.abilities).toEqual(fighterA.abilities);
    expect(restored.fighterB.abilities).toEqual(fighterB.abilities);
  }
});

it('preserves abilities in legacy fight links without enabling new or removed abilities', () => {
  const params = new URLSearchParams({
    fa: '12:4:3:3:4:X:0:0:0:0:0::rendjasdur',
    fb: '12:4:3:3:4:X:0:0:0:0:0::',
  });
  window.history.replaceState({}, '', `/?${params}`);
  const restored = getFightStateFromUrl()!;
  expect(restored.fighterA.abilities).toEqual(new Set([Ability.Rending, Ability.JustAScratch]));
  expect(restored.fighterB.abilities.size).toBe(0);
});

it.each([0, 4, 5, 6])('preserves FNP %i for both fighters through both sharing actions', (fnp) => {
  const fighterA = new Model().setProp('fnp', fnp).setProp('saintlyRelics', 1);
  const fighterB = new Model().setProp('fnp', fnp === 0 ? 4 : 0).setProp('saintlyRelics', 2);
  const share = renderFightShare(fighterA, fighterB);
  for (const action of [
    () => window.history.replaceState({}, '', share.getShareUrl()),
    () => share.addParamsToUrl(),
  ]) {
    window.history.replaceState({}, '', '/');
    action();
    const restored = getFightStateFromUrl()!;
    expect(restored.fighterA.fnp).toBe(fighterA.fnp);
    expect(restored.fighterB.fnp).toBe(fighterB.fnp);
    expect(restored.fighterA.saintlyRelics).toBe(1);
    expect(restored.fighterB.saintlyRelics).toBe(2);
  }
});

it.each([2, 3])('degrades fight FNP %i to off through both sharing actions', (fnp) => {
  const fighterA = new Model().setProp('fnp', fnp).setProp('saintlyRelics', 1);
  const fighterB = new Model().setProp('fnp', fnp).setProp('saintlyRelics', 2);
  const share = renderFightShare(fighterA, fighterB);
  for (const action of [
    () => window.history.replaceState({}, '', share.getShareUrl()),
    () => share.addParamsToUrl(),
  ]) {
    window.history.replaceState({}, '', '/');
    action();
    const restored = getFightStateFromUrl()!;
    expect(restored.fighterA.fnp).toBe(0);
    expect(restored.fighterB.fnp).toBe(0);
    expect(restored.fighterA.saintlyRelics).toBe(1);
    expect(restored.fighterB.saintlyRelics).toBe(2);
  }
});

it.each(['', ':2', ':2:', ':2:invalid', ':2:1', ':2:2', ':2:3', ':2:7', ':2:4.5'])('defaults missing or invalid FNP to off for suffix %j', (suffix) => {
  const profile = `12:4:3:3:4:X:0:0:0:0:0::${suffix}`;
  const params = new URLSearchParams({ view: 'fight', fa: profile, fb: profile });
  window.history.replaceState({}, '', `/?${params}`);
  const restored = getFightStateFromUrl()!;
  expect(restored.fighterA.fnp).toBe(0);
  expect(restored.fighterB.fnp).toBe(0);
  expect(restored.fighterA.saintlyRelics).toBe(suffix ? 2 : 0);
});

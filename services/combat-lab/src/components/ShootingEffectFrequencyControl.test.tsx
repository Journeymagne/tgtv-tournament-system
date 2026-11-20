import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Ability from 'src/Ability';
import Model from 'src/Model';
import AttackerControls from './AttackerControls';
import DefenderControls from './DefenderControls';
import { attackerFrequencyAbilities, defenderFrequencyAbilities } from 'src/ShootEffectFrequency';

it.each(attackerFrequencyAbilities)('offers attacker frequency for enabled %s in either situation', ability => {
  for (const idPrefix of ['a1', 'a2']) {
    const view = render(<AttackerControls idPrefix={idPrefix} attacker={new Model().setAbility(ability)} changeHandler={() => {}} />);
    const select = document.getElementById(`${idPrefix}-${ability}-frequency`) as HTMLSelectElement;
    expect(select.value).toBe('each');
    expect([...select.options].map(option => option.text)).toEqual(['Каждая стрельба', 'Один раз за серию']);
    view.unmount();
  }
});

it.each(defenderFrequencyAbilities)('offers defender frequency for enabled %s in either situation', ability => {
  for (const idPrefix of ['d1', 'd2']) {
    const view = render(<DefenderControls idPrefix={idPrefix} defender={Model.basicDefender().setAbility(ability)} changeHandler={() => {}} />);
    expect((document.getElementById(`${idPrefix}-${ability}-frequency`) as HTMLSelectElement).value).toBe('each');
    view.unmount();
  }
});

it('changes one enabled rule independently and hides it when disabled', () => {
  function Harness() {
    const [model, change] = React.useState(new Model().setAbility(Ability.Rending).setAbility(Ability.Severe));
    return <AttackerControls idPrefix="a1" attacker={model} changeHandler={change} />;
  }
  render(<Harness />);
  const rending = screen.getByRole('combobox', {name: 'Rending: частота'});
  fireEvent.change(rending, {target: {value: 'once'}});
  expect((rending as HTMLSelectElement).value).toBe('once');
  expect((screen.getByRole('combobox', {name: 'Severe: частота'}) as HTMLSelectElement).value).toBe('each');
  expect(document.getElementById('a1-PuritySeal-frequency')).toBeNull();
  fireEvent.click(screen.getByLabelText('Rending'));
  expect(screen.queryByRole('combobox', {name: 'Rending: частота'})).toBeNull();
});

it('explains passive first-action expiry separately from first-trigger use', () => {
  render(<DefenderControls idPrefix="d1" defender={Model.basicDefender().setAbility(Ability.ObscuredTarget).setAbility(Ability.JustAScratchNorms)} changeHandler={() => {}} />);
  expect(document.getElementById('d1-ObscuredTarget-frequency')?.title).toBe('Каждая стрельба: правило действует в каждой стрельбе. Один раз за серию: правило действует всю первую стрельбу.');
  expect(document.getElementById('d1-JustAScratchNorms-frequency')?.title).toBe('Каждая стрельба: эффект доступен в каждой стрельбе. Один раз за серию: эффект расходуется при первом срабатывании во всей серии.');
});

it('keeps the same faction controls in place when Acts of Faith is toggled', () => {
  function Harness() {
    const [model, change] = React.useState(Model.basicDefender().setAbility(Ability.DominoField));
    return <DefenderControls idPrefix="d1" defender={model} changeHandler={change}/>;
  }
  render(<Harness/>);
  fireEvent.click(screen.getByRole('tab', {name: /Фракционные правила/}));
  const panel = screen.getByRole('tabpanel');
  const gridItems = () => Array.from(panel.children, item =>
    Array.from(item.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'), input => input.id));
  const initial = gridItems();
  const acts = screen.getByRole('checkbox', {name: 'Acts of Faith'});
  const icon = screen.getByRole('checkbox', {name: 'Icon of Faith'}) as HTMLInputElement;
  const points = screen.getByLabelText('Очки веры') as HTMLSelectElement;
  const domino = screen.getByRole('combobox', {name: 'Domino Field: частота'});
  expect(icon.disabled).toBe(true);
  expect(points.disabled).toBe(true);
  fireEvent.click(acts);
  expect(gridItems()).toEqual(initial);
  expect(points.disabled).toBe(false);
  fireEvent.click(icon);
  fireEvent.change(points, {target: {value: '7'}});
  fireEvent.click(acts);
  expect(gridItems()).toEqual(initial);
  expect(icon.checked).toBe(false);
  expect(points.value).toBe('7');
  expect(screen.getByRole('combobox', {name: 'Domino Field: частота'})).toBe(domino);
});

it('can assign Lethal, Piercing and Piercing Crits independently to either shot', () => {
  function Harness({rounds}: {rounds: number}) {
    const [model, change] = React.useState(new Model().setProp('lethal', 5).setProp('apx', 1).setProp('px', 2));
    return <AttackerControls idPrefix="a" attacker={model} rounds={rounds} changeHandler={change}/>;
  }
  const view = render(<Harness rounds={1}/>);
  expect(document.getElementById('a-lethal-shot')).toBeNull();
  view.rerender(<Harness rounds={2}/>);
  const selectors = ['lethal','apx','px'].map(key => document.getElementById('a-' + key + '-shot') as HTMLSelectElement);
  expect(selectors.map(select => select.value)).toEqual(['each', 'each', 'each']);
  fireEvent.change(selectors[0], {target: {value: 'second'}});
  fireEvent.change(selectors[2], {target: {value: 'first'}});
  expect(selectors.map(select => select.value)).toEqual(['second', 'each', 'first']);
  view.rerender(<Harness rounds={1}/>);
  expect(document.getElementById('a-apx-shot')).toBeNull();
  expect((document.getElementById('a-lethal-shot') as HTMLSelectElement).value).toBe('second');
});

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
  render(<DefenderControls idPrefix="d1" defender={Model.basicDefender().setAbility(Ability.ObscuredTarget).setAbility(Ability.JustAScratch)} changeHandler={() => {}} />);
  expect(document.getElementById('d1-ObscuredTarget-frequency')?.title).toBe('Каждая стрельба: правило действует в каждой стрельбе. Один раз за серию: правило действует всю первую стрельбу.');
  expect(document.getElementById('d1-JustAScratch-frequency')?.title).toBe('Каждая стрельба: эффект доступен в каждой стрельбе. Один раз за серию: эффект расходуется при первом срабатывании во всей серии.');
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Model from 'src/Model';
import Ability from 'src/Ability';
import FighterControls, { fighterBasicCheckboxes, fighterAdvancedCheckboxes } from 'src/components/FighterControls';
import { mutuallyExclusiveFightAbilities } from 'src/Ability';

it.each([...fighterBasicCheckboxes, ...fighterAdvancedCheckboxes])('offers a frequency for $ability', box => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setAbility(box.ability)} changeHandler={() => {}} />);
  expect(screen.getByRole('combobox', {name: `${box.note.name}: частота`})).toBeTruthy();
});

it.each(mutuallyExclusiveFightAbilities.filter(ability => ability !== Ability.None))('offers a frequency for niche rule %s', ability => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setAbility(ability)} changeHandler={() => {}} />);
  expect(document.getElementById(`fa-${ability}-frequency`)).toBeTruthy();
});

// A non-default threshold keeps the advanced Feel No Pain control visible
// without ticking Advanced. Options match Shoot: off, then 6+, 5+, 4+.
it('offers Feel No Pain thresholds of 4+, 5+, and 6+ only', () => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setProp('fnp', 4)} changeHandler={() => {}} />);
  const select = screen.getByRole('combobox', { name: /FeelNoPain/ }) as HTMLSelectElement;
  expect(Array.from(select.options).map(option => option.value)).toEqual(['X', '6+', '5+', '4+']);
});

it('offers an independent frequency only for enabled limited effects', () => {
  const model = new Model().setAbility(Ability.JustAScratch).setAbility(Ability.PuritySeal);
  function Harness() {
    const [fighter, setFighter] = React.useState(model);
    return <FighterControls idPrefix="fa" attacker={fighter} changeHandler={setFighter} />;
  }
  render(<Harness />);
  const scratch = screen.getByRole('combobox', {name: 'JaS (Crits): частота'});
  expect((scratch as HTMLSelectElement).value).toBe('each');
  expect(screen.queryByRole('combobox', {name: 'PreParry: частота'})).toBeNull();
  fireEvent.change(scratch, {target: {value: 'once'}});
  expect((scratch as HTMLSelectElement).value).toBe('once');
  expect((screen.getByRole('combobox', {name: 'PuritySeal: частота'}) as HTMLSelectElement).value).toBe('each');
  fireEvent.click(screen.getByLabelText('JaS (Crits)'));
  expect(screen.queryByRole('combobox', {name: 'JaS (Crits): частота'})).toBeNull();
});

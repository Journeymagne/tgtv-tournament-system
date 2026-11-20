import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Model from 'src/Model';
import Ability from 'src/Ability';
import FighterControls, { fighterBasicCheckboxes, fighterAdvancedCheckboxes } from 'src/components/FighterControls';
import { mutuallyExclusiveFightAbilities } from 'src/Ability';
import { frequencyLimitedFightAbilities } from 'src/FightEffectFrequency';
import { factionRulesFor } from './profileRules';

it.each([...fighterBasicCheckboxes, ...fighterAdvancedCheckboxes])('offers a frequency for $ability', box => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setAbility(box.ability)} changeHandler={() => {}} />);
  expect(screen.getByRole('combobox', {name: `${box.note.name}: частота`})).toBeTruthy();
});

it.each(factionRulesFor('fighter').filter(box => frequencyLimitedFightAbilities.includes(box.ability)))(
  'offers a faction frequency for enabled $ability', box => {
    render(<FighterControls idPrefix="fa" attacker={new Model().setAbility(box.ability)} changeHandler={() => {}} />);
    fireEvent.click(screen.getByRole('tab', {name: /Фракционные правила/}));
    expect(screen.getByRole('combobox', {name: `${box.note.name}: частота`})).toBeTruthy();
  });

it.each(mutuallyExclusiveFightAbilities.filter(ability => ability !== Ability.None && ability !== Ability.StealthAssault))('offers a frequency for niche rule %s', ability => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setAbility(ability)} changeHandler={() => {}} />);
  expect(document.getElementById(`fa-${ability}-frequency`)).toBeTruthy();
});

it('offers Feel No Pain thresholds of 4+, 5+, and 6+ only', () => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setProp('fnp', 4)} changeHandler={() => {}} />);
  const select = screen.getByRole('combobox', { name: /FeelNoPain/ }) as HTMLSelectElement;
  expect(Array.from(select.options).map(option => option.value)).toEqual(['X', '6+', '5+', '4+']);
});

it('offers an independent frequency only for enabled limited effects', () => {
  const model = new Model().setAbility(Ability.JustAScratchNorms).setAbility(Ability.PuritySeal);
  function Harness() {
    const [fighter, setFighter] = React.useState(model);
    return <FighterControls idPrefix="fa" attacker={fighter} changeHandler={setFighter} />;
  }
  render(<Harness />);
  const scratch = screen.getByRole('combobox', {name: 'Just a Scratch: частота'});
  expect((scratch as HTMLSelectElement).value).toBe('each');
  expect(screen.queryByRole('combobox', {name: 'PreParry: частота'})).toBeNull();
  fireEvent.change(scratch, {target: {value: 'once'}});
  expect((scratch as HTMLSelectElement).value).toBe('once');
  fireEvent.click(screen.getByRole('tab', {name: /Фракционные правила/}));
  expect((screen.getByRole('combobox', {name: 'PuritySeal: частота'}) as HTMLSelectElement).value).toBe('each');
  fireEvent.click(screen.getByRole('tab', {name: /Advanced/}));
  expect(screen.queryByRole('checkbox', {name: /JaS \(Crits\)/})).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', {name: 'Just a Scratch'}));
  expect(screen.queryByRole('combobox', {name: 'Just a Scratch: частота'})).toBeNull();
});

it('reaches faction help from the keyboard and keeps Stealth Assault exclusive with generic follow-ups', () => {
  function Harness() {
    const [fighter, setFighter] = React.useState(new Model().setAbility(Ability.StrikeStrike));
    return <FighterControls idPrefix="fa" attacker={fighter} changeHandler={setFighter}/>;
  }
  render(<Harness/>);
  const general = screen.getByRole('tab', {name: /Advanced/});
  const faction = screen.getByRole('tab', {name: /Фракционные правила/});
  const niche = document.getElementById('fa-NicheAbility') as HTMLSelectElement;
  expect([...niche.options].map(option => option.value)).not.toContain(Ability.StealthAssault);
  fireEvent.keyDown(general, {key: 'ArrowRight'});
  expect(document.activeElement).toBe(faction);
  expect(faction.getAttribute('aria-selected')).toBe('true');
  const info = screen.getByRole('button', {name: /Stealth Assault/});
  expect(info.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(info);
  const explanation = screen.getByRole('tooltip');
  expect(info.getAttribute('aria-describedby')).toBe(explanation.id);
  expect(explanation.textContent).toMatch(/Phobos/i);
  fireEvent.keyUp(document, {key: 'Escape', keyCode: 27});
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', {name: 'Stealth Assault'}));
  expect(niche.value).toBe(Ability.None);
  fireEvent.click(general);
  fireEvent.change(niche, {target: {value: Ability.CriticalStrike}});
  fireEvent.click(faction);
  expect((screen.getByRole('checkbox', {name: 'Stealth Assault'}) as HTMLInputElement).checked).toBe(false);
});

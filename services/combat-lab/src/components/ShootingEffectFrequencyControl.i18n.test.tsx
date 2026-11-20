import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import Ability from 'src/Ability';
import Model from 'src/Model';
import AttackerControls from './AttackerControls';
import DefenderControls from './DefenderControls';

it('translates shooting frequency labels, choices, and first-action explanation in both languages', () => {
  document.body.dataset.companionSection = 'combat';
  try {
    const world: any = {KTAppearance: {locale: 'en'}, addEventListener() {}};
    const context = vm.createContext({window: world, document, NodeFilter,
      MutationObserver: class { observe() {} }, queueMicrotask() {},
    });
    for (const file of ['../../../../public/companion-i18n.js', '../../public/companion-ui.js']) {
      vm.runInContext(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), context);
    }
    render(<>
      <AttackerControls idPrefix="a1" attacker={new Model().setAbility(Ability.PuritySeal)} changeHandler={() => {}} />
      <DefenderControls idPrefix="d1" defender={Model.basicDefender().setAbility(Ability.CurseOfRot)} changeHandler={() => {}} />
    </>);
    for (const tab of screen.getAllByRole('tab', {name: /Фракционные правила/})) fireEvent.click(tab);
    world.KTUI.translate();
    const frequency = screen.getByRole('combobox', {name: 'PuritySeal: frequency'});
    expect(within(frequency).getByRole('option', {name: 'Per shot'})).toBeTruthy();
    expect(within(frequency).getByRole('option', {name: 'Per series'})).toBeTruthy();
    expect(document.getElementById('d1-CurseOfRot-frequency')?.title).toBe('Every shot: this rule applies to every Shoot action. Once per series: this rule applies throughout the first Shoot action.');
    world.KTAppearance.locale = 'ru'; world.KTUI.translate();
    expect(screen.getByRole('combobox', {name: 'PuritySeal: частота'})).toBe(frequency);
    expect(within(frequency).getByRole('option', {name: 'За серию'})).toBeTruthy();
    expect(document.getElementById('d1-CurseOfRot-frequency')?.title).toBe('Каждая стрельба: правило действует в каждой стрельбе. Один раз за серию: правило действует всю первую стрельбу.');
  } finally { delete document.body.dataset.companionSection; }
});

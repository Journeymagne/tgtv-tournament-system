import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import Note, * as N from 'src/Notes';
import Ability, { mutuallyExclusiveFightAbilities } from 'src/Ability';
import Model from 'src/Model';
import { advancedMarkerTooltip } from 'src/components/AdvancedMarker';
import AttackerControls, { attackerNotedControls } from 'src/components/AttackerControls';
import DefenderControls, { defenderNotedControls } from 'src/components/DefenderControls';
import FightSection from 'src/components/FightSection';
import FighterControls, { fighterNotedControls } from 'src/components/FighterControls';
import NotesList from 'src/components/NotesList';
import ShootSection from 'src/components/ShootSection';
import { NotedControl, notesFromControls } from 'src/components/controlNotes';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver || ResizeObserverStub;

function hoverTexts(container: HTMLElement): Set<string> {
  const titles = new Set<string>();
  container.querySelectorAll('[title]').forEach(el => {
    const title = el.getAttribute('title');
    if (title && title !== advancedMarkerTooltip) titles.add(title);
  });
  return titles;
}

function showAdvanced(container: HTMLElement) {
  const input = [...container.querySelectorAll('input[type="checkbox"]')].find(el =>
    el.parentElement?.textContent?.includes('Advanced'),
  );
  if (!input) throw new Error('Advanced checkbox not found');
  fireEvent.click(input);
}

function expectHoversMatch(container: HTMLElement, controls: readonly NotedControl[]) {
  expect(hoverTexts(container)).toEqual(new Set(controls.map(control => control.note.description)));
}

function boldNoteNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('b')]
    .map(el => el.textContent || '')
    .filter(name => name !== '' && name !== 'Advanced');
}

function notesPanelBody(): HTMLElement {
  const title = screen.getByText('Правила и пояснения');
  const body = title.parentElement;
  if (!body) throw new Error('Notes panel body not found');
  return body as HTMLElement;
}

function namesInPanelOrder(notes: readonly Note[], advancedNotes: ReadonlySet<Note>): string[] {
  return [
    ...notes.filter(note => !advancedNotes.has(note)),
    ...notes.filter(note => advancedNotes.has(note)),
  ].map(note => note.name);
}

describe('notes panels follow the controls', () => {
  it('fight card hovers are exactly the fighter note catalog', () => {
    const { container } = render(<FighterControls idPrefix="fa" attacker={new Model()} changeHandler={() => {}} />);
    showAdvanced(container);
    expectHoversMatch(container, fighterNotedControls);
  });

  it('shoot attacker and defender hovers are exactly their note catalogs', () => {
    const attacker = render(<AttackerControls idPrefix="s1-atk" attacker={new Model()} changeHandler={() => {}} />);
    showAdvanced(attacker.container);
    expectHoversMatch(attacker.container, attackerNotedControls);
    attacker.unmount();

    const defender = render(<DefenderControls idPrefix="s1-def" defender={Model.basicDefender()} changeHandler={() => {}} />);
    showAdvanced(defender.container);
    expectHoversMatch(defender.container, defenderNotedControls);
  });

  it('fight Notes lists each fighter control and not the niche-dropdown values as their own rules', () => {
    const { notes, advancedNotes } = notesFromControls(fighterNotedControls);
    const { container } = render(
      <NotesList notes={notes} advancedNotes={advancedNotes} />,
    );
    expect(boldNoteNames(container)).toEqual(namesInPanelOrder(notes, advancedNotes));
    expect(notes).not.toContain(N.CloseAssault2021);
    expect(N.NicheAbility.description).toContain('CloseAssault is');
    expect(N.NicheAbility.description).toContain('Waaagh2021');
    for (const note of [
      N.Punishing,
      N.Duelist,
      N.JustAScratch2021,
      N.JustAScratchNorms,
      N.HalfDamageFirstStrike,
      N.NormsToCrits,
      N.FailsToNorms,
      N.FeelNoPain,
    ]) {
      expect(notes).toContain(note);
      expect(advancedNotes.has(note)).toBe(true);
    }
  });

  it('NicheAbility note names every dropdown value exactly as the dropdown shows it', () => {
    for (const value of mutuallyExclusiveFightAbilities) {
      if (value === Ability.None) continue;
      expect(N.NicheAbility.description).toContain(`${value} is `);
    }
  });

  it('shoot Notes lists Punishing and FailsToNorms, and keeps Punishing basic', () => {
    const { notes, advancedNotes } = notesFromControls([
      ...attackerNotedControls,
      ...defenderNotedControls,
    ]);
    expect(notes).toContain(N.Punishing);
    expect(notes).toContain(N.FailsToNorms);
    expect(notes).toContain(N.Indomitus);
    expect(advancedNotes.has(N.Punishing)).toBe(false);
    expect(advancedNotes.has(N.FailsToNorms)).toBe(true);
    expect(advancedNotes.has(N.Indomitus)).toBe(false);
    expect(notes.filter(note => note === N.Reroll)).toHaveLength(1);
    expect(notes.filter(note => note === N.NormsToCrits)).toHaveLength(1);
  });

  it('renders the derived fight and shoot Notes panels', () => {
    const fight = render(<MemoryRouter><FightSection isActive={false} /></MemoryRouter>);
    const fightNotes = notesPanelBody();
    const fightDerived = notesFromControls(fighterNotedControls);
    expect(boldNoteNames(fightNotes)).toEqual(namesInPanelOrder(fightDerived.notes, fightDerived.advancedNotes));
    expect(boldNoteNames(fightNotes)).not.toContain(N.CloseAssault2021.name);
    expect(boldNoteNames(fightNotes)).not.toContain('Waaagh2021');
    expect(fightNotes.textContent).toContain('CloseAssault is Imperial Navy');
    expect(fightNotes.textContent).toContain('Waaagh2021 is Kommandos');
    expect(fightNotes.textContent).toContain('All strategies will do certain no-downside actions');
    expect(fightNotes.textContent).toContain('The next-strike kill check is an estimate');
    expect(fightNotes.textContent).toContain('can miss a kill that depends on a failed Feel No Pain or relic roll');
    expect(fightNotes.textContent).toContain('The parry-then-kill check is the same kind of estimate');
    expect(fightNotes.textContent).toContain('Balanced and Relentless will not reroll a normal success even if it would be wise to do so');
    fight.unmount();

    const shootView = render(<MemoryRouter><ShootSection isActive={false} /></MemoryRouter>);
    const shootNotes = notesPanelBody();
    const shoot = notesFromControls([...attackerNotedControls, ...defenderNotedControls]);
    expect(boldNoteNames(shootNotes)).toEqual([
      N.AvgDamageUnbounded.name,
      ...namesInPanelOrder(shoot.notes, shoot.advancedNotes),
    ]);
    const advancedHeader = within(shootNotes).getByText(/only shown when/i);
    const punishing = within(shootNotes).getByText('Punishing');
    const fails = within(shootNotes).getByText('FailsToNorms');
    expect(
      (punishing.compareDocumentPosition(advancedHeader) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
    expect(
      (advancedHeader.compareDocumentPosition(fails) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
    shootView.unmount();
  });
});

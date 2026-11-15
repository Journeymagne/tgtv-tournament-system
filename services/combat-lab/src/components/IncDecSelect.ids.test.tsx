import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FightSection from 'src/components/FightSection';
import ShootSection from 'src/components/ShootSection';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

// App keeps Shoot and Fight mounted and only toggles display. Labels resolve
// with getElementById, which returns the first match, including one inside
// display:none.
function renderCalculators() {
  // The share hooks inside both sections read the router, as they do in the app.
  return render(
    <MemoryRouter>
      <div data-testid="shoot" style={{ display: 'none' }}>
        <ShootSection isActive={false} />
      </div>
      <div data-testid="fight" style={{ display: 'block' }}>
        <FightSection isActive={false} />
      </div>
    </MemoryRouter>,
  );
}

function assertLabelsPointAtTheirOwnSelect(container: HTMLElement) {
  const selects = [...container.querySelectorAll('select')];
  const ids = selects.map(select => select.id);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);

  for (const label of container.querySelectorAll('label')) {
    const ownSelect = label.parentElement?.querySelector('select');
    if (!ownSelect) {
      continue;
    }
    expect(label.htmlFor).toBe(ownSelect.id);
    expect(document.getElementById(label.htmlFor)?.id).toBe(ownSelect.id);
    expect(label.textContent ?? '').not.toMatch(/^(s[12]-(atk|def|opt)|fa|fb|fo)-/);
  }
}

// Both ids must exist and be different elements. A bare
// expect(a).not.toBe(b) passes when either lookup returns null.
function expectDistinctControls(idA: string, idB: string) {
  const a = document.getElementById(idA);
  const b = document.getElementById(idB);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(a).not.toBe(b);
}

function showAdvanced(container: HTMLElement) {
  // Click the label text, as a user does; it must be tied to its own box.
  const labels = [...container.querySelectorAll('label')].filter(label =>
    (label.textContent ?? '').trim().startsWith('Advanced'));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    fireEvent.click(label);
  }
}

// Every checkbox label must be tied (htmlFor) to the box beside it, by an id no other
// element on the page shares, so clicking the text ticks that box and no other.
function assertCheckboxLabelsTickTheirOwnBox(container: HTMLElement) {
  const boxes = [...container.querySelectorAll<HTMLInputElement>('.form-check input[type="checkbox"]')];
  expect(boxes.length).toBeGreaterThan(0);
  const ids = boxes.map(box => box.id);
  expect(ids.every(id => id !== '')).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);

  for (const box of boxes) {
    const label = box.parentElement!.querySelector('label')!;
    expect(label.htmlFor).toBe(box.id);
    expect(document.getElementById(box.id)).toBe(box);
  }
}

describe('mounted IncDecSelect ids', () => {
  it('keeps every label on its own select across both calculators', () => {
    const { container, getByTestId } = renderCalculators();
    assertLabelsPointAtTheirOwnSelect(container);

    const shoot = getByTestId('shoot');
    const fight = getByTestId('fight');
    expectDistinctControls('s1-atk-Attacks', 's2-atk-Attacks');
    expect(document.getElementById('s1-atk-Normal Dmg')).not.toBeNull();
    expectDistinctControls('s1-def-Wounds', 's2-def-Wounds');
    expectDistinctControls('s1-opt-Rounds', 's2-opt-Rounds');
    expectDistinctControls('fa-Attacks', 'fb-Attacks');
    expectDistinctControls('fa-Wounds', 's1-def-Wounds');
    expectDistinctControls('fo-Rounds', 's1-opt-Rounds');
    expect(document.getElementById('fo-Fighter A Strategy')).not.toBeNull();
    const goesFirst = document.getElementById('fo-Goes first') as HTMLSelectElement | null;
    expect(goesFirst).not.toBeNull();
    expect(goesFirst!.id.includes('/')).toBe(false);
    expect([...goesFirst!.options].map(option => option.value)).toEqual(['A', 'B']);
    expect(fight.querySelector('label[for="fo-Goes first"]')?.textContent).toBe('Goes first');
    expect(document.getElementById('fo-Attacker/FirstActer')).toBeNull();

    const fightAttacks = document.getElementById('fa-Attacks');
    expect(fight.contains(fightAttacks)).toBe(true);
    expect(shoot.contains(fightAttacks)).toBe(false);
    expect(fight.querySelector('label[for="fa-Attacks"]')?.getAttribute('for')).toBe('fa-Attacks');

    expect(shoot.querySelector('label[for="s1-atk-Attacks"]')).not.toBeNull();
    expect(shoot.querySelector('label[for="s2-atk-Attacks"]')).not.toBeNull();

    assertCheckboxLabelsTickTheirOwnBox(container);
    showAdvanced(container);
    assertLabelsPointAtTheirOwnSelect(container);
    assertCheckboxLabelsTickTheirOwnBox(container);
    expectDistinctControls('s1-atk-Reroll', 's1-def-Reroll');
    expectDistinctControls('s2-atk-FailsToNorms', 's2-def-FailsToNorms');
    expectDistinctControls('fa-FailsToNorms', 'fb-FailsToNorms');
    expectDistinctControls('s1-def-NormsToCrits', 'fa-NormsToCrits');
  });
});

describe('ability checkbox labels', () => {
  it('ticks and unticks only their own box when the text is clicked', () => {
    const { container } = renderCalculators();
    for (const id of ['s1-def-CurseOfRot', 's2-def-CurseOfRot', 's1-atk-Rending', 'fb-Rending']) {
      const box = document.getElementById(id) as HTMLInputElement;
      const label = container.querySelector(`label[for="${id}"]`)!;
      const othersBefore = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
        .filter(other => other !== box).map(other => other.checked);

      fireEvent.click(label);
      expect(box.checked).toBe(true);
      const othersAfter = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
        .filter(other => other !== box).map(other => other.checked);
      expect(othersAfter).toEqual(othersBefore);

      fireEvent.click(label);
      expect(box.checked).toBe(false);
    }
  });
});

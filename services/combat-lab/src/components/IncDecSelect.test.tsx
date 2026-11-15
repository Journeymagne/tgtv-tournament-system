import React from 'react';
import { render, within } from '@testing-library/react';
import IncDecSelect, { IProps } from 'src/components/IncDecSelect';

function renderSelect(extra: Partial<IProps>) {
  render(
    <IncDecSelect
      id="Thing"
      values={['0', '1']}
      selectedValue="0"
      valueChangeHandler={() => {}}
      {...extra}
    />,
  );
  return document.querySelector('label')!;
}

describe('IncDecSelect label marker', () => {
  it('shows the gear (and no star) for an advanced param', () => {
    const label = renderSelect({ advanced: true, hoverText: 'some note' });
    expect(within(label).queryByLabelText('advanced option')).not.toBeNull();
    expect(label.textContent).not.toContain('*');
  });

  it('shows a star (and no gear) for a basic note-backed param', () => {
    const label = renderSelect({ hoverText: 'some note' });
    expect(within(label).queryByLabelText('advanced option')).toBeNull();
    expect(label.textContent).toContain('*');
  });

  it('shows no marker for a basic param without a note', () => {
    const label = renderSelect({});
    expect(within(label).queryByLabelText('advanced option')).toBeNull();
    expect(label.textContent).not.toContain('*');
  });
});

describe('IncDecSelect ids', () => {
  it('prefixes the DOM id so each label points at its own select', () => {
    const { container } = render(
      <>
        <IncDecSelect
          id="Attacks"
          idPrefix="s1-atk"
          values={['1', '2']}
          selectedValue="1"
          valueChangeHandler={() => {}}
        />
        <IncDecSelect
          id="Attacks"
          idPrefix="s2-atk"
          values={['1', '2']}
          selectedValue="2"
          valueChangeHandler={() => {}}
        />
        <IncDecSelect
          id="Normal Dmg"
          idPrefix="s1-atk"
          values={['3', '4']}
          selectedValue="3"
          valueChangeHandler={() => {}}
        />
      </>,
    );

    const labels = [...container.querySelectorAll('label')];
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[];
    expect(labels.map(label => label.textContent)).toEqual(['Attacks', 'Attacks', 'Normal Dmg']);
    expect(selects.map(select => select.id)).toEqual([
      's1-atk-Attacks',
      's2-atk-Attacks',
      's1-atk-Normal Dmg',
    ]);
    expect(labels.map(label => label.htmlFor)).toEqual(selects.map(select => select.id));
    // name stays the stat name; only id/htmlFor need to be unique.
    expect(selects.map(select => select.name)).toEqual(['Attacks', 'Attacks', 'Normal Dmg']);

    // Browsers resolve label.htmlFor with getElementById, which returns the first
    // match. jsdom does not focus the control on label click, so assert that lookup.
    for (const label of labels) {
      const ownSelect = label.parentElement!.querySelector('select')!;
      expect(document.getElementById(label.htmlFor)?.id).toBe(ownSelect.id);
    }
  });
});

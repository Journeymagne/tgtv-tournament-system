import React from 'react';
import { render, screen } from '@testing-library/react';
import Model from 'src/Model';
import FighterControls from 'src/components/FighterControls';

// A non-default threshold keeps the advanced Feel No Pain control visible
// without ticking Advanced. Options match Shoot: off, then 6+, 5+, 4+.
it('offers Feel No Pain thresholds of 4+, 5+, and 6+ only', () => {
  render(<FighterControls idPrefix="fa" attacker={new Model().setProp('fnp', 4)} changeHandler={() => {}} />);
  const select = screen.getByRole('combobox', { name: /FeelNoPain/ }) as HTMLSelectElement;
  expect(Array.from(select.options).map(option => option.value)).toEqual(['X', '6+', '5+', '4+']);
});

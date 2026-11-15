import React from 'react';
import {render, screen, within} from '@testing-library/react';
import Model from 'src/Model';
import CombinedShootResults from './CombinedShootResults';

it('combines the separately selected saves and uses S1 wounds, excluding kills and the half-wounds boundary from injury', () => {
  const first = new Map([[2, new Map([[0, 0.5], [4, 0.5]])], [3, new Map([[0, 1]])]]);
  const second = new Map([[5, new Map([[0, 0.5], [6, 0.5]])], [3, new Map([[0, 1]])]]);
  const defender1 = Model.basicDefender().withProp('diceStat', 2).withProp('wounds', 8);
  const defender2 = Model.basicDefender().withProp('diceStat', 5).withProp('wounds', 30);
  render(<CombinedShootResults first={first} second={second} defender1={defender1} defender2={defender2}/>);
  const result = within(screen.getByRole('region', {name: 'Ситуация 1 + 2'}));
  // Hand-derived total: damage 0, 4, 6 and 10 each have probability 1/4.
  expect(result.getByText('Средний урон').nextElementSibling?.textContent).toBe('5.00');
  expect(result.getByText('Вероятность убийства').nextElementSibling?.textContent).toBe('25.00%');
  expect(result.getByText('Вероятность ранения').nextElementSibling?.textContent).toBe('25.00%');
  expect(result.getByText('Раны цели из ситуации 1:').parentElement?.textContent).toContain('8');
});

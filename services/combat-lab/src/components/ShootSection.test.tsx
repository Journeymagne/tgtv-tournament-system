import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ShareProvider} from 'src/context/ShareContext';
import ShootSection from './ShootSection';

it('retains S2 inputs while collapsed and supports copying S1 into the collapsed situation', () => {
  jest.useFakeTimers();
  try {
    render(<MemoryRouter><ShareProvider><ShootSection isActive/></ShareProvider></MemoryRouter>);
    const attacks2 = document.getElementById('s2-atk-Attacks') as HTMLSelectElement;
    fireEvent.change(attacks2, {target: {value: '6'}});
    fireEvent.click(screen.getByRole('button', {name: 'Свернуть ситуацию 2'}));
    expect(attacks2.closest('[hidden]')).not.toBeNull();
    expect(attacks2.value).toBe('6');
    fireEvent.change(document.getElementById('s1-atk-Attacks')!, {target: {value: '5'}});
    fireEvent.click(screen.getByRole('button', {name: 'Скопировать A'}));
    fireEvent.click(screen.getByRole('button', {name: 'Развернуть ситуацию 2'}));
    expect(attacks2.closest('[hidden]')).toBeNull();
    expect(attacks2.value).toBe('5');
  } finally { jest.useRealTimers(); }
});

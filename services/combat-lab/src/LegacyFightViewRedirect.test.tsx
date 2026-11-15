import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import LegacyFightViewRedirect from './LegacyFightViewRedirect';

function Probe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderAt(entry: string) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="*"
          element={
            <LegacyFightViewRedirect>
              <Probe />
            </LegacyFightViewRedirect>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

it('sends a legacy fight link to /fight/ and keeps the share params', () => {
  renderAt('/?view=fight&fa=12%3A4&fb=8&fo=1');
  expect(screen.getByTestId('location').textContent).toBe('/fight/?fa=12%3A4&fb=8&fo=1');
});

it('leaves the shoot calculator on /', () => {
  renderAt('/?view=shoot&a1=4%3A3');
  expect(screen.getByTestId('location').textContent).toBe('/?view=shoot&a1=4%3A3');
});

it('leaves /fight share links in place', () => {
  renderAt('/fight?fa=12%3A4&fb=8');
  expect(screen.getByTestId('location').textContent).toBe('/fight?fa=12%3A4&fb=8');
});

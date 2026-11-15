import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { render, screen, fireEvent } from '@testing-library/react';

import AuspexPromo from 'src/components/AuspexPromo';

afterEach(() => {
  window.localStorage.clear();
});

it('links to Auspex Fatalis in a new tab', () => {
  render(<AuspexPromo />);
  const link = screen.getByRole('link', { name: /Start a league/i });
  expect(link.getAttribute('href')).toMatch(/^https:\/\/auspexfatalis\.com\//);
  expect(link.getAttribute('target')).toBe('_blank');
});

it('hides and stays hidden after dismissal', () => {
  const { unmount } = render(<AuspexPromo />);
  fireEvent.click(screen.getByRole('button', { name: /Hide the Auspex Fatalis banner/i }));
  expect(screen.queryByRole('link', { name: /Start a league/i })).toBeNull();
  unmount();

  render(<AuspexPromo />);
  expect(screen.queryByRole('link', { name: /Start a league/i })).toBeNull();
});

it('starts visible so hydration matches the prerendered banner', () => {
  window.localStorage.setItem('auspexPromoDismissed', '1');
  const html = ReactDOMServer.renderToString(<AuspexPromo />);
  expect(html).toMatch(/Start a league/);
});

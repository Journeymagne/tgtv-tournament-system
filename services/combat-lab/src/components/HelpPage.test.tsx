import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HelpPage from 'src/components/HelpPage';

// Smoke tests for the /help hub. Guards that the page renders and that every doc
// it advertises stays an in-app route (no accidental GitHub/external links, and
// no broken hrefs after refactors).
function renderHelp() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );
}

describe('HelpPage', () => {
  it('renders the hub heading', () => {
    renderHelp();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('How KT Calc works');
  });

  it('links to all nine in-app docs', () => {
    renderHelp();
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    [
      '/notes/lethal-relentless',
      '/notes/mystic-scry-buff',
      '/notes/punishing',
      '/rules/combat',
      '/rules/fight',
      '/rules/weapon',
      '/rules/retained-vs-modified',
      '/rules/cover-saves',
      '/rules/weapon-balance',
    ].forEach((href) => expect(hrefs).toContain(href));
  });

  it('keeps the docs in-app (no external/GitHub links)', () => {
    renderHelp();
    const external = screen.getAllByRole('link').filter((a) => /^https?:/.test(a.getAttribute('href') || ''));
    expect(external).toHaveLength(0);
  });
});

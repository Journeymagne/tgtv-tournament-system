import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MysticScryBuffNote from 'src/components/notes/MysticScryBuffNote';

// Smoke + content tests for the /notes/mystic-scry-buff explainer page. The engine behavior it
// documents (the seed/feed Rending cases) is covered in CalcEngineCommon.test.ts; these tests
// guard the page itself so the footer link / route does not silently break.
function renderNote() {
  return render(
    <MemoryRouter>
      <MysticScryBuffNote />
    </MemoryRouter>,
  );
}

describe('MysticScryBuffNote', () => {
  it('renders the heading and names the in-game ability', () => {
    renderNote();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Mystic Scry Buff');
    // getByText throws if the text is absent, so this asserts the in-game credit is documented.
    expect(screen.getByText(/"Mystic Scry" ability/)).toBeTruthy();
  });

  it('documents both Rending cases: seed a crit when you have none, feed a norm when you do', () => {
    renderNote();
    expect(screen.getByText(/seed one so Rending can fire/i)).toBeTruthy();  // Case A: {0c,2n} -> {2c,0n}
    expect(screen.getByText(/feed Rending a norm instead/i)).toBeTruthy();   // Case B: {1c,1n,1f} -> {2c,1n}
  });

  it('links back to the calculator at the top and bottom', () => {
    renderNote();
    const backLinks = screen.getAllByRole('link', { name: /Back to calculator/i });
    expect(backLinks).toHaveLength(2);
    backLinks.forEach(link => expect(link.getAttribute('href')).toBe('/'));
  });
});

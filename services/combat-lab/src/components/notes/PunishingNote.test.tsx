import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PunishingNote from 'src/components/notes/PunishingNote';

// Smoke + content tests for the /notes/punishing explainer. The engine behavior it documents (the
// decline-when-it-would-starve-a-promotion case) is covered in CalcEngineCommon.test.ts; these
// guard the page itself so the route and help-hub link cannot silently break.
function renderNote() {
  return render(
    <MemoryRouter>
      <PunishingNote />
    </MemoryRouter>,
  );
}

// The prose is peppered with <em>/<strong>, which splits sentences across elements and makes
// getByText unreliable. Assert against the whole rendered text instead, with whitespace collapsed.
function pageText(): string {
  return (document.body.textContent || '').replace(/\s+/g, ' ');
}

describe('PunishingNote', () => {
  it('renders the heading', () => {
    renderNote();
    expect(screen.getByRole('heading', { level: 1 }).textContent)
      .toContain('Punishing can lower your damage');
  });

  it('states the rule the whole thing rests on', () => {
    renderNote();
    expect(pageText()).toMatch(/a dice can only be retained once/i);
  });

  it('names all three ingredients the paradox needs', () => {
    renderNote();
    const text = pageText();
    expect(text).toMatch(/exactly one fail/i);
    expect(text).toMatch(/promotable normal/i);
    expect(text).toMatch(/no other normal to work on/i);
  });

  it('shows the counter-case where taking Punishing is right', () => {
    renderNote();
    // the two-fail row is the control that proves scarcity is the cause, not Punishing itself
    expect(pageText()).toMatch(/Add a second fail and the conflict disappears/i);
  });

  it('says the shoot score skips Feel No Pain and Saintly Relics', () => {
    renderNote();
    expect(pageText()).toMatch(
      /The shoot score includes saves, cover, and Piercing, and does not include Feel No Pain or Saintly Relics/,
    );
  });

  it('links to the retained-vs-modified rules page', () => {
    renderNote();
    const link = screen.getByRole('link', { name: /Retained vs Modified Dice/i });
    expect(link.getAttribute('href')).toBe('/rules/retained-vs-modified');
  });

  it('links back to the calculator at the top and bottom', () => {
    renderNote();
    const backLinks = screen.getAllByRole('link', { name: /Back to calculator/i });
    expect(backLinks).toHaveLength(2);
    backLinks.forEach((link) => expect(link.getAttribute('href')).toBe('/'));
  });
});

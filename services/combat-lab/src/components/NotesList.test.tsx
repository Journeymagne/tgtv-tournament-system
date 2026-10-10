import React from 'react';
import { render, screen } from '@testing-library/react';
import NotesList from 'src/components/NotesList';
import Note from 'src/Notes';

const alpha = new Note('Alpha', 'alpha desc');
const bravo = new Note('Bravo', 'bravo desc');
const charlie = new Note('Charlie', 'charlie desc');

// true when `a` comes before `b` in document order
const before = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('NotesList', () => {
  it('renders each note as a bold name over its description, not a list item', () => {
    render(<NotesList notes={[alpha]} />);
    const name = screen.getByText('Alpha');
    expect(name.tagName).toBe('B');
    expect(name.closest('li')).toBeNull();
    expect(screen.getByText('alpha desc')).toBeTruthy();
  });

  it('splits notes into a Basic group and an Advanced section', () => {
    render(<NotesList notes={[alpha, bravo, charlie]} advancedNotes={new Set([bravo])} />);
    const advHeader = screen.getByText(/only shown when/i);
    // basic notes precede the advanced header; the advanced note follows it
    expect(before(screen.getByText('Alpha'), advHeader)).toBe(true);
    expect(before(screen.getByText('Charlie'), advHeader)).toBe(true);
    expect(before(advHeader, screen.getByText('Bravo'))).toBe(true);
  });

  it('renders no Advanced section when nothing is advanced', () => {
    render(<NotesList notes={[alpha, bravo]} />);
    expect(screen.queryByText(/only shown when/i)).toBeNull();
  });

  it('renders leading children', () => {
    render(
      <NotesList notes={[alpha]} advancedNotes={new Set([alpha])}>
        <li>Lead item</li>
      </NotesList>,
    );
    expect(screen.getByText('Lead item')).toBeTruthy();
  });
});

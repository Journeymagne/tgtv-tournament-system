import Note from 'src/Notes';
import { notesFromControls } from 'src/components/controlNotes';

const alpha = new Note('Alpha', 'alpha desc');
const bravo = new Note('Bravo', 'bravo desc');

describe('notesFromControls', () => {
  it('keeps one entry and leaves a rule basic when any control for it is always visible', () => {
    const { notes, advancedNotes } = notesFromControls([
      { note: alpha, advanced: true },
      { note: bravo, advanced: true },
      { note: alpha, advanced: false },
    ]);
    expect(notes).toEqual([alpha, bravo]);
    expect(advancedNotes.has(alpha)).toBe(false);
    expect(advancedNotes.has(bravo)).toBe(true);
  });

  it('does not move a basic rule into Advanced when a later control hides it', () => {
    const { notes, advancedNotes } = notesFromControls([
      { note: alpha, advanced: false },
      { note: alpha, advanced: true },
    ]);
    expect(notes).toEqual([alpha]);
    expect(advancedNotes.has(alpha)).toBe(false);
  });
});

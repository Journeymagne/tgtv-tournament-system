import React from 'react';
import Note from 'src/Notes';
import * as T from 'src/theme';
import { advancedMarkerChar } from 'src/components/AdvancedMarker';

// The Notes panel is split into a "Basic" section and an "Advanced" section. The advanced section
// collects the rules whose control only appears once the per-panel "Advanced" checkbox is ticked, so
// they line up with the gear-marked controls. FightSection and ShootSection pass the set derived
// from the same param and checkbox catalogs those panels render.

export interface NotesListProps {
  notes: Note[];
  // Subset of `notes` whose control only appears when "Advanced" is enabled.
  advancedNotes?: ReadonlySet<Note>;
  // Extra <li> items rendered before the ability notes (e.g. general notes).
  children?: React.ReactNode;
}

const sectionHeaderStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: T.textMuted,
  margin: '0 0 6px',
};

const advancedHeaderStyle: React.CSSProperties = {
  ...sectionHeaderStyle,
  borderTop: `1px solid ${T.hairline}`,
  margin: '16px 0 6px',
  paddingTop: '10px',
};

// The explanation after "Advanced —" reads as a sentence, not a label.
const sentenceStyle: React.CSSProperties = { textTransform: 'none', letterSpacing: 0, fontWeight: 400 };

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '10px 28px',
};

// Each note renders as a plain block: bold name on top, description on the line below (no bullets).
function renderNotes(list: Note[]) {
  return (
    <div style={gridStyle}>
      {list.map(note => (
        <div key={note.name}>
          <b>{note.name}</b>
          <div style={{ color: T.textBody, textWrap: 'pretty' } as React.CSSProperties}>{note.description}</div>
        </div>
      ))}
    </div>
  );
}

const NotesList: React.FC<NotesListProps> = ({ notes, advancedNotes, children }) => {
  const advancedList = advancedNotes ? notes.filter(note => advancedNotes.has(note)) : [];
  const basicList = advancedNotes ? notes.filter(note => !advancedNotes.has(note)) : notes;
  const hasAdvanced = advancedList.length > 0;
  const hasBasic = basicList.length > 0 || !!children;

  // No advanced rules: render a single group (unchanged behavior).
  if (!hasAdvanced) {
    return (
      <>
        {children && <ul style={{ marginBottom: '8px' }}>{children}</ul>}
        {renderNotes(basicList)}
      </>
    );
  }

  return (
    <>
      {hasBasic &&
        <>
          <div style={sectionHeaderStyle}>Basic</div>
          {children && <ul style={{ marginBottom: '8px' }}>{children}</ul>}
          {renderNotes(basicList)}
        </>
      }
      <div style={advancedHeaderStyle}>
        <span aria-hidden="true">{advancedMarkerChar}</span> Advanced{' '}
        <span style={sentenceStyle}>— only shown when the <b>Advanced</b> checkbox is ticked</span>
      </div>
      {renderNotes(advancedList)}
    </>
  );
};

export default NotesList;

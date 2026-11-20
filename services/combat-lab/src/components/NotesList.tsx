import React from 'react';
import Note from 'src/Notes';
import * as T from 'src/theme';
import {useEnglishRules} from './ProfileControls';
import {ruleDescription} from './profileRules';

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

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
  gap: '10px 28px',
};

// Each note renders as a plain block: bold name on top, description on the line below (no bullets).
function renderNotes(list: Note[], english: boolean) {
  return (
    <div style={gridStyle}>
      {list.map(note => (
        <div key={note.name}>
          <b>{note.name}</b>
          <div style={{ color: T.textBody, textWrap: 'pretty' } as React.CSSProperties}>{ruleDescription(note, english)}</div>
        </div>
      ))}
    </div>
  );
}

const NotesList: React.FC<NotesListProps> = ({ notes, advancedNotes, children }) => {
  const english = useEnglishRules();
  const advancedList = advancedNotes ? notes.filter(note => advancedNotes.has(note)) : [];
  const basicList = advancedNotes ? notes.filter(note => !advancedNotes.has(note)) : notes;
  const hasAdvanced = advancedList.length > 0;
  const hasBasic = basicList.length > 0 || !!children;

  // No advanced rules: render a single group (unchanged behavior).
  if (!hasAdvanced) {
    return (
      <>
        {children && <ul style={{ marginBottom: '8px' }}>{children}</ul>}
        {renderNotes(basicList, english)}
      </>
    );
  }

  return (
    <>
      {hasBasic &&
        <>
          <div style={sectionHeaderStyle}>Basic</div>
          {children && <ul style={{ marginBottom: '8px' }}>{children}</ul>}
          {renderNotes(basicList, english)}
        </>
      }
      <div style={advancedHeaderStyle}>
        Advanced / Фракционные правила
      </div>
      {renderNotes(advancedList, english)}
    </>
  );
};

export default NotesList;

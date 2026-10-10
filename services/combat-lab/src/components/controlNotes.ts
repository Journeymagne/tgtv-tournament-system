import Ability from 'src/Ability';
import Note from 'src/Notes';
import type { Props as IncProps } from 'src/components/IncDecSelect';

// A control that carries a Notes-panel explanation. `advanced` means the control stays hidden
// until that panel's Advanced checkbox is ticked.
export interface NotedControl {
  note: Note;
  advanced: boolean;
}

// One IncDecSelect control. `label` is exactly what the control is built with: a Note gives it
// hover text and a Notes entry, a plain string gives neither. One field drives both, so the card
// and the Notes panel cannot disagree about which params are explained.
export interface ParamSpec<Id extends string = string> {
  id: Id;
  label: string | Note;
  advanced: boolean;
}

export interface AbilityCheckbox {
  note: Note;
  ability: Ability;
  // Visible label when it should not be the note's name (the Obscured checkbox).
  label?: string;
}

// Builds every spec in order and splits basic from advanced. Advanced params are flagged so they
// show the gear marker.
export function buildParams<Id extends string>(
  specs: readonly ParamSpec<Id>[],
  build: (spec: ParamSpec<Id>) => IncProps,
): { basicParams: IncProps[]; advancedParams: IncProps[] } {
  const basicParams: IncProps[] = [];
  const advancedParams: IncProps[] = [];
  for (const spec of specs) {
    const param = build(spec);
    if (spec.advanced) {
      param.advanced = true;
      advancedParams.push(param);
    } else {
      basicParams.push(param);
    }
  }
  return { basicParams, advancedParams };
}

// Notes for the param specs that are labelled with a Note, in spec order.
export function notedControlsFromParams<Id extends string>(specs: readonly ParamSpec<Id>[]): NotedControl[] {
  const out: NotedControl[] = [];
  for (const spec of specs) {
    if (spec.label instanceof Note) out.push({ note: spec.label, advanced: spec.advanced });
  }
  return out;
}

export function notedControlsFromCheckboxes(boxes: readonly AbilityCheckbox[], advanced: boolean): NotedControl[] {
  return boxes.map(box => ({ note: box.note, advanced }));
}

// One Notes entry per Note, in first-seen order. A rule that is also an always-visible control
// stays in the Basic section even if another panel hides the same rule behind Advanced.
export function notesFromControls(controls: readonly NotedControl[]): { notes: Note[]; advancedNotes: Set<Note> } {
  const notes: Note[] = [];
  const advancedNotes = new Set<Note>();
  const seen = new Set<Note>();
  for (const control of controls) {
    if (!seen.has(control.note)) {
      seen.add(control.note);
      notes.push(control.note);
      if (control.advanced) advancedNotes.add(control.note);
    } else if (!control.advanced) {
      advancedNotes.delete(control.note);
    }
  }
  return { notes, advancedNotes };
}

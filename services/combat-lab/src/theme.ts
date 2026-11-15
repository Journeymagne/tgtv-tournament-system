// Single source of truth for the app's visual system.
//
// One container vocabulary (the dark-title "panel", see components/Panel.tsx)
// is used everywhere. Colors that double as inline styles (the comparison
// matrix builds <td> styles in JS) live here so they can't drift from the CSS.

// Brand surface — matches the black AppHeader + orange icon accent.
export const dark = 'var(--panel-2)';      // #252b32 — panel title bars, primary borders
export const darkHover = 'var(--panel-3)'; // #343a40
export const accent = 'var(--accent)';          // orange, used sparingly for emphasis only

// Borders
export const borderStrong = 'var(--line-strong)';
export const borderMuted = 'var(--line)';
export const borderFaint = 'var(--line)';  // hairline rules (e.g. footer divider)

// Surfaces
export const panelBg = 'var(--panel)';
export const mutedBg = 'var(--panel-3)';

// Text — all AA-compliant (>=4.5:1) on white.
export const textInk = 'var(--ink)';     // primary text
export const textMuted = 'var(--muted)';   // secondary text (~7:1)
export const textFaint = 'var(--quiet)';   // de-emphasized but still AA (~5.9:1); for zeroed cells
export const error = 'var(--danger)';       // error/failure states (e.g. a doc that failed to load)

// Comparison-cell fills (better / worse / equal) + zebra-darker variants.
export const better = 'var(--me-soft)';
export const worse = 'var(--opp-soft)';
export const equal = 'var(--panel-2)';
export const betterAlt = 'var(--me-soft)';
export const worseAlt = 'var(--opp-soft)';
export const equalAlt = 'var(--panel-3)';

// Table zebra + wound-column striping.
export const zebraEven = 'var(--panel)';
export const zebraOdd = 'var(--panel-2)';
export const wColEven = 'var(--panel-2)';
export const wColOdd = 'var(--panel-3)';
export const labelCellBg = 'var(--panel-3)';

// Quieter secondary chrome (UI cleanup): hairlines, soft boxes, light headers.
export const hairline = 'var(--line)';        // internal dividers
export const borderSoft = 'var(--line)';      // secondary boxes (results list, matrix, alt tools)
export const subtleBg = 'var(--panel-2)';        // light table / box headers
export const stripBg = 'var(--surface)';         // helper strip, row hover
export const accentTint = 'var(--counter-soft)';      // results row hover / open
export const accentInk = 'var(--accent-text)';       // chevrons and arrows (AA on white)
export const textBody = 'var(--muted)';        // long-form descriptions
export const link = 'var(--accent-text)';
export const linkHover = 'var(--accent)';
export const headerBtnBorder = 'var(--line)';

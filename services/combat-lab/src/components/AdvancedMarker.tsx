import React from 'react';

// Shared "advanced option" marker. Shown next to a rule in the Notes panels and next to the matching
// control (e.g. an advanced-only checkbox) so the two line up visually. A control/rule is "advanced"
// when it only appears once the per-panel "Advanced" checkbox is ticked.
export const advancedMarkerChar = '⚙️';
export const advancedMarkerTooltip = "Advanced option — only shown when the \"Advanced\" checkbox is ticked.";

const AdvancedMarker: React.FC = () => (
  <span
    role="img"
    aria-label="advanced option"
    title={advancedMarkerTooltip}
    style={{ marginLeft: '4px', cursor: 'help' }}
  >
    {advancedMarkerChar}
  </span>
);

// Label text with the gear glued to its last word, so a wrapping label never
// leaves the gear alone on its own line.
export const LabelWithMarker: React.FC<{ text: string }> = ({ text }) => {
  const split = text.lastIndexOf(' ') + 1;
  return (
    <>
      {text.slice(0, split)}
      <span style={{ whiteSpace: 'nowrap' }}>{text.slice(split)}<AdvancedMarker /></span>
    </>
  );
};

export default AdvancedMarker;

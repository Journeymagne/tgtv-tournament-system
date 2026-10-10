import React from "react";
import AdvancedMarker, { LabelWithMarker } from "src/components/AdvancedMarker";
import CheckItem from "src/components/CheckItem";

export function useCheckboxAndVariable(
  label: string,
  initialCheckedState: boolean = false,
  // when true, append the gear marker so this toggle matches the advanced controls it shows/hides
  advancedMarker: boolean = false,
  // ties the label to the box so clicking the text toggles it; must be unique on the page
  id?: string,
  // when true, show only the gear; the label text stays for screen readers (narrow blocks)
  iconOnly: boolean = false,
) : [JSX.Element, boolean]
{
  const [checked, setChecked] = React.useState(initialCheckedState);
  return [
    <CheckItem
      id={id ?? `check-${label}`}
      checked={checked}
      onChange={() => setChecked(!checked)}
      style={{ fontSize: '12px', color: '#4b5563', gap: '5px' }}
    >
      {iconOnly
        ? <><span className='sr-only'>{label}</span>{advancedMarker && <AdvancedMarker />}</>
        : advancedMarker ? <LabelWithMarker text={label} /> : label}
    </CheckItem>,
    checked,
  ];
}

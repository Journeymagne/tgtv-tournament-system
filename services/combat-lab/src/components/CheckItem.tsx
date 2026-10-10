import React from 'react';
import 'src/components/Controls.css';

export interface CheckItemProps {
  // Ties the label to the box so clicking the text toggles it; must be unique on the page.
  id: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

// One checkbox + clickable label in the compact control style. Same input/label
// sibling shape as react-bootstrap's Form.Check, so `.form-check` lookups work.
const CheckItem: React.FC<CheckItemProps> = ({ id, checked, onChange, title, className, style, children }) => (
  <div className={'form-check CheckItem' + (className ? ` ${className}` : '')} title={title} style={style}>
    <input id={id} type='checkbox' checked={checked} onChange={onChange} />
    <label htmlFor={id}>{children}</label>
  </div>
);

export default CheckItem;

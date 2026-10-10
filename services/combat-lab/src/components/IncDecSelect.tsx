import React from 'react';
import * as Util from 'src/Util';
import Note from 'src/Notes';
import { Col, Row } from 'react-bootstrap';
import AdvancedMarker from 'src/components/AdvancedMarker';
import 'src/components/Controls.css';

export interface IProps {
  id: string;
  // Stable instance key. The same stat name is mounted more than once (two shoot
  // situations, attacker and defender, two fighters, fight options, and the
  // calculator that is hidden with display:none). The DOM id must be unique or
  // a label focuses the first match.
  idPrefix?: string;
  ariaLabel?: string;
  hoverText?: string;
  label?: string;
  values: string[];
  selectedValue: number | string;
  valueChangeHandler: Util.Accepter<string>;
  // true when this control only appears under the panel's "Advanced" checkbox; shows the gear marker.
  advanced?: boolean;
  // caps the select width so a long option can't widen (and wrap) a Bootstrap column
  capped?: boolean;
}

export class Props implements IProps {
  public id: string;
  public hoverText?: string;
  public selectedValue: number | string;
  public values: string[];
  public valueChangeHandler: Util.Accepter<string>;
  public advanced?: boolean;

  constructor(
    idOrNote: string | Note,
    selectedValue: string | number,
    values: string[] | number[],
    valueChangeHandler: Util.Accepter<string>,
  ) {
    if(idOrNote instanceof Note) {
      this.id = idOrNote.name;
      this.hoverText = idOrNote.description;
    }
    else {
      this.id = idOrNote;
    }

    this.values = values.map((val: any) => val.toString()) as string[];
    this.selectedValue = selectedValue.toString();
    this.valueChangeHandler = valueChangeHandler;
  }
}

function controlDomId(props: IProps): string {
  return props.idPrefix ? `${props.idPrefix}-${props.id}` : props.id;
}

const IncDecSelect: React.FC<IProps> = (props: IProps) => {
  let selectedText = props.selectedValue.toString();
  const domId = controlDomId(props);
  const options = props.values.map(x => <option key={x} value={x}>{x}</option>);

  function handleIncDec(delta: number) {
    const newIdx = Math.max(0, props.values.indexOf(selectedText)) + delta;
    if(newIdx >= 0 && newIdx < options.length) {
      props.valueChangeHandler(props.values[newIdx]);
    }
  }

  function handleUserSelect(event: React.ChangeEvent<HTMLSelectElement>) {
    props.valueChangeHandler(event.target.value);
  }

  return (
    <div className={props.capped ? 'IncDec IncDec--capped' : 'IncDec'}>
      <label
        htmlFor={domId}
        title={props.hoverText}
        className='IncDec-label'
      >
        {props.label ?? props.id}
        {props.advanced ? <AdvancedMarker /> : (props.hoverText ? '*' : '')}
      </label>
      <div className='IncDec-row'>
        <button type='button' className='IncDec-btn IncDec-btn--dec' aria-label='decrease' disabled={props.values.indexOf(selectedText)<=0} onClick={() => handleIncDec(-1)}>&minus;</button>
        <select
          aria-label={props.ariaLabel}
          name={props.id}
          id={domId}
          value={selectedText}
          onChange={handleUserSelect}
          className='IncDec-select'
        >
          {options}
        </select>
        <button type='button' className='IncDec-btn IncDec-btn--inc' aria-label='increase' disabled={props.values.indexOf(selectedText)>=props.values.length-1} onClick={() => handleIncDec(1)}>+</button>
      </div>
    </div>
  );
}

// idPrefix is required: every caller renders alongside another panel that
// uses the same stat names, so an unprefixed id would collide.
export function propsToRows(props: Props[], idPrefix: string): JSX.Element[] {
  return props.map(p => <Row key={p.id} className='mb-1'><Col className='pr-0' style={{ maxWidth: '160px' }}><IncDecSelect {...p} idPrefix={idPrefix} capped/></Col></Row>);
}

// Bare fields for a CSS grid or stack container (no Bootstrap row/col gutters).
export function propsToFields(props: Props[], idPrefix: string): JSX.Element[] {
  return props.map(p => <IncDecSelect key={p.id} {...p} idPrefix={idPrefix}/>);
}

export default IncDecSelect;
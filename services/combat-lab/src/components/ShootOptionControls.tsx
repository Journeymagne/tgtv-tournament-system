import React from 'react';

import ShootOptions from 'src/ShootOptions';
import {
  Accepter,
  makeNumChangeHandler,
  span,
} from 'src/Util';
import { Props as IncProps, propsToFields } from 'src/components/IncDecSelect';

export interface Props {
  shootOptions: ShootOptions;
  changeHandler: Accepter<ShootOptions>;
  idPrefix: string;
}

const ShootOptionControls: React.FC<Props> = (props: Props) => {
  const opts = props.shootOptions;
  const numHandler = makeNumChangeHandler(opts, props.changeHandler);

  const params: IncProps[] = [
    //           id,              selectedValue,                  values,     valueChangeHandler
    new IncProps('Rounds',        opts.numRounds,                 span(1, 9), numHandler('numRounds')),
  ];

  const paramElems = propsToFields(params, props.idPrefix);

  // Sits under the attacker block, below a hairline, in the same 2-col grid.
  return (
    <div className='CtlGrid' style={{ borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
      {paramElems}
    </div>
  );
}

export default ShootOptionControls;

import React from 'react';

import ShootOptions from 'src/ShootOptions';
import {
  Accepter,
  makeNumChangeHandler,
  span,
} from 'src/Util';
import IncDecSelect from 'src/components/IncDecSelect';

export interface Props {
  shootOptions: ShootOptions;
  changeHandler: Accepter<ShootOptions>;
  idPrefix: string;
}

const ShootOptionControls: React.FC<Props> = (props: Props) => {
  const opts = props.shootOptions;
  const numHandler = makeNumChangeHandler(opts, props.changeHandler);

  return <IncDecSelect id="Rounds" idPrefix={props.idPrefix} label="Shoot actions"
    selectedValue={opts.numRounds} values={span(1, 9).map(String)} valueChangeHandler={numHandler('numRounds')}/>;
}

export default ShootOptionControls;

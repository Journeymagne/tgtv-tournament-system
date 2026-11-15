import React from 'react';

import ShootOptions from 'src/ShootOptions';
import AttackerControls from "src/components/AttackerControls";
import DefenderControls from "src/components/DefenderControls";
import ShootOptionControls from 'src/components/ShootOptionControls';
import ShootResultsDisplay from 'src/components/ShootResultsDisplay';

import Model from 'src/Model';
import * as Util from "src/Util";

export interface Props {
  attacker: Model;
  setAttacker: Util.Accepter<Model>;
  defender: Model;
  setDefender: Util.Accepter<Model>;
  shootOptions: ShootOptions;
  setShootOptions: Util.Accepter<ShootOptions>;
  saveToDmgToProb: Map<number,Map<number,number>>;
  // Situation key (s1, s2). Attacker, defender, and rounds each get a role
  // suffix because they share stat names such as Reroll.
  idPrefix: string;
  showResults?: boolean;
}

// The three blocks (attacker+rounds, defender, results) flow as wrapping flex
// items so they fill the panel's *actual* width. Panel width here is not
// monotonic with the viewport (each situation is ~608px when the two sit side
// by side on wide screens, but ~713px+ when they stack on a tablet), so media
// queries can't size this -- flex-wrap reacting to real available width can.
// Wide panel: all three sit in a row. Medium: results wraps below and grows to
// fill. Narrow/mobile: everything stacks. `justify-content: center` keeps any
// leftover space balanced on both sides instead of pooling on the right.
export const ShootSituation: React.FC<Props> = (props: Props) => {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '12px 20px',
      }}
    >
      <AttackerControls idPrefix={`${props.idPrefix}-atk`} attacker={props.attacker} changeHandler={props.setAttacker}>
        <ShootOptionControls idPrefix={`${props.idPrefix}-opt`} shootOptions={props.shootOptions} changeHandler={props.setShootOptions} />
      </AttackerControls>
      <DefenderControls idPrefix={`${props.idPrefix}-def`} defender={props.defender} changeHandler={props.setDefender} />
      {props.showResults!==false&&<div style={{ flex: '1 1 300px', minWidth: '260px', maxWidth: '560px' }}>
        <ShootResultsDisplay saveToDmgToProb={props.saveToDmgToProb} defender={props.defender} />
      </div>}
    </div>
  );
};

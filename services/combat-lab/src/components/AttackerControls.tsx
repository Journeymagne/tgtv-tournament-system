import React from 'react';
import Model from 'src/Model';
import Ability, {rerollAbilities as rerolls} from 'src/Ability';
import * as N from 'src/Notes';
import {Accepter, makeNumChangeHandler, makeTextChangeHandler, preX, rollSpan, span, xspan} from 'src/Util';
import WeaponProfiles from 'src/lab/WeaponProfiles';
import {AbilityCheckbox, ParamSpec, notedControlsFromCheckboxes, notedControlsFromParams} from './controlNotes';
import {Props as IncProps} from './IncDecSelect';
import ProfileControls from './ProfileControls';
import {factionRulesFor} from './profileRules';

export interface Props {
  rounds?: number;
  children?: React.ReactNode;
  attacker: Model;
  changeHandler: Accepter<Model>;
  idPrefix: string;
}

export type AttackerParamId =
  | 'attacks'
  | 'bs'
  | 'normDmg'
  | 'critDmg'
  | 'devastating'
  | 'piercing'
  | 'piercingCrits'
  | 'reroll'
  | 'lethal'
  | 'autoNorms'
  | 'autoCrits'
  | 'failsToNorms'
  | 'normsToCrits';

// Same list the Shoot notes panel reads. Punishing is an always-visible checkbox; FailsToNorms is
// an advanced param. Both therefore belong in Notes.
export const attackerParamSpecs: readonly ParamSpec<AttackerParamId>[] = [
  { id: 'attacks', label: 'Attacks', advanced: false },
  { id: 'bs', label: 'BS', advanced: false },
  { id: 'normDmg', label: 'Normal Dmg', advanced: false },
  { id: 'critDmg', label: 'Crit Dmg', advanced: false },
  { id: 'devastating', label: 'Devastating', advanced: false },
  { id: 'piercing', label: 'Piercing', advanced: false },
  { id: 'piercingCrits', label: 'Piercing Crits', advanced: false },
  { id: 'reroll', label: N.Reroll, advanced: false },
  { id: 'lethal', label: 'Lethal', advanced: false },
  { id: 'autoNorms', label: N.AutoNorms, advanced: false },
  { id: 'autoCrits', label: N.AutoCrits, advanced: true },
  { id: 'failsToNorms', label: N.FailsToNorms, advanced: true },
  { id: 'normsToCrits', label: N.NormsToCrits, advanced: true },
];

export const attackerBasicCheckboxes: readonly AbilityCheckbox[] = [
  { note: N.Rending, ability: Ability.Rending },
  { note: N.Severe, ability: Ability.Severe },
  { note: N.Punishing, ability: Ability.Punishing },
];

export const attackerAdvancedCheckboxes: readonly AbilityCheckbox[] = [];

export const attackerNotedControls = [
  ...notedControlsFromParams(attackerParamSpecs),
  ...notedControlsFromCheckboxes(attackerBasicCheckboxes, false),
  ...notedControlsFromCheckboxes([...attackerAdvancedCheckboxes, ...factionRulesFor('attacker')], true),
];

export default function AttackerControls(props: Props) {
  const atk = props.attacker;
  const textHandler = makeTextChangeHandler(atk, props.changeHandler);
  const numHandler = makeNumChangeHandler(atk, props.changeHandler);

  function buildParam(spec: ParamSpec<AttackerParamId>): IncProps {
    switch (spec.id) {
      case 'attacks':
        return new IncProps(spec.label, atk.numDice, span(1, 9), numHandler('numDice'));
      case 'bs':
        return new IncProps(spec.label, atk.diceStat + '+', rollSpan, numHandler('diceStat'));
      case 'normDmg':
        return new IncProps(spec.label, atk.normDmg, span(0, 9), numHandler('normDmg'));
      case 'critDmg':
        return new IncProps(spec.label, atk.critDmg, span(0, 10), numHandler('critDmg'));
      case 'devastating':
        return new IncProps(spec.label, atk.mwx, xspan(1, 9), numHandler('mwx'));
      case 'piercing':
        return new IncProps(spec.label, atk.apx, xspan(1, 4), numHandler('apx'));
      case 'piercingCrits':
        return new IncProps(spec.label, atk.px, xspan(1, 4), numHandler('px'));
      case 'reroll':
        return new IncProps(spec.label, atk.reroll, preX(rerolls), textHandler('reroll'));
      case 'lethal':
        return new IncProps(spec.label, atk.lethal + '+', xspan(5, 2, '+'), numHandler('lethal'));
      case 'autoNorms':
        return new IncProps(spec.label, atk.autoNorms, xspan(1, 3), numHandler('autoNorms'));
      case 'autoCrits':
        return new IncProps(spec.label, atk.autoCrits, xspan(1, 9), numHandler('autoCrits'));
      case 'failsToNorms':
        return new IncProps(spec.label, atk.failsToNorms, xspan(1, 9), numHandler('failsToNorms'));
      case 'normsToCrits':
        return new IncProps(spec.label, atk.normsToCrits, xspan(1, 9), numHandler('normsToCrits'));
      default: {
        const unexpected: never = spec.id;
        throw new Error(`unknown attacker control '${unexpected}'`);
      }
    }
  }

  return <section className="Profile-editor Profile-editor--attacker">
    <h3 className="Profile-role">Атакующий</h3>
    <WeaponProfiles idPrefix={props.idPrefix} mode="shoot" model={atk} onChange={props.changeHandler}/>
    <ProfileControls idPrefix={props.idPrefix} role="attacker" model={atk} onChange={props.changeHandler}
      specs={attackerParamSpecs} statIds={['attacks', 'bs', 'normDmg', 'critDmg']} makeField={buildParam}
      basic={attackerBasicCheckboxes} general={attackerAdvancedCheckboxes} rounds={props.rounds}>{props.children}</ProfileControls>
  </section>;
}

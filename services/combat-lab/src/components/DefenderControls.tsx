import React from 'react';
import Model from 'src/Model';
import Ability, {rerollAbilities as rerolls} from 'src/Ability';
import * as N from 'src/Notes';
import {MaxWounds, SaveRange} from 'src/KtMisc';
import {Accepter, makeIncDecPropsFromLookup, makeNumChangeHandler, makeTextChangeHandler, preX, span, withPlus, xspan} from 'src/Util';
import {relicModeToLabel} from 'src/SaintlyRelics';
import {AbilityCheckbox, ParamSpec, notedControlsFromCheckboxes, notedControlsFromParams} from './controlNotes';
import {Props as IncProps} from './IncDecSelect';
import ProfileControls from './ProfileControls';
import {factionRulesFor} from './profileRules';

export interface Props {
  defender: Model;
  changeHandler: Accepter<Model>;
  idPrefix: string;
}

export type DefenderParamId =
  | 'save'
  | 'wounds'
  | 'coverNorms'
  | 'coverCrits'
  | 'normsToCrits'
  | 'failsToNorms'
  | 'hardy'
  | 'fnp'
  | 'relics'
  | 'reroll';

export const defenderParamSpecs: readonly ParamSpec<DefenderParamId>[] = [
  { id: 'wounds', label: 'Wounds', advanced: false },
  { id: 'save', label: 'Save', advanced: false },
  { id: 'coverNorms', label: N.CoverNormSaves, advanced: false },
  { id: 'coverCrits', label: N.CoverCritSaves, advanced: true },
  { id: 'normsToCrits', label: N.NormsToCrits, advanced: true },
  { id: 'failsToNorms', label: N.FailsToNorms, advanced: true },
  { id: 'hardy', label: N.HardyX, advanced: true },
  { id: 'fnp', label: N.FeelNoPain, advanced: true },
  { id: 'relics', label: N.SaintlyRelics, advanced: true, faction: true },
  { id: 'reroll', label: N.Reroll, advanced: false },
];

export const defenderBasicCheckboxes: readonly AbilityCheckbox[] = [
  {note: N.ObscuredTarget, ability: Ability.ObscuredTarget, label: 'Obscured'},
];

export const defenderAdvancedCheckboxes: readonly AbilityCheckbox[] = [
  {note: N.JustAScratchNorms, ability: Ability.JustAScratchNorms},
  {note: N.Punishing, ability: Ability.Punishing},
];

export const defenderNotedControls = [
  ...notedControlsFromParams(defenderParamSpecs),
  ...notedControlsFromCheckboxes(defenderBasicCheckboxes, false),
  ...notedControlsFromCheckboxes([...defenderAdvancedCheckboxes, ...factionRulesFor('defender')], true),
];

export default function DefenderControls(props: Props) {
  const def = props.defender;
  const textHandler = makeTextChangeHandler(def, props.changeHandler);
  const numHandler = makeNumChangeHandler(def, props.changeHandler);

  function buildParam(spec: ParamSpec<DefenderParamId>): IncProps {
    switch (spec.id) {
      case 'save':
        return new IncProps(spec.label, def.diceStat + '+', withPlus(SaveRange), numHandler('diceStat'));
      case 'wounds':
        return new IncProps(spec.label, def.wounds, span(1, MaxWounds), numHandler('wounds'));
      case 'coverNorms':
        return new IncProps(spec.label, def.autoNorms, xspan(1, 3), numHandler('autoNorms'));
      case 'coverCrits':
        return new IncProps(spec.label, def.autoCrits, xspan(1, 3), numHandler('autoCrits'));
      case 'normsToCrits':
        return new IncProps(spec.label, def.normsToCrits, xspan(1, 9), numHandler('normsToCrits'));
      case 'failsToNorms':
        return new IncProps(spec.label, def.failsToNorms, xspan(1, 9), numHandler('failsToNorms'));
      case 'hardy':
        return new IncProps(spec.label, def.hardyx + '+', xspan(5, 2, '+'), numHandler('hardyx'));
      case 'fnp':
        return new IncProps(spec.label, def.fnp + '+', xspan(6, 4, '+'), numHandler('fnp'));
      case 'relics':
        return makeIncDecPropsFromLookup(spec.label, def, props.changeHandler, 'saintlyRelics', relicModeToLabel);
      case 'reroll':
        return new IncProps(spec.label, def.reroll, preX(rerolls), textHandler('reroll'));
      default: {
        const unexpected: never = spec.id;
        throw new Error(`unknown defender control '${unexpected}'`);
      }
    }
  }

  return <section className="Profile-editor Profile-editor--defender">
    <h3 className="Profile-role">Защитник</h3>
    <ProfileControls idPrefix={props.idPrefix} role="defender" model={def} onChange={props.changeHandler}
      specs={defenderParamSpecs} statIds={['wounds', 'save']} makeField={buildParam}
      basic={defenderBasicCheckboxes} general={defenderAdvancedCheckboxes}/>
  </section>;
}

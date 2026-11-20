import React from 'react';
import Model from 'src/Model';
import Ability, {mutuallyExclusiveFightAbilities as nicheAbilities, fightAbilityLabels, rerollAbilities as rerolls} from 'src/Ability';
import * as N from 'src/Notes';
import {MaxWounds} from 'src/KtMisc';
import {Accepter, extractFromSet, makeIncDecPropsFromLookup, makeNumChangeHandler, makeSetChangeHandler, makeTextChangeHandler, preX, rollSpan, span, xspan} from 'src/Util';
import {relicModeToLabel} from 'src/SaintlyRelics';
import WeaponProfiles from 'src/lab/WeaponProfiles';
import {AbilityCheckbox, ParamSpec, notedControlsFromCheckboxes, notedControlsFromParams} from './controlNotes';
import IncDecSelect, {Props as IncProps} from './IncDecSelect';
import ProfileControls from './ProfileControls';
import {factionRulesFor} from './profileRules';

export interface Props {
  attacker: Model;
  changeHandler: Accepter<Model>;
  idPrefix: string;
  facingCrush?: boolean;
}

export type FighterParamId =
  | 'wounds'
  | 'attacks'
  | 'ws'
  | 'normDmg'
  | 'critDmg'
  | 'reroll'
  | 'lethal'
  | 'niche'
  | 'autoNorms'
  | 'normsToCrits'
  | 'failsToNorms'
  | 'fnp'
  | 'relics'
  | 'devastating';

// Order is the control order (params, then checkboxes). The Fight notes panel is built from this
// same list, so a rule appears in Notes exactly when a fighter card has a control for it.
// Follow-up rules share the NicheAbility selector; other effects may be combined.
export const fighterParamSpecs: readonly ParamSpec<FighterParamId>[] = [
  { id: 'wounds', label: 'Wounds', advanced: false },
  { id: 'attacks', label: 'Attacks', advanced: false },
  { id: 'ws', label: 'WS', advanced: false },
  { id: 'normDmg', label: 'Normal Dmg', advanced: false },
  { id: 'critDmg', label: 'Critical Dmg', advanced: false },
  { id: 'reroll', label: N.Reroll, advanced: false },
  { id: 'lethal', label: 'Lethal', advanced: false },
  { id: 'devastating', label: N.DevastatingMelee, advanced: true },
  { id: 'niche', label: N.NicheAbility, advanced: true },
  { id: 'autoNorms', label: N.AutoNorms, advanced: true },
  { id: 'normsToCrits', label: N.NormsToCrits, advanced: true },
  { id: 'failsToNorms', label: N.FailsToNorms, advanced: true },
  { id: 'fnp', label: N.FeelNoPain, advanced: true },
  { id: 'relics', label: N.SaintlyRelics, advanced: true, faction: true },
];

export const fighterBasicCheckboxes: readonly AbilityCheckbox[] = [
  { note: N.Rending, ability: Ability.Rending },
  { note: N.Severe, ability: Ability.Severe },
  { note: N.Brutal, ability: Ability.Brutal },
];

export const fighterAdvancedCheckboxes: readonly AbilityCheckbox[] = [
  {note: N.PreParry, ability: Ability.PreParry},
  {note: N.JustAScratchNorms, ability: Ability.JustAScratchNorms},
  {note: N.HalfDamageFirstStrike, ability: Ability.HalfDamageFirstStrike},
  {note: N.Dueller, ability: Ability.Dueller},
  {note: N.DoubleBlock, ability: Ability.DoubleBlock},
  {note: N.StrikeOnDeath, ability: Ability.StrikeOnDeath},
  {note: N.CritDamageBonus, ability: Ability.CritDamageBonus},
  {note: N.FirstStrikeBonus, ability: Ability.FirstStrikeBonus},
  {note: N.Shock, ability: Ability.Shock},
  {note: N.Punishing, ability: Ability.Punishing},
];

export const fighterNotedControls = [
  ...notedControlsFromParams(fighterParamSpecs),
  ...notedControlsFromCheckboxes(fighterBasicCheckboxes, false),
  ...notedControlsFromCheckboxes([...fighterAdvancedCheckboxes, ...factionRulesFor('fighter')], true),
];

export default function FighterControls(props: Props) {
  const atk = props.attacker;
  const textHandler = makeTextChangeHandler(atk, props.changeHandler);
  const numHandler = makeNumChangeHandler(atk, props.changeHandler);
  const genericFollowUps = nicheAbilities.filter(ability => ability !== Ability.StealthAssault);
  const nicheAbility = extractFromSet(genericFollowUps, Ability.None, atk.abilities)!;
  const subsetHandler = (subset: Iterable<Ability>) => makeSetChangeHandler<Model, Ability>(atk, props.changeHandler, 'abilities', subset);

  function buildParam(spec: ParamSpec<FighterParamId>): IncProps {
    switch (spec.id) {
      case 'wounds':
        return new IncProps(spec.label, atk.wounds, span(1, MaxWounds), numHandler('wounds'));
      case 'attacks':
        return new IncProps(spec.label, atk.numDice, span(1, 8), numHandler('numDice'));
      case 'ws':
        return new IncProps(spec.label, atk.diceStat + '+', rollSpan, numHandler('diceStat'));
      case 'normDmg':
        return new IncProps(spec.label, atk.normDmg, span(1, 9), numHandler('normDmg'));
      case 'critDmg':
        return new IncProps(spec.label, atk.critDmg, span(1, 9), numHandler('critDmg'));
      case 'reroll':
        return new IncProps(spec.label, atk.reroll, preX(rerolls), textHandler('reroll'));
      case 'lethal':
        return new IncProps(spec.label, atk.lethal + '+', xspan(5, 2, '+'), numHandler('lethal'));
      case 'devastating':
        return new IncProps(spec.label, atk.mwx, xspan(1, 9), numHandler('mwx'));
      case 'niche':
        return new IncProps(spec.label, nicheAbility, genericFollowUps, subsetHandler(nicheAbilities), fightAbilityLabels);
      case 'autoNorms':
        return new IncProps(spec.label, atk.autoNorms, xspan(1, 9), numHandler('autoNorms'));
      case 'normsToCrits':
        return new IncProps(spec.label, atk.normsToCrits, xspan(1, 9), numHandler('normsToCrits'));
      case 'failsToNorms':
        return new IncProps(spec.label, atk.failsToNorms, xspan(1, 9), numHandler('failsToNorms'));
      case 'fnp':
        return new IncProps(spec.label, atk.fnp + '+', xspan(6, 4, '+'), numHandler('fnp'));
      case 'relics':
        return makeIncDecPropsFromLookup(spec.label, atk, props.changeHandler, 'saintlyRelics', relicModeToLabel);
      default: {
        const unexpected: never = spec.id;
        throw new Error(`unknown fighter control '${unexpected}'`);
      }
    }
  }

  return <section className="Profile-editor Profile-editor--fighter">
    <WeaponProfiles idPrefix={props.idPrefix} mode="fight" model={atk} onChange={props.changeHandler}/>
    <ProfileControls idPrefix={props.idPrefix} role="fighter" model={atk} onChange={props.changeHandler}
      specs={fighterParamSpecs} statIds={['wounds', 'attacks', 'ws', 'normDmg', 'critDmg']} makeField={buildParam}
      basic={fighterBasicCheckboxes} general={fighterAdvancedCheckboxes}>
      {props.facingCrush && <IncDecSelect id="Printed Wounds" idPrefix={props.idPrefix}
        label="Wounds по карте" selectedValue={atk.woundsStat || 'auto'}
        values={['auto', ...span(1, MaxWounds).map(String)]} valueLabels={{auto: 'Как в профиле'}}
        valueChangeHandler={makeNumChangeHandler(atk, props.changeHandler)('woundsStat')} capped/>}
    </ProfileControls>
  </section>;
}

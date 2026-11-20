import React from 'react';
import Overlay from 'react-bootstrap/Overlay';
import Model from 'src/Model';
import Ability, {fightAbilityLabels, mutuallyExclusiveFightAbilities} from 'src/Ability';
import Note from 'src/Notes';
import {frequencyLimitedFightAbilities, passiveFightAbilities} from 'src/FightEffectFrequency';
import {attackerFrequencyAbilities, defenderFrequencyAbilities, ScopedWeaponRule} from 'src/ShootEffectFrequency';
import {incDecPropsHasNondefaultSelectedValue} from 'src/Util';
import CheckItem from './CheckItem';
import IncDecSelect, {Props as Field} from './IncDecSelect';
import ShootingEffectFrequencyControl from './ShootingEffectFrequencyControl';
import {AbilityCheckbox, ParamSpec} from './controlNotes';
import {factionRulesFor, ProfileRole, ruleDescription} from './profileRules';
import RuleTabs from './RuleTabs';
import 'src/components/Controls.css';

export function useEnglishRules() {
  const get = () => document.documentElement.lang.startsWith('en');
  const [english, setEnglish] = React.useState(get);
  React.useEffect(() => {
    const update = () => setEnglish(get());
    window.addEventListener('kt:locale', update);
    return () => window.removeEventListener('kt:locale', update);
  }, []);
  return english;
}

function RuleInfo({id, note, english, setting, children}: {
  id: string; note: Note; english: boolean; setting?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const description = ruleDescription(note, english);
  return <div className="RuleInfo">
    <div className={setting ? 'RuleInfo-line RuleInfo-line--setting' : 'RuleInfo-line'}>
      {children}
      {setting}
      <button ref={trigger} type="button" className="RuleInfo-button" aria-label={`${english ? 'About' : 'Об эффекте'} ${note.name}`}
        aria-expanded={open} aria-controls={open ? id : undefined} aria-describedby={open ? id : undefined}
        onKeyDown={event => { if (event.key === 'Tab') setOpen(false); }} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="10" cy="10" r="7.3"/><path d="M10 9v5"/><circle cx="10" cy="6.4" r=".9" fill="currentColor" stroke="none"/>
        </svg>
      </button>
    </div>
    {open && <Overlay show target={trigger.current} placement="bottom-end" offset={[0, 6]}
      flip containerPadding={8} transition={false} rootClose onHide={() => setOpen(false)}>
      {({ref, style}) => <div ref={ref} style={style} role="tooltip" className="RuleInfo-text" id={id}>{description}</div>}
    </Overlay>}
  </div>;
}

interface Props<Id extends string> {
  idPrefix: string;
  role: ProfileRole;
  model: Model;
  onChange: (model: Model) => void;
  specs: readonly ParamSpec<Id>[];
  statIds: readonly Id[];
  makeField: (spec: ParamSpec<Id>) => Field;
  basic: readonly AbilityCheckbox[];
  general: readonly AbilityCheckbox[];
  rounds?: number;
  children?: React.ReactNode;
}

const shotFields: Partial<Record<string, ScopedWeaponRule>> = {lethal: 'lethal', piercing: 'apx', piercingCrits: 'px'};

export default function ProfileControls<Id extends string>({
  idPrefix, role, model, onChange, specs, statIds, makeField, basic, general, rounds = 1, children,
}: Props<Id>) {
  const english = useEnglishRules();
  const faction = factionRulesFor(role);
  const faithIcon = faction.find(box => box.ability === Ability.IconOfFaith);
  const frequencyAbilities = role === 'fighter' ? frequencyLimitedFightAbilities
    : role === 'attacker' ? attackerFrequencyAbilities : defenderFrequencyAbilities;
  const fields = specs.map(spec => ({spec, field: makeField(spec)}));
  const basicFields = fields.filter(({spec}) => !spec.advanced);
  const advancedFields = fields.filter(({spec}) => spec.advanced);
  function activeCount(boxes: readonly AbilityCheckbox[], isFaction: boolean) {
    return boxes.filter(box => model.has(box.ability) && (box.ability !== Ability.IconOfFaith || model.has(Ability.ActsOfFaith))).length
      + advancedFields.filter(({spec, field}) => !!spec.faction === isFaction && incDecPropsHasNondefaultSelectedValue(field)).length;
  }
  const id = (key: string) => `${idPrefix}-${key}`;
  const change = (patch: Partial<Model>) => onChange(Object.assign(new Model(), model, patch));

  function frequency(ability: Ability, label: string, compact = false) {
    if (!model.has(ability) || !frequencyAbilities.includes(ability)) return null;
    if (role !== 'fighter') {
      return <ShootingEffectFrequencyControl model={model} ability={ability}
        label={label} idPrefix={idPrefix} compact={compact} onChange={onChange}/>;
    }
    const selectId = id(ability + '-frequency');
    return <div className="FightEffectFrequency">
      <label htmlFor={selectId}>{label}: частота</label>
      <select id={selectId} value={model.fightOnceAbilities.includes(ability) ? 'once' : 'each'}
        title={passiveFightAbilities.includes(ability)
          ? 'В режиме «Один раз» правило действует весь первый файт.'
          : 'В режиме «Один раз» эффект расходуется при первом срабатывании.'}
        onChange={event => {
          const once = model.fightOnceAbilities.filter(a => a !== ability);
          if (event.target.value === 'once') once.push(ability);
          change({fightOnceAbilities: once});
        }}>
        <option value="each">{compact ? 'За бой' : 'В каждом файте'}</option>
        <option value="once">{compact ? 'За серию' : 'Один раз на все файты'}</option>
      </select>
    </div>;
  }

  function checkbox(box: AbilityCheckbox, showInfo: boolean) {
    const {ability, note} = box;
    const disabled = ability === Ability.IconOfFaith && !model.has(Ability.ActsOfFaith);
    const checked = !disabled && model.has(ability);
    const toggle = () => {
      const abilities = new Set(model.abilities);
      if (!checked && ability === Ability.StealthAssault) {
        for (const followUp of mutuallyExclusiveFightAbilities) abilities.delete(followUp);
      }
      if (checked) abilities.delete(ability);
      else abilities.add(ability);
      if (ability === Ability.ActsOfFaith && checked) abilities.delete(Ability.IconOfFaith);
      change({abilities});
    };
    const input = <CheckItem id={id(ability)} checked={checked} disabled={disabled} onChange={toggle} title={note.description}>
      {box.label ?? note.name}
    </CheckItem>;
    const setting = ability === Ability.ActsOfFaith ? <div className="Profile-faith">
      <label htmlFor={id('faith-points')}>Очки веры</label>
      <select id={id('faith-points')} disabled={!checked} value={model.faithPoints}
        onChange={event => change({faithPoints: Number(event.target.value)})}>
        {Array.from({length: 16}, (_, n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div> : frequencyAbilities.includes(ability) && <div className="Profile-rule-frequency">{frequency(ability, note.name, showInfo)}</div>;
    return <div className="Profile-rule" key={ability}>{showInfo
      ? <RuleInfo id={id(ability + '-info')} note={note} english={english} setting={setting}>{input}</RuleInfo>
      : <>{input}{setting}</>}
    </div>;
  }

  function shotScope(key: ScopedWeaponRule, label: string) {
    const scope = model.shootWeaponRounds[key];
    if (!model[key] || (rounds < 2 && !scope)) return null;
    const selectId = id(key + '-shot');
    return <div className="FightEffectFrequency Profile-shot-scope">
      <label htmlFor={selectId}>{label} · <span>выстрел</span></label>
      <select id={selectId} value={scope ?? 'each'} onChange={event => {
        const next = {...model.shootWeaponRounds};
        if (event.target.value === 'each') delete next[key];
        else next[key] = event.target.value === 'first' ? 'first' : 'second';
        change({shootWeaponRounds: next});
      }}>
        <option value="each">Каждый выстрел</option><option value="first">Только первый</option>
        <option value="second">Только второй</option>
      </select>
    </div>;
  }

  function renderField({spec, field}: typeof fields[number]) {
    const input = <IncDecSelect {...field} idPrefix={idPrefix} capped/>;
    const scoped = role === 'attacker' && shotFields[spec.id];
    const niche = spec.id === 'niche' ? field.selectedValue as Ability : undefined;
    return <div key={spec.id} className="Profile-field">
      {spec.advanced && spec.label instanceof Note
        ? <RuleInfo id={id(spec.id + '-info')} note={spec.label} english={english}>{input}</RuleInfo> : input}
      {scoped && shotScope(scoped, field.id)}
      {niche && frequency(niche, fightAbilityLabels[niche] ?? niche)}
    </div>;
  }

  return <div className="Profile-controls">
    <div className="Profile-columns">
      <div className="Profile-column">
        <h4>Характеристики</h4>
        {basicFields.filter(({spec}) => statIds.includes(spec.id)).map(renderField)}
        {role === 'defender' && <div className="Profile-dice"><span>Кубики защиты</span>
          <output>{model.numDice + Number(model.has(Ability.OmnissiahsImperative))}</output></div>}
        {children}
      </div>
      <div className="Profile-column">
        <h4>{role === 'defender' ? 'Правила защиты' : 'Правила оружия'}</h4>
        {basicFields.filter(({spec}) => !statIds.includes(spec.id)).map(renderField)}
        {basic.map(box => checkbox(box, false))}
      </div>
    </div>
    <RuleTabs prefix={idPrefix} counts={{general: activeCount(general, false), faction: activeCount(faction, true)}}>{key => <>
      {advancedFields.filter(({spec}) => (spec.faction ? 'faction' : 'general') === key).map(renderField)}
      {(key === 'general' ? general : faction).filter(box => box.ability !== Ability.IconOfFaith).map(box =>
        box.ability === Ability.ActsOfFaith && faithIcon ? <div className="Profile-faith-group" key={box.ability}>
          {checkbox(box, true)}{checkbox(faithIcon, true)}
        </div> : checkbox(box, true))}
    </>}</RuleTabs>
  </div>;
}

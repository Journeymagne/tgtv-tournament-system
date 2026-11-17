import React from 'react';
import Ability from 'src/Ability';
import Model from 'src/Model';
import { passiveShootAbilities } from 'src/ShootEffectFrequency';

interface Props {
  model: Model;
  ability: Ability;
  label: string;
  idPrefix: string;
  onChange: (model: Model) => void;
}

export default function ShootingEffectFrequencyControl({model, ability, label, idPrefix, onChange}: Props) {
  const id = `${idPrefix}-${ability}-frequency`;
  return <div className="FightEffectFrequency">
    <label htmlFor={id}>{label}: частота</label>
    <select id={id} value={model.shootOnceAbilities.includes(ability) ? 'once' : 'each'}
      title={passiveShootAbilities.includes(ability)
        ? 'Каждая стрельба: правило действует в каждой стрельбе. Один раз за серию: правило действует всю первую стрельбу.'
        : 'Каждая стрельба: эффект доступен в каждой стрельбе. Один раз за серию: эффект расходуется при первом срабатывании во всей серии.'}
      onChange={event => {
        const once = model.shootOnceAbilities.filter(value => value !== ability);
        if (event.target.value === 'once') once.push(ability);
        onChange(Object.assign(new Model(), model, {shootOnceAbilities: once}));
      }}>
      <option value="each">Каждая стрельба</option>
      <option value="once">Один раз за серию</option>
    </select>
  </div>;
}

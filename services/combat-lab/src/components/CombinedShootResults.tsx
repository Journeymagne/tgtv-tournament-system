import React from 'react';
import Model from 'src/Model';
import {combineDmgProbs} from 'src/CalcEngineCommon';
import {injuryProb, killProb, weightedAverage} from 'src/Util';

interface Props {
  first: Map<number, Map<number, number>>;
  second: Map<number, Map<number, number>>;
  defender1: Model;
  defender2: Model;
}

export default function CombinedShootResults({first, second, defender1, defender2}: Props) {
  const distribution = React.useMemo(() => combineDmgProbs(
    first.get(defender1.diceStat)!, second.get(defender2.diceStat)!,
  ), [first, second, defender1.diceStat, defender2.diceStat]);
  const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

  return <section className="combined-shoot-results" aria-label="Ситуация 1 + 2">
    <h3>Ситуация 1 + 2</h3>
    <p><span>Раны цели из ситуации 1:</span> {defender1.wounds} <span>· Сейвы ситуаций 1 / 2:</span> {defender1.diceStat}+ / {defender2.diceStat}+</p>
    <dl className="combined-shoot-stats">
      <div><dt>Средний урон</dt><dd>{weightedAverage(distribution).toFixed(2)}</dd></div>
      <div><dt>Вероятность убийства</dt><dd>{percent(killProb(distribution, defender1.wounds))}</dd></div>
      <div><dt>Вероятность ранения</dt><dd>{percent(injuryProb(distribution, defender1.wounds))}</dd></div>
    </dl>
    <p>Ранение: цель выжила, осталось меньше половины ран.</p>
  </section>;
}

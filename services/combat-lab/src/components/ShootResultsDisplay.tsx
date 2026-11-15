import React from 'react';
import 'src/components/Controls.css';
import ProbabilityHistogram from 'src/components/ProbabilityHistogram';

import Model from 'src/Model';
import {
  toAscendingMap,
  weightedAverage,
  killProb,
  injuryProb,
  standardDeviation,
} from 'src/Util';
import { range } from 'lodash';

export interface Props {
  defender: Model;
  saveToDmgToProb: Map<number,Map<number,number>>;
}

const ShootResultsDisplay: React.FC<Props> = (props: Props) => {
  const digitsPastDecimal = 2;
  const toPercentString = (val: number) => (val * 100).toFixed(digitsPastDecimal);
  const saves = [...props.saveToDmgToProb.keys()].sort();

  const maxDmg = Math.max(...props.saveToDmgToProb.values().next().value.keys());
  const killChanceTableBody: JSX.Element[] = [];

  for(const wounds of range(1, maxDmg + 1)) {
    const killChances: number[] = [];

    for(const save of saves) {
      killChances.push(killProb(props.saveToDmgToProb.get(save)!, wounds));
    }

    killChanceTableBody.push(
      <tr key={`KillChance_${wounds}`}>
        <td>{wounds}</td>
        {killChances.map((killChance, index) => <td key={index}>{toPercentString(killChance)}%</td>)}
      </tr>
    );
  }

  const killChanceTable =
    <>
      <table className='DataTable'>
        <caption>KillChances for various Sv&amp;W...</caption>
        <thead>
          <tr>
            <th>W</th>
            {saves.map(save => <th key={'Sv' + save}>Sv={save}+</th>)}
          </tr>
        </thead>
        <tbody>
          {killChanceTableBody}
        </tbody>
      </table>
    </>;

  const saveToAvgDmgTableBody: JSX.Element[] = [];

  for(const save of saves) {
    const dmgToProb = props.saveToDmgToProb.get(save)!;
    const avgDmg = weightedAverage(dmgToProb);
    const stdDev = standardDeviation(dmgToProb);

    saveToAvgDmgTableBody.push(
      <tr key={`AvgDmg_${save}`}>
        <td>{save}+</td>
        <td>{avgDmg.toFixed(digitsPastDecimal)}</td>
        <td>{stdDev.toFixed(digitsPastDecimal)}</td>
      </tr>
    );
  }

  const saveToAvgDmgTable =
    <>
      <table className='DataTable'>
        <caption>AvgDmg for various Sv...</caption>
        <thead>
          <tr>
            <th>Sv</th>
            <th>AvgDmg</th>
            <th>StdDev</th>
          </tr>
        </thead>
        <tbody>
          {saveToAvgDmgTableBody}
        </tbody>
      </table>
    </>;

  let avgDmgUnbounded = 0;
  const dmgProbTableBody: JSX.Element[] = [];
  const histogramData: { dmg: number; prob: number }[] = [];

  const chosenSaveDmgToProb = props.saveToDmgToProb.get(props.defender.diceStat)!;
  const killChance = killProb(chosenSaveDmgToProb, props.defender.wounds);
  const injuryChance = injuryProb(chosenSaveDmgToProb, props.defender.wounds);
  let ascendingDmgToProb = toAscendingMap(chosenSaveDmgToProb);
  let probCumulative = 0;

  for(const [dmg, prob] of ascendingDmgToProb) {
    avgDmgUnbounded += dmg * prob;
    histogramData.push({ dmg, prob });

    const probAtLeastThisMuchDmg = 1 - probCumulative;
    probCumulative += prob;
    const probAtMostThisMuchDmg = probCumulative;

    dmgProbTableBody.push(
      <tr key={dmg}>
        <td>{dmg}</td>
        <td>{toPercentString(probAtLeastThisMuchDmg)}</td>
        <td>{toPercentString(probAtMostThisMuchDmg)}</td>
        <td>{toPercentString(prob)}</td>
      </tr>
    );
  }

  const histogram = (
    <ProbabilityHistogram
      data={histogramData}
      xKey="dmg"
      xLabel="Dmg"
      ariaLabel="Damage probability distribution"
      digitsPastDecimal={digitsPastDecimal}
      height={150}
    />
  );

  const dmgProbTable =
    <>
      {histogram}
      <table className='DataTable'>
        <caption>Damage probabilities for the chosen Sv and W</caption>
        <thead>
          <tr>
            <th>Dmg</th>
            <th>p(&gt;=Dmg)<br />(%)</th>
            <th>p(&lt;=Dmg)<br />(%)</th>
            <th>p(Dmg)<br />(%)</th>
          </tr>
        </thead>
        <tbody>
          {dmgProbTableBody}
        </tbody>
      </table>
    </>;

  // Header strings keep today's "Name: value" format; the row shows them split.
  const rows: { key: string; header: string; body: React.ReactNode }[] = [
    { key: 'avg', header: `Average Damage: ${avgDmgUnbounded.toFixed(digitsPastDecimal)}`, body: saveToAvgDmgTable },
    {
      key: 'injury',
      header: `Injury Chance: ${toPercentString(injuryChance)}%`,
      body: <>Probability of doing more than {(props.defender.wounds / 2).toFixed(1)} but less than {props.defender.wounds} wounds (injured but not killed)</>,
    },
    { key: 'kill', header: `Kill Chance: ${toPercentString(killChance)}%`, body: killChanceTable },
    { key: 'dist', header: 'Dmg probs for exact scenario', body: dmgProbTable },
  ];

  return (
    <div className='ResultList'>
      {rows.map(row => <ResultRow key={row.key} header={row.header}>{row.body}</ResultRow>)}
    </div>
  );
}

// One expandable result. Each row toggles on its own, like the separate
// accordions it replaces.
const ResultRow: React.FC<{ header: string; children: React.ReactNode }> = ({ header, children }) => {
  const [open, setOpen] = React.useState(false);
  const sep = header.indexOf(': ');
  const name = sep >= 0 ? header.slice(0, sep) : header;
  const value = sep >= 0 ? header.slice(sep + 2) : '';

  return (
    <div className='ResultRow'>
      <button
        type='button'
        className='ResultRow-btn'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {/* The hidden ": " keeps the row's text reading "Average Damage: 5.67". */}
        <span className='ResultRow-name'>{name}{value && <span className='sr-only'>: </span>}</span>
        {value && <span className='ResultRow-value'>{value}</span>}
        <svg className='ResultRow-chevron' width='14' height='14' viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'>
          <path fillRule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z' />
        </svg>
      </button>
      {open && <div className='ResultRow-body'>{children}</div>}
    </div>
  );
};

export default ShootResultsDisplay;

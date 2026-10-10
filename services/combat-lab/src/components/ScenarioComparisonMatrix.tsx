import React from 'react';
import { killProb, weightedAverage } from 'src/Util';
import { range } from 'lodash';
import * as T from 'src/theme';
import Panel from 'src/components/Panel';

export interface Props {
  saveToDmgToProb1: Map<number, Map<number, number>>;
  saveToDmgToProb2: Map<number, Map<number, number>>;
  saveToDmgToProbCombined: Map<number, Map<number, number>>;
  comboWounds: number;
}

// Comparison-cell fills (better / worse / equal), with darker zebra variants.
const betterStyle: React.CSSProperties = { backgroundColor: T.better };
const worseStyle: React.CSSProperties = { backgroundColor: T.worse };
const equalStyle: React.CSSProperties = { backgroundColor: T.equal };
const betterStyleAlt: React.CSSProperties = { backgroundColor: T.betterAlt };
const worseStyleAlt: React.CSSProperties = { backgroundColor: T.worseAlt };
const equalStyleAlt: React.CSSProperties = { backgroundColor: T.equalAlt };
const lightTheadStyle: React.CSSProperties = { backgroundColor: T.subtleBg, color: T.textInk };

const softBox: React.CSSProperties = { border: `1px solid ${T.borderSoft}`, borderRadius: '4px', background: T.panelBg };
const tableBase: React.CSSProperties = {
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  borderCollapse: 'collapse',
  margin: 0,
};

const legendChip = (bg: string): React.CSSProperties => ({
  backgroundColor: bg,
  color: T.textInk,
  padding: '1px 6px',
  borderRadius: '2px',
});

// Epsilon for treating a diff as zero; kept in sync with getComparisonStyles
// so that cells styled as "Equal" never render a misleading signed zero (e.g.
// "+0%") in the Δ column.
const DIFF_EPSILON = 0.001;
const isEqualDiff = (diff: number) => Math.abs(diff) < DIFF_EPSILON;

function getComparisonStyles(diff: number, alt = false): [React.CSSProperties, React.CSSProperties] {
  const better = alt ? betterStyleAlt : betterStyle;
  const worse = alt ? worseStyleAlt : worseStyle;
  const equal = alt ? equalStyleAlt : equalStyle;
  if (isEqualDiff(diff)) {
    return [equal, equal];
  } else if (diff > 0) {
    return [better, worse];
  } else {
    return [worse, better];
  }
}

const ScenarioComparisonMatrix: React.FC<Props> = (props: Props) => {
  const [showSv6, setShowSv6] = React.useState(false);
  const allSaves = [...props.saveToDmgToProb1.keys()].sort();
  const saves = showSv6 ? allSaves : allSaves.filter(s => s !== 6);
  const woundRange = range(1, 26); // 1 to 25 wounds
  const toPercentString = (val: number) => (val * 100).toFixed(0);
  const { comboWounds, saveToDmgToProbCombined } = props;

  // Precompute per-save Avg + kill chances + per-save lastNonZeroWound
  const perSave = saves.map(save => {
    const dmgToProb1 = props.saveToDmgToProb1.get(save)!;
    const dmgToProb2 = props.saveToDmgToProb2.get(save)!;
    const avg1 = weightedAverage(dmgToProb1);
    const avg2 = weightedAverage(dmgToProb2);
    let lastNonZeroWound = 0;
    const kc1: number[] = [];
    const kc2: number[] = [];
    for (const w of woundRange) {
      const k1 = killProb(dmgToProb1, w);
      const k2 = killProb(dmgToProb2, w);
      kc1.push(k1);
      kc2.push(k2);
      if (k1 > 0 || k2 > 0) lastNonZeroWound = w;
    }
    return { save, avg1, avg2, kc1, kc2, lastNonZeroWound };
  });

  const globalLastNonZeroWound = Math.max(0, ...perSave.map(p => p.lastNonZeroWound));
  const visibleWounds = woundRange.filter(w => w <= globalLastNonZeroWound);

  const cellBase: React.CSSProperties = { textAlign: 'center', padding: '3px 4px', borderBottom: `1px solid ${T.hairline}` };
  const subHeaderStyle: React.CSSProperties = { ...cellBase, fontSize: '11px', fontWeight: 600, color: T.textMuted, borderBottom: `2px solid ${T.borderMuted}` };
  // 2px divider between save-groups — an internal table rule, not a card accent.
  const groupHeaderStyle: React.CSSProperties = {
    ...cellBase,
    borderLeft: `2px solid ${T.borderMuted}`,
  };
  const groupCellStyle: React.CSSProperties = {
    borderLeft: `2px solid ${T.borderMuted}`,
  };
  const zebraEven: React.CSSProperties = { backgroundColor: T.zebraEven };
  const zebraOdd: React.CSSProperties = { backgroundColor: T.zebraOdd };
  const wColEven: React.CSSProperties = { backgroundColor: T.wColEven };
  const wColOdd: React.CSSProperties = { backgroundColor: T.wColOdd };
  const labelCellStyle: React.CSSProperties = { ...cellBase, fontWeight: 'bold', backgroundColor: T.labelCellBg };

  const renderSaveCells = (
    save: number,
    v1: number,
    v2: number,
    diff: number,
    fmt: (n: number) => string,
    rowBg: React.CSSProperties,
    diffPrefix: boolean,
    alt: boolean,
  ) => {
    const [s1Style, s2Style] = getComparisonStyles(diff, alt);
    return (
      <React.Fragment key={`cells_${save}`}>
        <td style={{ ...cellBase, ...groupCellStyle, ...rowBg, ...s1Style }}>{fmt(v1)}</td>
        <td style={{ ...cellBase, ...rowBg, ...s2Style }}>{fmt(v2)}</td>
        <td style={{ ...cellBase, ...rowBg }}>
          {isEqualDiff(diff) ? fmt(0) : `${diffPrefix && diff > 0 ? '+' : ''}${fmt(diff)}`}
        </td>
      </React.Fragment>
    );
  };

  const matrixTable = (
    <div style={{ ...softBox, flex: '1 1 600px', minWidth: 0, overflowX: 'auto' }}>
      <table aria-label='Comparison matrix: average damage and kill chance by wounds' style={{ ...tableBase, width: '100%' }}>
        <thead style={lightTheadStyle}>
          <tr>
            <th rowSpan={2} style={{ ...cellBase, verticalAlign: 'middle', width: '50px', borderBottom: `2px solid ${T.borderMuted}` }}>W</th>
            {perSave.map(p => (
              <th key={`gh_${p.save}`} colSpan={3} style={groupHeaderStyle}>
                Sv {p.save}+
              </th>
            ))}
          </tr>
          <tr>
            {perSave.map(p => (
              <React.Fragment key={`sh_${p.save}`}>
                <th style={{ ...subHeaderStyle, ...groupCellStyle }}>S1</th>
                <th style={subHeaderStyle}>S2</th>
                <th style={subHeaderStyle}>Δ</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={labelCellStyle}>Avg</td>
            {perSave.map(p => {
              const diff = p.avg1 - p.avg2;
              return renderSaveCells(p.save, p.avg1, p.avg2, diff, (n) => n.toFixed(2), labelCellStyle, true, false);
            })}
          </tr>
          {visibleWounds.map((w, idx) => {
            const rowBg = idx % 2 === 0 ? zebraEven : zebraOdd;
            const wBg = idx % 2 === 0 ? wColEven : wColOdd;
            return (
              <tr key={`row_w_${w}`}>
                <td style={{ ...cellBase, ...wBg, fontWeight: 'bold' }}>{w}</td>
                {perSave.map(p => {
                  if (w > p.lastNonZeroWound) {
                    return (
                      <React.Fragment key={`cells_${p.save}_${w}`}>
                        <td style={{ ...cellBase, ...groupCellStyle, ...rowBg, color: T.textFaint }}>0%</td>
                        <td style={{ ...cellBase, ...rowBg, color: T.textFaint }}>0%</td>
                        <td style={{ ...cellBase, ...rowBg }}>—</td>
                      </React.Fragment>
                    );
                  }
                  const k1 = p.kc1[idx];
                  const k2 = p.kc2[idx];
                  const diff = k1 - k2;
                  return renderSaveCells(p.save, k1, k2, diff, (n) => `${toPercentString(n)}%`, rowBg, true, idx % 2 === 1);
                })}
              </tr>
            );
          })}
          {globalLastNonZeroWound < woundRange[woundRange.length - 1] && (
            <tr key="row_zero_tail">
              <td style={{ ...cellBase, ...zebraEven, fontWeight: 'bold' }}>{globalLastNonZeroWound + 1}+</td>
              <td style={{ ...cellBase, ...zebraEven, color: T.textFaint }} colSpan={perSave.length * 3}>0%</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const comboCell: React.CSSProperties = { padding: '3px 10px', textAlign: 'right', borderTop: `1px solid ${T.hairline}` };
  const comboBlock = (
    <div style={{ ...softBox, flex: 'none', overflow: 'hidden' }}>
      <div style={{ background: T.subtleBg, padding: '5px 10px', fontSize: '12px', borderBottom: `1px solid ${T.borderSoft}` }}>
        <b>S1 &amp; S2 Combined</b> <span style={{ color: T.textMuted }}>· vs W={comboWounds}</span>
      </div>
      <table aria-label='Combined average damage and kill chance by save' style={tableBase}>
        <thead>
          <tr>
            <th style={{ ...comboCell, textAlign: 'left', borderTop: 0 }}>Sv</th>
            <th style={{ ...comboCell, borderTop: 0 }}>Avg</th>
            <th style={{ ...comboCell, borderTop: 0 }}>Kill%</th>
          </tr>
        </thead>
        <tbody>
          {saves.map(save => {
            const dmgToProb = saveToDmgToProbCombined.get(save)!;
            const avgDmg = weightedAverage(dmgToProb);
            const kill = killProb(dmgToProb, comboWounds);
            return (
              <tr key={`combo_${save}`}>
                <td style={{ ...comboCell, textAlign: 'left', fontWeight: 600 }}>{save}+</td>
                <td style={comboCell}>{avgDmg.toFixed(2)}</td>
                <td style={comboCell}>{toPercentString(kill)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // Legend and the Sv 6+ toggle live in the title bar.
  const headerRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px', fontWeight: 'normal', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', gap: '6px' }}>
        <span style={legendChip(T.better)}>Better</span>
        <span style={legendChip(T.worse)}>Worse</span>
        <span style={legendChip(T.equal)}>Equal</span>
      </span>
      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', marginBottom: 0 }}>
        <input
          type="checkbox"
          checked={showSv6}
          onChange={e => setShowSv6(e.target.checked)}
          style={{ cursor: 'pointer', margin: 0 }}
        />
        Show Sv 6+
      </label>
    </div>
  );

  return (
    <Panel
      title="Comparison Matrix (Avg Dmg + Kill % vs W)"
      right={headerRight}
      fullWidth
      bodyStyle={{ padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}
    >
      {comboBlock}
      {matrixTable}
    </Panel>
  );
};

export default ScenarioComparisonMatrix;

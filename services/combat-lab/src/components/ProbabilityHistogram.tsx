import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

import { ThemeAccentOrange } from 'src/KtMisc';
import { toPercentString } from 'src/Util';
import * as T from 'src/theme';

export interface Props {
  // Each datum: { [xKey]: number; prob: number } where prob is 0..1
  data: Array<Record<string, number>>;
  xKey: string;
  xLabel: string;
  height?: number;
  ariaLabel?: string;
  digitsPastDecimal?: number;
}

const ProbabilityHistogram: React.FC<Props> = ({
  data,
  xKey,
  xLabel,
  height = 160,
  ariaLabel,
  digitsPastDecimal = 2,
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 20 }} aria-label={ariaLabel} role="img">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={T.hairline} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 10, fill: T.textMuted }}
          label={{ value: xLabel, position: 'insideBottom', offset: -15, fontSize: 10, fill: T.textMuted }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: T.textMuted }}
          tickFormatter={(v: number) => `${toPercentString(v, 0)}%`}
        />
        <Tooltip
          formatter={(v: number) => `${toPercentString(v, digitsPastDecimal)}%`}
          labelFormatter={(l) => `${xLabel} ${l}`}
        />
        <Bar dataKey="prob" fill={ThemeAccentOrange} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ProbabilityHistogram;

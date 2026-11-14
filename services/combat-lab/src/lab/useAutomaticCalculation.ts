import React from 'react';
import useCalculationWorker from './useCalculationWorker';

export default function useAutomaticCalculation<Job, Result extends {id: number; error?: string}>(
  makeWorker: () => Worker,
  job: Job,
  stamp: string,
  active: boolean,
) {
  const calc = useCalculationWorker<Job, Result>(makeWorker);
  const latestJob = React.useRef(job);
  latestJob.current = job;
  const timer = React.useRef<ReturnType<typeof setTimeout>>();
  const start = calc.run;
  const stop = calc.cancel;
  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    stop();
  }, [stop]);
  const run = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (active) start(latestJob.current, stamp);
  }, [active, stamp, start]);

  React.useEffect(() => {
    if (!active) return;
    timer.current = setTimeout(run, 250);
    return cancel;
  }, [active, run, cancel]);

  return {...calc, run, cancel};
}

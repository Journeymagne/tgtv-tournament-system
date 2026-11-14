import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import useAutomaticCalculation from './useAutomaticCalculation';

class WorkerStub {
  onmessage: ((event: {data: {id: number; value: number}}) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: {id: number; value: number} | null = null;
  terminate = jest.fn();
  postMessage(job: {id: number; value: number}) { this.sent = job; }
  reply(value: number) { this.onmessage?.({data: {id: this.sent!.id, value}}); }
}

let workers: WorkerStub[];
const makeWorker = () => {
  const worker = new WorkerStub();
  workers.push(worker);
  return worker as unknown as Worker;
};
function Harness({active = true}: {active?: boolean}) {
  const [value, setValue] = React.useState(1);
  // A fresh job object on every render must not restart the calculation.
  const calc = useAutomaticCalculation<{value: number}, {id: number; value: number}>(
    makeWorker, {value}, `value-${value}`, active,
  );
  return <>
    <input aria-label="Value" value={value} onChange={event => setValue(Number(event.target.value))}/>
    <button onClick={calc.cancel}>Cancel</button><button onClick={calc.run}>Retry</button>
    <output>{calc.busy ? 'busy' : 'idle'}:{calc.result?.value ?? 'empty'}:{calc.stamp}</output>
    {calc.error && <p role="alert">{calc.error}</p>}
  </>;
}
const advance = (ms = 250) => act(() => { jest.advanceTimersByTime(ms); });
const change = (value: number) => fireEvent.change(screen.getByLabelText('Value'), {target: {value: String(value)}});

beforeEach(() => { workers = []; jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

it('calculates on opening and does not restart when the result renders', () => {
  render(<Harness/>);
  advance(249);
  expect(screen.getByRole('status').textContent).toBe('idle:empty:');
  advance(1);
  expect(workers[0].sent?.value).toBe(1);
  expect(screen.getByRole('status').textContent).toBe('busy:empty:');
  act(() => workers[0].reply(11));
  expect(screen.getByRole('status').textContent).toBe('idle:11:value-1');
  advance(1000);
  expect(workers).toHaveLength(1);
});

it('debounces rapid edits and rejects the obsolete worker result', () => {
  render(<Harness/>); advance();
  change(2);
  act(() => workers[0].reply(99));
  expect(screen.getByRole('status').textContent).toBe('idle:empty:');
  advance(100); change(3); advance(249);
  expect(workers).toHaveLength(1);
  advance(1);
  expect(workers[1].sent?.value).toBe(3);
  act(() => workers[1].reply(30));
  expect(screen.getByRole('status').textContent).toBe('idle:30:value-3');
});

it('cancels pending and active work until the next edit or manual retry', () => {
  render(<Harness/>);
  fireEvent.click(screen.getByText('Cancel')); advance(1000);
  expect(workers).toHaveLength(0);
  change(2); advance();
  fireEvent.click(screen.getByText('Cancel'));
  act(() => workers[0].reply(99)); advance(1000);
  expect(screen.getByRole('status').textContent).toBe('idle:empty:');
  expect(workers).toHaveLength(1);
  fireEvent.click(screen.getByText('Retry'));
  act(() => workers[1].reply(20));
  expect(screen.getByRole('status').textContent).toBe('idle:20:value-2');
});

it('only calculates the active view and cancels when leaving it', () => {
  const view = render(<Harness active={false}/>); advance(1000);
  expect(workers).toHaveLength(0);
  view.rerender(<Harness/>); advance();
  view.rerender(<Harness active={false}/>);
  act(() => workers[0].reply(99)); change(2); advance(1000);
  expect(screen.getByRole('status').textContent).toBe('idle:empty:');
  expect(workers).toHaveLength(1);
});

it('does not loop on worker errors and allows retrying unchanged inputs', () => {
  render(<Harness/>); advance(); advance(60000);
  expect(screen.getByRole('alert').textContent).toContain('больше минуты');
  advance(1000); expect(workers).toHaveLength(1);
  fireEvent.click(screen.getByText('Retry'));
  act(() => workers[1].reply(11));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('idle:11:value-1');
});

import React from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import useCalculationWorker from './useCalculationWorker';

class WorkerStub{
 onmessage:((event:{data:{id:number;value:number}})=>void)|null=null;
 onerror:(()=>void)|null=null;
 postMessage=jest.fn();terminate=jest.fn();
 reply(id:number,value:number){this.onmessage?.({data:{id,value}});}
}
let workers:WorkerStub[]=[];
function Harness(){
 const calc=useCalculationWorker<{value:number},{id:number;value:number}>(()=>{const w=new WorkerStub();workers.push(w);return w as unknown as Worker;});
 return <><button onClick={()=>calc.run({value:7},'snapshot')}>Run</button><button onClick={calc.cancel}>Cancel</button><output data-testid="state">{calc.busy?'busy':'idle'}:{calc.result?.value??'empty'}:{calc.stamp}</output>{calc.error&&<p role="alert">{calc.error}</p>}</>;
}
beforeEach(()=>{workers=[];});
afterEach(()=>jest.useRealTimers());
it('does not start until requested and publishes the matching result',()=>{
 render(<Harness/>);expect(workers).toHaveLength(0);fireEvent.click(screen.getByText('Run'));expect(workers).toHaveLength(1);
 const sent=workers[0].postMessage.mock.calls[0][0];expect(sent.value).toBe(7);
 act(()=>workers[0].reply(sent.id,42));expect(screen.getByTestId('state').textContent).toBe('idle:42:snapshot');expect(workers[0].terminate).toHaveBeenCalled();
});
it('ignores a response arriving after cancellation',()=>{
 render(<Harness/>);fireEvent.click(screen.getByText('Run'));const sent=workers[0].postMessage.mock.calls[0][0];fireEvent.click(screen.getByText('Cancel'));
 act(()=>workers[0].reply(sent.id,42));expect(screen.getByTestId('state').textContent).toBe('idle:empty:');expect(workers[0].terminate).toHaveBeenCalled();
});
it('ignores a response from a replaced job',()=>{
 render(<Harness/>);fireEvent.click(screen.getByText('Run'));const first=workers[0].postMessage.mock.calls[0][0];fireEvent.click(screen.getByText('Run'));const second=workers[1].postMessage.mock.calls[0][0];
 act(()=>workers[0].reply(first.id,99));expect(screen.getByTestId('state').textContent).toBe('busy:empty:');
 act(()=>workers[1].reply(second.id,42));expect(screen.getByTestId('state').textContent).toBe('idle:42:snapshot');
});
it('stops timed out work and lets the user retry',()=>{
 jest.useFakeTimers();render(<Harness/>);fireEvent.click(screen.getByText('Run'));act(()=>jest.advanceTimersByTime(60000));
 expect(workers[0].terminate).toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('больше минуты');fireEvent.click(screen.getByText('Run'));expect(workers).toHaveLength(2);expect(screen.queryByRole('alert')).toBeNull();
});

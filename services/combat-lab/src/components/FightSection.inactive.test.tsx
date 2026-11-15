import React from 'react';
import {act,render} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ShareProvider} from 'src/context/ShareContext';
import {createCalculatorWorker} from 'src/lab/createWorkers';
import FightSection from './FightSection';
const factory=createCalculatorWorker as jest.Mock;
beforeEach(()=>{jest.useFakeTimers();factory.mockImplementation(()=>({postMessage:jest.fn(),terminate:jest.fn(),onmessage:null,onerror:null}));});
afterEach(()=>jest.useRealTimers());
const tree=(isActive:boolean)=><MemoryRouter><ShareProvider><FightSection isActive={isActive}/></ShareProvider></MemoryRouter>;
it('calculates after activation and stops an active job when leaving the view',()=>{
 const view=render(tree(false));expect(factory).not.toHaveBeenCalled();
 view.rerender(tree(true));expect(factory).not.toHaveBeenCalled();
 act(()=>jest.advanceTimersByTime(250));expect(factory).toHaveBeenCalledTimes(1);
 const worker=factory.mock.results[0].value;expect(worker.postMessage.mock.calls[0][0].mode).toBe('fight');
 view.rerender(tree(false));expect(worker.terminate).toHaveBeenCalled();
});

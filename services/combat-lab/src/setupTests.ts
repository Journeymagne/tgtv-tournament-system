// Browser verification runs the actual workers. jsdom component tests use inert worker factories.
jest.mock('src/lab/createWorkers',()=>({
 createCalculatorWorker:jest.fn(()=>({postMessage:jest.fn(),terminate:jest.fn(),onmessage:null,onerror:null})),
 createSimulationWorker:jest.fn(()=>({postMessage:jest.fn(),terminate:jest.fn(),onmessage:null,onerror:null})),
}));
export {};

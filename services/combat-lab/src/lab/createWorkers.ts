export const createCalculatorWorker=()=>new Worker(new URL('./calculator.worker.ts',import.meta.url));
export const createSimulationWorker=()=>new Worker(new URL('../simulation/simulation.worker.ts',import.meta.url));

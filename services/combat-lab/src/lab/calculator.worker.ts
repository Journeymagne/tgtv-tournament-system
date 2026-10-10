import {calcDmgProbs} from 'src/CalcEngineShoot';
import {calcRemainingWounds} from 'src/CalcEngineFight';
import {SaveRange} from 'src/KtMisc';
import {hydrate} from 'src/simulation/model';
import {CalculatorJob,CalculatorResult} from './calculatorJob';
const scope=globalThis as unknown as Worker;
scope.onmessage=(event:MessageEvent<CalculatorJob&{id:number}>)=>{
  const job=event.data;const start=performance.now();
  try{
    let result:CalculatorResult;
    if(job.mode==='shoot'){
      const a1=hydrate(job.attacker1),d1=hydrate(job.defender1),a2=hydrate(job.attacker2),d2=hydrate(job.defender2);
      const first:[number,[number,number][]][]=SaveRange.map(save=>[save,[...calcDmgProbs(a1,d1.withProp('diceStat',save),job.options1)]]);
      const second:[number,[number,number][]][]=SaveRange.map(save=>[save,[...calcDmgProbs(a2,d2.withProp('diceStat',save),job.options2)]]);
      result={id:job.id,mode:job.mode,first,second,elapsed:performance.now()-start};
    }else{
      const a=hydrate(job.fighterA),b=hydrate(job.fighterB),o=job.options,first=o.firstFighter==='A';
      const [x,y]=calcRemainingWounds(first?a:b,first?b:a,first?o.strategyFighterA:o.strategyFighterB,first?o.strategyFighterB:o.strategyFighterA,o.numRounds);
      result={id:job.id,mode:job.mode,woundsA:[...(first?x:y)],woundsB:[...(first?y:x)],elapsed:performance.now()-start};
    }
    scope.postMessage(result);
  }catch(e){scope.postMessage({id:job.id,error:e instanceof Error?e.message:String(e)});}
};
export {};

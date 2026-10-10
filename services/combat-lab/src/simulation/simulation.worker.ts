import {calcDmgProbs} from 'src/CalcEngineShoot';
import {calcRemainingWoundPairProbs,consolidateWoundPairProbs} from 'src/CalcEngineFightInternal';
import FightStrategy from 'src/FightStrategy';
import Ability from 'src/Ability';
import {weightedAverage,killProb} from 'src/Util';
import {hydrate} from './model';
import {Job,Result} from './types';
const workerScope=globalThis as unknown as Worker;
workerScope.onmessage=(event:MessageEvent<Job>)=>{const j=event.data;const start=performance.now();try{const a=hydrate(j.a),b=hydrate(j.b);let output:Result;
 if(j.mode==='shoot'){if(a.abilities.has(Ability.ObscuredTarget))a.abilities.delete(Ability.ObscuredTarget);const distribution=calcDmgProbs(a,b);output={id:j.id,mode:j.mode,distributionA:[...distribution].sort((a,b)=>a[0]-b[0]),distributionB:[],avgA:weightedAverage(distribution),avgB:0,killA:killProb(distribution,b.wounds),killB:0,injury:[...distribution].reduce((sum,[d,p])=>sum+(b.wounds-d<(j.targetStartingWounds||b.wounds)/2?p:0),0),simulations:0,elapsed:performance.now()-start};}
 else{const first=j.first==='A';const joint=calcRemainingWoundPairProbs(first?a:b,first?b:a,FightStrategy.MaxDmgToEnemy,FightStrategy.MaxDmgToEnemy,1,j.simulations);const [x,y]=consolidateWoundPairProbs(joint);const da=first?x:y,db=first?y:x;output={id:j.id,mode:j.mode,distributionA:[...da].sort((a,b)=>a[0]-b[0]),distributionB:[...db].sort((a,b)=>a[0]-b[0]),avgA:weightedAverage(da),avgB:weightedAverage(db),killA:db.get(0)||0,killB:da.get(0)||0,injury:0,simulations:j.simulations,elapsed:performance.now()-start};}
 workerScope.postMessage(output);
 }catch(e){workerScope.postMessage({id:j.id,error:e instanceof Error?e.message:String(e)});}};
export {};

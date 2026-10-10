import React from 'react';
import Panel from 'src/components/Panel';
import 'src/components/Controls.css';

import { clone } from 'lodash';
import Note, * as N from 'src/Notes';
import NotesList from 'src/components/NotesList';
import { attackerNotedControls } from 'src/components/AttackerControls';
import { defenderNotedControls } from 'src/components/DefenderControls';
import { notesFromControls } from 'src/components/controlNotes';
import { ShootSituation } from './ShootSituation';
import Model from 'src/Model';
import ShootOptions from 'src/ShootOptions';
import { SaveRange } from 'src/KtMisc';
import ScenarioComparisonMatrix from './ScenarioComparisonMatrix';
import { combineDmgProbs } from 'src/CalcEngineCommon';
import { useUrlState, getStateFromUrl } from 'src/hooks/useUrlState';
import {createCalculatorWorker} from 'src/lab/createWorkers';
import useCalculationWorker from 'src/lab/useCalculationWorker';
import {ShootJob,CalculatorResult} from 'src/lab/calculatorJob';
import {pack,hydrate} from 'src/simulation/model';
import {EmptyResult,ProfileTitle,ResultNotice,ResultsHeader,RunPanel,profileStamp} from 'src/lab/LabUi';
import ShootResultsDisplay from './ShootResultsDisplay';
import { useShareContext } from 'src/context/ShareContext';

interface ShootSectionProps {
  isActive: boolean;
}

// Control notes come from the attacker and defender catalogs those panels render. A rule that is
// basic on either panel stays in Basic (Punishing and Reroll are always visible on one side).
const shootControlNotes = notesFromControls([
  ...attackerNotedControls,
  ...defenderNotedControls,
]);
// AvgDamageUnbounded explains the results "Average Damage" figure. It is not a control.
const notes: Note[] = [N.AvgDamageUnbounded, ...shootControlNotes.notes];
const advancedNotes = shootControlNotes.advancedNotes;


const ShootSection: React.FC<ShootSectionProps> = ({ isActive }) => {
  const initialState=React.useMemo(()=>getStateFromUrl(),[]);
  const [attacker1,setAttacker1]=React.useState(()=>initialState.s1?.attacker??new Model());
  const [defender1,setDefender1]=React.useState(()=>initialState.s1?.defender??Model.basicDefender());
  const [shootOptions1,setShootOptions1]=React.useState(()=>initialState.s1?.shootOptions??new ShootOptions());
  const [attacker2,setAttacker2]=React.useState(()=>initialState.s2?.attacker??new Model());
  const [defender2,setDefender2]=React.useState(()=>initialState.s2?.defender??Model.basicDefender());
  const [shootOptions2,setShootOptions2]=React.useState(()=>initialState.s2?.shootOptions??new ShootOptions());
  const {getShareUrl,addParamsToUrl}=useUrlState(attacker1,defender1,shootOptions1,attacker2,defender2,shootOptions2);
  const {setShareFunctions}=useShareContext();
  React.useEffect(()=>{if(isActive)setShareFunctions({getShareUrl,addParamsToUrl});},[isActive,getShareUrl,addParamsToUrl,setShareFunctions]);
  const calc=useCalculationWorker<ShootJob,CalculatorResult>(createCalculatorWorker);
  const cancel=calc.cancel;
  React.useEffect(()=>{if(!isActive)cancel();},[isActive,cancel]);
  const currentStamp=profileStamp({attacker1,defender1,shootOptions1,attacker2,defender2,shootOptions2});
  const dirty=!!calc.result&&currentStamp!==calc.stamp;
  const first=React.useMemo(()=>new Map((calc.result?.first||[]).map(([save,distribution])=>[save,new Map(distribution)])),[calc.result]);
  const second=React.useMemo(()=>new Map((calc.result?.second||[]).map(([save,distribution])=>[save,new Map(distribution)])),[calc.result]);
  const combined=React.useMemo(()=>new Map(SaveRange.map(save=>[save,combineDmgProbs(first.get(save)||new Map(),second.get(save)||new Map())])),[first,second]);
  const run=()=>{if(isActive)calc.run({mode:'shoot',attacker1:pack(attacker1),defender1:pack(defender1),options1:shootOptions1,attacker2:pack(attacker2),defender2:pack(defender2),options2:shootOptions2},currentStamp);};
  const copy=()=>{setAttacker2(clone(attacker1));setDefender2(clone(defender1));setShootOptions2(clone(shootOptions1));};
  return <div className="calculator-section">
    <div className="calc-profile-grid">
      <Panel title={<ProfileTitle letter="A" title="Situation 1"/>} fullWidth className="calc-profile-card" bodyScrollX bodyStyle={{padding:'18px 20px'}}>
        <ShootSituation idPrefix="s1" attacker={attacker1} setAttacker={setAttacker1} defender={defender1} setDefender={setDefender1} shootOptions={shootOptions1} setShootOptions={setShootOptions1} saveToDmgToProb={first} showResults={false}/>
      </Panel>
      <Panel title={<ProfileTitle letter="B" title="Situation 2"/>} right={<button type="button" className="lab-button lab-button-secondary lab-button-small" onClick={copy}>Скопировать A</button>} fullWidth className="calc-profile-card" bodyScrollX bodyStyle={{padding:'18px 20px'}}>
        <ShootSituation idPrefix="s2" attacker={attacker2} setAttacker={setAttacker2} defender={defender2} setDefender={setDefender2} shootOptions={shootOptions2} setShootOptions={setShootOptions2} saveToDmgToProb={second} showResults={false}/>
      </Panel>
    </div>
    <RunPanel context="Два профиля · точное распределение" detail="Все свойства оружия и защиты задаются вручную" busy={calc.busy} onRun={run} onCancel={calc.cancel}/>
    <section className="results-panel" aria-live="polite" aria-busy={calc.busy}>
      <ResultsHeader hasResult={!!calc.result} extra={calc.result&&<span className="calculation-label">EXACT · {Math.round(calc.result.elapsed)} мс</span>}/>
      <ResultNotice busy={calc.busy} dirty={dirty} error={calc.error}/>
      {calc.result&&calc.job?<><div className="calc-result-grid"><div><h3>Situation 1 · A</h3><ShootResultsDisplay saveToDmgToProb={first} defender={hydrate(calc.job.defender1)}/></div><div><h3>Situation 2 · B</h3><ShootResultsDisplay saveToDmgToProb={second} defender={hydrate(calc.job.defender2)}/></div></div><ScenarioComparisonMatrix saveToDmgToProb1={first} saveToDmgToProb2={second} saveToDmgToProbCombined={combined} comboWounds={calc.job.defender1.wounds}/></>:<EmptyResult/>}
    </section>
    <details className="lab-notes"><summary>Правила и пояснения</summary><NotesList notes={notes} advancedNotes={advancedNotes}/></details>
  </div>;
};
export default ShootSection;

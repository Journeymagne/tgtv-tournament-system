import React from 'react';
import Panel from 'src/components/Panel';
import FighterControls, { fighterNotedControls } from 'src/components/FighterControls';
import Model from 'src/Model';
import FightOptionControls from 'src/components/FightOptionControls';
import FightResultsDisplay from 'src/components/FightResultsDisplay';
import FightOptions from 'src/FightOptions';
import NotesList from 'src/components/NotesList';
import { notesFromControls } from 'src/components/controlNotes';
import { getFightStateFromUrl, useFightUrlState } from 'src/hooks/useUrlState';
import {createCalculatorWorker} from 'src/lab/createWorkers';
import useCalculationWorker from 'src/lab/useCalculationWorker';
import {FightJob,CalculatorResult} from 'src/lab/calculatorJob';
import {pack} from 'src/simulation/model';
import {EmptyResult,ProfileTitle,ResultNotice,ResultsHeader,RunPanel,profileStamp} from 'src/lab/LabUi';
import { useShareContext } from 'src/context/ShareContext';

interface FightSectionProps {
  isActive: boolean;
}

// Built from the same catalogs FighterControls renders, so the panel cannot list a rule the card
// does not have (or omit one it does). Close Assault and Waaagh are NicheAbility dropdown values.
const { notes, advancedNotes } = notesFromControls(fighterNotedControls);


const FightSection: React.FC<FightSectionProps> = ({ isActive }) => {
  const initialState=React.useMemo(()=>getFightStateFromUrl(),[]);
  const [fighterA,setFighterA]=React.useState(()=>initialState?.fighterA??new Model());
  const [fighterB,setFighterB]=React.useState(()=>initialState?.fighterB??new Model());
  const [fightOptions,setFightOptions]=React.useState(()=>initialState?.fightOptions??new FightOptions());
  const {getShareUrl,addParamsToUrl}=useFightUrlState(fighterA,fighterB,fightOptions);
  const {setShareFunctions}=useShareContext();
  React.useEffect(()=>{if(isActive)setShareFunctions({getShareUrl,addParamsToUrl});},[isActive,getShareUrl,addParamsToUrl,setShareFunctions]);
  const calc=useCalculationWorker<FightJob,CalculatorResult>(createCalculatorWorker);
  const cancel=calc.cancel;
  React.useEffect(()=>{if(!isActive)cancel();},[isActive,cancel]);
  const currentStamp=profileStamp({fighterA,fighterB,fightOptions});
  const dirty=!!calc.result&&currentStamp!==calc.stamp;
  const woundsA=React.useMemo(()=>new Map(calc.result?.woundsA||[]),[calc.result]);
  const woundsB=React.useMemo(()=>new Map(calc.result?.woundsB||[]),[calc.result]);
  const run=()=>{if(isActive)calc.run({mode:'fight',fighterA:pack(fighterA),fighterB:pack(fighterB),options:fightOptions},currentStamp);};
  return <div className="calculator-section">
    <div className="calc-profile-grid">
      <Panel title={<ProfileTitle letter="A" title="Fighter A"/>} fullWidth className="calc-profile-card" bodyStyle={{padding:'18px 20px'}} bodyScrollX><FighterControls idPrefix="fa" attacker={fighterA} changeHandler={setFighterA}/></Panel>
      <Panel title={<ProfileTitle letter="B" title="Fighter B"/>} fullWidth className="calc-profile-card" bodyStyle={{padding:'18px 20px'}} bodyScrollX><FighterControls idPrefix="fb" attacker={fighterB} changeHandler={setFighterB}/></Panel>
    </div>
    <Panel title="Параметры боя" fullWidth className="calc-fight-options" bodyStyle={{padding:'16px 20px'}} bodyScrollX><FightOptionControls idPrefix="fo" fightOptions={fightOptions} changeHandler={setFightOptions}/></Panel>
    <RunPanel context="Ближний бой · выбранные стратегии" detail="Порядок ударов и число раундов задаются в параметрах боя" busy={calc.busy} onRun={run} onCancel={calc.cancel}/>
    <section className="results-panel" aria-live="polite" aria-busy={calc.busy}>
      <ResultsHeader hasResult={!!calc.result} extra={calc.result&&<span className="calculation-label">MONTE CARLO · {Math.round(calc.result.elapsed)} мс</span>}/>
      <ResultNotice busy={calc.busy} dirty={dirty} error={calc.error}/>
      {calc.result&&calc.job?<div className="calc-fight-results"><FightResultsDisplay fighterAWoundProbs={woundsA} fighterBWoundProbs={woundsB} fighterAWoundsOrig={calc.job.fighterA.wounds} fighterBWoundsOrig={calc.job.fighterB.wounds}/></div>:<EmptyResult/>}
    </section>
    <details className="lab-notes"><summary>Правила и пояснения</summary><NotesList notes={notes} advancedNotes={advancedNotes}>
              <li>
                All strategies will do certain no-downside actions, with the consequence that
                "Strike" will still sometimes parry and "Parry" will still sometimes strike.
                <ul>
                  <li>
                    The next-strike kill check is an estimate. If it says the enemy reaches zero wounds, they strike.
                    It can miss a kill that depends on a failed Feel No Pain or relic roll.
                  </li>
                  <li>
                    The parry-then-kill check is the same kind of estimate. If it says they can parry the enemy&apos;s last success and still kill afterwards, they will do so.
                    It can miss that kill when it depends on a failed Feel No Pain or relic roll.
                  </li>
                </ul>
              </li>
              <li>
                Balanced and Relentless will not reroll a normal success even if it would be wise to do so.
              </li>
            </NotesList></details>
  </div>;
};
export default FightSection;

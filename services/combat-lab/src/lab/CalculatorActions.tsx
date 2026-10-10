import React from 'react';
import {useShareContext} from 'src/context/ShareContext';
import {ScenarioActions} from './LabUi';
interface SavedScenario {name:string;url:string;}
const key='companion-calculator-scenarios';
const safeUrl=(value:string)=>{const url=new URL(value,window.location.origin);if(url.origin!==window.location.origin||!['/','/fight/','/fight'].includes(url.pathname))throw Error('Invalid scenario URL');return url.pathname+url.search;};
export default function CalculatorActions(){
  const {getShareUrl,addParamsToUrl}=useShareContext();
  const [saved,setSaved]=React.useState<SavedScenario[]>(()=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.name==='string'&&typeof x.url==='string').filter(x=>{try{safeUrl(x.url);return true;}catch{return false;}}).slice(0,20):[];}catch{return [];}});
  const save=(name:string)=>{const next=[{name,url:safeUrl(getShareUrl())},...saved.filter(s=>s.name!==name)].slice(0,20);localStorage.setItem(key,JSON.stringify(next));setSaved(next);};
  return <ScenarioActions getShareUrl={getShareUrl} writeUrl={addParamsToUrl} saved={saved} onSave={save} onRestore={index=>{const scenario=saved[index];if(scenario)window.location.assign(safeUrl(scenario.url));}}/>;
}

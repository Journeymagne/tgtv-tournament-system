import React from 'react';

export const profileStamp = (value: unknown): string => JSON.stringify(value, (_key, item) => item instanceof Set ? [...item].sort() : item);

export function ModeSwitch({mode,onChange}: {mode:'shoot'|'fight';onChange:(mode:'shoot'|'fight')=>void}) {
  return <div className="lab-mode-switch" role="group" aria-label="Режим расчёта">
    <button type="button" aria-pressed={mode==='shoot'} onClick={()=>onChange('shoot')}>⌖ Стрельба</button>
    <button type="button" aria-pressed={mode==='fight'} onClick={()=>onChange('fight')}>⚔ Ближний бой</button>
  </div>;
}

export function PageHeading({eyebrow,title,description,actions}: {eyebrow:string;title:React.ReactNode;description:string;actions:React.ReactNode}) {
  return <div className="lab-page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span>.</span></h1><p>{description}</p></div><div className="lab-page-actions">{actions}</div></div>;
}

export function RunPanel({children,context,detail,busy,disabled,onRun,onCancel}: {children?:React.ReactNode;context:string;detail:string;busy:boolean;disabled?:boolean;onRun:()=>void;onCancel:()=>void}) {
  return <section className="lab-run-panel"><div>{children}<span className="lab-run-context">{context}<small>{detail}</small></span></div>
    <button type="button" className={'lab-button '+(busy?'lab-button-secondary':'lab-button-primary')} disabled={!busy&&disabled} onClick={busy?onCancel:onRun}>{busy?'Отменить расчёт':'Рассчитать'}{!busy&&<span aria-hidden="true">→</span>}</button>
  </section>;
}

export function ResultsHeader({hasResult,extra}: {hasResult:boolean;extra?:React.ReactNode}) {
  return <div className="results-heading"><div><span className="eyebrow">РЕЗУЛЬТАТ РАСЧЁТА</span><h2>{hasResult?'Вероятности исходов':'Готовы рассчитать?'}</h2></div>{extra}</div>;
}

export function ResultNotice({busy,dirty,error}: {busy:boolean;dirty:boolean;error?:string}) {
  return <>{busy&&<p className="calculation-progress" role="status">Выполняется расчёт…</p>}{dirty&&<p className="stale-result" role="status">Параметры изменились. Нажмите «Рассчитать», чтобы обновить результаты.</p>}{error&&<p className="sim-error" role="alert">{error}</p>}</>;
}

export function EmptyResult() {
  return <div className="result-empty"><span aria-hidden="true">⌖</span><p>Результаты появятся после расчёта.<small>Настройте параметры и нажмите «Рассчитать».</small></p></div>;
}

export function ScenarioActions({getShareUrl,writeUrl,saved,onSave,onRestore}: {getShareUrl:()=>string;writeUrl?:()=>void;saved:{name:string}[];onSave:(name:string)=>void;onRestore:(index:number)=>void}) {
  const [open,setOpen]=React.useState(false);
  const [name,setName]=React.useState('');
  const [status,setStatus]=React.useState('');
  const [fallback,setFallback]=React.useState('');
  const share=async()=>{
    try {
      const url=getShareUrl();
      if(writeUrl)writeUrl();else window.history.replaceState(null,'',url);
      try{await navigator.clipboard.writeText(url);setStatus('Ссылка на сценарий скопирована');setFallback('');}
      catch{setStatus('Скопируйте ссылку из поля');setFallback(url);}
    } catch{setStatus('Не удалось подготовить ссылку');}
  };
  const save=()=>{
    if(!name.trim())return;
    try{onSave(name.trim());setOpen(false);setName('');setStatus('Сценарий сохранён в этом браузере');}
    catch{setStatus('Не удалось сохранить сценарий в браузере');}
  };
  return <div className="lab-scenario-actions">
    <div className="lab-action-buttons"><button type="button" className="lab-button lab-button-secondary" onClick={share}>↗ Поделиться</button><button type="button" className="lab-button lab-button-secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>Сохранить сценарий</button></div>
    {saved.length>0&&<select aria-label="Сохранённые сценарии" value="" onChange={e=>{if(e.target.value!=='')onRestore(Number(e.target.value));}}><option value="">Мои сценарии ({saved.length})</option>{saved.map((scenario,index)=><option key={index} value={index}>{scenario.name}</option>)}</select>}
    {open&&<form className="scenario-save" onSubmit={e=>{e.preventDefault();save();}}><input aria-label="Название сценария" placeholder="Название сценария" maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoFocus/><button type="submit" className="lab-button lab-button-primary" disabled={!name.trim()}>Сохранить</button></form>}
    {status&&<div className="sim-status" role="status">{status}<button type="button" aria-label="Закрыть сообщение" onClick={()=>{setStatus('');setFallback('');}}>×</button></div>}
    {fallback&&<input className="lab-share-url" aria-label="Ссылка на сценарий" readOnly value={fallback} onFocus={e=>e.target.select()}/>}
  </div>;
}

export function ProfileTitle({letter,title}: {letter:'A'|'B';title:string}){return <span className={'lab-profile-title side-'+letter.toLowerCase()}><span className="side-letter">{letter}</span><span><small>РУЧНОЙ ПРОФИЛЬ {letter}</small><strong>{title}</strong></span></span>;}

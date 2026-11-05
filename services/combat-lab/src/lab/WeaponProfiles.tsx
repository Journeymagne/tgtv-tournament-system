import React from 'react';
import Model from 'src/Model';
import {pack,hydrate} from 'src/simulation/model';
import {PackedModel} from 'src/simulation/types';

interface Profile {name:string; model:PackedModel;}
const storageKey=(mode:string)=>`companion-weapon-profiles-${mode}`;
const changed='companion-weapon-profiles-changed';
function read(mode:string):Profile[] {
  try {
    const rows=JSON.parse(localStorage.getItem(storageKey(mode))||'[]');
    if(!Array.isArray(rows))return [];
    return rows.filter(p=>p&&typeof p.name==='string'&&p.model&&Array.isArray(p.model.abilities)
      &&Object.entries(new Model()).every(([key,value])=>key==='abilities'||
        (typeof value==='number'?typeof p.model[key]==='number'&&Number.isFinite(p.model[key]):typeof p.model[key]===typeof value))).slice(0,100);
  } catch {return [];}
}

export default function WeaponProfiles({mode,model,onChange}: {mode:'shoot'|'fight';model:Model;onChange:(model:Model)=>void}) {
  const [profiles,setProfiles]=React.useState(()=>read(mode));
  const [name,setName]=React.useState('');
  const [open,setOpen]=React.useState(false);
  const [status,setStatus]=React.useState('');
  React.useEffect(()=>{
    const refresh=()=>setProfiles(read(mode));
    window.addEventListener(changed,refresh);
    window.addEventListener('storage',refresh);
    return ()=>{window.removeEventListener(changed,refresh);window.removeEventListener('storage',refresh);};
  },[mode]);
  const save=()=>{
    const title=name.trim();
    if(!title)return;
    try {
      const next=[{name:title,model:pack(model)},...read(mode).filter(p=>p.name!==title)].slice(0,100);
      localStorage.setItem(storageKey(mode),JSON.stringify(next));
      window.dispatchEvent(new Event(changed));
      setOpen(false);setName('');setStatus(`Профиль «${title}» сохранён в этом браузере`);
    } catch {setStatus('Не удалось сохранить профиль: проверьте доступ браузера к локальному хранилищу');}
  };
  return <div className="weapon-profiles">
    <select aria-label="Сохранённые профили оружия" value="" onChange={e=>{
      const profile=profiles[Number(e.target.value)];
      if(e.target.value===''||!profile)return;
      const restored=hydrate(profile.model);
      // A weapon preset must not replace the current fighter's health or defenses.
      restored.wounds=model.wounds;restored.fnp=model.fnp;restored.saintlyRelics=model.saintlyRelics;restored.hardyx=model.hardyx;
      onChange(restored);setStatus(`Выбран профиль «${profile.name}»`);
    }}><option value="">Мои профили оружия ({profiles.length})</option>{profiles.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</select>
    <button type="button" className="lab-button lab-button-secondary lab-button-small" aria-expanded={open} onClick={()=>setOpen(!open)}>Сохранить профиль оружия</button>
    {open&&<form className="scenario-save" onSubmit={e=>{e.preventDefault();save();}}>
      <input aria-label="Название профиля оружия" placeholder="Например: Баньша" maxLength={100} value={name} onChange={e=>setName(e.target.value)} autoFocus/>
      <button type="submit" className="lab-button lab-button-primary lab-button-small" disabled={!name.trim()}>Сохранить</button>
      <small>Сохранение с тем же названием заменит профиль.</small>
    </form>}
    {status&&<small role="status">{status}</small>}
  </div>;
}

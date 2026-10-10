import Ability from 'src/Ability';
import Model from 'src/Model';
import {Bonus,Effect,Mode,Operative,PackedModel,Side,Team,Weapon} from './types';
export const uid=()=>Math.random().toString(36).slice(2,10);
export const abilityNames:Record<string,string>={Balanced:'Balanced · переброс 1',DoubleBalanced:'Переброс 2',Ceaseless:'Ceaseless',Relentless:'Relentless',CritFishRelentless:'Relentless · поиск критов',Ones:'Переброс единиц',BothOnesAndBalanced:'Единицы + Balanced',CeaselessPlusBalanced:'Ceaseless + Balanced',Rending:'Rending',Severe:'Severe',Punishing:'Punishing',Brutal:'Brutal',Shock:'Shock',JustAScratch:'Игнор одного попадания',JustAScratchNorms:'Игнор нормального попадания',HalfDamageFirstStrike:'Половина первого удара',PuritySeal:'Purity Seal',Indomitus:'Indomitus',MysticScryBuff:'Mystic Scry',CurseOfRot:'Curse of Rot',CloseAssault:'Close Assault',Duelist2021:'Парирование до боя',StormShield2021:'Парирование двух успехов',Dueller2021:'Dueller',Hammerhand2021:'+1 урон первого удара',Waaagh2021:'Waaagh',MurderousEntrance2021:'Murderous Entrance'};
export const effectFields:[string,string][]=[['numDice','Кубики'],['diceStat','Порог попадания / сейва'],['normDmg','Обычный урон'],['critDmg','Критический урон'],['apx','Piercing'],['px','Piercing Crits'],['mwx','Devastating'],['lethal','Lethal'],['autoNorms','Accurate / авто normal'],['autoCrits','Авто crit'],['normsToCrits','Normal → crit'],['failsToNorms','Fail → normal'],['fnp','Feel No Pain'],['hardyx','Hardy'],['saintlyRelics','Saintly Relics'],...Object.entries(abilityNames).map(([k,v]):[string,string]=>['ability:'+k,v])];
const rerolls=new Set(['Balanced','DoubleBalanced','Ceaseless','Relentless','CritFishRelentless','Ones','BothOnesAndBalanced','CeaselessPlusBalanced']);
export function sourceBonus(name:string,text:string,sourcePage?:number):Bonus{
 const effects:Effect[]=[];const has=(s:string)=>new RegExp('\\b'+s+'\\b','i').test(text);
 let target:'attack'|'defense'='attack';if(/defence dice|defense dice|defending/i.test(text)&&!/attack dice|weapons have|weapons gain/i.test(text))target='defense';
 for(const rule of ['Balanced','Ceaseless','Relentless','Severe','Rending','Punishing','Brutal','Shock'])if(has(rule))effects.push({field:'ability:'+rule,value:1,operation:'set',target});
 for(const [regex,field] of [[/Lethal\s+(\d)\+/i,'lethal'],[/Accurate\s+(\d+)/i,'autoNorms'],[/Piercing Crits\s+(\d+)/i,'px'],[/Piercing\s+(\d+)/i,'apx'],[/Devastating\s+(\d+)/i,'mwx']] as [RegExp,string][]){const m=text.match(regex);if(m)effects.push({field,value:Number(m[1]),operation:'set',target});}
 if(/for cadia/i.test(name)){effects.push({field:'numDice',value:1,operation:'add',target:'attack',max:4},{field:'ability:Hammerhand2021',value:1,operation:'set',target:'attack'});}
 if(/just a scratch/i.test(name)&&/Normal Dmg/i.test(text)){return {id:uid(),name,mode:'both',enabled:true,effects:[{field:'ability:JustAScratchNorms',value:1,operation:'set',target:'defense'}],sourcePage,text};}
 if(/curse of rot/i.test(name))effects.push({field:'ability:CurseOfRot',value:1,operation:'set',target:'both'});
 if(/just a scratch/i.test(name))effects.push({field:'ability:JustAScratch',value:1,operation:'set',target:'both'});
 if(/saintly relics/i.test(name))effects.push({field:'saintlyRelics',value:1,operation:'set',target:'both'});
 if(/mystic scry/i.test(name))effects.push({field:'ability:MysticScryBuff',value:1,operation:'set',target:'attack'});
 if(/purity seal/i.test(name))effects.push({field:'ability:PuritySeal',value:1,operation:'set',target:'attack'});
 if(/indomitus/i.test(name))effects.push({field:'ability:Indomitus',value:1,operation:'set',target:'defense'});
 return {id:uid(),name,mode:/ranged|shooting|shoot action/i.test(text)&&!/melee|fighting|fight action/i.test(text)?'shoot':/melee|fighting|fight action/i.test(text)&&!/ranged|shooting|shoot action/i.test(text)?'fight':'both',enabled:true,effects,sourcePage,text};
}
export function weaponModel(op:Operative,weapon:Weapon,health:number):Model{
 const m=new Model(weapon.attacks,weapon.hit,weapon.normal,weapon.critical);m.wounds=health;
 for(const name of ['Balanced','Relentless','Ceaseless','Rending','Severe','Punishing','Brutal','Shock'])if(new RegExp('\\b'+name+'\\b','i').test(weapon.rules))applyEffect(m,{field:'ability:'+name,value:1,operation:'set',target:'attack'});
 for(const [regex,field] of [[/Lethal\s+(\d)\+/i,'lethal'],[/Accurate\s+(\d+)/i,'autoNorms'],[/Piercing Crits\s+(\d+)/i,'px'],[/Piercing\s+(\d+)/i,'apx'],[/Devastating\s+(\d+)/i,'mwx']] as [RegExp,string][]){const match=weapon.rules.match(regex);if(match)(m as any)[field]=Number(match[1]);}
 if(health<op.wounds/2)m.diceStat=Math.min(6,m.diceStat+1);
 return m;
}
export function applyEffect(model:Model,e:Effect){
 if(e.field.startsWith('ability:')){const value=e.field.slice(8) as Ability;if(!Object.values(Ability).includes(value))return;if(rerolls.has(value)){const old=model.reroll;if((old===Ability.Balanced&&value===Ability.RerollOnes)||(old===Ability.RerollOnes&&value===Ability.Balanced))model.reroll=Ability.RerollOnesPlusBalanced;else if((old===Ability.Balanced&&value===Ability.RerollMostCommonFail)||(old===Ability.RerollMostCommonFail&&value===Ability.Balanced))model.reroll=Ability.RerollMostCommonFailPlusBalanced;else if(old===Ability.Balanced&&value===Ability.Balanced)model.reroll=Ability.DoubleBalanced;else if(value===Ability.Relentless||old!==Ability.Relentless)model.reroll=value;}else model.abilities.add(value);return;}
 if(!effectFields.some(([f])=>f===e.field))return;const raw=Number(e.value);if(!Number.isFinite(raw))return;const v=Math.round(raw);(model as any)[e.field]=e.operation==='add'?Number((model as any)[e.field])+v:v;if(e.max!==undefined)(model as any)[e.field]=Math.min(e.max,(model as any)[e.field]);
}
export function makeModels(side:Side,team:Team,mode:Mode){const op=team.operatives.find(o=>o.id===side.operativeId)||team.operatives[0];const weapons=op.weapons.filter(w=>w.kind===(mode==='shoot'?'ranged':'melee'));const weapon=weapons.find(w=>w.id===(mode==='shoot'?side.rangedId:side.meleeId))||op.weapons[0];if(!weapon)return null;const attack=weaponModel(op,weapon,side.health);const defense=Model.basicDefender(op.save,side.health);defense.autoNorms=side.cover;defense.setAbility(Ability.ObscuredTarget,side.obscured);
 for(const bonus of side.bonuses.filter(b=>b.enabled&&(b.mode===mode||b.mode==='both')))for(const e of bonus.effects){if(e.target!=='defense')applyEffect(attack,e);if(e.target!=='attack')applyEffect(defense,e);}
 for(const m of [attack,defense]){m.numDice=Math.min(8,Math.max(0,m.numDice));m.diceStat=Math.min(6,Math.max(2,m.diceStat));m.wounds=Math.min(40,Math.max(1,m.wounds));m.normDmg=Math.min(12,Math.max(0,m.normDmg));m.critDmg=Math.min(12,Math.max(0,m.critDmg));for(const key of ['apx','px','mwx','normsToCrits','failsToNorms'] as const)m[key]=Math.min(12,Math.max(0,m[key]));m.lethal=Math.min(6,Math.max(0,m.lethal));m.hardyx=Math.min(6,Math.max(0,m.hardyx));m.fnp=Math.min(6,Math.max(0,m.fnp));m.saintlyRelics=Math.min(2,Math.max(0,m.saintlyRelics));m.autoCrits=Math.min(m.numDice,Math.max(0,m.autoCrits));m.autoNorms=Math.min(m.numDice-m.autoCrits,Math.max(0,m.autoNorms));}
 if(mode==='fight'){attack.fnp=defense.fnp;attack.saintlyRelics=defense.saintlyRelics;for(const a of defense.abilities)if(a!==Ability.ObscuredTarget)attack.abilities.add(a);}
 return {op,weapon,attack,defense};}
export function pack(m:Model):PackedModel{return {...m,abilities:[...m.abilities]};}
export function hydrate(raw:PackedModel):Model{const m=new Model();Object.assign(m,raw);m.abilities=new Set(raw.abilities);return m;}
export function effectLabel(e:Effect){const name=effectFields.find(([f])=>f===e.field)?.[1]||e.field;return name+(e.field.startsWith('ability:')?'':` ${e.operation==='add'&&Number(e.value)>0?'+':''}${e.value}`);}

(function(root){
'use strict';
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const Text=root.KTText||(typeof require!=='undefined'?require('./rich-text.js'):null);
const preset=root.KTNewRecruitTemplate||(typeof require!=='undefined'?require('./new-recruit-template.js'):null);
const NS='http://www.battlescribe.net/schema/rosterSchema';
const clone=x=>JSON.parse(JSON.stringify(x));
const inch=s=>String(s??'').replace(/″/g,'"');
const escapeXML=s=>inch(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const node=(tag,attrs={},children=[],text='')=>({tag,attrs,children,text});
function walk(n){return [n,...n.children.flatMap(walk)]}
function child(n,tag){return n.children.find(c=>c.tag===tag)}
function serialize(n){return '<'+n.tag+Object.entries(n.attrs).map(([k,v])=>' '+k+'="'+escapeXML(v)+'"').join('')+(n.children.length||n.text?'>'+escapeXML(n.text)+n.children.map(serialize).join('')+'</'+n.tag+'>':'/>')}
function compatible(data,template=preset){return !!template&&data.team.id===template.teamId}
function rosterName(data,name){
 const team=data.team.name.trim(),prefix=new RegExp('^'+team.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s+|$)','i');
 const title=value=>value===value.toUpperCase()?value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu,(_,space,letter)=>space+letter.toUpperCase()):value;
 return [title(team),title(name.trim().replace(prefix,''))].filter(Boolean).join(' ');
}
function summary(data,template=preset){
 if(!compatible(data,template))throw Error('Для этой команды ещё не загружен образец ростера New Recruit');
 return {sourceFile:template.sourceFile,count:template.bindings.reduce((n,b)=>n+b.count,0),entries:template.bindings.map(b=>({name:rosterName(data,b.name),count:b.count,operativeId:b.operativeId,weaponIds:b.weapons.map(w=>w.weaponId)}))};
}
function build(input,template=preset){
 const data=Model.validate(Model.migrate(input));summary(data,template);
 const tree=clone(template.tree),force=child(child(tree,'forces'),'force'),selections=child(force,'selections');
 let serial=0;const id=()=>('ks'+(++serial).toString(16).padStart(12,'0'));
 const profile=(type,name,values,profileId=id())=>{
  const def=template.types[type];if(!def)throw Error('Неизвестный тип профиля '+type);
  return node('profile',{id:profileId,name,hidden:'false',typeId:def.typeId,typeName:type,from:'entry'},[node('characteristics',{},Object.entries(values).map(([key,value])=>{
   if(!def.characteristics[key])throw Error('Неизвестная характеристика '+key);
   return node('characteristic',{name:key,typeId:def.characteristics[key]},[],inch(Text.plain(value)));
  }))]);
 };
 const report={team:data.team.name,rosterName:data.team.name+' — Kill Team Studio',sourceFile:template.sourceFile,operatives:[],rules:[],profileTypes:clone(template.types)};
 for(const binding of template.bindings){
  const selection=selections.children.find(s=>s.attrs.id===binding.selectionId),operative=data.operatives.find(o=>o.id===binding.operativeId);
  if(!operative)throw Error('В ростере используется удалённый оперативник: '+binding.name);
  if(!selection)throw Error('Повреждён шаблон ростера: '+binding.name);
  const sourceNodes=walk(selection),sourceProfile=sourceNodes.find(n=>n.tag==='profile'&&n.attrs.typeName==='Operative');
  const names=binding.weapons.map(b=>{const weapon=operative.weapons.find(w=>w.id===b.weaponId);if(!weapon)throw Error('В ростере используется удалённое оружие: '+binding.name+' / '+b.weaponId);return weapon});
  // Keep stable catalogue/entry IDs and the selected weapon tree from the user's New Recruit roster.
  // Display names and all gameplay profiles come from the current editor snapshot.
  const display=rosterName(data,operative.name);
  selection.attrs.name=display+(binding.name.toLowerCase().includes(' with ')?' with '+names.filter(w=>w.kind==='ranged').map(w=>w.name.replace(/ \([^)]*\)$/,'')).filter((v,i,a)=>a.indexOf(v)===i).join(' / '):'');
  const stats={APL:operative.stats.APL,Move:operative.stats.MOVE??operative.stats.M,Save:operative.stats.SAVE??operative.stats.SV,Wounds:operative.stats.WOUNDS??operative.stats.W};
  for(const [key,value] of Object.entries(stats))if(value===undefined||value===null||String(value).trim()==='')throw Error('Нет характеристики '+key+' у '+operative.name);
  // Replace operative rules at their original level; remove nested copies to prevent duplicate abilities.
  for(const item of sourceNodes)if(item.tag==='profiles')item.children=item.children.filter(n=>!['Operative','Abilities','Unique Actions'].includes(n.attrs.typeName));
  const profiles=child(selection,'profiles');
  profiles.children.unshift(profile('Operative',display,stats,sourceProfile.attrs.id));
  for(const ability of operative.abilities)profiles.children.push(profile('Abilities',ability.name,{Ability:ability.body}));
  if(operative.body.trim())profiles.children.push(profile('Abilities','Additional rule',{Ability:operative.body}));
  for(const action of operative.actions)profiles.children.push(profile('Unique Actions',action.name+(action.cost?' ('+action.cost.replace(/\s+/g,'')+')':''),{'Unique Action':action.body}));
  for(const [i,b] of binding.weapons.entries()){
   const old=sourceNodes.find(n=>n.tag==='profile'&&n.attrs.typeName==='Weapons'&&n.attrs.id===b.profileId),weapon=names[i];
   if(!old)throw Error('Не найден профиль оружия '+b.profileId);
   const values={ATK:weapon.attacks,HIT:weapon.hit,DMG:weapon.damage,WR:[weapon.special,weapon.critical].filter(Boolean).join(', ')||'-'};
   const updated=profile('Weapons',(weapon.kind==='melee'?'⚔ ':'⌖ ')+weapon.name,values,old.attrs.id);
   Object.assign(old,updated);
  }
  // The original category IDs are retained for catalogue compatibility; their names follow keyword edits.
  const categories=child(selection,'categories'),known=new Map(categories.children.map(c=>[c.attrs.name.toUpperCase(),c]));
  categories.children=operative.keywords.map(name=>known.get(name.toUpperCase())||node('category',{id:id(),entryId:id(),name,primary:name.toUpperCase()==='LEADER'?'true':'false'}));
  if(!categories.children.some(c=>c.attrs.primary==='true'))categories.children.push(node('category',{id:'cf83-4496-b58e-ac82',entryId:'cf83-4496-b58e-ac82',name:'Operative',primary:'true'}));
  report.operatives.push({name:selection.attrs.name,operativeId:operative.id,count:binding.count,stats,weaponIds:names.map(w=>w.id),weapons:names.map(w=>w.name),abilities:operative.abilities.map(a=>a.name),actions:operative.actions.map(a=>a.name)});
 }
 const rule=(name,body)=>{report.rules.push(name);return node('rule',{id:id(),name,hidden:'false'},[node('description',{},[],Text.plain(body))])};
 const body=c=>[c.body,c.restriction,...c.abilities.map(a=>a.name+'\n'+a.body),...c.actions.map(a=>a.name+(a.cost?' ('+a.cost+')':'')+'\n'+a.body),...c.weapons.map(w=>w.name+' | ATK '+w.attacks+' | HIT '+w.hit+' | DMG '+w.damage+' | '+[w.special,w.critical].filter(Boolean).join(', '))].filter(Boolean).join('\n\n');
 const rules=[];
 for(const c of data.selectionCards){const text=['ARCHETYPES: '+c.archetypes.join(', '),c.body,...c.selectionGroups.map(g=>g.count+' '+g.description+'\n'+g.entries.map(e=>'• '+e.text+(e.options.length?'\n'+e.options.map(o=>'  ◦ '+o).join('\n'):'')).join('\n')),c.selectionRules,c.selectionNotes].filter(Boolean).join('\n\n');rules.push(rule(c.name,text))}
 for(const c of data.teamCards)rules.push(rule(c.name+(c.subtitle?' — '+c.subtitle:''),body(c)));
 for(const [key,label] of [['strategicPloys','STRATEGY PLOY'],['firefightPloys','FIREFIGHT PLOY'],['equipment','EQUIPMENT']])for(const c of data[key])if(Model.isFilled(c))rules.push(rule(label+': '+c.name+(c.cost?' ('+c.cost+')':''),body(c)));
 child(force,'rules').children=rules;
 tree.attrs.name=report.rosterName;tree.attrs.id='kt-studio-'+Date.now().toString(36);tree.attrs.xmlns=NS;
 // This is an edited New Recruit export. Its source generator/catalogue metadata is preserved.
 tree.children=tree.children.filter(c=>c.tag!=='customNotes');tree.children.push(node('customNotes',{},[],'Rebuilt by Kill Team Studio from '+template.sourceFile+'. Rules and profiles: '+data.team.version+'. Roster selections preserved from the supplied New Recruit file.'));
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+serialize(tree);
 report.count=report.operatives.reduce((n,o)=>n+o.count,0);report.weaponProfiles=report.operatives.reduce((n,o)=>n+o.weapons.length,0);
 return {xml,report,filename:data.team.id+'-studio.rosz',innerFilename:data.team.id+'-studio.ros'};
}
function archive(input,template=preset){const result=build(input,template),zip=root.fflate||(typeof require!=='undefined'?require('fflate'):null);if(!zip)throw Error('Не загружен ZIP-модуль');return {...result,bytes:zip.zipSync({[result.innerFilename]:zip.strToU8(result.xml)},{level:6})}}
root.KTNewRecruit={compatible,summary,build,archive,serialize};if(typeof module!=='undefined')module.exports=root.KTNewRecruit;
})(typeof window!=='undefined'?window:globalThis);

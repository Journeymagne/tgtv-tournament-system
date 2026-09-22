(function(root){
'use strict';
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const Text=root.KTText||(typeof require!=='undefined'?require('./rich-text.js'):null);
const preset=root.KTNewRecruitTemplate||(typeof require!=='undefined'?require('./new-recruit-template.js'):null);
const NS='http://www.battlescribe.net/schema/rosterSchema';
const JSON_NS='http://james.newtonking.com/projects/json';
const clone=x=>JSON.parse(JSON.stringify(x));
const inch=s=>String(s??'').replace(/″/g,'"');
const escapeXML=s=>inch(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const node=(tag,attrs={},children=[],text='')=>({tag,attrs,children,text});
function walk(n){return [n,...n.children.flatMap(walk)]}
function child(n,tag){return n.children.find(c=>c.tag===tag)}
function serialize(n){return '<'+n.tag+Object.entries(n.attrs).map(([k,v])=>' '+k+'="'+escapeXML(v)+'"').join('')+(n.children.length||n.text?'>'+escapeXML(n.text)+n.children.map(serialize).join('')+'</'+n.tag+'>':'/>')}
function compatible(data){return !!data?.team&&Array.isArray(data.operatives)}
// Build selections from the project itself. Catalogue-specific bindings cannot
// represent custom teams, new operatives or edits to their weapon choices.
function projectTemplate(data){
 let serial=0;const id=()=>('studio-'+(++serial).toString(16));
 const bindings=[],selections=[];
 for(const operative of data.operatives){
  const variants=operative.loadouts.length?operative.loadouts.map(l=>({name:l.name,weaponIds:[...new Set(l.weaponIds)]})):[{name:'',weaponIds:operative.weapons.map(w=>w.id)}];
  const remaining=operative.weapons.filter(w=>!variants.some(v=>v.weaponIds.includes(w.id)));
  if(remaining.length)variants.push({name:'Other weapons',weaponIds:remaining.map(w=>w.id)});
  for(const variant of variants){
   const selectionId=id(),weapons=variant.weaponIds.map(weaponId=>({weaponId,profileId:id()}));
   bindings.push({selectionId,operativeId:operative.id,name:operative.name,variant:variants.length>1?variant.name:'',count:1,weapons});
   selections.push(node('selection',{id:selectionId,name:operative.name,entryId:id(),number:'1',type:'model',from:'entry','json:Array':'true'},[
    node('profiles',{},[node('profile',{id:id(),typeName:'Operative'})]),
    // Command Node reads weapons only from nested upgrade selections.
    node('selections',{},weapons.map(w=>node('selection',{id:id(),name:operative.weapons.find(weapon=>weapon.id===w.weaponId).name,entryId:id(),number:'1',type:'upgrade',from:'entry'},[
     node('profiles',{},[node('profile',{id:w.profileId,typeName:'Weapons'})])
    ]))),
    node('categories')
   ]));
  }
 }
 const tree=clone(preset.tree),force=child(child(tree,'forces'),'force');
 Object.assign(force.attrs,{id:id(),catalogueId:'studio-'+data.team.id,catalogueRevision:'1',catalogueName:data.team.name});
 // Command Node expects a list and skips Reference entries. A reference keeps
 // an empty roster importable without inventing an operative.
 child(force,'selections').children=selections.length?selections:[node('selection',{id:id(),name:data.team.name,entryId:id(),number:'1',type:'upgrade','json:Array':'true'},[
  node('categories',{},[node('category',{id:id(),entryId:'b318-a8d7-2d38-99a3',name:'Reference',primary:'true'})])
 ])];
 child(force,'rules').children=[];
 child(force,'categories').children=[];
 Object.assign(tree.attrs,{id:id(),name:data.team.name,generatedBy:'Kill Team Studio','xmlns:json':JSON_NS});
 return {teamId:data.team.id,sourceFile:preset.sourceFile,generated:true,types:preset.types,bindings,tree};
}
function rosterName(data,name){
 const team=data.team.name.trim(),prefix=new RegExp('^'+team.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s+|$)','i');
 const title=value=>value===value.toUpperCase()?value.toLowerCase().replace(/(^|[\s-])(\p{L})/gu,(_,space,letter)=>space+letter.toUpperCase()):value;
 return [title(team),title(name.trim().replace(prefix,''))].filter(Boolean).join(' ');
}
function summary(data,template=projectTemplate(data)){
 return {sourceFile:template.sourceFile,count:template.bindings.reduce((n,b)=>n+b.count,0),entries:template.bindings.map(b=>({name:rosterName(data,b.name)+(b.variant?' — '+b.variant:''),count:b.count,operativeId:b.operativeId,weaponIds:b.weapons.map(w=>w.weaponId)}))};
}
function build(input,template){
 const data=Model.validate(Model.migrate(input));template??=projectTemplate(data);
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
  // The template supplies the XML structure and profile types; gameplay data
  // always comes from the project being exported.
  const display=rosterName(data,operative.name);
  selection.attrs.name=display+(binding.variant?' — '+binding.variant:!template.generated&&binding.name.toLowerCase().includes(' with ')?' with '+names.filter(w=>w.kind==='ranged').map(w=>w.name.replace(/ \([^)]*\)$/,'')).filter((v,i,a)=>a.indexOf(v)===i).join(' / '):'');
  const stats={APL:operative.stats.APL,Move:operative.stats.MOVE??operative.stats.M,Save:operative.stats.SAVE??operative.stats.SV,Wounds:operative.stats.WOUNDS??operative.stats.W};
  for(const [key,value] of Object.entries(stats))if(value===undefined||value===null||String(value).trim()==='')stats[key]='-';
  // Replace operative rules at their original level; remove nested copies to prevent duplicate abilities.
  for(const item of sourceNodes)if(item.tag==='profiles')item.children=item.children.filter(n=>!['Operative','Abilities','Unique Actions'].includes(n.attrs.typeName));
  const profiles=child(selection,'profiles');
  profiles.children.unshift(profile('Operative',display,stats,sourceProfile.attrs.id));
  for(const ability of operative.abilities)profiles.children.push(profile('Abilities',ability.name,{Ability:ability.body}));
  if(operative.body.trim())profiles.children.push(profile('Abilities','Additional rule',{Ability:operative.body}));
  const extra=Object.entries(operative.stats).filter(([key])=>!['APL','MOVE','M','SAVE','SV','WOUNDS','W'].includes(key));
  if(extra.length)profiles.children.push(profile('Abilities','Additional characteristics',{Ability:extra.map(([key,value])=>key+': '+value).join(', ')}));
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
 tree.children=tree.children.filter(c=>c.tag!=='customNotes');tree.children.push(node('customNotes',{},[],template.generated?'Exported by Kill Team Studio. Rules and profiles: '+data.team.version+'. All operative profiles and weapon loadouts; select your kill team using its selection rules.':'Rebuilt by Kill Team Studio from '+template.sourceFile+'. Rules and profiles: '+data.team.version+'. Roster selections preserved from the supplied New Recruit file.'));
 const xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+serialize(tree);
 report.count=report.operatives.reduce((n,o)=>n+o.count,0);report.weaponProfiles=report.operatives.reduce((n,o)=>n+o.weapons.length,0);
 return {xml,report,filename:data.team.id+'-studio.rosz',innerFilename:data.team.id+'-studio.ros'};
}
function archive(input,template){const result=build(input,template),zip=root.fflate||(typeof require!=='undefined'?require('./vendor/fflate.js'):null);if(!zip)throw Error('Не загружен ZIP-модуль');return {...result,bytes:zip.zipSync({[result.innerFilename]:zip.strToU8(result.xml)},{level:6})}}
root.KTNewRecruit={compatible,summary,build,archive,serialize};if(typeof module!=='undefined')module.exports=root.KTNewRecruit;
})(typeof window!=='undefined'?window:globalThis);

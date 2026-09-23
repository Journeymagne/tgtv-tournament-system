(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const collections=['selectionCards','teamCards','strategicPloys','firefightPloys','equipment','operatives'];
const fixed=['strategicPloys','firefightPloys','equipment'];
const archetypeOptions=['SEEK & DESTROY','SECURITY','RECON','INFILTRATION'];
const distanceUnits={'○':2,'▲':1,'■':3,'⬟':6};
function toInches(text){return String(text).replace(/(?:(\d+(?:[.,]\d+)?)\s*(?:[x×]\s*)?)?([○▲■⬟])/g,(_,count,symbol)=>Number(((count===undefined?1:Number(count.replace(',','.')))*distanceUnits[symbol]).toFixed(6))+'″')}
function normalizeCard(card){
 const untouched=new Set(['id','image','weaponIds','excludedOperativeIds','operativeId','sourcePage']);
 const convert=x=>typeof x==='string'?toInches(x):Array.isArray(x)?x.map(convert):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,untouched.has(k)?clone(v):convert(v)])):x;
 const result=convert(card);
 for(const weapon of result.weapons||[]){weapon.rules=weaponRules(weapon);delete weapon.special;delete weapon.critical}
 return result;
}
function weaponRules(weapon){return typeof weapon.rules==='string'?weapon.rules:[weapon.special,weapon.critical?'CR: '+weapon.critical:''].filter(Boolean).join('; ')}
function copyWeaponProfile(weapon,id){return {id,name:weapon.name.trim(),kind:weapon.kind,attacks:weapon.attacks,hit:String(weapon.hit??''),damage:String(weapon.damage??''),rules:weaponRules(weapon),group:weapon.group||'',mode:weapon.mode||''}}
function validateWeaponProfiles(profiles){
 if(!Array.isArray(profiles)||profiles.length>300)throw Error('В проекте может быть не больше 300 сохранённых профилей оружия');
 const ids=new Set();
 for(const p of profiles){
  if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>200||!['ranged','melee'].includes(p.kind)||!Number.isFinite(p.attacks)||p.attacks<0||typeof p.hit!=='string'||p.hit.length>100||typeof p.damage!=='string'||p.damage.length>100||typeof p.rules!=='string'||p.rules.length>100000||typeof p.group!=='string'||p.group.length>2000||typeof p.mode!=='string'||p.mode.length>2000)throw Error('Проверьте название и характеристики сохранённого профиля оружия');
  ids.add(p.id);
 }
}
function saveWeaponProfile(project,weapon,id){
 const profile=copyWeaponProfile(weapon,id),profiles=project.weaponProfiles||[];
 const same=value=>value.trim().toLowerCase();
 const index=profiles.findIndex(p=>same(p.name)===same(profile.name)&&p.kind===profile.kind&&same(p.mode)===same(profile.mode));
 const next=profiles.slice();
 if(index<0)next.push(profile);else{profile.id=profiles[index].id;next[index]=profile}
 validateWeaponProfiles(next);project.weaponProfiles=next;return profile;
}
function weaponFromProfile(project,profileId,id){
 const profile=project.weaponProfiles?.find(p=>p.id===profileId);
 if(!profile)throw Error('Сохранённый профиль оружия не найден');
 return copyWeaponProfile(profile,id);
}
function isLogo(value){return typeof value==='string'&&value.length<=60000&&/^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(value)}
function normalizeDistances(d){
 for(const key of collections)if(Array.isArray(d[key]))d[key]=d[key].map(normalizeCard);
 if(Array.isArray(d.weaponProfiles))d.weaponProfiles=d.weaponProfiles.map(normalizeCard);
 for(const key of ['ployNote','equipmentIntro'])if(typeof d[key]==='string')d[key]=toInches(d[key]);
 for(const note of d.notes||[])if(note.title==='Source notation'&&note.text==='Distance symbols are preserved from the source: triangle, circle, square and pentagon. No rules conversion has been applied.')note.text='Distances are expressed in inches: triangle = 1 inch, circle = 2 inches, square = 3 inches, pentagon = 6 inches. Multipliers are applied (3 circles = 6 inches). Other source mechanics are unchanged.';
 return d;
}
function blank(id,kind){return {id,kind,name:'',body:'',lore:'',cost:'',weapons:[],abilities:[],actions:[]}}
function newSelection(name='KILL TEAM'){return {...blank('team-selection','selection'),name,size:8,archetypes:['',''],excludedOperativeIds:[],selectionGroups:[{id:'group-1',count:8,description:'operatives selected from the following list:',entries:[]}],selectionRules:'',selectionNotes:''}}
function newProject(id,name='Новая команда'){
 const slots=kind=>Array.from({length:4},(_,i)=>blank(kind+'-'+(i+1),kind));
 return {schemaVersion:4,team:{id,name,subtitle:'',version:'1.0',logo:'',profileSystem:'APL / MOVE / SAVE / WOUNDS'},
  selectionCards:[{...newSelection(''),size:1,selectionGroups:[]}],teamCards:[],operatives:[],lorePages:[],weaponProfiles:[],
  strategicPloys:slots('strategic'),firefightPloys:slots('firefight'),equipment:slots('equipment'),
  ployNote:'',equipmentIntro:'',layout:{accent:'#ed4b22',includeCover:false,includeAssembly:false},sourceArchive:{},notes:[]};
}
const loreCategories={lore:'Лор',diorama:'Диорама',assembly:'Сборка миниатюр',painting:'Примеры покраса'};
function newLorePage(id){return {id,name:'Новая страница',category:'lore',body:'',layout:'wide',images:[]}}
function validateImage(c){
 if(c.image!==undefined&&(typeof c.image!=='string'||c.image&&!/^assets\/[a-z0-9.-]+\.(png|jpg|jpeg)$/i.test(c.image)&&!(c.image.length<=2000000&&/^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(c.image))))throw Error('Некорректная картинка: '+(c.name||c.caption||''));
 for(const dimension of ['imageWidth','imageHeight'])if(c[dimension]!==undefined&&(!Number.isInteger(c[dimension])||c[dimension]<1||c[dimension]>40000000))throw Error('Некорректные размеры картинки');
 if(c.imageCrop!==undefined){
  const crop=c.imageCrop;
  if(c.kind!=='operative'||!c.image||!c.imageWidth||!c.imageHeight||!crop||!['x','y','width','height'].every(key=>Number.isFinite(crop[key]))||crop.x<0||crop.y<0||crop.width*c.imageWidth<.999999||crop.height*c.imageHeight<.999999||crop.x+crop.width>1.000001||crop.y+crop.height>1.000001)throw Error('Некорректная область картинки оперативника');
 }
}
function selectionGroups(d){
 d.lorePages??=[];
 d.weaponProfiles??=[];
 // Older recruitment cards remain editable without a separate card type.
 for(const card of d.teamCards)if(card.kind==='recruitment')card.kind='faction';
 for(const c of d.selectionCards){
  if(!c.selectionGroups)c.selectionGroups=[{id:'group-1',count:c.size,description:d.team.name+' operatives selected from the following list:',entries:d.operatives.filter(o=>!c.excludedOperativeIds.includes(o.id)).map(o=>({id:o.id,operativeId:o.id,text:o.name,options:o.loadouts.map(l=>l.weaponIds.map(id=>o.weapons.find(w=>w.id===id)?.name||id).join('; '))}))}];
  c.selectionRules??='';c.selectionNotes??='';c.size=c.selectionGroups.reduce((n,g)=>n+g.count,0)||1;
 }
 d.schemaVersion=4;return normalizeDistances(d);
}
function migrate(input){
 if(input.schemaVersion===4||input.schemaVersion===3)return selectionGroups(clone(input));
 if(input.schemaVersion===2){
  const d=clone(input),old=d.teamCards.filter(c=>c.kind==='selection');
  d.sourceArchive??={};d.sourceArchive.selectionBeforeMigration??=clone(old);
  d.selectionCards=old.length?old:[newSelection(d.team.name+' KILL TEAM')];
  for(const c of d.selectionCards){
   const values=Array.isArray(c.archetypes)?c.archetypes:[c.archetype||''];
   c.archetypes=[String(values[0]||''),String(values[1]||'')];
   if(c.archetypes[0]===c.archetypes[1])c.archetypes[1]='';
   c.excludedOperativeIds??=[];c.size??=8;delete c.archetype;
  }
  d.teamCards=d.teamCards.filter(c=>c.kind!=='selection');d.schemaVersion=3;return selectionGroups(d);
 }
 if(input.schemaVersion!==1)throw Error('Неизвестная версия проекта');
 const d=clone(input);
 const nested=(o,kind)=>{const x={...blank(o.id,kind),...clone(o),kind};for(const [key,ref] of [['weapons','weaponIds'],['abilities','abilityIds'],['actions','actionIds']]){x[key]=(o[ref]||[]).map(id=>{const record=d[key].find(r=>r.id===id);if(!record)throw Error('Не найдена запись '+id);return clone(record)});delete x[ref]}return x};
 const cap=(arr,kind)=>Array.from({length:4},(_,i)=>arr[i]?nested(arr[i],kind):blank(kind+'-'+(i+1),kind));
 const strategic=d.ploys.filter(p=>p.category==='Strategic'),firefight=d.ploys.filter(p=>p.category!=='Strategic');
 const selection={...blank('team-selection','selection'),name:d.team.name+' KILL TEAM',body:d.team.intro,size:d.team.size,archetype:d.team.archetype,quote:d.team.quote,quoteAuthor:d.team.quoteAuthor,sourcePage:1};
 const recruitment={...blank('team-recruitment','recruitment'),name:'KILL TEAM SELECTION',body:d.team.selectionText,groupCaps:clone(d.team.groupCaps),sourcePage:1};
 return migrate({schemaVersion:2,team:{id:d.team.id,name:d.team.name,subtitle:d.team.subtitle,version:d.team.version,source:d.team.source,templateSource:d.team.templateSource,profileSystem:d.team.profileSystem},
  teamCards:[selection,recruitment,...d.factionRules.map(r=>nested(r,'faction'))],strategicPloys:cap(strategic,'strategic'),firefightPloys:cap(firefight,'firefight'),
  equipment:Array.from({length:4},(_,i)=>blank('equipment-'+(i+1),'equipment')),operatives:d.operatives.map(o=>nested(o,'operative')),
  ployNote:d.team.ployNote,equipmentIntro:d.team.equipmentIntro,layout:{...d.layout,includeCover:false,includeAssembly:false},
  sourceArchive:{equipment:d.equipment.map(o=>nested(o,'equipment')),tacOps:d.tacOps.map(o=>nested(o,'tacOp')),extraPloys:[...strategic.slice(4),...firefight.slice(4)].map(o=>nested(o,o.category==='Strategic'?'strategic':'firefight')),legacyProject:d},notes:clone(d.notes||[])});
}
function validate(d){
 if(!d||d.schemaVersion!==4||!d.team||typeof d.team.name!=='string'||!d.layout||!/^#[0-9a-f]{6}$/i.test(d.layout.accent))throw Error('Неверный формат проекта');
 if(d.team.logo!==undefined&&d.team.logo!==''&&!isLogo(d.team.logo))throw Error('Некорректный логотип команды');
 if(d.weaponProfiles!==undefined)validateWeaponProfiles(d.weaponProfiles);
 for(const pool of ['weapons','abilities','actions'])if(pool in d)throw Error('Оружие, способности и действия должны находиться внутри карточек');
 if(d.lorePages!==undefined){
  if(!Array.isArray(d.lorePages)||d.lorePages.length>100)throw Error('Слишком много страниц картинок и лора');
  const ids=new Set();for(const p of d.lorePages){
   if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||p.name.length>200||typeof p.body!=='string'||p.body.length>100000||!Object.hasOwn(loreCategories,p.category)||!['wide','gallery'].includes(p.layout)||!Array.isArray(p.images)||p.images.length>40)throw Error('Повреждена страница картинок и лора');ids.add(p.id);
   const images=new Set();for(const img of p.images){if(typeof img.id!=='string'||images.has(img.id)||!img.image||typeof img.caption!=='string'||img.caption.length>5000)throw Error('Повреждено изображение страницы');images.add(img.id);validateImage(img)}
  }
 }
 for(const key of collections){
  if(!Array.isArray(d[key])||d[key].length>300)throw Error('Неверный раздел: '+key);
  if(fixed.includes(key)&&d[key].length!==4)throw Error('В разделе '+key+' должно быть ровно четыре карточки');
  const ids=new Set();
  for(const c of d[key]){
   if(typeof c.id!=='string'||ids.has(c.id)||typeof c.name!=='string'||typeof c.body!=='string')throw Error('Повреждена карточка в '+key);ids.add(c.id);
   const kinds={selectionCards:['selection'],teamCards:['recruitment','faction'],strategicPloys:['strategic'],firefightPloys:['firefight'],equipment:['equipment'],operatives:['operative']};
   if(!kinds[key].includes(c.kind))throw Error('Неверный тип карточки');
   for(const pool of ['weapons','abilities','actions']){if(!Array.isArray(c[pool]))throw Error('Нет содержимого карточки: '+pool);const local=new Set();for(const r of c[pool]){if(typeof r.id!=='string'||local.has(r.id)||typeof r.name!=='string')throw Error('Повреждён блок '+pool);local.add(r.id);if(pool!=='weapons'&&typeof r.body!=='string')throw Error('Нет текста правила');if(pool==='weapons'&&r.rules!==undefined&&typeof r.rules!=='string')throw Error('Некорректные правила оружия')}}
   validateImage(c);
   if(c.kind==='operative'){
    if(!c.stats||!Object.keys(c.stats).length||!Array.isArray(c.keywords)||!Array.isArray(c.loadouts))throw Error('Повреждён профиль');
    if(c.baseSize!==undefined&&(typeof c.baseSize!=='string'||c.baseSize.length>16||/[\r\n\x00-\x1f]/.test(c.baseSize)))throw Error('Размер базы должен быть короткой строкой, например 25 или 60×35');
    for(const l of c.loadouts)if(typeof l.name!=='string'||!Array.isArray(l.weaponIds)||l.weaponIds.some(id=>!c.weapons.some(w=>w.id===id)))throw Error('Оружие комплектации должно принадлежать этой карточке');
   }
   if(c.kind==='selection'){
    if(!Array.isArray(c.archetypes)||c.archetypes.length!==2||c.archetypes.some(a=>typeof a!=='string'))throw Error('У состава должно быть ровно два места для архетипов');
    if(c.archetypes[0].trim()&&c.archetypes[0].trim().toLowerCase()===c.archetypes[1].trim().toLowerCase())throw Error('Выберите два разных архетипа');
    if(!Number.isInteger(c.size)||c.size<1||!Array.isArray(c.excludedOperativeIds)||c.excludedOperativeIds.some(id=>!d.operatives.some(o=>o.id===id)))throw Error('Некорректный состав команды');
    if(!Array.isArray(c.selectionGroups)||c.selectionGroups.length>30||typeof c.selectionRules!=='string'||typeof c.selectionNotes!=='string')throw Error('Некорректные группы выбора');
    for(const g of c.selectionGroups){if(!Number.isInteger(g.count)||g.count<1||typeof g.description!=='string'||!Array.isArray(g.entries)||g.entries.length>100)throw Error('Некорректная группа выбора');for(const e of g.entries)if(typeof e.text!=='string'||!Array.isArray(e.options)||e.options.some(t=>typeof t!=='string')||e.operativeId&&!d.operatives.some(o=>o.id===e.operativeId))throw Error('Некорректный вариант выбора')}
   }
  }
 }
 return d;
}
function isFilled(c){return !!c.name.trim()&&!!(c.body.trim()||c.weapons.length||c.abilities.length||c.actions.length)}
function incomplete(d){return [...fixed.flatMap(key=>d[key].flatMap((c,i)=>isFilled(c)?[]:[{section:key,index:i}])),...d.selectionCards.flatMap((c,i)=>c.archetypes.flatMap((a,slot)=>a.trim()?[]:[{section:'selectionCards',index:i,slot}]))]}
root.KTModel={migrate,validate,blank,newProject,newSelection,newLorePage,loreCategories,archetypeOptions,collections,fixed,isFilled,incomplete,toInches,normalizeCard,weaponRules,isLogo,saveWeaponProfile,weaponFromProfile};
if(typeof module!=='undefined')module.exports=root.KTModel;
})(typeof window!=='undefined'?window:globalThis);

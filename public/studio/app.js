'use strict';
const $=s=>document.querySelector(s),esc=KTCards.esc;
const SECTIONS={selectionCards:'Состав киллтима',teamCards:'Правила команды',strategicPloys:'Strategic Ploys',firefightPloys:'Firefight Ploys',equipment:'Equipment',tokenCards:'Жетоны и маркеры',operatives:'Оперативники',lorePages:'Картинки и лор',project:'Проект и исходники'};
const STORAGE='kt-studio-cards-v6',PREVIOUS=[];
const PROJECTS=STORAGE+':project-list',ACTIVE=STORAGE+':active-project',projectList=new Map();
let data,original,section=new URLSearchParams(location.search).get('section')==='tokenCards'?'tokenCards':'selectionCards',selected=0,side=0,assets={},timer;
let previewOnly=false;
let saveRevision=0,teamLoadRevision=0;
const nestedStates=new WeakMap();
const customArchetypes=new WeakMap();
let editorCard=null,weaponProfileChoice='';
let imageOptimization=null;
let referenceTarget=null;
let recordDrag=null,recordClickSuppressed=false;
let weaponDrag=null,weaponClickSuppressed=false;
const current=()=>section==='project'?data.team:data[section]?.[selected];
const fixed=()=>KTModel.fixed.includes(section);
const uid=()=>crypto.randomUUID();
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('#toast').style.display='none',4500)}
KTTokensEditor.bind({context:()=>({project:data,card:section==='tokenCards'?current():null}),uid,toast,persist,
 changed:({rebuild,token})=>{
  persist();
  if(rebuild)renderEditor(token?{openNested:{type:'tokens',id:token.id}}:{});
  if(token){const pages=KTCards.renderCard(current(),data,assets,selected),target=pages.findIndex(p=>p.boxes.some(box=>box.id===token.id));if(target>=0)side=target}
  renderPreview();
 }});
function rememberProject(team,active=false){
 projectList.set(team.id,team.name);
 try{KTAccount.storage.setItem(PROJECTS,JSON.stringify([...projectList]));if(active)KTAccount.storage.setItem(ACTIVE,team.id)}catch{}
}
function renderProjectTitle(){
 $('.project-name').innerHTML=(KTModel.isLogo(data.team.logo)?'<img class="project-logo" src="'+esc(data.team.logo)+'" alt="">':'')+'<span>'+esc(data.team.name+' · v.'+data.team.version)+'</span>';
 window.KTCommunity?.status();
}
const removedProjects=new Set();
async function removeProject(id){
 removedProjects.add(id);
 projectList.delete(id);
 KTAccount.storage.setItem(PROJECTS,JSON.stringify([...projectList]));
 if(KTAccount.storage.getItem(ACTIVE)===id)KTAccount.storage.removeItem(ACTIVE);
 if(data.team.id===id){
  ++teamLoadRevision;++saveRevision;
  data=KTModel.validate(KTModel.newProject('custom-'+uid(),'Новая команда'));original=structuredClone(data);
  section='project';selected=side=0;previewOnly=false;
  $('.workspace').classList.remove('show-preview');render();
 }
 await KTStorage.remove(STORAGE+':'+id);
}
function showCreateProject(){
 $('#project-templates').innerHTML='<button data-create-project="empty"><strong>Пустая команда</strong><span>Добавьте состав, правила и карточки с нуля.</span></button>'+Object.entries(window.KT_EXAMPLES||{}).map(([id,team])=>'<button data-create-project="'+esc(id)+'"><strong>'+esc(team.team.name)+'</strong><span>Создать копию шаблона · '+esc(team.team.version||'')+'</span></button>').join('');
 $('#create-project-error').textContent='';$('#create-project-dialog').showModal();
}
async function renameProject(id,name){
 const active=data.team.id===id;
 const saved=active?data:JSON.parse(await KTStorage.load(STORAGE+':'+id)||'null');
 if(saved){
  KTModel.syncTeamKeywords(saved);
  saved.team.name=name;
  KTModel.syncTeamKeywords(saved);
  if(!await KTStorage.save(STORAGE+':'+id,JSON.stringify(saved)))throw Error('Название изменено на сервере, но локальную копию обновить не удалось. Перезагрузите Студию.');
  rememberProject(saved.team);
 }
 if(active){
  original.team.name=name;renderProjectTitle();$('#breadcrumb').textContent=name+(section==='lorePages'?' / АЛЬБОМ':' / КАРТОЧКИ');
  if(section==='project')$('#editor input[data-field="name"]').value=name;
  renderPreview();
 }
}
function persist(edited=true){
 if(removedProjects.has(data.team.id))return Promise.resolve(false);
 KTModel.syncTeamKeywords(data);
 for(const c of data.selectionCards)c.size=c.selectionGroups.reduce((n,g)=>n+g.count,0)||1;
 const revision=++saveRevision,key=STORAGE+':'+data.team.id,value=JSON.stringify(data),team={...data.team};
 if(edited)window.KTCommunity?.track(JSON.parse(value));
 return KTStorage.save(key,value).then(saved=>{
  if(removedProjects.has(team.id)){void KTStorage.remove(key);return false}
  const currentSave=revision===saveRevision&&team.id===data.team.id;
  if(saved)rememberProject(team,currentSave);
  if(currentSave){if(KTAccount.id)window.KTCommunity?.status();else if(!saved)toast('Браузер не смог сохранить изменения. Освободите место и повторите попытку.')}
  return saved;
 });
}
async function openProject(id){
 if(id===data.team.id)return;
 const revision=++teamLoadRevision;
 if(!await persist(false)||revision!==teamLoadRevision){renderProjectTitle();return}
 try{
  const saved=await KTStorage.load(STORAGE+':'+id),example=window.KT_EXAMPLES?.[id];
  if(revision!==teamLoadRevision)return;
  if(!saved&&!example)throw Error('Сохранённый проект не найден');
  const next=KTModel.validate(KTModel.migrate(saved?JSON.parse(saved):example));
  original=example?KTModel.validate(KTModel.migrate(example)):structuredClone(next);data=next;
  section='selectionCards';selected=side=0;previewOnly=false;$('.workspace').classList.toggle('show-preview',false);
  rememberProject(data.team,true);render();
 }catch(err){toast('Не удалось открыть проект: '+err.message);renderProjectTitle()}
}
async function createEmptyProject(templateId='empty'){
 const button=$('#new-project');if(button.disabled)return;button.disabled=true;
 const revision=++teamLoadRevision;
 const choices=[...document.querySelectorAll('[data-create-project]')];choices.forEach(item=>item.disabled=true);
 try{
  if(!await persist(false)||revision!==teamLoadRevision)return;
  const template=templateId==='empty'?null:window.KT_EXAMPLES?.[templateId];
  if(templateId!=='empty'&&!template)throw Error('Шаблон не найден');
  let name=template?template.team.name+' (копия)':'Новая команда',number=2;
  const baseName=name;while([...projectList.values()].includes(name))name=baseName+' '+number++;
  const id='custom-'+uid(),next=KTModel.validate(template?KTModel.migrate(template):KTModel.newProject(id,name));
  next.team.id=id;next.team.name=name;
  if(template)for(const card of next.selectionCards)card.archetypes=['','','',''];
  KTModel.syncTeamKeywords(next);
  if(!await KTStorage.save(STORAGE+':'+next.team.id,JSON.stringify(next)))throw Error('Браузер не смог сохранить новый проект');
  rememberProject(next.team);
  if(revision!==teamLoadRevision)return;
  original=structuredClone(next);data=next;section=template?'selectionCards':'project';selected=side=0;previewOnly=false;$('.workspace').classList.toggle('show-preview',false);
  rememberProject(data.team,true);render();
  window.KTCommunity?.track(data);window.KTCommunity?.showEditor();$('#create-project-dialog').close();
  const input=$('#editor input[data-field="name"]');input?.focus?.();input?.select?.();toast(template?'Копия шаблона создана.':'Пустой проект создан. Укажите название команды и добавьте карточки.');
 }catch(err){$('#create-project-error').textContent='Не удалось создать проект: '+err.message}finally{button.disabled=false;choices.forEach(item=>item.disabled=false)}
}
async function openStoredProject(project,expected){
 const revision=++teamLoadRevision,next=KTModel.validate(KTModel.migrate(project));
 if(!await persist(false)||revision!==teamLoadRevision||expected!==undefined&&JSON.stringify(data)!==expected)return false;
 if(!await KTStorage.save(STORAGE+':'+next.team.id,JSON.stringify(next)))throw Error('Браузер не смог сохранить проект');
 if(revision!==teamLoadRevision||expected!==undefined&&JSON.stringify(data)!==expected)return false;
 data=next;original=structuredClone(next);section='selectionCards';selected=side=0;previewOnly=false;
 $('.workspace').classList.toggle('show-preview',false);rememberProject(data.team,true);render();return true;
}
async function recoverProject(id,project){
 const active=data.team.id===id,next=KTModel.validate(KTModel.migrate(project));
 rememberProject(next.team,active);
 if(active){
  ++teamLoadRevision;++saveRevision;data=next;original=structuredClone(next);side=0;render();
 }
 await KTStorage.save(STORAGE+':'+next.team.id,JSON.stringify(next));
}
function field(label,key,value,type='text'){
 if(type!=='textarea')return '<label>'+label+'<input type="'+type+'" data-field="'+esc(key)+'" value="'+esc(value)+'"></label>';
 const id='text-'+key.replace(/[^a-z0-9-]/gi,'-');
 return '<div class="rich-field"><label for="'+id+'">'+label+'</label><div class="rich-toolbar" role="group" aria-label="Форматирование: '+esc(label)+'">'+
  '<button type="button" data-format="bold" title="Жирный (Ctrl+B / ⌘B)" aria-label="Жирный"><b>Ж</b></button>'+
  '<button type="button" data-format="italic" title="Курсив (Ctrl+I / ⌘I)" aria-label="Курсив"><i>К</i></button>'+
  '<button type="button" data-format="orange" class="rich-orange" title="Оранжевый цвет выделенного текста; повторное нажатие снимает цвет" aria-label="Оранжевый текст">Оранжевый</button>'+
  '<button type="button" data-format="skull" title="Вставить черепок в позицию курсора" aria-label="Вставить черепок">💀</button>'+
  '<button type="button" data-format="triangle" class="rich-triangle" title="Вставить зелёный треугольник" aria-label="Вставить зелёный треугольник">▶</button>'+
  '<button type="button" data-format="diamond" class="rich-diamond" title="Вставить красный ромб" aria-label="Вставить красный ромб">◆</button>'+
  '<button type="button" data-format="bullet" title="Добавить или убрать маркированный список" aria-label="Маркированный список"><span class="rich-bullet" aria-hidden="true">•</span> <span>Список</span></button>'+
  '<label class="rich-size"><span class="visually-hidden">Размер шрифта в пунктах</span><select data-format-size aria-label="Размер шрифта в пунктах"><option value="">Кегль, пт</option>'+[6,7,8,9,10,11,12,14,16,18,20,24].map(n=>'<option value="'+n+'">'+n+' пт</option>').join('')+'</select></label>'+
  '<button type="button" data-format="clear" class="rich-clear" title="Убрать форматирование выделенного текста">Сброс</button></div>'+
  '<textarea id="'+id+'" data-field="'+esc(key)+'" aria-describedby="'+id+'-help">'+esc(value)+'</textarea>'+
  '<details class="rich-help" id="'+id+'-help"><summary>Как форматировать текст</summary><p>Выделите текст и нажмите Ж, К, «Оранжевый» или выберите кегль. Повторное нажатие «Оранжевый» снимает цвет. Кнопки 💀, ▶ и ◆ вставляют черепок, зелёный треугольник и красный ромб в позицию курсора. Для пунктов действия ставьте ▶ или ◆ в начале новой строки — продолжение выровняется по тексту. Без выделения кегль применяется ко всему полю.</p><p>Кнопка «Список» добавляет или убирает оранжевые маркеры у выделенных строк. Enter добавляет пункт; Enter в пустом пункте завершает список.</p><p>Можно писать вручную: <code>**жирный**</code>, <code>*курсив*</code>, <code>***оба***</code>, <code>[color=orange]оранжевый 💀[/color]</code>, <code>[size=12]текст[/size]</code>. Размер — от 6 до 24 пт. Для обычной звёздочки используйте <code>\\*</code>.</p></details></div>';
}
function formatText(el,kind,size){
 const edit=KTText.format(el.value,el.selectionStart,el.selectionEnd,kind,size);if(!edit)return false;
 el.focus();el.setSelectionRange(edit.from,edit.to);
 // Use the browser's editing operation so toolbar changes participate in Undo.
 // Older browsers can still apply the same replacement through setRangeText.
 if(!document.execCommand?.('insertText',false,edit.text)){el.setRangeText(edit.text,edit.from,edit.to,'select');updateField(el)}
 el.setSelectionRange(edit.start,edit.end);
 return true;
}
function select(label,key,value,items){return '<label>'+label+'<select data-field="'+key+'">'+items.map(([k,v])=>'<option value="'+esc(k)+'" '+(k===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>'}
function check(label,key,value){return '<label class="checkbox"><input type="checkbox" data-field="'+key+'" '+(value?'checked':'')+'>'+label+'</label>'}
function panel(title,body,meta=''){return '<section class="panel"><div class="panel-title">'+title+'<span>'+meta+'</span></div>'+body+'</section>'}
function pathSet(obj,path,value){const keys=path.split('.');let t=obj;for(const key of keys.slice(0,-1))t=t[key];t[keys.at(-1)]=value}
function pathGet(obj,path){return path.split('.').reduce((o,k)=>o[k],obj)}
function refreshSectionCount(){
 const badge=$('#navigation [data-nav="'+section+'"] small');
 if(badge&&fixed())badge.textContent=data[section].filter(KTModel.isFilled).length+'/4';
}
function clearRecordDrop(){
 $('#record-list').querySelectorAll('.record-drop-before,.record-drop-after').forEach(el=>el.classList.remove('record-drop-before','record-drop-after','record-drop-vertical'));
}
function cancelRecordDrag(){
 recordDrag=null;clearRecordDrop();
 $('#record-list .record-dragging')?.classList.remove('record-dragging');
}
function renderRecordList(){
 cancelRecordDrag();
 const cards=data[section],movable=Array.isArray(cards)&&cards.length>1;
 $('#record-list').innerHTML=Array.isArray(cards)?cards.map((c,i)=>'<button type="button" class="record '+(i===selected?'active':'')+'" data-record="'+i+'" aria-pressed="'+(i===selected)+'"'+(movable?' draggable="true" title="Перетащите, чтобы изменить порядок. С клавиатуры: Alt + ↑ / ↓." aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"':'')+'><small>'+String(i+1).padStart(2,'0')+'</small><span class="record-name">'+esc(c.name||'Пустая карточка')+'</span>'+(movable?'<span class="record-grip" aria-hidden="true">⠿</span>':'')+'</button>').join(''):'';
}
function moveRecord(from,to){
 const cards=data[section];
 if(!Array.isArray(cards)||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=cards.length||to>=cards.length||from===to)return;
 const active=current(),[moved]=cards.splice(from,1);
 cards.splice(to,0,moved);selected=cards.indexOf(active);
 persist();renderRecordList();renderPreview();
 if(section==='lorePages'){
  $('#editor [data-action="move-lore-page"][data-direction="-1"]').disabled=selected===0;
  $('#editor [data-action="move-lore-page"][data-direction="1"]').disabled=selected===cards.length-1;
 }
 $('#record-list [data-record="'+to+'"]').focus({preventScroll:true});
}
function recordDropTarget(e){
 const drag=recordDrag,button=e.target.closest('#record-list [data-record]');
 if(!drag||drag.project!==data||drag.section!==section||drag.cards!==data[section]||!button)return null;
 const from=drag.cards.indexOf(drag.card),index=Number(button.dataset.record);
 if(from<0||!drag.cards[index])return null;
 const rect=button.getBoundingClientRect(),vertical=getComputedStyle($('#record-list')).gridTemplateColumns.trim().split(/\s+/).length===1;
 const after=vertical?e.clientY>rect.top+rect.height/2:e.clientX>rect.left+rect.width/2;
 const insertion=index+(after?1:0),to=insertion-(from<insertion?1:0);
 return {button,from,to,after,vertical};
}
$('#record-list').addEventListener('pointerdown',()=>{recordClickSuppressed=false});
$('#record-list').addEventListener('keydown',e=>{
 recordClickSuppressed=false;
 const button=e.target.closest('[data-record]');
 if(!button||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
 e.preventDefault();
 const from=Number(button.dataset.record);moveRecord(from,from+(e.key==='ArrowUp'?-1:1));
});
$('#record-list').addEventListener('dragstart',e=>{
 const button=e.target.closest('[data-record]'),cards=data[section],card=cards?.[Number(button?.dataset.record)];
 if(!button||!Array.isArray(cards)||cards.length<2||!card||!e.dataTransfer){e.preventDefault();return}
 recordDrag={project:data,section,cards,card};recordClickSuppressed=true;
 e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-kt-studio-card',card.id);
 button.classList.add('record-dragging');
});
$('#record-list').addEventListener('dragover',e=>{
 const target=recordDropTarget(e);clearRecordDrop();
 if(!target)return;
 e.preventDefault();e.dataTransfer.dropEffect='move';
 if(target.from!==target.to){target.button.classList.add(target.after?'record-drop-after':'record-drop-before');target.button.classList.toggle('record-drop-vertical',target.vertical)}
});
$('#record-list').addEventListener('dragleave',e=>{if(!$('#record-list').contains(e.relatedTarget))clearRecordDrop()});
$('#record-list').addEventListener('drop',e=>{
 const target=recordDropTarget(e);cancelRecordDrag();
 if(!target)return;
 e.preventDefault();moveRecord(target.from,target.to);
});
document.addEventListener('dragend',cancelRecordDrag);
function render(){
 $('#navigation').innerHTML=Object.entries(SECTIONS).map(([key,name])=>'<button data-nav="'+key+'" class="'+(key===section?'active':'')+'"><span>'+name+'</span><small>'+(KTModel.fixed.includes(key)?data[key].filter(KTModel.isFilled).length+'/4':Array.isArray(data[key])?data[key].length:'↗')+'</small></button>').join('');
 $('#section-title').textContent=SECTIONS[section];$('#breadcrumb').textContent=data.team.name+(section==='lorePages'?' / АЛЬБОМ':' / КАРТОЧКИ');
 renderProjectTitle();
 const rosterButton=$('#export-rosz');
 rosterButton.disabled=typeof KTNewRecruit==='undefined'||!KTNewRecruit.compatible(data);
 rosterButton.title='Скачать ростер команды (.rosz)';
 const list=Array.isArray(data[section]);if(list)selected=Math.max(0,Math.min(selected,data[section].length-1));
 $('#add-item').hidden=!list||fixed();
 $('#add-reference-page').hidden=section!=='lorePages';
 $('#add-item').textContent=section==='lorePages'?'+ Страница':'+ Карточка';
 $('#view-toggle').textContent=previewOnly?(section==='lorePages'?'Редактировать страницу':'Редактировать карточку'):(section==='lorePages'?'Показать страницу':'Показать карточку');
 renderRecordList();
 $('#section-note').textContent=section==='selectionCards'?'Группы выбора, варианты вооружения и общие ограничения — в формате оригинальной карточки состава.':section==='equipment'?'Четыре карточки снаряжения. Оружие и правила редактируются внутри каждой карточки.':section==='firefightPloys'?'Четыре карточки Firefight Ploys.':section==='strategicPloys'?'Четыре карточки Strategic Ploys.':section==='teamCards'?'Любое число карточек правил фракции. Состав находится в отдельной вкладке.':'';
 if(section==='lorePages')$('#section-note').textContent='Лор, фотографии и референсы моделей с подписями оружия. Отдельные страницы A4 после карточек в PDF.';
 if(section==='tokenCards')$('#section-note').textContent='Карточки жетонов для PDF и TTS. Круги по умолчанию 20 мм; размеры сохраняются при печати PDF в масштабе 100%.';
 renderEditor();renderPreview();
}
function nestedEditor(c,type,title){
 const records=c[type]||[],opened=nestedStates.get(c)?.[type],movable=type==='weapons'&&records.length>1;
 const body=records.map((r,i)=>{
  const key=type+'.'+i+'.';
  let html=field('Название',key+'name',r.name);
  if(type==='weapons')html+=select('Тип',key+'kind',r.kind,[['ranged','Дальнобойное'],['melee','Ближний бой']])+'<div class="field-grid">'+field('ATK',key+'attacks',r.attacks,'number')+field('HIT',key+'hit',r.hit)+field('DMG',key+'damage',r.damage)+'</div>'+field('Правила оружия',key+'rules',KTModel.weaponRules(r),'textarea')+'<div class="two-fields">'+field('Группа режимов',key+'group',r.group)+field('Режим',key+'mode',r.mode)+'</div>';
  else html+=(type==='actions'?field('Стоимость, AP',key+'cost',r.cost):'')+field('Текст',key+'body',r.body,'textarea');
  return '<details class="nested" data-nested-type="'+type+'" data-nested-id="'+esc(r.id)+'" '+((opened?opened.has(r.id):i===0)?'open':'')+'><summary'+(movable?' data-weapon-drag draggable="true" title="Перетащите, чтобы изменить порядок. С клавиатуры: Alt + ↑ / ↓." aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"':'')+'><span class="nested-name">'+esc(r.name||'Новый блок')+'</span>'+(movable?'<span class="weapon-grip" aria-hidden="true">⠿</span>':'')+'</summary>'+html+(type==='weapons'?'<button class="small" data-save-weapon-profile="'+i+'">Сохранить профиль</button> ':'')+'<button class="danger small" data-remove-nested="'+type+'" data-index="'+i+'">Удалить из карточки</button></details>';
 }).join('');
 const picker=type==='weapons'?'<div class="weapon-profile-picker"><label for="weapon-profile-select">Добавить оружие<select id="weapon-profile-select"><option value="">Новый профиль с нуля</option>'+(data.weaponProfiles||[]).map(p=>'<option value="'+esc(p.id)+'" '+(p.id===weaponProfileChoice?'selected':'')+'>'+esc(p.name+(p.mode?' / '+p.mode:'')+' · '+(p.kind==='melee'?'Ближний бой':'Дальнобойное')+' · '+p.attacks+' / '+p.hit+' / '+p.damage)+'</option>').join('')+'</select></label></div>':'';
 const savedHint=type==='weapons'?'<p class="hint">«Сохранить профиль» добавляет оружие в список этого проекта. Повторное сохранение с тем же названием, типом и режимом обновляет профиль. Уже добавленное на карточки оружие редактируется отдельно.</p>'+(data.weaponProfiles?.length?'<button class="small danger" id="delete-weapon-profile" '+(data.weaponProfiles.some(p=>p.id===weaponProfileChoice)?'':'disabled')+'>Удалить из сохранённых</button>':''):'';
 return panel(title,body+picker+'<button class="add-inline" data-add-nested="'+type+'">+ '+(type==='weapons'?'Добавить оружие':type==='abilities'?'Способность':'Действие')+'</button>'+savedHint,records.length+' на этой карте');
}
function clearWeaponDrop(){
 $('#editor').querySelectorAll('.weapon-drop-before,.weapon-drop-after').forEach(el=>el.classList.remove('weapon-drop-before','weapon-drop-after'));
}
function cancelWeaponDrag(){
 weaponDrag=null;clearWeaponDrop();
 $('#editor .weapon-dragging')?.classList.remove('weapon-dragging');
}
function moveWeapon(from,to){
 const weapons=current()?.weapons;
 if(!Array.isArray(weapons)||!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=weapons.length||to>=weapons.length||from===to)return;
 const [weapon]=weapons.splice(from,1);weapons.splice(to,0,weapon);
 // Rebuild indexed field paths while keeping expanded sections by weapon ID.
 persist();renderEditor();renderPreview();
 const block=Array.from($('#editor').querySelectorAll('[data-nested-type="weapons"]')).find(el=>el.dataset.nestedId===weapon.id);
 block?.querySelector('summary').focus({preventScroll:true});
}
function weaponDropTarget(e){
 const drag=weaponDrag,block=e.target.closest('#editor [data-nested-type="weapons"]');
 if(!drag||drag.project!==data||drag.card!==current()||drag.weapons!==current()?.weapons||!block)return null;
 const from=drag.weapons.indexOf(drag.weapon),index=drag.weapons.findIndex(w=>w.id===block.dataset.nestedId);
 if(from<0||index<0)return null;
 const rect=block.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2;
 const insertion=index+(after?1:0),to=insertion-(from<insertion?1:0);
 return {block,from,to,after};
}
$('#editor').addEventListener('pointerdown',()=>{weaponClickSuppressed=false});
$('#editor').addEventListener('click',e=>{
 if(weaponClickSuppressed&&e.target.closest('summary[data-weapon-drag]')){weaponClickSuppressed=false;e.preventDefault();e.stopPropagation()}
},true);
$('#editor').addEventListener('keydown',e=>{
 weaponClickSuppressed=false;
 const heading=e.target.closest('summary[data-weapon-drag]');
 if(!heading||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
 e.preventDefault();
 const from=current().weapons.findIndex(w=>w.id===heading.parentElement.dataset.nestedId);
 moveWeapon(from,from+(e.key==='ArrowUp'?-1:1));
});
$('#editor').addEventListener('dragstart',e=>{
 const heading=e.target.closest('summary[data-weapon-drag]');if(!heading)return;
 const card=current(),weapons=card?.weapons,weapon=weapons?.find(w=>w.id===heading.parentElement.dataset.nestedId);
 if(!weapon||weapons.length<2||!e.dataTransfer){e.preventDefault();return}
 weaponDrag={project:data,card,weapons,weapon};weaponClickSuppressed=true;
 e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-kt-studio-weapon',weapon.id);
 heading.parentElement.classList.add('weapon-dragging');
});
$('#editor').addEventListener('dragover',e=>{
 const target=weaponDropTarget(e);clearWeaponDrop();
 if(!target)return;
 e.preventDefault();e.dataTransfer.dropEffect='move';
 if(target.from!==target.to)target.block.classList.add(target.after?'weapon-drop-after':'weapon-drop-before');
});
$('#editor').addEventListener('dragleave',e=>{if(!$('#editor').contains(e.relatedTarget))clearWeaponDrop()});
$('#editor').addEventListener('drop',e=>{
 const target=weaponDropTarget(e);cancelWeaponDrag();
 if(!target)return;
 e.preventDefault();moveWeapon(target.from,target.to);
});
document.addEventListener('dragend',cancelWeaponDrag);
function archetypeFields(c){
 const custom=customArchetypes.get(c)||new Set();customArchetypes.set(c,custom);
 return Array.from({length:4},(_,i)=>{
  const value=c.archetypes[i]||'';
  if(value&&!KTModel.archetypeOptions.includes(value))custom.add(i);
  const own=custom.has(i),selected=own?'custom':value;
  const options=[['','Пусто'],...KTModel.archetypeOptions.map(name=>[name,name]),...(own?[['custom','Кастомный архетип']]:[])];
  return '<div class="archetype-slot"><div class="archetype-choice"><label for="archetype-choice-'+i+'">Архетип '+(i+1)+'<select id="archetype-choice-'+i+'" data-archetype-choice="'+i+'">'+options.map(([key,label])=>'<option value="'+esc(key)+'" '+(key===selected?'selected':'')+'>'+esc(label)+'</option>').join('')+'</select></label>'+(!own?'<button type="button" data-archetype-custom="'+i+'">Создать кастом</button>':'')+'</div>'+(own?'<label>Кастомный архетип<input type="text" data-field="archetypes.'+i+'" maxlength="200" value="'+esc(value)+'"></label>':'')+'</div>';
 }).join('');
}
function setArchetype(slot,value,custom=false){
 const c=current();if(section!=='selectionCards'||!c||!Number.isInteger(slot)||slot<0||slot>3)return;
 if(!custom&&value!==''&&!KTModel.archetypeOptions.includes(value))return;
 const modes=customArchetypes.get(c)||new Set();customArchetypes.set(c,modes);
 if(custom)modes.add(slot);else modes.delete(slot);
 c.archetypes[slot]=value;side=0;persist();
 $('#editor .archetype-fields').innerHTML=archetypeFields(c);
 $('#archetype-count').textContent=c.archetypes.filter(a=>a.trim()).length+' / 4';
 renderPreview();
 $(custom?'#editor input[data-field="archetypes.'+slot+'"]':'#archetype-choice-'+slot)?.focus({preventScroll:true});
}
function selectionEditor(c){return c.selectionGroups.map((g,i)=>{
 const key='selectionGroups.'+i+'.';
 return panel('ГРУППА ВЫБОРА '+(i+1),field('Число оперативников',key+'count',g.count,'number')+field('Формулировка после числа',key+'description',g.description,'textarea')+g.entries.map((e,j)=>{
  const p=key+'entries.'+j+'.';
  return '<details class="nested"><summary>'+esc(e.text||'Новый вариант')+'</summary>'+field('Строка списка',p+'text',e.text,'textarea')+field('Вложенные варианты — по одному на строку',p+'options',e.options.join('\n'),'textarea')+select('Связанная карточка оперативника',p+'operativeId',e.operativeId||'',[['','Без ссылки'],...data.operatives.map(o=>[o.id,o.name])])+'<button class="danger small" data-remove-entry="'+i+'" data-index="'+j+'">Удалить строку</button></details>';
 }).join('')+'<div class="row-actions"><button data-add-entry="'+i+'">+ Пункт в список</button><button class="danger" data-remove-group="'+i+'">Удалить группу</button></div>');
}).join('')+'<button data-action="add-selection-group">+ Группа выбора</button>'}
function imageEditor(c){
 const uri=/^data:image\/(png|jpeg);base64,/.test(c.image||'')?c.image:assets[c.image];
 const operative=c.kind==='operative',prefix=operative?'operative':'card',label=operative?'оперативника':'правила';
 return panel('КАРТИНКА','<div class="operative-image-editor">'+(uri?'<img class="operative-image-thumb" src="'+esc(uri)+'" alt="Картинка '+label+'">':'<div class="operative-image-empty" aria-hidden="true">＋</div>')+'<div><input id="'+prefix+'-image-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Выбрать картинку '+label+'"><button id="choose-'+prefix+'-image">'+(c.image?'Заменить картинку':'Добавить картинку')+'</button>'+(operative&&c.image?'<button id="crop-operative-image">'+(c.imageCrop?'Изменить область':'Выбрать область')+'</button>':'')+(c.image?'<button id="remove-'+prefix+'-image" class="danger">Удалить картинку</button>':'')+'<p class="hint">PNG, JPG или WebP · до 10 МБ.<br>'+(operative?'Портрет заполняет шапку по ширине; лишнее снизу обрезается. Кнопка «Выбрать область» задаёт нужный фрагмент. Исходник сохраняется.':'Картинка появится после текста правила. Если места не хватит, она перейдёт на следующую сторону.')+' Сохраняется в проекте, PDF и TTS.</p></div></div>');
}
function logoEditor(){
 const logo=KTModel.isLogo(data.team.logo)?data.team.logo:'';
 return panel('ЛОГОТИП КОМАНДЫ','<div class="operative-image-editor">'+(logo?'<img class="team-logo-thumb" src="'+esc(logo)+'" alt="Логотип команды">':'<div class="operative-image-empty" aria-hidden="true">＋</div>')+'<div><input id="team-logo-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Выбрать логотип команды"><button id="choose-team-logo">'+(logo?'Заменить логотип':'Загрузить логотип')+'</button>'+(logo?'<button id="remove-team-logo" class="danger">Удалить логотип</button>':'')+'<p class="hint">PNG, JPG или WebP · до 10 МБ. Логотип целиком вписывается в квадрат, как в Stats. Прозрачность PNG сохраняется. Появится на карточках и в библиотеке, войдёт в PDF и TTS.</p></div></div>');
}
function imageOptimizationEditor(){
 const count=KTOperativeImage.imageEntries(data).length,busy=imageOptimization===data;
 return panel('РАЗМЕР КАРТИНОК','<button id="shrink-project-images" '+(busy||!count?'disabled':'')+'>'+(busy?'Уменьшаю картинки…':'Уменьшить картинки проекта')+'</button><p class="hint">Загруженных изображений: '+count+'. Уменьшает вес портретов, логотипа, иллюстраций правил и лора. Пропорции и прозрачность сохраняются. Новые загрузки уменьшаются автоматически.</p>');
}
function referenceThumb(img){return '<div class="reference-thumb" data-reference-thumb="'+esc(img.id)+'">'+KTReferences.renderModel(img,assets)+'</div>'}
function referenceEditor(page){
 const opened=nestedStates.get(page)?.references;
 const coordinate=(key,value,label)=>'<label>'+label+'<input type="number" data-field="'+key+'" data-percent min="0" max="100" step="1" value="'+Math.round(value*100)+'"></label>';
 const models=page.images.map((img,i)=>{
  const key='images.'+i+'.';
  const calls=img.callouts.map((c,j)=>{
   const path=key+'callouts.'+j+'.',active=referenceTarget?.page===page&&referenceTarget.image===img&&referenceTarget.callout===c;
   return '<div class="reference-callout-editor">'+field('Подпись оружия',path+'text',c.text)+'<div class="two-fields">'+select('Выноска',path+'edge',c.edge,[['top','Сверху'],['bottom','Снизу']])+select('Текст по краю',path+'align',c.align,[['left','Слева'],['right','Справа']])+'</div><div class="row-actions"><button data-reference-target="'+i+'" data-index="'+j+'" aria-pressed="'+active+'">'+(active?'Отменить выбор точки':'Указать на модели')+'</button><button class="danger" data-reference-remove-callout="'+i+'" data-index="'+j+'">Удалить выноску</button></div><div class="two-fields reference-coordinates">'+coordinate(path+'x',c.x,'Точка X, %')+coordinate(path+'y',c.y,'Точка Y, %')+'</div></div>';
  }).join('');
  return '<details class="nested reference-editor" data-nested-type="references" data-nested-id="'+esc(img.id)+'" '+((opened?opened.has(img.id):i===0)?'open':'')+'><summary data-ui-skip>'+esc(img.modelName||'Новая модель')+'</summary>'+field('Название модели',key+'modelName',img.modelName)+referenceThumb(img)+'<p class="hint reference-point-hint">'+(referenceTarget?.page===page&&referenceTarget.image===img?'Нажмите на оружие на картинке выше.':'Выберите «Указать на модели» у подписи и нажмите на оружие. Точку также можно задать в процентах.')+'</p>'+calls+'<button data-reference-add-callout="'+i+'" '+(img.callouts.length>=4?'disabled':'')+'>+ Подпись оружия</button><div class="row-actions"><button data-lore-replace="'+esc(img.id)+'">Заменить фото</button><button data-reference-duplicate="'+i+'">Копировать модель</button><button data-lore-move="'+i+'" data-direction="-1" '+(!i?'disabled':'')+' aria-label="Модель выше">↑</button><button data-lore-move="'+i+'" data-direction="1" '+(i===page.images.length-1?'disabled':'')+' aria-label="Модель ниже">↓</button><button class="danger" data-lore-remove="'+esc(img.id)+'">Удалить модель</button></div></details>';
 }).join('');
 const operatives=data.operatives.filter(c=>c.image);
 return panel('СТРАНИЦА РЕФЕРЕНСОВ',field('Заголовок','name',page.name)+'<p class="hint">Сетка 3 × 2 на листе A4. Каждые следующие шесть моделей переходят на новый лист. До четырёх подписей оружия на модель.</p>')+panel('МОДЕЛИ',models+'<label>Из оперативника<select id="reference-operative"><option value="">Выберите оперативника с фото</option>'+operatives.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label><button id="reference-from-operative" '+(!operatives.length||page.images.length>=40?'disabled':'')+'>Добавить из оперативника</button><p class="hint">Копируются фото, название и до четырёх названий оружия. Референс редактируется отдельно от датакарты.</p>'+loreUploadControls(page,true),page.images.length+' / 40');
}
function loreUploadControls(page,references=false){return '<input id="lore-image-files" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple aria-label="Выбрать изображения для страницы"><input id="lore-replace-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Заменить изображение страницы"><button id="choose-lore-images" '+(page.images.length>=40?'disabled':'')+'>'+(references?'+ Загрузить фото моделей':'+ Добавить картинки')+'</button><p class="hint">Можно выбрать несколько файлов. PNG, JPG или WebP, до 10 МБ каждый. Изображения сохраняют пропорции и целиком помещаются на странице.</p>'}
function refreshReferenceThumbs(){
 if(section!=='lorePages'||current()?.layout!=='references')return;
 for(const el of document.querySelectorAll('[data-reference-thumb]')){
  const img=current().images.find(i=>i.id===el.dataset.referenceThumb);if(!img)continue;
  el.innerHTML=KTReferences.renderModel(img,assets);el.classList.toggle('is-targeting',referenceTarget?.page===current()&&referenceTarget.image===img);
 }
}
function showReferenceTarget(){
 if(!referenceTarget)return;
 const thumb=Array.from(document.querySelectorAll('[data-reference-thumb]')).find(el=>el.dataset.referenceThumb===referenceTarget.image.id);
 thumb?.scrollIntoView({block:'center'});
}
document.addEventListener('click',e=>{
 const heading=e.target.closest('.reference-editor>summary');
 if(heading&&section==='lorePages'){
  const index=current().images.findIndex(img=>img.id===heading.parentElement.dataset.nestedId);
  if(index>=0){side=Math.floor(index/6);renderPreview()}
 }
 const thumb=e.target.closest('[data-reference-thumb]'),target=referenceTarget;
 if(!thumb||!target||section!=='lorePages'||target.page!==current()||thumb.dataset.referenceThumb!==target.image.id||!current().images.includes(target.image)||!target.image.callouts.includes(target.callout))return;
 const svg=thumb.querySelector('svg'),point=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),g=KTReferences.geometry(target.image);
 const fraction=n=>Math.round(Math.max(0,Math.min(1,n))*1000)/1000;
 target.callout.x=fraction((point.x-g.x)/g.w);target.callout.y=fraction((point.y-g.y)/g.h);
 referenceTarget=null;persist();renderEditor();renderPreview();
});
function renderEditor(options={}){
 cancelWeaponDrag();
 if(editorCard){
  const saved={};
  for(const el of document.querySelectorAll('#editor details[data-nested-type]')){const set=saved[el.dataset.nestedType]??=new Set();if(el.open)set.add(el.dataset.nestedId)}
  nestedStates.set(editorCard,saved);
 }
 const c=current();let out='';
 if(referenceTarget?.page!==c)referenceTarget=null;
 if(c&&options.openNested){const saved=nestedStates.get(c)||{};saved[options.openNested.type]=new Set([options.openNested.id]);nestedStates.set(c,saved)}
 if(section==='lorePages'){
  out=logoEditor()+'<div class="row-actions"><button id="export-lore" '+(!data.lorePages.length?'disabled':'')+'>↓ PDF раздела</button></div>';
  if(!c)out+=panel('КАРТИНКИ И ЛОР','<p>Соберите альбом команды: панорамные фото, историю, инструкции по сборке и примеры покраса.</p><p class="hint">Нажмите «+ Страница», добавьте текст и загрузите изображения.</p>');
  else{
   if(c.layout==='references')out+=referenceEditor(c);
   else{
   out+=panel('СТРАНИЦА A4',field('Заголовок','name',c.name)+select('Тема','category',c.category,Object.entries(KTModel.loreCategories).filter(([key])=>key!=='references'))+field('Лор или описание','body',c.body,'textarea')+select('Расположение изображений','layout',c.layout,[['wide','Крупные изображения на всю ширину'],['gallery','Галерея в две колонки']]));
   const images=c.images.map((img,i)=>'<div class="lore-image-item"><img src="'+esc(/^data:image\//.test(img.image)?img.image:assets[img.image]||img.image)+'" alt="Изображение '+(i+1)+'">'+field('Подпись '+(i+1),'images.'+i+'.caption',img.caption,'textarea')+'<div class="row-actions"><button data-lore-replace="'+esc(img.id)+'">Заменить</button><button data-lore-move="'+i+'" data-direction="-1" '+(!i?'disabled':'')+' aria-label="Изображение '+(i+1)+' выше">↑</button><button data-lore-move="'+i+'" data-direction="1" '+(i===c.images.length-1?'disabled':'')+' aria-label="Изображение '+(i+1)+' ниже">↓</button><button class="danger" data-lore-remove="'+esc(img.id)+'">Удалить изображение</button></div></div>').join('');
   out+=panel('ИЗОБРАЖЕНИЯ',images+loreUploadControls(c),c.images.length+' / 40');
   }
   out+='<div class="row-actions"><button data-action="move-lore-page" data-direction="-1" '+(!selected?'disabled':'')+'>↑ Раньше в PDF</button><button data-action="move-lore-page" data-direction="1" '+(selected===data.lorePages.length-1?'disabled':'')+'>↓ Позже в PDF</button><button data-action="duplicate">Дублировать страницу</button><button class="danger" data-action="delete">Удалить страницу</button></div>';
  }
 }else if(section==='project'){
 out=panel('КОМАНДА',field('Название','name',c.name)+field('Подзаголовок','subtitle',c.subtitle)+field('Версия','version',c.version))+imageOptimizationEditor();
  out+=panel('ПЕЧАТЬ','<p>A4, по четыре стороны на листе, метки реза. Правила: 70 × 121 мм. Оперативники: 121 × 70 мм.</p><p class="hint">Печатайте в масштабе 100%. Стороны с продолжением идут последовательно, как в новом примере. Длинные правила автоматически переходят на следующую сторону.</p>'+field('Акцент','@layout.accent',data.layout.accent,'color')+field('Примечание о стоимости Ploys','@ployNote',data.ployNote,'textarea'));
  out+=panel('ПЕРЕНОС ПРОЕКТА','<div class="row-actions"><button data-action="download-json">Скачать проект</button><label class="import-label">Загрузить проект<input id="import-json" type="file" accept=".json,application/json"></label></div>'+(window.KT_EXAMPLES?.[data.team.id]?'<button class="danger" data-action="restore">Вернуть тестовую команду</button>':''));
  if(typeof KTNewRecruit!=='undefined'&&KTNewRecruit.compatible(data)){
   const roster=KTNewRecruit.summary(data);
   out+=panel('РОСТЕР ДЛЯ TTS / DATA TEAM','<p>'+roster.count+' профилей оперативников с вариантами оружия. Характеристики, способности и правила берутся из текущих карточек команды.</p><details class="nested"><summary data-ui-label>Оперативники и выбранное оружие</summary>'+roster.entries.map(e=>'<p data-ui-skip><b>'+e.count+' × '+esc(e.name)+'</b><br><span class="hint">'+e.weaponIds.map(id=>esc(data.operatives.find(o=>o.id===e.operativeId)?.weapons.find(w=>w.id===id)?.name||'Удалённое оружие: '+id)).join('; ')+'</span></p>').join('')+'</details><p class="hint">Это полный ростер для выбора моделей перед игрой. Правила выбора боевой команды остаются на карточке состава.</p><p>Загрузите файл в <a href="https://datateamapp.azurewebsites.net/Encode" target="_blank" rel="noopener">DataTeam Encode</a>, затем вставьте полученный код в <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3356996125" target="_blank" rel="noopener">KT Command Node 2024</a>.</p>','Ростер .rosz · KT 2024');
  }
 }else if(!c)out=panel('КАРТОЧКИ','<p>Добавьте первую карточку.</p>');
 else if(section==='tokenCards')out=KTTokensEditor.html(c,{field,panel,opened:nestedStates.get(c)?.tokens});
 else if(section==='selectionCards'){
  out=panel('СОСТАВ КИЛЛТИМА',field('Название карточки','name',c.name)+'<p>Всего в группах: '+c.selectionGroups.reduce((n,g)=>n+g.count,0)+' оперативников</p><button id="export-selection" class="primary">↓ PDF карточки состава</button>', 'Шаблон состава · 70 × 121 мм');
  out+='<details class="panel introduction-panel"><summary class="panel-title" data-ui-label>ВВЕДЕНИЕ</summary>'+field('Вводный текст','body',c.body,'textarea')+field('Художественный текст','lore',c.lore||'','textarea')+'</details>';
  out+=panel('АРХЕТИПЫ','<div class="archetype-fields">'+archetypeFields(c)+'</div><p class="hint">Выберите стандартный архетип или создайте кастомный. Пустые поля не печатаются.</p>','<span id="archetype-count">'+c.archetypes.filter(a=>a.trim()).length+' / 4</span>');
  out+=selectionEditor(c);
  out+=panel('ОБЩИЕ ОГРАНИЧЕНИЯ',field('Ограничения состава и сноски','selectionRules',c.selectionRules,'textarea')+field('Пояснения к терминам','selectionNotes',c.selectionNotes,'textarea'));
  out+='<details class="nested"><summary data-ui-label>Оружие, способности и действия этой карточки</summary>'+nestedEditor(c,'weapons','ОРУЖИЕ')+nestedEditor(c,'abilities','СПОСОБНОСТИ')+nestedEditor(c,'actions','ДЕЙСТВИЯ')+'</details>';
  out+='<div class="row-actions"><button data-action="duplicate">Дублировать состав</button>'+(data.selectionCards.length>1?'<button class="danger" data-action="delete">Удалить состав</button>':'')+'</div>';
 }
 else{
  const nameField=field('Название','name',c.name),nameEditor=c.kind==='operative'?'<div class="two-fields">'+nameField+select('Кегль имени, пт','nameFontSize',c.nameFontSize??14,Array.from({length:19},(_,i)=>[i+6,String(i+6)]))+'</div><p class="hint">По умолчанию — 14 пт. Крупное имя в две строки увеличивает шапку.</p>':nameField;
  out=panel('КАРТОЧКА',nameEditor+(section==='teamCards'?field('Подзаголовок','subtitle',c.subtitle||''):'')+(fixed()?field('Стоимость (если есть)','cost',c.cost):''),c.sourcePage?esc(data.team.name)+' · стр. '+c.sourcePage:'Свободная карточка');
  if(section==='equipment'){
   const source=data.sourceArchive?.equipment||[];
   if(source.length)out+=panel('ВЫБРАТЬ ИЗ ИСХОДНИКА','<label>Снаряжение '+esc(data.team.name)+'<select id="source-equipment"><option value="">Выберите предмет</option>'+source.map((e,i)=>'<option value="'+i+'">'+esc(e.name)+' · '+esc(e.cost)+'</option>').join('')+'</select></label><button data-action="use-source">Заполнить эту карточку</button><p class="hint">После вставки оружие и правила редактируются прямо здесь.</p>');
  }
  if(c.kind==='operative'){
   out+=imageEditor(c);
   out+=panel('ПРОФИЛЬ','<div class="field-grid">'+Object.entries(c.stats).map(([k,v])=>field(k,'stats.'+k,v,typeof v==='number'?'number':'text')).join('')+'</div><label>Размер базы (мм)<input type="text" data-field="baseSize" maxlength="16" placeholder="25, 28.5, 60×35" value="'+esc(c.baseSize||'')+'"></label><p class="hint">Печатается в правом нижнем углу датакарты. Оставьте пустым, чтобы скрыть.</p>'+field('Ключевые слова через запятую','keywords',c.keywords.join(', '),'textarea')+select('Расположение правил','rulesLayout',c.rulesLayout||'columns',[['full','На всю ширину'],['columns','В две колонки']])+'<p class="hint">Расстояния указаны в дюймах. Условия выбора редактируются на карточке состава.</p>');
  }
  if(c.kind!=='operative')out+=panel('ТЕКСТ КАРТОЧКИ',field('Художественный текст','lore',c.lore||'','textarea')+field('Правило','body',c.body,'textarea')+'<p class="hint">Расстояния в дюймах, например 6″. При вставке старые символы переводятся автоматически.</p>');
  if(section==='teamCards')out+=imageEditor(c);
  out+=nestedEditor(c,'weapons','ОРУЖИЕ')+nestedEditor(c,'abilities','СПОСОБНОСТИ')+nestedEditor(c,'actions','ДЕЙСТВИЯ');
  out+='<div class="row-actions">'+(fixed()?'<button class="danger" data-action="clear">Очистить место</button>':'<button data-action="duplicate">Дублировать карточку</button><button class="danger" data-action="delete">Удалить карточку</button>')+'</div>';
 }
 $('#editor').innerHTML=out;
 refreshSectionCount();
 refreshReferenceThumbs();
 editorCard=c;
 if(options.openNested){
  const block=Array.from(document.querySelectorAll('#editor details[data-nested-type]')).find(el=>el.dataset.nestedType===options.openNested.type&&el.dataset.nestedId===options.openNested.id);
  if(block){for(let parent=block.parentElement;parent&&parent!==$('#editor');parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;block.querySelector('input')?.focus({preventScroll:true});block.scrollIntoView({block:'nearest'})}
 }
}
function renderPreview(){
 const lore=section==='lorePages';
 $('.preview-toolbar .eyebrow').textContent=lore?'СТРАНИЦА В ПЕЧАТИ':'КАРТОЧКА В ПЕЧАТИ';
 $('.print-hint span').textContent=lore?'Отдельные страницы после карточек':'Четыре стороны на листе · метки реза';
 const c=section==='project'?data.strategicPloys[0]:current();
 if(!c){$('#preview').innerHTML=lore?'<div class="lore-empty">A4<br><span>Здесь появится страница вашего альбома</span></div>':'';$('#side-label').textContent='';$('#prev-side').disabled=$('#next-side').disabled=true;$('#card-size').textContent=lore?'210 × 297 мм':'';$('#preview-note').textContent='';return}
 const cards=lore?KTLore.renderPage(c,data,assets):KTCards.renderCard(c,data,assets,selected);side=Math.min(side,cards.length-1);
 $('#preview').innerHTML='<div class="physical-card '+(lore?'lore-page':c.kind==='operative'?'landscape':'portrait')+'">'+KTCards.inlineSVG(cards[side].svg,'editor-preview')+'</div>';
 $('#side-label').textContent=(lore?'Страница ':'Сторона ')+(side+1)+' / '+cards.length;
 $('#prev-side').disabled=side===0;$('#next-side').disabled=side>=cards.length-1;
 $('#card-size').textContent=lore?'210 × 297 мм':c.kind==='operative'?'121 × 70 мм':'70 × 121 мм';
 $('#preview-note').textContent=lore?(cards.length>1?'Материал занимает '+cards.length+' стр. A4. Все страницы войдут в PDF.':'Эта страница войдёт в PDF после карточек.'):(cards.length>1?'Текст продолжается на следующей стороне. Все стороны войдут в PDF.':'Та же карточка будет напечатана в PDF.');
 if(c.kind==='token-guide')$('#preview-note').textContent='Нажмите на жетон, чтобы изменить его. PDF: масштаб 100%, без подгонки; диаметр круга сохраняется.';
}
function updateField(el){
 let key=el.dataset.field,value=el.type==='checkbox'?el.checked:el.type==='number'?Math.max(0,Number(el.value)):el.value,obj=current();
 if(key==='nameFontSize'){value=Number(value);if(!Number.isInteger(value)||value<6||value>24)return;side=0}
 if(section==='tokenCards'&&key==='name'){value=value.slice(0,200);el.value=value}
 if(el.hasAttribute('data-percent')){value=Math.min(100,value)/100;el.value=Math.round(value*100)}
 if(typeof value==='string'&&section!=='lorePages'){const converted=KTModel.toInches(value);if(converted!==value){value=converted;el.value=value}}
 if(section==='lorePages'&&typeof value==='string'){const max=key==='name'?200:key==='body'?100000:key.endsWith('.caption')?5000:/^images\.\d+\.(modelName|callouts\.\d+\.text)$/.test(key)?80:null;if(max&&value.length>max){value=value.slice(0,max);el.value=value}}
 if(key.startsWith('@')){obj=data;key=key.slice(1)}
 if(key==='keywords'){
  const automatic=KTModel.teamKeyword(data.team.name);
  if(automatic&&value.startsWith(automatic))value=value.slice(automatic.length).replace(/^\s*,\s*/,'');
  value=value.split(',').map(v=>v.trim()).filter(Boolean);
 }
 if(/^selectionGroups\.\d+\.entries\.\d+\.options$/.test(key))value=value.split('\n').map(v=>v.trim()).filter(Boolean);
 if(/^selectionGroups\.\d+\.count$/.test(key))value=Math.max(1,value);
 if(key==='size')value=Math.max(1,value);
 if(key.startsWith('archetypes.')){value=value.slice(0,200);side=0}
 pathSet(obj,key,value);
 if(/^(weapons|abilities|actions)\.\d+\.name$/.test(key))el.closest('details')?.querySelector('.nested-name')?.replaceChildren(document.createTextNode(value||'Новый блок'));
 if(/^images\.\d+\.modelName$/.test(key))el.closest('details')?.querySelector('summary')?.replaceChildren(document.createTextNode(value||'Новая модель'));
 if(section==='lorePages'&&obj.layout==='references'){
  const imageIndex=/^images\.(\d+)\./.exec(key);if(imageIndex)side=Math.floor(Number(imageIndex[1])/6);
  refreshReferenceThumbs();
 }
 if(key.startsWith('selectionGroups.'))obj.size=obj.selectionGroups.reduce((n,g)=>n+g.count,0)||1;
 if(key==='kind'){
  if(value==='recruitment')obj.groupCaps??=[];
  renderEditor();
 }
 persist();renderPreview();refreshSectionCount();
 if(key==='name')$('#record-list .active .record-name')?.replaceChildren(document.createTextNode(value||'Пустая карточка'));
 if(obj===data.team){renderProjectTitle();$('#breadcrumb').textContent=data.team.name+' / КАРТОЧКИ'}
 if(key.startsWith('archetypes.'))$('#archetype-count').textContent=obj.archetypes.filter(a=>a.trim()).length+' / 4';
}
document.addEventListener('input',e=>{if(e.target.dataset.field)updateField(e.target)});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&recordDrag){cancelRecordDrag();return}
 if(e.key==='Escape'&&weaponDrag){cancelWeaponDrag();return}
 if(e.key==='Escape'&&referenceTarget){referenceTarget=null;renderEditor();return}
 if(!e.target.matches?.('.rich-field textarea')||e.isComposing)return;
 if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(formatText(e.target,'list-enter'))e.preventDefault();return}
 if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
 const key=e.code==='KeyB'?'b':e.code==='KeyI'?'i':e.key.toLowerCase();if(key==='b'||key==='i'){e.preventDefault();formatText(e.target,key==='b'?'bold':'italic')}
});
document.addEventListener('change',async e=>{
 if(e.target.dataset.archetypeChoice!==undefined){if(e.target.value!=='custom')setArchetype(Number(e.target.dataset.archetypeChoice),e.target.value);return}
 if(e.target.dataset.field==='keywords'&&current()?.kind==='operative')e.target.value=current().keywords.join(', ');
 if(e.target.id==='weapon-profile-select'){weaponProfileChoice=e.target.value;const remove=$('#delete-weapon-profile');if(remove)remove.disabled=!weaponProfileChoice;return}
 if(e.target.id==='team-logo-file'){const file=e.target.files[0];e.target.value='';void importTeamLogo(file);return}
 if(e.target.matches?.('[data-format-size]')){const size=e.target.value;if(size)formatText(e.target.closest('.rich-field').querySelector('textarea'),'size',size);e.target.value='';return}
 if(e.target.id==='lore-image-files'||e.target.id==='lore-replace-file'){const files=Array.from(e.target.files),replaceId=e.target.id==='lore-replace-file'?e.target.dataset.imageId:null;e.target.value='';importLoreImages(files,replaceId);return}
 if(['operative-image-file','card-image-file'].includes(e.target.id)){const file=e.target.files[0];e.target.value='';importCardImage(file);return}
 if(e.target.dataset.roster!==undefined){const id=e.target.dataset.roster,c=current();c.excludedOperativeIds=c.excludedOperativeIds.filter(v=>v!==id);if(!e.target.checked)c.excludedOperativeIds.push(id);persist();side=0;renderPreview()}
 if(e.target.id==='import-json')importJSON(e.target.files[0]);
});
function newCard(){
 if(section==='tokenCards')return KTTokens.newCard(uid());
 if(section==='lorePages')return KTModel.newLorePage(uid());
 if(section==='selectionCards')return {...KTModel.newSelection(data.team.name+' KILL TEAM'),id:uid()};
 if(section==='operatives')return {...KTModel.blank(uid(),'operative'),name:'NEW OPERATIVE',stats:{APL:2,MOVE:'6″',SAVE:'5+',WOUNDS:8},baseSize:'',keywords:[data.team.name],loadouts:[],group:'CUSTOM',maxSelections:1,image:''};
 return {...KTModel.blank(uid(),'faction'),name:'NEW FACTION RULE'};
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}
const fileStem=(project=data)=>project.team.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,'-');
async function downloadJSON(){try{if(!await KTAccount.requireLogin('download'))return;downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),fileStem()+'-project.json');toast('Файл проекта сохранён')}catch(error){toast(error.message)}}
async function importJSON(file){
 if(!file)return;const revision=++teamLoadRevision;
 try{
  if(file.size>100e6)throw Error('Файл проекта больше 100 МБ');
  const next=KTModel.validate(KTModel.migrate(JSON.parse(await file.text())));
  const optimized=await KTOperativeImage.shrinkProject(next,{isCurrent:()=>revision===teamLoadRevision});
  if(optimized.aborted)return;
  KTModel.validate(next);
  if(revision!==teamLoadRevision||!await persist()||revision!==teamLoadRevision)return;
  original=window.KT_EXAMPLES?.[next.team.id]?KTModel.validate(KTModel.migrate(window.KT_EXAMPLES[next.team.id])):structuredClone(next);
  data=next;section='selectionCards';selected=side=0;previewOnly=false;$('.workspace').classList.toggle('show-preview',false);
  persist();render();toast('Проект загружен'+(optimized.changed?' · картинки уменьшены: '+optimized.changed:'')+(optimized.skipped?' · часть картинок оставлена без изменений':''));
 }catch(e){toast('Не удалось загрузить: '+e.message)}
}
function deletionIntent(button){
 const c=current(),d=button.dataset,a=d.action;
 let target;
 if(d.removeNested)target=c[d.removeNested]?.[Number(d.index)]?.name;
 else if(d.removeGroup!==undefined)target=c.selectionGroups[Number(d.removeGroup)]?.description;
 else if(d.removeEntry!==undefined)target=c.selectionGroups[Number(d.removeEntry)]?.entries[Number(d.index)]?.text;
 else if(d.removeCap!==undefined)target=c.groupCaps[Number(d.removeCap)]?.keyword;
 else if(d.referenceRemoveCallout!==undefined)target=c.images[Number(d.referenceRemoveCallout)]?.callouts[Number(d.index)]?.text;
 else if(d.loreRemove){const image=c.images.find(item=>item.id===d.loreRemove);target=image?.modelName||image?.caption}
 else if(button.id==='delete-weapon-profile')target=data.weaponProfiles.find(profile=>profile.id===weaponProfileChoice)?.name;
 else if(button.id==='remove-team-logo'||a==='restore')target=data.team.name;
 else if(['remove-operative-image','remove-card-image'].includes(button.id)||['clear','delete'].includes(a))target=c?.name;
 else return null;
 return {subject:button.textContent.trim()+(target?' — '+target:''),replace:a==='restore'||a==='clear'};
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 const deletion=deletionIntent(b);
 if(deletion){
  const project=data,card=current();
  if(!await KTDelete.confirm(deletion)||data!==project||current()!==card||!b.isConnected)return;
 }
 if(b.id==='new-project'){showCreateProject();return}
 if(b.id==='shrink-project-images'){void shrinkProjectImages();return}
 if(b.id==='choose-team-logo'){$('#team-logo-file').click();return}
 if(b.id==='remove-team-logo'){logoJobs.delete(data);data.team.logo='';persist();render();toast('Логотип удалён');return}
 if(b.id==='close-create-project'){$('#create-project-dialog').close();return}
 if(b.dataset.createProject){void createEmptyProject(b.dataset.createProject);return}
 if(b.dataset.format){formatText(b.closest('.rich-field').querySelector('textarea'),b.dataset.format);return}
 if(b.dataset.archetypeCustom!==undefined){setArchetype(Number(b.dataset.archetypeCustom),'',true);return}
 if(b.dataset.nav){section=b.dataset.nav;selected=0;side=0;render();return}
 if(b.dataset.record!==undefined){if(recordClickSuppressed){recordClickSuppressed=false;return}selected=Number(b.dataset.record);side=0;render();return}
 if(b.id==='prev-side'||b.id==='next-side'){side+=b.id==='next-side'?1:-1;renderPreview();return}
 if(b.id==='view-toggle'){previewOnly=!previewOnly;$('.workspace').classList.toggle('show-preview',previewOnly);b.textContent=previewOnly?(section==='lorePages'?'Редактировать страницу':'Редактировать карточку'):(section==='lorePages'?'Показать страницу':'Показать карточку');return}
 if(b.id==='choose-lore-images'){$('#lore-image-files').click();return}
 if(b.id==='add-reference-page'){
  if(data.lorePages.length>=100){toast('В проекте может быть до 100 страниц.');return}
  data.lorePages.push(KTModel.newReferencePage(uid()));selected=data.lorePages.length-1;side=0;persist();render();return;
 }
 if(b.id==='reference-from-operative'){
  const page=current(),source=data.operatives.find(c=>c.id===$('#reference-operative').value);
  if(!source?.image){toast('Выберите оперативника с фото');return}
  if(page.images.length>=40)return;
  const model=KTModel.referenceModel(uid(),source);
  model.callouts=(source.weapons||[]).slice(0,4).map((weapon,i)=>({...KTModel.referenceCallout(uid(),i),text:weapon.name.slice(0,80)}));
  page.images.push(model);side=Math.floor((page.images.length-1)/6);persist();renderEditor({openNested:{type:'references',id:model.id}});renderPreview();return;
 }
 if(b.dataset.referenceTarget!==undefined){
  const page=current(),image=page.images[Number(b.dataset.referenceTarget)],callout=image.callouts[Number(b.dataset.index)];
  referenceTarget=referenceTarget?.callout===callout?null:{page,image,callout};renderEditor();showReferenceTarget();return;
 }
 if(b.dataset.referenceAddCallout!==undefined){
  const image=current().images[Number(b.dataset.referenceAddCallout)];if(image.callouts.length>=4)return;
  const callout=KTModel.referenceCallout(uid(),image.callouts.length);image.callouts.push(callout);referenceTarget={page:current(),image,callout};
  persist();renderEditor();renderPreview();showReferenceTarget();return;
 }
 if(b.dataset.referenceRemoveCallout!==undefined){
  current().images[Number(b.dataset.referenceRemoveCallout)].callouts.splice(Number(b.dataset.index),1);referenceTarget=null;persist();renderEditor();renderPreview();return;
 }
 if(b.dataset.referenceDuplicate!==undefined){
  const page=current();if(page.images.length>=40)return;
  const model=structuredClone(page.images[Number(b.dataset.referenceDuplicate)]);model.id=uid();model.callouts.forEach(c=>c.id=uid());
  page.images.push(model);side=Math.floor((page.images.length-1)/6);persist();renderEditor({openNested:{type:'references',id:model.id}});renderPreview();return;
 }
 if(b.id==='export-lore'){exportPDF({section:'lorePages'});return}
 if(b.dataset.loreReplace){const input=$('#lore-replace-file');input.dataset.imageId=b.dataset.loreReplace;input.click();return}
 if(b.dataset.loreRemove){const page=current();loreJobs.delete(page);page.images=page.images.filter(img=>img.id!==b.dataset.loreRemove);side=0;persist();renderEditor();renderPreview();return}
 if(b.dataset.loreMove!==undefined){const images=current().images,from=Number(b.dataset.loreMove),to=from+Number(b.dataset.direction);if(to>=0&&to<images.length){[images[from],images[to]]=[images[to],images[from]];side=0;persist();renderEditor();renderPreview()}return}
 if(b.id==='export'){exportPDF();return}
 if(['choose-operative-image','choose-card-image'].includes(b.id)){$('#'+b.id.replace('choose-','')+'-file').click();return}
 if(b.id==='crop-operative-image'){editOperativeCrop();return}
 if(['remove-operative-image','remove-card-image'].includes(b.id)){const card=current();if(['operative','faction','recruitment'].includes(card?.kind)){portraitJobs.delete(card);card.image='';delete card.imageWidth;delete card.imageHeight;delete card.imageCrop;persist();renderEditor();renderPreview();toast('Картинка удалена')}return}
 if(b.id==='export-rosz'){exportROSZ();return}
 if(b.id==='open-tts'){openTTS();return}
 if(b.id==='close-tts'){$('#tts-dialog').close();return}
 if(b.id==='build-tts'){exportTTS();return}
 if(b.id==='export-selection'){exportPDF({section:'selectionCards',index:selected});return}
 if(b.dataset.editOperative!==undefined){section='operatives';selected=Number(b.dataset.editOperative);side=0;render();return}
 if(b.id==='export-tokens'){exportPDF({section:'tokenCards',index:selected},data,b);return}
 if(b.id==='add-item'){if(section==='tokenCards'&&data.tokenCards.length>=100){toast('В проекте может быть не больше 100 карточек жетонов');return}data[section].push(newCard());selected=data[section].length-1;side=0;persist();render();return}
 const c=current(),a=b.dataset.action;
 if(b.dataset.saveWeaponProfile!==undefined){
  try{const profile=KTModel.saveWeaponProfile(data,c.weapons[Number(b.dataset.saveWeaponProfile)],uid());weaponProfileChoice=profile.id;persist();renderEditor();toast('Профиль «'+profile.name+'» сохранён в проекте')}catch(error){toast(error.message)}return;
 }
 if(b.id==='delete-weapon-profile'){
  const profile=data.weaponProfiles?.find(p=>p.id===weaponProfileChoice);if(!profile)return;
  data.weaponProfiles=data.weaponProfiles.filter(p=>p.id!==profile.id);weaponProfileChoice='';persist();renderEditor();toast('Профиль удалён из списка. Оружие на карточках сохранено.');return;
 }
 if(a==='move-lore-page'&&section==='lorePages'){const to=selected+Number(b.dataset.direction);if(to>=0&&to<data.lorePages.length){[data.lorePages[selected],data.lorePages[to]]=[data.lorePages[to],data.lorePages[selected]];selected=to;persist();render()}return}
 if(a==='add-selection-group'){c.selectionGroups.push({id:uid(),count:1,description:data.team.name+' operatives selected from the following list:',entries:[]});persist();render();return}
 if(b.dataset.removeGroup!==undefined){c.selectionGroups.splice(Number(b.dataset.removeGroup),1);persist();render();return}
 if(b.dataset.addEntry!==undefined){c.selectionGroups[Number(b.dataset.addEntry)].entries.push({id:uid(),operativeId:'',text:'NEW OPERATIVE',options:[]});persist();render();return}
 if(b.dataset.removeEntry!==undefined){c.selectionGroups[Number(b.dataset.removeEntry)].entries.splice(Number(b.dataset.index),1);persist();render();return}
 if(b.dataset.addNested){
  const type=b.dataset.addNested,id=uid();
  try{
   const selectedProfile=type==='weapons'?$('#weapon-profile-select')?.value:'';
   const record=type==='weapons'?(selectedProfile?KTModel.weaponFromProfile(data,selectedProfile,id):{id,name:'New weapon',kind:'ranged',attacks:4,hit:'4+',damage:'3/4',rules:'',group:'',mode:''}):{id,name:type==='actions'?'New action':'New ability',body:'',...(type==='actions'?{cost:'1AP'}:{})};
   c[type].push(record);persist();renderEditor({openNested:{type,id}});renderPreview();
  }catch(error){toast(error.message)}return;
 }
 if(b.dataset.removeNested){const type=b.dataset.removeNested,n=Number(b.dataset.index),id=c[type][n].id;c[type].splice(n,1);if(type==='weapons')for(const l of c.loadouts||[])l.weaponIds=l.weaponIds.filter(v=>v!==id);persist();renderEditor();renderPreview();return}
 if(b.dataset.removeCap!==undefined){c.groupCaps.splice(Number(b.dataset.removeCap),1);persist();renderEditor();renderPreview();return}
 if(b.id==='save-json')void KTCommunity.save();
 if(a==='download-json')void downloadJSON();
 if(a==='archive')downloadBlob(new Blob([JSON.stringify(data.sourceArchive||{},null,2)],{type:'application/json'}),fileStem()+'-source-archive.json');
 if(a==='add-cap'){(c.groupCaps??=[]).push({keyword:'GROUP',max:1});persist();renderEditor();renderPreview()}
 if(a==='use-source'){
  const value=$('#source-equipment').value;if(value===''){toast('Выберите предмет из исходника');return}
  if(KTModel.isFilled(c)&&!confirm('Заменить содержимое этой карточки выбранным предметом?'))return;
  const source=data.sourceArchive.equipment[Number(value)];data.equipment[selected]={...KTModel.normalizeCard(source),id:c.id};side=0;persist();render();toast('Предмет добавлен в эту карточку');
 }
 if(a==='clear'){data[section][selected]=KTModel.blank(c.id,c.kind);side=0;persist();render()}
 if(a==='duplicate'){if(section==='tokenCards'&&data.tokenCards.length>=100){toast('В проекте может быть не больше 100 карточек жетонов');return}const copy=structuredClone(c);copy.id=uid();copy.name=(section==='tokenCards'?copy.name.slice(0,193):copy.name)+' (copy)';data[section].push(copy);selected=data[section].length-1;side=0;persist();render()}
 if(a==='delete'){if(section==='operatives')for(const selection of data.selectionCards){selection.excludedOperativeIds=selection.excludedOperativeIds.filter(id=>id!==c.id);for(const g of selection.selectionGroups)for(const e of g.entries)if(e.operativeId===c.id)e.operativeId=''}data[section].splice(selected,1);side=0;persist();render()}
 if(a==='restore'){data=structuredClone(original);section='selectionCards';selected=0;side=0;persist();render()}
});
const portraitJobs=new WeakMap();
const logoJobs=new WeakMap();
async function shrinkProjectImages(){
 if(imageOptimization)return;
 const project=data;imageOptimization=project;renderEditor();
 try{
  const result=await KTOperativeImage.shrinkProject(project,{isCurrent:()=>data===project&&!removedProjects.has(project.team.id),onProgress:(done,total)=>{const button=$('#shrink-project-images');if(data===project&&button)button.textContent='Уменьшаю картинки: '+done+' / '+total}});
  if(result.aborted)return;
  if(result.changed){KTModel.validate(project);await persist();renderProjectTitle();renderPreview()}
  toast((result.changed?'Уменьшено картинок: '+result.changed+'. Проект легче на '+(result.saved/1024).toFixed(0)+' КБ.':'Картинки уже достаточно компактные.')+(result.skipped?' Некоторые картинки оставлены без изменений.':''));
 }catch(error){toast('Не удалось уменьшить картинки: '+error.message)}
 finally{if(imageOptimization===project)imageOptimization=null;if(data===project&&section==='project')renderEditor()}
}
async function importTeamLogo(file){
 if(!file)return;
 const project=data,token={};logoJobs.set(project,token);
 const button=$('#choose-team-logo');button.disabled=true;button.textContent='Загружаю логотип…';
 try{
  const logo=await KTOperativeImage.prepare(file,{profile:'logo'});
  if(data!==project||logoJobs.get(project)!==token)return;
  project.team.logo=logo;persist();renderProjectTitle();renderPreview();toast('Логотип добавлен');
 }catch(error){toast('Не удалось загрузить логотип: '+error.message)}
 finally{if(logoJobs.get(project)===token){logoJobs.delete(project);if(data===project&&section==='lorePages')renderEditor()}}
}
const loreJobs=new WeakMap();
async function importLoreImages(files,replaceId=null){
 const project=data,page=current();if(section!=='lorePages'||!page||!files.length)return;
 if(!replaceId&&page.images.length+files.length>40){toast('На одной странице можно добавить до 40 картинок. Создайте ещё одну страницу.');return}
 const target=replaceId?page.images.find(img=>img.id===replaceId):null;if(replaceId&&!target)return;
 const token={};loreJobs.set(page,token);const button=$('#choose-lore-images');button.disabled=true;
 let added=0,failed=[];
 try{
  for(const file of replaceId?files.slice(0,1):files){
   if(data!==project||!data.lorePages.includes(page)||loreJobs.get(page)!==token)return;
   button.textContent='Загружаю '+(added+failed.length+1)+' / '+files.length+'…';
   try{
    const result=await KTOperativeImage.prepare(file,{details:true,profile:page.layout==='references'?'card':'page'});
    if(data!==project||!data.lorePages.includes(page)||loreJobs.get(page)!==token)return;
    const values={image:result.image,imageWidth:result.width,imageHeight:result.height};
    if(target){if(!page.images.includes(target))return;Object.assign(target,values)}else page.images.push(page.layout==='references'?KTModel.referenceModel(uid(),{...values,name:file.name.replace(/\.[^.]+$/,'')}):{id:uid(),...values,caption:''});
    added++;persist();if(current()===page){side=0;renderPreview()}
   }catch(e){failed.push(file.name+': '+e.message)}
  }
  toast((added?(replaceId?'Картинка заменена. ':'Добавлено картинок: '+added+'. '):'')+(failed.length?failed.join('; '):'Изображения включены в PDF.'));
 }finally{if(loreJobs.get(page)===token){loreJobs.delete(page);if(data===project&&current()===page)renderEditor()}}
}
async function importCardImage(file){
 if(!file)return;
 const project=data,collection=section,card=current();if(!['operative','faction','recruitment'].includes(card?.kind))return;
 const token={};portraitJobs.set(card,token);const button=$('#choose-'+(card.kind==='operative'?'operative':'card')+'-image');button.disabled=true;button.textContent='Загружаю картинку…';
 let added=false;
 try{
  const result=await KTOperativeImage.prepare(file,{details:true,profile:card.kind==='operative'?'operative':'card'});
  if(data!==project||!data[collection]?.includes(card)||portraitJobs.get(card)!==token)return;
  card.image=typeof result==='string'?result:result.image;
  delete card.imageCrop;
  if(result.width&&result.height){card.imageWidth=result.width;card.imageHeight=result.height}else{delete card.imageWidth;delete card.imageHeight}
  persist();
  if(current()===card){renderEditor();renderPreview()}
  toast('Картинка добавлена: '+card.name);
  added=true;
 }catch(e){toast('Не удалось добавить картинку: '+e.message)}
 finally{if(portraitJobs.get(card)===token){portraitJobs.delete(card);if(data===project&&current()===card)renderEditor()}}
 if(added&&data===project&&current()===card&&card.kind==='operative'&&typeof KTOperativeCrop!=='undefined')editOperativeCrop();
}
async function editOperativeCrop(){
 const project=data,card=current();if(card?.kind!=='operative'||!card.image)return;
 const source=card.image,token={},button=$('#crop-operative-image');portraitJobs.set(card,token);if(button)button.disabled=true;
 try{
  const uri=/^data:image\//.test(source)?source:assets[source]||source;
  const result=await KTOperativeCrop.open(uri,card.imageCrop,KTCards.portraitFrame(card));
  if(!result||data!==project||!data.operatives.includes(card)||card.image!==source||portraitJobs.get(card)!==token)return;
  card.imageCrop=result.crop;card.imageWidth=result.width;card.imageHeight=result.height;
  persist();if(current()===card){renderEditor();renderPreview()}toast('Выбранная область перенесена на карточку');
 }catch(e){toast('Не удалось выбрать область: '+e.message)}
 finally{if(portraitJobs.get(card)===token){portraitJobs.delete(card);if(data===project&&current()===card)renderEditor()}}
}
const importOperativeImage=importCardImage;
async function base64File(url){
 if(window.KT_ASSETS?.[url])return window.KT_ASSETS[url];
 const response=await fetch(url);if(!response.ok)throw Error('Не удалось загрузить '+url);
 const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
}
async function preparePDF(snapshot=data){
 const [display,symbol]=await Promise.all([base64File('vendor/BebasNeue-Regular.ttf'),base64File('vendor/NotoSansSymbols2-Regular.ttf')]);
 pdfMake.addVirtualFileSystem({...vfs,'Display.ttf':display.split(',')[1],'Symbols.ttf':symbol.split(',')[1]});
 pdfMake.fonts={Roboto:{normal:'Roboto-Regular.ttf',bold:'Roboto-Medium.ttf',italics:'Roboto-Italic.ttf',bolditalics:'Roboto-MediumItalic.ttf'},Display:{normal:'Display.ttf',bold:'Display.ttf',italics:'Display.ttf',bolditalics:'Display.ttf'},Symbols:{normal:'Symbols.ttf',bold:'Symbols.ttf',italics:'Symbols.ttf',bolditalics:'Symbols.ttf'}};
 const paths=['assets/paper.jpg',...KTPageBackground.paths,...new Set([...snapshot.operatives,...snapshot.teamCards,...snapshot.lorePages.flatMap(p=>p.images)].map(o=>o.image).filter(p=>/^assets\/[a-z0-9.-]+\.(png|jpg|jpeg)$/i.test(p||'')))],loaded={};
 await Promise.all(paths.map(async p=>loaded[p]=await base64File(p)));
 if(snapshot===data){Object.assign(assets,loaded)}
 return loaded;
}
async function exportPDF(selection=null,project=data,button=$(selection?.section==='lorePages'?'#export-lore':selection?'#export-selection':'#export')){
 const snapshot=structuredClone(project),external=project!==data,lore=selection?.section==='lorePages',label=button.textContent;button.disabled=true;button.textContent='Собираю PDF…';
 try{
  KTModel.validate(snapshot);const loaded=await preparePDF(snapshot);
  await new Promise((resolve,reject)=>{
   let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timeout);window.removeEventListener('unhandledrejection',failed);error?reject(error):resolve()};
   const failed=e=>finish(Error(String(e.reason?.message||e.reason))),timeout=setTimeout(()=>finish(Error('Экспорт занял слишком много времени')),60000);
   window.addEventListener('unhandledrejection',failed);
   try{pdfMake.createPdf(buildTeamPDF(snapshot,loaded,selection)).getBlob(blob=>{if(done)return;downloadBlob(blob,fileStem(snapshot)+(lore?'-pictures-and-lore':selection?.section==='tokenCards'?'-tokens':selection?'-selection':'-cards')+'.pdf');finish()})}catch(e){finish(e)}
  });
  toast('PDF готов');return true;
 }catch(e){if(external)throw e;toast('Ошибка экспорта: '+e.message)}finally{button.disabled=false;button.textContent=label}
}
let ttsURL=null,ttsBusy=false,ttsSnapshot=null;
function exportROSZ(project=data){
 try{const result=KTNewRecruit.archive(project);downloadBlob(new Blob([result.bytes],{type:'application/zip'}),result.filename);toast('Ростер готов: '+result.report.count+' оперативников. Загрузите .rosz в DataTeam Encode.');return result}
 catch(e){if(project!==data)throw e;toast('Ошибка ростера: '+e.message)}
}
function openTTS(project=data){
 if(ttsBusy)return;
 try{
  const snapshot=structuredClone(project),p=KTTTS.plan(snapshot,{});ttsSnapshot=snapshot;$('#tts-summary').textContent=p.team.name+' · '+p.cardCount+' карт · '+p.doubleSided+' двусторонних'+(p.incomplete?' · Есть незаполненные места':'');
  $('#tts-sheets').innerHTML=p.sheets.map(s=>'<section class="tts-sheet"><p data-ui-skip><b>Face:</b> '+s.faceFile+'<br><b>Back:</b> '+s.backFile+'</p><p data-ui-skip><b>Width:</b> '+s.columns+' · <b>Height:</b> '+s.rows+' · <b>Number:</b> '+s.count+'</p></section>').join('');
  $('#tts-limit').hidden=p.sheets.length===1;
  $('#tts-status').textContent='';$('#tts-result').hidden=true;$('#tts-dialog').showModal();
 }catch(e){if(project!==data)throw e;toast('Не удалось подготовить колоду: '+e.message)}
}
async function prepareTTS(snapshot){
 const paths=['assets/paper.jpg','vendor/BebasNeue-Regular.ttf','vendor/NotoSansSymbols2-Regular.ttf','vendor/Roboto-Regular.ttf','vendor/Roboto-Medium.ttf','vendor/Roboto-Italic.ttf','vendor/Roboto-MediumItalic.ttf',...new Set([...snapshot.operatives,...snapshot.teamCards].map(o=>o.image).filter(Boolean))],result={};
 await Promise.all(paths.map(async path=>{if(path.startsWith('data:image/')){result[path]=path;return}if(!/^(assets\/[a-z0-9.-]+\.(png|jpg|jpeg)|vendor\/[a-z0-9-]+\.ttf)$/i.test(path))throw Error('Не найдено изображение для экспорта: '+path);result[path]=await base64File(path)}));
 return result;
}
async function exportTTS(){
 if(ttsBusy)return;ttsBusy=true;const button=$('#build-tts');button.disabled=true;$('#open-tts').disabled=true;$('#close-tts').disabled=true;$('#tts-result').hidden=true;
 try{
  const snapshot=structuredClone(ttsSnapshot||data);
  $('#tts-status').textContent='Подготавливаю изображения и шрифты…';
  const loaded=await prepareTTS(snapshot),result=await KTTTS.browserExport(snapshot,loaded,{onProgress:(done,total)=>$('#tts-status').textContent='Собираю листы карт: '+done+' / '+total});
  if(ttsURL)URL.revokeObjectURL(ttsURL);ttsURL=URL.createObjectURL(result.blob);
  const link=$('#tts-download');link.href=ttsURL;link.download=result.filename;link.textContent='↓ Скачать '+result.filename+' · '+(result.blob.size/1048576).toFixed(1)+' МБ';
  $('#tts-status').textContent='Готово: '+result.cardCount+' карт · '+snapshot.team.name;$('#tts-result').hidden=false;
  return result;
 }catch(e){$('#tts-status').textContent='Ошибка экспорта: '+e.message}
 finally{ttsBusy=false;button.disabled=false;$('#open-tts').disabled=false;$('#close-tts').disabled=false}
}
$('#tts-dialog').addEventListener('cancel',e=>{if(ttsBusy)e.preventDefault()});
async function init(){
 try{
  original=KTModel.validate(KTModel.migrate(window.KT_SOURCE||await(await fetch('team.json')).json()));
  let migrated=false;
  try{
   try{const entries=JSON.parse(KTAccount.storage.getItem(PROJECTS)||'[]');if(Array.isArray(entries))for(const entry of entries)if(Array.isArray(entry)&&typeof entry[0]==='string'&&typeof entry[1]==='string')projectList.set(entry[0],entry[1])}catch{}
   for(const key of PREVIOUS){const old=KTAccount.storage.getItem(key);if(old){const converted=KTModel.validate(KTModel.migrate(JSON.parse(old))),target=STORAGE+':'+converted.team.id;if(!KTAccount.storage.getItem(target))await KTStorage.save(target,JSON.stringify(converted));rememberProject(converted.team)}}
   const id=KTAccount.storage.getItem(ACTIVE)||original.team.id,example=window.KT_EXAMPLES?.[id];
   const saved=await KTStorage.load(STORAGE+':'+id);
   data=saved?KTModel.validate(KTModel.migrate(JSON.parse(saved))):example?KTModel.validate(KTModel.migrate(example)):structuredClone(original);
   original=window.KT_EXAMPLES?.[data.team.id]?KTModel.validate(KTModel.migrate(window.KT_EXAMPLES[data.team.id])):structuredClone(data);
   migrated=!!saved&&saved!==JSON.stringify(data);rememberProject(data.team,true);
  }catch{data=structuredClone(original);toast('Сохранённый проект не удалось прочитать. Исходная копия открыта; прежнее сохранение осталось в браузере.')}
  assets={...(window.KT_ASSETS||{}),...KTPageBackground.previewAssets(window.KT_ASSETS),'assets/paper.jpg':window.KT_ASSETS?.['assets/paper.jpg']||'assets/paper.jpg'};
  for(const team of [original,data,...Object.values(window.KT_EXAMPLES||{})])for(const o of [...team.operatives,...team.teamCards,...(team.lorePages||[]).flatMap(p=>p.images)])if(o.image)assets[o.image]=window.KT_ASSETS?.[o.image]||o.image;
  render();if(migrated){persist();toast('Проект обновлён. Ваши правки сохранены.')}
  window.ktStudio={getData:()=>structuredClone(data),toast,validateData:KTModel.validate,buildDefinition:()=>buildTeamPDF(data,assets),preparePDF,exportPDF,prepareTTS,openTTS,exportTTS,exportROSZ,importOperativeImage,importCardImage,importLoreImages,renderCard:(section,index)=>section==='lorePages'?KTLore.renderPage(data.lorePages[index],data,assets):KTCards.renderCard(data[section][index],data,assets,index)};
  await window.KTCommunity?.init({getData:()=>structuredClone(data),persist,openLocal:openProject,openData:openStoredProject,createEmptyProject,showCreateProject,removeProject,renameProject,recoverProject,localIds:()=>[...projectList.keys()],downloadJSON,toast});
  if(new URLSearchParams(location.search).get('section')==='tokenCards'&&section!=='tokenCards'){section='tokenCards';selected=side=0;render()}
  $('#new-project').disabled=false;
 }catch(e){$('#editor').textContent='Не удалось открыть проект: '+e.message}
}
window.ktStudioReady=init();

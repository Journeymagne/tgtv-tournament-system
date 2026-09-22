'use strict';
const $=s=>document.querySelector(s),esc=KTCards.esc;
const SECTIONS={selectionCards:'Состав киллтима',teamCards:'Правила команды',strategicPloys:'Strategic Ploys',firefightPloys:'Firefight Ploys',equipment:'Equipment',operatives:'Оперативники',lorePages:'Картинки и лор',project:'Проект и исходники'};
const STORAGE='kt-studio-cards-v6',PREVIOUS=[];
const PROJECTS=STORAGE+':project-list',ACTIVE=STORAGE+':active-project',projectList=new Map();
let data,original,section='selectionCards',selected=0,side=0,assets={},pdfReady=false,timer;
let previewOnly=false;
let saveRevision=0,teamLoadRevision=0;
const current=()=>section==='project'?data.team:data[section]?.[selected];
const fixed=()=>KTModel.fixed.includes(section);
const uid=()=>crypto.randomUUID();
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('#toast').style.display='none',4500)}
function rememberProject(team,active=false){
 projectList.set(team.id,team.name);
 try{KTAccount.storage.setItem(PROJECTS,JSON.stringify([...projectList]));if(active)KTAccount.storage.setItem(ACTIVE,team.id)}catch{}
}
function renderProjectTitle(){
 $('.project-name').textContent=data.team.name+' · v.'+data.team.version;
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
  section='project';selected=side=0;pdfReady=false;previewOnly=false;
  $('.workspace').classList.remove('show-preview');render();
 }
 await KTStorage.remove(STORAGE+':'+id);
}
function showCreateProject(){
 $('#project-templates').innerHTML='<button data-create-project="empty"><strong>Пустая команда</strong><span>Добавьте состав, правила и карточки с нуля.</span></button>'+Object.entries(window.KT_EXAMPLES||{}).map(([id,team])=>'<button data-create-project="'+esc(id)+'"><strong>'+esc(team.team.name)+'</strong><span>Создать копию шаблона · '+esc(team.team.version||'')+'</span></button>').join('');
 $('#create-project-error').textContent='';$('#create-project-dialog').showModal();
}
function persist(edited=true){
 if(removedProjects.has(data.team.id))return Promise.resolve(false);
 for(const c of data.selectionCards)c.size=c.selectionGroups.reduce((n,g)=>n+g.count,0)||1;
 const revision=++saveRevision,key=STORAGE+':'+data.team.id,value=JSON.stringify(data),team={...data.team};
 $('#save-status').textContent='Сохраняю изменения…';
 return KTStorage.save(key,value).then(saved=>{
  if(removedProjects.has(team.id)){void KTStorage.remove(key);return false}
  const currentSave=revision===saveRevision&&team.id===data.team.id;
  if(saved){rememberProject(team,currentSave);if(edited)window.KTCommunity?.track(JSON.parse(value))}
  if(currentSave){$('#save-status').textContent=saved?(KTAccount.id?'Локальная копия обновлена':'Правки только в этом браузере · войдите для сохранения'):'Не удалось сохранить локальную копию';if(!saved)toast('Браузер не смог сохранить изменения. Освободите место и повторите попытку.')}
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
  section='selectionCards';selected=side=0;pdfReady=false;previewOnly=false;$('.workspace').classList.toggle('show-preview',false);
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
  if(!await KTStorage.save(STORAGE+':'+next.team.id,JSON.stringify(next)))throw Error('Браузер не смог сохранить новый проект');
  rememberProject(next.team);
  if(revision!==teamLoadRevision)return;
  original=structuredClone(next);data=next;section=template?'selectionCards':'project';selected=side=0;pdfReady=false;previewOnly=false;$('.workspace').classList.toggle('show-preview',false);
  rememberProject(data.team,true);render();$('#save-status').textContent=KTAccount.id?'Локальная копия обновлена':'Правки только в этом браузере · войдите для сохранения';
  window.KTCommunity?.track(data);window.KTCommunity?.showEditor();$('#create-project-dialog').close();
  const input=$('#editor input[data-field="name"]');input?.focus?.();input?.select?.();toast(template?'Копия шаблона создана.':'Пустой проект создан. Укажите название команды и добавьте карточки.');
 }catch(err){$('#create-project-error').textContent='Не удалось создать проект: '+err.message}finally{button.disabled=false;choices.forEach(item=>item.disabled=false)}
}
async function openStoredProject(project){
 const revision=++teamLoadRevision,next=KTModel.validate(KTModel.migrate(project));
 if(!await persist(false)||revision!==teamLoadRevision)return false;
 if(!await KTStorage.save(STORAGE+':'+next.team.id,JSON.stringify(next)))throw Error('Браузер не смог сохранить проект');
 if(revision!==teamLoadRevision)return false;
 data=next;original=structuredClone(next);section='selectionCards';selected=side=0;pdfReady=false;previewOnly=false;
 $('.workspace').classList.toggle('show-preview',false);rememberProject(data.team,true);render();return true;
}
async function copyProject(){
 const copy=structuredClone(data);copy.team.id='custom-'+uid();copy.team.name+=' (копия)';
 if(await openStoredProject(copy)){await persist();toast('Ваши правки сохранены отдельным черновиком.');return true}
 return false;
}
function field(label,key,value,type='text'){
 if(type!=='textarea')return '<label>'+label+'<input type="'+type+'" data-field="'+esc(key)+'" value="'+esc(value)+'"></label>';
 const id='text-'+key.replace(/[^a-z0-9-]/gi,'-');
 return '<div class="rich-field"><label for="'+id+'">'+label+'</label><div class="rich-toolbar" role="group" aria-label="Форматирование: '+esc(label)+'">'+
  '<button type="button" data-format="bold" title="Жирный (Ctrl+B / ⌘B)" aria-label="Жирный"><b>Ж</b></button>'+
  '<button type="button" data-format="italic" title="Курсив (Ctrl+I / ⌘I)" aria-label="Курсив"><i>К</i></button>'+
  '<label class="rich-size"><span class="visually-hidden">Размер шрифта в пунктах</span><select data-format-size aria-label="Размер шрифта в пунктах"><option value="">Кегль, пт</option>'+[6,7,8,9,10,11,12,14,16,18,20,24].map(n=>'<option value="'+n+'">'+n+' пт</option>').join('')+'</select></label>'+
  '<button type="button" data-format="clear" class="rich-clear" title="Убрать форматирование выделенного текста">Сброс</button></div>'+
  '<textarea id="'+id+'" data-field="'+esc(key)+'" aria-describedby="'+id+'-help">'+esc(value)+'</textarea>'+
  '<details class="rich-help" id="'+id+'-help"><summary>Как форматировать текст</summary><p>Выделите текст и нажмите Ж, К или выберите кегль. Без выделения кегль применяется ко всему полю. Результат виден на карточке.</p><p>Можно писать вручную: <code>**жирный**</code>, <code>*курсив*</code>, <code>***оба***</code>, <code>[size=12]текст[/size]</code>. Размер — от 6 до 24 пт. Для обычной звёздочки используйте <code>\\*</code>.</p></details></div>';
}
function formatText(el,kind,size){
 const edit=KTText.format(el.value,el.selectionStart,el.selectionEnd,kind,size);if(!edit)return;
 el.focus();el.setSelectionRange(edit.from,edit.to);
 // Use the browser's editing operation so toolbar changes participate in Undo.
 // Older browsers can still apply the same replacement through setRangeText.
 if(!document.execCommand?.('insertText',false,edit.text)){el.setRangeText(edit.text,edit.from,edit.to,'select');updateField(el)}
 el.setSelectionRange(edit.start,edit.end);
}
function select(label,key,value,items){return '<label>'+label+'<select data-field="'+key+'">'+items.map(([k,v])=>'<option value="'+esc(k)+'" '+(k===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>'}
function check(label,key,value){return '<label class="checkbox"><input type="checkbox" data-field="'+key+'" '+(value?'checked':'')+'>'+label+'</label>'}
function panel(title,body,meta=''){return '<section class="panel"><div class="panel-title">'+title+'<span>'+meta+'</span></div>'+body+'</section>'}
function pathSet(obj,path,value){const keys=path.split('.');let t=obj;for(const key of keys.slice(0,-1))t=t[key];t[keys.at(-1)]=value}
function pathGet(obj,path){return path.split('.').reduce((o,k)=>o[k],obj)}
function render(){
 $('#navigation').innerHTML=Object.entries(SECTIONS).map(([key,name])=>'<button data-nav="'+key+'" class="'+(key===section?'active':'')+'"><span>'+name+'</span><small>'+(KTModel.fixed.includes(key)?data[key].filter(KTModel.isFilled).length+'/4':Array.isArray(data[key])?data[key].length:'↗')+'</small></button>').join('');
 $('#section-title').textContent=SECTIONS[section];$('#breadcrumb').textContent=data.team.name+(section==='lorePages'?' / АЛЬБОМ':' / КАРТОЧКИ');
 renderProjectTitle();
 const list=Array.isArray(data[section]);if(list)selected=Math.max(0,Math.min(selected,data[section].length-1));
 $('#add-item').hidden=!list||fixed();
 $('#add-item').textContent=section==='lorePages'?'+ Страница':'+ Карточка';
 $('#view-toggle').textContent=previewOnly?(section==='lorePages'?'Редактировать страницу':'Редактировать карточку'):(section==='lorePages'?'Показать страницу':'Показать карточку');
 $('#record-list').innerHTML=list?data[section].map((c,i)=>'<button class="record '+(i===selected?'active':'')+'" data-record="'+i+'"><small>'+String(i+1).padStart(2,'0')+'</small>'+esc(c.name||'Пустая карточка')+'</button>').join(''):'';
 $('#section-note').textContent=section==='selectionCards'?'Группы выбора, варианты вооружения и общие ограничения — в формате оригинальной карточки состава.':section==='equipment'?'Четыре карточки снаряжения. Оружие и правила редактируются внутри каждой карточки.':section==='firefightPloys'?'Четыре карточки Firefight Ploys.':section==='strategicPloys'?'Четыре карточки. Зелёно-серые плашки — как в оригинале.':section==='teamCards'?'Любое число карточек правил фракции. Состав находится в отдельной вкладке.':'';
 if(section==='lorePages')$('#section-note').textContent='Диорамы, история команды, сборка миниатюр и примеры покраса. Отдельные страницы A4 после карточек в PDF.';
 renderEditor();renderPreview();
}
function nestedEditor(c,type,title){
 const records=c[type]||[];
 const body=records.map((r,i)=>{
  const key=type+'.'+i+'.';
  let html=field('Название',key+'name',r.name);
  if(type==='weapons')html+=select('Тип',key+'kind',r.kind,[['ranged','Дальнобойное'],['melee','Ближний бой']])+'<div class="field-grid">'+field('ATK',key+'attacks',r.attacks,'number')+field('HIT',key+'hit',r.hit)+field('DMG',key+'damage',r.damage)+'</div>'+field('Правила оружия (SR)',key+'special',r.special)+field('Критические правила (CR)',key+'critical',r.critical)+'<div class="two-fields">'+field('Группа режимов',key+'group',r.group)+field('Режим',key+'mode',r.mode)+'</div>';
  else html+=(type==='actions'?field('Стоимость, AP',key+'cost',r.cost):'')+field('Текст',key+'body',r.body,'textarea');
  return '<details class="nested" '+(i===0?'open':'')+'><summary>'+esc(r.name||'Новый блок')+'</summary>'+html+'<button class="danger small" data-remove-nested="'+type+'" data-index="'+i+'">Удалить из карточки</button></details>';
 }).join('');
 return panel(title,body+'<button class="add-inline" data-add-nested="'+type+'">+ '+(type==='weapons'?'Профиль оружия':type==='abilities'?'Способность':'Действие')+'</button>',records.length+' на этой карте');
}
function selectionEditor(c){return c.selectionGroups.map((g,i)=>{
 const key='selectionGroups.'+i+'.';
 return panel('ГРУППА ВЫБОРА '+(i+1),field('Число оперативников',key+'count',g.count,'number')+field('Формулировка после числа',key+'description',g.description,'textarea')+g.entries.map((e,j)=>{
  const p=key+'entries.'+j+'.';
  return '<details class="nested"><summary>'+esc(e.text||'Новый вариант')+'</summary>'+field('Строка списка',p+'text',e.text,'textarea')+field('Вложенные варианты — по одному на строку',p+'options',e.options.join('\n'),'textarea')+select('Связанная карточка оперативника',p+'operativeId',e.operativeId||'',[['','Без ссылки'],...data.operatives.map(o=>[o.id,o.name])])+'<button class="danger small" data-remove-entry="'+i+'" data-index="'+j+'">Удалить строку</button></details>';
 }).join('')+'<div class="row-actions"><button data-add-entry="'+i+'">+ Строка списка</button><button class="danger" data-remove-group="'+i+'">Удалить группу</button></div>');
}).join('')+'<button data-action="add-selection-group">+ Группа выбора</button>'}
function imageEditor(c){
 const uri=/^data:image\/(png|jpeg);base64,/.test(c.image||'')?c.image:assets[c.image];
 const operative=c.kind==='operative',prefix=operative?'operative':'card',label=operative?'оперативника':'правила';
 return panel('КАРТИНКА','<div class="operative-image-editor">'+(uri?'<img class="operative-image-thumb" src="'+esc(uri)+'" alt="Картинка '+label+'">':'<div class="operative-image-empty" aria-hidden="true">＋</div>')+'<div><input id="'+prefix+'-image-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Выбрать картинку '+label+'"><button id="choose-'+prefix+'-image">'+(c.image?'Заменить картинку':'Добавить картинку')+'</button>'+(operative&&c.image?'<button id="crop-operative-image">'+(c.imageCrop?'Изменить область':'Выбрать область')+'</button>':'')+(c.image?'<button id="remove-'+prefix+'-image" class="danger">Удалить картинку</button>':'')+'<p class="hint">PNG, JPG или WebP · до 10 МБ.<br>'+(operative?'Выберите область картинки для заголовка профиля. Исходник остаётся доступен для повторной обрезки.':'Картинка появится после текста правила. Если места не хватит, она перейдёт на следующую сторону.')+' Сохраняется в проекте, PDF и TTS.</p></div></div>');
}
function renderEditor(){
 const c=current();let out='';
 if(section==='lorePages'){
  out='<div class="row-actions"><button id="export-lore" '+(!data.lorePages.length?'disabled':'')+'>↓ PDF раздела</button></div>';
  if(!c)out+=panel('КАРТИНКИ И ЛОР','<p>Соберите альбом команды: панорамные фото, историю, инструкции по сборке и примеры покраса.</p><p class="hint">Нажмите «+ Страница», добавьте текст и загрузите изображения.</p>');
  else{
   out+=panel('СТРАНИЦА A4',field('Заголовок','name',c.name)+select('Тема','category',c.category,Object.entries(KTModel.loreCategories))+field('Лор или описание','body',c.body,'textarea')+select('Расположение изображений','layout',c.layout,[['wide','Крупные изображения на всю ширину'],['gallery','Галерея в две колонки']]));
   const images=c.images.map((img,i)=>'<div class="lore-image-item"><img src="'+esc(/^data:image\//.test(img.image)?img.image:assets[img.image]||img.image)+'" alt="Изображение '+(i+1)+'">'+field('Подпись '+(i+1),'images.'+i+'.caption',img.caption,'textarea')+'<div class="row-actions"><button data-lore-replace="'+esc(img.id)+'">Заменить</button><button data-lore-move="'+i+'" data-direction="-1" '+(!i?'disabled':'')+' aria-label="Изображение '+(i+1)+' выше">↑</button><button data-lore-move="'+i+'" data-direction="1" '+(i===c.images.length-1?'disabled':'')+' aria-label="Изображение '+(i+1)+' ниже">↓</button><button class="danger" data-lore-remove="'+esc(img.id)+'">Удалить изображение</button></div></div>').join('');
   out+=panel('ИЗОБРАЖЕНИЯ',images+'<input id="lore-image-files" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple aria-label="Выбрать изображения для страницы"><input id="lore-replace-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Заменить изображение страницы"><button id="choose-lore-images" '+(c.images.length>=40?'disabled':'')+'>+ Добавить картинки</button><p class="hint">Можно выбрать несколько файлов. PNG, JPG или WebP, до 10 МБ каждый. Изображения сохраняют пропорции и целиком помещаются на странице.</p>',c.images.length+' / 40');
   out+='<div class="row-actions"><button data-action="move-lore-page" data-direction="-1" '+(!selected?'disabled':'')+'>↑ Раньше в PDF</button><button data-action="move-lore-page" data-direction="1" '+(selected===data.lorePages.length-1?'disabled':'')+'>↓ Позже в PDF</button><button data-action="duplicate">Дублировать страницу</button><button class="danger" data-action="delete">Удалить страницу</button></div>';
  }
 }else if(section==='project'){
  out=panel('КОМАНДА',field('Название','name',c.name)+field('Подзаголовок','subtitle',c.subtitle)+field('Версия','version',c.version));
  out+=panel('ПЕЧАТЬ','<p>A4, по четыре стороны на листе, метки реза. Правила: 70 × 121 мм. Оперативники: 121 × 70 мм.</p><p class="hint">Печатайте в масштабе 100%. Стороны с продолжением идут последовательно, как в новом примере. Длинные правила автоматически переходят на следующую сторону.</p>'+field('Акцент','@layout.accent',data.layout.accent,'color')+field('Примечание о стоимости Ploys','@ployNote',data.ployNote,'textarea'));
  out+=panel('ИСХОДНЫЕ МАТЕРИАЛЫ','<p>'+esc(data.team.source||'Исходные материалы команды')+'</p><p class="hint">'+esc(data.team.sourceNote||'В архиве сохранены исходные данные команды.')+'</p><button data-action="archive">Скачать исходные данные</button>');
  out+=panel('ПЕРЕНОС ПРОЕКТА','<div class="row-actions"><button data-action="download-json">Скачать проект</button><label class="import-label">Загрузить проект<input id="import-json" type="file" accept=".json,application/json"></label></div>'+(window.KT_EXAMPLES?.[data.team.id]?'<button class="danger" data-action="restore">Вернуть тестовую команду</button>':''));
  if(typeof KTNewRecruit!=='undefined'&&KTNewRecruit.compatible(data)){
   const roster=KTNewRecruit.summary(data);
   out+=panel('РОСТЕР ДЛЯ TTS / DATA TEAM','<p>'+roster.count+' оперативников из '+esc(roster.sourceFile)+'. Состав и выбранное оружие взяты из вашего ростера; характеристики, способности и тексты правил — из текущих карточек редактора.</p><details class="nested"><summary>Оперативники и выбранное оружие</summary>'+roster.entries.map(e=>'<p><b>'+e.count+' × '+esc(e.name)+'</b><br><span class="hint">'+e.weaponIds.map(id=>esc(data.operatives.find(o=>o.id===e.operativeId)?.weapons.find(w=>w.id===id)?.name||'Удалённое оружие: '+id)).join('; ')+'</span></p>').join('')+'</details><button id="export-rosz" class="primary">↓ Ростер New Recruit (.rosz)</button><p class="hint">Это полный ростер для выбора моделей перед игрой. Правила выбора боевой команды остаются на карточке состава.</p><p>Загрузите файл в <a href="https://datateamapp.azurewebsites.net/Encode" target="_blank" rel="noopener">DataTeam Encode</a>, затем вставьте полученный код в <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3356996125" target="_blank" rel="noopener">KT Command Node 2024</a>.</p>','Образец New Recruit · KT 2024');
  }
 }else if(!c)out=panel('КАРТОЧКИ','<p>Добавьте первую карточку.</p>');
 else if(section==='selectionCards'){
  out=panel('СОСТАВ КИЛЛТИМА',field('Название карточки','name',c.name)+'<p>Всего в группах: '+c.selectionGroups.reduce((n,g)=>n+g.count,0)+' оперативников</p><button id="export-selection" class="primary">↓ PDF карточки состава</button>', 'Шаблон состава · 70 × 121 мм');
  out+=panel('ДВА АРХЕТИПА','<div class="two-fields">'+c.archetypes.map((value,i)=>select('Архетип '+(i+1),'archetypes.'+i,value,[['','Не выбран'],...[...new Set([...KTModel.archetypeOptions,...c.archetypes.filter(Boolean)])].filter(a=>a!==c.archetypes[1-i]).map(a=>[a,a])])).join('')+'</div><p class="hint">Оба архетипа печатаются одной строкой на цветной плашке.</p>',c.archetypes.filter(Boolean).length+' / 2');
  out+=selectionEditor(c);
  out+=panel('ОБЩИЕ ОГРАНИЧЕНИЯ',field('Ограничения состава и сноски','selectionRules',c.selectionRules,'textarea')+field('Пояснения к терминам','selectionNotes',c.selectionNotes,'textarea'));
  out+=panel('ДОПОЛНИТЕЛЬНЫЙ ТЕКСТ',field('Вводный текст','body',c.body,'textarea')+field('Художественный текст','lore',c.lore||'','textarea'));
  out+='<details class="nested"><summary>Оружие, способности и действия этой карточки</summary>'+nestedEditor(c,'weapons','ОРУЖИЕ')+nestedEditor(c,'abilities','СПОСОБНОСТИ')+nestedEditor(c,'actions','ДЕЙСТВИЯ')+'</details>';
  out+='<div class="row-actions"><button data-action="duplicate">Дублировать состав</button>'+(data.selectionCards.length>1?'<button class="danger" data-action="delete">Удалить состав</button>':'')+'</div>';
 }
 else{
  out=panel('КАРТОЧКА',field('Название','name',c.name)+(section==='teamCards'?select('Тип карточки','kind',c.kind,[['recruitment','Правила набора'],['faction','Faction rule']])+field('Подзаголовок','subtitle',c.subtitle||''):'')+(fixed()?field('Стоимость (если есть)','cost',c.cost):''),c.sourcePage?esc(data.team.name)+' · стр. '+c.sourcePage:'Свободная карточка');
  if(section==='equipment'){
   const source=data.sourceArchive?.equipment||[];
   if(source.length)out+=panel('ВЫБРАТЬ ИЗ ИСХОДНИКА','<label>Снаряжение '+esc(data.team.name)+'<select id="source-equipment"><option value="">Выберите предмет</option>'+source.map((e,i)=>'<option value="'+i+'">'+esc(e.name)+' · '+esc(e.cost)+'</option>').join('')+'</select></label><button data-action="use-source">Заполнить эту карточку</button><p class="hint">После вставки оружие и правила редактируются прямо здесь.</p>');
   out+=panel('ОГРАНИЧЕНИЯ',field('Кто может взять','restriction',c.restriction||'')+check('Один на команду','unique',c.unique)+(data.team.id==='murdasport'?check('Разрешено Nob Basha','bashaAllowed',c.bashaAllowed):''));
  }
  if(c.kind==='operative'){
   out+=imageEditor(c);
   out+=panel('ПРОФИЛЬ','<div class="field-grid">'+Object.entries(c.stats).map(([k,v])=>field(k,'stats.'+k,v,typeof v==='number'?'number':'text')).join('')+'</div>'+field('Ключевые слова через запятую','keywords',c.keywords.join(', '))+select('Расположение правил','rulesLayout',c.rulesLayout||'columns',[['full','На всю ширину'],['columns','В две колонки']])+'<p class="hint">Расстояния указаны в дюймах. Условия выбора редактируются на карточке состава.</p>');
  }
  out+=panel(c.kind==='operative'?'ДОПОЛНИТЕЛЬНОЕ ПРАВИЛО':'ТЕКСТ КАРТОЧКИ',field('Художественный текст','lore',c.lore||'','textarea')+field('Правило','body',c.body,'textarea')+'<p class="hint">Расстояния в дюймах, например 6″. При вставке старые символы переводятся автоматически.</p>');
  if(section==='teamCards')out+=imageEditor(c);
  out+=nestedEditor(c,'weapons','ОРУЖИЕ')+nestedEditor(c,'abilities','СПОСОБНОСТИ')+nestedEditor(c,'actions','ДЕЙСТВИЯ');
  if(c.kind==='operative')out+=panel('КОМПЛЕКТАЦИИ',c.loadouts.map((l,i)=>'<div class="loadout">'+field('Название','loadouts.'+i+'.name',l.name)+c.weapons.map(w=>'<label class="checkbox"><input type="checkbox" data-loadout="'+i+'" value="'+w.id+'" '+(l.weaponIds.includes(w.id)?'checked':'')+'>'+esc(w.name)+'</label>').join('')+'<button class="danger small" data-remove-loadout="'+i+'">Удалить вариант</button></div>').join('')+'<button data-action="add-loadout">+ Вариант</button>');
  out+='<div class="row-actions">'+(fixed()?'<button class="danger" data-action="clear">Очистить место</button>':'<button data-action="duplicate">Дублировать карточку</button><button class="danger" data-action="delete">Удалить карточку</button>')+'</div>';
 }
 $('#editor').innerHTML=out;
}
function renderPreview(){
 const lore=section==='lorePages';
 $('.preview-toolbar .eyebrow').textContent=lore?'СТРАНИЦА В ПЕЧАТИ':'КАРТОЧКА В ПЕЧАТИ';
 $('.print-hint span').textContent=lore?'Отдельные страницы после карточек':'Четыре стороны на листе · метки реза';
 const c=section==='project'?data.strategicPloys[0]:current();
 if(!c){$('#preview').innerHTML=lore?'<div class="lore-empty">A4<br><span>Здесь появится страница вашего альбома</span></div>':'';$('#side-label').textContent='';$('#prev-side').disabled=$('#next-side').disabled=true;$('#card-size').textContent=lore?'210 × 297 мм':'';$('#preview-note').textContent='';return}
 const cards=lore?KTLore.renderPage(c,data,assets):KTCards.renderCard(c,data,assets,selected);side=Math.min(side,cards.length-1);
 $('#preview').innerHTML='<div class="physical-card '+(lore?'lore-page':c.kind==='operative'?'landscape':'portrait')+'">'+cards[side].svg+'</div>';
 $('#side-label').textContent=(lore?'Страница ':'Сторона ')+(side+1)+' / '+cards.length;
 $('#prev-side').disabled=side===0;$('#next-side').disabled=side>=cards.length-1;
 $('#card-size').textContent=lore?'210 × 297 мм':c.kind==='operative'?'121 × 70 мм':'70 × 121 мм';
 $('#preview-note').textContent=lore?(cards.length>1?'Материал занимает '+cards.length+' стр. A4. Все страницы войдут в PDF.':'Эта страница войдёт в PDF после карточек.'):(cards.length>1?'Текст продолжается на следующей стороне. Все стороны войдут в PDF.':'Та же карточка будет напечатана в PDF.');
}
function updateField(el){
 let key=el.dataset.field,value=el.type==='checkbox'?el.checked:el.type==='number'?Math.max(0,Number(el.value)):el.value,obj=current();
 if(typeof value==='string'&&section!=='lorePages'){const converted=KTModel.toInches(value);if(converted!==value){value=converted;el.value=value}}
 if(section==='lorePages'&&typeof value==='string'){const max=key==='name'?200:key==='body'?100000:key.endsWith('.caption')?5000:null;if(max&&value.length>max){value=value.slice(0,max);el.value=value}}
 if(key.startsWith('@')){obj=data;key=key.slice(1)}
 if(key==='keywords')value=value.split(',').map(v=>v.trim()).filter(Boolean);
 if(/^selectionGroups\.\d+\.entries\.\d+\.options$/.test(key))value=value.split('\n').map(v=>v.trim()).filter(Boolean);
 if(/^selectionGroups\.\d+\.count$/.test(key))value=Math.max(1,value);
 if(key==='size')value=Math.max(1,value);
 if(key.startsWith('archetypes.')){const slot=Number(key.split('.')[1]);if(value&&obj.archetypes[1-slot]===value){toast('Выберите два разных архетипа');renderEditor();return}side=0}
 pathSet(obj,key,value);
 if(key.startsWith('selectionGroups.'))obj.size=obj.selectionGroups.reduce((n,g)=>n+g.count,0)||1;
 if(key==='kind'){
  if(value==='recruitment')obj.groupCaps??=[];
  renderEditor();
 }
 persist();renderPreview();if(fixed())$('#navigation [data-nav="'+section+'"] small').textContent=data[section].filter(KTModel.isFilled).length+'/4';
 if(key==='name')$('#record-list .active')?.replaceChildren(document.createTextNode(value||'Пустая карточка'));
 if(obj===data.team){renderProjectTitle();$('#breadcrumb').textContent=data.team.name+' / КАРТОЧКИ'}
 if(key.startsWith('archetypes.'))renderEditor();
}
document.addEventListener('input',e=>{if(e.target.dataset.field)updateField(e.target);if(e.target.id==='tts-folder'){$('#tts-result').hidden=true;$('#tts-status').textContent='Папка изменена. Соберите архив заново.'}});
document.addEventListener('keydown',e=>{
 if(!e.target.matches?.('.rich-field textarea')||!(e.ctrlKey||e.metaKey)||e.altKey)return;
 const key=e.code==='KeyB'?'b':e.code==='KeyI'?'i':e.key.toLowerCase();if(key==='b'||key==='i'){e.preventDefault();formatText(e.target,key==='b'?'bold':'italic')}
});
document.addEventListener('change',async e=>{
 if(e.target.matches?.('[data-format-size]')){const size=e.target.value;if(size)formatText(e.target.closest('.rich-field').querySelector('textarea'),'size',size);e.target.value='';return}
 if(e.target.id==='lore-image-files'||e.target.id==='lore-replace-file'){const files=Array.from(e.target.files),replaceId=e.target.id==='lore-replace-file'?e.target.dataset.imageId:null;e.target.value='';importLoreImages(files,replaceId);return}
 if(['operative-image-file','card-image-file'].includes(e.target.id)){const file=e.target.files[0];e.target.value='';importCardImage(file);return}
 if(e.target.dataset.roster!==undefined){const id=e.target.dataset.roster,c=current();c.excludedOperativeIds=c.excludedOperativeIds.filter(v=>v!==id);if(!e.target.checked)c.excludedOperativeIds.push(id);persist();side=0;renderPreview()}
 if(e.target.dataset.loadout!==undefined){const ids=current().loadouts[Number(e.target.dataset.loadout)].weaponIds;const n=ids.indexOf(e.target.value);if(e.target.checked&&n<0)ids.push(e.target.value);if(!e.target.checked&&n>=0)ids.splice(n,1);persist();renderPreview()}
 if(e.target.id==='import-json')importJSON(e.target.files[0]);
});
function newCard(){
 if(section==='lorePages')return KTModel.newLorePage(uid());
 if(section==='selectionCards')return {...KTModel.newSelection(data.team.name+' KILL TEAM'),id:uid()};
 if(section==='operatives')return {...KTModel.blank(uid(),'operative'),name:'NEW OPERATIVE',stats:{APL:2,MOVE:'6″',SAVE:'5+',WOUNDS:8},keywords:[data.team.name],loadouts:[],group:'CUSTOM',maxSelections:1,image:''};
 return {...KTModel.blank(uid(),'faction'),name:'NEW FACTION RULE'};
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}
const fileStem=()=>data.team.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi,'-');
async function downloadJSON(){try{if(!await KTAccount.requireLogin('download'))return;downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),fileStem()+'-project.json');toast('Файл проекта сохранён')}catch(error){toast(error.message)}}
async function importJSON(file){
 if(!file)return;const revision=++teamLoadRevision;
 try{
  if(file.size>100e6)throw Error('Файл проекта больше 100 МБ');
  const next=KTModel.validate(KTModel.migrate(JSON.parse(await file.text())));
  if(revision!==teamLoadRevision||!await persist()||revision!==teamLoadRevision)return;
  original=window.KT_EXAMPLES?.[next.team.id]?KTModel.validate(KTModel.migrate(window.KT_EXAMPLES[next.team.id])):structuredClone(next);
  data=next;pdfReady=false;section='selectionCards';selected=side=0;previewOnly=false;$('.workspace').classList.toggle('show-preview',false);
  persist();render();toast('Проект загружен');
 }catch(e){toast('Не удалось загрузить: '+e.message)}
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.id==='new-project'){showCreateProject();return}
 if(b.id==='close-create-project'){$('#create-project-dialog').close();return}
 if(b.dataset.createProject){void createEmptyProject(b.dataset.createProject);return}
 if(b.dataset.format){formatText(b.closest('.rich-field').querySelector('textarea'),b.dataset.format);return}
 if(b.dataset.nav){section=b.dataset.nav;selected=0;side=0;render();return}
 if(b.dataset.record!==undefined){selected=Number(b.dataset.record);side=0;render();return}
 if(b.id==='prev-side'||b.id==='next-side'){side+=b.id==='next-side'?1:-1;renderPreview();return}
 if(b.id==='view-toggle'){previewOnly=!previewOnly;$('.workspace').classList.toggle('show-preview',previewOnly);b.textContent=previewOnly?(section==='lorePages'?'Редактировать страницу':'Редактировать карточку'):(section==='lorePages'?'Показать страницу':'Показать карточку');return}
 if(b.id==='choose-lore-images'){$('#lore-image-files').click();return}
 if(b.id==='export-lore'){exportPDF({section:'lorePages'});return}
 if(b.dataset.loreReplace){const input=$('#lore-replace-file');input.dataset.imageId=b.dataset.loreReplace;input.click();return}
 if(b.dataset.loreRemove){const page=current();loreJobs.delete(page);page.images=page.images.filter(img=>img.id!==b.dataset.loreRemove);side=0;persist();renderEditor();renderPreview();return}
 if(b.dataset.loreMove!==undefined){const images=current().images,from=Number(b.dataset.loreMove),to=from+Number(b.dataset.direction);if(to>=0&&to<images.length){[images[from],images[to]]=[images[to],images[from]];side=0;persist();renderEditor();renderPreview()}return}
 if(b.id==='export'){exportPDF();return}
 if(['choose-operative-image','choose-card-image'].includes(b.id)){$('#'+b.id.replace('choose-','')+'-file').click();return}
 if(b.id==='crop-operative-image'){editOperativeCrop();return}
 if(['remove-operative-image','remove-card-image'].includes(b.id)){const card=current();if(['operative','faction','recruitment'].includes(card?.kind)){portraitJobs.delete(card);card.image='';delete card.imageWidth;delete card.imageHeight;delete card.imageCrop;pdfReady=false;persist();renderEditor();renderPreview();toast('Картинка удалена')}return}
 if(b.id==='export-rosz'){exportROSZ();return}
 if(b.id==='open-tts'){openTTS();return}
 if(b.id==='close-tts'){$('#tts-dialog').close();return}
 if(b.id==='build-tts'){exportTTS();return}
 if(b.id==='export-selection'){exportPDF({section:'selectionCards',index:selected});return}
 if(b.dataset.editOperative!==undefined){section='operatives';selected=Number(b.dataset.editOperative);side=0;render();return}
 if(b.id==='add-item'){data[section].push(newCard());selected=data[section].length-1;side=0;persist();render();return}
 const c=current(),a=b.dataset.action;
 if(a==='move-lore-page'&&section==='lorePages'){const to=selected+Number(b.dataset.direction);if(to>=0&&to<data.lorePages.length){[data.lorePages[selected],data.lorePages[to]]=[data.lorePages[to],data.lorePages[selected]];selected=to;persist();render()}return}
 if(a==='add-selection-group'){c.selectionGroups.push({id:uid(),count:1,description:data.team.name+' operatives selected from the following list:',entries:[]});persist();render();return}
 if(b.dataset.removeGroup!==undefined){c.selectionGroups.splice(Number(b.dataset.removeGroup),1);persist();render();return}
 if(b.dataset.addEntry!==undefined){c.selectionGroups[Number(b.dataset.addEntry)].entries.push({id:uid(),operativeId:'',text:'NEW OPERATIVE',options:[]});persist();render();return}
 if(b.dataset.removeEntry!==undefined){c.selectionGroups[Number(b.dataset.removeEntry)].entries.splice(Number(b.dataset.index),1);persist();render();return}
 if(b.dataset.addNested){const type=b.dataset.addNested;c[type].push(type==='weapons'?{id:uid(),name:'New weapon',kind:'ranged',attacks:4,hit:'4+',damage:'3/4',special:'',critical:'',group:'',mode:''}:{id:uid(),name:type==='actions'?'New action':'New ability',body:'',...(type==='actions'?{cost:'1AP'}:{})});persist();renderEditor();renderPreview();return}
 if(b.dataset.removeNested){const type=b.dataset.removeNested,n=Number(b.dataset.index),id=c[type][n].id;c[type].splice(n,1);if(type==='weapons')for(const l of c.loadouts||[])l.weaponIds=l.weaponIds.filter(v=>v!==id);persist();renderEditor();renderPreview();return}
 if(b.dataset.removeLoadout!==undefined){c.loadouts.splice(Number(b.dataset.removeLoadout),1);persist();renderEditor();renderPreview();return}
 if(b.dataset.removeCap!==undefined){c.groupCaps.splice(Number(b.dataset.removeCap),1);persist();renderEditor();renderPreview();return}
 if(b.id==='save-json')void KTCommunity.save();
 if(a==='download-json')void downloadJSON();
 if(a==='archive')downloadBlob(new Blob([JSON.stringify(data.sourceArchive||{},null,2)],{type:'application/json'}),fileStem()+'-source-archive.json');
 if(a==='add-loadout'){c.loadouts.push({name:'New loadout',weaponIds:[]});persist();renderEditor()}
 if(a==='add-cap'){(c.groupCaps??=[]).push({keyword:'GROUP',max:1});persist();renderEditor();renderPreview()}
 if(a==='use-source'){
  const value=$('#source-equipment').value;if(value===''){toast('Выберите предмет из исходника');return}
  if(KTModel.isFilled(c)&&!confirm('Заменить содержимое этой карточки выбранным предметом?'))return;
  const source=data.sourceArchive.equipment[Number(value)];data.equipment[selected]={...KTModel.normalizeCard(source),id:c.id};side=0;persist();render();toast('Предмет добавлен в эту карточку');
 }
 if(a==='clear'&&confirm('Очистить выбранное место?')){data[section][selected]=KTModel.blank(c.id,c.kind);side=0;persist();render()}
 if(a==='duplicate'){const copy=structuredClone(c);copy.id=uid();copy.name+=' (copy)';data[section].push(copy);selected=data[section].length-1;side=0;persist();render()}
 if(a==='delete'){b.closest('.row-actions').innerHTML='<span>Удалить '+(section==='lorePages'?'страницу':'карточку')+' «'+esc(c.name)+'»?</span><button data-action="cancel-delete">Отмена</button><button class="danger" data-action="confirm-delete" data-card-id="'+esc(c.id)+'">Да, удалить</button>';return}
 if(a==='cancel-delete'){renderEditor();return}
 if(a==='confirm-delete'&&b.dataset.cardId===c.id){if(section==='operatives')for(const selection of data.selectionCards){selection.excludedOperativeIds=selection.excludedOperativeIds.filter(id=>id!==c.id);for(const g of selection.selectionGroups)for(const e of g.entries)if(e.operativeId===c.id)e.operativeId=''}data[section].splice(selected,1);side=0;persist();render()}
 if(a==='restore'&&confirm('Заменить текущую команду исходным примером '+original.team.name+'?')){data=structuredClone(original);section='selectionCards';selected=0;side=0;persist();render()}
});
const portraitJobs=new WeakMap();
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
    const result=await KTOperativeImage.prepare(file,{details:true,profile:'page'});
    if(data!==project||!data.lorePages.includes(page)||loreJobs.get(page)!==token)return;
    const values={image:result.image,imageWidth:result.width,imageHeight:result.height};
    if(target){if(!page.images.includes(target))return;Object.assign(target,values)}else page.images.push({id:uid(),...values,caption:''});
    added++;pdfReady=false;persist();if(current()===page){side=0;renderPreview()}
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
  const result=await KTOperativeImage.prepare(file,{details:true});
  if(data!==project||!data[collection]?.includes(card)||portraitJobs.get(card)!==token)return;
  card.image=typeof result==='string'?result:result.image;
  delete card.imageCrop;
  if(result.width&&result.height){card.imageWidth=result.width;card.imageHeight=result.height}else{delete card.imageWidth;delete card.imageHeight}
  pdfReady=false;persist();
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
  const result=await KTOperativeCrop.open(uri,card.imageCrop);
  if(!result||data!==project||!data.operatives.includes(card)||card.image!==source||portraitJobs.get(card)!==token)return;
  card.imageCrop=result.crop;card.imageWidth=result.width;card.imageHeight=result.height;
  pdfReady=false;persist();if(current()===card){renderEditor();renderPreview()}toast('Выбранная область перенесена на карточку');
 }catch(e){toast('Не удалось выбрать область: '+e.message)}
 finally{if(portraitJobs.get(card)===token){portraitJobs.delete(card);if(data===project&&current()===card)renderEditor()}}
}
const importOperativeImage=importCardImage;
async function base64File(url){
 if(window.KT_ASSETS?.[url])return window.KT_ASSETS[url];
 const response=await fetch(url);if(!response.ok)throw Error('Не удалось загрузить '+url);
 const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
}
async function preparePDF(){
 const [display,symbol]=await Promise.all([base64File('vendor/BebasNeue-Regular.ttf'),base64File('vendor/NotoSansSymbols2-Regular.ttf')]);
 pdfMake.addVirtualFileSystem({...vfs,'Display.ttf':display.split(',')[1],'Symbols.ttf':symbol.split(',')[1]});
 pdfMake.fonts={Roboto:{normal:'Roboto-Regular.ttf',bold:'Roboto-Medium.ttf',italics:'Roboto-Italic.ttf',bolditalics:'Roboto-MediumItalic.ttf'},Display:{normal:'Display.ttf',bold:'Display.ttf',italics:'Display.ttf',bolditalics:'Display.ttf'},Symbols:{normal:'Symbols.ttf',bold:'Symbols.ttf',italics:'Symbols.ttf',bolditalics:'Symbols.ttf'}};
 const paths=['assets/paper.jpg',...new Set([...original.operatives,...data.operatives,...data.teamCards,...data.lorePages.flatMap(p=>p.images)].map(o=>o.image).filter(p=>/^assets\/[a-z0-9.-]+\.(png|jpg|jpeg)$/i.test(p||'')))];
 await Promise.all(paths.map(async p=>assets[p]=await base64File(p)));
 pdfReady=true;
}
async function exportPDF(selection=null){
 const lore=selection?.section==='lorePages',button=$(lore?'#export-lore':selection?'#export-selection':'#export');button.disabled=true;button.textContent='Собираю PDF…';
 try{
  KTModel.validate(data);if(!pdfReady)await preparePDF();
  const snapshot=structuredClone(data);
  await new Promise((resolve,reject)=>{
   let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timeout);window.removeEventListener('unhandledrejection',failed);error?reject(error):resolve()};
   const failed=e=>finish(Error(String(e.reason?.message||e.reason))),timeout=setTimeout(()=>finish(Error('Экспорт занял слишком много времени')),60000);
   window.addEventListener('unhandledrejection',failed);
   try{pdfMake.createPdf(buildTeamPDF(snapshot,assets,selection)).getBlob(blob=>{if(done)return;downloadBlob(blob,fileStem()+(lore?'-pictures-and-lore':selection?'-selection':'-cards')+'.pdf');finish()})}catch(e){finish(e)}
  });
  toast('PDF с текущими правками готов');
 }catch(e){toast('Ошибка экспорта: '+e.message)}finally{button.disabled=false;button.textContent=lore?'↓ PDF раздела':selection?'↓ PDF карточки состава':'↓ PDF для печати'}
}
let ttsURL=null,ttsBusy=false;
function exportROSZ(){
 try{const result=KTNewRecruit.archive(data);downloadBlob(new Blob([result.bytes],{type:'application/zip'}),result.filename);toast('Ростер готов: '+result.report.count+' оперативников. Загрузите .rosz в DataTeam Encode.');return result}
 catch(e){toast('Ошибка ростера: '+e.message)}
}
function openTTS(){
 try{
  const p=KTTTS.plan(data,assets);$('#tts-summary').textContent=p.team.name+' · '+p.cardCount+' карт · '+p.doubleSided+' двусторонних'+(p.incomplete?' · Есть незаполненные места':'');
  $('#tts-decks').innerHTML=p.decks.map(d=>'<div><span>'+esc(d.name)+'</span><b>'+d.cards.length+'</b></div>').join('');
  $('#tts-folder').value=KTTTS.defaultFolder(data);$('#tts-status').textContent='';$('#tts-result').hidden=true;$('#tts-dialog').showModal();
 }catch(e){toast('Не удалось подготовить колоды: '+e.message)}
}
async function prepareTTS(snapshot){
 const paths=['assets/paper.jpg','vendor/BebasNeue-Regular.ttf','vendor/NotoSansSymbols2-Regular.ttf','vendor/Roboto-Regular.ttf','vendor/Roboto-Medium.ttf','vendor/Roboto-Italic.ttf','vendor/Roboto-MediumItalic.ttf',...new Set([...snapshot.operatives,...snapshot.teamCards].map(o=>o.image).filter(Boolean))],result={};
 await Promise.all(paths.map(async path=>{if(path.startsWith('data:image/')){result[path]=path;return}if(!/^(assets\/[a-z0-9.-]+\.(png|jpg|jpeg)|vendor\/[a-z0-9-]+\.ttf)$/i.test(path))throw Error('Не найдено изображение для экспорта: '+path);result[path]=await base64File(path)}));
 return result;
}
async function exportTTS(){
 if(ttsBusy)return;ttsBusy=true;const button=$('#build-tts');button.disabled=true;$('#open-tts').disabled=true;$('#close-tts').disabled=true;$('#tts-folder').disabled=true;$('#tts-result').hidden=true;
 try{
  const snapshot=structuredClone(data),base=$('#tts-folder').value;KTTTS.assetURL(base,'sheets/check.png');
  $('#tts-status').textContent='Подготавливаю изображения и шрифты…';
  const loaded=await prepareTTS(snapshot),result=await KTTTS.browserExport(snapshot,loaded,{base,onProgress:(done,total)=>$('#tts-status').textContent='Собираю листы карт: '+done+' / '+total});
  if(ttsURL)URL.revokeObjectURL(ttsURL);ttsURL=URL.createObjectURL(result.blob);
  const link=$('#tts-download');link.href=ttsURL;link.download=result.filename;link.textContent='↓ Скачать '+result.filename+' · '+(result.blob.size/1048576).toFixed(1)+' МБ';
  $('#tts-status').textContent='Готово: '+result.manifest.cardCount+' карт, '+result.manifest.decks.length+' колод. Все текущие правки включены.';$('#tts-result').hidden=false;
  return result;
 }catch(e){$('#tts-status').textContent='Ошибка экспорта: '+e.message}
 finally{ttsBusy=false;button.disabled=false;$('#open-tts').disabled=false;$('#close-tts').disabled=false;$('#tts-folder').disabled=false}
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
  assets={...(window.KT_ASSETS||{}),'assets/paper.jpg':window.KT_ASSETS?.['assets/paper.jpg']||'assets/paper.jpg'};
  for(const team of [original,data,...Object.values(window.KT_EXAMPLES||{})])for(const o of [...team.operatives,...team.teamCards,...(team.lorePages||[]).flatMap(p=>p.images)])if(o.image)assets[o.image]=window.KT_ASSETS?.[o.image]||o.image;
  render();if(migrated){persist();toast('Проект обновлён. Ваши правки сохранены.')}
  window.ktStudio={getData:()=>structuredClone(data),toast,validateData:KTModel.validate,buildDefinition:()=>buildTeamPDF(data,assets),preparePDF,exportPDF,prepareTTS,exportTTS,exportROSZ,importOperativeImage,importCardImage,importLoreImages,renderCard:(section,index)=>section==='lorePages'?KTLore.renderPage(data.lorePages[index],data,assets):KTCards.renderCard(data[section][index],data,assets,index)};
  await window.KTCommunity?.init({getData:()=>structuredClone(data),persist,openLocal:openProject,openData:openStoredProject,createEmptyProject,showCreateProject,removeProject,localIds:()=>[...projectList.keys()],copyProject,downloadJSON,toast});
  $('#new-project').disabled=false;
 }catch(e){$('#editor').textContent='Не удалось открыть проект: '+e.message}
}
window.ktStudioReady=init();


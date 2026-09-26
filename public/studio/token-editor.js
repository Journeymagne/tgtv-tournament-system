(function(root){
'use strict';
const Tokens=root.KTTokens,esc=root.KTCards.esc;
function input(label,key,value,type='text',attrs=''){return '<label>'+label+'<input data-token-field="'+key+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>'}
function options(label,key,value,items){return '<label>'+label+'<select data-token-field="'+key+'">'+items.map(([k,v])=>'<option value="'+k+'" '+(k===value?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'}
function range(label,key,value,min,max,step,suffix){return '<label class="token-range">'+label+' <output data-ui-skip>'+value+suffix+'</output><input type="range" data-token-field="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" data-suffix="'+suffix+'"></label>'}
function check(label,key,value){return '<label class="checkbox"><input type="checkbox" data-token-field="'+key+'" '+(value?'checked':'')+'>'+label+'</label>'}
function html(card,{field,panel,opened}){
 let out=panel('КАРТОЧКА ЖЕТОНОВ',field('Название карточки','name',card.name)+options('Раскладка','layout',card.layout,[['grid2','2 колонки'],['grid3','3 колонки'],['compact','Список']])+range('Кегль подписей, пт','fontSize',card.fontSize,6,14,.5,'')+range('Размер остальных изображений, мм','sizeMm',card.sizeMm,8,40,.5,'')+check('Фоновый знак команды','watermark',card.watermark)+'<p class="hint">Название команды и акцент берутся из проекта. Круги сохраняют заданный диаметр; крупные жетоны переносятся без уменьшения. Печатайте PDF в масштабе 100%, без подгонки.</p><button id="export-tokens">↓ PDF карточки жетонов</button>');
 const records=card.tokens.map((t,i)=>{
  const upload=(key,label)=>'<input class="visually-hidden" type="file" data-token-upload-file="'+key+'" accept="image/png,image/jpeg,image/webp"><button data-token-action="upload-'+key+'">'+label+'</button>';
  let body=input('Подпись','label',t.label,'text','maxlength="160"')+options('Форма','shape',t.shape,Tokens.shapeOptions);
  body+=input('Цвет жетона','color',t.color||'#28515b','color');
  if(t.shape==='circle')body+=input('Диаметр круга, мм','diameterMm',t.diameterMm,'number','min="5" max="60" step="0.5"')+'<p class="hint">По умолчанию 20 мм. Можно увеличить до 60 мм.</p>';
  body+=root.KTTokenIconPicker.button(t)+range('Размер символа','symbolSize',t.symbolSize,20,100,1,'%')+'<div class="token-image-controls">'+upload('symbolImage','Загрузить символ в центр')+(t.symbolImage?'<button class="danger" data-token-action="remove-symbolImage">Удалить свой символ</button>':'')+'</div><p class="hint">PNG, JPG или WebP · до 10 МБ. Картинка заменяет только символ в центре. Форма, цвет и размер жетона сохраняются.</p>';
  body+=input('Значения через запятую','variants',t.variants,'text','maxlength="100" placeholder="0, 1, 2, 3, 4"')+'<p class="hint">Значения заменяют символ. Оставьте пустым, чтобы показать символ.</p>'+check('На всю ширину карточки','fullWidth',t.fullWidth);
  const behavior=!t.ttsMode||t.ttsMode==='marker'?'marker':t.ttsStackable?'counter':'effect';
  body+=options('Свойства жетона в TTS','ttsBehavior',behavior,[['marker','Аура расстояния — без прикрепления'],['effect','Прикрепление к модели'],['counter','Прикрепление к модели со счётчиком']]);
  const behaviorHint=behavior==='marker'?'Жетон остаётся на поле, показывает ауру и не прикрепляется к моделям.':behavior==='counter'?'Жетон прикрепляется к модели с Kill Team UI. Каждая следующая копия этого жетона увеличивает его счётчик.':'Жетон прикрепляется к модели с Kill Team UI как эффект без счётчика.';
  body+='<p class="hint">'+behaviorHint+'</p>';
  if(behavior==='marker')body+=input('Дистанция маркера, дюймы','ttsRangeInches',t.ttsRangeInches??1,'number','min="0" max="12" step="0.5"')+'<p class="hint">Кольцо отсчитывает дистанцию от края круглого жетона. В TTS наведите курсор и нажмите цифру; 0 скрывает кольцо. Дробную дистанцию можно вернуть через ПКМ → Default range.</p>';
  body+='<div class="row-actions"><button data-token-action="duplicate" '+(card.tokens.length>=80?'disabled':'')+'>Дублировать жетон</button><button data-token-action="up" '+(!i?'disabled':'')+' aria-label="Жетон выше">↑</button><button data-token-action="down" '+(i===card.tokens.length-1?'disabled':'')+' aria-label="Жетон ниже">↓</button><button class="danger" data-token-action="delete">Удалить жетон</button></div>';
  return '<details class="nested token-item" data-nested-type="tokens" data-nested-id="'+esc(t.id)+'" '+((opened?opened.has(t.id):i===0)?'open':'')+'><summary data-token-drag draggable="'+(card.tokens.length>1)+'" title="Перетащите, чтобы изменить порядок. С клавиатуры: Alt + ↑ / ↓." aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"><span class="nested-name" data-ui-skip>'+esc(t.label||'—')+'</span><span class="token-grip" aria-hidden="true">⠿</span></summary>'+body+'</details>';
 }).join('');
 out+=panel('ЖЕТОНЫ',records+'<button data-token-action="add" class="add-dashed" '+(card.tokens.length>=80?'disabled':'')+'>+ Жетон</button>',card.tokens.length+' / 80');
 return out+'<div class="row-actions"><button data-action="duplicate">Дублировать карточку</button><button class="danger" data-action="delete">Удалить карточку</button></div>';
}
function bind(adapter){
 const host=document.querySelector('#editor'),jobs=new WeakMap();let drag=null,suppress=false;
 const context=()=>adapter.context(),active=ctx=>{const now=context();return now.project===ctx.project&&now.card===ctx.card};
 const blockFor=t=>Array.from(host.querySelectorAll('.token-item')).find(el=>el.dataset.nestedId===t.id);
 const tokenFor=(el,ctx)=>ctx.card?.tokens.find(t=>t.id===el.closest('.token-item')?.dataset.nestedId);
 const changed=(rebuild=false,token=null)=>adapter.changed({rebuild,token});
 function move(ctx,token,to){const list=ctx.card.tokens,from=list.indexOf(token);if(!active(ctx)||from<0||to<0||to>=list.length||from===to)return;list.splice(from,1);list.splice(to,0,token);changed(true,token);blockFor(token)?.querySelector('summary')?.focus({preventScroll:true})}
 host.addEventListener('input',e=>{
  const el=e.target,key=el.dataset.tokenField,ctx=context();if(!key||!ctx.card)return;
  const token=tokenFor(el,ctx),target=token||ctx.card;
  let value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?Number(el.value):el.value;
  if(el.type==='number'||el.type==='range'){if(el.value===''||!Number.isFinite(value)||value<Number(el.min)||value>Number(el.max))return}
  if(key==='ttsBehavior'){
   if(!token||!['marker','effect','counter'].includes(value))return;
   token.ttsMode=value==='marker'?'marker':'effect';token.ttsStackable=value==='counter';
  }else target[key]=value;
  if(el.type==='range')el.parentElement.querySelector('output').textContent=value+el.dataset.suffix;
  if(key==='label')el.closest('details').querySelector('.nested-name').textContent=value||'—';
  changed(['shape','symbol','ttsBehavior'].includes(key),token);
 });
 host.addEventListener('focusout',e=>{const el=e.target,ctx=context();if(el.dataset.tokenField&&el.type==='number'&&ctx.card)el.value=(tokenFor(el,ctx)||ctx.card)[el.dataset.tokenField]});
 host.addEventListener('change',async e=>{
  const el=e.target,key=el.dataset.tokenUploadFile,ctx=context();if(key!=='symbolImage'||!ctx.card)return;
  const token=tokenFor(el,ctx),file=el.files[0];el.value='';if(!file||!token)return;
  const request={},pending=jobs.get(token)||{};pending[key]=request;jobs.set(token,pending);
  try{
   const uri=await root.KTOperativeImage.prepare(file,{profile:'card'});
   if(context().project!==ctx.project||!ctx.project.tokenCards.includes(ctx.card)||!ctx.card.tokens.includes(token)||jobs.get(token)?.[key]!==request)return;
   token.symbolImage=uri;token.symbol='custom';token.variants='';
   if(active(ctx))changed(true,token);else adapter.persist();
  }catch(error){adapter.toast(error.message)}finally{if(jobs.get(token)?.[key]===request)delete jobs.get(token)[key]}
 });
 host.addEventListener('click',async e=>{
  const button=e.target.closest('[data-token-action]'),ctx=context();if(!button||!ctx.card)return;
  const action=button.dataset.tokenAction,token=tokenFor(button,ctx);
  if(action==='add'){if(ctx.card.tokens.length>=80)return;const added=Tokens.newToken(adapter.uid());ctx.card.tokens.push(added);changed(true,added);return}
  if(!token)return;
  if(action==='choose-symbol'){
   root.KTTokenIconPicker.open(token,id=>{
    if(!active(ctx)||!ctx.card.tokens.includes(token))return;
    jobs.delete(token);token.symbol=id;token.variants='';changed(true,token);
    blockFor(token)?.querySelector('[data-token-action="choose-symbol"]')?.focus({preventScroll:true});
   });return;
  }
  if(action.startsWith('upload-')){button.closest('details').querySelector('[data-token-upload-file="'+action.slice(7)+'"]').click();return}
  if(action==='delete'||action.startsWith('remove-')){
   if(!await root.KTDelete.confirm({subject:button.textContent+' — '+token.label})||!active(ctx)||!ctx.card.tokens.includes(token)||!button.isConnected)return;
   if(action==='delete'){jobs.delete(token);ctx.card.tokens.splice(ctx.card.tokens.indexOf(token),1);changed(true);return}
   const key=action.slice(7);if(jobs.has(token))delete jobs.get(token)[key];token[key]='';if(key==='symbolImage'&&token.symbol==='custom')token.symbol='skull';changed(true,token);return;
  }
  if(action==='duplicate'&&ctx.card.tokens.length<80){const copy={...token,id:adapter.uid()};ctx.card.tokens.splice(ctx.card.tokens.indexOf(token)+1,0,copy);changed(true,copy);return}
  if(action==='up'||action==='down')move(ctx,token,ctx.card.tokens.indexOf(token)+(action==='up'?-1:1));
 });
 const clear=()=>{drag=null;host.querySelectorAll('.token-dragging,.token-drop-before,.token-drop-after').forEach(el=>el.classList.remove('token-dragging','token-drop-before','token-drop-after'))};
 const drop=e=>{const block=e.target.closest('.token-item');if(!drag||!active(drag.ctx)||!block)return null;const list=drag.ctx.card.tokens,from=list.indexOf(drag.token),index=list.findIndex(t=>t.id===block.dataset.nestedId);if(from<0||index<0)return null;const rect=block.getBoundingClientRect(),after=e.clientY>rect.top+rect.height/2,at=index+(after?1:0);return {block,from,to:at-(from<at?1:0),after}};
 host.addEventListener('pointerdown',()=>suppress=false);
 host.addEventListener('click',e=>{if(suppress&&e.target.closest('[data-token-drag]')){suppress=false;e.preventDefault();e.stopPropagation()}},true);
 host.addEventListener('dragstart',e=>{const heading=e.target.closest('[data-token-drag]'),ctx=context(),token=heading&&tokenFor(heading,ctx);if(!token)return;if(ctx.card.tokens.length<2||!e.dataTransfer){e.preventDefault();return}drag={ctx,token};suppress=true;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-kt-studio-token',token.id);heading.parentElement.classList.add('token-dragging')});
 host.addEventListener('dragover',e=>{host.querySelectorAll('.token-drop-before,.token-drop-after').forEach(el=>el.classList.remove('token-drop-before','token-drop-after'));const target=drop(e);if(!target)return;e.preventDefault();e.dataTransfer.dropEffect='move';if(target.from!==target.to)target.block.classList.add(target.after?'token-drop-after':'token-drop-before')});
 host.addEventListener('drop',e=>{const target=drop(e),source=drag;clear();if(target){e.preventDefault();move(source.ctx,source.token,target.to)}});
 host.addEventListener('dragleave',e=>{if(!host.contains(e.relatedTarget))host.querySelectorAll('.token-drop-before,.token-drop-after').forEach(el=>el.classList.remove('token-drop-before','token-drop-after'))});
 document.addEventListener('dragend',clear);
 host.addEventListener('keydown',e=>{if(e.key==='Escape')clear();suppress=false;const heading=e.target.closest('[data-token-drag]'),ctx=context(),token=heading&&tokenFor(heading,ctx);if(!token||!e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();move(ctx,token,ctx.card.tokens.indexOf(token)+(e.key==='ArrowUp'?-1:1))});
 document.querySelector('#preview').addEventListener('click',e=>{const id=e.target.closest('[data-token-id]')?.dataset.tokenId,ctx=context(),token=ctx.card?.tokens.find(t=>t.id===id);if(token){const block=blockFor(token);block.open=true;block.scrollIntoView({block:'nearest',behavior:'smooth'})}});
}
root.KTTokensEditor={html,bind};
})(typeof window!=='undefined'?window:globalThis);

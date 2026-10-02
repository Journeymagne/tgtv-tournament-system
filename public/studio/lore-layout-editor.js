(function(root){
'use strict';
const F=root.KTFreeLore,esc=root.KTCards.esc,MM=72/25.4;
let dialog,stage,properties,layers,warnings,context,working,selected,baseline,undo=[],redo=[],zoom=1,drag=null,busy=false,typing=null;
const uid=()=>crypto.randomUUID(),clone=value=>structuredClone(value);
const current=()=>working?.objects.find(o=>o.id===selected);
const dirty=()=>working&&JSON.stringify(working)!==baseline;
const snapshot=()=>clone(working);
function remember(before){undo.push(before);if(undo.length>30)undo.shift();redo=[];typing=null;}
function change(fn){const before=snapshot();fn();remember(before);render();}
function status(message){dialog.querySelector('[data-lore-status]').textContent=message;}
function button(action,label,disabled=false){return '<button type="button" class="'+(action==='apply'?'primary':action==='delete'?'danger':'')+'" data-free-action="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';}
function input(label,key,value,type='number',extra=''){
 return '<label'+(type==='range'?' class="free-range"':'')+'><span>'+label+'</span>'+(type==='range'?'<output data-free-value="'+key+'">'+esc(value)+'</output>':'')+'<input data-free-field="'+key+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
}
function select(label,key,value,options){return '<label>'+label+'<select data-free-field="'+key+'">'+options.map(([id,name])=>'<option value="'+id+'" '+(id===value?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';}
function title(o,index){return o.type==='text'?(root.KTText.plain(o.text).slice(0,32)||'Пустой текст'):'Изображение '+(index+1);}
function paint(guides=[]){
 const sheet=F.renderPage(working,context.project,context.assets)[0];
 stage.style.width=F.W*zoom+'px';stage.style.height=F.H*zoom+'px';
 stage.querySelector('.free-art').innerHTML=root.KTCards.inlineSVG(sheet.svg,'free-lore-preview');
 stage.querySelector('.free-overlay').innerHTML=working.objects.map(o=>'<div class="free-object '+(selected===o.id?'selected':'')+' '+(o.locked?'locked':'')+'" data-free-object="'+esc(o.id)+'" style="left:'+o.x/F.W*100+'%;top:'+o.y/F.H*100+'%;width:'+o.w/F.W*100+'%;height:'+o.h/F.H*100+'%" title="'+esc(title(o,working.objects.indexOf(o)))+'">'+(selected===o.id&&!o.locked?'<span data-free-resize aria-label="Изменить размер"></span>':'')+'</div>').join('')+guides.map(g=>'<i class="free-guide '+g.axis+'" style="'+(g.axis==='x'?'left:'+g.value/F.W*100:'top:'+g.value/F.H*100)+'%"></i>').join('');
 warnings.innerHTML=sheet.warnings.map(w=>'<button type="button" data-free-select="'+esc(w.id)+'" class="'+(w.kind==='overflow'?'free-error':'')+'">'+esc(w.message)+'</button>').join('');
 dialog.querySelector('[data-free-zoom-value]').textContent=Math.round(zoom*100)+'%';
 for(const field of properties.querySelectorAll('input[type=range][data-free-field]')){const output=properties.querySelector('[data-free-value="'+field.dataset.freeField+'"]');if(output)output.textContent=field.value;}
 dialog.querySelector('[data-free-action="undo"]').disabled=!undo.length;
 dialog.querySelector('[data-free-action="redo"]').disabled=!redo.length;
}
function render(){
 if(!working)return;paint();dialog.querySelector("[data-free-header]").checked=working.showHeader;
 layers.innerHTML=[...working.objects].reverse().map(o=>'<button type="button" data-free-select="'+esc(o.id)+'" class="'+(selected===o.id?'active':'')+'" aria-pressed="'+(selected===o.id)+'"><small>'+ (o.type==='text'?'ТЕКСТ':'ИЗОБРАЖЕНИЕ')+(o.locked?' · ЗАКРЕПЛЁН':'')+'</small><span>'+esc(title(o,working.objects.indexOf(o)))+'</span>'+'</button>').join('')||'<p>Добавьте текст или изображение.</p>';
 const o=current();
 if(!o){properties.innerHTML='<p>Выберите объект на листе или в списке слоёв.</p>';return;}
 properties.innerHTML='<h3>'+(o.type==='text'?'Текстовый блок':'Изображение')+'</h3><label class="free-check"><input data-free-field="locked" type="checkbox" '+(o.locked?'checked':'')+'> Заблокировать</label><fieldset '+(o.locked?'disabled':'')+'><div class="free-fields">'+['x','y','w','h'].map((key,i)=>input(['X, мм','Y, мм','Ширина, мм','Высота, мм'][i],key,(o[key]/MM).toFixed(1),'number','step="0.1"')).join('')+'</div><div class="free-actions">'+button('left','По левому полю')+button('center','По центру')+button('right','По правому полю')+'</div>'+input('Непрозрачность, %','opacity',Math.round(o.opacity*100),'range','min="0" max="100"')+
 (o.type==='text'?'<div class="free-actions">'+button('bold','Жирный')+button('italic','Курсив')+button('bullet','Список')+'</div><label>Текст<textarea data-free-field="text" rows="8" maxlength="100000">'+esc(o.text)+'</textarea></label><div class="free-fields">'+input('Шрифт, пт','size',o.size,'number','min="6" max="72" step="0.5"')+input('Межстрочный','leading',o.leading,'number','min="1" max="2.5" step="0.05"')+input('Отступ, мм','padding',(o.padding/MM).toFixed(1),'number','min="0" max="17.6" step="0.5"')+input('Цвет текста','color',o.color,'color')+'</div>'+select('Выравнивание','align',o.align,[['left','Слева'],['center','По центру'],['right','Справа']])+input('Цвет подложки','background',o.background,'color')+input('Плотность подложки, %','backgroundOpacity',Math.round(o.backgroundOpacity*100),'range','min="0" max="100"'):
 select('Изображение в рамке','fit',o.fit,[['contain','Поместить целиком'],['cover','Заполнить с обрезкой']])+input('Увеличение внутри рамки, %','zoom',Math.round(o.zoom*100),'range','min="100" max="500"')+input('Сдвиг внутри рамки по X','panX',Math.round(o.panX*100),'range','min="-100" max="100"')+input('Сдвиг внутри рамки по Y','panY',Math.round(o.panY*100),'range','min="-100" max="100"')+button('reset-crop','Сбросить кадрирование')+button('replace-image','Заменить изображение')+'<p class="hint">Угол рамки сохраняет пропорции. Alt при растягивании меняет форму рамки. Исходное изображение сохраняется.</p>')+
 '<div class="free-actions">'+button('back','На задний план')+button('lower','Слой ниже')+button('raise','Слой выше')+button('front','На передний план')+button('duplicate','Дублировать')+button('delete','Удалить')+'</div></fieldset>';
}
function selectObject(id){selected=id;typing=null;render();}
function applyField(el){
 const o=current(),key=el.dataset.freeField;if(busy||!o||o.locked&&key!=='locked')return;
 if(!typing||typing.element!==el){typing={element:el,before:snapshot(),saved:false};}
 let value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'?Number(el.value):el.value;
 if(typeof value==='number'&&!Number.isFinite(value))return;
 if(['x','y','w','h','padding'].includes(key))value*=MM;
 if(['opacity','backgroundOpacity','zoom','panX','panY'].includes(key))value/=100;
 const ranges={x:[-F.W,F.W],y:[-F.H,F.H],w:[12,F.W*2],h:[12,F.H*2],padding:[0,50],size:[6,72],leading:[1,2.5]};
 if(ranges[key])value=Math.max(ranges[key][0],Math.min(ranges[key][1],value));
 if(o[key]===value)return;
 if(!typing.saved){undo.push(typing.before);if(undo.length>30)undo.shift();redo=[];typing.saved=true;}
 o[key]=value;paint();
}
function fit(){const viewport=dialog.querySelector('.free-viewport');zoom=Math.min(1.2,Math.max(.25,Math.min((viewport.clientWidth-48)/F.W,(viewport.clientHeight-48)/F.H)));dialog.querySelector('[data-free-zoom]').value=String(Math.round(zoom*100));paint();}
function ensure(){
 if(dialog)return;
 dialog=document.createElement('dialog');dialog.id='free-lore-dialog';dialog.dataset.uiSkip='';dialog.innerHTML='<div class="free-heading"><div><h2>Свободная вёрстка · A4</h2><small>Изменения применяются кнопкой «Сохранить страницу».</small></div>'+button('apply','Сохранить страницу')+button('close','Закрыть')+'</div><div class="free-toolbar">'+button('text','+ Текст')+button('image','+ Изображение')+button('undo','↶ Отменить')+button('redo','↷ Повторить')+button('fit','Вписать лист')+'<label class="free-view-zoom">Масштаб просмотра <output data-free-zoom-value>100%</output><input data-free-zoom type="range" min="25" max="150" value="100"></label><label class="free-check"><input data-free-snap type="checkbox" checked> Привязка</label><label class="free-check"><input data-free-header type="checkbox"> Шапка команды</label><input data-free-files type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><input data-free-replace type="file" accept="image/png,image/jpeg,image/webp" hidden></div><div class="free-body"><div class="free-sidebar"><h3>Слои</h3><p class="hint">Верхний элемент списка — передний план.</p><div class="free-layers"></div></div><div class="free-viewport"><div class="free-stage" tabindex="0" aria-label="Лист A4. Стрелки перемещают выделенный объект."><div class="free-art"></div><div class="free-overlay"></div></div></div><div class="free-properties"></div></div><div class="free-warnings" aria-live="polite"></div><p data-lore-status role="status"></p>';
 document.body.append(dialog);stage=dialog.querySelector('.free-stage');properties=dialog.querySelector('.free-properties');layers=dialog.querySelector('.free-layers');warnings=dialog.querySelector('.free-warnings');
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{working=null;context=null;drag=null;typing=null;undo=[];redo=[];});
 dialog.addEventListener('click',onClick);
 dialog.addEventListener('input',event=>{if(event.target.dataset.freeField)applyField(event.target);if(event.target.matches('[data-free-zoom]')){zoom=Number(event.target.value)/100;paint();}});
 dialog.addEventListener('change',event=>{
  if(event.target.dataset.freeField){typing=null;if(event.target.dataset.freeField==='locked')render();}
  if(event.target.matches('[data-free-header]')&&!busy)change(()=>{working.showHeader=event.target.checked;});
  if(event.target.matches('[data-free-files]'))void upload([...event.target.files]);
  if(event.target.matches('[data-free-replace]'))void upload([...event.target.files],selected);
 });
 stage.addEventListener('pointerdown',event=>{
  if(event.button!==0||busy)return;const hit=event.target.closest('[data-free-object]');
  if(!hit){selected=null;render();return;}selected=hit.dataset.freeObject;const o=current();render();if(o.locked)return;
  stage.focus();event.preventDefault();drag={id:o.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,before:snapshot(),original:{...o},resize:!!event.target.closest('[data-free-resize]'),moved:false};stage.setPointerCapture(event.pointerId);
 });
 stage.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointer)return;const o=current(),a=drag.original,dx=(event.clientX-drag.x)/zoom,dy=(event.clientY-drag.y)/zoom,guides=[];
  if(Math.abs(dx)+Math.abs(dy)<2&&!drag.moved)return;drag.moved=true;
  if(drag.resize){o.w=Math.max(12,Math.min(F.W*2,a.w+dx));o.h=Math.max(12,Math.min(F.H*2,a.h+dy));if(o.type==='image'&&!event.altKey){const factor=Math.max(12/a.w,12/a.h,Math.min(o.w/a.w,o.h/a.h,F.W*2/a.w,F.H*2/a.h));o.w=a.w*factor;o.h=a.h*factor;}}
  else{
   o.x=Math.max(-F.W,Math.min(F.W,a.x+dx));o.y=Math.max(-F.H,Math.min(F.H,a.y+dy));
   if(dialog.querySelector('[data-free-snap]').checked&&!event.altKey)for(const [axis,size,extent] of [['x','w',F.W],['y','h',F.H]]){
    const anchors=[34,extent/2,extent-34,...working.objects.filter(other=>other.id!==o.id).flatMap(other=>[other[axis],other[axis]+other[size]/2,other[axis]+other[size]])];let best=6/zoom,adjust=0,line;
    for(const target of anchors)for(const edge of [0,o[size]/2,o[size]]){const diff=target-o[axis]-edge;if(Math.abs(diff)<best){best=Math.abs(diff);adjust=diff;line=target;}}
    o[axis]=Math.max(-extent,Math.min(extent,o[axis]+adjust));if(line!==undefined)guides.push({axis,value:line});
   }
  }paint(guides);
 });
 const stop=event=>{if(!drag||event.pointerId!==drag.pointer)return;const prev=drag;drag=null;if(event.type==='pointercancel')working=prev.before;else if(prev.moved)remember(prev.before);render();};
 stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);stage.addEventListener('lostpointercapture',stop);
 dialog.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select')||busy)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey);return;}
  if(event.key==='Delete'&&current()&&!current().locked){event.preventDefault();remove();return;}
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if(delta&&current()&&!current().locked){event.preventDefault();change(()=>{const o=current(),step=event.shiftKey?10:1;o.x=Math.max(-F.W,Math.min(F.W,o.x+delta[0]*step));o.y=Math.max(-F.H,Math.min(F.H,o.y+delta[1]*step));});}
 });
 root.addEventListener('beforeunload',event=>{if(dialog.open&&(dirty()||busy)){event.preventDefault();event.returnValue='';}});
}
function history(forward){const source=forward?redo:undo,target=forward?undo:redo;if(!source.length)return;target.push(snapshot());working=source.pop();typing=null;render();}
function remove(){change(()=>{working.objects=working.objects.filter(o=>o.id!==selected);working.images=working.images.filter(img=>working.objects.some(o=>o.imageId===img.id));selected=null;});}
function close(){if(busy){status('Дождитесь загрузки изображения.');return;}if(!dirty()||confirm('Закрыть без сохранения изменений страницы?'))dialog.close();}
async function upload(files,replaceId){
 if(!files.length||busy)return;busy=true;const before=snapshot();let count=0;
 try{
  for(const file of files){
   if(!replaceId&&(working.objects.length>=F.MAX_OBJECTS||working.images.length>=40))throw Error('На странице можно разместить до 40 изображений и '+F.MAX_OBJECTS+' объектов.');
   status('Подготавливаю '+file.name+'…');const result=await root.KTOperativeImage.prepare(file,{details:true,profile:'pagePrint'});
   const img={id:uid(),image:result.image,imageWidth:result.width,imageHeight:result.height,caption:''};working.images.push(img);
   if(replaceId){const o=working.objects.find(o=>o.id===replaceId);o.imageId=img.id;o.zoom=1;o.panX=o.panY=0;working.images=working.images.filter(image=>working.objects.some(o=>o.imageId===image.id));}
   else{
    const background=working.template==='background',o=F.object(uid(),'image',{imageId:img.id,x:background?0:34,y:background?0:110,w:background?F.W:527,h:background?F.H:280,fit:background?'cover':'contain'});
    if(background)working.objects.unshift(o);else working.objects.push(o);selected=o.id;
   }count++;
  }
  status('Добавлено изображений: '+count+'.');
 }catch(error){status(error.message);}finally{if(count)remember(before);busy=false;dialog.querySelectorAll('input[type=file]').forEach(el=>{el.value='';});render();}
}
function onClick(event){
 const pick=event.target.closest('[data-free-select]');if(pick){if(!busy)selectObject(pick.dataset.freeSelect);return;}
 const action=event.target.closest('[data-free-action]')?.dataset.freeAction;if(!action||busy)return;
 const o=current();
 if(action==='close'){close();return;}
 if(action==='apply'){
  try{F.validate(working);const overflow=F.renderPage(working,context.project,context.assets)[0].warnings.filter(w=>w.kind==='overflow');if(overflow.length){status('Текст не помещается в '+overflow.length+' блоках. Исправьте рамки перед сохранением.');return;}context.apply(clone(working));baseline=JSON.stringify(working);dialog.close();}catch(error){status(error.message);}return;
 }
 if(action==='fit'){fit();return;}
 if(action==='undo'||action==='redo'){history(action==='redo');return;}
 if(action==='image'){dialog.querySelector('[data-free-files]').click();return;}
 if(action==='text'){if(working.objects.length>=F.MAX_OBJECTS){status('Достигнут лимит объектов.');return;}change(()=>{const item=F.object(uid(),'text');working.objects.push(item);selected=item.id;});return;}
 if(!o||o.locked)return;
 if(['bold','italic','bullet'].includes(action)){
  const field=properties.querySelector('textarea'),result=root.KTText.format(o.text,field.selectionStart,field.selectionEnd,action);if(result){change(()=>{o.text=o.text.slice(0,result.from)+result.text+o.text.slice(result.to);});const next=properties.querySelector('textarea');next.focus();next.setSelectionRange(result.start,result.end);}return;
 }
 if(action==='replace-image'){dialog.querySelector('[data-free-replace]').click();return;}
 if(action==='delete'){remove();return;}
 if(action==='duplicate'&&working.objects.length>=F.MAX_OBJECTS){status('Достигнут лимит объектов.');return;}
 change(()=>{
  const index=working.objects.indexOf(o);
  if(action==='duplicate'){const copy={...clone(o),id:uid(),x:Math.min(F.W,o.x+12),y:Math.min(F.H,o.y+12)};working.objects.splice(index+1,0,copy);selected=copy.id;}
  if(['front','back','raise','lower'].includes(action)){working.objects.splice(index,1);working.objects.splice(action==='front'?working.objects.length:action==='back'?0:action==='raise'?Math.min(index+1,working.objects.length):Math.max(0,index-1),0,o);}
  if(action==='reset-crop'){o.fit='contain';o.zoom=1;o.panX=o.panY=0;}
  if(action==='left')o.x=34;if(action==='center')o.x=(F.W-o.w)/2;if(action==='right')o.x=F.W-34-o.w;
 });
}
function open(page,options){ensure();context=options;working=clone(page);baseline=JSON.stringify(working);selected=working.objects.at(-1)?.id;undo=[];redo=[];typing=null;busy=false;status('');dialog.showModal();render();fit();}
root.KTFreeLoreEditor={open};
})(window);

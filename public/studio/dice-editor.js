(function(root){
'use strict';
const esc=value=>root.KTCards.esc(String(value));
let adapter,previewVersion=0,rotationX=-24,rotationY=145;
root.KTUI?.register('studio',{pairs:[
 ['Кубики D6','D6 dice'],['Кубики команды','Team dice'],['Предпросмотр D6','D6 preview'],
 ['Добавлять кубики в TTS-набор команды','Include dice in the team TTS pack'],
 ['Кубики с логотипом вашей команды: настройте оформление и количество для общего набора TTS.','Dice with your team logo: customize the design and quantity for your TTS pack.'],
 ['Оформление сохраняется вместе с черновиком. Кубики с логотипом команды появятся в одном наборе с картами и жетонами.','The design is saved with your draft. Team dice join the same pack as your cards and tokens.'],
 ['Название кубиков','Dice name'],['Количество','Quantity'],['Цвет точек и цифр','Pip and number color'],
 ['Обозначения граней','Face markings'],['Грань с логотипом','Logo face'],['Размер точек и цифр','Pip and number size'],
 ['Перекрасить логотип в цвет обозначений','Tint the logo with the marking color'],
 ['Используется логотип текущей команды. Его изменение обновляет предпросмотр и новые экспорты.','Uses the current team logo. Logo changes update the preview and future exports.'],
 ['Добавьте логотип команды выше. Пока все грани показывают точки или цифры.','Add your team logo above. Until then, every face shows pips or numbers.'],
 ['Экспорт команды в TTS','Export team to TTS'],['Скачать PNG кубика','Download dice PNG'],
 ['Уже созданные TTS-ссылки сохраняют прежнее оформление. После правок создайте новую ссылку.','Existing TTS links keep their original design. Create a new link after making changes.'],
 ['Открыть отдельный генератор кубиков ↗','Open the standalone dice generator ↗'],['Сбросить поворот','Reset rotation'],
 ['Предпросмотр кубика D6. Поворачивайте мышью или стрелками.','D6 preview. Rotate with the mouse or arrow keys.'],
 ['Настроить кубики','Edit dice'],['Показать кубик','Show die'],
 ['Карты, жетоны и кубики по одной ссылке','Cards, tokens and dice from one link'],
 ['Создайте снимок команды для TTS: колода карточек, мешочки с жетонами и кубики, включённые во вкладке «Кубики D6». Набор будет доступен каждому, у кого есть ссылка. Черновик не появится в библиотеке.','Create a TTS snapshot of your team: a card deck, token bags and dice enabled in the D6 dice tab. Anyone with the link can access the pack. Your draft stays out of the library.'],
 ['Если кубики включены в набор, ZIP также содержит team-dice.png. Загрузите его в Custom Dice → Image и выберите D6.','When dice are included, the ZIP also contains team-dice.png. Load it in Custom Dice → Image and select D6.'],
 ['Кубики пока не включены в TTS-набор. Включите их в настройках слева.','Dice are not included in the TTS pack yet. Enable them in the dice settings.']
],patterns:[
 [/^Грань ([1-6])$/,'Face $1'],
 [/^(\d+) кубиков будут добавлены в новый TTS-набор команды\.$/,'$1 dice will be included in the new team TTS pack.'],
 [/^Собираю карты, жетоны и кубики: (\d+) \/ (\d+)$/,'Building cards, tokens and dice: $1 / $2']
]});
function bind(value){adapter=value;}
function form(project){
 const d=project.dice||root.KTDice.projectDefaults();
 const input=(label,key,type,attributes='')=>'<label>'+label+'<input data-dice-setting="'+key+'" type="'+type+'" value="'+esc(d[key])+'" '+attributes+'></label>';
 const select=(label,key,options)=>'<label>'+label+'<select data-dice-setting="'+key+'">'+options.map(([value,text])=>'<option value="'+value+'" '+(String(d[key])===String(value)?'selected':'')+'>'+text+'</option>').join('')+'</select></label>';
 return '<section class="panel studio-dice-settings"><div class="panel-title">КУБИКИ КОМАНДЫ</div>'+
  '<label class="studio-dice-check"><input type="checkbox" data-dice-setting="enabled" '+(d.enabled?'checked':'')+'>Добавлять кубики в TTS-набор команды</label>'+
  '<p class="hint">Оформление сохраняется вместе с черновиком. Кубики с логотипом команды появятся в одном наборе с картами и жетонами.</p>'+
  input('Название кубиков','name','text','maxlength="120" required data-ui-skip')+
  '<div class="studio-dice-fields">'+input('Количество','quantity','number','min="1" max="24" step="1" required')+input('Размер, мм','sizeMm','number','min="12" max="30" step="1" required')+
  input('Цвет кубика','body','color')+input('Цвет точек и цифр','ink','color')+
  select('Обозначения граней','style',[['pips','Точки'],['numbers','Цифры']])+select('Грань с логотипом','logoFace',[[0,'Без логотипа'],...[1,2,3,4,5,6].map(n=>[n,'Грань '+n])])+'</div>'+
  '<label class="studio-dice-range">Размер точек и цифр <output data-dice-value="valueScale">'+d.valueScale+'%</output><input data-dice-setting="valueScale" type="range" min="30" max="200" value="'+d.valueScale+'"></label>'+
  '<label class="studio-dice-range">Размер логотипа <output data-dice-value="logoScale">'+d.logoScale+'%</output><input data-dice-setting="logoScale" type="range" min="30" max="200" value="'+d.logoScale+'"></label>'+
  '<label class="studio-dice-check"><input type="checkbox" data-dice-setting="tintLogo" '+(d.tintLogo?'checked':'')+'>Перекрасить логотип в цвет обозначений</label>'+
  '<p class="hint">'+(project.team.logo?'Используется логотип текущей команды. Его изменение обновляет предпросмотр и новые экспорты.':'Добавьте логотип команды выше. Пока все грани показывают точки или цифры.')+'</p>'+
  '<div class="studio-dice-actions"><button type="button" class="primary" data-dice-export>Экспорт команды в TTS</button><button type="button" data-dice-download>Скачать PNG кубика</button></div>'+
  '<p class="hint">Уже созданные TTS-ссылки сохраняют прежнее оформление. После правок создайте новую ссылку.</p>'+
  '<a href="/dice" class="studio-dice-standalone">Открыть отдельный генератор кубиков ↗</a></section>';
}
async function preview(project,container){
 const version=++previewVersion,settings={...(project.dice||root.KTDice.projectDefaults())},logo=project.team.logo;
 container.innerHTML='<div class="studio-dice-preview"><div class="studio-dice-stage" tabindex="0" role="img" aria-label="Предпросмотр кубика D6. Поворачивайте мышью или стрелками."><div class="studio-dice-cube">'+[1,2,3,4,5,6].map(n=>'<canvas data-dice-face="'+n+'" width="384" height="384"></canvas>').join('')+'</div></div><button type="button" data-dice-reset>Сбросить поворот</button><div class="studio-dice-faces">'+[1,2,3,4,5,6].map(n=>'<figure><canvas data-dice-flat="'+n+'" width="256" height="256"></canvas><figcaption data-ui-skip>'+n+'</figcaption></figure>').join('')+'</div><p class="hint" data-dice-preview-status role="status"></p></div>';
 const stage=container.querySelector('.studio-dice-stage'),cube=container.querySelector('.studio-dice-cube');
 const rotate=()=>{cube.style.transform='rotateX('+rotationX+'deg) rotateY('+rotationY+'deg)';};
 rotate();let drag;
 stage.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,rx:rotationX,ry:rotationY};stage.setPointerCapture(event.pointerId);});
 stage.addEventListener('pointermove',event=>{if(!drag)return;rotationX=drag.rx-(event.clientY-drag.y)*.5;rotationY=drag.ry+(event.clientX-drag.x)*.5;rotate();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,()=>{drag=null;});
 stage.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();rotationY+=event.key==='ArrowLeft'?-15:event.key==='ArrowRight'?15:0;rotationX+=event.key==='ArrowUp'?15:event.key==='ArrowDown'?-15:0;rotate();});
 container.querySelector('[data-dice-reset]').addEventListener('click',()=>{rotationX=-24;rotationY=145;rotate();});
 const draw=image=>{for(const canvas of container.querySelectorAll('[data-dice-face],[data-dice-flat]'))root.KTDice.drawFace(canvas,Number(canvas.dataset.diceFace||canvas.dataset.diceFlat),settings,image);};
 draw(null);
 try{
  const image=await root.KTDice.loadLogo(settings.logoFace?logo:'');
  if(version!==previewVersion||!cube.isConnected)return;
  draw(image);
 }catch(error){if(version===previewVersion&&cube.isConnected)container.querySelector('[data-dice-preview-status]').textContent=error.message;}
}
document.addEventListener('input',event=>{
 const field=event.target,key=field.dataset.diceSetting;if(!key||!adapter)return;
 if(!field.checkValidity())return;
 const project=adapter.context();if(!project)return;
 const settings={...(project.dice||root.KTDice.projectDefaults())};
 settings[key]=field.type==='checkbox'?field.checked:['quantity','sizeMm','logoFace','logoScale','valueScale'].includes(key)?Number(field.value):field.value;
 try{root.KTDice.validate(settings);}catch{return;}
 project.dice=settings;
 const output=document.querySelector('[data-dice-value="'+key+'"]');if(output)output.textContent=settings[key]+'%';
 adapter.changed();
});
document.addEventListener('change',event=>{if(event.target.dataset.diceSetting&&!event.target.checkValidity())event.target.reportValidity();});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-dice-export],[data-dice-download]');if(!button||!adapter)return;
 const project=adapter.context();if(!project)return;
 for(const field of document.querySelectorAll('[data-dice-setting]'))if(!field.checkValidity()){field.reportValidity();return;}
 if(button.hasAttribute('data-dice-export')){adapter.export();return;}
 button.disabled=true;
 try{
  const snapshot=structuredClone(project),settings=root.KTDice.validate(snapshot.dice),image=await root.KTDice.loadLogo(settings.logoFace?snapshot.team.logo:'');
  const canvas=root.KTDice.atlas(settings,image),blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Не удалось сохранить PNG')),'image/png'));
  if(adapter.context()!==project)return;
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='kt-team-d6.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(error){adapter.toast(error.message);}finally{button.disabled=false;}
});
root.KTDiceEditor={bind,form,preview};
})(window);

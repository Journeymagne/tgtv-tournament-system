(function(root){
'use strict';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const full=()=>({x:0,y:0,width:1,height:1});
function valid(rect){return !!rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=1.000001}
function zoom(rect,factor,minWidth=.005,minHeight=.005){
 if(!valid(rect)||!Number.isFinite(factor)||factor<=0)return {...rect};
 const scale=clamp(1/factor,Math.max(minWidth/rect.width,minHeight/rect.height),Math.min(1/rect.width,1/rect.height));
 const width=rect.width*scale,height=rect.height*scale;
 return {x:clamp(rect.x+(rect.width-width)/2,0,1-width),y:clamp(rect.y+(rect.height-height)/2,0,1-height),width,height};
}
function zoomTo(rect,percent,minWidth=.005,minHeight=.005){
 const target=Math.max(10,percent);
 return {...zoom(rect,Math.max(rect.width,rect.height)*Math.max(100,target)/100,minWidth,minHeight),scale:Math.min(1,target/100)};
}
function drag(rect,start,end,mode,minWidth=.005,minHeight=.005){
 const dx=end.x-start.x,dy=end.y-start.y;
 if(mode==='move')return {...rect,x:clamp(rect.x+dx,0,1-rect.width),y:clamp(rect.y+dy,0,1-rect.height)};
 let left=rect.x,top=rect.y,right=rect.x+rect.width,bottom=rect.y+rect.height;
 if(mode==='draw'){
  left=clamp(Math.min(start.x,end.x),0,1-minWidth);top=clamp(Math.min(start.y,end.y),0,1-minHeight);
  right=clamp(Math.max(start.x,end.x),left+minWidth,1);bottom=clamp(Math.max(start.y,end.y),top+minHeight,1);
 }else{
  if(mode.includes('w'))left=clamp(left+dx,0,Math.max(0,right-minWidth));
  if(mode.includes('e'))right=clamp(right+dx,Math.min(1,left+minWidth),1);
  if(mode.includes('n'))top=clamp(top+dy,0,Math.max(0,bottom-minHeight));
  if(mode.includes('s'))bottom=clamp(bottom+dy,Math.min(1,top+minHeight),1);
 }
 return {x:left,y:top,width:right-left,height:bottom-top};
}
let active=null;
function open(src,initial,frame={width:160,height:33}){
 if(active)return Promise.resolve(null);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog'),events=new AbortController(),signal=events.signal;
  dialog.className='crop-dialog';dialog.setAttribute('aria-labelledby','crop-title');
  dialog.innerHTML='<div class="crop-heading"><h2 id="crop-title">Область картинки оперативника</h2><button type="button" data-crop-close aria-label="Закрыть выбор области">✕</button></div>'+
   '<p class="crop-help" id="crop-help">Выделите область на картинке. Рамку можно двигать и менять за углы. Ползунок и колесо мыши меняют масштаб фрагмента. Исходное изображение сохранится.</p>'+
   '<div class="crop-zoom"><label for="crop-zoom">Масштаб фрагмента</label><button type="button" data-crop-zoom-out aria-label="Уменьшить масштаб" disabled>−</button><input id="crop-zoom" type="range" min="10" max="800" step="1" value="100" disabled><button type="button" data-crop-zoom-in aria-label="Увеличить масштаб" disabled>+</button><output for="crop-zoom" data-crop-zoom-value>100%</output></div>'+
   '<div class="crop-zoom crop-offset"><label for="crop-offset-y">Сдвиг по вертикали</label><button type="button" data-crop-up aria-label="Поднять портрет" disabled>↑</button><input id="crop-offset-y" type="range" min="-100" max="100" step="1" value="0" disabled><button type="button" data-crop-down aria-label="Опустить портрет" disabled>↓</button><output for="crop-offset-y" data-crop-offset-value>0%</output><button type="button" data-crop-offset-reset disabled>Сбросить сдвиг</button></div>'+
   '<div class="crop-layout"><div class="crop-board"><div class="crop-stage" tabindex="0" aria-label="Область обрезки. Стрелки перемещают рамку, Shift ускоряет перемещение." aria-describedby="crop-help"><img class="crop-image" alt="Исходное изображение оперативника" draggable="false"><div class="crop-selection" hidden>'+
   [['nw','Верхний левый'],['ne','Верхний правый'],['sw','Нижний левый'],['se','Нижний правый']].map(([handle,label])=>'<button type="button" class="crop-handle crop-'+handle+'" data-crop-handle="'+handle+'" aria-label="'+label+' угол рамки. Стрелки меняют размер."></button>').join('')+'</div></div></div>'+
   '<div class="crop-preview"><span>Портрет на карточке</span><canvas class="crop-header-preview" aria-label="Предпросмотр портрета в шапке карточки"></canvas><p class="hint">Поднимите портрет кнопкой ↑ или сдвиньте ползунок влево, чтобы убрать пустое место над моделью. Здесь показана видимая часть шапки.</p></div></div>'+
   '<p class="crop-status" role="status">Загружаю картинку…</p><div class="crop-actions"><button type="button" data-crop-reset disabled>Всё изображение</button><button type="button" data-crop-close>Отмена</button><button type="button" class="primary" data-crop-apply disabled>Применить</button></div>';
  document.body.append(dialog);active=dialog;
  const find=selector=>dialog.querySelector(selector),stage=find('.crop-stage'),img=find('.crop-image'),selection=find('.crop-selection'),canvas=find('canvas'),status=find('.crop-status'),zoomInput=find('#crop-zoom'),offsetInput=find('#crop-offset-y');
  let rect=valid(initial)?{x:initial.x,y:initial.y,width:initial.width,height:initial.height}:full(),scale=Number.isFinite(initial?.scale)?clamp(initial.scale,.1,1):1,offsetY=Number.isFinite(initial?.offsetY)?clamp(initial.offsetY,-1,1):0,pointer=null,ready=false,finished=false,observer,timer;
  const zoomPercent=()=>100*scale/Math.max(rect.width,rect.height);
  const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);events.abort();observer?.disconnect();if(dialog.open)dialog.close();dialog.remove();active=null;resolve(result)};
  const point=event=>{const box=stage.getBoundingClientRect();return {x:clamp((event.clientX-box.left)/box.width,0,1),y:clamp((event.clientY-box.top)/box.height,0,1)}};
  const draw=()=>{
   if(!ready||finished)return;
   selection.hidden=false;Object.assign(selection.style,{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.width*100+'%',height:rect.height*100+'%'});
   const w=rect.width*img.naturalWidth,h=rect.height*img.naturalHeight,placement=root.KTCards.portraitPlacement({...rect,offsetY,scale},img.naturalWidth,img.naturalHeight,frame);
   canvas.width=Math.round(frame.width*2);canvas.height=Math.round(frame.height*2);
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.fillStyle='#141718';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(canvas.width/frame.width,canvas.height/frame.height);
   ctx.drawImage(img,rect.x*img.naturalWidth,rect.y*img.naturalHeight,w,h,placement.x,placement.y,placement.width,placement.height);
   status.textContent='Выбрано '+Math.round(w)+' × '+Math.round(h)+' пикселей';
   const percent=Math.round(zoomPercent());
   zoomInput.disabled=false;zoomInput.max=Math.max(800,percent);zoomInput.value=percent;
   find('[data-crop-zoom-value]').textContent=percent+'%';
   find('[data-crop-zoom-out]').disabled=percent<=10;find('[data-crop-zoom-in]').disabled=percent>=Number(zoomInput.max);
   offsetInput.disabled=false;offsetInput.value=Math.round(offsetY*100);
   find('[data-crop-offset-value]').textContent=(offsetY>0?'+':'')+Math.round(offsetY*100)+'%';
   find('[data-crop-up]').disabled=offsetY<=-1;find('[data-crop-down]').disabled=offsetY>=1;find('[data-crop-offset-reset]').disabled=!offsetY;
  };
  const setOffset=value=>{if(!ready||finished||pointer)return;offsetY=clamp(value,-1,1);draw()};
  offsetInput.addEventListener('input',()=>setOffset(Number(offsetInput.value)/100),{signal});
  find('[data-crop-up]').addEventListener('click',()=>setOffset(offsetY-.01),{signal});
  find('[data-crop-down]').addEventListener('click',()=>setOffset(offsetY+.01),{signal});
  find('[data-crop-offset-reset]').addEventListener('click',()=>setOffset(0),{signal});
  const setZoom=percent=>{
   if(!ready||finished||pointer)return;
   const target=clamp(percent,10,Number(zoomInput.max)),next=zoomTo(rect,target,Math.min(1,4/img.naturalWidth),Math.min(1,4/img.naturalHeight));
   scale=next.scale;delete next.scale;rect=next;draw();
  };
  zoomInput.addEventListener('input',()=>setZoom(Number(zoomInput.value)),{signal});
  find('[data-crop-zoom-out]').addEventListener('click',()=>setZoom(zoomPercent()/1.25),{signal});
  find('[data-crop-zoom-in]').addEventListener('click',()=>setZoom(zoomPercent()*1.25),{signal});
  stage.addEventListener('wheel',event=>{
   if(!ready||pointer)return;
   event.preventDefault();const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1);
   setZoom(zoomPercent()*Math.exp(clamp(-delta*.0015,-1,1)));
  },{signal,passive:false});
  const fit=()=>{if(!ready||finished)return;const scale=Math.min(1,Math.max(1,find('.crop-board').clientWidth-16)/img.naturalWidth,Math.min(520,innerHeight*.5)/img.naturalHeight);stage.style.width=Math.max(1,Math.round(img.naturalWidth*scale))+'px';stage.style.height=Math.max(1,Math.round(img.naturalHeight*scale))+'px'};
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null)},{signal});
  dialog.addEventListener('close',()=>finish(null),{signal});
  dialog.querySelectorAll('[data-crop-close]').forEach(button=>button.addEventListener('click',()=>finish(null),{signal}));
  find('[data-crop-reset]').addEventListener('click',()=>{rect=full();scale=1;offsetY=0;draw();stage.focus()},{signal});
  find('[data-crop-apply]').addEventListener('click',()=>{if(ready)finish({crop:{...rect,...(offsetY?{offsetY}:{}),...(scale!==1?{scale}:{})},width:img.naturalWidth,height:img.naturalHeight})},{signal});
  stage.addEventListener('pointerdown',event=>{
   if(!ready||pointer||event.button!==0)return;
   const handle=event.target.closest('[data-crop-handle]');
   const whole=rect.x===0&&rect.y===0&&rect.width===1&&rect.height===1;
   pointer={id:event.pointerId,start:point(event),rect:{...rect},mode:handle?handle.dataset.cropHandle:event.target.closest('.crop-selection')&&!whole?'move':'draw'};
   stage.setPointerCapture(event.pointerId);(handle||stage).focus();event.preventDefault();
  },{signal});
  stage.addEventListener('pointermove',event=>{
   if(!pointer||pointer.id!==event.pointerId)return;
   const end=point(event),box=stage.getBoundingClientRect();
   if(pointer.mode==='draw'&&(Math.abs(end.x-pointer.start.x)*box.width<3||Math.abs(end.y-pointer.start.y)*box.height<3))return;
   rect=drag(pointer.rect,pointer.start,end,pointer.mode,Math.min(1,4/img.naturalWidth),Math.min(1,4/img.naturalHeight));draw();
  },{signal});
  const endPointer=event=>{if(pointer?.id===event.pointerId){pointer=null;if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId)}};
  stage.addEventListener('pointerup',endPointer,{signal});stage.addEventListener('pointercancel',endPointer,{signal});stage.addEventListener('lostpointercapture',()=>pointer=null,{signal});
  stage.addEventListener('keydown',event=>{
   if(!ready||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
   event.preventDefault();const step=event.shiftKey?10:1,delta={x:(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0)/img.naturalWidth,y:(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)/img.naturalHeight};
   rect=drag(rect,{x:0,y:0},delta,event.target.dataset.cropHandle||'move',Math.min(1,4/img.naturalWidth),Math.min(1,4/img.naturalHeight));draw();
  },{signal});
  const failed=()=>{clearTimeout(timer);if(!finished)status.textContent='Не удалось прочитать изображение. Закройте окно и загрузите картинку заново.'};
  img.addEventListener('load',()=>{
   clearTimeout(timer);if(finished)return;
   if(!img.naturalWidth||!img.naturalHeight)return failed();
   ready=true;fit();draw();find('[data-crop-reset]').disabled=false;find('[data-crop-apply]').disabled=false;stage.focus();
   if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(fit);observer.observe(find('.crop-board'))}
  },{signal});
  img.addEventListener('error',failed,{signal});root.addEventListener('resize',fit,{signal});
  dialog.showModal();timer=setTimeout(failed,20000);img.src=src;
 });
}
root.KTOperativeCrop={open,drag,zoom,zoomTo,valid};
if(typeof module!=='undefined')module.exports=root.KTOperativeCrop;
})(typeof window!=='undefined'?window:globalThis);

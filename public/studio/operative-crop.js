(function(root){
'use strict';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const full=()=>({x:0,y:0,width:1,height:1});
function valid(rect){return !!rect&&['x','y','width','height'].every(key=>Number.isFinite(rect[key]))&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=1.000001&&rect.y+rect.height<=1.000001}
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
function open(src,initial){
 if(active)return Promise.resolve(null);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog'),events=new AbortController(),signal=events.signal;
  dialog.className='crop-dialog';dialog.setAttribute('aria-labelledby','crop-title');
  dialog.innerHTML='<div class="crop-heading"><h2 id="crop-title">Область картинки оперативника</h2><button type="button" data-crop-close aria-label="Закрыть выбор области">✕</button></div>'+
   '<p class="crop-help" id="crop-help">Выделите область на картинке. Рамку можно двигать и менять за углы. Исходное изображение сохранится.</p>'+
   '<div class="crop-layout"><div class="crop-board"><div class="crop-stage" tabindex="0" aria-label="Область обрезки. Стрелки перемещают рамку, Shift ускоряет перемещение." aria-describedby="crop-help"><img class="crop-image" alt="Исходное изображение оперативника" draggable="false"><div class="crop-selection" hidden>'+
   [['nw','Верхний левый'],['ne','Верхний правый'],['sw','Нижний левый'],['se','Нижний правый']].map(([handle,label])=>'<button type="button" class="crop-handle crop-'+handle+'" data-crop-handle="'+handle+'" aria-label="'+label+' угол рамки. Стрелки меняют размер."></button>').join('')+'</div></div></div>'+
   '<div class="crop-preview"><span>Выбранный фрагмент</span><canvas aria-label="Предпросмотр выбранной области"></canvas><p class="hint">На карточку попадёт только эта область, с сохранением пропорций.</p></div></div>'+
   '<p class="crop-status" role="status">Загружаю картинку…</p><div class="crop-actions"><button type="button" data-crop-reset disabled>Всё изображение</button><button type="button" data-crop-close>Отмена</button><button type="button" class="primary" data-crop-apply disabled>Применить</button></div>';
  document.body.append(dialog);active=dialog;
  const find=selector=>dialog.querySelector(selector),stage=find('.crop-stage'),img=find('.crop-image'),selection=find('.crop-selection'),canvas=find('canvas'),status=find('.crop-status');
  let rect=valid(initial)?{...initial}:full(),pointer=null,ready=false,finished=false,observer,timer;
  const finish=result=>{if(finished)return;finished=true;clearTimeout(timer);events.abort();observer?.disconnect();if(dialog.open)dialog.close();dialog.remove();active=null;resolve(result)};
  const point=event=>{const box=stage.getBoundingClientRect();return {x:clamp((event.clientX-box.left)/box.width,0,1),y:clamp((event.clientY-box.top)/box.height,0,1)}};
  const draw=()=>{
   if(!ready||finished)return;
   selection.hidden=false;Object.assign(selection.style,{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.width*100+'%',height:rect.height*100+'%'});
   const w=rect.width*img.naturalWidth,h=rect.height*img.naturalHeight,scale=Math.min(1,400/w,240/h);
   canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
   const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(img,rect.x*img.naturalWidth,rect.y*img.naturalHeight,w,h,0,0,canvas.width,canvas.height);
   status.textContent='Выбрано '+Math.round(w)+' × '+Math.round(h)+' пикселей';
  };
  const fit=()=>{if(!ready||finished)return;const scale=Math.min(1,Math.max(1,find('.crop-board').clientWidth-16)/img.naturalWidth,Math.min(520,innerHeight*.5)/img.naturalHeight);stage.style.width=Math.max(1,Math.round(img.naturalWidth*scale))+'px';stage.style.height=Math.max(1,Math.round(img.naturalHeight*scale))+'px'};
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null)},{signal});
  dialog.addEventListener('close',()=>finish(null),{signal});
  dialog.querySelectorAll('[data-crop-close]').forEach(button=>button.addEventListener('click',()=>finish(null),{signal}));
  find('[data-crop-reset]').addEventListener('click',()=>{rect=full();draw();stage.focus()},{signal});
  find('[data-crop-apply]').addEventListener('click',()=>{if(ready)finish({crop:{...rect},width:img.naturalWidth,height:img.naturalHeight})},{signal});
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
root.KTOperativeCrop={open,drag,valid};
if(typeof module!=='undefined')module.exports=root.KTOperativeCrop;
})(typeof window!=='undefined'?window:globalThis);

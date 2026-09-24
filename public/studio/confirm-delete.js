(function(root){
'use strict';
let active=false;
const t=value=>root.KTUI?.text(value)||value;
function confirm({subject='',alreadyConfirmed=false,replace=false}={}){
 if(active)return Promise.resolve(false);
 active=true;
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.id='studio-delete-confirm';dialog.className='project-dialog';
  dialog.setAttribute('aria-labelledby','studio-delete-title');
  dialog.setAttribute('aria-describedby','studio-delete-subject studio-delete-warning');
  dialog.innerHTML='<p class="eyebrow" data-delete-step></p><h2 id="studio-delete-title"></h2><p id="studio-delete-subject" data-ui-skip></p><p id="studio-delete-warning"></p><div class="project-dialog-actions"><button type="button" data-delete-cancel autofocus></button><button type="button" data-delete-accept class="danger"></button></div>';
  const cancel=dialog.querySelector('[data-delete-cancel]'),accept=dialog.querySelector('[data-delete-accept]');
  let step=alreadyConfirmed?2:1,settled=false;
  dialog.querySelector('#studio-delete-subject').textContent=subject;
  cancel.textContent=t('Отмена');
  function render(){
   dialog.querySelector('[data-delete-step]').textContent=t(step===1?'Подтверждение 1 из 2':'Подтверждение 2 из 2');
   dialog.querySelector('#studio-delete-title').textContent=t(step===1?'Подтвердите действие':'Вы уверены?');
   dialog.querySelector('#studio-delete-warning').textContent=t(step===1?'На следующем шаге потребуется ещё одно подтверждение.':'Это действие нельзя отменить. Подтвердите ещё раз, чтобы продолжить.');
   accept.textContent=t(step===1?'Продолжить':replace?'Да, заменить':'Да, удалить');
   cancel.focus();
  }
  function finish(confirmed){
   if(settled)return;settled=true;
   dialog.close();dialog.remove();active=false;resolve(confirmed);
  }
  cancel.addEventListener('click',()=>finish(false));
  accept.addEventListener('click',event=>{
   // A double click must not accept both steps of the same dialog.
   if(event.detail>1)return;
   if(step===1){step=2;render()}else finish(true);
  });
  dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault()});
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
  dialog.addEventListener('close',()=>finish(false));
  document.body.append(dialog);render();dialog.showModal();cancel.focus();
 });
}
root.KTDelete={confirm};
})(window);

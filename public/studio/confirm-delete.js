(function(root){
'use strict';
let active=false;
const t=value=>root.KTUI?.text(value)||value;
function confirm({subject='',replace=false}={}){
 if(active)return Promise.resolve(false);
 active=true;
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.id='studio-delete-confirm';dialog.className='project-dialog';
  dialog.setAttribute('aria-labelledby','studio-delete-title');
  dialog.setAttribute('aria-describedby','studio-delete-subject studio-delete-warning');
  dialog.innerHTML='<h2 id="studio-delete-title"></h2><p id="studio-delete-subject" data-ui-skip></p><p id="studio-delete-warning"></p><div class="project-dialog-actions"><button type="button" data-delete-cancel autofocus></button><button type="button" data-delete-accept class="danger"></button></div>';
  const cancel=dialog.querySelector('[data-delete-cancel]'),accept=dialog.querySelector('[data-delete-accept]');
  let settled=false;
  dialog.querySelector('#studio-delete-subject').textContent=subject;
  cancel.textContent=t('Отмена');
  dialog.querySelector('#studio-delete-title').textContent=t(replace?'Подтвердите действие':'Вы уверены?');
  dialog.querySelector('#studio-delete-warning').textContent=t('Это действие нельзя отменить.');
  accept.textContent=t(replace?'Да, заменить':'Да, удалить');
  function finish(confirmed){
   if(settled)return;settled=true;
   dialog.close();dialog.remove();active=false;resolve(confirmed);
  }
  cancel.addEventListener('click',()=>finish(false));
  accept.addEventListener('click',()=>finish(true));
  dialog.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.repeat)event.preventDefault()});
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)});
  dialog.addEventListener('close',()=>finish(false));
  document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}
root.KTDelete={confirm};
})(window);

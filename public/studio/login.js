(function(root){
'use strict';
const dialog=document.getElementById('studio-login-dialog'),form=document.getElementById('studio-login-form');
const error=document.getElementById('studio-login-error'),submit=document.getElementById('studio-login-submit');
const registration=document.getElementById('studio-register-fields'),password=form.elements.password;
let mode='login',busy=false,pending=null,finish;
function selectMode(next){
 mode=next;error.textContent='';registration.hidden=mode!=='register';
 for(const field of registration.querySelectorAll('input'))field.disabled=mode!=='register';
 password.minLength=mode==='register'?6:1;password.autocomplete=mode==='register'?'new-password':'current-password';
 for(const button of dialog.querySelectorAll('[data-studio-auth-mode]')){
  const active=button.dataset.studioAuthMode===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
 }
 submit.textContent=mode==='register'?'Создать аккаунт':'Войти';
}
function setBusy(value){
 busy=value;
 for(const field of dialog.querySelectorAll('input,button'))field.disabled=value;
 for(const field of registration.querySelectorAll('input'))field.disabled=value||mode!=='register';
 submit.textContent=value?'Подождите…':mode==='register'?'Создать аккаунт':'Войти';
 form.setAttribute('aria-busy',String(value));
}
function close(success=false){
 dialog.close();form.reset();error.textContent='';
 const resolve=finish;finish=null;pending=null;resolve?.(success);
}
function open(action){
 if(pending)return pending;
 form.reset();setBusy(false);selectMode('login');
 document.getElementById('studio-login-description').textContent=action==='drafts'?'Войдите, чтобы открыть свои черновики.':action==='publish'?'Войдите, чтобы опубликовать команду.':action==='save'||action==='download'?'Войдите, чтобы сохранить команду.':'Войдите в свой аккаунт KT Companion.';
 pending=new Promise(resolve=>finish=resolve);dialog.showModal();form.elements.name.focus();return pending;
}
dialog.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||busy)return;
 if(button.dataset.studioAuthMode)selectMode(button.dataset.studioAuthMode);
 if(button.id==='close-studio-login')close();
});
dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close()});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const fields=new FormData(form),body={name:fields.get('name'),password:fields.get('password')};
 error.textContent='';
 if(mode==='register'){
  body.confirmPassword=fields.get('confirmPassword');body.registerNickname=fields.get('registerNickname');body.telegramContact=fields.get('telegramContact');
  if(body.password!==body.confirmPassword){error.textContent='Пароли не совпадают.';return}
 }
 setBusy(true);
 try{
  const response=await fetch(mode==='register'?'/api/register':'/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok){
   const messages={'Invalid name or password':'Неверное имя пользователя или пароль.','This name is already taken':'Это имя пользователя уже занято.'};
   throw Error(messages[result.error]||(response.status===429?'Слишком много попыток. Попробуйте позже.':result.error)||'Не удалось войти. Попробуйте ещё раз.');
  }
  close(true);
 }catch(reason){error.textContent=reason instanceof TypeError?'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.':reason.message}
 finally{setBusy(false)}
});
root.KTStudioLogin={open};
})(window);

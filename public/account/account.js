(function(){
  'use strict';
  const $=selector=>document.querySelector(selector);let mode='login';
  async function request(path, options={}) {
    const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
    const body=await response.json();if(!response.ok)throw Error(body.error||'Не удалось выполнить запрос');return body;
  }
  function destination(){
    try { const next=new URL(new URLSearchParams(location.search).get('next')||'/',location.origin);
      return next.origin===location.origin&&!next.username&&!next.password ? next.href : '/';
    } catch { return '/'; }
  }
  async function refresh(){
    const session=await KTCompanion.session();$('#account-login').hidden=!!session.user;$('#account-profile').hidden=!session.user;
    if(session.user){const {user}=await request('/api/account');$('#account-name').textContent=user.name;
      for(const key of ['name','telegramContact','registerNickname'])$('#account-profile-form').elements[key].value=user[key]||'';}
    $('#account-status').textContent='';
  }
  for(const button of document.querySelectorAll('[data-auth-mode]'))button.addEventListener('click',()=>{
    mode=button.dataset.authMode;for(const choice of document.querySelectorAll('[data-auth-mode]'))choice.setAttribute('aria-pressed',String(choice===button));
    $('#account-registration').hidden=$('#account-registration').disabled=mode!=='register';
    $('#account-submit').textContent=mode==='register'?'Создать аккаунт':'Войти';
    $('#account-auth-form').elements.password.autocomplete=mode==='register'?'new-password':'current-password';
  });
  $('#account-auth-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('#account-submit');button.disabled=true;$('#account-status').textContent='';
    try {const body=Object.fromEntries(new FormData(event.target));body.locale=KTUI?.locale()||'ru';
      await request('/api/'+(mode==='register'?'register':'login'),{method:'POST',body:JSON.stringify(body)});
      KTCompanion.changed();location.assign(destination());
    }catch(error){$('#account-status').textContent=error.message;}finally{button.disabled=false;}
  });
  $('#account-profile-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;
    try{await request('/api/account',{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});await refresh();KTCompanion.changed();$('#account-status').textContent='Сохранено';}
    catch(error){$('#account-status').textContent=error.message;}finally{button.disabled=false;}
  });
  Promise.all([refresh(),request('/api/auth/email-config').then(config=>{$('#account-email-label').hidden=!config.enabled;$('#account-auth-form').elements.email.required=!!config.enabled;})])
    .catch(error=>{$('#account-status').textContent=error.message;});
})();

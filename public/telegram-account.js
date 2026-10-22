(() => {
  const tr=(ru,en)=>document.documentElement.lang==="en"?en:ru;
  const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function markup() {
    return `<section class="settings-block profile-dashboard-card telegram-settings-card" data-telegram-settings>
      <h3>Telegram</h3><div class="profile-card-content" data-telegram-content aria-live="polite">${tr("Загрузка…","Loading…")}</div>
      <p data-telegram-error role="alert" class="small-note"></p></section>`;
  }
  function mount(accountId) {
    const root=document.querySelector("[data-telegram-settings]");
    if(!root) return;
    const content=root.querySelector("[data-telegram-content]"),error=root.querySelector("[data-telegram-error]");
    let state,linkUrl="",busy=false, timer;
    const alive=()=>root.isConnected;
    async function request(path,method="GET",body) {
      const response=await fetch("/api/telegram/"+path,{method,credentials:"same-origin",headers:{"Content-Type":"application/json",...(method!=="GET"?{"X-CSRF-Token":state?.csrfToken,"X-Telegram-Account":String(accountId)}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      const result=await response.json();
      if(!response.ok) throw Error(result.error||tr("Не удалось сохранить настройки.","Could not save settings."));
      if(result.accountId && result.accountId!==accountId) throw Error(tr("Аккаунт изменился. Обновите страницу.","Account changed. Refresh this page."));
      return result;
    }
    function render() {
      if(!alive()) return;
      const link=state.link,pending=state.pending;
      if(!state.available && !link) {content.innerHTML=`<p class="muted">${tr("Бот пока недоступен.","The bot is not available yet.")}</p>`;return;}
      if(link) {
        const labels={pairings:tr("Турнирные пары","Tournament pairings"),results:tr("Подтверждение результатов","Result confirmation"),invitations:tr("Вызовы и приглашения","Challenges and invitations"),tournaments:tr("Начало турниров","Tournament starts")};
        content.innerHTML=`<p>${tr("Подключён:","Connected:")} <strong>${escape(link.display_name||link.username||link.telegram_id)}</strong>${link.username?" (@"+escape(link.username)+")":""}</p>
          ${link.blocked?`<p>${tr("Разблокируйте бота в Telegram и отправьте /start.","Unblock the bot in Telegram and send /start.")}</p>`:""}
          <form data-telegram-preferences><div class="field"><label><input type="checkbox" name="enabled" ${link.enabled?"checked":""}> ${tr("Получать уведомления","Receive notifications")}</label></div>
          ${Object.entries(labels).map(([key,label])=>`<div class="field"><label><input type="checkbox" name="${key}" ${link.preferences[key]?"checked":""}> ${label}</label></div>`).join("")}
          <button class="primary-button" ${state.available?"":"disabled"}>${tr("Сохранить","Save")}</button></form>
          <div class="row-actions">${state.botUsername?`<a class="small-button" href="https://t.me/${escape(state.botUsername)}" target="_blank" rel="noopener noreferrer">${tr("Открыть бота","Open bot")}</a>`:""}
          <button type="button" class="danger-button" data-telegram-action="unlink">${tr("Отвязать","Disconnect")}</button></div>`;
      } else if(pending?.claimed) {
        content.innerHTML=`<p>${tr("Подтвердите свой Telegram-аккаунт:","Confirm your Telegram account:")}</p><p><strong>${escape(pending.displayName||pending.username||pending.telegramId)}</strong>${pending.username?" (@"+escape(pending.username)+")":""}</p>
          <p class="muted">${tr("Подтверждайте только свой аккаунт.","Only confirm your own account.")}</p><div class="row-actions"><button type="button" class="primary-button" data-telegram-action="confirm">${tr("Это мой аккаунт — подключить","This is my account — connect")}</button><button type="button" class="ghost-button" data-telegram-action="cancel">${tr("Отмена","Cancel")}</button></div>`;
      } else {
        content.innerHTML=`<p class="muted">${tr("Получайте пары, приглашения и запросы подтверждения результата в Telegram.","Receive pairings, invitations and result confirmation requests in Telegram.")}</p>
          ${pending?`<p>${tr("Откройте бота по ссылке, нажмите Start и вернитесь сюда. Ссылка действует 10 минут.","Open the bot using the link, press Start and return here. The link expires in 10 minutes.")}</p>`:""}
          <div class="row-actions">${pending&&linkUrl?`<a class="primary-button" href="${escape(linkUrl)}" target="_blank" rel="noopener noreferrer">${tr("Открыть Telegram","Open Telegram")}</a>`:""}
          <button type="button" class="small-button" data-telegram-action="create">${pending?tr("Новая ссылка","New link"):tr("Подключить Telegram","Connect Telegram")}</button>
          ${pending?`<button type="button" class="ghost-button" data-telegram-action="refresh">${tr("Проверить подключение","Check connection")}</button>`:""}</div>`;
      }
    }
    async function refresh() {
      if(!alive()||busy) return;
      state=await request("status");render();
      clearTimeout(timer);
      if(state.pending) timer=setTimeout(()=>refresh().catch(e=>{if(alive())error.textContent=e.message;}),3000);
    }
    async function act(action) {
      if(busy) return;busy=true;error.textContent="";
      for(const button of content.querySelectorAll("button"))button.disabled=true;
      try {
        if(action==="create") {const result=await request("link","POST",{});linkUrl=result.url;}
        if(action==="confirm") await request("confirm","POST",{telegramId:state.pending.telegramId,locale:document.documentElement.lang});
        if(action==="unlink" || action==="cancel") {
          if(action==="unlink"&&!window.confirm(tr("Отвязать Telegram и прекратить уведомления?","Disconnect Telegram and stop notifications?"))) return;
          await request("link","DELETE",{});linkUrl="";
        }
      } catch(e) {if(alive())error.textContent=e.message;}
      finally {busy=false;await refresh().catch(e=>{if(alive())error.textContent=e.message;});}
    }
    root.addEventListener("click",event=>{const button=event.target.closest("[data-telegram-action]");if(button)act(button.dataset.telegramAction);});
    root.addEventListener("submit",async event=>{
      if(!event.target.matches("[data-telegram-preferences]"))return;event.preventDefault();if(busy)return;
      busy=true;error.textContent="";const form=new FormData(event.target);
      try {state=await request("preferences","PATCH",{enabled:form.has("enabled"),preferences:Object.fromEntries(["pairings","results","invitations","tournaments"].map(key=>[key,form.has(key)]))});render();error.textContent=tr("Настройки сохранены.","Settings saved.");}
      catch(e) {error.textContent=e.message;} finally{busy=false;}
    });
    refresh().catch(e=>{if(alive())error.textContent=e.message;});
  }
  window.KTTelegram={markup,mount};
})();

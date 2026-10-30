(function(){
  'use strict';
  const host=document.querySelector('.companion-tools');if(!host)return;
  const styles=document.createElement('link');styles.rel='stylesheet';styles.href='/companion-notifications.css?v=shared-8b51f3d2bb3c';document.head.append(styles);
  const panel=document.createElement('details');panel.className='shared-notifications';panel.hidden=true;
  const toggle=document.createElement('summary');toggle.setAttribute('aria-label','Уведомления');
  toggle.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>';
  const badge=document.createElement('span');badge.className='shared-notification-badge';badge.setAttribute('aria-hidden','true');toggle.append(badge);
  const popup=document.createElement('section');popup.className='shared-notification-popup';popup.setAttribute('aria-label','Уведомления');
  const heading=document.createElement('h2'),list=document.createElement('div'),status=document.createElement('p'),readAll=document.createElement('button');
  status.setAttribute('role','status');readAll.type='button';popup.append(heading,status,list,readAll);panel.append(toggle,popup);host.append(panel);
  let inbox=null,busy=null;
  const english=()=>window.KTAppearance?.locale==='en';
  const title=item=>item.title||({studio_review:english()?'New team review':'Новый обзор команды',studio_comment:english()?'New team discussion message':'Сообщение в обсуждении команды',game_challenge:english()?'Game challenge':'Вызов на игру',team_invitation:english()?'Team invitation':'Приглашение в команду',tournament_started:english()?'Tournament started':'Турнир начался',tournament_pairing:english()?'Your pairing is ready':'Опубликована ваша пара',team_tournament_pairing:english()?'Team pairing is ready':'Опубликована командная пара'})[item.type]||'KT Companion';
  function destination(item){try{const url=new URL(item.href?.startsWith('#/')?'/tournament'+item.href:item.href||'/',location.origin);return url.origin===location.origin?url.href:'/';}catch{return '/';}}
  async function api(path,body){const response=await fetch('/api/notifications'+path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!response.ok)throw Error(english()?'Notifications are temporarily unavailable':'Уведомления временно недоступны');return response.json();}
  function render(){
    heading.textContent=english()?'Notifications':'Уведомления';readAll.textContent=english()?'Mark all as read':'Прочитать все';
    const count=Math.max(0,Math.floor(Number(inbox?.unreadCount)||0));
    badge.hidden=count===0;badge.textContent=count>99?'99+':String(count);
    const label=heading.textContent+(count?': '+count:'');toggle.setAttribute('aria-label',label);toggle.title=label;
    popup.setAttribute('aria-label',heading.textContent);list.replaceChildren();
    readAll.hidden=!inbox?.items.length;readAll.disabled=!inbox?.unreadCount;
    for(const item of inbox?.items||[]){
      const link=document.createElement('a');link.href=destination(item);link.className=item.unread?'unread':'';link.dataset.uiSkip='';
      const name=document.createElement('strong');name.textContent=title(item);const info=document.createElement('span');
      info.textContent=[item.teamName||item.tournament?.name||item.team?.name,item.authorName||item.actor?.name,item.excerpt].filter(Boolean).join(' · ');
      const time=document.createElement('small');time.textContent=new Date(item.createdAt).toLocaleString(english()?'en':'ru');link.append(name,info,time);
      link.addEventListener('click',async event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();try{if(item.unread)await api('/read',{id:item.id});location.assign(link.href);}catch(error){status.textContent=error.message;}});
      list.append(link);
    }
    if(inbox&&!inbox.items.length)status.textContent=english()?'No notifications yet':'Пока нет уведомлений';
  }
  async function refresh(){if(busy)return busy;if(document.hidden)return;busy=(async()=>{try{inbox=await api('');status.textContent='';render();}catch(error){status.textContent=error.message;}})();try{await busy;}finally{busy=null;}}
  readAll.addEventListener('click',async()=>{if(!inbox)return;readAll.disabled=true;try{await api('/read',{through:inbox.generatedAt});await busy;await refresh();}catch(error){status.textContent=error.message;readAll.disabled=false;}});
  panel.addEventListener('toggle',()=>{if(panel.open)void refresh();});
  document.addEventListener('click',event=>{if(!panel.contains(event.target))panel.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.open){panel.open=false;toggle.focus();}});
  window.addEventListener('kt:locale',render);
  render();
  KTCompanion.ready.then(({user})=>{if(!user)return;panel.hidden=false;void refresh();setInterval(()=>void refresh(),30000);window.addEventListener('focus',refresh);}).catch(()=>{});
})();

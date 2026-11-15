(function(root){
'use strict';
const esc=value=>KTCards.esc(String(value??''));
const en=()=>root.KTUI?.locale()==='en',t=(ru,english)=>en()?english:ru;
const date=value=>new Date(value).toLocaleString(en()?'en-GB':'ru-RU');
const api=(url,options)=>root.KTReviews.transport.request(url,options);
let host,team,user,data,notify,editor,sequence=0,working=false,admin=false,sort='newest',reportMode=false,reportItems=[],reportCursor=null;
const base=()=>'/api/studio/library/'+team.id+'/comments';
const adminBase=()=>'/api/studio/admin/library/'+team.id;
const readBase=()=>admin?adminBase()+'/comments':base();
function newEditor(){return {body:'',original:'',targetId:null,editId:null,replyToId:null,revision:null,requestId:crypto.randomUUID()};}
function dirty(){return !!editor&&editor.body!==editor.original;}
function canLeave(){return !working&&(!dirty()||confirm(t('Потерять несохранённый текст сообщения?','Discard unsaved message text?')));}
function reset(){sequence++;host=null;team=null;data=null;editor=null;working=false;}
function countButton(count,id){return '<button type="button" data-open-discussion="'+esc(id)+'" data-ui-skip class="discussion-count">'+t('Обсуждение','Discussion')+' · '+(count||0)+'</button>';}
function status(message,error=false){const node=host?.querySelector('[data-discussion-status]');if(node){node.textContent=message;node.classList.toggle('review-error',error);}}
function failure(error){status(error.message,true);if(error.status===401){host?.querySelector('[data-discussion-status]')?.insertAdjacentHTML('beforeend',' <button type="button" data-discussion-action="login">'+t('Войти и продолжить','Sign in and continue')+'</button>');}}
function all(){return (data?.items||[]).flatMap(item=>[item,...(item.replies||[])]);}
function form(){
 if(!user||!data.canComment)return '';
 return '<form class="discussion-form"><label><b>'+ (editor.editId?t('Редактирование сообщения','Edit message'):editor.replyToId?t('Ответ для ','Reply to ')+esc(editor.replyName):t('Задать вопрос автору','Ask the team author'))+'</b><textarea name="body" rows="3" maxlength="2000" required placeholder="'+t('Вопрос о правилах, команде или игровом опыте','Ask about rules, the team or gameplay')+'">'+esc(editor.body)+'</textarea></label><div class="discussion-form-footer"><small data-discussion-length>'+editor.body.length+' / 2000</small><div><button type="submit" class="primary" data-discussion-submit>'+ (editor.editId?t('Сохранить','Save'):t('Отправить','Send'))+'</button>'+ (editor.targetId?'<button type="button" data-discussion-action="cancel">'+t('Отмена','Cancel')+'</button>':'')+'</div></div></form>';
}
function message(item){
 const author=item.author,available=!item.deleted&&!item.hidden;
 const avatar=author.avatarVersion?'<img class="review-avatar" src="/api/users/'+encodeURIComponent(author.id)+'/avatar?v='+encodeURIComponent(author.avatarVersion)+'" width="32" height="32" alt="" loading="lazy">':'<span class="review-avatar" aria-hidden="true">'+esc(author.name.slice(0,1))+'</span>';
 const name=author.id?'<a href="'+esc((root.KTCompanion.serviceUrl('tournament')||'/tournament')+'#/players/'+author.id)+'">'+esc(author.name)+'</a>':esc(t('Удалённый пользователь','Deleted user'));
 return '<article class="studio-comment '+(item.rootId?'comment-reply':'')+'" data-comment-id="'+item.id+'" id="comment-'+item.id+'" tabindex="-1"><div class="comment-header">'+avatar+'<div>'+name+(item.isTeamAuthor?'<span class="comment-author-badge">'+t('Автор команды','Team author')+'</span>':'')+'<small>'+esc(date(item.createdAt))+' · v'+esc(item.versionLabel)+(item.previousVersion?' · '+t('К предыдущей версии','Previous version'):'')+(item.updatedAt!==item.createdAt?' · '+t('изменено','edited'):'')+'</small></div></div>'+
 '<p class="review-text">'+(item.body!==null?esc(item.body):item.deleted?t('Комментарий удалён','Comment deleted'):t('Комментарий скрыт модератором','Hidden by a moderator'))+'</p>'+
 (item.hidden&&admin?'<p class="review-error">'+esc(item.moderationReason)+'</p>':'')+
 '<div class="comment-actions">'+(available?'<button type="button" data-discussion-action="link">'+t('Ссылка','Link')+'</button>':'')+
 (available&&!data.locked?'<button type="button" data-discussion-action="reply">'+t('Ответить','Reply')+'</button>':'')+
 (item.canEdit?'<button type="button" data-discussion-action="edit">'+t('Редактировать','Edit')+'</button>':'')+
 (item.canDelete?'<button type="button" data-discussion-action="delete">'+t('Удалить','Delete')+'</button>':'')+
 (available&&author.id!==user?.id?'<button type="button" data-discussion-action="report">'+t('Пожаловаться','Report')+'</button>':'')+
 (user?.isAdmin?(!item.deleted?'<button type="button" data-discussion-action="moderate">'+(item.hidden?t('Восстановить','Restore'):t('Скрыть','Hide'))+'</button>':'')+'<button type="button" data-discussion-action="history">'+t('История','History')+'</button>':'')+'</div>'+
 (editor?.targetId===item.id?form():'')+'</article>';
}
function render(){
 if(!host||!data)return;
 host.innerHTML='<div class="review-heading"><h2>'+t('Обсуждение','Discussion')+' · '+data.count+'</h2><button type="button" data-discussion-action="refresh">'+t('Обновить','Refresh')+'</button></div><p class="review-note">'+t('Задавайте вопросы автору и обсуждайте команду. Оценки не нужны.','Ask the author questions and discuss the team. No rating required.')+'</p><div data-discussion-status role="status" aria-live="polite"></div>'+
 (data.locked?'<p class="review-lock">'+t('Обсуждение закрыто: ','Discussion closed: ')+esc(data.lockReason)+'</p>':'')+
 (!user?'<p>'+t('Войдите, чтобы участвовать в обсуждении.','Sign in to join the discussion.')+'</p><button type="button" class="primary" data-discussion-action="login">'+t('Войти','Sign in')+'</button>':!editor.targetId?form():'')+
 (user?'<details class="review-settings"><summary>'+t('Уведомления','Notifications')+'</summary><label class="review-check"><input type="checkbox" data-discussion-pref '+(data.notifications!==false?'checked':'')+'>'+t('Комментарии и обзоры Студии','Studio comments and reviews')+'</label><button type="button" data-discussion-action="inbox">'+t('Открыть уведомления','Open inbox')+'</button><div data-discussion-inbox></div></details>':'')+
 '<div class="discussion-tools"><label>'+t('Порядок сообщений','Message order')+'<select data-discussion-sort><option value="newest" '+(sort==='newest'?'selected':'')+'>'+t('Сначала новые','Newest first')+'</option><option value="oldest" '+(sort==='oldest'?'selected':'')+'>'+t('Сначала старые','Oldest first')+'</option></select></label>'+
 (user?.isAdmin?'<button type="button" data-discussion-action="admin">'+(admin?t('Публичное обсуждение','Public discussion'):t('Модерация','Moderation'))+'</button><button type="button" data-discussion-action="reports">'+t('Жалобы на комментарии','Comment reports')+'</button><button type="button" data-discussion-action="lock">'+(data.locked?t('Открыть обсуждение','Reopen discussion'):t('Закрыть обсуждение','Close discussion'))+'</button>':'')+'</div>'+
 '<div data-discussion-list>'+(data.items.length?data.items.map(thread=>'<section class="discussion-thread">'+message(thread)+'<div class="comment-replies">'+thread.replies.map(message).join('')+'</div>'+(thread.repliesCursor?'<button type="button" data-discussion-action="replies" data-root-id="'+thread.id+'">'+t('Ещё ответы','More replies')+' ('+thread.replyCount+')</button>':'')+'</section>').join(''):'<p class="community-empty">'+t('Пока нет комментариев. Начните обсуждение команды.','No comments yet. Start the discussion.')+'</p>')+'</div>'+
 (data.nextCursor?'<button type="button" data-discussion-action="more">'+t('Показать ещё','Show more')+'</button>':'');
 validate();
}
function validate(){const button=host?.querySelector('[data-discussion-submit]');if(button)button.disabled=working||!editor.body.trim();const counter=host?.querySelector('[data-discussion-length]');if(counter)counter.textContent=editor.body.length+' / 2000';}
async function load({more=false,focus=null}={}){
 const token=++sequence;
 try{
  const result=await api(readBase()+'?sort='+sort+(more&&data?.nextCursor?'&cursor='+encodeURIComponent(data.nextCursor):''));
  if(token!==sequence)return;
  if(more)result.items=[...data.items,...result.items.filter(item=>!data.items.some(old=>old.id===item.id))];
  result.notifications=data?.notifications??true;data=result;notify?.(data.count);
  if(user){const pref=await api('/api/studio/review-preferences');if(token!==sequence)return;data.notifications=pref.notifications;}
  let focusError;
  if(focus){try{const result=await api(readBase()+'/'+encodeURIComponent(focus)+'/context');if(token!==sequence)return;data.items=data.items.filter(item=>item.id!==result.thread.id);data.items.unshift(result.thread);}catch(error){focusError=error;}}
  if(token!==sequence)return;reportMode=false;render();if(focusError)failure(focusError);
  if(focus&&!focusError){const node=document.getElementById('comment-'+focus);node?.scrollIntoView({block:'center'});node?.focus();node?.classList.add('review-highlight');setTimeout(()=>node?.classList.remove('review-highlight'),2500);}
 }catch(error){if(token!==sequence)return;if(!host.querySelector('[data-discussion-status]'))host.innerHTML='<div data-discussion-status role="status"></div><button type="button" data-discussion-action="refresh">'+t('Повторить','Retry')+'</button>';failure(error);}
}
async function open(element,publication,callback,focus){
 sequence++;host=element;team=publication;notify=callback;data=null;editor=newEditor();admin=false;sort='newest';reportMode=false;host.dataset.uiSkip='';
 host.innerHTML='<p>'+t('Загружаю обсуждение…','Loading discussion…')+'</p>';const token=sequence;
 try{user=await root.KTReviews.transport.identity();if(token===sequence)await load({focus});}catch(error){if(token===sequence){host.innerHTML='<div data-discussion-status role="status"></div><button type="button" data-discussion-action="refresh">'+t('Повторить','Retry')+'</button>';failure(error);}}
}
async function login(){if(await root.KTStudioLogin.open('discussion')){user=await root.KTReviews.transport.identity();root.KTCompanion.changed();await load();return true;}return false;}
async function submit(event){
 event.preventDefault();if(working||!editor.body.trim())return;working=true;validate();
 try{const result=await api(base()+(editor.editId?'/'+editor.editId:''),{method:editor.editId?'PATCH':'POST',body:{body:editor.body,revision:editor.revision,replyToCommentId:editor.replyToId,clientRequestId:editor.requestId}});editor=newEditor();await load({focus:result.id});}
 catch(error){failure(error);if(error.status===409&&editor.editId){host.querySelector('[data-discussion-status]').insertAdjacentHTML('beforeend',' <button type="button" data-discussion-action="reconcile">'+t('Сверить актуальный комментарий','Review current comment')+'</button>');}}
 finally{working=false;validate();}
}
async function showReports(more=false){
 const result=await api('/api/studio/admin/comment-reports'+(more&&reportCursor?'?cursor='+encodeURIComponent(reportCursor):''));
 reportItems=more?[...reportItems,...result.items]:result.items;reportCursor=result.nextCursor;reportMode=true;
 host.querySelector('[data-discussion-list]').innerHTML=reportItems.map(item=>'<article class="studio-comment" data-comment-report="'+item.id+'"><h3>'+esc(item.team_name)+'</h3><p class="review-text">'+esc(item.body)+'</p><p>'+esc(item.reporter_name||'—')+' · '+esc(item.reason)+' · '+esc(item.details)+'</p><div class="comment-actions"><button type="button" data-discussion-action="dismiss-report">'+t('Нарушения нет','No violation')+'</button>'+(!item.deleted_at&&!item.hidden_at?'<button type="button" data-discussion-action="hide-report">'+t('Скрыть комментарий','Hide comment')+'</button>':'')+'</div></article>').join('')||'<p>'+t('Жалоб нет.','No reports.')+'</p>';
 host.querySelector('[data-discussion-action="more"]')?.remove();if(reportCursor)host.insertAdjacentHTML('beforeend','<button type="button" data-discussion-action="more">'+t('Показать ещё','Show more')+'</button>');
}
document.addEventListener('submit',event=>{if(host?.contains(event.target)&&event.target.matches('.discussion-form'))void submit(event);});
document.addEventListener('input',event=>{if(host?.contains(event.target)&&event.target.matches('.discussion-form textarea')){editor.body=event.target.value;validate();}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&host?.contains(event.target)&&event.target.closest('.discussion-form')){event.preventDefault();event.target.closest('form').requestSubmit();}});
document.addEventListener('change',async event=>{
 if(!host?.contains(event.target))return;
 if(event.target.matches('[data-discussion-sort]')){if(!canLeave()){event.target.value=sort;return;}sort=event.target.value;editor=newEditor();await load();}
 if(event.target.matches('[data-discussion-pref]')){try{await api('/api/studio/review-preferences',{method:'PATCH',body:{notifications:event.target.checked}});data.notifications=event.target.checked;}catch(error){event.target.checked=!event.target.checked;failure(error);}}
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-discussion-action]');if(!button||!host?.contains(button)||working)return;
 const action=button.dataset.discussionAction,item=all().find(row=>row.id===button.closest('[data-comment-id]')?.dataset.commentId);
 try{
  if(action==='login'){await login();return;}
  if(action==='cancel'){if(canLeave()){editor=newEditor();render();}return;}
  if(action==='reply'||action==='edit'){
   if(!canLeave())return;if(!user&&!await login())return;
   editor=newEditor();editor.targetId=item.id;
   if(action==='edit'){Object.assign(editor,{editId:item.id,body:item.body,original:item.body,revision:item.revision});}
   else{editor.replyToId=item.id;editor.replyName=item.author.name;}
   reportMode=false;render();host.querySelector('textarea')?.focus();return;
  }
  if(action==='reconcile'){
   const result=await api(base()+'/'+editor.editId+'/context');const current=[result.thread,...result.thread.replies].find(row=>row.id===editor.editId);
   if(!current?.canEdit)throw Error(t('Комментарий больше нельзя редактировать. Скопируйте свой текст.','This comment is no longer editable. Copy your text.'));
   if(confirm(t('Актуальный текст:\n','Current text:\n')+current.body+t('\n\nСохранить ваш текст поверх этой версии?','\n\nKeep your text to replace this version?'))){editor.revision=current.revision;status(t('Проверьте свой текст и нажмите «Сохранить».','Check your text and press Save.'));}return;
  }
  if(action==='refresh'||action==='admin'||action==='reports'){if(!canLeave())return;editor=newEditor();if(action==='admin')admin=!admin;await load();if(action==='reports')await showReports();return;}
  if(action==='more'){working=true;await(reportMode?showReports(true):load({more:true}));return;}
  if(action==='replies'){
   working=true;
   const thread=data.items.find(row=>row.id===button.dataset.rootId);const result=await api(readBase()+'/'+thread.id+'/replies?cursor='+encodeURIComponent(thread.repliesCursor));
   thread.replies=[...thread.replies,...result.items.filter(item=>!thread.replies.some(old=>old.id===item.id))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));thread.repliesCursor=result.nextCursor;render();return;
  }
  if(action==='link'){await navigator.clipboard.writeText(new URL('/studio#/library/'+team.id+'/discussion?comment='+item.id,location.origin).href);status(t('Ссылка скопирована.','Link copied.'));return;}
  if(action==='inbox'){
   working=true;
   const response=await fetch('/api/notifications',{credentials:'same-origin'});const result=await response.json();if(!response.ok)throw Error(result.error);
   const rows=result.items.filter(item=>item.type==='studio_comment'||item.type==='studio_review');
   host.querySelector('[data-discussion-inbox]').innerHTML=rows.length?rows.map(item=>/^\/studio#\/library\/[0-9a-f-]{36}\/(discussion\?comment=|reviews\?review=)[0-9a-f-]{36}$/.test(item.href)?'<p><a href="'+esc(item.href)+'" data-discussion-notification="'+esc(item.id)+'">'+esc(item.teamName)+' · '+esc(item.authorName)+'</a></p>':'').join(''):'<p>'+t('Новых уведомлений Студии среди последних сообщений нет.','No Studio notifications in the recent inbox.')+'</p>';return;
  }
  if(action==='history'){
   working=true;
   const result=await api(adminBase()+'/comments/'+item.id+'/history');const dialog=document.createElement('dialog');dialog.className='review-reason';dialog.dataset.uiSkip='';dialog.innerHTML='<h2>'+t('История сообщения','Message history')+'</h2><p>'+t('Последние 100 событий','Latest 100 events')+'</p>'+result.items.map(row=>'<details><summary>'+esc(date(row.created_at))+' · '+esc(row.action)+' · #'+esc(row.actor_id)+'</summary><p class="review-text">'+esc(row.snapshot?.body||'')+'</p><p>'+esc(row.reason)+'</p></details>').join('')+'<button>'+t('Закрыть','Close')+'</button>';document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.showModal();return;
  }
  if(action==='report'&&!user){await login();return;}
  if(['delete','moderate','lock','hide-report','dismiss-report'].includes(action)&&!canLeave())return;
  let input;
  if(action==='delete'){if(!confirm(t('Удалить комментарий? Ответы других участников сохранятся.','Delete this comment? Other replies will remain.')))return;input={revision:item.revision};}
  else{input=await root.KTReviews.reasonDialog(button.textContent,action==='report');if(!input)return;}
  working=true;
  if(action==='delete')await api(base()+'/'+item.id,{method:'DELETE',body:input});
  if(action==='report')await api(base()+'/'+item.id+'/reports',{method:'POST',body:input});
  if(action==='moderate')await api(adminBase()+'/comments/'+item.id+'/moderation',{method:'POST',body:{hidden:!item.hidden,revision:item.revision,reason:input.reason}});
  if(action==='lock')await api(adminBase()+'/discussion',{method:'PATCH',body:{locked:!data.locked,reason:input.reason}});
  if(action==='dismiss-report'||action==='hide-report'){
   const report=reportItems.find(row=>row.id===button.closest('[data-comment-report]').dataset.commentReport);
   if(action==='dismiss-report')await api('/api/studio/admin/comment-reports/'+report.id,{method:'PATCH',body:{reason:input.reason}});
   else await api('/api/studio/admin/library/'+report.publication_id+'/comments/'+report.comment_id+'/moderation',{method:'POST',body:{hidden:true,revision:report.revision,reason:input.reason}});
   await showReports();return;
  }
  if(action!=='report')editor=newEditor();
  await load();if(action==='report')status(t('Жалоба отправлена.','Report sent.'));
 }catch(error){failure(error);}finally{working=false;validate();}
});
document.addEventListener('click',event=>{const link=event.target.closest('[data-discussion-notification]');if(!host?.contains(link))return;void fetch('/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({id:link.dataset.discussionNotification}),keepalive:true});});
root.addEventListener('beforeunload',event=>{if(dirty()||working){event.preventDefault();event.returnValue='';}});
root.addEventListener('kt:locale',()=>{if(host&&data&&!reportMode)render();});
root.KTDiscussion={open,canLeave,reset,countButton};
})(window);

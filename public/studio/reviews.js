(function(root){
'use strict';
const esc=value=>KTCards.esc(String(value??''));
const english=()=>root.KTUI?.locale()==='en';
const t=(ru,en)=>english()?en:ru;
const number=value=>value==null?'—':Number(value).toLocaleString(english()?'en-US':'ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1});
const date=value=>new Date(value).toLocaleString(english()?'en-GB':'ru-RU');
let host,team,onSummary,data,user,csrf,sequence=0,working=false,editing=null,draft=null,initial='',adminMode=false,reportMode=false,targetId=null;
const path=()=>'/api/studio/library/'+encodeURIComponent(team.id)+'/reviews';
const adminPath=()=>'/api/studio/admin/library/'+encodeURIComponent(team.id);
async function identity(){user=(await root.KTCompanion.session()).user;csrf=null;return user}
async function request(url,options={}){
 const headers={};
 if(user)headers['X-Studio-Account']=String(user.id);
 if(options.method&&options.method!=='GET'){
  if(!user){const error=Error(t('Войдите, чтобы продолжить.','Sign in to continue.'));error.status=401;throw error}
  if(!csrf){const response=await fetch('/api/studio/session',{credentials:'same-origin',headers});const result=await response.json();if(!response.ok){const e=Error(result.error);e.status=response.status;throw e}csrf=result.csrfToken}
  headers['X-CSRF-Token']=csrf;headers['Content-Type']='application/json';
 }
 const response=await fetch(url,{...options,headers,credentials:'same-origin',body:options.body?JSON.stringify(options.body):undefined});
 const result=await response.json();
 if(!response.ok){const error=Error(result.error||t('Не удалось выполнить запрос.','Request failed.'));error.status=response.status;if(response.status===401||response.status===403)csrf=null;throw error}
 return result;
}
function summary(value,publicationId){
 const rating=value||{count:0};
 const block=(label,scores)=>'<span class="review-summary-section"><b>'+esc(label)+'</b><strong>'+(scores?.count?'★ '+number(scores.overallAverage)+' / 5 · '+t('Оценок: ','Ratings: ')+scores.count:t('Нет оценок','No ratings'))+'</strong><span>'+t('Тема','Theme')+' '+number(scores?.themeAverage)+' · '+t('Баланс','Balance')+' '+number(scores?.balanceAverage)+' · '+t('Лор','Lore')+' '+number(scores?.loreAverage)+'</span></span>';
 return '<button type="button" class="review-summary" data-open-reviews="'+esc(publicationId)+'" data-ui-skip>'+block(t('Текущая версия','Current version')+' · '+(rating.currentVersion?.versionLabel||'—'),rating.currentVersion)+block(t('За всё время','All versions'),rating.overall||rating)+'<span>'+t('Обзоров: ','Reviews: ')+rating.count+'</span></button>';
}
function updateSummary(value){team.ratingSummary=value;onSummary?.(value);}
function errorMessage(error){
 const target=host?.querySelector('[data-review-status]');if(!target)return;
 target.textContent=error.message;target.classList.add('review-error');
 if(error.status===401){const button=document.createElement('button');button.type='button';button.dataset.reviewAction='login';button.textContent=t('Войти и продолжить','Sign in and continue');target.append(' ',button)}
}
function dirty(){return !!draft&&JSON.stringify(draft)!==initial}
function canLeave(){return !working&&(!dirty()||confirm(t('Закрыть форму и потерять несохранённые изменения?','Discard unsaved review changes?')))}
function discard(){draft=null;editing=null;initial='';}
function reset(){++sequence;discard();host=null;team=null;data=null;working=false;}
function profile(author){return (root.KTCompanion?.serviceUrl('tournament')||'/tournament')+'#/players/'+encodeURIComponent(author.id)}
function versionHistory(review){
 const ratings=review.versionRatings||[];
 if(ratings.length<2)return '';
 return '<details class="review-version-history"><summary>'+t('Оценки по версиям','Ratings by version')+'</summary><ul>'+ratings.map(item=>'<li><b>'+esc(item.versionLabel)+'</b> · '+t('Тема','Theme')+' '+item.themeScore+' / 5 · '+t('Баланс','Balance')+' '+item.balanceScore+' / 5 · '+t('Лор','Lore')+' '+item.loreScore+' / 5</li>').join('')+'</ul></details>';
}
function card(review){
 const own=user?.id===review.author.id;
 const avatar=review.author.avatarVersion?'<img class="review-avatar" src="/api/users/'+encodeURIComponent(review.author.id)+'/avatar?v='+encodeURIComponent(review.author.avatarVersion)+'" alt="" width="36" height="36" loading="lazy">':'<span class="review-avatar" aria-hidden="true">'+esc(review.author.name.slice(0,1).toUpperCase())+'</span>';
 const text=esc(review.body||'');
 const content=review.body?.length>650?'<details class="review-full"><summary>'+t('Читать полностью','Read full review')+'</summary><p>'+text+'</p></details><p class="review-excerpt">'+esc(review.body.slice(0,350))+'…</p>':'<p class="review-text">'+text+'</p>';
 return '<article class="studio-review" id="review-'+esc(review.id)+'" tabindex="-1" data-review-id="'+esc(review.id)+'"><header><a class="review-author" href="'+esc(profile(review.author))+'">'+avatar+esc(review.author.name)+'</a><time datetime="'+esc(review.createdAt)+'">'+esc(date(review.createdAt))+'</time></header><div class="review-version">v'+esc(review.versionLabel)+(review.previousVersion?' · '+t('К предыдущей версии','Previous version'):'')+(review.updatedAt!==review.createdAt?' · '+t('изменено','edited'):'')+'</div><div class="review-scores">'+[['themeScore',t('Тема','Theme')],['balanceScore',t('Баланс','Balance')],['loreScore',t('Лор','Lore')]].map(([key,label])=>'<span>'+label+' <b>★ '+review[key]+' / 5</b></span>').join('')+'</div>'+versionHistory(review)+content+(review.hidden?'<p class="review-error">'+t('Скрыто: ','Hidden: ')+esc(review.moderationReason)+'</p>':'')+'<footer><button type="button" data-review-action="link">'+t('Ссылка','Link')+'</button>'+(review.canEdit?'<button type="button" data-review-action="edit">'+t('Редактировать','Edit')+'</button>':'')+(review.canDelete?'<button type="button" data-review-action="delete">'+t('Удалить','Delete')+'</button>':'')+(!own&&!review.hidden?'<button type="button" data-review-action="report">'+t('Пожаловаться','Report')+'</button>':'')+(user?.isAdmin?'<button type="button" data-review-action="moderate">'+(review.hidden?t('Восстановить','Restore'):t('Скрыть','Hide'))+'</button><button type="button" data-review-action="history">'+t('История','History')+'</button>':'')+'</footer></article>';
}
function form(){
 if(!draft)return '';
 const fields=[['themeScore',t('Тема','Theme'),t('Идея, характер и игровые механики команды','Team identity, concept and mechanics')],['balanceScore',t('Баланс','Balance'),t('Сила, ограничения и контригра','Power, limitations and counterplay')],['loreScore',t('Лор','Lore'),t('История и описание команды','Team history and background')]];
 return '<form class="review-form"><p data-rated-version>'+t('Оценка версии: ','Rating version: ')+esc(editing&&!draft.reevaluate?editing.versionLabel:data.currentVersionLabel)+'</p><h3>'+ (editing?t('Изменить обзор','Edit review'):t('Новый обзор','New review'))+'</h3><div class="review-rating-fields">'+fields.map(([key,label,hint])=>'<fieldset><legend>'+label+'</legend><p>'+hint+'</p><div class="review-stars">'+[1,2,3,4,5].map(value=>'<label><input type="radio" name="'+key+'" value="'+value+'" required '+(draft[key]===value?'checked':'')+'><span aria-hidden="true">★ '+value+'</span><span class="review-sr">'+value+' '+t('из 5','of 5')+'</span></label>').join('')+'</div></fieldset>').join('')+'</div><label>'+t('Ваш обзор','Your review')+'<textarea name="body" rows="6" maxlength="5000" required placeholder="'+t('Расскажите о впечатлениях от команды','Share your experience with this team')+'">'+esc(draft.body)+'</textarea></label><small data-review-length>'+draft.body.length+' / 5000</small>'+(editing?.previousVersion?'<label class="review-check"><input type="checkbox" name="reevaluate" '+(draft.reevaluate?'checked':'')+'>'+t('Переоценить текущую версию','Reassess the current version')+'</label>':'')+'<p>'+t('Ваши оценки войдут в рейтинг команды.','Your scores will contribute to the team rating.')+'</p><div class="review-actions"><button type="submit" class="primary" data-review-submit>'+t('Сохранить обзор','Save review')+'</button><button type="button" data-review-action="cancel">'+t('Отмена','Cancel')+'</button></div></form>';
}
function render(){
 if(!host||!data)return;
 host.dataset.uiSkip='';
 const mine=data.myReview;
 host.innerHTML='<div class="review-heading"><h2>'+t('Обзоры','Reviews')+'</h2><button type="button" data-review-action="refresh">'+t('Обновить','Refresh')+'</button></div>'+summary(data.ratingSummary,team.id)+'<p class="review-note">'+t('Одна оценка на пользователя и версию · Сначала новые','One rating per user and version · Newest first')+'</p>'+(data.locked?'<p class="review-lock">'+t('Обсуждение закрыто модератором: ','Discussion closed by a moderator: ')+esc(data.lockReason)+'</p>':'')+'<div data-review-status role="status" aria-live="polite"></div>'+
 (!user?'<p>'+t('Войдите, чтобы написать обзор.','Sign in to write a review.')+'</p><button type="button" data-review-action="login" class="primary">'+t('Войти','Sign in')+'</button>':(data.isOwner?'<p>'+t('Вы автор команды. Оценивать собственную команду нельзя.','You own this team and cannot rate it.')+'</p>':mine?.hidden?'<p class="review-lock">'+t('Ваш обзор скрыт модератором: ','Your review was hidden by a moderator: ')+esc(mine.moderationReason)+'</p>':!draft&&(data.canReview||mine?.canEdit)?'<button type="button" data-review-action="new" class="primary">'+(mine?t('Изменить мой обзор','Edit my review'):t('Написать обзор','Write a review'))+'</button>':''))+
 (user?'<details class="review-settings"><summary>'+t('Настройки уведомлений','Notification settings')+'</summary><label class="review-check"><input type="checkbox" data-review-preference '+(data.notifications!==false?'checked':'')+'>'+t('Комментарии и обзоры Студии','Studio comments and reviews')+'</label></details>':'')+form()+
 (user?.isAdmin?'<div class="review-admin"><button type="button" data-review-action="admin">'+(adminMode?t('Публичные обзоры','Public reviews'):t('Модерация обзоров','Moderate reviews'))+'</button><button type="button" data-review-action="reports">'+t('Жалобы на обзоры','Review reports')+'</button><button type="button" data-review-action="lock">'+(data.locked?t('Открыть обсуждение','Reopen discussion'):t('Закрыть обсуждение','Close discussion'))+'</button></div>':'')+
 '<div data-review-list>'+(data.items.length?data.items.map(card).join(''):'<p class="community-empty">'+t('Пока нет обзоров. Поделитесь первыми впечатлениями.','No reviews yet. Share your first impressions.')+'</p>')+'</div>'+(data.nextCursor?'<button type="button" data-review-action="more">'+t('Показать ещё','Show more')+'</button>':'');
 validateForm();
}
function validateForm(){const form=host?.querySelector('form.review-form');if(!form)return;form.querySelector('[data-review-submit]').disabled=working||!draft?.body.trim()||!['themeScore','balanceScore','loreScore'].every(key=>draft[key]>=1&&draft[key]<=5);form.querySelector('[data-review-length]').textContent=draft.body.length+' / 5000';}
async function load(more=false){
 const current=++sequence,base=path(),cursor=more?data?.nextCursor:null;
 try{
  if(!more){const result=await request(base);if(current!==sequence)return;data=result;
   if(user){const pref=await request('/api/studio/review-preferences');if(current!==sequence)return;data.notifications=pref.notifications}
   updateSummary(data.ratingSummary);
  }
  if(adminMode||more){const result=await request((adminMode?adminPath()+'/reviews':base)+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(current!==sequence)return;data.items=more?[...data.items,...result.items.filter(item=>!data.items.some(old=>old.id===item.id))]:result.items;data.nextCursor=result.nextCursor}
  if(targetId&&!more){const item=await request(base+'/'+encodeURIComponent(targetId));if(current!==sequence)return;if(!data.items.some(row=>row.id===item.id))data.items.unshift(item)}
  render();
  if(targetId){const node=document.getElementById('review-'+targetId);node?.scrollIntoView({block:'center'});node?.focus();node?.classList.add('review-highlight');setTimeout(()=>node?.classList.remove('review-highlight'),3000);targetId=null}
 }catch(error){if(current!==sequence)return;if(!host.querySelector('[data-review-status]'))host.innerHTML='<div data-review-status role="status"></div><button type="button" data-review-action="refresh">'+t('Повторить','Retry')+'</button>';else if(data&&!draft)render();targetId=null;errorMessage(error)}
}
async function open(element,publication,callback,focusId){
 ++sequence;host=element;team=publication;onSummary=callback;data=null;discard();adminMode=false;reportMode=false;targetId=focusId||null;
 host.dataset.uiSkip='';host.innerHTML='<p>'+t('Загружаю обзоры…','Loading reviews…')+'</p>';
 const current=sequence;try{await identity();if(current!==sequence)return;await load()}catch(error){if(current===sequence){host.innerHTML='<div data-review-status role="status"></div><button type="button" data-review-action="refresh">'+t('Повторить','Retry')+'</button>';errorMessage(error)}}
}
function startForm(review){reportMode=false;editing=review||null;draft={body:review?.body||'',themeScore:review?.themeScore||0,balanceScore:review?.balanceScore||0,loreScore:review?.loreScore||0,reevaluate:false,versionLabel:data.currentVersionLabel,clientRequestId:crypto.randomUUID()};initial=JSON.stringify(draft);render();host.querySelector('textarea')?.focus()}
async function login(){if(await root.KTStudioLogin.open('review')){await identity();root.KTCompanion.changed();await load()}}
function reasonDialog(title,reporting=false){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='review-reason';dialog.dataset.uiSkip='';
  dialog.innerHTML='<form><h2>'+esc(title)+'</h2>'+(reporting?'<label>'+t('Причина','Reason')+'<select name="reason"><option value="spam">'+t('Спам','Spam')+'</option><option value="abuse">'+t('Оскорбления','Abuse')+'</option><option value="other">'+t('Другое','Other')+'</option></select></label>':'')+'<label>'+t('Пояснение','Explanation')+'<textarea name="details" maxlength="500" rows="4" '+(reporting?'':'required')+'></textarea></label><div class="review-actions"><button type="submit" class="primary">'+t('Подтвердить','Confirm')+'</button><button type="button">'+t('Отмена','Cancel')+'</button></div></form>';
  let value=null;document.body.append(dialog);dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const f=event.target;if(!reporting&&!f.elements.details.value.trim())return;value={reason:reporting?f.elements.reason.value:f.elements.details.value.trim(),details:f.elements.details.value.trim()};dialog.close()};dialog.querySelector('button[type="button"]').onclick=()=>dialog.close();dialog.onclose=()=>{dialog.remove();resolve(value)};dialog.showModal();
 });
}
async function submit(event){
 if(!event.target.matches('.review-form'))return;event.preventDefault();if(working)return;
 working=true;validateForm();
 try{const result=await request(path()+(editing?'/'+editing.id:''),{method:editing?'PATCH':'POST',body:{...draft,...(editing?{revision:editing.revision}:{})}});discard();updateSummary(result.ratingSummary);await load()}
 catch(error){errorMessage(error);if(error.status===409){const status=host.querySelector('[data-review-status]');const button=document.createElement('button');button.type='button';button.dataset.reviewAction='reconcile';button.textContent=t('Загрузить актуальный обзор, сохранив мой текст','Load current review, keeping my text');status.append(' ',button)}}
 finally{working=false;validateForm()}
}
async function reports(more=false){
 const result=await request('/api/studio/admin/review-reports'+(more&&data.reportCursor?'?cursor='+encodeURIComponent(data.reportCursor):''));
 reportMode=true;data.reportCursor=result.nextCursor;
 const markup=result.items.map(item=>'<article class="studio-review" data-report-id="'+esc(item.id)+'" data-report-team="'+esc(item.publication_id)+'" data-report-review="'+esc(item.review_id)+'" data-report-revision="'+item.revision+'"><h3>'+esc(item.team_name)+'</h3><p class="review-text">'+esc(item.body)+'</p><p>'+esc(item.reporter_name)+': '+esc(item.reason)+' — '+esc(item.details)+'</p><footer><button type="button" data-review-action="dismiss-report">'+t('Нарушения нет','No violation')+'</button>'+(!item.deleted_at&&!item.hidden_at?'<button type="button" data-review-action="hide-report">'+t('Скрыть обзор','Hide review')+'</button>':'')+'</footer></article>').join('')||'<p>'+t('Открытых жалоб нет.','No open reports.')+'</p>';
 if(more)host.querySelector('[data-review-list]').insertAdjacentHTML('beforeend',markup);else host.querySelector('[data-review-list]').innerHTML=markup;
 let button=host.querySelector('[data-review-action="more"]');if(button)button.remove();if(result.nextCursor)host.insertAdjacentHTML('beforeend','<button type="button" data-review-action="more">'+t('Показать ещё','Show more')+'</button>');
}
document.addEventListener('input',event=>{if(!host?.contains(event.target)||!draft)return;const f=event.target.closest('.review-form');if(!f)return;draft.body=f.elements.body.value;for(const key of ['themeScore','balanceScore','loreScore'])draft[key]=Number(f.elements[key].value)||0;draft.reevaluate=!!f.elements.reevaluate?.checked;f.querySelector('[data-rated-version]').textContent=t('Оценка версии: ','Rating version: ')+(editing&&!draft.reevaluate?editing.versionLabel:draft.versionLabel);validateForm()});
document.addEventListener('submit',event=>{if(host?.contains(event.target))void submit(event)});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&host?.contains(event.target)&&event.target.closest('.review-form')){event.preventDefault();event.target.closest('form').requestSubmit()}});
document.addEventListener('change',async event=>{if(!host?.contains(event.target)||!event.target.matches('[data-review-preference]'))return;try{await request('/api/studio/review-preferences',{method:'PATCH',body:{notifications:event.target.checked}});data.notifications=event.target.checked}catch(error){event.target.checked=!event.target.checked;errorMessage(error)}});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-review-action]');if(!button||!host?.contains(button)||working)return;
 const action=button.dataset.reviewAction,review=data?.items.find(row=>row.id===button.closest('[data-review-id]')?.dataset.reviewId);
 try{
  if(action==='login'){await login();return}
  if(action==='new'||action==='edit'){if(canLeave())startForm(review||data.myReview);return}
  if(action==='cancel'){if(canLeave()){discard();render()}return}
  if(action==='reconcile'){const result=await request(path());data.myReview=result.myReview;if(!result.myReview||result.myReview.hidden)throw Error(t('Обзор удалён или скрыт. Скопируйте ваш текст перед обновлением.','Review removed or hidden. Copy your text before refreshing.'));editing=result.myReview;errorMessage({message:t('Ревизия обновлена. Проверьте свой текст и сохраните ещё раз.','Revision refreshed. Check your text and save again.')});return}
  if(action==='link'){await navigator.clipboard.writeText(new URL('/studio#/library/'+team.id+'/reviews?review='+review.id,location.origin).href);errorMessage({message:t('Ссылка скопирована.','Link copied.')});return}
  if(action==='refresh'||action==='admin'||action==='reports'){if(!canLeave())return;discard();reportMode=false;if(action==='admin')adminMode=!adminMode;if(action==='reports'){await reports();return}await load();return}
  if(action==='more'){await (reportMode?reports(true):load(true));return}
  if(action==='history'){const result=await request(adminPath()+'/reviews/'+review.id+'/history');const panel=document.createElement('dialog');panel.className='review-reason';panel.dataset.uiSkip='';panel.innerHTML='<h2>'+t('История обзора','Review history')+'</h2><p>'+t('Последние 100 событий','Latest 100 events')+'</p>'+result.items.map(item=>'<details><summary>'+esc(date(item.created_at))+' · '+esc(item.action)+' · #'+esc(item.actor_id)+'</summary><p class="review-text">'+esc(item.snapshot?.body||'')+'</p><p>'+esc(item.reason)+'</p><p>'+esc(JSON.stringify({theme:item.snapshot?.theme_score,balance:item.snapshot?.balance_score,lore:item.snapshot?.lore_score}))+'</p></details>').join('')+'<button>'+t('Закрыть','Close')+'</button>';document.body.append(panel);panel.querySelector('button').onclick=()=>panel.close();panel.onclose=()=>panel.remove();panel.showModal();return}
  let input;
  if(action==='delete'){if(!confirm(t('Удалить обзор и исключить оценки из рейтинга?','Delete this review and remove its scores?')))return;input={revision:review.revision}}
  else{input=await reasonDialog(button.textContent,action==='report');if(!input)return}
  working=true;
  if(action==='delete')await request(path()+'/'+review.id,{method:'DELETE',body:input});
  if(action==='report')await request(path()+'/'+review.id+'/reports',{method:'POST',body:input});
  if(action==='moderate')await request(adminPath()+'/reviews/'+review.id+'/moderation',{method:'POST',body:{hidden:!review.hidden,revision:review.revision,reason:input.reason}});
  if(action==='lock')await request(adminPath()+'/discussion',{method:'PATCH',body:{locked:!data.locked,reason:input.reason}});
  if(action==='dismiss-report'||action==='hide-report'){
   const entry=button.closest('[data-report-id]').dataset;
   if(action==='dismiss-report')await request('/api/studio/admin/review-reports/'+entry.reportId,{method:'PATCH',body:{reason:input.reason}});
   else await request('/api/studio/admin/library/'+entry.reportTeam+'/reviews/'+entry.reportReview+'/moderation',{method:'POST',body:{hidden:true,revision:Number(entry.reportRevision),reason:input.reason}});
   await reports();return;
  }
  await load();if(action==='report')errorMessage({message:t('Жалоба отправлена модератору.','Report sent to moderation.')});
 }catch(error){errorMessage(error)}finally{working=false;validateForm()}
});
root.addEventListener('beforeunload',event=>{if(dirty()||working){event.preventDefault();event.returnValue=''}});
root.addEventListener('kt:locale',()=>{if(host&&data&&!reportMode){updateSummary(data.ratingSummary);render()}});
root.KTReviews={open,summary,canLeave,reset};
})(window);

(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const state={entries:[],teams:[],user:null,view:'library',source:'community',selected:new Set(),types:new Set(),topic:'',search:'',sort:'default',limit:16,saved:new Set(),savedOnly:false,submissions:[],canModerate:false,canManageRoles:false,conductEditing:false};
 const conductUrl='/faq/conduct',infoUrl='/faq/info';
 const isFaqEntry=e=>e.category==='community'||e.category==='official';
 const savedFaqCount=()=>state.entries.filter(e=>isFaqEntry(e)&&state.saved.has(e.id)).length;
 // Preserve the source's introduction, two bullet lists and subsequent headings.
 // Records remain editable, while readers see one continuous document.
 const conductGroups=[{id:'conduct-rules',title:'Основные правила',entries:['community-002','community-003','community-004']},{id:'conduct-principles',title:'Принципы',entries:Array.from({length:8},(_,i)=>'community-'+String(i+5).padStart(3,'0'))}];
 const topics=['Действия и способности','Движение','Атака и урон','Террейн и видимость','Маркеры и ресурсы','Этика и организация'];
 const typeNames=['RAW','Правка','Спор','Произвол','GW'];
 const statusNames={pending:'На рассмотрении',accepted:'Опубликовано',rejected:'Отклонено',needs_changes:'Нужна доработка'};
 let edit=null,detailId=null,renderSequence=0,previewTimer,toastTimer,roleUsers=[];
 let questionRows=[],editingQuestionId=null,editingReplyId=null,pendingQuestionDelete=null,questionLoadSequence=0;
 const ui=s=>window.KTUI.text(s);
 const date=s=>s?new Date(s).toLocaleDateString(window.KTUI.locale()==='en'?'en-GB':'ru-RU',{day:'numeric',month:'short',year:'numeric'}):'';
 const stamp=s=>s?`<time data-faq-date data-ui-skip datetime="${esc(s)}">${esc(date(s))}</time>`:'';
 function updateLocale(){
  document.title=ui(state.view==='conduct'?'Code of Conduct · Thundergrounds TTS Tournament Series':state.view==='info'?'Инфо · TTS COMMUNITY FAQ':'TTS COMMUNITY FAQ · KT Companion');
  const description=document.querySelector('meta[name="description"]');
  if(description){description.dataset.original||=description.content;description.content=ui(description.dataset.original);}
  document.querySelectorAll('[data-faq-date]').forEach(element=>element.textContent=date(element.getAttribute('datetime')));
  if(state.snapshot)$('snapshot-label').innerHTML=`<span>${window.KTUI.locale()==='en'?'GW: archive snapshot':'GW: снимок'}</span> ${stamp(state.snapshot)} · Community v${esc(state.communityVersion)}`;
 }
 const countText=(n,forms)=>n+' '+forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
 async function api(url,options={}){const account=state.user?{'X-FAQ-Account':String(state.user.id)}:{};const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...account,...options.headers}});let result;try{result=await r.json();}catch{throw Error('Сервер не вернул ответ. Попробуйте ещё раз.');}if(!r.ok)throw Error(result.error||'Не удалось выполнить действие');return result;}
 function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
 function bookmarkKey(){return 'kt-faq-bookmarks-'+(state.user?.id||'guest');}
 function loadBookmarks(){try{state.saved=new Set(JSON.parse(localStorage.getItem(bookmarkKey())||'[]'));}catch{state.saved=new Set();}}
 function persistBookmarks(){try{localStorage.setItem(bookmarkKey(),JSON.stringify([...state.saved]));}catch{}$('saved-count').textContent=savedFaqCount();}
 function toggleBookmark(id){state.saved.has(id)?state.saved.delete(id):state.saved.add(id);persistBookmarks();render();if(detailId===id)renderDetail();}
 function requireUser(){if(state.user)return true;location.href=window.KTCompanion.loginUrl();return false;}
 function tagHtml(e){return [...e.teams.map(t=>`<button class="tag team-tag" data-team="${esc(t)}" ${t==='Все команды'?'':'data-ui-skip'}>${esc(t)}</button>`),`<span class="tag" ${topics.includes(e.topic)?'':'data-ui-skip'}>${esc(e.topic)}</span>`].join('');}
 function imagesHtml(e){return (e.images||[]).map(i=>`<figure data-ui-skip><img src="${esc(i.src)}" alt="${esc(i.caption||ui('Иллюстрация к решению'))}" loading="lazy">${i.caption?`<figcaption>${esc(i.caption)}</figcaption>`:''}</figure>`).join('');}
 function cardHtml(e,{preview=false}={}){
  if(e.category==='conduct'||e.category==='info')return `<article class="conduct-preview"><h3 ${e.question?'data-ui-skip':''}>${esc(e.question||'Заголовок раздела')}</h3><div class="answer-body" ${e.answer?'data-ui-skip':''}>${e.answerHtml||'<p>Текст раздела появится здесь.</p>'}${imagesHtml(e)}</div></article>`;
  const number=e.id?.startsWith('official')?'GW / '+String(e.sourcePage||'—').padStart(2,'0'):'FAQ / '+String(state.entries.filter(x=>x.category===e.category).findIndex(x=>x.id===e.id)+1).padStart(3,'0');
  return `<article class="faq-card ${esc(e.category)}" data-entry="${esc(e.id||'preview')}"><header class="card-meta"><span class="record-number">${preview?'ПРЕДПРОСМОТР':esc(number)}</span><span class="ruling-badge ruling-${esc(e.rulingType)}">${esc(e.rulingType)}</span>${!preview?`<button class="bookmark ${state.saved.has(e.id)?'saved':''}" data-bookmark="${esc(e.id)}" title="${state.saved.has(e.id)?'Убрать из сохранённых':'Сохранить карточку'}" aria-label="${state.saved.has(e.id)?'Убрать из сохранённых':'Сохранить карточку'}" aria-pressed="${state.saved.has(e.id)}">${state.saved.has(e.id)?'★':'☆'}</button>`:''}</header><div class="card-tags">${tagHtml(e)}</div><div class="qa-row"><span class="qa-letter">Q</span><h3 ${e.question?'data-ui-skip':''}>${esc(e.question||'Твой вопрос появится здесь')}</h3></div><div class="qa-row answer"><span class="qa-letter">A</span><div class="answer-body${(e.answer||'').length>300?' long':''}" ${e.answer?'data-ui-skip':''}>${e.answerHtml||'<p>Решение появится здесь.</p>'}${imagesHtml(e)}</div></div><footer class="card-footer">${e.sourceUrl?`<a class="source-link" data-ui-skip href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.sourceLabel||ui('Источник'))} ↗</a>`:`<span class="source-link" data-ui-skip>${esc(e.sourceLabel||'TTS Community FAQ')}</span>`}${!preview?`<button data-discuss="${esc(e.id)}" title="Вопросы по карточке">◌ ${e.questionCount||0}</button>${state.canModerate?`<button class="edit-card" data-edit="${esc(e.id)}" title="Редактировать карточку">✎</button>`:''}<button class="read-more" data-open="${esc(e.id)}">Читать →</button>`:''}</footer></article>`;
 }
 function teamCount(t){return filtered({selected:new Set([t]),sort:false}).length;}
 function renderTeams(){const q=$('team-search').value.toLocaleLowerCase();const candidates=state.teams.filter(t=>t!=='Все команды'&&t.toLocaleLowerCase().includes(q)).sort((a,b)=>teamCount(b)-teamCount(a)||a.localeCompare(b));
  $('team-options').innerHTML=candidates.map(t=>`<button data-team="${esc(t)}" class="${state.selected.has(t)?'active':''}" aria-pressed="${state.selected.has(t)}">${state.logos?.includes(t)?`<img src="/kill-team-logos/${encodeURIComponent(t)}.webp" alt="" width="22" height="22">`:'<span class="team-icon" aria-hidden="true">◇</span>'}${esc(t)}<span>${teamCount(t)}</span></button>`).join('')||'<p class="filter-hint">Команда не найдена</p>';
  $('selected-teams').innerHTML=[...state.selected].map(t=>`<button data-team="${esc(t)}">${esc(t)} ×</button>`).join('');
 }
 function setTeam(t){if(t==='Все команды'){state.selected.clear();}else{state.selected.has(t)?state.selected.delete(t):state.selected.add(t);}state.limit=16;renderTeams();render();}
 function filtered({source=state.source,selected=state.selected,sort=true}={}){
  let rows=state.entries.filter(e=>isFaqEntry(e)&&(source==='all'||e.category===source));
  if(selected.size)rows=rows.filter(e=>!e.teams.includes('Все команды')&&e.teams.some(t=>selected.has(t)));
  if(state.types.size)rows=rows.filter(e=>state.types.has(e.rulingType));
  if(state.topic)rows=rows.filter(e=>e.topic===state.topic);
  if(state.savedOnly)rows=rows.filter(e=>state.saved.has(e.id));
  const terms=state.search.toLocaleLowerCase().split(/\s+/).filter(Boolean);if(terms.length)rows=rows.filter(e=>terms.every(t=>[e.question,e.answer,...e.teams,e.topic,e.rulingType,ui(e.topic),ui(e.rulingType)].join(' ').toLocaleLowerCase().includes(t)));
  if(sort&&state.sort==='alpha')rows.sort((a,b)=>a.question.localeCompare(b.question,'ru'));
  if(sort&&state.sort==='team')rows.sort((a,b)=>a.teams[0].localeCompare(b.teams[0])||a.question.localeCompare(b.question));
  if(sort&&state.sort==='updated')rows.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  return rows;
 }
 function reset(){state.selected.clear();state.types.clear();state.topic='';state.search='';state.savedOnly=false;state.limit=16;$('faq-search').value='';$('team-search').value='';$('topic-filter').value='';$('saved-filter').setAttribute('aria-pressed','false');renderTeams();render();}
 function render(){
  const conduct=state.view==='conduct',info=state.view==='info';$('conduct-document').hidden=!conduct;$('info-document').hidden=!info;$('faq-workspace').hidden=conduct||info;
  updateLocale();
  const queue=state.view==='moderation'||state.view==='mine';$('filters').hidden=queue;$('cards').hidden=queue;$('queue-list').hidden=!queue;$('search-row');document.querySelector('.search-row').hidden=queue;
  $('new-entry').hidden=!state.canModerate||state.view==='mine';$('manage-roles').hidden=!state.canManageRoles||state.view!=='moderation';$('sort').parentElement.hidden=queue;
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(conduct){renderConduct();return;}
  if(info){renderInfo();return;}
  renderTeams();
  $('source-filters').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.source===state.source);b.querySelector('span').textContent=filtered({source:b.dataset.source,sort:false}).length;});
  $('type-filters').innerHTML=typeNames.map(t=>`<button data-type="${esc(t)}" class="${state.types.has(t)?'active':''}" aria-pressed="${state.types.has(t)}">${esc(t)}</button>`).join('');
  $('saved-count').textContent=savedFaqCount();
  $('section-intro').hidden=true;$('load-more-wrap').hidden=true;
  if(queue){renderQueue();return;}
  const rows=filtered();$('result-count').textContent=countText(rows.length,['карточка','карточки','карточек']);$('results-heading').textContent=state.source==='all'?'Все разъяснения':state.source==='official'?'Official FAQ · Games Workshop':'Community FAQ';
  $('cards').innerHTML=rows.length?rows.slice(0,state.limit).map(e=>cardHtml(e)).join(''):'<div class="empty-state"><strong>Ничего не найдено</strong>Попробуй другую команду, формулировку или сбрось фильтры.<button class="secondary" data-action="reset">Сбросить фильтры</button></div>';
  $('load-more-wrap').hidden=rows.length<=state.limit;
 }
 function renderInfo(){
  const rows=state.entries.filter(e=>e.category==='info');
  $('info-text').innerHTML=rows.length?rows.map(e=>`<section class="info-section" id="info-${esc(e.id)}"><header><h3 data-ui-skip>${esc(e.question)}</h3>${state.canModerate?`<button class="secondary" data-edit="${esc(e.id)}">✎ Изменить</button>`:''}</header><div class="info-body" data-ui-skip>${e.answerHtml}${imagesHtml(e)}</div>${e.sourceUrl?`<footer><a data-ui-skip href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.sourceLabel||'Исходный документ')} ↗</a></footer>`:''}</section>`).join(''):'<p>Информация пока не опубликована.</p>';
 }
 function renderConduct(){
  const rows=state.entries.filter(e=>e.category==='conduct'),byId=new Map(rows.map(e=>[e.id,e])),used=new Set(),toc=[];
  const editing=state.canModerate&&state.conductEditing;
  function passage(e){used.add(e.id);return `<div class="conduct-passage" id="conduct-${esc(e.id)}" data-conduct-entry="${esc(e.id)}"><div data-ui-skip>${e.answerHtml}${imagesHtml(e)}</div>${editing?`<button class="conduct-edit" data-edit="${esc(e.id)}" aria-label="Изменить: ${esc(e.question)}">✎ Изменить</button>`:''}</div>`;}
  let html=byId.has('community-001')?`<div class="conduct-introduction">${passage(byId.get('community-001'))}</div>`:'';
  for(const group of conductGroups){const entries=group.entries.map(id=>byId.get(id)).filter(Boolean);if(!entries.length)continue;toc.push({id:group.id,title:group.title});html+=`<section class="conduct-section" id="${group.id}"><h3 data-ui-skip>${esc(group.title)}</h3><ul>${entries.map(e=>`<li>${passage(e)}</li>`).join('')}</ul></section>`;}
  for(const e of rows.filter(e=>!used.has(e.id))){const id='conduct-section-'+e.id;toc.push({id,title:e.question});html+=`<section class="conduct-section" id="${esc(id)}"><h3 data-ui-skip>${esc(e.question)}</h3>${passage(e)}</section>`;}
  $('conduct-text').innerHTML=html||'<p>Кодекс пока не опубликован.</p>';
  $('conduct-toc').innerHTML=toc.map(t=>`<a data-ui-skip href="${conductUrl}#${encodeURIComponent(t.id)}">${esc(t.title)}</a>`).join('');
  $('conduct-source').href=state.communitySource+'#heading=h.hq5aa29whyd';$('conduct-version').textContent='TTS Community · v'+state.communityVersion;
  $('edit-conduct').hidden=!state.canModerate;$('edit-conduct').textContent=editing?'✓ Завершить редактирование':'✎ Изменить кодекс';$('edit-conduct').setAttribute('aria-pressed',String(editing));$('new-conduct-section').hidden=!editing;
 }
 function setView(view,{navigate=true}={}){
  state.view=view;state.limit=16;if(view!=='conduct')state.conductEditing=false;
  if(navigate){const url=view==='conduct'?conductUrl:view==='info'?infoUrl:view==='library'?'/faq':'/faq#view='+encodeURIComponent(view);if(location.pathname+location.hash!==url)history.pushState(null,'',url);window.scrollTo({top:0});}
  render();
 }
 async function readLocation(){
  const hash=location.hash.slice(1),params=new URLSearchParams(hash),id=params.get('entry');
  if(id){await openDetail(id);return;}
  const conduct=/^\/(?:faq|community-faq)\/conduct\/?$/.test(location.pathname)||hash==='conduct'||hash.startsWith('conduct-');
  const info=/^\/(?:faq|community-faq)\/info\/?$/.test(location.pathname)||hash==='info'||hash.startsWith('info-');
  const requested=params.get('view'),view=conduct?'conduct':info||requested==='info'?'info':requested==='mine'&&state.user?'mine':requested==='moderation'&&state.canModerate?'moderation':'library';
  if($('detail-dialog').open)$('detail-dialog').close();setView(view,{navigate:false});
  if(conduct&&hash.startsWith('conduct-'))document.getElementById(hash)?.scrollIntoView({block:'start'});
  if(info&&hash.startsWith('info-'))document.getElementById(hash)?.scrollIntoView({block:'start'});
 }
 function renderQueue(){
  const mine=state.view==='mine';const rows=mine?state.submissions.filter(s=>s.authorId===state.user?.id):state.submissions;
  $('results-heading').textContent=mine?'Мои заявки':'Очередь модерации';$('result-count').textContent=countText(rows.length,['заявка','заявки','заявок']);
  $('section-intro').hidden=false;$('section-intro').innerHTML=mine?'После рассмотрения здесь появятся решение модератора и ссылка на карточку. Заявку, возвращённую на доработку, можно исправить и отправить снова.':`<div class="queue-filter"><label for="queue-status">Статус</label> <select id="queue-status"><option value="pending">На рассмотрении</option><option value="all">Все заявки</option><option value="accepted">Опубликованные</option><option value="needs_changes">На доработке</option><option value="rejected">Отклонённые</option></select></div>`;
  if(!mine){const select=$('queue-status');select.value=state.queueStatus||'pending';select.onchange=()=>{state.queueStatus=select.value;render();};}
  const shown=mine?rows:rows.filter(s=>(state.queueStatus||'pending')==='all'||s.status===(state.queueStatus||'pending'));
  $('queue-list').innerHTML=shown.length?shown.map(s=>`<article class="queue-card"><header><span><span ${s.author==='Удалённый аккаунт'?'':'data-ui-skip'}>${esc(s.author)}</span> · ${stamp(s.createdAt)}</span><span class="status-badge status-${esc(s.status)}">${statusNames[s.status]}</span></header><h3 data-ui-skip>${esc(s.question)}</h3><div class="card-tags" style="padding:0">${s.teams.map(t=>`<span class="tag team-tag">${esc(t)}</span>`).join('')}<span class="tag">${esc(s.rulingType)}</span></div>${s.answer?`<p data-ui-skip>${esc(s.answer.length>350?s.answer.slice(0,350)+'…':s.answer)}</p>`:''}${s.resolution?`<p class="moderator-reply"><strong>Комментарий модератора</strong><span data-ui-skip>${esc(s.resolution)}</span></p>`:''}<footer><span>${s.entryId?'Уточнение к существующей карточке':'Новое разъяснение'}</span>${!mine&&s.status==='pending'?`<button class="primary" data-review="${esc(s.id)}">Рассмотреть →</button>`:s.status==='needs_changes'&&s.authorId===state.user?.id?`<button class="primary" data-revise="${esc(s.id)}">Доработать →</button>`:s.resultEntryId?`<button class="secondary" data-open="${esc(s.resultEntryId)}">Открыть карточку →</button>`:''}</footer></article>`).join(''):`<div class="empty-state"><strong>${mine?'Заявок пока нет':'Очередь разобрана'}</strong>${mine?'Есть вопрос без ответа? Предложи его для FAQ.':'Здесь появятся новые вопросы и предложения игроков.'}${mine?'<button class="primary" data-action="submit">＋ Предложить FAQ</button>':''}</div>`;
 }
 async function refresh(){
  const data=await api('/api/faq');Object.assign(state,{entries:data.entries,teams:data.teams,logos:data.logos,canModerate:data.canModerate,canManageRoles:data.canManageRoles,communitySource:data.communitySource,communityVersion:data.communityVersion,snapshot:data.snapshot});
  const counts={community:0,official:0};state.entries.filter(isFaqEntry).forEach(e=>counts[e.category]++);
  $('library-count').textContent=counts.community+counts.official;$('version').textContent='COMMUNITY v'+data.communityVersion;$('source-link').href=data.communitySource;updateLocale();
  $('moderation-tab').hidden=!state.canModerate;$('mine-tab').hidden=!state.user;
  if(state.user){const r=await api('/api/faq/submissions');state.submissions=r.submissions;$('queue-count').textContent=state.submissions.filter(s=>s.status==='pending').length;$('mine-count').textContent=state.submissions.filter(s=>s.authorId===state.user.id).length;}
  renderTeams();render();
 }
 async function openDetail(id,discussion=false){const e=state.entries.find(e=>e.id===id);if(!e){toast('Эта карточка не найдена. Обнови страницу.');return;}
  if(e.category==='conduct'){if($('detail-dialog').open)$('detail-dialog').close();setView('conduct',{navigate:new URLSearchParams(location.hash.slice(1)).get('entry')!==id});history.replaceState(null,'',conductUrl+'#conduct-'+encodeURIComponent(id));document.getElementById('conduct-'+id)?.scrollIntoView({block:'start'});return;}
  if(e.category==='info'){if($('detail-dialog').open)$('detail-dialog').close();setView('info',{navigate:new URLSearchParams(location.hash.slice(1)).get('entry')!==id});history.replaceState(null,'',infoUrl+'#info-'+encodeURIComponent(id));document.getElementById('info-'+id)?.scrollIntoView({block:'start'});return;}
  detailId=id;questionRows=[];editingQuestionId=null;editingReplyId=null;renderDetail();if(!$('detail-dialog').open)$('detail-dialog').showModal();
  history.replaceState(null,'',location.pathname+location.search+'#entry='+encodeURIComponent(id));await loadQuestions();if(discussion)$('discussion-section')?.scrollIntoView({behavior:'smooth'});
 }
 function renderDetail(){
  const e=state.entries.find(e=>e.id===detailId);if(!e)return;
  $('detail-content').innerHTML=`<header class="dialog-header"><div><p class="eyebrow">${e.category==='official'?'OFFICIAL FAQ / GAMES WORKSHOP':e.category==='conduct'?'CODE OF CONDUCT':'TTS COMMUNITY FAQ'}</p><span class="ruling-badge ruling-${esc(e.rulingType)}">${esc(e.rulingType)}</span></div><button class="icon-button close-dialog" aria-label="Закрыть">×</button></header><div class="detail-body"><div class="card-tags">${tagHtml(e)}</div><div class="qa-row"><span class="qa-letter">Q</span><h3 data-ui-skip>${esc(e.question)}</h3></div><div class="qa-row answer"><span class="qa-letter">A</span><div class="answer-body" data-ui-skip>${e.answerHtml}${imagesHtml(e)}</div></div><div class="detail-source"><a data-ui-skip href="${esc(e.sourceUrl||'#')}" target="_blank" rel="noopener noreferrer">${esc(e.sourceLabel)} ↗</a><br>${e.sourceDate?'Дата документа: '+stamp(e.sourceDate)+' · ':''}<span>Редакция карточки:</span> ${e.revision}${e.sourceSection?'<br><span data-ui-skip>'+esc(e.sourceSection)+'</span>':''}${e.category==='official'?'<br><span>Текст официального источника на английском. Снимок архива:</span> '+esc(e.sourceVersion):''}</div><div class="detail-actions"><button class="secondary" data-bookmark="${esc(e.id)}">${state.saved.has(e.id)?'★ Сохранено':'☆ Сохранить'}</button><button class="secondary" data-copy="${esc(e.id)}">Копировать ссылку</button><button class="secondary" data-correction="${esc(e.id)}">Предложить уточнение</button>${state.canModerate?`<button class="secondary" data-edit="${esc(e.id)}">✎ Изменить</button><button class="secondary" data-history="${esc(e.id)}">История</button>`:''}</div><div id="record-history"></div></div><section class="discussion" id="discussion-section"><h3>Вопросы по этому разъяснению</h3><div id="question-list"><p class="filter-hint">Загружаем обсуждение…</p></div>${state.user?'<form id="ask-form" class="ask-form"><label for="ask-body">Уточни ситуацию — FAQ Moderator сможет ответить.</label><textarea id="ask-body" rows="3" maxlength="2000" minlength="3" required placeholder="Опиши ситуацию на столе…"></textarea><button class="primary">Отправить вопрос</button></form>':`<p><a href="${esc(window.KTCompanion.loginUrl())}">Войди через аккаунт компаньона</a>, чтобы оставлять вопросы и предложения.</p>`}</section>`;
 }
 function questionAuthor(name,avatar){
  const initial=Array.from(name.trim())[0]||'?';
  return `<span class="question-author" ${name==='Удалённый аккаунт'?'':'data-ui-skip'}><span class="comment-avatar" aria-hidden="true"><span>${esc(initial.toLocaleUpperCase())}</span>${avatar?`<img src="${esc(avatar)}" alt="" loading="lazy" width="32" height="32">`:''}</span><strong>${esc(name)}</strong></span>`;
 }
 function renderQuestions(){
  const list=$('question-list');if(!list)return;
  list.innerHTML=questionRows.length?questionRows.map(q=>{
   const editing=editingQuestionId===q.id,replyEditing=editingReplyId===q.id;
   return `<article class="question-item" data-question="${esc(q.id)}"><header>${questionAuthor(q.author||'Удалённый аккаунт',q.authorAvatarUrl)}<span class="comment-date">${stamp(q.created_at)}${q.updated_at?' · изменён':''}</span></header>${editing?`<form class="question-edit-form" data-question-id="${esc(q.id)}" data-revision="${q.revision}"><label for="question-edit-${esc(q.id)}">Изменить комментарий</label><textarea id="question-edit-${esc(q.id)}" rows="3" maxlength="2000" minlength="3" required>${esc(q.body)}</textarea><div class="comment-form-actions"><button class="primary" type="submit">Сохранить</button><button class="secondary" type="button" data-cancel-question="${esc(q.id)}">Отмена</button></div></form>`:`<div class="question-text" data-ui-skip>${esc(q.body)}</div>`}${!editing&&(q.canEdit||q.canDelete)?`<div class="comment-actions">${q.canEdit?`<button type="button" data-edit-question="${esc(q.id)}">Изменить</button>`:''}${q.canDelete?`<button type="button" class="comment-delete" data-delete-question="${esc(q.id)}">Удалить</button>`:''}</div>`:''}${q.reply?`<div class="moderator-reply question-reply"><header>${questionAuthor(q.moderator||'FAQ Moderator',q.moderatorAvatarUrl)}<span class="comment-date">FAQ Moderator · ${stamp(q.replied_at)}${q.reply_updated_at?' · изменён':''}</span></header><div class="question-text" data-ui-skip>${esc(q.reply)}</div>${q.canEditReply||q.canDeleteReply?`<div class="comment-actions">${q.canEditReply&&!replyEditing?`<button type="button" data-edit-reply="${esc(q.id)}">Изменить ответ</button>`:''}${q.canDeleteReply?`<button type="button" class="comment-delete" data-delete-reply="${esc(q.id)}">Удалить ответ</button>`:''}</div>`:''}</div>`:''}${q.canReply&&(!q.reply||replyEditing)?`<form class="reply-form" data-question-id="${esc(q.id)}" data-revision="${q.revision}"><label for="reply-${esc(q.id)}">${q.reply?'Изменить ответ модератора':'Ответ модератора'}</label><textarea id="reply-${esc(q.id)}" rows="3" maxlength="5000" minlength="3" required placeholder="Ответ модератора">${esc(q.reply)}</textarea><div class="comment-form-actions"><button class="secondary" type="submit">${q.reply?'Сохранить ответ':'Ответить'}</button>${q.reply?`<button class="secondary" type="button" data-cancel-reply="${esc(q.id)}">Отмена</button>`:''}</div></form>`:''}</article>`;
  }).join(''):'<p class="filter-hint">Пока нет вопросов. Здесь можно уточнить применение этого рулинга.</p>';
 }
 async function loadQuestions(){const id=detailId,sequence=++questionLoadSequence;if(!id)return;try{
  const r=await api('/api/faq/entries/'+encodeURIComponent(id)+'/questions');if(detailId!==id||sequence!==questionLoadSequence||!$('question-list'))return;
  questionRows=r.questions;renderQuestions();
 }catch(e){toast(e.message);}}
 function confirmQuestionDelete(id,reply=false){
  const q=questionRows.find(q=>q.id===id);if(!q)return;
  pendingQuestionDelete={id,reply,revision:q.revision,entryId:detailId};
  $('question-delete-title').textContent=reply?'Удалить ответ модератора?':'Удалить комментарий?';
  $('question-delete-description').textContent=reply?'Ответ исчезнет из обсуждения. Комментарий игрока останется.':q.reply?'Комментарий и ответ модератора исчезнут из обсуждения.':'Комментарий исчезнет из обсуждения.';
  $('confirm-question-delete').disabled=false;$('question-delete-dialog').showModal();
 }
 function renderEditTeams(){$('edit-team-chips').innerHTML=edit.teams.map(t=>`<button type="button" data-remove-edit-team="${esc(t)}">${esc(t)} ×</button>`).join('');}
 function configureEditor(){
  const conduct=$('edit-category').value==='conduct',info=$('edit-category').value==='info',textSection=conduct||info;$('editor-form').classList.toggle('document-editor',textSection);
  $('question-label').textContent=textSection?'Заголовок раздела':'Вопрос';$('answer-label-text').textContent=conduct?'Текст кодекса':info?'Текст раздела':'Решение / предложенный ответ';
  $('edit-question').placeholder=textSection?'Название раздела':'Одна ситуация — один понятный вопрос';$('edit-answer').placeholder=textSection?'Текст раздела. Сохрани форматирование, добавь пример или иллюстрацию.':'Объясни решение. Выдели ключевые условия, добавь пример или схему.';
  document.querySelector('.editor-preview>.eyebrow').textContent=textSection?'ТАК РАЗДЕЛ УВИДЯТ ИГРОКИ':'ТАК КАРТОЧКУ УВИДЯТ ИГРОКИ';
  document.querySelector('.preview-note').textContent=textSection?'Форматирование, ссылки, таблицы и изображения сохраняются в тексте раздела.':'Форматирование, ссылки, таблицы и изображения сохраняются в карточке.';
 }
 function setEditorCategory(){const c=$('edit-category').value;if(c==='official')$('edit-type').value='GW';else if(c==='conduct'){$('edit-type').value='Этикет';$('edit-topic').value='Этика и организация';}else if(['GW','Этикет'].includes($('edit-type').value))$('edit-type').value='RAW';configureEditor();updatePreview();}
 function openEditor(mode,e=null,s=null){if(!requireUser())return;if(['create','edit','review'].includes(mode)&&!state.canModerate)return;
  edit={mode,id:e?.id,submissionId:s?.id,entryId:s?.entryId||e?.id||null,revision:e?.revision,teams:[...(s?.teams||e?.teams||['Все команды'])],images:structuredClone(s?.images||e?.images||[]),sourceVersion:e?.sourceVersion||'',sourceDate:e?.sourceDate||null};
  const data=s||e||(mode==='create'&&state.view==='conduct'?{category:'conduct',rulingType:'Этикет',topic:'Этика и организация',sourceLabel:'Code of Conduct · TTS',sourceUrl:state.communitySource+'#heading=h.hq5aa29whyd'}:{});const submission=['submit','correction','revise'].includes(mode),review=mode==='review';
  $('editor-title').textContent=review?'Рассмотреть заявку':mode==='edit'?(data.category==='conduct'?'Редактировать раздел кодекса':data.category==='info'?'Редактировать раздел «Инфо»':'Редактировать карточку'):mode==='correction'?'Предложить уточнение':mode==='revise'?'Доработать заявку':submission?'Предложить новый FAQ':data.category==='conduct'?'Новый раздел кодекса':'Новая карточка';
  $('editor-kicker').textContent=submission?'ПРЕДЛОЖЕНИЕ СООБЩЕСТВА':'FAQ MODERATOR';
  $('edit-category').value=(submission||review)&&data.category==='official'?'community':data.category||'community';$('edit-category').disabled=submission||review||data.category==='info';
  $('edit-type').value=data.rulingType==='GW'&&(submission||review)?'RAW':data.rulingType||'RAW';
  $('edit-topic').value=data.topic||'Действия и способности';$('edit-question').value=data.question||'';$('edit-answer').value=data.answer||'';
  $('edit-source-label').value=data.sourceLabel||'TTS Community FAQ';$('edit-source-url').value=data.sourceUrl||'';$('editor-status').textContent='';$('moderator-note').value='';
  $('moderator-note-wrap').hidden=!review;$('return-submission').hidden=!review;$('reject-submission').hidden=!review;
  $('save-entry').textContent=review?'Принять и опубликовать':submission?'Отправить на рассмотрение':'Опубликовать';
  $('editor-footer-note').textContent=submission?'Публикация появится после проверки FAQ Moderator.':'Изменения сохраняются с историей версий.';
  $('edit-answer').required=!submission;
  $('submission-context').hidden=!s;$('submission-context').innerHTML=s?`<span data-ui-skip>${esc(s.author)}</span> · ${stamp(s.createdAt)}${s.resolution?' · <span data-ui-skip>'+esc(s.resolution)+'</span>':''}`:'';
  $('edit-team-add').innerHTML='<option value="">＋ Добавить kill team</option>'+state.teams.map(t=>`<option value="${esc(t)}" ${t==='Все команды'?'':'data-ui-skip'}>${esc(t)}</option>`).join('');
  configureEditor();renderEditTeams();renderImages();if(!$('editor-dialog').open)$('editor-dialog').showModal();updatePreview();
 }
 function editorPayload(){return {category:$('edit-category').value,rulingType:$('edit-type').value,teams:edit.teams,topic:$('edit-topic').value,question:$('edit-question').value.trim(),answer:$('edit-answer').value.trim(),images:edit.images,sourceLabel:$('edit-source-label').value.trim(),sourceUrl:$('edit-source-url').value.trim(),sourceVersion:edit.sourceVersion,sourceDate:edit.sourceDate,revision:edit.revision};}
 async function updatePreview(){if(!edit)return;clearTimeout(previewTimer);const seq=++renderSequence;
  previewTimer=setTimeout(async()=>{try{const e=editorPayload(),r=await api('/api/faq/render',{method:'POST',body:JSON.stringify({markdown:e.answer})});if(seq!==renderSequence||!edit)return;$('live-preview').innerHTML=cardHtml({...e,answerHtml:r.html},{preview:true});}catch(e){if(seq===renderSequence)$('editor-status').textContent=e.message;}},180);
 }
 function renderImages(){$('image-list').innerHTML=edit.images.map((i,n)=>`<div class="image-row"><img src="${esc(i.src)}" alt="Добавленное изображение"><input data-caption="${n}" value="${esc(i.caption)}" placeholder="Подпись к изображению" maxlength="300" aria-label="Подпись к изображению"><button type="button" data-remove-image="${n}" aria-label="Удалить изображение">×</button></div>`).join('');}
 async function addImage(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Выбери PNG, JPEG или WebP.');if(file.size>10000000)throw Error('Исходное изображение больше 10 MB.');if(edit.images.length>=6)throw Error('В карточке может быть до 6 изображений.');
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let src=canvas.toDataURL('image/webp',.85);if(src.length>530000)src=canvas.toDataURL('image/webp',.6);if(src.length>530000)throw Error('Изображение слишком сложное. Уменьши размер или выбери другое.');
  edit.images.push({src,caption:''});renderImages();updatePreview();
 }
 function format(kind){const area=$('edit-answer'),start=area.selectionStart,end=area.selectionEnd,selected=area.value.slice(start,end);let value;
  if(kind==='bold')value='**'+(selected||ui('ключевое условие'))+'**';if(kind==='italic')value='*'+(selected||ui('термин'))+'*';
  if(kind==='heading')value='\n\n## '+(selected||ui('Пример'))+'\n';if(kind==='quote')value='\n\n> '+(selected||ui('Текст правила'))+'\n';
  if(kind==='list')value='\n'+(selected?selected.split('\n').map(s=>'- '+s).join('\n'):'- '+ui('Первое условие')+'\n- '+ui('Второе условие'))+'\n';
  if(kind==='table')value=`\n\n| ${ui('Условие')} | ${ui('Решение')} |\n| --- | --- |\n| ${ui('Ситуация')} | ${ui('Результат')} |\n`;
  if(kind==='link')value='['+(selected||ui('Источник'))+'](https://example.com)';
  if(value!==undefined){area.setRangeText(value,start,end,'select');area.focus();updatePreview();}
 }
 async function saveEditor(status='accepted'){
  if(!edit||!edit.teams.length){$('editor-status').textContent='Выбери хотя бы одну команду.';return;}
  const mode=edit.mode,payload=editorPayload();let url,method='POST',body;
  if(mode==='review'){url='/api/faq/submissions/'+edit.submissionId+'/decision';body={status,resolution:$('moderator-note').value.trim(),entry:payload};}
  else if(mode==='revise'){url='/api/faq/submissions/'+edit.submissionId;method='PATCH';body=payload;}
  else if(mode==='submit'||mode==='correction'){url='/api/faq/submissions';body={...payload,entryId:edit.entryId};}
  else{url='/api/faq/entries'+(edit.id?'/'+encodeURIComponent(edit.id):'');method=edit.id?'PATCH':'POST';body=payload;}
  const buttons=[...$('editor-form').querySelectorAll('.dialog-footer button')];buttons.forEach(b=>b.disabled=true);$('editor-status').textContent='';
  try{await api(url,{method,body:JSON.stringify(body)});$('editor-dialog').close();if(['submit','correction','revise'].includes(mode))setView('mine');await refresh();if(detailId&&$('detail-dialog').open){renderDetail();await loadQuestions();}toast(mode==='review'?(status==='accepted'?'Заявка принята. Публикация обновлена.':status==='rejected'?'Заявка отклонена.':'Заявка возвращена автору на доработку.'):['submit','correction','revise'].includes(mode)?'Заявка отправлена FAQ Moderator.':payload.category==='conduct'?'Кодекс обновлён.':payload.category==='info'?'Раздел «Инфо» обновлён.':'Карточка опубликована.');}
  catch(e){$('editor-status').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
 }
 async function openRoles(){const r=await api('/api/faq/moderators');roleUsers=r.users;$('role-search').value='';renderRoles();$('roles-dialog').showModal();}
 function renderRoles(){const q=$('role-search').value.toLocaleLowerCase();$('role-users').innerHTML=roleUsers.filter(u=>u.name.toLocaleLowerCase().includes(q)).map(u=>`<div class="role-user"><span data-ui-skip>${esc(u.name)} <small>#${u.id}</small></span><button data-role-id="${u.id}" data-enabled="${!u.is_faq_moderator}" class="${u.is_faq_moderator?'secondary':'primary'}">${u.is_faq_moderator?'Снять роль':'Назначить'}</button></div>`).join('');}
 document.addEventListener('click',async event=>{
  const b=event.target.closest('button,a');if(!b)return;
  try{
   if(b.classList.contains('close-dialog')){b.closest('dialog').close();return;}
   if(b.dataset.action==='retry'){location.reload();return;}
   if(b.dataset.view){if(b.tagName==='A'&&(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey))return;event.preventDefault();setView(b.dataset.view);return;}
   if(b.dataset.source){state.source=b.dataset.source;state.limit=16;render();return;}
   if(b.dataset.team){setTeam(b.dataset.team);return;}
   if(b.dataset.type){state.types.has(b.dataset.type)?state.types.delete(b.dataset.type):state.types.add(b.dataset.type);state.limit=16;render();return;}
   if(b.dataset.bookmark){toggleBookmark(b.dataset.bookmark);if($('detail-dialog').open)await loadQuestions();return;}
   if(b.dataset.open){await openDetail(b.dataset.open);return;}
   if(b.dataset.discuss){await openDetail(b.dataset.discuss,true);return;}
   if(b.dataset.editQuestion){editingQuestionId=b.dataset.editQuestion;renderQuestions();document.getElementById('question-edit-'+editingQuestionId)?.focus();return;}
   if(b.dataset.cancelQuestion){editingQuestionId=null;renderQuestions();return;}
   if(b.dataset.editReply){editingReplyId=b.dataset.editReply;renderQuestions();document.getElementById('reply-'+editingReplyId)?.focus();return;}
   if(b.dataset.cancelReply){editingReplyId=null;renderQuestions();return;}
   if(b.dataset.deleteQuestion){confirmQuestionDelete(b.dataset.deleteQuestion);return;}
   if(b.dataset.deleteReply){confirmQuestionDelete(b.dataset.deleteReply,true);return;}
   if(b.dataset.edit){openEditor('edit',state.entries.find(e=>e.id===b.dataset.edit));return;}
   if(b.dataset.correction){openEditor('correction',state.entries.find(e=>e.id===b.dataset.correction));return;}
   if(b.dataset.copy){const url=location.origin+'/faq#entry='+encodeURIComponent(b.dataset.copy);await navigator.clipboard.writeText(url);toast('Ссылка на карточку скопирована.');return;}
   if(b.dataset.history){const r=await api('/api/faq/entries/'+encodeURIComponent(b.dataset.history)+'/history');$('record-history').innerHTML=r.history.length?r.history.map(h=>`<p class="filter-hint">${stamp(h.created_at)} · <span data-ui-skip>${esc(h.actor||'FAQ Moderator')}</span> · <span>${esc({edited:'Карточка изменена',created:'Карточка создана',submission_accepted:'Заявка принята'}[h.action]||h.action)}</span></p>`).join(''):'<p class="filter-hint">Карточка импортирована из источника. Правок пока не было.</p>';return;}
   if(b.dataset.review){const s=state.submissions.find(s=>s.id===b.dataset.review);openEditor('review',state.entries.find(e=>e.id===s.entryId),s);return;}
   if(b.dataset.revise){const s=state.submissions.find(s=>s.id===b.dataset.revise);openEditor('revise',state.entries.find(e=>e.id===s.entryId),s);return;}
   if(b.dataset.removeEditTeam){edit.teams=edit.teams.filter(t=>t!==b.dataset.removeEditTeam);renderEditTeams();updatePreview();return;}
   if(b.dataset.removeImage!==undefined){edit.images.splice(Number(b.dataset.removeImage),1);renderImages();updatePreview();return;}
   if(b.dataset.format){format(b.dataset.format);return;}
   if(b.dataset.roleId){b.disabled=true;await api('/api/faq/moderators/'+b.dataset.roleId,{method:'PATCH',body:JSON.stringify({enabled:b.dataset.enabled==='true'})});const r=await api('/api/faq/moderators');roleUsers=r.users;renderRoles();toast('Роль FAQ Moderator обновлена.');return;}
   if(b.dataset.action==='copy-conduct'){await navigator.clipboard.writeText(location.origin+conductUrl);toast('Ссылка на кодекс скопирована.');return;}
   if(b.dataset.action==='copy-info'){await navigator.clipboard.writeText(location.origin+infoUrl);toast('Ссылка на «Инфо» скопирована.');return;}
   if(b.dataset.action==='edit-conduct'){state.conductEditing=!state.conductEditing;renderConduct();return;}
   if(b.dataset.action==='submit'){openEditor('submit');return;}if(b.dataset.action==='create'){openEditor('create');return;}if(b.dataset.action==='roles'){await openRoles();return;}if(b.dataset.action==='reset'){reset();return;}
  }catch(e){toast(e.message);b.disabled=false;}
 });
 document.addEventListener('submit',async event=>{
  if(event.target.id==='editor-form'){event.preventDefault();await saveEditor();return;}
  if(event.target.id==='ask-form'){event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('/api/faq/entries/'+encodeURIComponent(detailId)+'/questions',{method:'POST',body:JSON.stringify({body:$('ask-body').value})});$('ask-body').value='';await loadQuestions();await refresh();toast('Вопрос отправлен.');}catch(e){toast(e.message);}finally{button.disabled=false;}return;}
  if(event.target.matches('.question-edit-form,.reply-form')){event.preventDefault();const form=event.target,button=form.querySelector('button[type="submit"]'),isReply=form.matches('.reply-form');button.disabled=true;try{
   await api('/api/faq/questions/'+form.dataset.questionId,{method:'PATCH',body:JSON.stringify({[isReply?'reply':'body']:form.querySelector('textarea').value,revision:Number(form.dataset.revision)})});
   if(isReply)editingReplyId=null;else editingQuestionId=null;await loadQuestions();toast(isReply?'Ответ модератора сохранён.':'Комментарий изменён.');
  }catch(e){toast(e.message);}finally{button.disabled=false;}}
 });
 $('confirm-question-delete').onclick=async()=>{
  const pending=pendingQuestionDelete;if(!pending)return;const button=$('confirm-question-delete');button.disabled=true;
  try{await api('/api/faq/questions/'+pending.id+(pending.reply?'/reply':''),{method:'DELETE',body:JSON.stringify({revision:pending.revision})});
   $('question-delete-dialog').close();if(detailId===pending.entryId)await loadQuestions();await refresh();toast(pending.reply?'Ответ удалён.':'Комментарий удалён.');
  }catch(e){$('question-delete-dialog').close();await loadQuestions();toast(e.message);}finally{button.disabled=false;}
 };
 document.addEventListener('error',event=>{if(event.target.matches?.('.comment-avatar img'))event.target.remove();},true);
 $('faq-search').oninput=()=>{state.search=$('faq-search').value;state.limit=16;render();};$('team-search').oninput=renderTeams;
 $('topic-filter').innerHTML='<option value="">Все темы</option>'+topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');$('topic-filter').onchange=()=>{state.topic=$('topic-filter').value;state.limit=16;render();};
 $('sort').onchange=()=>{state.sort=$('sort').value;render();};$('reset-filters').onclick=reset;
 $('saved-filter').onclick=()=>{state.savedOnly=!state.savedOnly;$('saved-filter').setAttribute('aria-pressed',String(state.savedOnly));render();};
 $('load-more').onclick=()=>{state.limit+=16;render();};$('mobile-filters').onclick=()=>$('filters').classList.toggle('mobile-open');
 $('edit-category').onchange=setEditorCategory;$('editor-form').addEventListener('input',e=>{if(e.target.dataset.caption!==undefined)edit.images[Number(e.target.dataset.caption)].caption=e.target.value;updatePreview();});
 $('edit-team-add').onchange=()=>{const v=$('edit-team-add').value;if(v&&!edit.teams.includes(v)){if(v==='Все команды')edit.teams=['Все команды'];else{edit.teams=edit.teams.filter(t=>t!=='Все команды');edit.teams.push(v);}renderEditTeams();updatePreview();}$('edit-team-add').value='';};
 $('upload-image').onclick=()=>$('image-file').click();$('image-file').onchange=async()=>{try{await addImage($('image-file').files[0]);}catch(e){$('editor-status').textContent=e.message;}$('image-file').value='';};
 $('reject-submission').onclick=()=>saveEditor('rejected');$('return-submission').onclick=()=>saveEditor('needs_changes');$('role-search').oninput=renderRoles;
 $('detail-dialog').addEventListener('close',()=>{detailId=null;questionRows=[];editingQuestionId=null;editingReplyId=null;questionLoadSequence++;if($('question-delete-dialog').open)$('question-delete-dialog').close();if(new URLSearchParams(location.hash.slice(1)).has('entry'))history.replaceState(null,'',location.pathname+location.search);});
 $('question-delete-dialog').addEventListener('close',()=>{pendingQuestionDelete=null;});
 $('editor-dialog').addEventListener('close',()=>{edit=null;renderSequence++;});
 document.addEventListener('keydown',e=>{if(state.view==='library'&&e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('faq-search').focus();}});
 const navigate=()=>readLocation().catch(e=>toast(e.message));window.addEventListener('hashchange',navigate);window.addEventListener('popstate',navigate);
 window.addEventListener('kt:locale',updateLocale);updateLocale();
 (async()=>{try{const session=await window.KTCompanion.ready;state.user=session.user;loadBookmarks();await refresh();await readLocation();}catch(e){$('cards').innerHTML='<div class="empty-state"><strong>Не удалось загрузить FAQ</strong>'+esc(e.message)+'<button class="secondary" data-action="retry">Попробовать снова</button></div>';}})();
})();

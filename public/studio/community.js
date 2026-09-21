(function(root){
'use strict';
const $=selector=>document.querySelector(selector),esc=value=>KTCards.esc(String(value??''));
const labels={selectionCards:'Состав',teamCards:'Правила команды',strategicPloys:'Strategic Ploys',firefightPloys:'Firefight Ploys',equipment:'Equipment',operatives:'Оперативники',lorePages:'Картинки и лор'};
let cloud,adapter,view='editor',requestVersion=0,query='',offset=0,publication,publicationSection='selectionCards',busy=false,busyAction='';
const date=value=>value?new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
function status(){
 if(!adapter)return;
 const entry=cloud?.state(adapter.getData().team.id),guest=!root.KTAccount.id;
 $('#cloud-status').textContent=guest?'Гостевой режим · войдите, чтобы сохранить или опубликовать команду':entry?.saving?'Сохраняю черновик…':entry?.conflict?'Есть другая версия · ваши правки в браузере':entry?.error?'Нет сохранения в базе · копия в браузере':entry?.dirty?'Черновик · автосохранение раз в минуту':entry?.updatedAt?'Черновик сохранён · '+date(entry.updatedAt):'Первое изменение создаст черновик';
 $('#cloud-status').dataset.state=entry?.error?'error':entry?.dirty?'pending':'saved';
 $('#cloud-status').title=entry?.error||'';
 $('#publish-team').disabled=busy;
 $('#publish-team').textContent=busy&&busyAction==='publish'?'Публикую…':entry?.publicationId?'Обновить публикацию':'Опубликовать';
 $('#save-json').disabled=busy;
 $('#save-json').textContent=busy&&busyAction==='save'?'Сохраняю…':'Сохранить команду';
 $('#retry-cloud').hidden=!entry?.error||!!entry?.conflict;
 $('#copy-conflict').hidden=!entry?.conflict;
 if(view==='drafts'&&cloud)renderDrafts();
}
function track(project){if(cloud)cloud.track(project);status()}
function card(team,draft=false){
 return '<article class="team-tile"><div class="team-tile-top"><span class="team-state">'+(draft?'ЧЕРНОВИК':'ОПУБЛИКОВАНО')+'</span><span>v. '+esc(team.version||'1.0')+'</span></div><h2>'+esc(team.name||'Без названия')+'</h2><p>'+esc(team.subtitle||'Авторская команда Kill Team')+'</p><div class="team-tile-meta"><span>Оперативников: '+Number(team.operativeCount||0)+'</span><span>'+esc(date(team.updatedAt))+'</span></div>'+(draft?'<p class="draft-note">'+(team.error?'Не сохранён в базе. Локальная копия доступна.':team.dirty?'Есть правки · ожидают автосохранения':team.publishedAt?'Есть публикация · '+esc(date(team.publishedAt)):'Доступен только вам')+'</p>':'')+'<button class="'+(draft?'':'primary')+'" data-'+(draft?'open-draft':'open-publication')+'="'+esc(team.id)+'">'+(draft?'Продолжить редактирование':'Смотреть команду')+'</button></article>';
}
function showEditor(){view='editor';$('.workspace').hidden=false;$('#community-panel').hidden=true;updateTabs()}
function renderDrafts(){
 const teams=cloud.list().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
 $('#community-list').innerHTML=teams.length?teams.map(team=>card(team,true)).join(''):'<p class="community-empty">Пока нет черновиков. Создайте пустую команду и начните её заполнять — сохранение включится автоматически.</p>';
}
function updateTabs(){for(const tab of document.querySelectorAll('[data-studio-view]')){const active=tab.dataset.studioView===view;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active))}}
async function show(next){
 if(next==='editor'){showEditor();return}
 if(next==='drafts'&&!root.KTAccount.id){try{await root.KTAccount.requireLogin('drafts')}catch(error){adapter.toast(error.message)}return}
 view=next;$('.workspace').hidden=true;$('#community-panel').hidden=false;updateTabs();
 $('#community-title').textContent=next==='drafts'?'Мои черновики':'Библиотека команд';
 $('#community-description').textContent=next==='drafts'?'Личные команды вашего аккаунта. Продолжайте редактирование с любого устройства.':'Все команды, опубликованные на сайте. Откройте команду, чтобы посмотреть состав, правила и карточки.';
 $('#library-search-label').hidden=next!=='library';$('#community-new').hidden=next!=='drafts';
 const version=++requestVersion;
 $('#community-list').innerHTML='<p class="community-empty">Загружаю команды…</p>';$('#library-pages').innerHTML='';
 try{
  if(next==='drafts'){
   let error;try{await cloud.connect()}catch(e){error=e}
   if(version!==requestVersion)return;
   renderDrafts();
   if(error)$('#community-list').insertAdjacentHTML('afterbegin','<p class="community-empty">Хранилище недоступно. Показываю черновики этого браузера.</p>');
  }else{
   const result=await api('/api/library?q='+encodeURIComponent(query)+'&offset='+offset);
   if(version!==requestVersion)return;
   $('#community-list').innerHTML=result.teams.length?result.teams.map(team=>card(team)).join(''):'<p class="community-empty">'+(query?'По вашему запросу команд не найдено.':'Пока никто не опубликовал команду. Ваша может стать первой.')+'</p>';
   $('#library-pages').innerHTML=(offset?'<button id="library-prev">← Назад</button>':'')+'<span>Команд: '+result.total+'</span>'+(offset+result.teams.length<result.total?'<button id="library-next">Дальше →</button>':'');
  }
 }catch(error){if(version===requestVersion)$('#community-list').innerHTML='<div class="community-empty"><p>'+esc(error.message)+'</p><button id="reload-community">Повторить</button></div>'}
}
async function openDraft(id){
 try{
  const entry=cloud.state(id);
  if(entry?.dirty){await adapter.openLocal(id);showEditor();return}
  const remote=await cloud.api('/api/drafts/'+encodeURIComponent(id));
  if(await adapter.openData(remote.project)){cloud.accept(remote);showEditor();status()}
 }catch(error){adapter.toast('Не удалось открыть черновик: '+error.message)}
}
function renderPublication(){
 const project=publication.project;
 $('#publication-title').textContent=project.team.name;
 $('#publication-info').textContent='Версия '+(project.team.version||'1.0')+' · опубликовано '+date(publication.updatedAt);
 $('#publication-nav').innerHTML=Object.entries(labels).map(([key,label])=>'<button data-publication-section="'+key+'" class="'+(key===publicationSection?'active':'')+'">'+label+'</button>').join('');
 const cards=project[publicationSection]||[],assets={'assets/paper.jpg':'assets/paper.jpg'};
 for(const card of [...project.operatives,...project.teamCards,...(project.lorePages||[]).flatMap(page=>page.images)])if(card.image)assets[card.image]=card.image;
 $('#publication-cards').innerHTML=cards.length?cards.map((item,index)=>{
  const rendered=publicationSection==='lorePages'?KTLore.renderPage(item,project,assets):KTCards.renderCard(item,project,assets,index);
  return '<section class="published-card"><h3>'+esc(item.name||'Пустая карточка')+'</h3>'+rendered.map(side=>'<div class="physical-card '+(publicationSection==='lorePages'?'lore-page':item.kind==='operative'?'landscape':'portrait')+'">'+side.svg+'</div>').join('')+'</section>';
 }).join(''):'<p class="community-empty">В этом разделе нет карточек.</p>';
}
async function openPublication(id){
 try{const result=await api('/api/library/'+encodeURIComponent(id));publication={...result,project:KTModel.validate(KTModel.migrate(result.project))};publicationSection='selectionCards';renderPublication();$('#publication-dialog').showModal()}
 catch(error){adapter.toast('Не удалось открыть команду: '+error.message)}
}
async function publish(){
 if(busy)return;
 busy=true;busyAction='publish';status();
 try{
  if(!await root.KTAccount.requireLogin('publish'))return;
  const snapshot=adapter.getData();if(!snapshot.team.name.trim())throw Error('Укажите название команды перед публикацией.');
  if(!await adapter.persist())throw Error('Не удалось сохранить локальную копию. Скачайте проект файлом.');
  const result=await cloud.save(snapshot.team.id,true);
  adapter.toast('Команда «'+result.name+'» опубликована в библиотеке.');offset=0;query='';$('#library-search').value='';await show('library');
 }catch(error){adapter.toast('Не удалось опубликовать: '+error.message)}finally{busy=false;status()}
}
async function api(url){
 if(cloud)return cloud.api(url);
 const response=await root.KTAccount.request(url),value=await response.json();
 if(!response.ok)throw Error(value.error||'Не удалось загрузить команды.');
 return value;
}
async function save(){
 if(busy)return;
 busy=true;busyAction='save';status();
 try{
  if(!await root.KTAccount.requireLogin('save'))return;
  if(!await adapter.persist())throw Error('Не удалось сохранить локальную копию.');
  await cloud.save(adapter.getData().team.id);
  adapter.toast('Команда сохранена в вашем аккаунте.');
 }catch(error){adapter.toast('Не удалось сохранить: '+error.message)}finally{busy=false;status()}
}
async function resume(){
 try{
  const pending=await root.KTAccount.transfer();
  if(!pending)return;
  if(!await adapter.openData(pending.project))throw Error('Не удалось перенести гостевую команду в аккаунт.');
  if(!await adapter.persist())throw Error('Не удалось сохранить перенесённую команду в браузере.');
  root.KTAccount.finishTransfer();
  if(pending.action==='publish')await publish();
  else if(pending.action==='save')await save();
  else if(pending.action==='download')await adapter.downloadJSON();
  else if(pending.action==='drafts')await show('drafts');
  else adapter.toast('Вход выполнен. Ваши правки перенесены в аккаунт.');
 }catch(error){adapter.toast(error.message)}
}
async function init(options){
 adapter=options;
 if(root.KTAccount.id&&/^https?:$/.test(root.location?.protocol||'')){
  cloud=KTCloud.create({request:root.KTAccount.request,storage:root.KTAccount.storage,loadProject:id=>KTStorage.load('kt-studio-cards-v6:'+id),onChange:status});
  void cloud.connect().then(()=>cloud.flush()).catch(()=>status());
  root.addEventListener('online',()=>cloud.flush());
 }
 status();
 document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.studioView){offset=0;void show(button.dataset.studioView)}
  if(button.id==='new-project')showEditor();
  if(button.id==='publish-team')void publish();
  if(button.id==='retry-cloud')void cloud.flush();
  if(button.id==='copy-conflict')try{
   const id=adapter.getData().team.id;
   if(await adapter.copyProject()){
    const remote=await cloud.api('/api/drafts/'+encodeURIComponent(id));
    if(await KTStorage.save('kt-studio-cards-v6:'+id,JSON.stringify(remote.project)))cloud.accept(remote);
   }
   status();
  }catch(error){adapter.toast(error.message)}
  if(button.id==='community-new'){showEditor();void adapter.createEmptyProject()}
  if(button.id==='reload-community')void show(view);
  if(button.dataset.openDraft)void openDraft(button.dataset.openDraft);
  if(button.dataset.openPublication)void openPublication(button.dataset.openPublication);
  if(button.id==='close-publication')$('#publication-dialog').close();
  if(button.dataset.publicationSection){publicationSection=button.dataset.publicationSection;renderPublication()}
  if(button.id==='library-prev'||button.id==='library-next'){offset=Math.max(0,offset+(button.id==='library-next'?30:-30));void show('library')}
 });
 let searchTimer;
 $('#library-search').addEventListener('input',event=>{query=event.target.value;offset=0;++requestVersion;clearTimeout(searchTimer);searchTimer=setTimeout(()=>show('library'),250)});
 await resume();
}
root.KTCommunity={init,track,status,save,flush:()=>cloud?.flush()};
})(typeof window!=='undefined'?window:globalThis);

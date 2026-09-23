(function(root){
'use strict';
const $=selector=>document.querySelector(selector),esc=value=>KTCards.esc(String(value??''));
const labels={selectionCards:'Состав',teamCards:'Правила команды',strategicPloys:'Strategic Ploys',firefightPloys:'Firefight Ploys',equipment:'Equipment',operatives:'Оперативники',lorePages:'Картинки и лор'};
let cloud,adapter,view='editor',requestVersion=0,query='',offset=0,publication,publicationSection='selectionCards',busy=false,busyAction='',deleteTarget=null,renameTarget=null,libraryTeams=[];
const date=value=>value?new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
function status(){
 if(!adapter)return;
 const entry=cloud?.state(adapter.getData().team.id),guest=!root.KTAccount.id;
 $('#cloud-status').textContent=guest?'Гостевой режим · войдите, чтобы сохранить или опубликовать команду':entry?.saving?'Сохраняю в аккаунт…':entry?.error?'Правки ещё не сохранены в аккаунте · повторите попытку':!cloud?.isReady()?'Подключаю хранилище аккаунта…':entry?.dirty?'Есть правки · сохраняю автоматически':entry?.updatedAt?'Сохранено в аккаунте · '+date(entry.updatedAt):'Первое изменение создаст черновик в аккаунте';
 $('#save-status').textContent=guest?'Гостевые правки · войдите для сохранения в аккаунте':$('#cloud-status').textContent;
 $('#cloud-status').dataset.state=entry?.error?'error':entry?.dirty?'pending':'saved';
 $('#cloud-status').title=entry?.error||'';
 $('#publish-team').disabled=busy;
 $('#publish-team').textContent=busy&&busyAction==='publish'?'Публикую…':entry?.publicationId?'Обновить публикацию':'Опубликовать';
 $('#save-json').disabled=busy;
 $('#save-json').textContent=busy&&busyAction==='save'?'Сохраняю…':'Сохранить команду';
 $('#retry-cloud').hidden=!entry?.error&&!!cloud?.isReady()||guest;
 if(view==='drafts'&&cloud)renderDrafts();
 for(const button of document.querySelectorAll('[data-rename-draft],[data-rename-publication],[data-delete-draft]'))button.disabled=busy;
}
function track(project){if(cloud)cloud.track(project);status()}
function authorLink(team){
 if(!team.author)return '';
 const href=(root.KTCompanion?.serviceUrl('tournament')||'/tournament')+'#/players/'+encodeURIComponent(team.author.id);
 return 'Автор: <a href="'+esc(href)+'">'+esc(team.author.name)+'</a>';
}
function card(team,draft=false){
 const logo=KTModel.isLogo(team.logo)?'<img class="team-tile-logo" src="'+esc(team.logo)+'" alt="" width="96" height="96" loading="lazy">':'';
 const rename=draft||team.canRename?'<button data-rename-'+(draft?'draft':'publication')+'="'+esc(team.id)+'" '+(busy?'disabled':'')+'>Переименовать</button>':'';
 return '<article class="team-tile"><div class="team-tile-top"><span class="team-state">'+(draft?'ЧЕРНОВИК':'ОПУБЛИКОВАНО')+'</span><span>v. '+esc(team.version||'1.0')+'</span></div>'+logo+'<h2>'+esc(team.name||'Без названия')+'</h2><p>'+esc(team.subtitle||'Авторская команда Kill Team')+'</p>'+(!draft?'<p class="team-author">'+authorLink(team)+'</p>':'')+'<div class="team-tile-meta"><span>Оперативников: '+Number(team.operativeCount||0)+'</span><span>'+esc(date(team.updatedAt))+'</span></div>'+(draft?'<p class="draft-note">'+(team.error?'Правки ещё не сохранены в аккаунте. Повторите попытку.':team.dirty?'Есть правки · ожидают автосохранения':team.publishedAt?'Есть публикация · '+esc(date(team.publishedAt)):'Доступен только вам')+'</p>':'')+'<div class="team-tile-actions"><button class="'+(draft?'':'primary')+'" data-'+(draft?'open-draft':'open-publication')+'="'+esc(team.id)+'">'+(draft?'Продолжить редактирование':'Смотреть команду')+'</button>'+rename+(draft?'<button class="danger" data-delete-draft="'+esc(team.id)+'" '+(busy?'disabled':'')+'>Удалить</button>':'')+'</div></article>';
}
function syncViewLocation(){
 const hash='#/'+view;
 if(root.location.hash!==hash)root.history.replaceState(root.history.state,'',root.location.pathname+root.location.search+hash);
}
function showEditor(){++requestVersion;view='editor';$('.workspace').hidden=false;$('#community-panel').hidden=true;updateTabs();syncViewLocation()}
function renderDrafts(){
 const teams=cloud.list().sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
 $('#community-list').innerHTML=teams.length?teams.map(team=>card(team,true)).join(''):'<p class="community-empty">Пока нет черновиков. Создайте пустую команду и начните её заполнять — сохранение включится автоматически.</p>';
}
function updateTabs(){for(const tab of document.querySelectorAll('[data-studio-view]')){const active=tab.dataset.studioView===view;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active))}}
async function show(next){
 if(next==='editor'){showEditor();return}
 if(next==='drafts'&&!root.KTAccount.id){try{await root.KTAccount.requireLogin('drafts')}catch(error){adapter.toast(error.message)}syncViewLocation();return}
 view=next;$('.workspace').hidden=true;$('#community-panel').hidden=false;updateTabs();
 syncViewLocation();
 $('#community-title').textContent=next==='drafts'?'Мои черновики':'Библиотека команд';
 $('#community-description').textContent=next==='drafts'?'Личные команды вашего аккаунта. Продолжайте редактирование с любого устройства.':'Все команды, опубликованные на сайте. Откройте команду, чтобы посмотреть состав, правила и карточки.';
 $('#library-search-label').hidden=next!=='library';$('#community-new').hidden=next!=='drafts';
 const version=++requestVersion;
 $('#community-list').innerHTML='<p class="community-empty">Загружаю команды…</p>';$('#library-pages').innerHTML='';
 try{
  if(next==='drafts'){
   let error;try{await cloud.connect(true)}catch(e){error=e}
   if(version!==requestVersion)return;
   renderDrafts();
   if(error)$('#community-list').insertAdjacentHTML('afterbegin','<p class="community-empty">Хранилище недоступно. Показываю ранее загруженный список черновиков.</p>');
  }else{
   const result=await api('/api/library?q='+encodeURIComponent(query)+'&offset='+offset);
   if(version!==requestVersion)return;
   libraryTeams=result.teams;
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
async function beginRename(id,draft){
 if(busy||!cloud)return;
 busy=true;busyAction='rename';status();
 try{
  let team=draft?cloud.state(id):libraryTeams.find(team=>team.id===id);
  if(!team||(!draft&&!team.canRename))return;
  if(draft&&!team.revision){await cloud.save(id);team=cloud.state(id)}
  if(!team?.revision)throw Error('Сначала сохраните команду в аккаунте.');
  renameTarget={id:draft?team.id:team.projectId,revision:team.remoteRevision??team.revision,publicationId:draft?team.publicationId:team.id};
  $('#rename-project-name').value=team.name||'';
  $('#rename-project-description').textContent=renameTarget.publicationId?'Новое название появится в черновике и опубликованной команде. Остальные правки черновика останутся личными.':'Новое название появится в ваших черновиках и редакторе.';
  $('#rename-project-error').textContent='';$('#review-rename-project').hidden=true;
  $('#rename-project-dialog').showModal();$('#rename-project-name').focus();$('#rename-project-name').select();
 }catch(error){adapter.toast(error.message)}finally{busy=false;busyAction='';status()}
}
async function renameProject(event){
 event.preventDefault();if(busy||!renameTarget)return;
 const name=$('#rename-project-name').value.trim();
 if(!name){$('#rename-project-error').textContent='Введите название команды.';return}
 busy=true;busyAction='rename';status();
 for(const field of $('#rename-project-dialog').querySelectorAll('input,button'))field.disabled=true;
 $('#rename-project-error').textContent='';
 try{
  const result=await cloud.rename(renameTarget.id,name,renameTarget.revision);
  if(publication?.id===renameTarget.publicationId){publication.project.team.name=result.name;publication.name=result.name;renderPublication()}
  $('#rename-project-dialog').close();renameTarget=null;adapter.toast('Название команды изменено.');await show(view);
 }catch(error){$('#rename-project-error').textContent=error.message;$('#review-rename-project').hidden=error.status!==409}
 finally{busy=false;busyAction='';for(const field of $('#rename-project-dialog').querySelectorAll('input,button'))field.disabled=false;status()}
}
function confirmDelete(id){
 if(busy)return;
 const team=cloud?.state(id);if(!team)return;
 deleteTarget={id,revision:team.remoteRevision??team.revision??0};
 $('#delete-project-description').textContent='Команда «'+(team.name||'Без названия')+'» будет удалена из ваших черновиков'+(team.publicationId?' и из публичной библиотеки':'')+'. Локальные копии этой команды будут удалены при подключении к аккаунту. Отменить удаление нельзя.';
 $('#delete-project-error').textContent='';$('#review-delete-project').hidden=true;$('#delete-project-dialog').showModal();
}
async function deleteProject(){
 if(busy||!deleteTarget)return;
 const {id,revision}=deleteTarget;busy=true;busyAction='delete';
 $('#confirm-delete-project').disabled=true;$('#cancel-delete-project').disabled=true;$('#delete-project-error').textContent='';status();
 try{
  await cloud.remove(id,revision);deleteTarget=null;$('#delete-project-dialog').close();
  adapter.toast('Команда удалена.');await show('drafts');
 }catch(error){$('#delete-project-error').textContent=error.message;$('#review-delete-project').hidden=error.status!==409}
 finally{busy=false;busyAction='';$('#confirm-delete-project').disabled=false;$('#cancel-delete-project').disabled=false;status()}
}
function renderPublication(){
 const project=publication.project;
 $('#publication-title').textContent=project.team.name;
 $('#publication-info').textContent='Версия '+(project.team.version||'1.0')+' · опубликовано '+date(publication.updatedAt);
 $('#publication-author').innerHTML=authorLink(publication);
 $('#publication-nav').innerHTML=Object.entries(labels).map(([key,label])=>'<button data-publication-section="'+key+'" class="'+(key===publicationSection?'active':'')+'">'+label+'</button>').join('');
 const cards=project[publicationSection]||[],assets={'assets/paper.jpg':'assets/paper.jpg'};
 for(const card of [...project.operatives,...project.teamCards,...(project.lorePages||[]).flatMap(page=>page.images)])if(card.image)assets[card.image]=card.image;
 $('#publication-cards').innerHTML=cards.length?cards.map((item,index)=>{
  const rendered=publicationSection==='lorePages'?KTLore.renderPage(item,project,assets):KTCards.renderCard(item,project,assets,index);
  return '<section class="published-card"><h3>'+esc(item.name||'Пустая карточка')+'</h3>'+rendered.map((side,sideIndex)=>'<div class="physical-card '+(publicationSection==='lorePages'?'lore-page':item.kind==='operative'?'landscape':'portrait')+'">'+KTCards.inlineSVG(side.svg,'publication-'+publicationSection+'-'+index+'-'+sideIndex)+'</div>').join('')+'</section>';
 }).join(''):'<p class="community-empty">В этом разделе нет карточек.</p>';
}
async function openPublication(id){
 try{const result=await api('/api/library/'+encodeURIComponent(id));publication={...result,project:KTModel.validate(KTModel.migrate(result.project))};publicationSection='selectionCards';$('#publication-export-status').textContent='';renderPublication();$('#publication-dialog').showModal()}
 catch(error){adapter.toast('Не удалось открыть команду: '+error.message)}
}
async function exportPublication(button){
 if(!publication)return;
 const current=publication,snapshot=structuredClone(current.project),format=button.dataset.publicationExport;
 $('#publication-export-status').textContent=format==='pdf'?'Собираю PDF…':'';
 try{
  if(format==='rosz')root.ktStudio.exportROSZ(snapshot);
  if(format==='pdf')await root.ktStudio.exportPDF(null,snapshot,button);
  if(format==='tts'){root.ktStudio.openTTS(snapshot);return}
  if(publication===current)$('#publication-export-status').textContent='Файл опубликованной команды готов.';
 }catch(error){if(publication===current)$('#publication-export-status').textContent='Не удалось экспортировать: '+error.message}
}
async function publish(){
 if(busy)return;
 busy=true;busyAction='publish';status();
 try{
  if(!await root.KTAccount.requireLogin('publish'))return;
  const snapshot=adapter.getData();if(!snapshot.team.name.trim())throw Error('Укажите название команды перед публикацией.');
  if(!await adapter.persist())throw Error('Не удалось подготовить команду к сохранению.');
  const result=await cloud.save(snapshot.team.id,true);
  if(result.recoveredFrom){adapter.toast('Команда изменена в другой вкладке. Правки сохранены отдельным черновиком в аккаунте; при необходимости опубликуйте его.');return}
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
  if(!await adapter.persist())throw Error('Не удалось подготовить команду к сохранению.');
  const result=await cloud.save(adapter.getData().team.id);
  adapter.toast(result?.recoveredFrom?'Команда изменена в другой вкладке. Ваши правки сохранены отдельным черновиком в аккаунте.':'Команда сохранена в вашем аккаунте.');
 }catch(error){adapter.toast('Не удалось сохранить: '+error.message)}finally{busy=false;status()}
}
async function resume(){
 try{
  const pending=await root.KTAccount.transfer();
  if(!pending)return;
  if(!await adapter.openData(pending.project))throw Error('Не удалось перенести гостевую команду в аккаунт.');
  if(!await adapter.persist())throw Error('Не удалось подготовить перенесённую команду.');
  await cloud.save(adapter.getData().team.id);
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
  cloud=KTCloud.create({request:root.KTAccount.request,storage:root.KTAccount.storage,loadProject:id=>KTStorage.load('kt-studio-cards-v6:'+id),onChange:status,onRemove:id=>adapter.removeProject(id),onRename:(id,name)=>adapter.renameProject(id,name),onRecover:async(id,project)=>{await adapter.recoverProject(id,project);adapter.toast('Команда изменена в другой вкладке. Ваши правки сохранены отдельным черновиком в аккаунте.')}});
  try{
   await cloud.connect();
   const localProjects=[];
   for(const id of adapter.localIds()){
    try{
     const saved=await KTStorage.load('kt-studio-cards-v6:'+id);if(!saved)continue;
     const project=KTModel.validate(KTModel.migrate(JSON.parse(saved))),example=root.KT_EXAMPLES?.[id];
     if(example&&JSON.stringify(project)===JSON.stringify(KTModel.validate(KTModel.migrate(example))))continue;
     localProjects.push(project);
    }catch{}
   }
   const active=adapter.getData().team.id,local=localProjects.find(project=>project.team.id===active);
   const selected=cloud.state(active)||(!local?cloud.list().find(team=>team.revision):null);
   if(selected&&!selected.dirty){
    const remote=await cloud.api('/api/drafts/'+encodeURIComponent(selected.id));
    if(await adapter.openData(remote.project))cloud.accept(remote);
   }
   // Preserve access to local projects created before the header picker was removed.
   for(const project of localProjects)if(!cloud.state(project.team.id)&&!cloud.isDeleted(project.team.id))cloud.track(project);
   await cloud.flush();
  }catch(error){adapter.toast('Не удалось подключиться к хранилищу аккаунта: '+error.message);status()}
  const refresh=()=>void cloud.connect(true).then(async()=>{
   const snapshot=adapter.getData(),entry=cloud.state(snapshot.team.id);
   if(entry&&!entry.dirty&&entry.remoteRevision!==entry.revision){
    const remote=await cloud.api('/api/drafts/'+encodeURIComponent(snapshot.team.id));
    if(!cloud.state(snapshot.team.id)?.dirty&&await adapter.openData(remote.project,JSON.stringify(snapshot)))cloud.accept(remote);
   }
   await cloud.flush();
  }).catch(()=>status());
  root.addEventListener('online',refresh);root.addEventListener('focus',refresh);
  root.addEventListener('storage',()=>void cloud.syncRemoved().catch(error=>adapter.toast(error.message)));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();else void cloud.flush()});
  root.addEventListener('beforeunload',event=>{if(cloud.list().some(team=>team.dirty||team.saving)){event.preventDefault();event.returnValue=''}});
 }
 status();
 document.addEventListener('click',async event=>{
  if(event.target.closest('.companion-service-link')&&event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){
   event.preventDefault();query='';offset=0;$('#library-search').value='';void show('library');return;
  }
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.studioView){offset=0;void show(button.dataset.studioView)}
  if(button.id==='publish-team')void publish();
  if(button.id==='retry-cloud')void cloud.connect(true).then(()=>cloud.flush()).catch(error=>adapter.toast(error.message));
  if(button.id==='community-new')adapter.showCreateProject();
  if(button.id==='reload-community')void show(view);
  if(button.dataset.openDraft)void openDraft(button.dataset.openDraft);
  if(button.dataset.deleteDraft)confirmDelete(button.dataset.deleteDraft);
  if(button.dataset.renameDraft)void beginRename(button.dataset.renameDraft,true);
  if(button.dataset.renamePublication)void beginRename(button.dataset.renamePublication,false);
  if(button.id==='cancel-rename-project')$('#rename-project-dialog').close();
  if(button.id==='review-rename-project'){$('#rename-project-dialog').close();void show(view)}
  if(button.id==='confirm-delete-project')void deleteProject();
  if(button.id==='cancel-delete-project')$('#delete-project-dialog').close();
  if(button.id==='review-delete-project'){$('#delete-project-dialog').close();void show('drafts')}
  if(button.dataset.openPublication)void openPublication(button.dataset.openPublication);
  if(button.dataset.publicationExport)void exportPublication(button);
  if(button.id==='close-publication')$('#publication-dialog').close();
  if(button.dataset.publicationSection){publicationSection=button.dataset.publicationSection;renderPublication()}
  if(button.id==='library-prev'||button.id==='library-next'){offset=Math.max(0,offset+(button.id==='library-next'?30:-30));void show('library')}
 });
 let searchTimer;
 $('#library-search').addEventListener('input',event=>{query=event.target.value;offset=0;++requestVersion;clearTimeout(searchTimer);searchTimer=setTimeout(()=>show('library'),250)});
 $('#delete-project-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 $('#rename-project-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
 $('#rename-project-form').addEventListener('submit',renameProject);
 const openLocation=()=>show(/^#\/?(editor|drafts|library)$/.exec(root.location.hash)?.[1]||'library');
 root.addEventListener('hashchange',()=>void openLocation());
 if(!new URLSearchParams(root.location.search).has('resume'))await openLocation();
 await resume();
}
root.KTCommunity={init,track,status,save,showEditor,flush:()=>cloud?.flush()};
})(typeof window!=='undefined'?window:globalThis);

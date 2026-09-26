(function(root){
'use strict';
const $=s=>document.querySelector(s),esc=s=>root.KTCards.esc(s);
let snapshot=null,generation=0,busy=false,csrf='';
async function api(path,options={}){
 const response=await root.KTAccount.request('/api/tts/'+path,{...options,headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
 let data;try{data=await response.json()}catch{throw Error('Сервер экспорта недоступен. Повторите попытку.')}
 if(!response.ok)throw Error(data.error||'Не удалось загрузить набор TTS.');return data;
}
async function session(){
 const response=await root.KTAccount.request('/api/session');const data=await response.json();
 if(!response.ok)throw Error(data.error||'Войдите в аккаунт.');csrf=data.csrfToken;
}
function setBusy(value){
 busy=value;
 for(const node of $('#tts-dialog').querySelectorAll('button'))node.disabled=value;
 $('#open-tts').disabled=value;
}
async function copy(value){
 try{await navigator.clipboard.writeText(value)}catch{
  const input=$('#tts-share-url');input.value=value;$('#tts-share-result').hidden=false;input.focus();input.select();
  $('#tts-share-status').textContent='Выделено для копирования: нажмите Ctrl+C.';return;
 }
 $('#tts-share-status').textContent='Скопировано.';
}
async function list(version=generation){
 if(!root.KTAccount.id){$('#tts-share-list').textContent='Войдите в аккаунт, чтобы создавать ссылки.';return}
 const result=await api('exports?project='+encodeURIComponent(snapshot.team.id));
 if(version!==generation)return;
 $('#tts-share-list').innerHTML=result.exports.length?result.exports.map(item=>'<div class="tts-shared-item"><div><b data-ui-skip>'+esc(item.name)+'</b><p data-ui-skip>'+esc(new Date(item.createdAt).toLocaleString())+' · '+item.cards+' cards · '+item.tokens+' tokens · '+(item.byteSize/1048576).toFixed(1)+' MB</p></div><div class="row-actions"><button data-tts-copy="'+esc(item.url)+'">Копировать ссылку</button><button data-tts-remove="'+esc(item.id)+'" class="danger">Удалить ссылку</button></div></div>').join(''):'<p class="hint">Для этой команды пока нет ссылок.</p>';
}
function open(project){
 snapshot=structuredClone(project);const version=++generation;
 $('#tts-share-status').textContent='';$('#tts-share-result').hidden=true;$('#tts-share-url').value='';
 $('#tts-importer-code').hidden=true;$('#tts-share-list').textContent='Загружаю ссылки…';
 $('#tts-share-local').hidden=!['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 void list(version).catch(error=>{if(version===generation)$('#tts-share-list').textContent=error.message});
}
async function create(){
 if(busy||!snapshot)return;
 try{if(!await root.KTAccount.requireLogin())return}catch(error){$('#tts-share-status').textContent=error.message;return}
 const project=structuredClone(snapshot);setBusy(true);
 try{
  await session();$('#tts-share-status').textContent='Подготавливаю изображения и шрифты…';
  const assets=await root.ktStudio.prepareTTS(project);
  const payload=await root.KTTTS.browserPack(project,assets,{onProgress:(done,total)=>$('#tts-share-status').textContent='Собираю карты и жетоны: '+done+' / '+total});
  $('#tts-share-status').textContent='Загружаю набор на сервер…';
  const result=await api('exports',{method:'POST',body:JSON.stringify(payload)});
  $('#tts-share-url').value=result.url;$('#tts-share-result').hidden=false;
  $('#tts-share-status').textContent='Набор готов. Скопируйте ссылку и вставьте её в KT Studio Importer.';
  await list().catch(error=>{$('#tts-share-list').textContent=error.message});return result;
 }catch(error){$('#tts-share-status').textContent=error.message}
 finally{setBusy(false)}
}
async function remove(id){
 if(busy||!await root.KTDelete.confirm({subject:'Удалить ссылку TTS? Набор и его изображения больше не будут доступны по этой ссылке.'}))return;
 setBusy(true);
 try{
  await session();await api('exports/'+encodeURIComponent(id),{method:'DELETE'});
  if($('#tts-share-url').value.includes('/'+id+'/')){$('#tts-share-result').hidden=true;$('#tts-share-url').value=''}
  await list();$('#tts-share-status').textContent='Ссылка удалена.';
 }catch(error){$('#tts-share-status').textContent=error.message}finally{setBusy(false)}
}
async function copyImporter(){
 try{
  const response=await fetch('/api/studio/tts/importer.lua');if(!response.ok)throw Error('Не удалось загрузить импортёр.');
  const code=await response.text();
  const field=$('#tts-importer-code');field.value=code;field.hidden=false;
  try{await navigator.clipboard.writeText(code);$('#tts-share-status').textContent='Код импортёра скопирован. Вставьте его в скрипт объекта TTS.'}
  catch{field.focus();field.select();$('#tts-share-status').textContent='Нажмите Ctrl+C, чтобы скопировать выделенный код импортёра.'}
 }catch(error){$('#tts-share-status').textContent=error.message}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.id==='tts-share-create')void create();
 if(button.id==='tts-share-copy')void copy($('#tts-share-url').value);
 if(button.id==='tts-copy-importer')void copyImporter();
 if(button.dataset.ttsCopy)void copy(button.dataset.ttsCopy);
 if(button.dataset.ttsRemove)void remove(button.dataset.ttsRemove);
});
$('#tts-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
root.KTTTSShare={open,isBusy:()=>busy};
})(window);

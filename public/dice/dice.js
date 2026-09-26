(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const storageKey = 'kt-companion-d6-v1', projectId = 'companion-d6';
  const defaults = {name:'Мой D6', body:'#202b30', ink:'#ff8a24', style:'pips', valueScale:100, logoFace:6, logoScale:65, tintLogo:false, sizeMm:16, logo:'', logoName:'', sourceId:''};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const imageURI = value => typeof value === 'string' && value.length < 2000000 && /^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(value);
  const color = value => /^#[0-9a-f]{6}$/i.test(value);
  const bounded = (value,min,max) => Number.isFinite(value) && value >= min && value <= max;
  let state = {...defaults}, logoImage = null, logoJob = 0, logoLoading = false, revision = 0, busy = false;
  let teamOffset = 0, teamQuery = '', teamRequest = 0, teams = [], viewX = -24, viewY = 145;
  const faces = Array.from({length:6},(_,i)=>{
    const figure = document.createElement('figure'); figure.className = 'face-swatch';
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
    const caption = document.createElement('figcaption'); caption.textContent = String(i+1); caption.dataset.uiSkip = '';
    figure.append(canvas,caption); $('#face-grid').append(figure); return canvas;
  });
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object') {
      for (const key of ['body','ink']) if (typeof saved[key] === 'string' && color(saved[key])) state[key] = saved[key];
      if (typeof saved.name === 'string') state.name = saved.name.slice(0,120);
      if (['pips','numbers'].includes(saved.style)) state.style = saved.style;
      for (const [key,min,max] of [['logoFace',0,6],['valueScale',30,200],['logoScale',30,200],['sizeMm',12,30]]) if (Number.isInteger(saved[key]) && bounded(saved[key],min,max)) state[key] = saved[key];
      state.tintLogo = saved.tintLogo === true;
      if (imageURI(saved.logo)) {state.logo = saved.logo; state.logoName = String(saved.logoName||'Логотип').slice(0,200); state.sourceId = uuid.test(saved.sourceId) ? saved.sourceId : '';}
    }
  } catch {}
  for (const field of document.querySelectorAll('[data-setting]')) {
    if (field.type === 'checkbox') field.checked = state[field.dataset.setting]; else field.value = state[field.dataset.setting];
  }
  function status(selector, message, error = false) {const node=$(selector); node.textContent=message; node.dataset.error=String(error);}
  function save() {try {localStorage.setItem(storageKey,JSON.stringify(state));} catch {}}
  function changed() {revision++; $('#export-result').hidden=true; status('#export-status',''); save(); render();}
  function syncSource() {
    $('#selected-logo').hidden = !state.logo;
    if (state.logo) $('#selected-logo').src = state.logo; else $('#selected-logo').removeAttribute('src');
    $('#logo-name').textContent = state.logoName || 'Логотип не выбран';
    const url = new URL(location.href);
    if (state.sourceId) url.searchParams.set('team',state.sourceId); else url.searchParams.delete('team');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    for (const button of document.querySelectorAll('[data-team]')) button.setAttribute('aria-pressed',String(button.dataset.team===state.sourceId));
  }
  async function decodeImage(uri) {
    const img = new Image(); img.src=uri;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth*img.naturalHeight > 40000000) throw Error('Изображение слишком большое или повреждено.');
    return img;
  }
  async function setLogo(uri,name,sourceId='') {
    const job = ++logoJob; logoLoading=true; updateButtons();
    try {
      if (!imageURI(uri)) throw Error('У этой команды нет загруженного PNG или JPG логотипа.');
      const image = await decodeImage(uri); if(job!==logoJob)return;
      logoImage=image; state.logo=uri; state.logoName=name; state.sourceId=sourceId;
      if (!state.logoFace) {state.logoFace=6; $('[data-setting="logoFace"]').value='6';}
      syncSource(); changed(); status('#logo-status','Логотип загружен.');
    } catch(error) {if(job===logoJob)status('#logo-status',error.message,true);}
    finally {if(job===logoJob){logoLoading=false; updateButtons();}}
  }
  const pips = {1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
  function drawFace(canvas,value) {
    const ctx=canvas.getContext('2d'), size=canvas.width;
    ctx.clearRect(0,0,size,size); ctx.fillStyle=state.body; ctx.fillRect(0,0,size,size);
    const shade=ctx.createLinearGradient(0,0,size,size); shade.addColorStop(0,'#ffffff09'); shade.addColorStop(.5,'#00000000'); shade.addColorStop(1,'#00000025');
    ctx.fillStyle=shade; ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='#ffffff15'; ctx.lineWidth=size*.008; ctx.strokeRect(size*.03,size*.03,size*.94,size*.94);
    ctx.fillStyle=state.ink;
    if (value===state.logoFace && logoImage) {
      const logo=document.createElement('canvas'); logo.width=logo.height=size;
      const ink=logo.getContext('2d'), max=size*state.logoScale/100, ratio=Math.min(max/logoImage.naturalWidth,max/logoImage.naturalHeight);
      const w=logoImage.naturalWidth*ratio,h=logoImage.naturalHeight*ratio;
      ink.drawImage(logoImage,(size-w)/2,(size-h)/2,w,h);
      if(state.tintLogo){ink.globalCompositeOperation='source-in'; ink.fillStyle=state.ink; ink.fillRect(0,0,size,size);}
      ctx.drawImage(logo,0,0);
    } else if(state.style==='numbers') {
      ctx.font='700 '+size*.58*state.valueScale/100+'px Arial, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(String(value),size/2,size*.525);
    } else {
      for(const [x,y] of pips[value]){ctx.beginPath();ctx.arc(size*(.5+x*.245),size*(.5+y*.245),size*.067*state.valueScale/100,0,Math.PI*2);ctx.fill();}
    }
  }
  function render() {
    for(let i=0;i<6;i++){
      drawFace(faces[i],i+1);
      const canvas=document.querySelector('.cube-face[data-face="'+(i+1)+'"]');canvas.getContext('2d').drawImage(faces[i],0,0);
    }
    $('#logo-scale-value').textContent=state.logoScale+'%';
    $('#value-scale-value').textContent=state.valueScale+'%';
  }
  function atlas() {
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=2048;
    const ctx=canvas.getContext('2d'), cell=2048/3; ctx.fillStyle=state.body;ctx.fillRect(0,0,2048,2048);
    // Native TTS D6.png: blank top third; middle row 2,4,5; bottom 1,3,6.
    // Faces 1 and 6 are rotated 180 degrees in the official template.
    for(const [value,column,row,rotate] of [[2,0,1,0],[4,1,1,0],[5,2,1,0],[1,0,2,1],[3,1,2,0],[6,2,2,1]]){
      const face=document.createElement('canvas'); face.width=face.height=768;drawFace(face,value);
      ctx.save();ctx.translate((column+.5)*cell,(row+.5)*cell);if(rotate)ctx.rotate(Math.PI);
      ctx.drawImage(face,-cell/2,-cell/2,cell,cell);ctx.restore();
    }
    return canvas;
  }
  function validateFields() {
    for(const input of document.querySelectorAll('#design-fields input')) if(!input.checkValidity()){input.reportValidity();return false;}
    if(!state.name.trim()){status('#export-status','Укажи название кубика.',true);$('#die-name').focus();return false;}
    return true;
  }
  function updateButtons() {$('#create-link').disabled=busy||logoLoading;$('#download-png').disabled=busy||logoLoading;}
  $('#design-fields').addEventListener('input',event=>{
    const field=event.target,key=field.dataset.setting;if(!key)return;
    if(!field.checkValidity())return;
    state[key]=field.type==='checkbox'?field.checked:['logoFace','valueScale','logoScale','sizeMm'].includes(key)?Number(field.value):field.value;
    changed();
  });
  async function request(path,options={}) {
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
    let result;try{result=await response.json();}catch{throw Error('Сервер недоступен. Повтори попытку.');}
    if(!response.ok)throw Error(result.error||'Не удалось выполнить запрос.');return result;
  }
  async function loadTeams() {
    const requestId=++teamRequest;$('#team-list').textContent='Загружаю команды…';$('#teams-prev').disabled=$('#teams-next').disabled=true;
    try{
      const data=await request('/api/studio/library?q='+encodeURIComponent(teamQuery)+'&offset='+teamOffset);
      if(requestId!==teamRequest)return;
      if(teamOffset>0&&teamOffset>=data.total){teamOffset=0;return loadTeams();}
      teams=data.teams;$('#team-list').replaceChildren();
      for(const team of teams){
        const button=document.createElement('button');button.type='button';button.className='team-choice';button.dataset.team=team.id;button.setAttribute('aria-pressed',String(team.id===state.sourceId));
        if(imageURI(team.logo)){const img=document.createElement('img');img.src=team.logo;img.alt='';img.loading='lazy';button.append(img);}
        const label=document.createElement('span');label.dataset.uiSkip='';label.textContent=team.name;
        const author=document.createElement('small');author.textContent=(team.author?.name||'')+(!team.logo?' · без логотипа':'');label.append(author);button.append(label);$('#team-list').append(button);
      }
      if(!teams.length)$('#team-list').textContent='Опубликованных команд не найдено. Можно загрузить свой логотип.';
      $('#team-count').textContent=data.total?(teamOffset+1)+'–'+(teamOffset+teams.length)+' / '+data.total:'0';
      $('#teams-prev').disabled=teamOffset===0;$('#teams-next').disabled=teamOffset+teams.length>=data.total;
    }catch(error){if(requestId===teamRequest)$('#team-list').textContent=error.message;}
  }
  $('#team-search-form').addEventListener('submit',event=>{event.preventDefault();teamQuery=$('#team-search').value.trim();teamOffset=0;void loadTeams();});
  $('#teams-prev').addEventListener('click',()=>{teamOffset=Math.max(0,teamOffset-30);void loadTeams();});
  $('#teams-next').addEventListener('click',()=>{teamOffset+=30;void loadTeams();});
  $('#team-list').addEventListener('click',event=>{const button=event.target.closest('[data-team]');const team=button&&teams.find(t=>t.id===button.dataset.team);if(team)void setLogo(team.logo,team.name,team.id);});
  function publicationId(value) {
    if(uuid.test(value))return value;
    const url=new URL(value,location.origin);
    if(!['http:','https:'].includes(url.protocol))throw Error('Нужна ссылка на опубликованную команду.');
    const id=url.searchParams.get('team')||/^#\/(?:team|publication)\/([0-9a-f-]+)$/.exec(url.hash)?.[1]||/^\/api\/studio\/library\/([0-9a-f-]+)$/.exec(url.pathname)?.[1];
    if(!uuid.test(id||''))throw Error('В ссылке не найдена опубликованная команда. Выбери её из каталога.');
    // Extract only a publication ID; never fetch an arbitrary URL supplied by a user.
    return id;
  }
  async function loadPublication(id) {
    const job=++logoJob;logoLoading=true;updateButtons();status('#logo-status','Загружаю логотип команды…');
    try{
      const team=await request('/api/studio/library/'+encodeURIComponent(id));if(job!==logoJob)return;
      await setLogo(team.logo||team.project?.team?.logo,team.name||team.project?.team?.name,id);
    }catch(error){if(job===logoJob)status('#logo-status',error.message,true);}
    finally{if(job===logoJob){logoLoading=false;updateButtons();}}
  }
  $('#team-link-form').addEventListener('submit',event=>{event.preventDefault();try{void loadPublication(publicationId($('#team-link').value.trim()));}catch(error){status('#logo-status',error.message,true);}});
  $('#upload-logo').addEventListener('click',()=>$('#logo-file').click());
  $('#logo-file').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    const job=++logoJob;logoLoading=true;updateButtons();let url;
    try{
      if(file.size>10*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Выбери PNG, JPG или WebP до 10 МБ.');
      url=URL.createObjectURL(file);const image=await decodeImage(url);if(job!==logoJob)return;
      const ratio=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);await setLogo(canvas.toDataURL('image/png'),file.name);
    }catch(error){if(job===logoJob)status('#logo-status',error.message,true);}
    finally{if(url)URL.revokeObjectURL(url);if(job===logoJob){logoLoading=false;updateButtons();}}
  });
  $('#clear-logo').addEventListener('click',()=>{++logoJob;logoLoading=false;logoImage=null;state.logo=state.logoName=state.sourceId='';syncSource();changed();updateButtons();status('#logo-status','');});
  function rotate(){ $('#cube').style.transform='rotateX('+viewX+'deg) rotateY('+viewY+'deg)'; }
  let drag;
  $('#cube-stage').addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,rx:viewX,ry:viewY};event.currentTarget.setPointerCapture(event.pointerId);});
  $('#cube-stage').addEventListener('pointermove',event=>{if(!drag)return;viewX=drag.rx-(event.clientY-drag.y)*.5;viewY=drag.ry+(event.clientX-drag.x)*.5;rotate();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('#cube-stage').addEventListener(name,()=>drag=null);
  $('#cube-stage').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();viewY+=event.key==='ArrowLeft'?-15:event.key==='ArrowRight'?15:0;viewX+=event.key==='ArrowUp'?15:event.key==='ArrowDown'?-15:0;rotate();});
  $('#reset-view').addEventListener('click',()=>{viewX=-24;viewY=145;rotate();});
  $('#download-png').addEventListener('click',()=>{
    if(!validateFields()||busy||logoLoading)return;
    atlas().toBlob(blob=>{if(!blob){status('#export-status','Не удалось сохранить PNG.',true);return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='kt-d6-texture.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);},'image/png');
  });
  async function identity() {
    const {user}=await window.KTCompanion.session();
    if(!user){const link=$('#login-link');link.href=window.KTCompanion.loginUrl();link.hidden=false;throw Error('Для ссылки TTS войди в аккаунт. Оформление сохранено в этом браузере.');}
    $('#login-link').hidden=true;return {'X-Studio-Account':String(user.id)};
  }
  async function writeHeaders() {
    const headers=await identity(),session=await request('/api/studio/session',{headers});
    return {...headers,'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'};
  }
  async function create() {
    if(busy||logoLoading||!validateFields())return;busy=true;updateButtons();
    const version=revision, design={...state};
    try{
      status('#export-status','Собираю кубик…');
      const texture=atlas().toDataURL('image/png');
      const headers=await writeHeaders();
      const payload={version:1,team:{id:projectId,name:design.name.trim(),version:''},sheets:[],cards:[],tokens:[],dice:[{name:design.name.trim(),sizeMm:design.sizeMm,quantity:1,image:'dice.png'}],assets:[{name:'dice.png',data:texture}]};
      const result=await request('/api/studio/tts/exports',{method:'POST',headers,body:JSON.stringify(payload)});
      if(version===revision){
        showExport(result.url);
        status('#export-status','Кубик готов. Выбери PNG для Custom Dice или импорт всего набора.');
      }else status('#export-status','Предыдущий дизайн сохранён в списке кубиков. Для текущих правок создай новую ссылку.');
      if($('#history').open)void loadHistory();
    }catch(error){status('#export-status',error.message,true);}
    finally{busy=false;updateButtons();}
  }
  $('#create-link').addEventListener('click',()=>void create());
  function showExport(url) {
    $('#export-url').value=url;$('#export-result').hidden=false;
    $('#download-object').href=url.replace(/\/manifest$/,'/object.json');
    $('#texture-link').href=url.replace(/\/manifest$/,'/assets/dice.png');
    $('#texture-url').value=$('#texture-link').href;
  }
  async function copy(value,selector) {
    try{await navigator.clipboard.writeText(value);status('#export-status','Ссылка скопирована.');}
    catch{const field=$(selector);const details=field.closest('details');if(details)details.open=true;field.focus();field.select();status('#export-status','Нажми Ctrl+C, чтобы скопировать выделенную ссылку.');}
  }
  $('#copy-link').addEventListener('click',()=>void copy($('#export-url').value,'#export-url'));
  $('#copy-texture').addEventListener('click',()=>void copy($('#texture-url').value,'#texture-url'));
  let historyRequest=0;
  async function loadHistory() {
    const sequence=++historyRequest,host=$('#history-list');host.textContent='Загружаю кубики…';
    try{
      const headers=await identity(),data=await request('/api/studio/tts/exports?project='+projectId,{headers});if(sequence!==historyRequest)return;host.replaceChildren();
      for(const item of data.exports){
        const row=document.createElement('div');row.className='history-item';const info=document.createElement('div'),name=document.createElement('strong');name.dataset.uiSkip='';name.textContent=item.name;
        const date=document.createElement('time');date.dateTime=item.createdAt;date.textContent=new Date(item.createdAt).toLocaleString();info.append(name,date);
        const actions=document.createElement('div');actions.className='button-row';
        const copyButton=document.createElement('button');copyButton.type='button';copyButton.textContent='Открыть экспорт';copyButton.addEventListener('click',()=>{showExport(item.url);$('#export-result').scrollIntoView({block:'center',behavior:'smooth'});status('#export-status','Открыт сохранённый набор: '+item.name);});
        const remove=document.createElement('button');remove.type='button';remove.className='delete-export';remove.textContent='Удалить';remove.addEventListener('click',async()=>{
          if(!confirm('Удалить ссылку на кубик «'+item.name+'»? Сохранённые в TTS объекты могут потерять доступ к текстуре.'))return;
          remove.disabled=true;
          try{await request('/api/studio/tts/exports/'+encodeURIComponent(item.id),{method:'DELETE',headers:await writeHeaders()});if($('#export-url').value===item.url)$('#export-result').hidden=true;await loadHistory();}
          catch(error){status('#export-status',error.message,true);remove.disabled=false;}
        });
        actions.append(copyButton,remove);row.append(info,actions);host.append(row);
      }
      if(!data.exports.length)host.textContent='Сохранённых кубиков пока нет.';
    }catch(error){if(sequence===historyRequest)host.textContent=error.message;}
  }
  $('#history').addEventListener('toggle',()=>{if($('#history').open)void loadHistory();});
  $('#local-note').hidden=!['127.0.0.1','localhost','[::1]'].includes(location.hostname);
  render();rotate();void loadTeams();
  const linkedTeam=new URLSearchParams(location.search).get('team');
  if(linkedTeam){if(uuid.test(linkedTeam))void loadPublication(linkedTeam);else status('#logo-status','Некорректная ссылка команды.',true);}
  else if(state.logo)void setLogo(state.logo,state.logoName,state.sourceId);
})();

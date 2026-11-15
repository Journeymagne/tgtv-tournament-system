(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const questions = JSON.parse($('question-data').textContent);
  const batchId = 'kt-review-2026-10-16-v1';
  const key = 'kt-question-review:' + batchId;
  const names = { 1:'Рекрут', 2:'Боец', 3:'Ветеран', 4:'Эксперт' };
  const ids = new Set(questions.map(q => q.id));
  let review = { batchId, selectedIds:[], notes:{}, updatedAt:null };
  let level = 'all', pageIndex = 0;
  const embedded = JSON.parse($('saved-review').textContent || 'null');
  let local;
  try { local = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* Portable file still works without storage. */ }
  function normalized(value) {
    if (!value || value.batchId !== batchId || !Array.isArray(value.selectedIds) || value.selectedIds.some(id => typeof id !== 'string' || !ids.has(id))) throw Error('Это не файл выбора для данного набора из 200 вопросов.');
    const notes = {};
    for (const [id, note] of Object.entries(value.notes || {})) if (ids.has(id) && typeof note === 'string') notes[id] = note.slice(0,5000);
    return { batchId, selectedIds:[...new Set(value.selectedIds)], notes, updatedAt:typeof value.updatedAt === 'string' ? value.updatedAt : null };
  }
  for (const saved of [embedded,local].filter(Boolean).sort((a,b)=>(Date.parse(a.updatedAt)||0)-(Date.parse(b.updatedAt)||0))) {
    try { review = normalized(saved); } catch { /* Ignore stale or unrelated browser data. */ }
  }
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let selected = new Set(review.selectedIds);
  function status(text, error=false) { $('save-state').textContent=text; $('save-state').classList.toggle('error',error); }
  function snapshot() { return {...review, selectedIds:questions.filter(q=>selected.has(q.id)).map(q=>q.id)}; }
  function persist() {
    review.updatedAt = new Date().toISOString();
    try { localStorage.setItem(key,JSON.stringify(snapshot())); status('Сохранено в этом браузере'); }
    catch { status('Браузер не сохраняет отметки. Скачайте JSON или HTML перед закрытием.',true); }
    counts();
  }
  function counts() {
    $('selection-count').textContent = 'Выбрано '+selected.size+' из 200';
    $('export-json').disabled = selected.size === 0 && !Object.values(review.notes).some(Boolean);
    for (const button of $('levels').querySelectorAll('button')) {
      const list = questions.filter(q=>button.dataset.level==='all'||String(q.difficulty)===button.dataset.level);
      button.querySelector('small').textContent=list.length+' вопросов · '+list.filter(q=>selected.has(q.id)).length+' выбрано';
      button.setAttribute('aria-pressed',String(button.dataset.level===level));
    }
  }
  function filtered() {
    const search=$('search').value.trim().toLocaleLowerCase('ru'), topic=$('topic').value;
    return questions.filter(q=>(level==='all'||String(q.difficulty)===level)&&(topic==='all'||q.topic===topic)&&(!$('selected-only').checked||selected.has(q.id))&&(!search||[q.id,q.question,q.topic,...q.options,q.explanation,q.source.section,review.notes[q.id]||''].join(' ').toLocaleLowerCase('ru').includes(search)));
  }
  function render() {
    const list=filtered(), size=Number($('page-size').value), pages=Math.max(1,Math.ceil(list.length/size));
    pageIndex=Math.min(pageIndex,pages-1);
    const visible=list.slice(pageIndex*size,(pageIndex+1)*size);
    $('rows').innerHTML=visible.map(q=>`<tr data-id="${q.id}" class="${selected.has(q.id)?'chosen':''}"><td><label class="select-cell"><input type="checkbox" data-select="${q.id}" aria-label="Добавить ${q.id}" ${selected.has(q.id)?'checked':''}>Добавить</label><span class="qid">${q.id.toUpperCase()}</span></td><td><span class="badge">${q.difficulty} · ${names[q.difficulty]}</span><span class="topic">${esc(q.topic)}</span><p class="question-text">${esc(q.question)}</p><a class="source" href="${esc(q.source.url)}" target="_blank" rel="noopener noreferrer">${esc(q.source.title)} ↗<br>${esc(q.source.section)}</a></td><td><ol class="options-list" type="A">${q.options.map((text,i)=>`<li class="${i===q.answer?'correct':''}">${esc(text)}${i===q.answer?' ✓':''}</li>`).join('')}</ol></td><td><div class="answer-label">Верный ответ: ${'ABCD'[q.answer]}</div><p class="explanation-text">${esc(q.explanation)}</p><label class="note-label">Замечание к ${q.id}<textarea class="note" data-note="${q.id}" maxlength="5000" placeholder="Что уточнить или изменить…">${esc(review.notes[q.id]||'')}</textarea></label></td></tr>`).join('');
    $('found-count').textContent='Найдено '+list.length+' из 200 вопросов';
    $('page-status').textContent=list.length?'Показаны '+(pageIndex*size+1)+'–'+Math.min((pageIndex+1)*size,list.length)+' из '+list.length+' · страница '+(pageIndex+1)+' / '+pages:'0 вопросов';
    $('previous').disabled=pageIndex===0; $('next').disabled=pageIndex>=pages-1;
    $('questions').hidden=!list.length; $('empty').hidden=!!list.length;
    $('select-filtered').disabled=!list.length; $('unselect-filtered').disabled=!list.some(q=>selected.has(q.id));
    counts();
  }
  $('levels').innerHTML=['all',1,2,3,4].map(n=>`<button data-level="${n}" aria-pressed="${n==='all'}"><b>${n==='all'?'Все уровни':n+' · '+names[n]}</b><small></small></button>`).join('');
  $('topic').replaceChildren(new Option('Все темы','all'));
  for (const topic of [...new Set(questions.map(q=>q.topic))].sort((a,b)=>a.localeCompare(b,'ru'))) { const option=document.createElement('option');option.value=topic;option.textContent=topic;$('topic').append(option); }
  $('levels').addEventListener('click',event=>{const button=event.target.closest('[data-level]');if(!button)return;level=button.dataset.level;pageIndex=0;render();});
  for (const id of ['search','topic','selected-only','page-size']) $(id).addEventListener(id==='search'?'input':'change',()=>{pageIndex=0;render();});
  $('rows').addEventListener('change',event=>{const id=event.target.dataset.select;if(!id)return;event.target.checked?selected.add(id):selected.delete(id);persist();if($('selected-only').checked)render();else{event.target.closest('tr').classList.toggle('chosen',selected.has(id));$('unselect-filtered').disabled=!filtered().some(q=>selected.has(q.id));}});
  $('rows').addEventListener('input',event=>{const id=event.target.dataset.note;if(!id)return;review.notes[id]=event.target.value;persist();});
  $('select-filtered').addEventListener('click',()=>{for(const q of filtered())selected.add(q.id);persist();render();});
  $('unselect-filtered').addEventListener('click',()=>{const list=filtered().filter(q=>selected.has(q.id));if(!list.length||!confirm('Снять отметку «Добавить» у '+list.length+' найденных вопросов? Замечания сохранятся.'))return;for(const q of list)selected.delete(q.id);persist();render();});
  for(const [id,step] of [['previous',-1],['next',1]])$(id).addEventListener('click',()=>{pageIndex+=step;render();$('questions').scrollIntoView({block:'start'});});
  function download(name,data,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  $('export-json').addEventListener('click',()=>download('know-thy-kill-team-selection.json',JSON.stringify({...snapshot(),exportedAt:new Date().toISOString(),questions:questions.filter(q=>selected.has(q.id))},null,2),'application/json;charset=utf-8'));
  $('export-csv').addEventListener('click',()=>{
    const cell=value=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
    const rows=[['Добавить','ID','Уровень','Тема','Вопрос','A','B','C','D','Ответ','Объяснение','Источник','Раздел','Замечание'],...filtered().map(q=>[selected.has(q.id)?'Да':'Нет',q.id,names[q.difficulty],q.topic,q.question,...q.options,'ABCD'[q.answer],q.explanation,q.source.url,q.source.section,review.notes[q.id]||''])];
    download('know-thy-kill-team-review.csv','\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
  });
  $('save-html').addEventListener('click',()=>{
    const clone=document.documentElement.cloneNode(true);
    clone.querySelector('#saved-review').textContent=JSON.stringify(snapshot()).replaceAll('<','\\u003c');
    const runtime=clone.querySelector('#review-runtime');runtime.removeAttribute('src');runtime.textContent=JSON.parse($('review-code').textContent);
    clone.querySelector('#rows').replaceChildren();
    download('Know-Thy-Kill-Team-reviewed.html','<!doctype html>\n'+clone.outerHTML,'text/html;charset=utf-8');
  });
  $('import').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>3000000)throw Error('Файл слишком большой. Выберите JSON, сохранённый этой таблицей.');const loaded=normalized(JSON.parse(await file.text()));if((selected.size||Object.values(review.notes).some(Boolean))&&!confirm('Заменить текущие отметки и замечания выбором из файла?'))return;review=loaded;selected=new Set(loaded.selectedIds);persist();render();status('Выбор загружен и сохранён');}catch(error){status(error.message,true);}finally{event.target.value='';}
  });
  function applyTheme(value){document.documentElement.dataset.theme=value;$('theme').textContent=value==='dark'?'☀ Светлая тема':'☾ Тёмная тема';}
  try{applyTheme(localStorage.getItem('kt-review-theme')||document.documentElement.dataset.theme);}catch{applyTheme(document.documentElement.dataset.theme);}
  $('theme').addEventListener('click',()=>{const value=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(value);try{localStorage.setItem('kt-review-theme',value);}catch{}});
  status(review.updatedAt?'Отметки восстановлены':'Пока ничего не выбрано');render();
})();

(function (root) {
  'use strict';
  const now = new Date();
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const parseDate = value => new Date(`${value}T12:00:00`);
  function monthDays(month) {
    const first = parseDate(`${month}-01`), offset = (first.getDay()+6)%7;
    const count = Math.ceil((offset+new Date(first.getFullYear(),first.getMonth()+1,0).getDate())/7)*7;
    return Array.from({ length:count }, (_,i)=>dateKey(new Date(first.getFullYear(),first.getMonth(),1-offset+i)));
  }
  function filterEvents(events, filters) {
    const needle = filters.search.trim().toLocaleLowerCase();
    return events.filter(e=>(!filters.city||e.city===filters.city)&&(!filters.type||
      (['individual','team'].includes(filters.type)?(e.participantMode||(e.tournamentType==='solo'?'individual':'team'))===filters.type:e.tournamentType===filters.type))&&
      (!needle||`${e.name} ${e.city} ${e.venue}`.toLocaleLowerCase().includes(needle)));
  }
  function cityItems(catalog = [], extra = []) {
    const key = value => String(value).trim().normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
    const items = new Map();
    for (const name of extra) if(typeof name==='string' && name.trim())items.set(key(name),{value:name,label:name,search:name});
    for (const city of catalog) {
      if(!city||typeof city.name!=='string'||!city.name.trim())continue;
      const existing=items.get(key(city.name));
      items.set(key(city.name),{value:existing?.value||city.name,label:existing?.label||city.name,search:[city.name,city.search,existing?.search].filter(Boolean).join(' ')});
    }
    return [...items.values()].sort((a,b)=>a.label.localeCompare(b.label,'ru'));
  }
  let cityCatalogPromise = null;
  function loadCityCatalog() {
    if(!cityCatalogPromise)cityCatalogPromise=fetch('/cities/cities.json?v=1').then(response=>{
      if(!response.ok)throw Error('City dictionary unavailable');
      return response.json();
    }).then(data=>Array.isArray(data)?data:[]).catch(()=>{cityCatalogPromise=null;return [];});
    return cityCatalogPromise;
  }
  function cityField(name, value, catalog, extra = [], optional = false) {
    return ctx.comboField(tr('city'),name,'calendarCities',value,
      optional&&name==='calendarCityFilter'?tr('allCities'):ctx.t('tournaments.combo.defaultPlaceholder'),
      {items:cityItems(catalog,extra),valueMode:'label',optional});
  }
  let host, ctx, request = 0, loadedMonth = '', loading = false, error = '';
  let events = [], selectedId = null, selectedDate = dateKey(now), month = selectedDate.slice(0,7), scope = 'day';
  let filters = { search:'',city:'',type:'' }, filtersOpen = false;
  const active = () => host?.isConnected && ctx?.isCurrent();
  const tr = (key, params) => ctx.t(`calendar.${key}`,params);
  const esc = value => ctx.escapeHtml(String(value??''));
  const fmt = (value, options) => new Intl.DateTimeFormat(ctx.locale(),options).format(parseDate(value));
  const fee = event => event.entryFee==null ? tr('feePending') : Number(event.entryFee) === 0 ? tr('free') : new Intl.NumberFormat(ctx.locale(),{ style:'currency',currency:'RUB',maximumFractionDigits:2 }).format(event.entryFee);
  const capacity = event => event.participantLimit==null ? tr('capacityPending') : tr('players',{count:event.participantLimit});
  const title = event => event.name || ctx.t('tournaments.list.untitled');
  const place = event => [event.city,event.venue].filter(Boolean).join(' · ') || event.address || tr(event.venueMode==='tts'?'online':'locationPending');
  const eventMode = e => e?.participantMode || (e?.tournamentType && e.tournamentType!=='solo'?'team':'individual');
  const eventSize = e => e?.teamSize || (e?.tournamentType==='pairs'?2:3);
  const type = e => ctx.t('tournaments.participantMode.'+eventMode(e));
  const eventClass = event => `calendar-format-${eventMode(event)}${event.isParticipant?' calendar-my-event':''}`;
  const participationBadge = event => event.isParticipant ? `<span class="calendar-participation"><span aria-hidden="true">✓</span> ${tr('participating')}</span>` : '';
  const eventBadges = event => `<span class="calendar-event-badges"><span class="status calendar-format-label">${type(event)}</span>${participationBadge(event)}</span>`;
  function formatDetails(event) {
    return `<div><dt>${tr('rounds')}</dt><dd>${event.swissRoundCount??3}</dd></div>${eventMode(event)==='team'?`<div><dt>${tr('teamSize')}</dt><dd>${eventSize(event)}</dd></div>`:''}`;
  }
  function formatFields(event) {
    const mode=eventMode(event), size=eventSize(event);
    return `<div class="calendar-form-grid"><div class="field"><label for="calendar-edit-mode">${ctx.t('admin.tournament.field.participantMode')}</label><select id="calendar-edit-mode" name="participantMode">${['individual','team'].map(value=>`<option value="${value}" ${mode===value?'selected':''}>${ctx.t('tournaments.participantMode.'+value)}</option>`).join('')}</select></div><div class="field"><label for="calendar-edit-rounds">${tr('rounds')}</label><input id="calendar-edit-rounds" name="swissRoundCount" type="number" min="1" max="2147483647" step="1" required value="${event?.swissRoundCount??3}"></div></div><div class="field" data-calendar-team-size ${mode==='team'?'':'hidden'}><label for="calendar-edit-team-size">${tr('teamSize')}</label><select id="calendar-edit-team-size" name="teamSize" ${mode==='team'?'':'disabled'}>${[2,3].map(value=>`<option value="${value}" ${size===value?'selected':''}>${value}</option>`).join('')}</select></div>`;
  }
  const filtered = () => filterEvents(events,filters);
  const small = () => matchMedia('(max-width: 760px)').matches;
  const selected = () => filtered().find(e=>e.id===selectedId);

  function monthMarkup() {
    const list = filtered(), today = dateKey(new Date());
    return `<section class="card panel calendar-month"><div class="panel-header"><h3>${esc(fmt(`${month}-01`,{month:'long',year:'numeric'}))}</h3><div class="row-actions"><button type="button" class="small-button" data-calendar-month="-1" aria-label="${tr('previousMonth')}">‹</button><button type="button" class="small-button" data-calendar-month="1" aria-label="${tr('nextMonth')}">›</button></div></div><div class="calendar-weekdays" aria-hidden="true">${Array.from({length:7},(_,i)=>`<span>${esc(new Intl.DateTimeFormat(ctx.locale(),{weekday:'short'}).format(new Date(2026,10,2+i)))}</span>`).join('')}</div><div class="calendar-dates">${monthDays(month).map(date=>{
      const dayEvents = list.filter(e=>e.date===date), has = dayEvents.length>0, mine = dayEvents.some(e=>e.isParticipant);
      const modes = ['individual','team'].filter(mode=>dayEvents.some(e=>eventMode(e)===mode));
      return `<button type="button" class="calendar-date ${date.slice(0,7)!==month?'outside':''} ${has?'has-events':''} ${mine?'calendar-my-date':''} ${date===today?'today':''} ${date===selectedDate?'active':''}" data-calendar-date="${date}" aria-pressed="${date===selectedDate}" ${date===today?'aria-current="date"':''} aria-label="${esc(fmt(date,{day:'numeric',month:'long'}))}${has?' · '+tr('hasEvents'):''}${mine?' · '+tr('participating'):''}"><span>${parseDate(date).getDate()}</span>${mine?'<span class="calendar-date-check" aria-hidden="true">✓</span>':''}<span class="calendar-date-dots" aria-hidden="true">${modes.map(mode=>`<i class="calendar-dot calendar-format-${mode}"></i>`).join('')}</span></button>`;
    }).join('')}</div><div class="calendar-month-footer"><div class="calendar-legend">${['individual','team'].map(mode=>`<span class="calendar-format-${mode}"><i class="calendar-dot" aria-hidden="true"></i>${ctx.t('tournaments.participantMode.'+mode)}</span>`).join('')}${ctx.user?`<span class="calendar-legend-mine"><span aria-hidden="true">✓</span> ${tr('participating')}</span>`:''}</div><button type="button" class="ghost-button" data-calendar-today>${tr('today')}</button></div></section>`;
  }

  function eventRow(event) {
    return `<button type="button" class="row-card calendar-event-row ${eventClass(event)} ${event.id===selectedId?'active':''}" data-calendar-event="${event.id}"><span class="calendar-event-line">${eventBadges(event)}<span class="muted">${event.time||tr('timePending')}</span></span><strong>${esc(title(event))}</strong><span class="calendar-event-location">${esc(place(event))}</span><span class="calendar-event-line calendar-event-footer"><span>${capacity(event)}</span><b>${esc(fee(event))}</b></span></button>`;
  }

  function details(event, dialog = false) {
    if (!event) return `<section class="card panel calendar-details"><p class="empty">${tr('selectEvent')}</p></section>`;
    let action = '';
    if (event.tournament) {
      const href = ctx.user?.isAdmin ? `/tournament#/administration/tournaments/admin/${event.tournament.id}` : `/tournaments/${encodeURIComponent(event.tournament.slug)}`;
      action = `<a href="${href}" class="primary-button">${tr('openTournament')}</a>`;
    } else if (event.tournamentCreated) action = `<p class="muted">${tr('tournamentPending')}</p>`;
    else if (ctx.user?.isAdmin) action = `<a class="primary-button" target="_blank" rel="noopener" href="/tournament?calendarEvent=${event.id}#/administration/tournaments/admin/create">${tr('createTournament')} ↗</a>`;
    return `<article class="${dialog?'calendar-dialog-details':'card panel calendar-details'} ${eventClass(event)}">${poster(event)}<div class="panel-header"><div><p class="profile-label">${tr('event')}</p><h3 ${dialog?'id="calendar-event-dialog-title"':''}>${esc(title(event))}</h3></div>${dialog?`<button class="dialog-close-button" type="button" data-calendar-close aria-label="${ctx.t('common.close')}">&times;</button>`:''}</div>${eventBadges(event)}<dl class="calendar-event-fields"><div><dt>${tr('date')}</dt><dd>${esc(fmt(event.date,{day:'numeric',month:'long',year:'numeric'}))}${event.time?' · '+event.time:''}</dd></div><div><dt>${tr('city')}</dt><dd>${esc(event.city||tr('notSpecified'))}</dd></div><div><dt>${tr('venue')}</dt><dd>${esc(event.venue||(!event.address?tr(event.venueMode==='tts'?'online':'locationPending'):''))}${event.address?`<span class="muted">${esc(event.address)}</span>`:''}</dd></div><div><dt>${tr('tournamentType')}</dt><dd>${type(event)}</dd></div>${formatDetails(event)}<div><dt>${tr('participantLimit')}</dt><dd>${capacity(event)}</dd></div><div><dt>${tr('entryFee')}</dt><dd>${esc(fee(event))}</dd></div></dl><div class="row-actions calendar-detail-actions">${action}</div>${ctx.user?.isAdmin?`<div class="row-actions calendar-admin-actions"><button class="small-button" data-calendar-edit="${event.id}" type="button">${ctx.t('common.edit')}</button><button class="danger-button" data-calendar-delete="${event.id}" type="button">${ctx.t('common.delete')}</button></div>`:''}</article>`;
  }

  function poster(event) {
    if(typeof event.posterUrl!=='string'||!/^\/api\/tournament-logos\/\d+$/.test(event.posterUrl))return '';
    return `<a class="calendar-poster" href="${esc(event.posterUrl)}" target="_blank" rel="noopener" aria-label="${tr('openPoster')}"><img src="${esc(event.posterUrl)}" alt="${esc(tr('posterAlt',{name:event.name}))}" decoding="async"></a>`;
  }

  function render() {
    if (!active()) return;
    const list = filtered(), dayList = list.filter(e=>e.date===selectedDate);
    const visible = small() && scope==='day' ? dayList : list;
    const dates = [...new Set(visible.map(e=>e.date))], cities = [...new Set(events.map(e=>e.city))].sort();
    host.innerHTML = `<section class="card panel calendar-header"><div class="panel-header"><div><h2>${tr('title')}</h2><p class="muted">${tr('intro')}</p></div>${ctx.user?.isAdmin?`<button class="primary-button" type="button" data-calendar-add>${tr('add')}</button>`:''}</div><div class="calendar-search-row"><div class="field"><label for="calendar-search">${tr('search')}</label><input id="calendar-search" type="search" maxlength="120" value="${esc(filters.search)}" placeholder="${tr('searchPlaceholder')}"></div><button class="small-button calendar-filter-toggle" type="button" data-calendar-filters aria-expanded="${filtersOpen}" aria-controls="calendar-filter-fields">${tr('filters')}${filters.city||filters.type?' ·':''}</button></div><div id="calendar-filter-fields" class="calendar-filter-fields ${filtersOpen?'is-open':''}">${cityField('calendarCityFilter',filters.city,[],cities,true)}<div class="field"><label for="calendar-type">${tr('tournamentType')}</label><select id="calendar-type"><option value="">${tr('allTypes')}</option>${['individual','team'].map(value=>`<option value="${value}" ${filters.type===value?'selected':''}>${ctx.t('tournaments.participantMode.'+value)}</option>`).join('')}</select></div></div></section><div class="event-calendar-layout"><div class="calendar-month-column">${monthMarkup()}<p class="field-help calendar-desktop-hint">${tr('monthHint')}</p></div><section class="calendar-event-list" aria-label="${tr('events')}"><div class="calendar-list-header"><h3>${small()&&scope==='day'?esc(fmt(selectedDate,{day:'numeric',month:'long'})):tr('events')} <span class="muted">${visible.length}</span></h3><div class="tabs calendar-scope"><button type="button" class="tab ${scope==='day'?'active':''}" data-calendar-scope="day" aria-pressed="${scope==='day'}">${tr('day')}</button><button type="button" class="tab ${scope==='month'?'active':''}" data-calendar-scope="month" aria-pressed="${scope==='month'}">${tr('month')}</button></div></div>${loading?`<div class="card panel" role="status">${ctx.t('common.loading')}</div>`:error?`<div class="card panel"><p role="alert">${esc(error)}</p><button class="small-button" type="button" data-calendar-retry>${tr('retry')}</button></div>`:dates.map(date=>`<section class="calendar-date-group" id="calendar-day-${date}"><h4>${esc(fmt(date,{weekday:'long',day:'numeric',month:'long'}))}</h4>${visible.filter(e=>e.date===date).map(eventRow).join('')}</section>`).join('')||`<section class="card panel calendar-empty"><h3>${tr(small()&&scope==='day'?'emptyDay':'emptyMonth')}</h3><p class="muted">${tr('emptyHint')}</p>${small()&&scope==='day'?`<button type="button" class="small-button" data-calendar-scope="month">${tr('viewMonth')}</button>`:''}</section>`}</section><aside class="calendar-detail-column">${details(selected())}</aside></div><p class="field-help calendar-time-hint">${tr('localTime')}</p>`;
    wire(host);
  }

  async function load() {
    const token = ++request, target = host, requestedMonth = month;
    loading = true; error = ''; events = []; render();
    try {
      const data = await ctx.api(`/api/calendar-events?month=${encodeURIComponent(month)}`);
      if (token!==request || target!==host || requestedMonth!==month || !active()) return;
      events = data.events; loadedMonth = month;
      if (!events.some(e=>e.id===selectedId)) selectedId = events.find(e=>e.date===selectedDate)?.id || null;
    } catch (e) { if(token===request && target===host && active()) error=e.message; }
    finally { if(token===request && target===host && active()){loading=false;render();} }
  }

  function closeDialogs() {
    document.querySelectorAll('[data-calendar-dialog]').forEach(d=>{d.close();d.remove();});
  }
  function openDetails(event) {
    closeDialogs();
    const dialog=document.createElement('dialog');
    dialog.className='tiebreaker-help-dialog calendar-event-dialog';dialog.dataset.calendarDialog='';
    dialog.setAttribute('aria-labelledby','calendar-event-dialog-title');
    dialog.innerHTML=`<div class="tiebreaker-help-content">${details(event,true)}</div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    wire(dialog);dialog.showModal();
  }

  function wire(root) {
    ctx.wireComboFields(root);
    root.querySelectorAll('[data-combo-options="calendarCities"] [data-combo-input]').forEach(input=>input.maxLength=80);
    const cityFilter=root.querySelector('[name="calendarCityFilter"]');
    if(cityFilter)cityFilter.addEventListener('change',()=>{filters.city=cityFilter.value.trim();render();});
    root.querySelectorAll('[data-calendar-month]').forEach(b=>b.onclick=()=>{
      const d=parseDate(month+'-01');d.setMonth(d.getMonth()+Number(b.dataset.calendarMonth));
      if(d.getFullYear()<2000||d.getFullYear()>2099)return;
      month=dateKey(d).slice(0,7);selectedDate=dateKey(d);selectedId=null;load();
    });
    root.querySelectorAll('[data-calendar-today]').forEach(b=>b.onclick=()=>{
      selectedDate=dateKey(new Date());month=selectedDate.slice(0,7);selectedId=null;load();
    });
    root.querySelectorAll('[data-calendar-date]').forEach(b=>b.onclick=()=>{
      const date=b.dataset.calendarDate;selectedDate=date;selectedId=filtered().find(e=>e.date===date)?.id||null;
      if(month!==date.slice(0,7)){month=date.slice(0,7);load();return;}
      scope='day';render();
      if(!small())host.querySelector(`#calendar-day-${date}`)?.scrollIntoView({block:'nearest'});
    });
    root.querySelectorAll('[data-calendar-event]').forEach(b=>b.onclick=()=>{
      selectedId=Number(b.dataset.calendarEvent);const event=selected();selectedDate=event.date;render();if(matchMedia('(max-width: 1350px)').matches)openDetails(event);
    });
    root.querySelectorAll('[data-calendar-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.calendarScope;render();});
    root.querySelector('[data-calendar-filters]')?.addEventListener('click',()=>{filtersOpen=!filtersOpen;render();});
    root.querySelector('[data-calendar-retry]')?.addEventListener('click',load);
    const input=root.querySelector('#calendar-search');
    if(input)input.oninput=e=>{const pos=e.target.selectionStart;filters.search=e.target.value;render();const field=host.querySelector('#calendar-search');field.focus();field.setSelectionRange(pos,pos);};
    ['city','type'].forEach(name=>{const input=root.querySelector('#calendar-'+name);if(input)input.onchange=e=>{filters[name]=e.target.value;render();};});
    root.querySelectorAll('[data-calendar-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
    root.querySelector('[data-calendar-add]')?.addEventListener('click',()=>editEvent());
    root.querySelectorAll('[data-calendar-edit]').forEach(b=>{const event=events.find(e=>e.id===Number(b.dataset.calendarEdit));b.onclick=()=>{if(event)editEvent(event);};});
    root.querySelectorAll('[data-calendar-delete]').forEach(b=>{
      const event=events.find(e=>e.id===Number(b.dataset.calendarDelete));
      b.onclick=async()=>{
      if(!event)return;
      if(!await ctx.confirmDelete(tr('confirmDelete',{name:event.name}),ctx.t('common.delete')))return;
      b.disabled=true;
      try{await ctx.api(`/api/admin/calendar-events/${event.id}`,{method:'DELETE'});closeDialogs();selectedId=null;await load();}
      catch(e){let message=root.querySelector('[data-calendar-action-error]');if(!message){message=document.createElement('p');message.dataset.calendarActionError='';message.setAttribute('role','alert');b.parentElement.after(message);}message.textContent=e.message;b.disabled=false;}
    };});
  }

  async function editEvent(event) {
    const catalog=await loadCityCatalog();
    if(!active())return;
    closeDialogs();const dialog=document.createElement('dialog');
    dialog.className='tiebreaker-help-dialog administration-dialog calendar-edit-dialog';dialog.dataset.calendarDialog='';dialog.setAttribute('aria-labelledby','calendar-edit-title');
    const field=(name,label,attrs,value)=>`<div class="field"><label for="calendar-edit-${name}">${tr(label)}</label><input id="calendar-edit-${name}" name="${name}" ${attrs} value="${esc(value)}"></div>`;
    dialog.innerHTML=`<form class="tiebreaker-help-content"><div class="panel-header"><h3 id="calendar-edit-title">${event?ctx.t('common.edit'):tr('add')}</h3><button type="button" class="dialog-close-button" data-calendar-close aria-label="${ctx.t('common.close')}">&times;</button></div>${field('name','name',`${event?.autoCreated?'':'required'} maxlength="120"`,event?.name||'')}<div class="calendar-form-grid">${field('date','date','type="date" min="2000-01-01" max="2099-12-31" required',event?.date||selectedDate)}${field('time','time','type="time"',event?.time||'')}</div>${cityField('city',event?.city||'',catalog,[...events.map(item=>item.city),event?.city].filter(Boolean),!!event?.autoCreated)}${field('venue','venue',`${event?.autoCreated?'':'required'} maxlength="160"`,event?.venue||'')}${field('address','address',`maxlength="${event?.autoCreated?500:300}"`,event?.address||'')}${formatFields(event)}<div class="calendar-form-grid">${field('participantLimit','participantLimit',`type="number" min="2" max="10000" step="1" ${event?.autoCreated?'':'required'}`,event?.autoCreated?(event.participantLimit??''):(event?.participantLimit||32))}${field('entryFee','feeRubles',`type="number" min="0" max="1000000" step="0.01" ${event?.autoCreated?'':'required'}`,event?.autoCreated?(event.entryFee??''):(event?.entryFee??0))}</div><p class="field-help">${tr('capacityHint')}</p>${event?.tournamentCreated?`<p class="field-help">${tr('editLinkedHint')}</p>`:''}<p data-calendar-form-error role="alert"></p><div class="row-actions"><button type="button" class="small-button" data-calendar-close>${ctx.t('common.cancel')}</button><button type="submit" class="primary-button">${ctx.t('common.save')}</button></div></form>`;
    document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});wire(dialog);
    const form=dialog.querySelector('form');
    const capacity=form.elements.participantLimit;
    const updateCapacity=()=>{
      const team=form.elements.participantMode.value==='team', size=Number(form.elements.teamSize.value);
      form.querySelector('[data-calendar-team-size]').hidden=!team;
      form.elements.teamSize.disabled=!team;
      capacity.min=String(team?size:event?.autoCreated?1:2);capacity.max=String(event?.autoCreated?2147483647*(team?size:1):team?128*size:10000);
    };
    form.elements.participantMode.addEventListener('change',updateCapacity);
    form.elements.teamSize.addEventListener('change',updateCapacity);updateCapacity();
    form.onsubmit=async e=>{
      e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
      const body=Object.fromEntries(new FormData(form));if(event)body.expectedUpdatedAt=event.updatedAt;
      try{
        const data=await ctx.api('/api/admin/calendar-events'+(event?'/'+event.id:''),{method:event?'PATCH':'POST',body});
        selectedId=data.event.id;selectedDate=data.event.date;month=selectedDate.slice(0,7);filters={search:'',city:'',type:''};dialog.close();await load();
      }catch(e){form.querySelector('[data-calendar-form-error]').textContent=e.message;submit.disabled=false;}
    };
    dialog.showModal();
  }

  async function mount(container, options) {
    host=container;ctx=options;closeDialogs();
    const requestedId=Number(new URLSearchParams(location.search).get('calendarEvent'));
    const preselect=!loadedMonth&&Number.isSafeInteger(requestedId)&&requestedId>0;
    if(preselect)selectedId=requestedId;
    if(loadedMonth!==month)await load();else{render();await load();}
    if(preselect&&active()&&host===container&&selected()){
      const event=selected();selectedDate=event.date;render();if(small())openDetails(event);
    }
  }
  if(typeof window!=='undefined') {
    const onResize=()=>{if(active())render();};
    matchMedia('(max-width: 760px)').addEventListener('change',onResize);
    window.addEventListener('hashchange',()=>{if(!active())closeDialogs();});
    window.addEventListener('focus',()=>{if(active())load();});
  }
  const api={mount,monthDays,filterEvents,cityItems};
  root.TGTV_CALENDAR=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

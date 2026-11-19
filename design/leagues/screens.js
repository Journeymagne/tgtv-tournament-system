/* Standalone design example. All changes live in this tab's memory. */
const screens = {
  directory: 'Каталог лиг', solo: 'Личный зачёт', org: 'Зачёт организаций', events: 'Турниры лиги',
  tournament: 'Страница турнира', create: 'Создание лиги', attach: 'Привязка турнира', rules: 'Правила подсчёта'
};
const formats = { solo: 'Соло', pair: 'Парные 2×2', team: 'Командные 3×3' };
const criteria = { vp: 'Суммарные VP', sos: 'Сила соперников (SoS)', wins: 'Личные победы', events: 'Количество ивентов' };
const factions = {
  AoD: ['Angels of Death','Лоялы','loyal'], BoK: ['Blades of Khaine','Ксеносы','xenos'],
  NC: ['Nemesis Claw','Хаос','chaos'], PM: ['Plague Marines','Хаос','chaos'],
  KS: ['Kasrkin','Лоялы','loyal'], KM: ['Kommandos','Ксеносы','xenos'],
  DW: ['Deathwatch','Лоялы','loyal'], PF: ['Pathfinders','Ксеносы','xenos']
};
const players = { rook:'Rook', mira:'Mira', lynx:'Lynx', fjord:'Fjord', frost:'Иней', vega:'Vega', swift:'Стриж', guest:'Стриж (гость)',
  aux:'Астра', ember:'Искра', other1:'Орёл', other2:'Сойка', other3:'Шторм' };
const organizations = { fm:'Fresh Meat', sector:'Пятый сектор', orbit:'Орбита' };
const rosterPicks = {
  pairs:{rook:'AoD',mira:'NC',lynx:'KS',vega:'PF',fjord:'KM',frost:'DW'},
  teams:{rook:'BoK',mira:'PM',swift:'KS',lynx:'DW',fjord:'KM',frost:'AoD',vega:'PF',ember:'NC',aux:'KS',other1:'BoK',other2:'DW',other3:'PM'}
};
function entry(id, label, rank, tp, vp, sos, wins, picks = [], members = []) {
  return { id, label, rank, tp, vp, sos, wins, picks, members };
}
const events = {
  volkus: { title:'Кубок Волькуса', date:'12.09.2026', format:'solo', type:'Швейцарка', order:['sos','vp'], entries:[
    entry('rook','Ворон',1,9,43,12,3,['AoD']), entry('mira','Mira',2,6,45,14,2,['NC']),
    entry('lynx','Lynx',3,6,42,10,2,['KS','DW']), entry('fjord','Fjord',4,3,37,11,1,['KM']), entry('vega','Vega',5,0,32,9,0,['PF'])] },
  pairs: { title:'Парный рубеж', date:'26.09.2026', format:'pair', type:'Doubles', order:['sos','vp'], entries:[
    entry('sector','ПС Дуэт',1,14,72,8,5,[],['lynx','vega']), entry('fm','FM Север',2,11,75,9,3,[],['rook','mira']),
    entry('orbit','Орбита Дуэт',3,8,65,7,2,[],['fjord','frost'])] },
  october: { title:'Октябрьский рубеж', date:'10.10.2026', format:'solo', type:'Швейцарка', order:['vp','sos'], entries:[
    entry('mira','Mira',1,9,42,11,3,['PM']), entry('rook','Raven_17',2,6,49,9,2,['BoK']),
    entry('frost','Иней',3,3,37,10,1,['DW']), entry('lynx','Lynx',4,3,36,12,1,['BoK']), entry('fjord','Fjord',5,3,34,8,1,['KM'])] },
  teams: { title:'Командный кубок', date:'07.11.2026', format:'team', type:'WTC 3×3', order:['wins','vp','tac'], entries:[
    entry('fm','FM Красные',1,6,126,0,7,[],['rook','mira','swift']), entry('sector','ПС Трио',2,4,118,0,6,[],['lynx','fjord','frost']),
    entry('fm','FM Белые',3,3,98,null,4,[],['vega','ember','aux']), entry('orbit','Орбита Трио',4,2,96,null,3,[],['other1','other2','other3'])] },
  archive: { title:'Контрольная точка', date:'14.11.2026', format:'solo', type:'Швейцарка', order:['sos','vp'], entries:[
    entry('rook','Raven_17',1,9,50,11,3,['DW']), entry('guest','Стриж',2,6,39,10,2,['KS'])] },
  final: { title:'Финал осени', date:'28.11.2026', format:'solo', type:'Швейцарка', pending:true, order:['vp'], entries:[] }
};
criteria.tac = 'Суммарные Tac Op';
const formatCriteria = { solo:['vp','sos','wins','events'], pair:['vp','sos','wins','events'], team:['vp','wins','tac','events'] };
// The two team sources in this example have different SoS semantics. Tac Op is present on WTC rows.
events.teams.entries.forEach((row, index) => { row.tac = [33,30,27,22][index]; });
function ruleSet(basis) { return { basis, mode:'custom', source:null, includeSource:false, definitions:{}, order:basis === 'tp' ? ['vp','sos'] : ['vp','wins'], scale:[10,8,6,4,0] }; }
function newLeague(title, enabled, linked = []) {
  return { title, enabled, linked:[...linked], mapped:false, rules:{solo:ruleSet('tp'),org:ruleSet('place')} };
}
const autumn = newLeague('Осенняя лига',['solo','pair','team'],['volkus','pairs','october','teams','final']);
const leagues = [autumn];
const view = { league:autumn, staff:false, screen:'solo', expanded:'', event:'volkus', track:'solo', draft:null, edit:null, pick:null, search:'' };
const main = document.getElementById('main');
const dialog = document.getElementById('detail-dialog');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const unique = values => [...new Set(values)];
const trackFor = format => format === 'solo' ? 'solo' : 'org';
const trackTitle = track => track === 'solo' ? screens.solo : screens.org;
const availableTracks = league => unique(league.enabled.map(trackFor));
const currentLeague = () => view.draft || view.league;
const workingRules = () => view.edit || currentLeague().rules;
function chronological(ids) {
  const dateKey = id => events[id].date.split('.').reverse().join('');
  return [...ids].sort((a,b)=>dateKey(a).localeCompare(dateKey(b)));
}
const pendingSources = rules => unique(Object.values(rules).filter(r=>r.mode==='import' && r.includeSource && r.source).map(r=>r.source));
const criterionTitle = (rule,key) => rule.definitions[key]?.name || criteria[key];
const button = (label, action, data = '', primary = false, disabled = false) => `<button type="button" class="kt-control${primary ? ' kt-control--primary' : ''}" data-action="${action}" data-value="${escapeHtml(data)}"${disabled ? ' disabled' : ''}>${escapeHtml(label)}</button>`;
const link = (label, screen, primary = false) => `<a href="#${screen}" class="kt-control${primary ? ' kt-control--primary' : ''}">${escapeHtml(label)}</a>`;
const eventLink = (id, label) => `<a href="#tournament" data-event="${id}">${escapeHtml(label || events[id].title)}</a>`;
const checked = active => active ? ' checked' : '';
const selected = active => active ? ' selected' : '';
function tabs(items, value, action, label) {
  return `<div class="tabs" role="group" aria-label="${label}">${items.map(([key,text]) => `<button type="button" class="kt-tab" aria-pressed="${key === value}" data-action="${action}" data-value="${key}">${escapeHtml(text)}</button>`).join('')}</div>`;
}
function crumb(...items) { return `<nav class="trail" aria-label="Навигация">${items.join('<span aria-hidden="true">/</span>')}</nav>`; }
function head(kicker, title, subtitle, actions = '') {
  return `<header class="page-head"><div><div class="kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}</div><div class="actions">${actions}</div></header>`;
}
function leagueTrail(last) { return crumb('<a href="#directory">Лиги</a>', `<a href="#${availableTracks(view.league)[0]}">${escapeHtml(view.league.title)}</a>`, escapeHtml(last)); }
function leagueHead(actions = '') {
  const league = view.league;
  const subtitle = league === autumn ? '12 сентября — 28 ноября 2026' : league.enabled.map(f => formats[f]).join(' · ');
  return crumb('<a href="#directory">Лиги</a>', escapeHtml(league.title)) + head(league === autumn ? 'Thundergrounds · Сезон 2026' : 'Kill Team',league.title,subtitle,actions);
}
function sourceId(league, id) { return league.mapped && id === 'guest' ? 'swift' : id; }
function eventScore(row, rule) { return rule.basis === 'tp' ? row.tp : rule.scale[Math.min(row.rank,rule.scale.length)-1]; }
function standings(league, track, rule = league.rules[track]) {
  const byId = new Map();
  for (const eventId of chronological(league.linked)) {
    const event = events[eventId];
    if (event.pending || trackFor(event.format) !== track) continue;
    for (const entry of event.entries) {
      const id = track === 'solo' ? sourceId(league,entry.id) : entry.id;
      if (!byId.has(id)) byId.set(id,{ id, name:track === 'solo' ? players[id] : organizations[id], points:0, vp:0, sos:0, wins:0, tac:0, details:[] });
      const row = byId.get(id);
      row.points += eventScore(entry,rule);
      for (const metric of ['vp','sos','wins','tac']) {
        row[metric] = Number.isFinite(entry[metric]) && row[metric] != null ? row[metric] + entry[metric] : null;
      }
      row.details.push({eventId,entry});
    }
  }
  const rows = [...byId.values()];
  rows.forEach(row => {
    row.events = unique(row.details.map(detail => detail.eventId)).length;
    row.picks = unique(row.details.flatMap(detail => detail.entry.picks));
    for (const [key, definition] of Object.entries(rule.definitions)) {
      const perEvent = new Map();
      for (const {eventId,entry} of row.details) perEvent.set(eventId,(perEvent.get(eventId) || 0) + entry[definition.field]);
      const values = [...perEvent.values()];
      row[key] = definition.aggregate === 'max' ? Math.max(...values) : values.reduce((sum,v)=>sum+v,0);
    }
  });
  const keys = ['points',...rule.order];
  rows.sort((a,b) => { for (const key of keys) { if (b[key] !== a[key]) return b[key] - a[key]; } return a.name.localeCompare(b.name,'ru'); });
  rows.forEach((row,index) => { const prev = rows[index-1]; row.rank = prev && keys.every(key => row[key] === prev[key]) ? prev.rank : index+1; });
  return rows;
}
function chip(code) {
  const [name,side,color] = factions[code];
  return `<span class="chip ${color}" title="${name} · ${side}" aria-label="${name}, ${side}">${code}</span>`;
}
function fullPick(code) {
  const [name,side] = factions[code];
  return `<span class="pick-full"><img src="../../public/kill-team-logos/${encodeURIComponent(name)}.webp" width="24" height="24" alt="">${chip(code)} ${name} · ${side}</span>`;
}
function pickButton(code, player) {
  return `<button class="pick-info" data-action="explain-pick" data-value="${code}" aria-label="Киллтим игрока ${escapeHtml(player)}, ${factions[code][0]}">${chip(code)}</button>`;
}
function legend() { return `<div class="legend"><b>Киллтимы</b>${[['loyal','Лоялы'],['chaos','Хаос'],['xenos','Ксеносы']].map(([c,n])=>`<span><i class="dot ${c}"></i>${n}</span>`).join('')}</div>`; }
function basisTitle(rule) { return rule.basis === 'tp' ? 'Сумма турнирных очков' : 'Очки за итоговое место'; }
function rulesList(rule) { return `<ol class="rule-list">${[basisTitle(rule),...rule.order.map(key=>criterionTitle(rule,key))].map((text,i)=>`<li><span class="order">${i+1}</span>${escapeHtml(text)}</li>`).join('')}</ol>`; }
function renderHistory(row, track) {
  const rule = view.league.rules[track];
  const lines = row.details.map(({entry,eventId})=>{
    const roster = entry.members.map(id=>{
      const code=rosterPicks[eventId]?.[id];
      return `<span class="member-pick">${escapeHtml(players[id])} ${code ? pickButton(code,players[id]) : ''}</span>`;
    }).join('');
    const picks = entry.picks.map(fullPick).join('');
    return `<div class="history-line"><strong>${eventLink(eventId)}</strong> ${escapeHtml(entry.label)}
      <span class="small">${entry.rank}-е место · ${entry.tp} ТП · ${entry.vp} VP${track === 'solo' ? ` · ${entry.sos} SoS` : ''} · в лигу +${eventScore(entry,rule)}</span>
      ${roster ? `<div class="roster-picks">${roster}</div>` : ''}${picks ? `<div class="pick-list">${picks}</div>` : ''}</div>`;
  });
  return `<h4 class="detail-title">${track === 'solo' ? 'Выступления игрока' : 'Вклад всех составов'}</h4>${lines.join('')}`;
}
function standingsTable(rows, track) {
  const personal = track === 'solo', rule = view.league.rules[track], first = rule.order[0];
  const short = {vp:'VP',sos:'SoS',wins:'Победы',events:'Этапы',tac:'Tac Op'}[first] || (first ? criterionTitle(rule,first) : '');
  const body = rows.map(row => {
    const isOpen = view.expanded === row.id;
    const nameCell = `<button class="name-button" data-action="expand" data-value="${row.id}" aria-expanded="${isOpen}"><span class="chev" aria-hidden="true">${isOpen ? '▾' : '▸'}</span>${escapeHtml(row.name)}</button>`;
    const extra = personal ? row.details.at(-1).entry.label : `${row.details.length} ${row.details.length === 1 ? 'выступление' : 'выступления'}`;
    const meta = row.id === 'guest' ? 'Требует сверки' : extra !== row.name ? extra : '';
    const picks = row.picks.slice(0,2).map(code=>pickButton(code,row.name)).join('') + (row.picks.length > 2 ? `<button class="chip-more" data-action="expand" data-value="${row.id}" aria-label="Все киллтимы игрока ${escapeHtml(row.name)}">+${row.picks.length-2}</button>` : '');
    const tieCell = first ? `<td class="tie num" data-label="${escapeHtml(short)}">${row[first]}</td>` : '';
    return `<tr class="${row.rank === 1 ? 'leading' : ''}"><td class="rank">${row.rank}</td><td class="who">${nameCell}${meta ? `<small class="name-meta">${escapeHtml(meta)}</small>` : ''}</td><td class="score num" data-label="Очки"><span class="points">${row.points}</span></td>${tieCell}<td class="count num" data-label="Ивенты">${row.events}</td>${personal ? `<td class="picks"><div class="chips">${picks}</div></td>` : ''}</tr>${isOpen ? `<tr class="expanded"><td colspan="${4+Number(personal)+Number(Boolean(first))}">${renderHistory(row,track)}</td></tr>` : ''}`;
  }).join('');
  return `<div class="table-wrap"><table class="standings" aria-label="${trackTitle(track)}"><thead><tr><th>Место</th><th>${personal ? 'Ник в Реестре' : 'Организация'}</th><th class="number">Очки</th>${first ? `<th class="number metric-head" title="Первый тай-брейк · ${escapeHtml(criterionTitle(rule,first))}">${escapeHtml(short)}</th>` : ''}<th class="number">Ивенты</th>${personal ? '<th>Пики</th>' : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function standingsPage(track) {
  const league = view.league, rule = league.rules[track];
  const rows = standings(league,track), counted = chronological(league.linked).filter(id => !events[id].pending && trackFor(events[id].format) === track);
  const items = availableTracks(league).map(key => [key,trackTitle(key)]);
  return leagueHead(link('Турниры лиги','events')+(view.staff ? link('Настроить','rules') : '')) + (items.length > 1 ? tabs(items,track,'page','Зачёты лиги') : '') +
    `<div class="split"><section class="panel table-panel"><div class="table-caption"><h2>${trackTitle(track)}</h2><p>${track === 'solo' ? 'Игроков' : 'Организаций'} в зачёте — ${rows.length}. Учтено турниров — ${counted.length}.</p></div>${rows.some(row=>row.id==='guest') ? '<p class="notice-box">Места предварительные. Есть участник, ожидающий сверки с Реестром.</p>' : ''}${rows.length ? standingsTable(rows,track) : '<p class="panel empty">После публикации итогов здесь появятся участники.</p>'}${track === 'solo' ? legend() : '<div class="legend">Очки всех составов складываются. Каждый турнир считается один раз.</div>'}</section><aside class="stack standings-aside"><section class="panel"><h3>Как считается место</h3>${rulesList(rule)}${rule.basis === 'place' ? `<p class="small">Места 1–${rule.scale.length-1} дают ${rule.scale.slice(0,-1).join(' / ')}. Далее — ${rule.scale.at(-1)}.</p>` : ''}</section><section class="panel"><h3>Учтённые турниры</h3><ul class="mini-events">${counted.map(id=>`<li>${eventLink(id)}<span class="small">${events[id].date} · ${events[id].type}</span></li>`).join('')}</ul>${!counted.length ? '<p class="small">Пока нет опубликованных итогов.</p>' : ''}</section></aside></div>`;
}
function directoryPage() {
  return crumb('Турниры','Лиги') + head('Турниры','Лиги','Сезонные зачёты игроков и организаций.',view.staff ? link('Создать лигу','create',true) : '') +
    `<section class="panel"><h2>Лиги сезона</h2><ul class="directory-list spaced">${leagues.map((league,i)=>`<li><div><strong>${escapeHtml(league.title)}</strong><small>${league.enabled.map(f=>formats[f]).join(' · ')} · Турниров ${league.linked.length}</small></div>${button('Открыть','open-league',String(i))}</li>`).join('')}</ul></section>`;
}
function createPage() {
  return crumb('<a href="#directory">Лиги</a>','Создание') + head('Организатор · Шаг 1 из 3','Новая лига','Выберите форматы, результаты которых войдут в сезон.') +
    `<form id="create-form" class="panel form-grid"><label class="field"><span class="field-title">Название лиги</span><input name="title" required maxlength="100" placeholder="Например, Зимняя лига" value="${escapeHtml(view.draft?.title || '')}"></label><fieldset><legend class="field-title">Форматы турниров</legend><div class="option-grid">${Object.entries(formats).map(([id,title])=>`<label class="option"><input name="format" type="checkbox" value="${id}"${checked(view.draft ? view.draft.enabled.includes(id) : true)}><span><strong>${title}</strong><small>${id === 'solo' ? 'Зачёт игроков' : 'Зачёт организаций'}</small></span></label>`).join('')}</div></fieldset><p class="help">Парные и командные турниры можно объединить в одной таблице организаций.</p><div class="step-actions">${link('К каталогу','directory')}<button class="kt-control kt-control--primary">Далее к турнирам</button></div></form>`;
}

function compatibleCriteria(league, track, extra = []) {
  const relevant = unique([...league.linked,...extra]).map(id=>events[id]).filter(event=>trackFor(event.format) === track);
  const types = relevant.length ? unique(relevant.map(event=>event.format)) : league.enabled.filter(f=>trackFor(f) === track);
  return Object.keys(criteria).filter(key=>types.length && types.every(type=>formatCriteria[type].includes(key)));
}
function completedSources(league, track) {
  return Object.keys(events).filter(id=>!events[id].pending && league.enabled.includes(events[id].format) && trackFor(events[id].format) === track);
}
function issuesFor(league,rules,links = league.linked) {
  const problems = [];
  for (const id of links) {
    const event = events[id], rule = rules[trackFor(event.format)];
    for (const key of rule.order) {
      const field = rule.definitions[key]?.field || key;
      if (!formatCriteria[event.format].includes(field) || (field!=='events' && event.entries.some(row=>!Number.isFinite(row[field])))) {
        problems.push(`${event.title} — недоступен критерий «${criterionTitle(rule,key)}».`);
      }
    }
  }
  return problems;
}
function ruleOrderEditor(rule,available) {
  const rows = rule.order.map((key,i)=>{
    const label = criterionTitle(rule,key);
    const move = (symbol,action,aria,disabled=false) => `<button class="kt-control" data-action="${action}" data-value="${key}" aria-label="${escapeHtml(aria+' · '+label)}"${disabled ? ' disabled' : ''}>${symbol}</button>`;
    return `<div class="rule-edit"><span><b class="order">${i+1}.</b> ${escapeHtml(label)}</span><div class="actions">${move('↑','move-up','Повысить приоритет',i===0)}${move('↓','move-down','Понизить приоритет',i===rule.order.length-1)}${move('×','drop-metric','Удалить')}</div></div>`;
  }).join('');
  const select = available.length ? `<label class="field"><span class="field-title">Добавить из списка</span><select id="add-metric"><option value="">Выберите критерий</option>${available.map(key=>`<option value="${key}">${criteria[key]}</option>`).join('')}</select></label>` : '';
  return `<div><span class="field-title">Приоритет тай-брейков</span>${rows || '<p class="small">Равные очки дают общее место.</p>'}</div>${select}<div>${button('Создать свой критерий','new-metric')}</div>`;
}
function scaleEditor(rule) {
  const controls = rule.scale.map((v,i)=>`<label>${i===rule.scale.length-1 ? `${i+1}-е и ниже` : `${i+1}-е место`}<input type="number" min="0" max="9999" step="1" data-scale="${i}" value="${v}"></label>`);
  return `<div class="scale">${controls.join('')}</div><div class="actions">${button('Добавить место','add-position')}${button('Убрать место','remove-position','',false,rule.scale.length<=2)}</div>`;
}
function metricDialog() {
  showDialog('Свой тай-брейк',`<div class="form-grid"><label class="field"><span class="field-title">Название</span><input id="metric-name" value="Лучшие VP за этап" maxlength="40" required></label><label class="field"><span class="field-title">Показатель этапа</span><select id="metric-field"><option value="vp">Набранные VP</option><option value="wins">Личные победы</option></select></label><label class="field"><span class="field-title">Как сравнить этапы</span><select id="metric-aggregate"><option value="max">Лучшее значение за один этап</option><option value="sum">Сумма по этапам</option></select></label><p class="help">Большее значение выигрывает равенство. У организации внутри этапа сначала складываются все составы.</p><div>${button('Добавить в порядок','define-metric','',true)}</div></div>`);
}
function leagueRulesPreview() {
  const original=currentLeague(), enabled=view.formatEdit || original.enabled;
  return {...original,enabled,linked:original.linked.filter(id=>enabled.includes(events[id].format))};
}
function editFormatsDialog() {
  const enabled=leagueRulesPreview().enabled;
  const options=Object.entries(formats).map(([id,title])=>`<label class="option"><input type="checkbox" name="edit-format" value="${id}"${checked(enabled.includes(id))}>${title}</label>`).join('');
  showDialog('Форматы лиги',`<div class="form-grid"><div class="option-grid">${options}</div><p class="help">Предпросмотр покажет этапы, которые выйдут из зачёта при смене форматов.</p><div>${button('Посмотреть изменения','preview-formats','',true)}</div></div>`);
}
function rulesPage() {
  const league = leagueRulesPreview();
  if (!availableTracks(league).includes(view.track)) view.track = availableTracks(league)[0];
  const track = view.track, rule = workingRules()[track], sources = completedSources(league,track);
  const extra = pendingSources(workingRules()).filter(id=>league.enabled.includes(events[id].format)), previewLeague = {...league,linked:unique([...league.linked,...extra])};
  const permitted = compatibleCriteria(previewLeague,track), available = permitted.filter(key=>!rule.order.includes(key));
  const problems = issuesFor(previewLeague,workingRules());
  const invalidImport = availableTracks(league).some(key=>workingRules()[key].mode === 'import' && !workingRules()[key].source);
  const rows = problems.length || invalidImport ? [] : standings(previewLeague,track,rule).slice(0,2);
  const modeFields = rule.mode === 'import' ? `<div class="field"><label class="field-title" for="source">Проведённый турнир</label><select id="source"><option value="">Выберите турнир</option>${sources.map(id=>`<option value="${id}"${selected(rule.source===id)}>${escapeHtml(events[id].title)} · ${events[id].type}</option>`).join('')}</select></div>${rule.source ? `<p class="help">Порядок источника — ${events[rule.source].order.map(key=>criteria[key]).join(' → ')}.</p>${league.linked.includes(rule.source) ? '<p class="help">Турнир уже включён в лигу.</p>' : `<label class="option"><input type="checkbox" id="include-source"${checked(extra.includes(rule.source))}>Также привязать этот турнир к лиге</label>`}` : ''}` :
    ruleOrderEditor(rule,available);
  const removed=currentLeague().linked.filter(id=>!league.linked.includes(id));
  const changedFormats=view.formatEdit ? `<p class="notice-box">Форматы после сохранения — ${league.enabled.map(f=>formats[f]).join(', ')}.${removed.length ? ' Из зачёта выйдут '+removed.map(id=>events[id].title).join(', ')+'.' : ''}</p>` : '';
  return (view.draft ? crumb('<a href="#directory">Лиги</a>','Создание','Правила') : leagueTrail('Правила подсчёта')) + head(view.draft ? 'Организатор · Шаг 3 из 3' : 'Настройки лиги','Правила подсчёта',league.title,view.draft ? '' : button('Форматы лиги','edit-formats')) + changedFormats +
    (availableTracks(league).length > 1 ? tabs(availableTracks(league).map(key=>[key,trackTitle(key)]),track,'rules-track','Настраиваемый зачёт') : '')+
    `<div class="split"><section class="panel form-grid"><h2>Основные очки</h2><div class="option-grid">${[['tp','Сумма ТП','Сложить очки выступлений'],['place','За место','Общая шкала для всех этапов']].map(([v,title,detail])=>`<label class="option"><input type="radio" name="basis" value="${v}"${checked(rule.basis === v)}><span><strong>${title}</strong><small>${detail}</small></span></label>`).join('')}</div>${rule.basis === 'place' ? scaleEditor(rule) : ''}${track === 'org' ? '<p class="help">Все составы одной организации приносят очки. Один этап даёт один ивент. При сумме ТП сохраняется исходная шкала каждого формата.</p>' : ''}<h2>Тай-брейки</h2>${tabs([['import','Из турнира'],['custom','Свой порядок']],rule.mode,'rule-mode','Источник тай-брейков')}${modeFields}</section><aside class="panel rule-preview"><h3>Предпросмотр зачёта</h3>${rulesList(rule)}${problems.length ? `<div class="notice-box">${problems.map(escapeHtml).join('<br>')}</div>` : invalidImport ? '<p class="small">Выберите источник для каждого импортируемого порядка.</p>' : `<div class="sample">${rows.map(row=>`<div class="sample-line"><span>${row.rank}. ${escapeHtml(row.name)}</span><strong>${row.points} очк.</strong></div>`).join('') || 'Здесь появятся результаты привязанных турниров.'}</div>`}${track === 'solo' && rows.some(row=>row.id==='rook') && rows.some(row=>row.id==='mira') && rows[0].points===rows[1].points && rule.order.length ? `<p class="small spaced">${escapeHtml(criterionTitle(rule,rule.order[0]))} при равных очках — ${rows[0][rule.order[0]]} у ${escapeHtml(rows[0].name)}, ${rows[1][rule.order[0]]} у ${escapeHtml(rows[1].name)}.</p>` : ''}<div class="step-actions">${view.draft ? link('К турнирам','attach') : ''}${button(view.draft ? 'Создать лигу' : 'Сохранить правила','save-rules','',true,Boolean(problems.length || invalidImport))}</div></aside></div>`;
}
function attachChoices() {
  const league = currentLeague(), term = view.search.trim().toLocaleLowerCase('ru');
  const matches = Object.keys(events).filter(id => league.enabled.includes(events[id].format) && (events[id].title+' '+events[id].type).toLocaleLowerCase('ru').includes(term));
  return matches.length ? matches.map(id=>{
    const event = events[id], linked = league.linked.includes(id);
    return `<li class="event-row"><div><strong>${escapeHtml(event.title)}</strong><small>${event.date} · ${formats[event.format]} · ${event.pending ? 'Ожидает итогов' : 'Итоги опубликованы'}</small></div>${linked ? '<span class="event-status">Уже в лиге</span>' : button(view.pick===id ? 'Выбран' : 'Выбрать','pick-event',id,false,view.pick===id)}</li>`;
  }).join('') : '<li class="empty">Турниры не найдены. Измените запрос.</li>';
}
function attachPage() {
  const league = currentLeague();
  const id = view.pick, event = events[id];
  let preview = '<p class="subtitle">Выберите существующий турнир из списка.</p>';
  if (event && !league.linked.includes(id)) {
    const track = trackFor(event.format), already = new Set(standings(league,track).map(r=>r.id));
    const people = unique(event.entries.map(row=>sourceId(league,row.id)));
    const problems = issuesFor(league,league.rules,[...league.linked,id]);
    const provisional = event.entries.some(row=>row.id==='guest') && !league.mapped;
    preview = `<div class="sample"><strong>${escapeHtml(event.title)}</strong><p class="small">${event.date} · ${formats[event.format]}</p></div><p class="spaced">${event.pending ? 'Турнир появится в расписании. Очки войдут после публикации итогов.' : `Строк результата — ${event.entries.length}. Новых в зачёте — ${people.filter(key=>!already.has(key)).length}.`}</p>${provisional ? '<p class="small spaced">Стриж выступал как гость. Его строка появится с пометкой «Требует сверки».</p>' : ''}${problems.length ? `<div class="notice-box">${problems.map(escapeHtml).join('<br>')}</div>` : ''}<div class="step-actions">${button(view.draft ? 'Добавить в черновик' : 'Привязать турнир','attach-confirm',id,true,Boolean(problems.length && !view.draft))}</div>`;
  }
  return (view.draft ? crumb('<a href="#directory">Лиги</a>','Создание','Турниры') : leagueTrail('Привязка турнира')) + head(view.draft ? 'Организатор · Шаг 2 из 3' : 'Организатор', 'Привязка турниров',league.title,view.draft ? link('Далее к правилам','rules',true) : link('Турниры лиги','events'))+
    `<div class="split"><section class="panel"><h2>Существующие турниры</h2><label class="field spaced"><span class="field-title">Поиск</span><input id="event-search" type="search" value="${escapeHtml(view.search)}" placeholder="Название или формат"></label><ul id="choices" class="choice-list spaced">${attachChoices()}</ul></section><aside class="stack"><section class="panel"><h3>Что добавится в лигу</h3>${preview}</section>${view.draft ? `<section class="panel"><h3>Выбрано турниров — ${league.linked.length}</h3><ul class="mini-events">${league.linked.map(key=>`<li>${escapeHtml(events[key].title)} ${button('Убрать','draft-remove',key)}</li>`).join('')}</ul></section>` : ''}</aside></div>`;
}
function eventsPage() {
  const league = view.league;
  return leagueHead((view.staff ? link('Привязать турнир','attach',true) : '')+link('Итоги лиги',availableTracks(league)[0])) + `<section class="panel"><div class="section-head"><h2>Турниры лиги</h2><span class="small">Учтено ${league.linked.filter(id=>!events[id].pending).length} из ${league.linked.length}</span></div><ul class="timeline">${chronological(league.linked).map(id=>{
    const e = events[id];
    return `<li><div><strong>${eventLink(id)}</strong><small>${e.date} · ${formats[e.format]} · ${e.type}</small></div><div class="actions"><span class="event-status ${e.pending ? '' : 'positive'}">${e.pending ? 'Ожидает итогов' : 'Учтён'}</span>${view.staff ? button('Отвязать','request-unlink',id) : ''}</div></li>`;
  }).join('') || '<li class="empty">К лиге пока не привязаны турниры.</li>'}</ul></section>${view.staff && league.linked.includes('archive') && !league.mapped ? `<section class="panel boundary"><h3>Требует сверки · 1</h3><div class="event-row"><div><strong>Стриж</strong><small>Гость · Контрольная точка · 6 ТП</small></div>${button('Найти в Реестре','resolve')}</div></section>` : ''}`;
}
function tournamentPage() {
  const id = view.event, event = events[id], linked = leagues.filter(league=>league.linked.includes(id));
  const action = linked.length ? button('Итоги лиги','back-league','',true) : '';
  return crumb('<a href="#events">Турниры лиги</a>',escapeHtml(event.title)) + head('Турнир · '+(event.pending ? 'Регистрация открыта' : 'Завершён'),event.title,`${event.date} · ${formats[event.format]} · ${event.type}`,action) +
    `<div class="split"><section class="panel"><h2>${event.pending ? 'Ожидает итогов' : 'Итоги турнира'}</h2>${event.pending ? '<p class="subtitle">Итоги появятся после завершения турнира.</p>' : `<div class="table-wrap event-results"><table><thead><tr><th>Место</th><th>${event.format==='solo' ? 'Игрок' : 'Состав'}</th><th class="number">ТП</th><th class="number">VP</th></tr></thead><tbody>${event.entries.map(row=>`<tr class="${row.rank===1 ? 'leading' : ''}"><td class="rank">${row.rank}</td><td>${escapeHtml(row.label)}</td><td class="num">${row.tp}</td><td class="num">${row.vp}</td></tr>`).join('')}</tbody></table></div>`}</section><section class="panel"><h3>Регламент турнира</h3><ol class="rule-list">${['Турнирные очки',...event.order.map(key=>criteria[key])].map((name,i)=>`<li><b class="order">${i+1}</b>${name}</li>`).join('')}</ol></section></div>`;
}
function showDialog(title, markup) {
  document.getElementById('dialog-body').innerHTML = `<h2 id="dialog-title">${escapeHtml(title)}</h2>${markup}`;
  if (!dialog.open) dialog.showModal();
}
function resolveDialog() {
  showDialog('Сверка с Реестром','<p class="muted">Контрольная точка · турнирное имя «Стриж»</p><label class="field spaced"><span class="field-title">Никнейм в Реестре</span><input id="registry-search" type="search" value="Стриж"></label><div id="registry-result"></div>');
  updateRegistry('Стриж');
}
function updateRegistry(term) {
  const match = players.swift.toLowerCase().includes(term.trim().toLowerCase());
  document.getElementById('registry-result').innerHTML = match ? `<div class="event-row"><div><strong>Стриж</strong><small>Профиль Реестра · ник аккаунта Swift_9</small></div>${button('Связать','confirm-resolve')}</div>` : '<p class="small spaced">В примере карточка находится по нику «Стриж».</p>';
}
function go(screen) {
  if (location.hash === '#'+screen) { render(); return; }
  location.hash = screen;
}
function readRoute() {
  const hash = location.hash.slice(1);
  const screen = Object.hasOwn(screens,hash) ? hash : 'solo';
  if (['rules','attach','create'].includes(screen)) view.staff = true;
  if (!['create','rules','attach'].includes(screen)) { view.draft = null; view.edit = null; }
  if (screen!=='rules') view.formatEdit=null;
  if (['solo','org'].includes(screen)) {
    if (!availableTracks(view.league).includes(screen)) { go(availableTracks(view.league)[0]); return; }
    view.track = screen;
  }
  if (screen === 'rules' && (view.screen !== 'rules' || !view.edit)) view.edit = structuredClone(currentLeague().rules);
  if (screen === 'attach' && view.screen !== 'attach') { view.search=''; view.pick = currentLeague().linked.includes('archive') || !currentLeague().enabled.includes('solo') ? null : 'archive'; }
  view.screen = screen; view.expanded = '';
  render();
  window.scrollTo(0,0);
}
function render() {
  const routes = { solo:()=>standingsPage('solo'),org:()=>standingsPage('org'),directory:directoryPage,events:eventsPage,create:createPage,attach:attachPage,rules:rulesPage,tournament:tournamentPage };
  main.innerHTML = routes[view.screen]();
  document.title=screens[view.screen]+' · KT Companion';
  document.getElementById('role').value = view.staff ? 'staff' : 'public';
  document.getElementById('screen-picker').value=view.screen;
  document.querySelectorAll('.rail-nav a').forEach(a=>{ if (a.hash==='#'+view.screen) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
}
function announce(message) { const notice=document.getElementById('notice'); notice.textContent=message; clearTimeout(announce.timer); announce.timer=setTimeout(()=>{ notice.textContent=''; },2300); }
function changeTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('brand-mark').src = '../../public/brand/kt-companion/mark-'+theme+'.png';
  document.querySelectorAll('[data-choice-theme]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.choiceTheme === theme)));
}
for (const [theme,name] of [['light','Светлая тема'],['dark','Тёмная тема']]) {
  const control = KTComponents.button(name,{icon:theme}); control.dataset.choiceTheme=theme;
  control.addEventListener('click',()=>changeTheme(theme)); document.getElementById('themes').append(control);
}
changeTheme('dark');
document.getElementById('screen-picker').innerHTML = Object.entries(screens).map(([key,name])=>`<option value="${key}">${name}</option>`).join('');
document.getElementById('screen-picker').addEventListener('change',e=>go(e.target.value));
document.querySelector('.skip').addEventListener('click',e=>{ e.preventDefault(); main.focus(); });
document.getElementById('role').addEventListener('change',e=>{
  view.staff = e.target.value==='staff'; if (!view.staff && ['rules','create','attach'].includes(view.screen)) go(availableTracks(view.league)[0]); else render();
});
document.addEventListener('submit',e=>{
  if (e.target.id!=='create-form') return;
  e.preventDefault(); const data = new FormData(e.target), enabled = data.getAll('format'), title=String(data.get('title')).trim();
  if (!title || !enabled.length) { announce('Укажите название и выберите хотя бы один формат.'); return; }
  const league = view.draft || newLeague(title,enabled);
  league.title=title; league.enabled=enabled; league.linked=league.linked.filter(id=>enabled.includes(events[id].format));
  view.draft=league; view.track=availableTracks(league)[0]; go('attach');
});
document.addEventListener('input',e=>{
  if (e.target.id==='event-search') { view.search=e.target.value; document.getElementById('choices').innerHTML=attachChoices(); }
  if (e.target.id==='registry-search') updateRegistry(e.target.value);
});
document.addEventListener('change',e=>{
  if (view.screen!=='rules') return;
  const rule = workingRules()[view.track], value=e.target.value;
  if (e.target.name==='basis') rule.basis=value;
  else if (e.target.id==='source') { rule.source=value || null; rule.includeSource=false; rule.order=value ? [...events[value].order] : []; }
  else if (e.target.id==='include-source') rule.includeSource=e.target.checked;
  else if (e.target.id==='add-metric' && value) rule.order.push(value);
  else if (e.target.hasAttribute('data-scale')) {
    const scale = [...rule.scale], index=Number(e.target.dataset.scale); scale[index]=Number(value);
    if (!value || !e.target.validity.valid || scale.some((v,i)=>i && v>scale[i-1])) { e.target.value=rule.scale[index]; announce('Шкала должна убывать или оставаться равной. Введите целые очки.'); return; }
    rule.scale=scale;
  } else return;
  render();
});
document.addEventListener('click',e=>{
  const eLink=e.target.closest('[data-event]'); if (eLink) { view.event=eLink.dataset.event; if(view.screen==='tournament') render(); return; }
  const b=e.target.closest('[data-action]'); if (!b) return;
  const action=b.dataset.action, value=b.dataset.value, league=currentLeague();
  const rule=workingRules()[view.track];
  switch (action) {
    case 'page': go(value); return;
    case 'open-league': view.league=leagues[Number(value)]; go(availableTracks(view.league)[0]); return;
    case 'expand': view.expanded=view.expanded===value ? '' : value; break;
    case 'explain-pick': showDialog(factions[value][0],fullPick(value)); return;
    case 'rules-track': view.track=value; break;
    case 'edit-formats': editFormatsDialog(); return;
    case 'preview-formats': {
      const enabled=[...dialog.querySelectorAll('[name=edit-format]:checked')].map(input=>input.value);
      if (!enabled.length) { announce('Выберите хотя бы один формат.'); return; }
      view.formatEdit=enabled; dialog.close(); break;
    }
    case 'new-metric': metricDialog(); return;
    case 'add-position': rule.scale.splice(-1,0,rule.scale.at(-1)); break;
    case 'remove-position': if(rule.scale.length>2)rule.scale.splice(-2,1); break;
    case 'define-metric': {
      const name=document.getElementById('metric-name').value.trim(), field=document.getElementById('metric-field').value, aggregate=document.getElementById('metric-aggregate').value;
      if (!name) { document.getElementById('metric-name').focus(); return; }
      const key=`custom_${field}_${aggregate}`;
      if (rule.order.includes(key) || (aggregate==='sum' && rule.order.includes(field))) { announce('Такой расчёт уже есть в порядке.'); return; }
      rule.definitions[key]={name,field,aggregate}; rule.order.push(key); dialog.close(); break;
    }
    case 'rule-mode': rule.mode=value; if (value==='import' && !rule.source) { rule.source=completedSources(league,view.track)[0] || null; rule.order=rule.source ? [...events[rule.source].order] : []; } else if (value==='import') rule.order=[...events[rule.source].order]; break;
    case 'move-up': case 'move-down': { const i=rule.order.indexOf(value), j=i+(action==='move-up' ? -1 : 1); [rule.order[i],rule.order[j]]=[rule.order[j],rule.order[i]]; break; }
    case 'drop-metric': rule.order=rule.order.filter(key=>key!==value); delete rule.definitions[value]; break;
    case 'save-rules': {
      const next=leagueRulesPreview();
      const joined=unique([...next.linked,...pendingSources(view.edit).filter(id=>next.enabled.includes(events[id].format))]); if (issuesFor(next,view.edit,joined).length) return;
      league.enabled=[...next.enabled]; league.rules=structuredClone(view.edit); league.linked=joined;
      for (const settings of Object.values(league.rules)) settings.includeSource=false;
      if(view.draft) { leagues.push(view.draft); view.league=view.draft; view.draft=null; }
      announce('Правила сохранены'); go(view.track); return;
    }
    case 'pick-event': view.pick=value; break;
    case 'attach-confirm': if(!league.linked.includes(value)) league.linked.push(value); view.pick=null; announce('Турнир добавлен'); if(!view.draft) { go('events'); return; } break;
    case 'draft-remove': league.linked=league.linked.filter(id=>id!==value); break;
    case 'request-unlink': showDialog('Отвязать турнир?',`<p>«${escapeHtml(events[value].title)}» и его вклад исчезнут из этой лиги.</p><div class="actions spaced">${button('Отвязать от лиги','unlink',value)}</div>`); return;
    case 'unlink': league.linked=league.linked.filter(id=>id!==value); dialog.close(); announce('Турнир отвязан'); break;
    case 'resolve': resolveDialog(); return;
    case 'confirm-resolve': league.mapped=true; dialog.close(); announce('Выступление связано с профилем Стриж'); break;
    case 'back-league': {
      const candidates=leagues.filter(l=>l.linked.includes(view.event));
      if(candidates.length===1) { view.league=candidates[0]; go(trackFor(events[view.event].format)); }
      else showDialog('Выберите лигу',`<div class="stack">${candidates.map(l=>button(l.title,'event-league',String(leagues.indexOf(l)))).join('')}</div>`);
      return;
    }
    case 'event-league': dialog.close(); view.league=leagues[Number(value)]; go(trackFor(events[view.event].format)); return;
    default: return;
  }
  render();
  if (action==='expand') main.querySelector(`[data-action="expand"][data-value="${value}"]`)?.focus({preventScroll:true});
});
window.addEventListener('hashchange',readRoute);
readRoute();

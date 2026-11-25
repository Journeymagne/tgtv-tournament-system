const msg = require('./messages');
const { scoreFields } = require('./game-draft-steps');
const PAGE_SIZE = 12;
const BRAND = '🔶 <b>KT COMPANION</b>';
const clean = value => msg.short(value, 100);
const esc = value => clean(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const button = (text, callback_data) => ({text:msg.short(text,60),callback_data});
const t = (locale,ru,en) => msg.choose(locale,ru,en);
const chunks = (items,size) => Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
const payload = (text,rows) => ({text,parse_mode:'HTML',reply_markup:{inline_keyboard:rows},link_preview_options:{is_disabled:true}});
const names = game => (game.players || []).map(player=>esc(player.name)).join(' — ');
const status = (value,locale) => ({open:t(locale,'Ожидает результата','Awaiting result'),pending_confirmation:t(locale,'Ожидает подтверждения','Awaiting confirmation'),
  completed:t(locale,'Завершена','Completed'),cancelled:t(locale,'Отменена','Cancelled')})[value] || t(locale,'Недоступна','Unavailable');
const fields = {
  crit:['Crit Op','Crit Op'],kill:['Kill Op','Kill Op'],tac:['Tac Op','Tac Op'],primary:['Primary Op','Primary Op'],
  faction:['Фракция','Faction'],tacOp:['Tac Op','Tac Op selection'],killzone:['Киллзона','Killzone'],critOp:['Crit Op','Crit Op'],layout:['Раскладка','Layout'],
  tie:['Ничья','Tied score'],aplTens:['APL · десятки','APL · tens'],aplOnes:['APL · единицы','APL · ones'],rollOffWinnerId:['Победитель броска','Roll-off winner']
};
function fieldName(field,locale) { return fields[field]?.[locale==='en'?1:0] || field; }
function choiceName(choice,field,game,locale) {
  if(choice.labelKey==='gameDraft.unset') return t(locale,'Не указано','Not set');
  if(field==='tie') return choice.value?t(locale,'Определить победителя','Resolve winner'):t(locale,'Сохранить ничью','Keep draw');
  if(field==='primary') return fieldName(choice.value,locale);
  if(field==='rollOffWinnerId') return clean(game.players.find(player=>player.id===choice.value)?.name || choice.value);
  return String(choice.value??t(locale,'Не указано','Not set'));
}
function contextLines(game,locale) {
  const lines=[BRAND,'',`<b>${names(game)}</b>`,`#${game.id} · ${status(game.status,locale)}`];
  if(game.tournament) lines.push(esc(game.tournament.name));
  const match=game.tournamentMatch || game.teamMatch;
  if(match?.roundNumber) lines.push(t(locale,'Раунд ','Round ')+match.roundNumber);
  const table=game.tournamentMatch?.table;
  if(table) lines.push(t(locale,'Стол: ','Table: ')+esc(table.name || table.number));
  const mission=game.teamTournamentGame?.mission || game.tournamentMatch?.mission;
  if(mission) lines.push([mission.killzone,mission.critOp,mission.layout?t(locale,'Раскладка ','Layout ')+mission.layout:null].filter(Boolean).map(esc).join(' · '));
  return lines.filter(Boolean);
}
function resultLines(game,result,locale) {
  if(!result?.scores) return [];
  const lines=[];
  for(const player of game.players || []) {
    const score=result.scores[player.id]; if(!score) continue;
    lines.push(`<b>${esc(player.name)}: ${score.total??'—'}</b>`,
      `Crit ${score.crit??'—'} · Kill ${score.kill??'—'} · Tac ${score.tac??'—'}`,
      'Primary Op: '+esc(fieldName(score.primary,locale))+` (+${score.primaryBonus??'—'})`);
    if(score.faction) lines.push(esc(score.faction));
    if(score.tacOp) lines.push(t(locale,'Tac Op: ','Tac Op: ')+esc(score.tacOp));
  }
  const winner=game.players.find(player=>player.id===result.winnerId);
  lines.push(winner?t(locale,'Победитель: ','Winner: ')+esc(winner.name):t(locale,'Ничья','Draw'));
  if(result.tiebreakers?.enabled) {
    const labels={primary:'Primary Op',critTac:'Crit + Tac',apl:'APL',rollOff:t(locale,'Бросок','Roll-off')};
    lines.push(t(locale,'Критерий: ','Decided by: ')+(labels[result.tiebreakers.decidedBy] || 'APL'));
    if(result.tiebreakers.apl) lines.push('APL: '+game.players.map(player=>`${esc(player.name)} ${result.tiebreakers.apl[player.id]??0}`).join(' · '));
  }
  const assigned=game.teamTournamentGame?.mission || game.tournamentMatch?.mission;
  const missionKey=value=>JSON.stringify([value?.killzone || '',value?.critOp || '',value?.layout || null]);
  if(result.killzone && missionKey(result.killzone)!==missionKey(assigned)) lines.push([result.killzone.killzone,result.killzone.critOp,result.killzone.layout?t(locale,'Раскладка ','Layout ')+result.killzone.layout:null].filter(Boolean).map(esc).join(' · '));
  return lines;
}
function renderMenu(page,locale) {
  const lines=[BRAND,'',`<b>${t(locale,'Мои игры','My games')}</b>`,t(locale,page.filter==='all'?'Все игры':'Активные игры',page.filter==='all'?'All games':'Active games')];
  const rows=[[
    button(t(locale,'Активные','Active'),'g:l:active:next:0'),button(t(locale,'Все','All'),'g:l:all:next:0')
  ]];
  for(const game of page.games.slice(0,6)) {
    const score=game.score?' · '+game.score.map(score=>score.total??'—').join(':'):'';
    lines.push('',`#${game.id} · ${status(game.status,locale)}${score}`);
    if(game.tournament) lines.push(esc(msg.short(game.tournament.name,35))+(game.tournament.round?' · '+t(locale,'Р','R')+game.tournament.round:''));
    rows.push([button(`#${game.id} · ${game.players.map(player=>clean(player.name)).join(' — ')}`,`g:v:${game.id}`)]);
  }
  if(!page.games.length) lines.push('',t(locale,'Игр пока нет.','No games yet.'));
  const nav=[];
  if(page.previousCursor) nav.push(button(t(locale,'← Назад','← Previous'),`g:l:${page.filter}:previous:${page.previousCursor}`));
  if(page.nextCursor) nav.push(button(t(locale,'Далее →','Next →'),`g:l:${page.filter}:next:${page.nextCursor}`));
  if(nav.length) rows.push(nav);
  for(const pairing of page.pairings || []) rows.push([msg.button(t(locale,'Пары капитана: ','Captain pairing: ')+msg.short(pairing.name,35),`#/team-matches/${pairing.id}`)]);
  rows.push([msg.appButton(t(locale,'Все игры в Companion','All games in Companion'),'/tournament#/mygames')]);
  return payload(lines.join('\n'),rows);
}
function renderGame(game,locale) {
  const rows=[]; const permissions=game.resultPermissions || {};
  const generation=Number.isSafeInteger(game.callbackGeneration)?`:u${game.callbackGeneration}`:'';
  if(permissions.canSubmit) rows.push([button(t(locale,'Сдать результат','Enter result'),`g:s:${game.id}:submit${generation}`)]);
  if(permissions.canReview) rows.push([button(t(locale,'Подтвердить','Confirm'),`g:s:${game.id}:confirm${generation}`),button(t(locale,'Отклонить','Reject'),`g:s:${game.id}:reject${generation}`)]);
  rows.push([button(t(locale,'← Мои игры','← My games'),'g:l:active:next:0')],[msg.appButton(t(locale,'Открыть в Companion','Open in Companion'),`#/games/game/${game.id}`)]);
  return payload([...contextLines(game,locale),'',...resultLines(game,game.result || game.pendingResult?.result,locale)].join('\n'),rows);
}
function renderDraft(view,locale) {
  const {game}=view; const lines=contextLines(game,locale); const rows=[];
  const prefix=`g:d:${view.token}:${view.version}`;
  const action=(label,type)=>button(label,`${prefix}:${type}`);
  const editable = onlyExtras => chunks(view.editableFields.flatMap((field, index) => {
    if (Boolean(field.extra) !== onlyExtras || scoreFields.includes(field.field)) return [];
    const player = game.players.find(player => player.id === field.playerId);
    const label = fieldName(field.field, locale);
    return [button(player ? `${msg.short(player.name, 10)} · ${label}` : label, `${prefix}:edit:${index}`)];
  }), 2);
  if(view.screen==='choice') {
    const field=view.step.field;
    const player=game.players.find(item=>item.id===view.step.playerId);
    lines.push('',`<b>${player?esc(player.name)+' · ':''}${esc(fieldName(field,locale))}</b>`);
    if(view.step.index<view.step.total) lines.push(t(locale,'Шаг ','Step ')+(view.step.index+1)+' / '+view.step.total);
    lines.push(t(locale,'Выбери значение кнопкой.','Choose a value below.'));
    if(view.step.value!==null) lines.push(t(locale,'Сейчас: ','Current: ')+esc(choiceName({value:view.step.value},field,game,locale)));
    const maxPage=Math.max(0,Math.ceil(view.choices.length/PAGE_SIZE)-1);
    const choicePage=Math.max(0,Math.min(maxPage,view.choicePage || 0));
    const choices=view.choices.slice(choicePage*PAGE_SIZE,(choicePage+1)*PAGE_SIZE).map((choice,index)=>
      button(choiceName(choice,field,game,locale),`${prefix}:choose:${choicePage*PAGE_SIZE+index}`));
    rows.push(...chunks(choices,['crit','kill','tac','aplTens','aplOnes','layout'].includes(field)?4:2));
    const nav=[];
    if(choicePage) nav.push(button('←',`g:p:${view.token}:${view.version}:${choicePage-1}`));
    if(choicePage<maxPage) nav.push(button('→',`g:p:${view.token}:${view.version}:${choicePage+1}`));
    if(nav.length) rows.push(nav);
    rows.push([action(t(locale,'← Назад','← Back'),'back'),action(t(locale,'Отмена','Cancel'),'cancel')]);
  } else if(view.screen==='extras') {
    lines.push('',t(locale,'<b>Дополнительно</b>','<b>Extras</b>'),t(locale,'Необязательные поля.','Optional fields.'));
    rows.push(...editable(true),[action(t(locale,'← К проверке','← Review'),'back'),action(t(locale,'Отмена','Cancel'),'cancel')]);
  } else if(['summary','review'].includes(view.screen)) {
    lines.push('',t(locale,'<b>Проверь результат</b>','<b>Check the result</b>'),...resultLines(game,view.summary.result,locale));
    const confirm=view.mode==='confirm',reject=view.mode==='reject';
    lines.push('',reject?t(locale,'Отклонить этот результат?','Reject this result?'):confirm?t(locale,'Подтвердить этот результат?','Confirm this result?'):
      view.summary.confirmationRequired?t(locale,'После отправки потребуется подтверждение соперника.','After submission your opponent must confirm it.'):
        t(locale,'После отправки игра завершится.','Submitting will complete the game.'));
    rows.push([action(reject?t(locale,'Да, отклонить','Yes, reject'):confirm?t(locale,'Да, подтвердить','Yes, confirm'):t(locale,'Отправить результат','Submit result'),'submit')]);
    if(view.screen==='summary') rows.push(...editable(false),[action(t(locale,'Дополнительно','Extras'),'extras')]);
    rows.push([action(t(locale,'← Назад','← Back'),'back'),action(t(locale,'Отмена','Cancel'),'cancel')]);
  } else if(view.screen==='saved') {
    const outcomes={submitted:t(locale,'✅ Результат отправлен на подтверждение.','✅ Result submitted for confirmation.'),completed:t(locale,'✅ Результат сохранён. Игра завершена.','✅ Result saved. Game completed.'),
      confirmed:t(locale,'✅ Результат подтверждён.','✅ Result confirmed.'),rejected:t(locale,'✅ Результат отклонён.','✅ Result rejected.')};
    lines.push('',outcomes[view.summary.outcome] || t(locale,'✅ Сохранено.','✅ Saved.'),...resultLines(game,view.summary.result,locale));
  } else lines.push('',t(locale,'Ввод результата отменён.','Result entry cancelled.'));
  if(['saved','cancelled'].includes(view.screen)) rows.push([button(t(locale,'Открыть игру','View game'),`g:v:${game.id}`)],[button(t(locale,'Мои игры','My games'),'g:l:active:next:0')]);
  return payload(lines.join('\n'),rows);
}
function renderError(error,locale) {
  let text;
  if(error.code==='GAME_RATE') text=t(locale,'Слишком много нажатий. Подожди минуту и открой /games.','Too many taps. Wait a minute and open /games.');
  else if(error.code==='GAME_DRAFT_EXPIRED') text=t(locale,'Время ввода истекло. Открой игру и начни снова.','Result entry expired. Open the game and start again.');
  else if(error.code==='GAME_DRAFT_IDENTITY' || error.status===403) text=t(locale,'Игра недоступна этому аккаунту. Проверь привязку в /settings.','This game is unavailable to this account. Check your connection in /settings.');
  else if(error.status===404) text=t(locale,'Игра или форма уже недоступна. Открой текущий список игр.','The game or form is no longer available. Open your current games.');
  else if(error.status===400) text=t(locale,'Эта кнопка недействительна. Открой текущий список игр.','This button is invalid. Open your current games.');
  else text=t(locale,'Игра или форма изменилась. Старая кнопка не применена. Открой текущую игру.','The game or form changed. The old button was not applied. Open the current game.');
  return payload(BRAND+'\n\n'+text,[[button(t(locale,'Мои игры','My games'),'m:games')]]);
}
module.exports={renderMenu,renderGame,renderDraft,renderError};

(function(root){
'use strict';
const Icons=root.KTTokenIcons,esc=root.KTCards.esc;
const english=()=>root.KTAppearance?.locale==='en';
const text=(ru,en)=>english()?en:ru;
const name=id=>{const icon=Icons.get(id);return icon?(english()?icon.en:icon.ru):id==='custom'?text('Свой символ','Custom symbol'):text('Без символа','No symbol')};
function thumbnail(id,uri=''){
 if(id==='custom'&&uri)return '<img src="'+esc(uri)+'" alt="">';
 if(id==='none')return '<span class="token-symbol-empty" aria-hidden="true">∅</span>';
 return '<svg viewBox="0 0 100 100" aria-hidden="true" fill="#eef1da">'+Icons.artwork(id,'#28515b','#eef1da')+'</svg>';
}
function button(token){return '<div class="token-symbol-control"><span>'+text('Символ в центре','Central symbol')+'</span><button type="button" data-token-action="choose-symbol" aria-haspopup="dialog" data-ui-skip><span class="token-symbol-thumb">'+thumbnail(token.symbol,token.symbolImage)+'</span><span data-token-symbol-label="'+esc(token.symbol)+'">'+esc(name(token.symbol))+'</span><span class="token-symbol-change">'+text('Выбрать…','Choose…')+'</span></button></div>'}
function open(token,select){
 if(document.querySelector('#token-symbol-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='token-symbol-dialog';dialog.className='project-dialog';dialog.dataset.uiSkip='';dialog.setAttribute('aria-labelledby','token-symbol-title');
 let query='',category='';
 const close=()=>dialog.close();
 function choices(){
  const needle=query.trim().toLocaleLowerCase(),filtered=Icons.icons.filter(icon=>(!category||icon.category===category)&&(!needle||[icon.ru,icon.en,icon.id].some(value=>value.toLocaleLowerCase().includes(needle))));
  const item=(id,uri)=>'<button type="button" data-symbol-choice="'+id+'" aria-pressed="'+(token.symbol===id)+'" title="'+esc(name(id))+'"><span class="token-symbol-thumb">'+thumbnail(id,uri)+'</span><span>'+esc(name(id))+'</span></button>';
  dialog.querySelector('.token-symbol-special').innerHTML=item('none')+(token.symbolImage?item('custom',token.symbolImage):'');
  dialog.querySelector('.token-symbol-grid').innerHTML=filtered.map(icon=>item(icon.id)).join('')||'<p>'+text('Ничего не найдено','No matching symbols')+'</p>';
  dialog.querySelector('.token-symbol-count').textContent=filtered.length+' / '+Icons.icons.length;
 }
 function render(){
  dialog.innerHTML='<div class="project-dialog-heading"><h2 id="token-symbol-title">'+text('Символ в центре','Central symbol')+'</h2><button type="button" data-symbol-close aria-label="'+text('Закрыть','Close')+'">✕</button></div><p class="hint">'+text('100 встроенных символов. Форма, цвет и размер жетона сохраняются.','100 built-in symbols. Token shape, colour and size stay the same.')+'</p><div class="token-symbol-filters"><label>'+text('Поиск','Search')+'<input type="search" data-symbol-search maxlength="100" placeholder="'+text('Меч, болтер, щит…','Sword, bolter, shield…')+'" value="'+esc(query)+'" autofocus></label><label>'+text('Категория','Category')+'<select data-symbol-category><option value="">'+text('Все категории','All categories')+'</option>'+Icons.categories.map(([id,ru,en])=>'<option value="'+id+'" '+(category===id?'selected':'')+'>'+esc(text(ru,en))+'</option>').join('')+'</select></label></div><div class="token-symbol-special"></div><div class="token-symbol-results"><span>'+text('Встроенные символы','Built-in symbols')+'</span><output class="token-symbol-count" aria-live="polite"></output></div><div class="token-symbol-grid"></div>';
  choices();
 }
 render();
 dialog.addEventListener('input',e=>{if(e.target.matches('[data-symbol-search]')){query=e.target.value;choices()}});
 dialog.addEventListener('change',e=>{if(e.target.matches('[data-symbol-category]')){category=e.target.value;choices()}});
 dialog.addEventListener('click',e=>{
  if(e.target.closest('[data-symbol-close]')){close();return}
  const choice=e.target.closest('[data-symbol-choice]');if(!choice)return;
  const id=choice.dataset.symbolChoice;
  if(!Icons.get(id)&&id!=='none'&&!(id==='custom'&&token.symbolImage))return;
  close();select(id);
 });
 const locale=()=>{render();dialog.querySelector('input').focus()};
 root.addEventListener('kt:locale',locale);
 dialog.addEventListener('close',()=>{root.removeEventListener('kt:locale',locale);dialog.remove()},{once:true});
 document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
}
root.addEventListener('kt:locale',()=>{
 document.querySelectorAll('[data-token-symbol-label]').forEach(el=>el.textContent=name(el.dataset.tokenSymbolLabel));
 document.querySelectorAll('.token-symbol-change').forEach(el=>el.textContent=text('Выбрать…','Choose…'));
});
root.KTTokenIconPicker={button,open};
})(typeof window!=='undefined'?window:globalThis);

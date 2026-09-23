(function(root){
'use strict';
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const Cards=root.KTCards||(typeof require!=='undefined'?require('./card-renderer.js'):null);
const GROUPS=[
 {id:'rules',name:'Состав и правила команды',label:'TEAM RULES',keys:['selectionCards','teamCards']},
 {id:'strategic',name:'Strategic Ploys',label:'STRATEGY PLOYS',keys:['strategicPloys']},
 {id:'firefight',name:'Firefight Ploys',label:'FIREFIGHT PLOYS',keys:['firefightPloys']},
 {id:'equipment',name:'Equipment',label:'FACTION EQUIPMENT',keys:['equipment']},
 {id:'operatives',name:'Оперативники',label:'OPERATIVES',keys:['operatives']}
];
const slug=s=>String(s).toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-|-$/g,'')||'kill-team';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function defaultFolder(d){return 'C:/TTS/'+slug(d.team.name)}
function assetURL(base,file){
 base=String(base||'').trim().replace(/\\/g,'/').replace(/\/+$/,'');
 if(!base||/[\r\n\x00]/.test(base))throw Error('Укажите полную папку распакованного архива');
 if(/^https?:\/\//i.test(base)){
  const url=new URL(base+'/');if(url.search||url.hash||url.username||url.password)throw Error('Укажите адрес папки без параметров и пароля');
  return new URL(file.split('/').map(encodeURIComponent).join('/'),url).href;
 }
 if(!/^(?:[a-z]:\/|\/)/i.test(base))throw Error('Нужен полный путь, например C:/TTS/kasrkin');
 return base+'/'+file;
}
function backSVG(data,group,landscape){
 const w=landscape?Cards.LONG:Cards.SHORT,h=landscape?Cards.SHORT:Cards.LONG;
 const team=data.team.name,accent=/^#[\da-f]{6}$/i.test(data.layout.accent)?data.layout.accent:'#cd6530';
 const font=/[\u0400-\u04ff]/.test(team)?'Roboto':'Display',size=landscape?24:23;
 const lines=Cards.wrap(team,w-30,size,font==='Roboto'?'RobotoBold':font);
 const title=lines.map((s,i)=>'<text x="'+w/2+'" y="'+(h*.42+(i-(lines.length-1)/2)*(size+3))+'" text-anchor="middle" fill="white" font-family="'+font+'" font-weight="bold" font-size="'+size+'">'+esc(s)+'</text>').join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="'+w+'" height="'+h+'" fill="#141718"/><rect x="8" y="8" width="'+(w-16)+'" height="'+(h-16)+'" rx="8" fill="none" stroke="'+accent+'"/><path d="M12 '+(h*.64)+'H'+(w-12)+'" stroke="'+accent+'" stroke-width="3"/>'+Cards.teamLogo(data,w/2-16,h*.08,32)+title+'<text x="'+w/2+'" y="'+(h*.77)+'" text-anchor="middle" fill="'+accent+'" font-family="Display" font-size="16">'+esc(group.label)+'</text><text x="'+w/2+'" y="'+(h-22)+'" text-anchor="middle" fill="#9da69f" font-family="Roboto" font-size="6">KILL TEAM · '+esc(data.team.version||'CUSTOM TEAM')+'</text></svg>';
}
function plan(input,assets={},options={}){
 const data=Model.validate(Model.migrate(input)),decks=[],sheets=[];
 let sheetId=options.firstSheetId??(Math.floor(Math.random()*10000000)+1),contentSides=0;
 for(const group of GROUPS){
  const landscape=group.id==='operatives',back=backSVG(data,group,landscape),deck={...group,cards:[],sheets:[],landscape};
  for(const key of group.keys)for(const [index,card] of data[key].entries()){
   const sides=Cards.renderCard(card,data,assets,index);contentSides+=sides.length;
   for(let i=0;i<sides.length;i+=2){
    const part=i/2+1,parts=Math.ceil(sides.length/2),name=(card.name||'Пустое место '+(index+1))+(parts>1?' · '+part+'/'+parts:'');
    deck.cards.push({sourceId:card.id,name,part,parts,face:sides[i].svg,back:sides[i+1]?.svg||back,doubleSided:!!sides[i+1],sourceSides:[i+1,...(sides[i+1]?[i+2]:[])]});
   }
  }
  if(!deck.cards.length)continue;
  // Small sheets preserve readable rule text. The final cell is always reserved for hidden cards.
  for(let offset=0;offset<deck.cards.length;offset+=8){
   const cards=deck.cards.slice(offset,offset+8),columns=3,rows=Math.max(2,Math.ceil((cards.length+1)/columns));
   const cellWidth=landscape?1210:700,cellHeight=landscape?700:1210,id=sheetId++;
   if(id<1||id>21474835)throw Error('Неверный идентификатор листа');
   const stem=group.id+'-'+(deck.sheets.length+1),sheet={id,stem,name:group.name,columns,rows,cellWidth,cellHeight,width:columns*cellWidth,height:rows*cellHeight,count:cards.length,landscape,faceFile:'sheets/'+stem+'-faces.png',backFile:'sheets/'+stem+'-backs.png',cards,hidden:back};
   cards.forEach((c,slot)=>{c.cardId=id*100+slot;c.sheetId=id;c.slot=slot});
   deck.sheets.push(sheet);sheets.push(sheet);
  }
  decks.push(deck);
 }
 if(!decks.length)throw Error('Добавьте хотя бы одну карточку');
 return {team:data.team,slug:slug(data.team.name),decks,sheets,contentSides,cardCount:decks.reduce((n,d)=>n+d.cards.length,0),doubleSided:decks.flatMap(d=>d.cards).filter(c=>c.doubleSided).length,incomplete:Model.incomplete(data).length};
}
function manifest(p){return {format:'kill-team-studio-tts',version:1,team:p.team.name,cardCount:p.cardCount,contentSides:p.contentSides,doubleSided:p.doubleSided,incomplete:p.incomplete,decks:p.decks.map(d=>({id:d.id,name:d.name,count:d.cards.length,cards:d.cards.map(c=>({name:c.name,sourceId:c.sourceId,part:c.part,parts:c.parts,cardId:c.cardId,sheetId:c.sheetId,slot:c.slot,sourceSides:c.sourceSides,doubleSided:c.doubleSided}))})),sheets:p.sheets.map(s=>({id:s.id,name:s.name,face:s.faceFile,back:s.backFile,width:s.columns,height:s.rows,number:s.count,pixelWidth:s.width,pixelHeight:s.height,cellWidth:s.cellWidth,cellHeight:s.cellHeight,uniqueBacks:true,backIsHidden:false,sideways:s.landscape,hiddenSlot:s.columns*s.rows-1}))}}
function savedObjects(p,base){
 const definitions=Object.fromEntries(p.sheets.map(s=>[s.id,{FaceURL:assetURL(base,s.faceFile),BackURL:assetURL(base,s.backFile),NumWidth:s.columns,NumHeight:s.rows,BackIsHidden:false,UniqueBack:true}]));
 const used=new Set();function guid(){let value;do{value=Math.floor(Math.random()*0x1000000).toString(16).padStart(6,'0')}while(used.has(value));used.add(value);return value}
 const common=(name,title)=>({Name:name,Transform:{posX:0,posY:2,posZ:0,rotX:0,rotY:180,rotZ:0,scaleX:1,scaleY:1,scaleZ:1},Nickname:title,Description:'Kill Team Studio · '+p.team.name,ColorDiffuse:{r:1,g:1,b:1},Locked:false,Grid:false,Snap:false,Autoraise:true,Sticky:true,Tooltip:true,GUID:guid()});
 const wrap=object=>({SaveName:object.Nickname,ObjectStates:[object]});
 const objects=p.decks.map(d=>{
  const cards=d.cards.map(c=>({...common('CardCustom',c.name),Description:c.parts>1?'Продолжение: карта '+c.part+' из '+c.parts:'',CardID:c.cardId,SidewaysCard:d.landscape,HideWhenFaceDown:false,Hands:true,CustomDeck:{[c.sheetId]:definitions[c.sheetId]}}));
  if(cards.length===1)return cards[0];
  return {...common('DeckCustom',p.team.name+' — '+d.name),DeckIDs:cards.map(c=>c.CardID),CustomDeck:Object.fromEntries(d.sheets.map(s=>[s.id,definitions[s.id]])),SidewaysCard:d.landscape,HideWhenFaceDown:false,Hands:true,ContainedObjects:cards};
 });
 const bag={...common('Bag',p.team.name+' — все колоды'),ContainedObjects:objects};
 return {'all-decks.json':wrap(bag),...Object.fromEntries(objects.map((o,i)=>[p.decks[i].id+'.json',wrap(o)]))};
}
const json=value=>JSON.stringify(value,null,2);
function helperHTML(p,objects,base){
 // This page travels with the images. It rewrites every nested deck reference, without uploading anything.
 const payload=JSON.stringify({objects,base,slug:p.slug,files:p.sheets.flatMap(s=>[s.faceFile,s.backFile])}).replace(/</g,'\\u003c');
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(p.team.name)+' · импорт в TTS</title><style>body{font:16px/1.6 system-ui;background:#f4f5f2;color:#26302c;max-width:900px;padding:28px;margin:auto}h1{line-height:1.2}section{background:white;border:1px solid #d1d9ce;border-radius:8px;padding:24px;margin:20px 0}label{display:block;margin:16px 0}input,select{box-sizing:border-box;width:100%;padding:10px;font:inherit}button{background:#cf6035;color:white;border:0;border-radius:5px;padding:12px 16px;font:inherit;cursor:pointer;margin:5px}code{overflow-wrap:anywhere}small{color:#5c6b60}a{color:#a24422}#status{color:#963b25}[hidden]{display:none}</style><h1>'+esc(p.team.name)+' → Tabletop Simulator</h1><p>'+p.cardCount+' карт · '+p.decks.length+' колод · '+p.doubleSided+' двусторонних карт</p><section><h2>1. Изображения карт</h2><p>Распакуйте весь архив в постоянную папку. Сохранённые колоды будут ссылаться на изображения в ней.</p><label>Где находятся изображения?<select id="mode"><option value="local">На моём компьютере</option><option value="cloud">В Steam Cloud / по прямым ссылкам</option></select></label><div id="local"><label>Полная папка распакованного архива<input id="folder"></label><small>При открытии этой страницы с диска путь подставляется автоматически. В папке должна находиться подпапка sheets.</small></div><div id="cloud" hidden><p>Загрузите изображения через Upload → Cloud Manager в TTS. Вставьте прямую ссылку для каждого файла.</p><div id="urls"></div></div></section><section><h2>2. Готовые колоды</h2><p>Скачайте набор целиком или отдельную колоду.</p><div id="downloads"></div><p id="status" role="status"></p><p>Поместите скачанный JSON в папку <code>Documents\\My Games\\Tabletop Simulator\\Saves\\Saved Objects</code>. Если папки ещё нет, сохраните любой объект в TTS через Save Object. При перенесённой папке Documents используйте фактическую папку сохранений игры.</p><p>Откройте стол → <b>Objects → Saved Objects</b> → выберите набор. В мешке находятся отдельные колоды.</p></section><section><h2>Для игры с друзьями</h2><p>Локальные картинки видны только вам. Можно загрузить листы в Steam Cloud и воспользоваться режимом ссылок выше. Либо разместите только этот набор на пустом столе, откройте Upload → Cloud Manager → Upload All, дождитесь загрузки и заново сохраните набор через Save Object.</p><p><a href="https://kb.tabletopsimulator.com/custom-content/custom-deck/">Документация TTS</a> · <a href="https://kb.tabletopsimulator.com/custom-content/cloud-manager/">Steam Cloud</a></p></section><script>const pack='+payload+';'+String(helperRuntime)+';helperRuntime(pack);</script></html>';
}
function helperRuntime(pack){
 const $=s=>document.querySelector(s),folder=$('#folder');folder.value=pack.base;
 if(location.protocol==='file:'){let path=decodeURIComponent(new URL('.',location.href).pathname);if(/^\/[a-z]:\//i.test(path))path=path.slice(1);folder.value=path.replace(/\/$/,'')}
 const inputs={};for(const file of pack.files){const label=document.createElement('label'),a=document.createElement('a'),input=document.createElement('input');a.textContent=file;a.href=file;a.target='_blank';input.type='url';input.placeholder='https://…';label.append(a,input);$('#urls').append(label);inputs[file]=input}
 $('#mode').onchange=()=>{const cloud=$('#mode').value==='cloud';$('#local').hidden=cloud;$('#cloud').hidden=!cloud;$('#status').textContent=''};
 function pathFor(file){
  if($('#mode').value==='cloud'){const raw=inputs[file].value.trim();let u;try{u=new URL(raw)}catch{throw Error('Добавьте прямую ссылку: '+file)}if(!/^https?:$/.test(u.protocol))throw Error('Нужна ссылка http или https: '+file);return u.href}
  const path=folder.value.trim().replace(/\\/g,'/').replace(/\/+$/,'');if(!/^(?:[a-z]:\/|\/)/i.test(path)||/[\r\n\x00]/.test(path))throw Error('Укажите полный путь к папке архива');return path+'/'+file;
 }
 function relink(obj){if(!obj||typeof obj!=='object')return;for(const key of Object.keys(obj)){if(key==='FaceURL'||key==='BackURL'){const old=obj[key].replace(/\\/g,'/'),file=pack.files.find(f=>old.endsWith('/'+f));if(!file)throw Error('Не найден лист '+old);obj[key]=pathFor(file)}else relink(obj[key])}}
 for(const [name,source] of Object.entries(pack.objects)){const b=document.createElement('button');b.textContent=name==='all-decks.json'?'↓ Все колоды в одном мешке':'↓ '+source.ObjectStates[0].Nickname;b.onclick=()=>{try{const data=JSON.parse(JSON.stringify(source));relink(data);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=pack.slug+'-'+name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);$('#status').textContent='Файл готов. Перенесите его в Saved Objects.'}catch(e){$('#status').textContent=e.message}};$('#downloads').append(b)}
}
function readme(p,base){return '# '+p.team.name+' — Tabletop Simulator\n\n'+p.cardCount+' карт, '+p.decks.length+' колод, '+p.doubleSided+' двусторонних. '+(p.incomplete?'Есть незаполненные места: '+p.incomplete+'. Они сохранены в экспорте.':'')+'\n\n1. Распакуйте архив в '+base+'.\n2. Скопируйте objects/all-decks.json в Documents/My Games/Tabletop Simulator/Saves/Saved Objects. Можно выбрать отдельные JSON колод вместо набора. Если папка Documents перенесена, используйте фактическую папку сохранений TTS.\n3. В TTS откройте Objects → Saved Objects и добавьте набор на стол.\n\nЕсли выбрали другую папку: откройте IMPORT.html из распакованного архива и скачайте JSON с новым путём. Изображения должны оставаться в папке sheets. Не открывайте IMPORT.html внутри ZIP.\n\nДля друзей нужны изображения в Steam Cloud. IMPORT.html принимает прямые ссылки для всех листов. Также можно загрузить только этот набор на пустой стол, затем Upload → Cloud Manager → Upload All и заново сохранить объекты. Сам экспорт ничего не загружает.\n\nРучной импорт через Objects → Components → Custom → Deck:\n\n'+p.sheets.map(s=>s.name+' / '+s.stem+'\nFace: '+s.faceFile+'\nBack: '+s.backFile+'\nWidth: '+s.columns+'; Height: '+s.rows+'; Number: '+s.count+'\nUnique Backs: ON; Back is Hidden: OFF; Sideways: '+(s.landscape?'ON':'OFF')).join('\n\n')+'\n\nПоследняя ячейка каждого листа — нейтральная скрытая карта. Она не входит в колоду. Карты читаются слева направо, сверху вниз; обороты находятся в тех же ячейках. Более двух сторон превращаются в карты-продолжения с номерами в названии объекта.\n\nДокументация: https://kb.tabletopsimulator.com/custom-content/custom-deck/\nhttps://kb.tabletopsimulator.com/custom-content/cloud-manager/\n';}
function textFiles(p,base){
 const objects=savedObjects(p,base);
 return {'manifest.json':json(manifest(p)),'README.txt':readme(p,base),'IMPORT.html':helperHTML(p,objects,base),...Object.fromEntries(Object.entries(objects).map(([name,value])=>['objects/'+name,json(value)]))};
}
function fontCSS(assets){
 const fonts=[['Roboto','Roboto-Regular.ttf','normal','normal'],['Roboto','Roboto-Medium.ttf','bold','normal'],['Roboto','Roboto-Italic.ttf','normal','italic'],['Roboto','Roboto-MediumItalic.ttf','bold','italic'],['Display','BebasNeue-Regular.ttf','normal','normal'],['Symbols','NotoSansSymbols2-Regular.ttf','normal','normal']];
 return fonts.map(([family,file,weight,style])=>{const uri=assets['vendor/'+file];if(!uri?.startsWith('data:'))throw Error('Не загружен шрифт '+file);return '@font-face{font-family:'+family+';src:url('+uri+');font-weight:'+weight+';font-style:'+style+'}'}).join('');
}
async function raster(svg,width,height,css){
 const source=svg.replace(/(<svg[^>]*>)/,'$1<style>'+css+'</style>');
 const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Не удалось отрисовать карточку')),20000);img.onload=()=>{clearTimeout(timeout);resolve()};img.onerror=()=>{clearTimeout(timeout);reject(Error('Ошибка изображения карточки'))};img.src=url});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#141718';context.fillRect(0,0,width,height);context.drawImage(img,0,0,width,height);return canvas;
 }finally{URL.revokeObjectURL(url)}
}
async function browserExport(input,assets,options={}){
 const p=plan(input,assets),base=options.base||defaultFolder(input),css=fontCSS(assets);
 const ziplib=root.fflate;if(!ziplib)throw Error('Не загружен модуль архива');
 const files=Object.fromEntries(Object.entries(textFiles(p,base)).map(([name,value])=>[name,ziplib.strToU8(value)]));
 let done=0;const total=p.sheets.length*2;
 for(const s of p.sheets){
  const hidden=await raster(s.hidden,s.cellWidth,s.cellHeight,css);
  for(const [side,file] of [['face',s.faceFile],['back',s.backFile]]){
   const canvas=document.createElement('canvas');canvas.width=s.width;canvas.height=s.height;const context=canvas.getContext('2d',{alpha:false});
   for(let slot=0;slot<s.columns*s.rows;slot++){
    const card=s.cards[slot],image=card?await raster(card[side],s.cellWidth,s.cellHeight,css):hidden;
    context.drawImage(image,(slot%s.columns)*s.cellWidth,Math.floor(slot/s.columns)*s.cellHeight);
   }
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить PNG')),'image/png'));
   files[file]=new Uint8Array(await blob.arrayBuffer());options.onProgress?.(++done,total);
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 const bytes=ziplib.zipSync(files,{level:0});return {blob:new Blob([bytes],{type:'application/zip'}),manifest:manifest(p),filename:p.slug+'-tts.zip'};
}
root.KTTTS={GROUPS,slug,defaultFolder,assetURL,plan,manifest,savedObjects,textFiles,helperRuntime,browserExport,fontCSS};
if(typeof module!=='undefined')module.exports=root.KTTTS;
})(typeof window!=='undefined'?window:globalThis);

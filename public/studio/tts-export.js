(function(root){
'use strict';
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const Cards=root.KTCards||(typeof require!=='undefined'?require('./card-renderer.js'):null);
const GROUPS=[
 {id:'rules',name:'Состав и правила команды',label:'TEAM RULES',keys:['selectionCards','teamCards']},
 {id:'tokens',name:'Жетоны и маркеры',label:'MARKER/TOKEN GUIDE',keys:['tokenCards']},
 {id:'strategic',name:'Strategic Ploys',label:'STRATEGY PLOYS',keys:['strategicPloys']},
 {id:'firefight',name:'Firefight Ploys',label:'FIREFIGHT PLOYS',keys:['firefightPloys']},
 {id:'equipment',name:'Equipment',label:'FACTION EQUIPMENT',keys:['equipment']},
 {id:'operatives',name:'Оперативники',label:'OPERATIVES',keys:['operatives']}
];
const slug=s=>String(s).toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-|-$/g,'')||'kill-team';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function backSVG(data,group,landscape){
 const w=landscape?Cards.LONG:Cards.SHORT,h=landscape?Cards.SHORT:Cards.LONG;
 const team=data.team.name,accent=/^#[\da-f]{6}$/i.test(data.layout.accent)?data.layout.accent:'#cd6530';
 const font=/[\u0400-\u04ff]/.test(team)?'Roboto':'Display',size=landscape?24:23;
 const lines=Cards.wrap(team,w-30,size,font==='Roboto'?'RobotoBold':font);
 const title=lines.map((s,i)=>'<text x="'+w/2+'" y="'+(h*.42+(i-(lines.length-1)/2)*(size+3))+'" text-anchor="middle" fill="white" font-family="'+font+'" font-weight="bold" font-size="'+size+'">'+esc(s)+'</text>').join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="'+w+'" height="'+h+'" fill="#141718"/><rect x="8" y="8" width="'+(w-16)+'" height="'+(h-16)+'" rx="8" fill="none" stroke="'+accent+'"/><path d="M12 '+(h*.64)+'H'+(w-12)+'" stroke="'+accent+'" stroke-width="3"/>'+Cards.teamLogo(data,w/2-16,h*.08,32)+title+'<text x="'+w/2+'" y="'+(h*.77)+'" text-anchor="middle" fill="'+accent+'" font-family="Display" font-size="16">'+esc(group.label)+'</text><text x="'+w/2+'" y="'+(h-22)+'" text-anchor="middle" fill="#9da69f" font-family="Roboto" font-size="6">KILL TEAM · '+esc(data.team.version||'CUSTOM TEAM')+'</text></svg>';
}
// TTS accepts one PNG/JPG atlas per import, with at most 10 × 7 cells.
// Reserve the last cell for the hidden face, leaving 69 playable cards.
const MAX_CARDS=69,MAX_PIXELS=4096;
function sheetGrid(count){
 let best;
 for(let columns=2;columns<=10;columns++)for(let rows=2;rows<=7;rows++){
  if(columns*rows<=count)continue;
  const cellWidth=Math.min(700,Math.floor(MAX_PIXELS/columns),Math.floor(MAX_PIXELS/rows*70/121));
  const cellHeight=Math.round(cellWidth*121/70),cells=columns*rows;
  if(!best||cellWidth>best.cellWidth||(cellWidth===best.cellWidth&&cells<best.columns*best.rows))
   best={columns,rows,cellWidth,cellHeight,width:columns*cellWidth,height:rows*cellHeight};
 }
 if(!best)throw Error('На одном листе TTS помещается не более 69 карт');
 return best;
}
function plan(input,assets={}){
 const data=Model.validate(Model.migrate(input)),cards=[],sheets=[];
 let contentSides=0;
 for(const group of GROUPS){
  const landscape=group.id==='operatives',back=backSVG(data,group,landscape);
  for(const key of group.keys)for(const [index,card] of data[key].entries()){
   const sides=Cards.renderCard(card,data,assets,index);contentSides+=sides.length;
   for(let i=0;i<sides.length;i+=2){
    const part=i/2+1,parts=Math.ceil(sides.length/2),name=(card.name||'Пустое место '+(index+1))+(parts>1?' · '+part+'/'+parts:'');
    cards.push({sourceId:card.id,groupId:group.id,name,part,parts,landscape,face:sides[i].svg,back:sides[i+1]?.svg||back,doubleSided:!!sides[i+1],sourceSides:[i+1,...(sides[i+1]?[i+2]:[])]});
   }
  }
 }
 if(!cards.length)throw Error('Добавьте хотя бы одну карточку');
 const hidden=backSVG(data,{label:'KILL TEAM'},false);
 for(let offset=0;offset<cards.length;offset+=MAX_CARDS){
  const batch=cards.slice(offset,offset+MAX_CARDS),number=sheets.length+1;
  const stem=cards.length>MAX_CARDS?'deck-'+number:'deck';
  sheets.push({...sheetGrid(batch.length),number,count:batch.length,cards:batch,faceFile:stem+'-faces.png',backFile:stem+'-backs.png',hidden});
 }
 return {team:data.team,slug:slug(data.team.name),cards,sheets,contentSides,cardCount:cards.length,doubleSided:cards.filter(c=>c.doubleSided).length,incomplete:Model.incomplete(data).length};
}
function fontCSS(assets){
 const fonts=[['Roboto','Roboto-Regular.ttf','normal','normal'],['Roboto','Roboto-Medium.ttf','bold','normal'],['Roboto','Roboto-Italic.ttf','normal','italic'],['Roboto','Roboto-MediumItalic.ttf','bold','italic'],['Display','BebasNeue-Regular.ttf','normal','normal'],['Symbols','NotoSansSymbols2-Regular.ttf','normal','normal']];
 return fonts.map(([family,file,weight,style])=>{const uri=assets['vendor/'+file];if(!uri?.startsWith('data:'))throw Error('Не загружен шрифт '+file);return '@font-face{font-family:'+family+';src:url('+uri+');font-weight:'+weight+';font-style:'+style+'}'}).join('');
}
async function raster(svg,width,height,css,transparent=false){
 const source=svg.replace(/(<svg[^>]*>)/,'$1<style>'+css+'</style>');
 const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Не удалось отрисовать карточку')),20000);img.onload=()=>{clearTimeout(timeout);resolve()};img.onerror=()=>{clearTimeout(timeout);reject(Error('Ошибка изображения карточки'))};img.src=url});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!transparent){context.fillStyle='#141718';context.fillRect(0,0,width,height)}context.drawImage(img,0,0,width,height);return canvas;
 }finally{URL.revokeObjectURL(url)}
}
async function renderSheets(p,css,onProgress=()=>{}){
 const files={};let done=0;const total=p.sheets.length*2;
 for(const s of p.sheets){
  const hidden=await raster(s.hidden,s.cellWidth,s.cellHeight,css);
  for(const [side,file] of [['face',s.faceFile],['back',s.backFile]]){
   const canvas=document.createElement('canvas');canvas.width=s.width;canvas.height=s.height;
   const context=canvas.getContext('2d',{alpha:false});
   for(let slot=0;slot<s.columns*s.rows;slot++){
    const card=s.cards[slot],rotated=card?.landscape;
    const image=card?await raster(card[side],rotated?s.cellHeight:s.cellWidth,rotated?s.cellWidth:s.cellHeight,css):hidden;
    const x=(slot%s.columns)*s.cellWidth,y=Math.floor(slot/s.columns)*s.cellHeight;
    context.save();
    if(rotated){context.translate(x+s.cellWidth,y);context.rotate(Math.PI/2);context.drawImage(image,0,0)}
    else context.drawImage(image,x,y);
    context.restore();
   }
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить PNG')),'image/png'));
   files[file]=new Uint8Array(await blob.arrayBuffer());onProgress(++done,total);
   canvas.width=canvas.height=1;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }
 return files;
}
async function browserExport(input,assets,options={}){
 const p=plan(input,assets),css=fontCSS(assets),ziplib=root.fflate;
 if(!ziplib)throw Error('Не загружен модуль архива');
 const files=await renderSheets(p,css,options.onProgress);
 const bytes=ziplib.zipSync(files,{level:0});return {blob:new Blob([bytes],{type:'application/zip'}),cardCount:p.cardCount,sheetCount:p.sheets.length,filename:p.slug+'-tts.zip'};
}
async function browserPack(input,assets,options={}){
 const p=plan(input,assets),css=fontCSS(assets),data=Model.validate(Model.migrate(input)),Tokens=root.KTTokens;
 const tokens=Tokens.playableTokens(data);
 if(p.cardCount>690||tokens.length>300)throw Error('В наборе TTS может быть до 690 карт и до 300 жетонов.');
 const total=p.sheets.length*2+tokens.length;
 const files=await renderSheets(p,css,done=>options.onProgress?.(done,total));
 for(const [index,token] of tokens.entries()){
  const canvas=await raster(token.svg,512,512,css,true);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Не удалось сохранить жетон')),'image/png'));
  token.image='token-'+(index+1)+'.png';files[token.image]=new Uint8Array(await blob.arrayBuffer());
  canvas.width=canvas.height=1;options.onProgress?.(p.sheets.length*2+index+1,total);
 }
 const bytes=Object.values(files).reduce((sum,file)=>sum+file.length,0);
 if(bytes>64*1024*1024)throw Error('Набор TTS больше 64 МБ. Уменьшите изображения.');
 const encoded=[];
 for(const [name,file] of Object.entries(files)){
  const result=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(new Blob([file],{type:'image/png'}))});
  encoded.push({name,data:result});
 }
 return {version:1,team:{id:p.team.id,name:p.team.name,version:p.team.version||''},
  sheets:p.sheets.map(s=>({columns:s.columns,rows:s.rows,face:s.faceFile,back:s.backFile})),
  cards:p.sheets.flatMap((s,sheet)=>s.cards.map((c,slot)=>({name:c.name,sheet,slot,landscape:c.landscape}))),
  tokens:tokens.map(({svg,...token})=>token),assets:encoded};
}
root.KTTTS={GROUPS,MAX_CARDS,slug,plan,browserExport,browserPack,fontCSS};
if(typeof module!=='undefined')module.exports=root.KTTTS;
})(typeof window!=='undefined'?window:globalThis);

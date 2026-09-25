(function(root){
'use strict';
const MM=72/25.4,UNIT=MM/6,WIDTH=420,HEIGHT=726,AREA=376,GAP=14;
const FILL='#28515b',INK='#eef1da';
const shapes={circle:'<circle cx="50" cy="50" r="50"/>',trapezoid:'<path d="M27 7Q50 12 73 7L94 86Q95 95 50 95T6 86Z"/>',diamond:'<path d="m50 2 48 48-48 48L2 50Z"/>',octagon:'<path d="M29 3h42l26 26v42L71 97H29L3 71V29Z"/>'};
const symbols={
 skull:'<path d="M50 20c-18 0-28 13-28 27 0 11 6 16 13 19v12h9V68h5v10h6V68h5v10h8V65c7-4 10-10 10-19 0-15-11-26-28-26Z"/><path fill="'+FILL+'" d="M33 41h13v12H33zm22 0h13v12H55zM50 54l-5 8h10z"/>',
 bolt:'<path d="M57 14 26 55h23l-8 32 35-47H54z"/>',
 shield:'<g fill="none" stroke="'+INK+'"><path stroke-width="7" d="m50 18 25 9v24c0 15-25 31-25 31S25 66 25 51V27Z"/><path stroke-width="5" d="M50 29v37m-13-21h26"/></g>',
 target:'<g fill="none" stroke="'+INK+'" stroke-width="5"><circle cx="50" cy="50" r="23"/><circle cx="50" cy="50" r="9"/><path d="M50 15v15m0 40v15M15 50h15m40 0h15"/></g>',
 drop:'<path d="M50 15C42 31 29 43 29 59a21 21 0 0 0 42 0C71 43 58 31 50 15Z"/><path stroke="'+FILL+'" stroke-width="4" fill="none" d="M39 54c-3 11 1 17 10 18"/>',
 swords:'<path d="m23 19 13 5 31 43-6 6-33-39zM20 70l13-10 4 5-13 10zm6-2 5 4-8 12-6-5zM77 19l-13 5-31 43 6 6 33-39zM80 70 67 60l-4 5 13 10zm-6-2-5 4 8 12 6-5z"/>',
 star:'<path d="m50 10 7 24 21-12-12 21 24 7-24 7 12 21-21-12-7 24-7-24-21 12 12-21-24-7 24-7-12-21 21 12Z"/>',
 waves:'<g fill="none" stroke="'+INK+'" stroke-width="5"><circle cx="50" cy="50" r="13"/><path d="M30 30a28 28 0 0 0 0 40m40-40a28 28 0 0 1 0 40M21 20a41 41 0 0 0 0 60m58-60a41 41 0 0 1 0 60M50 37v26m-6-23v20m12-20v20"/></g>',none:''
};
const shapeOptions=[['circle','Круг'],['trapezoid','Трапеция'],['diamond','Ромб'],['octagon','Восьмиугольник'],['image','Своя картинка']];
const symbolOptions=[['skull','Череп'],['bolt','Молния'],['shield','Щит'],['target','Прицел'],['drop','Капля'],['swords','Клинки'],['star','Звезда'],['waves','Сигнал'],['none','Без символа'],['custom','Свой символ']];
function newToken(id){return {id,label:'Новый жетон',shape:'circle',symbol:'skull',diameterMm:20,symbolSize:65,variants:'',fullWidth:false,image:'',symbolImage:''}}
function newCard(id){return {id,kind:'token-guide',name:'MARKER/TOKEN GUIDE',layout:'grid2',fontSize:8.5,sizeMm:24,watermark:true,tokens:[]}}
function validImage(value){return typeof value==='string'&&(!value||value.length<=2000000&&/^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(value))}
function validateCard(c){
 const bounded=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
 if(!c||typeof c.id!=='string'||!c.id||c.id.length>100||c.kind!=='token-guide'||typeof c.name!=='string'||c.name.length>200||!['grid2','grid3','compact'].includes(c.layout)||!bounded(c.fontSize,6,14)||!bounded(c.sizeMm,8,40)||typeof c.watermark!=='boolean'||!Array.isArray(c.tokens)||c.tokens.length>80)throw Error('Некорректная карточка жетонов');
 const ids=new Set();
 for(const t of c.tokens){
  if(!t||typeof t.id!=='string'||!t.id||t.id.length>100||ids.has(t.id)||typeof t.label!=='string'||t.label.length>160||!shapeOptions.some(([key])=>key===t.shape)||!symbolOptions.some(([key])=>key===t.symbol)||!bounded(t.diameterMm,5,60)||!bounded(t.symbolSize,20,100)||typeof t.variants!=='string'||t.variants.length>100||typeof t.fullWidth!=='boolean'||!validImage(t.image)||!validImage(t.symbolImage)||t.shape==='image'&&!t.image||t.symbol==='custom'&&!t.symbolImage)throw Error('Проверьте форму, размер и изображение жетона');
  ids.add(t.id);
 }
 return c;
}
function values(t){return t.displayValues||String(t.variants).split(',').map(s=>s.trim().slice(0,12)).filter(Boolean).slice(0,12)}
function imageSize(t,c){return (t.shape==='circle'?t.diameterMm:c.sizeMm)*6}
function minWidth(t,c){const count=Math.min(values(t).length||1,2);return Math.min(AREA,Math.max(100,imageSize(t,c)*count+10*(count-1)+(c.layout==='compact'?100:0)))}
function groups(c){
 const n=c.layout==='grid3'?3:2,rows=[];let pending=[];
 const slotsFor=items=>Math.max(1,Math.min(n,Math.floor((AREA+GAP)/(Math.max(...items.map(t=>minWidth(t,c)))+GAP))));
 const flush=()=>{if(pending.length)rows.push({items:pending,wide:false,slots:slotsFor(pending)});pending=[]};
 for(const t of c.tokens){
  if(t.fullWidth||values(t).length>2){flush();rows.push({items:[t],wide:true,slots:1});continue}
  if(pending.length+1>slotsFor([...pending,t]))flush();pending.push(t);if(pending.length===slotsFor(pending))flush();
 }
 flush();return rows;
}
function prepareRow(row,c,Cards){
 const compact=c.layout==='compact'&&!row.wide&&row.items.every(t=>minWidth(t,c)<AREA),width=(AREA-GAP*(row.slots-1))/row.slots,font=c.fontSize/UNIT;
 const items=row.items.map(t=>{
  const variants=values(t),amount=variants.length||1,each=imageSize(t,c),columns=Math.max(1,Math.min(amount,Math.floor(((compact?width-100:width)+10)/(each+10)))),bands=Math.ceil(amount/columns);
  const visualWidth=each*columns+10*(columns-1),visualHeight=each*bands+10*(bands-1),textWidth=compact?width-visualWidth-10:width-4;
  const lines=Cards.wrap(t.label||'—',Math.max(20,textWidth),font),labelHeight=lines.length*font*1.15;
  return {t,variants,amount,each,columns,visualWidth,visualHeight,lines,height:compact?Math.max(visualHeight,labelHeight):visualHeight+10+labelHeight};
 });
 return {items,width,compact,font,height:Math.max(...items.map(a=>a.height))+20,gap:GAP};
}
function prepareRows(group,c,Cards){
 const row=prepareRow(group,c,Cards);
 // Try a full row before splitting an oversized caption/variant group.
 if(row.height>576&&(group.items.length>1||group.slots>1))return group.items.flatMap(t=>prepareRows({items:[t],wide:true,slots:1},c,Cards));
 if(row.height<=576)return [row];
 const item=row.items[0],labelHeight=item.lines.length*row.font*1.15;
 if(item.amount>1){
  const bands=Math.max(1,Math.floor((576-labelHeight-20)/(item.each+10))),chunkSize=bands*item.columns;
  if(chunkSize<item.amount){const rows=[];for(let i=0;i<item.amount;i+=chunkSize)rows.push(...prepareRows({...group,items:[{...item.t,displayValues:item.variants.slice(i,i+chunkSize)}]},c,Cards));return rows}
 }
 // Keep the physical token intact; a very long caption continues on another side.
 const lines=item.lines.slice(),rows=[];let cursor=0;
 while(cursor<lines.length){
  const first=cursor===0,visualHeight=first?item.visualHeight:0,capacity=Math.max(1,Math.floor((576-visualHeight-30)/(row.font*1.15))),part=lines.slice(cursor,cursor+capacity);
  rows.push({...row,height:visualHeight+30+part.length*row.font*1.15,items:[{...item,amount:first?item.amount:0,visualHeight,lines:part}]});cursor+=part.length;
 }
 return rows;
}
function art(t,x,y,size,value,suffix,esc){
 const image=(uri,px,py,w,h)=>'<image x="'+px+'" y="'+py+'" width="'+w+'" height="'+h+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+esc(uri)+'"/>';
 if(t.shape==='image')return image(t.image,x,y,size,size);
 const clip='token-'+suffix,shape=shapes[t.shape],scale=t.symbolSize/80;
 let symbol=value?'<text x="50" y="65" text-anchor="middle" font-family="Display" font-size="'+(value.length<3?49:Math.max(12,54/value.length*1.7))+'">'+esc(value)+'</text>':symbols[t.symbol]||'';
 symbol=t.symbol==='custom'&&!value?image(t.symbolImage,(100-t.symbolSize)/2,(100-t.symbolSize)/2,t.symbolSize,t.symbolSize):'<g transform="translate('+((100-100*scale)/2)+' '+((100-100*scale)/2)+') scale('+scale+')">'+symbol+'</g>';
 return '<g transform="translate('+x+' '+y+') scale('+(size/100)+')"><defs><clipPath id="'+clip+'">'+shape+'</clipPath></defs><g clip-path="url(#'+clip+')"><g fill="'+FILL+'">'+shape+'</g><path d="M0 0h52L12 59zm63 0 37 36-47 5zM0 76l45-22 25 46H0z" fill="#fff" opacity=".12"/><path d="m66 0 34 40-22 48-17-31-25-8zM0 38l18 5-3 24z" fill="#000" opacity=".14"/><g fill="'+INK+'">'+symbol+'</g></g></g>';
}
function rowSVG(row,y,sequence,Cards){
 const total=row.items.length*row.width+(row.items.length-1)*row.gap,start=(WIDTH-total)/2,boxes=[];
 const svg=row.items.map((item,i)=>{
  const {t}=item,x=start+i*(row.width+row.gap),visualX=row.compact?x:x+(row.width-item.visualWidth)/2,visualY=row.compact?y+(row.height-20-item.visualHeight)/2:y;
  let out='<g data-token-id="'+Cards.esc(t.id)+'">';
  for(let v=0;v<item.amount;v++){
   const column=v%item.columns,band=Math.floor(v/item.columns),count=Math.min(item.columns,item.amount-band*item.columns),offset=(item.visualWidth-(count*item.each+(count-1)*10))/2;
   const px=visualX+offset+column*(item.each+10),py=visualY+band*(item.each+10);
   out+=art(t,px,py,item.each,item.variants[v]||'',sequence+'-'+i+'-'+v,Cards.esc);
   boxes.push({type:'token',id:t.id,value:item.variants[v]||'',x:px*UNIT,y:py*UNIT,w:item.each*UNIT,h:item.each*UNIT,shape:t.shape});
  }
  const labelX=row.compact?x+item.visualWidth+10:x+row.width/2,labelY=row.compact?y+(row.height-20-item.lines.length*row.font*1.15)/2+row.font*.85:y+item.visualHeight+10+row.font*.85;
  out+='<text font-family="Roboto" font-size="'+row.font+'" fill="#252e2e" text-anchor="'+(row.compact?'start':'middle')+'">'+item.lines.map((line,j)=>'<tspan x="'+labelX+'" y="'+(labelY+j*row.font*1.15)+'">'+Cards.esc(line)+'</tspan>').join('')+'</text></g>';
  return out;
 }).join('');return {svg,boxes};
}
function renderCard(card,project,assets,index,Cards){
 const layouts=[];let body='',boxes=[],y=119,sequence=0;
 for(const row of groups(card).flatMap(group=>prepareRows(group,card,Cards))){
  if(y+row.height>695&&body){layouts.push({body,boxes});body='';boxes=[];y=119}
  const rendered=rowSVG(row,y,sequence++,Cards);body+=rendered.svg;boxes.push(...rendered.boxes);y+=row.height;
 }
 if(body||!layouts.length)layouts.push({body,boxes});
 return layouts.map((layout,side)=>{
  const esc=Cards.esc,name=project.team.name.toUpperCase(),font=/[\u0400-\u04ff]/.test(name)?'Roboto':'Display',size=Math.min(25,344/Math.max(1,Cards.measure(name,1,font)));
  let svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+Cards.SHORT+'" height="'+Cards.LONG+'" viewBox="0 0 420 726"><defs><clipPath id="guide-clip"><rect width="420" height="726" rx="23"/></clipPath></defs><g clip-path="url(#guide-clip)"><rect width="420" height="726" fill="#edf0eb"/>';
  if(assets['assets/paper.jpg'])svg+='<image x="0" y="0" width="420" height="726" preserveAspectRatio="xMidYMid slice" opacity=".5" xlink:href="'+esc(assets['assets/paper.jpg'])+'"/>';
  if(card.watermark)svg+=Cards.teamLogo(project,65,268,290,.055);
  svg+='<path d="M0 0h420v96H0z" fill="#141718"/><text x="210" y="36" text-anchor="middle" fill="'+esc(project.layout.accent)+'" font-family="'+font+'" font-size="'+size+'">'+esc(name)+'</text><text x="210" y="77" text-anchor="middle" fill="#fff" font-family="Display" font-size="39">MARKER/TOKEN GUIDE</text>'+layout.body;
  if(layouts.length>1)svg+='<text x="393" y="710" text-anchor="end" font-family="Roboto" font-size="11" fill="#64716e">'+(side+1)+' / '+layouts.length+'</text>';
  svg+='</g></svg>';
  return {svg,width:Cards.SHORT,height:Cards.LONG,boxes:layout.boxes,id:card.id,kind:card.kind,side,index,name:card.name};
 });
}
root.KTTokens={newToken,newCard,validateCard,shapeOptions,symbolOptions,renderCard};
if(typeof module!=='undefined')module.exports=root.KTTokens;
})(typeof window!=='undefined'?window:globalThis);

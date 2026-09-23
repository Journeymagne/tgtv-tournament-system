(function(root){
'use strict';
const Cards=root.KTCards||(typeof require!=='undefined'?require('./card-renderer.js'):null);
const Text=root.KTText||(typeof require!=='undefined'?require('./rich-text.js'):null);
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const References=root.KTReferences||(typeof require!=='undefined'?require('./reference-renderer.js'):null);
const W=595.276,H=841.89,M=34,GAP=18,BOTTOM=803,INK='#26302c',esc=Cards.esc;
function text(s,x,y,size=11,color=INK,bold=false){return '<text x="'+x+'" y="'+y+'" font-family="Roboto" font-size="'+size+'" fill="'+color+'"'+(bold?' font-weight="bold"':'')+'>'+esc(s)+'</text>'}
function renderPage(page,data,assets={}){
 if(page.layout==='references')return References.renderPage(page,data,assets);
 const pages=[],width=W-2*M,accent=data.layout.accent,title=page.name||'Картинки и лор';
 let s='',boxes=[],y=0,startY=0;
 const begin=()=>{
  s='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'"><rect width="'+W+'" height="'+H+'" fill="#fff"/><rect width="'+W+'" height="76" fill="#141718"/><rect width="5" height="76" fill="'+accent+'"/>';
  let teamSize=20;while(Cards.measure(data.team.name,teamSize,'RobotoBold')>width&&teamSize>7)teamSize-=.5;
  s+=text(data.team.name,M,32,teamSize,'#fff',true)+text('КАРТИНКИ И ЛОР / '+Model.loreCategories[page.category].toUpperCase(),M,57,9,accent,true);
  y=106;boxes=[];
  for(const line of Cards.wrap(title,width,22,'RobotoBold')){s+=text(line,M,y,22,INK,true);y+=27}
  if(pages.length){s+=text('ПРОДОЛЖЕНИЕ · '+(pages.length+1),M,y,8,'#788475',true);y+=18}
  s+='<path d="M'+M+' '+(y-9)+'H'+(W-M)+'" stroke="'+accent+'" stroke-width="1.2"/>';y+=7;startY=y;
 };
 const finish=()=>{pages.push({svg:s+'</svg>',width:W,height:H,boxes,id:page.id,kind:'lore',name:title,side:pages.length});if(pages.length>250)throw Error('Слишком длинная страница: '+title)};
 const next=()=>{finish();begin()};
 const drawLine=(line,x,color=INK)=>{if(y+line.height>BOTTOM)next();s+=Text.svg(line,x,y+line.size,color);boxes.push({x,y,w:line.width,h:line.height,kind:'text'});y+=line.height};
 begin();
 if(page.body){for(const line of Text.layout(page.body,width,11,'Roboto',0,1.45))drawLine(line,M);y+=18}
 const columns=page.layout==='gallery'?2:1,cell=(width-GAP*(columns-1))/columns;
 for(let offset=0;offset<page.images.length;offset+=columns){
  const row=page.images.slice(offset,offset+columns),caps=row.map(img=>img.caption?Text.layout(img.caption,cell,9,'Roboto',0,1.45):[]);
  const desired=Math.max(...row.map(img=>Math.min(cell/(img.imageWidth&&img.imageHeight?img.imageWidth/img.imageHeight:1.5),columns===1?620:240)));
  const captionStart=caps.some(a=>a.length)?Math.max(30,...caps.map(lines=>lines[0]?.height||0))+7:0;
  if(BOTTOM-y-captionStart<desired*.8&&y>startY)next();
  const height=Math.min(desired,BOTTOM-y-captionStart);
  for(const [i,img] of row.entries()){
   const x=M+i*(cell+GAP),uri=/^data:image\/(png|jpeg);base64,/.test(img.image)?img.image:assets[img.image];
   if(!uri)throw Error('Не удалось загрузить изображение: '+(img.caption||title));
   s+='<image x="'+x+'" y="'+y+'" width="'+cell+'" height="'+height+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+esc(uri)+'"/>';
   boxes.push({x,y,w:cell,h:height,kind:'image',id:img.id});
  }
  y+=height+7;
  for(let line=0;line<Math.max(...caps.map(a=>a.length));line++){
   const height=Math.max(...caps.map(lines=>lines[line]?.height||0)),baseline=Math.max(...caps.map(lines=>lines[line]?.size||0));
   if(y+height>BOTTOM)next();
   caps.forEach((lines,i)=>{if(line<lines.length){const x=M+i*(cell+GAP);s+=Text.svg(lines[line],x,y+baseline,'#65705f');boxes.push({x,y,w:lines[line].width,h:height,kind:'caption'})}});y+=height;
  }
  y+=22;
 }
 finish();return pages;
}
function renderAll(data,assets={}){return (data.lorePages||[]).flatMap(p=>renderPage(p,data,assets))}
root.KTLore={renderPage,renderAll,W,H};if(typeof module!=='undefined')module.exports=root.KTLore;
})(typeof window!=='undefined'?window:globalThis);

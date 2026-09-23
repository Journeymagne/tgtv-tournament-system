(function(root){
'use strict';
const Cards=root.KTCards||(typeof require!=='undefined'?require('./card-renderer.js'):null);
const W=595.276,H=841.89,CW=148,CH=304,HEAD=26,GAP=14,X=55,Y=118,ORANGE='#f4511e',esc=Cards.esc;
const svg=(w,h,body)=>'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+body+'</svg>';
const imageUri=(source,assets)=>/^data:image\/(png|jpeg);base64,/.test(source||'')?source:assets[source];
function label(value,x,y,width,size,maxLines=1,font='Roboto',anchor='start'){
 const name=String(value||'').replace(/\s+/g,' ').trim(),face=font==='Display'&&/[\u0400-\u04ff]/.test(name)?'RobotoBold':font;
 let lines=Cards.wrap(name,width,size,face);
 while(lines.length>maxLines&&size>1){size-=.25;lines=Cards.wrap(name,width,size,face)}
 return lines.map((line,i)=>'<text x="'+x+'" y="'+(y+i*size*1.15)+'" font-family="'+(face==='RobotoBold'?'Roboto':face)+'"'+(face==='RobotoBold'?' font-weight="bold"':'')+' font-size="'+size+'" fill="#fff" text-anchor="'+anchor+'">'+esc(line)+'</text>').join('');
}
function geometry(model){
 const callouts=(model.callouts||[]).filter(c=>c.text.trim()),top=callouts.filter(c=>c.edge==='top'),bottom=callouts.filter(c=>c.edge==='bottom');
 const y=HEAD+Math.max(34,top.length*25+9),end=CH-Math.max(28,bottom.length*25+8),w=CW-10,h=end-y;
 const ratio=model.imageWidth&&model.imageHeight?model.imageWidth/model.imageHeight:1,scale=Math.min(w/ratio,h),iw=scale*ratio;
 return {x:(CW-iw)/2,y:y+(h-scale)/2,w:iw,h:scale,top,bottom};
}
function modelBody(model,assets={}){
 const g=geometry(model),uri=imageUri(model.image,assets);
 let s='<path d="M0 0H'+CW+'V'+(CH-12)+'L'+(CW-12)+' '+CH+'H0Z" fill="#101b20" stroke="'+ORANGE+'" stroke-width=".9"/>';
 for(let y=HEAD+3;y<CH-12;y+=3)s+='<path d="M1 '+y+'H'+(CW-1)+'" stroke="#294049" stroke-width=".55"/>';
 s+='<rect width="'+CW+'" height="'+HEAD+'" fill="'+ORANGE+'"/>'+label(model.modelName||'',5,18,CW-10,16,1,'Display');
 if(uri)s+='<image class="reference-model-image" x="'+g.x+'" y="'+g.y+'" width="'+g.w+'" height="'+g.h+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+esc(uri)+'"/>';
 else if(model.image)throw Error('Не удалось загрузить изображение: '+model.modelName);
 for(const edge of ['top','bottom'])g[edge].forEach((c,index)=>{
  const tx=g.x+c.x*g.w,ty=g.y+c.y*g.h,ly=edge==='top'?HEAD+26+index*25:CH-10-(g.bottom.length-1-index)*25;
  const lx=c.align==='left'?5:CW-5,anchor=c.align==='left'?'start':'end';
  s+='<g class="reference-callout"><path d="M'+lx+' '+ly+'H'+tx+'V'+ty+'" fill="none" stroke="'+ORANGE+'" stroke-width=".75"/>';
  s+='<rect x="'+(tx-1.7)+'" y="'+(ty-1.7)+'" width="3.4" height="3.4" fill="#101b20" stroke="'+ORANGE+'" stroke-width=".8"/>';
  s+=label(c.text,lx,ly-13,CW-10,8,2,'Roboto',anchor)+'</g>';
 });
 s+='<path d="M'+(CW-10)+' '+CH+'H'+CW+'V'+(CH-10)+'Z" fill="'+ORANGE+'"/>';
 return s;
}
function renderModel(model,assets={}){return svg(CW,CH,modelBody(model,assets))}
function renderPage(page,data,assets={}){
 const pages=[],count=Math.max(1,Math.ceil(page.images.length/6));
 for(let side=0;side<count;side++){
  const models=page.images.slice(side*6,side*6+6),boxes=[];
  let s='<rect width="'+W+'" height="'+H+'" fill="#17191b"/>';
  if(assets['assets/paper.jpg'])s+='<image width="'+W+'" height="'+H+'" opacity=".07" preserveAspectRatio="xMidYMid slice" xlink:href="'+esc(assets['assets/paper.jpg'])+'"/>';
  s+=label(data.team.name,X,57,472,21,1,'Display')+label(page.name,X,83,472,11);
  s+='<path d="M0 105H527" stroke="'+ORANGE+'" stroke-width="1.1"/>';
  s+='<g transform="translate(562 427) rotate(90)">'+label(data.team.name+' » '+page.name,0,0,600,17,1,'Display','middle')+'</g>';
  models.forEach((model,i)=>{
   const x=X+i%3*(CW+GAP),y=Y+Math.floor(i/3)*(CH+GAP);
   s+='<g class="reference-model" transform="translate('+x+' '+y+')">'+modelBody(model,assets)+'</g>';
   boxes.push({x,y,w:CW,h:CH,kind:'reference',id:model.id});
  });
  if(!models.length)for(let i=0;i<6;i++)s+='<g transform="translate('+(X+i%3*(CW+GAP))+' '+(Y+Math.floor(i/3)*(CH+GAP))+')">'+modelBody({modelName:'MODEL '+(i+1)},assets)+'</g>';
  s+=label(String(side+1).padStart(2,'0')+' / '+String(count).padStart(2,'0'),527,784,60,8,1,'Roboto','end');
  pages.push({svg:svg(W,H,s),width:W,height:H,boxes,id:page.id,kind:'lore',name:page.name,side});
 }
 return pages;
}
root.KTReferences={renderPage,renderModel,geometry,CW,CH};if(typeof module!=='undefined')module.exports=root.KTReferences;
})(typeof window!=='undefined'?window:globalThis);

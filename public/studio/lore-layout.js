(function(root){
'use strict';
const W=595.276,H=841.89,MAX_OBJECTS=300;
const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function object(id,type,values={}){
 return {id,type,x:34,y:120,w:250,h:150,locked:false,opacity:1,
  ...(type==='text'?{text:'Новый текст',size:11,leading:1.45,color:'#26302c',background:'#ffffff',backgroundOpacity:0,padding:8,align:'left'}:{imageId:'',fit:'contain',zoom:1,panX:0,panY:0}),...values};
}
function validate(page){
 if(!Array.isArray(page.objects)||page.objects.length>MAX_OBJECTS||typeof page.showHeader!=='boolean'||!['blank','top','columns','background'].includes(page.template))throw Error('Повреждён свободный макет');
 const ids=new Set(),images=new Set(page.images.map(img=>img.id));let textLength=0;
 for(const o of page.objects){
  if(!o||typeof o.id!=='string'||!o.id||o.id.length>100||ids.has(o.id)||!['text','image'].includes(o.type)||!finite(o.x,-W,W)||!finite(o.y,-H,H)||!finite(o.w,12,W*2)||!finite(o.h,12,H*2)||!finite(o.opacity,0,1)||typeof o.locked!=='boolean')throw Error('Некорректный объект свободного макета');
  ids.add(o.id);
  if(o.type==='text'){
   if(typeof o.text!=='string'||o.text.length>100000||!finite(o.size,6,72)||!finite(o.leading,1,2.5)||!color(o.color)||!color(o.background)||!finite(o.backgroundOpacity,0,1)||!finite(o.padding,0,50)||!['left','center','right'].includes(o.align))throw Error('Некорректный текстовый блок');
   textLength+=o.text.length;if(textLength>100000)throw Error('На свободном листе может быть до 100 000 символов.');
  }else if(!images.has(o.imageId)||!['contain','cover'].includes(o.fit)||!finite(o.zoom,1,5)||!finite(o.panX,-1,1)||!finite(o.panY,-1,1))throw Error('Некорректная рамка изображения');
 }
}
function dependencies(){return {Text:root.KTText||(typeof require!=='undefined'?require('./rich-text'):null),Cards:root.KTCards||(typeof require!=='undefined'?require('./card-renderer'):null),Page:root.KTPageBackground||(typeof require!=='undefined'?require('./page-background'):null)};}
function geometry(o,image){
 const iw=image.imageWidth||1,ih=image.imageHeight||1;
 const scale=(o.fit==='cover'?Math.max(o.w/iw,o.h/ih):Math.min(o.w/iw,o.h/ih))*o.zoom;
 const w=iw*scale,h=ih*scale;
 return {x:(o.w-w)/2+Math.abs(o.w-w)/2*o.panX,y:(o.h-h)/2+Math.abs(o.h-h)/2*o.panY,w,h,dpi:Math.min(iw/w,ih/h)*72};
}
function renderPage(page,data,assets={}){
 const {Text,Cards,Page}=dependencies(),warnings=[],boxes=[];
 let s='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+Page.svg(assets);
 if(page.showHeader){
  const logo=!!data.team.logo,x=logo?90:34;let size=20;
  while(Cards.measure(data.team.name,size,'RobotoBold')>W-34-x&&size>7)size-=.5;
  s+='<rect width="'+W+'" height="76" fill="#141718"/><rect width="5" height="76" fill="'+data.layout.accent+'"/>'+Cards.teamLogo(data,16,12,52)+'<text x="'+x+'" y="32" font-family="Roboto" font-weight="bold" font-size="'+size+'" fill="#fff">'+esc(data.team.name)+'</text><text x="'+x+'" y="57" font-family="Roboto" font-size="9" fill="'+data.layout.accent+'">КАРТИНКИ И ЛОР</text>';
 }
 page.objects.forEach((o,index)=>{
  const clip='lore-frame-'+index;
  s+='<defs><clipPath id="'+clip+'"><rect width="'+o.w+'" height="'+o.h+'"/></clipPath></defs><g transform="translate('+o.x+' '+o.y+')" opacity="'+o.opacity+'"><g clip-path="url(#'+clip+')">';
  if(o.type==='image'){
   const img=page.images.find(img=>img.id===o.imageId),uri=/^data:image\/(png|jpeg);base64,/.test(img.image)?img.image:assets[img.image];
   if(!uri)throw Error('Не удалось загрузить изображение: '+(img.caption||page.name));
   const g=geometry(o,img);
   s+='<image x="'+g.x+'" y="'+g.y+'" width="'+g.w+'" height="'+g.h+'" preserveAspectRatio="none" xlink:href="'+esc(uri)+'"/>';
   if(g.dpi<150)warnings.push({id:o.id,kind:'quality',message:'Изображение '+(index+1)+': '+Math.round(g.dpi)+' dpi — при печати возможна потеря чёткости.'});
  }else{
   s+='<rect width="'+o.w+'" height="'+o.h+'" fill="'+o.background+'" opacity="'+o.backgroundOpacity+'"/>';
   const width=Math.max(1,o.w-o.padding*2),lines=Text.layout(o.text,width,o.size,'Roboto',0,o.leading);let y=o.padding;
   for(const line of lines){const x=o.padding+(o.align==='center'?(width-line.width)/2:o.align==='right'?width-line.width:0);s+=Text.svg(line,x,y+line.size,o.color);y+=line.height;}
   if(o.text.trim()&&(y>o.h-o.padding+.1||o.padding*2>=o.w||lines.some(line=>line.width>width+.1)))warnings.push({id:o.id,kind:'overflow',message:'Текстовый блок '+(index+1)+' не помещается. Увеличьте рамку или уменьшите шрифт.'});
  }
  s+='</g></g>';boxes.push({id:o.id,kind:o.type,x:o.x,y:o.y,w:o.w,h:o.h});
  if(o.x<0||o.y<0||o.x+o.w>W+.1||o.y+o.h>H+.1)warnings.push({id:o.id,kind:'outside',message:'Объект '+(index+1)+' выходит за край листа и будет обрезан.'});
 });
 return [{svg:s+'</svg>',width:W,height:H,boxes,warnings,id:page.id,kind:'lore',name:page.name,side:0}];
}
function template(id,preset,uid){
 const p={id,name:'Новая лорная страница',category:'lore',body:'',layout:'free',images:[],objects:[],showHeader:false,template:preset};
 p.objects.push(object(uid(),'text',{x:34,y:34,w:527,h:60,text:'НАЗВАНИЕ ИСТОРИИ',size:28,padding:0}));
 if(preset==='columns')for(let i=0;i<2;i++)p.objects.push(object(uid(),'text',{x:34+i*273,y:420,w:254,h:350,text:i?'Продолжение истории…':'История вашей команды…',padding:0}));
 else if(preset!=='blank')p.objects.push(object(uid(),'text',{x:34,y:preset==='background'?480:440,w:527,h:320,text:'История вашей команды…',backgroundOpacity:preset==='background'?.92:0,padding:preset==='background'?14:0}));
 return p;
}
function lineMarkup(line){return line.runs.map(run=>{
 const leading=run.text.match(/^\s*/)[0],trailing=run.text.trim()?run.text.match(/\s*$/)[0]:'';
 if(!run.text.trim())return run.text;
 let text=run.text.trim().replace(/[\\*\[\]]/g,'\\$&');
 if(run.bold&&run.italic)text='***'+text+'***';else if(run.bold)text='**'+text+'**';else if(run.italic)text='*'+text+'*';
 if(run.size!==line.size&&run.size>=6&&run.size<=24)text='[size='+run.size+']'+text+'[/size]';
 if(run.color)text='[color=orange]'+text+'[/color]';return leading+text+trailing;
}).join('');}
function convert(page,rendered,uid){
 return rendered.map((sheet,index)=>{
  const p={...structuredClone(page),id:uid(),layout:'free',template:'blank',showHeader:true,body:'',name:(page.name.slice(0,175)+' · свободная'+(rendered.length>1?' '+(index+1):'')),objects:[]};
  for(const box of sheet.boxes){
   if(box.kind==='image'){p.objects.push(object(uid(),'image',{x:box.x,y:box.y,w:box.w,h:box.h,imageId:box.id}));continue;}
   if(!box.line)continue;
   const body=lineMarkup(box.line),last=p.objects.at(-1),indent=box.line.indent||0,x=box.x+indent,width=(box.layoutWidth||box.w+1)-indent;
   if(last?.type==='text'&&last.sourceKind===box.kind&&last.size===box.line.size&&Math.abs(last.leading-box.h/box.line.size)<.01&&Math.abs(last.x-x)<.01&&Math.abs(last.y+last.h-box.y)<1){last.text+='\n'+body;last.h=box.y+box.h-last.y;last.w=Math.max(last.w,width);}
   else p.objects.push({...object(uid(),'text',{x,y:box.y,w:width,h:box.h,text:body,size:box.line.size,leading:Math.min(2.5,box.h/box.line.size),padding:0,color:box.color||'#26302c'}),sourceKind:box.kind});
  }
  for(const o of p.objects){delete o.sourceKind;o.h=Math.max(12,o.h+.2);o.w=Math.max(12,o.w);}
  p.images=p.images.filter(img=>p.objects.some(o=>o.imageId===img.id));
  validate(p);return p;
 });
}
root.KTFreeLore={W,H,MAX_OBJECTS,object,validate,geometry,renderPage,template,convert};
if(typeof module!=='undefined')module.exports=root.KTFreeLore;
})(typeof window!=='undefined'?window:globalThis);

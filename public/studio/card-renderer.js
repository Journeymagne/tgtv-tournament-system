(function(root){
'use strict';
const F=root.KTFontMetrics||(typeof require!=='undefined'?require('./font-metrics.js'):null);
const Text=root.KTText||(typeof require!=='undefined'?require('./rich-text.js'):null);
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const Tokens=root.KTTokens||(typeof require!=='undefined'?require('./tokens.js'):null);
const MM=72/25.4,SHORT=70*MM,LONG=121*MM,OPERATIVE_HEADER=33,BLACK='#141718',SAGE='#6e7b70';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const face=s=>/[\u0400-\u04ff]/.test(s)?'RobotoBold':'Display';
const characterFont=(c,font)=>c==='″'&&font==='Display'?'Roboto':font;
const selectionParts=s=>String(s).split(/(\b[A-Z][A-Z-]*(?: [A-Z][A-Z-]*)*\b|\*)/g).filter(Boolean).map(text=>({text,font:/^[A-Z][A-Z -]*$/.test(text)?'RobotoBold':'Roboto'}));
function measure(s,size,font='Roboto'){if(font==='Selection')return selectionParts(s).reduce((n,r)=>n+measure(r.text,size,r.font),0);return Array.from(String(s)).reduce((n,c)=>n+(F[characterFont(c,font)]?.[c]??.56)*size,0)}
function wrap(s,width,size,font='Roboto'){
 const output=[];
 for(const paragraph of String(s??'').replace(/\r/g,'').split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(measure((line?line+' ':'')+word,size,font)<=width){line+=(line?' ':'')+word;continue}
   if(line){output.push(line);line=''}
   if(measure(word,size,font)>width){for(const c of word){if(measure(line+c,size,font)>width&&line){output.push(line);line=''}line+=c}}else line=word;
  }
  output.push(line);
 }
 return output;
}
function rect(x,y,w,h,fill,extra=''){return '<rect x="'+x+'" y="'+y+'" width="'+Math.max(0,w)+'" height="'+Math.max(0,h)+'" fill="'+fill+'" '+extra+'/>'}
function line(x,y,x2,y2,color,width=.6,extra=''){return '<line x1="'+x+'" y1="'+y+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+width+'" '+extra+'/>'}
function txt(s,x,y,size=8.2,color=BLACK,font='Roboto',extra=''){
 const family=font==='RobotoBold'||font==='RobotoItalic'?'Roboto':font;
 const attrs=(font==='RobotoBold'?' font-weight="bold"':'')+(font==='RobotoItalic'?' font-style="italic"':'');
 const runs=font==='Display'?String(s).split(/(″)/g).map(c=>c==='″'?'<tspan font-family="Roboto">″</tspan>':esc(c)).join(''):esc(s);
 return '<text x="'+x+'" y="'+y+'" font-family="'+family+'" font-size="'+size+'" fill="'+color+'"'+attrs+' '+extra+'>'+runs+'</text>';
}
// Stat contours extracted from the supplied Murderwing PDF, page 1, normalized to 32 units.
const STAT_ICONS={
 APL:'M32,4.7171 L16,28.9388 L0,4.7171 L3.2944,4.7171 L15.9139,24.4184 L28.4395,4.7171 Z M15.9134,22.2122 L3.6486,3.0612 L28.0895,3.0612 Z',
 MOVE:'M32,7.7064 L26.256,29.1563 L24.3169,28.6411 L29.5456,9.1247 L10.0291,3.8988 L10.55,1.9567 Z M0,18.4591 L6.6867,30.0433 L20.5158,22.06 L23.3778,27.017 L27.9215,10.0625 L10.9699,5.5217 L13.8291,10.4759 Z',
 SAVE:'M15.3485,5.4988 L15.3485,26.3773 L8.104,21.5907 L8.104,5.4988 Z M23.8989,21.5907 L16.6512,26.3773 L16.6512,5.4988 L23.8989,5.4988 Z M3.8099,0 L15.3475,0 L15.3475,4.2125 L6.8161,4.2125 L6.8161,22.2849 L15.3475,27.9198 L15.3475,32 L3.8099,24.3814 Z M28.1901,0 L28.1901,24.3814 L16.6525,32 L16.6525,27.9198 L25.1871,22.2849 L25.1871,4.2125 L16.6525,4.2125 L16.6525,0 Z',
 WOUNDS:'M16,22.5167 L20.7449,27.2584 L16,32 L11.2584,27.2584 Z M16,20.9762 L10.8681,26.1081 L16,0 L21.1319,26.1081 Z'
};
// Visible contour bounds, excluding the padding in the normalized icon square.
const STAT_ICON_BOUNDS={APL:[0,3.0612,32,28.9388],MOVE:[0,1.9567,32,30.0433],SAVE:[3.8099,0,28.1901,32],WOUNDS:[10.8681,0,21.1319,32]};
function icon(key,x,y,size,c){
 const stat=STAT_ICONS[({M:'MOVE',SV:'SAVE',W:'WOUNDS'})[key]||key];
 if(stat)return '<g class="stat-icon" transform="translate('+x+' '+y+') scale('+(size/32)+')" fill="'+c+'"><path d="'+stat+'"/></g>';
 const paths={APL:'<path d="M2 5h28L16 28z"/><path d="M7 6l9 16L25 6" fill="none" stroke="'+BLACK+'" stroke-width="2"/>',M:'<path d="M2 14L22 5v5l8-3-4 19-5-5-16 7z"/>',MOVE:'<path d="M2 14L22 5v5l8-3-4 19-5-5-16 7z"/>',SV:'<path d="M5 4h22v18L16 29 5 22z" fill="none" stroke="'+c+'" stroke-width="2"/><path d="M10 7h12v13l-6 4-6-4z"/>',W:'<path d="M16 3l7 21-7 6-7-6z"/>',GA:'<path d="M3 8h10v10H3zM19 8h10v10H19zM11 21h10v8H11z"/>',DF:'<path d="M4 6h24v14L16 29 4 20z" fill="none" stroke="'+c+'" stroke-width="3"/><path d="M10 11h12v7l-6 5-6-5z"/>',ranged:'<path d="M3 10l4-6 4 6v19H3zM13 10l4-6 4 6v19h-8zM23 10l4-6 4 6v19h-8z"/>',melee:'<path d="M32 14.187H22.303V8.444H20.95V12.64H3.088L0.05 15.324H20.95V16.681H0L3.088 19.41H20.95V23.556H22.303V17.861H32Z"/>'};
 return '<g transform="translate('+x+' '+y+') scale('+(size/32)+')" fill="'+c+'">'+(paths[key]||paths[key==='SAVE'?'SV':key==='WOUNDS'?'W':'APL'])+'</g>';
}
function richLines(value,width,size=8.2,font='Roboto',gap=3,compact=false){
 const lines=Text.layout(value,width,size,font,gap,compact?1.14:1.28);
 if(compact)for(const [i,line] of lines.entries())if(!line.text.trim())line.height=line.size*.4+(i===lines.length-1?gap:0);
 return lines;
}
function blocks(c,d,width,operative=false){
 const result=[],size=operative?(c.rulesLayout==='full'?6.4:6.8):c.kind==='selection'?7.8:8.2;
 const add=(t,font='Roboto',gap=operative?2.5:5,s=size,inset=0)=>{if(t){const lines=richLines(t,width-inset,s,font,gap/2,operative);if(!operative)for(const line of lines)if(!line.text.trim())line.height/=2;lines[0].groupHeight=lines.reduce((n,l)=>n+l.height,0);lines[0].keepHeight=font==='RobotoBold'||font==='Display'?lines[0].height+size*(operative?2.28:2.56):0;result.push(...lines)}};
 if(c.kind==='selection'){
  add(c.lore,'RobotoItalic',7);
  add(c.body);
  add('OPERATIVES','Display',3,13);
  for(const g of c.selectionGroups||[]){add(g.count+' '+g.description);for(const e of g.entries){add(e.text);for(const option of e.options)add('• '+option)}}
  add(c.selectionRules);add(c.selectionNotes);
 }else{
  if(!operative)add(c.lore,'RobotoItalic',9);
  add(c.body);
 }
 if(c.restriction)add(c.restriction,'RobotoBold');
 if(c.unique)add('Maximum once per team.','RobotoItalic');
 if(c.bashaAllowed)add('Available to NOB BASHA.','RobotoItalic');
 const heading=(name,band)=>{const start=result.length;add(name,'RobotoBold',band?(operative?1:5):1,size,band?4:0);if(band)for(let i=start;i<result.length;i++){result[i].actionHeading=true;result[i].height+=2;result[i].keepHeight+=2}};
 for(const a of c.abilities){
  const start=result.length;
  if(operative){const name=Text.plain(a.name).trim().replace(/[:：]\s*$/,'').replace(/[\\*\[\]]/g,'\\$&');add((name?'**'+name+':** ':'')+a.body);if(result[start])result[start].keepHeight=result.slice(start,start+2).reduce((n,l)=>n+l.height,0)}
  else{heading(a.name,c.kind==='faction');add(a.body)}
  if(result[start])result[start].groupHeight=result.slice(start).reduce((n,l)=>n+l.height,0);
 }
 for(const a of c.actions){const start=result.length;heading(a.name+(a.cost?'  /  '+a.cost:''),true);add(a.body);if(result[start])result[start].groupHeight=result.slice(start).reduce((n,l)=>n+l.height,0)}
 if(c.kind==='firefight'&&c.cost?.includes('+')&&d.ployNote)add(d.ployNote,'RobotoItalic');
 if(c.kind==='strategic'&&c.cost?.includes('+')&&d.ployNote)add(d.ployNote,'RobotoItalic');
 let trailing=0;for(let i=result.length-1;i>=0;i--){trailing+=result[i].height;if(result[i].keepHeight)result[i].keepHeight=Math.min(result[i].keepHeight,trailing)}
 return result;
}
function teamLogo(d,x,y,size,opacity=1){return Model.isLogo(d.team.logo)?'<image class="team-logo" x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" opacity="'+opacity+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+esc(d.team.logo)+'"/>':''}
function base(w,h,d,dark=false,assets={}){
 const C=d.layout.accent;
 let s='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">';
 s+='<defs><clipPath id="cardclip"><rect width="'+w+'" height="'+h+'" rx="12"/></clipPath></defs><g clip-path="url(#cardclip)">';
 s+=rect(0,0,w,h,dark?BLACK:'#edf0eb');
 if(assets['assets/paper.jpg'])s+='<image x="0" y="0" width="'+w+'" height="'+h+'" preserveAspectRatio="xMidYMid slice" opacity="'+(dark?.07:.5)+'" xlink:href="'+assets['assets/paper.jpg']+'"/>';
 // A neutral team monogram is kept separate from the source faction's insignia.
 if(!dark)s+=Model.isLogo(d.team.logo)?teamLogo(d,w*.15,h*.5-w*.25,w*.7,.07):txt(d.team.name.slice(0,1),w/2,h*.76,w*.85,'#d2d9d1','Display','text-anchor="middle" opacity=".23"');
 return {s,C,w,h,dark,boxes:[]};
}
function finish(p,meta){return {svg:p.s+'</g></svg>',width:p.w,height:p.h,boxes:p.boxes,...meta}}
// Inline SVG fragment IDs share the HTML document, even across hidden previews.
// Scope each mounted instance while keeping standalone PDF/TTS SVGs deterministic.
function inlineSVG(svg,scope){
 const prefix='kt-'+String(scope).replace(/[^a-z0-9_-]/gi,'-')+'-',ids=new Map([...svg.matchAll(/\sid="([^"]+)"/g)].map(match=>[match[1],prefix+match[1]]));
 return svg.replace(/(\sid=")([^"]+)(")/g,(_,before,id,after)=>before+ids.get(id)+after)
  .replace(/="url\(#([^)]*)\)"/g,(value,id)=>ids.has(id)?'="url(#'+ids.get(id)+')"':value)
  .replace(/(\s(?:xlink:)?href="#)([^"]+)(")/g,(value,before,id,after)=>ids.has(id)?before+ids.get(id)+after:value);
}
const category={selection:'KILL TEAM',recruitment:'KILL TEAM SELECTION',faction:'FACTION RULE',strategic:'STRATEGY PLOY',firefight:'FIREFIGHT PLOY',equipment:'FACTION EQUIPMENT'};
function portrait(c,d,assets={},index=0){
 const w=SHORT,h=LONG,pad=8,inner=w-2*pad,dark=['selection','recruitment'].includes(c.kind),sides=[];
 const isPloy=['strategic','firefight'].includes(c.kind);
 const ruleImage=['faction','recruitment'].includes(c.kind)?(/^data:image\/(png|jpeg);base64,/.test(c.image||'')?c.image:assets[c.image]):null;
 const imageRatio=c.imageWidth&&c.imageHeight?c.imageWidth/c.imageHeight:1.5;
 let imagePending=!!ruleImage;
 const filled=c.name.trim()&&(c.body.trim()||c.weapons.length||c.abilities.length||c.actions.length);
 const labels=category[c.kind],name=c.name||((c.kind==='equipment'?'EQUIPMENT':labels)+' '+(index+1));
 const all=blocks(c,d,inner);
 // Weapon profiles live on their owning rule card; narrow cards use an explicit compact profile.
 for(const weapon of c.weapons){
  all.push(...richLines(weapon.name,inner,9,'RobotoBold',2));
  all.push(...richLines('ATK '+weapon.attacks+'   HIT '+weapon.hit+'   DMG '+weapon.damage,inner,8.2,'Roboto',3));
  all.push(...richLines(Model.weaponRules(weapon)||'-',inner,8.2,'Roboto',8));
 }
 let cursor=0;
 do{
  const p=base(w,h,d,dark,assets),side=sides.length;
  p.s+=rect(0,0,w,46,BLACK);
  const titleX=w/2,titleWidth=w-16;
  p.s+=txt(d.team.name,titleX,18,Math.min(10.3,10.3*titleWidth/Math.max(1,measure(d.team.name,10.3,'RobotoBold'))),p.C,'RobotoBold','text-anchor="middle"');
  p.s+=txt(labels,titleX,35,18,'white','Display','text-anchor="middle"');
  let y=54;
  const bandFont=c.kind==='faction'?'RobotoBold':face(name),bandLines=wrap(name,inner-(c.cost?35:6),12,bandFont);
  const bh=Math.max(15,bandLines.length*13+3);
  if(isPloy)p.s+=rect(pad,y,inner,bh,c.kind==='strategic'?SAGE:'#232323','class="ploy-title-band" stroke="none"');
  else if(c.kind==='faction')p.s+=rect(pad,y,inner,bh,Text.ORANGE);
  else if(c.kind==='equipment')p.s+=rect(pad,y,inner,bh,'none','stroke="'+BLACK+'" stroke-width=".6"');
  else if(!isPloy)p.s+=line(pad,y+bh, w-pad,y+bh,p.C,.7);
  const titleColor=isPloy||c.kind==='faction'||dark?'white':c.kind==='equipment'?BLACK:p.C;
  bandLines.forEach((t,i)=>p.s+=txt(t,pad+2,y+12+i*13,12,titleColor,bandFont));
  if(c.cost)p.s+=txt(c.cost,w-pad-3,y+11,7.5,titleColor,'RobotoBold','text-anchor="end"');
  y+=bh+10;
  if(c.subtitle){const sub=wrap(c.subtitle,inner-6,10,'RobotoBold'),sh=sub.length*12+4;p.s+=rect(pad,y-3,inner,sh,p.C);sub.forEach((t,i)=>p.s+=txt(t,pad+3,y+7+i*12,10,'white','RobotoBold'));y+=sh+5}
  if(side){p.s+=txt('CONTINUED / '+(side+1),pad,y,7.5,dark?'#d1d8d0':'#6a746c','RobotoBold');y+=12}
  const bottom=h-23,startY=y,startCursor=cursor;
  while(cursor<all.length&&y+all[cursor].height<=bottom){
   const next=all[cursor];if(cursor>startCursor&&((next.keepHeight&&y+next.keepHeight>bottom)||(next.groupHeight<=bottom-startY&&y+next.groupHeight>bottom)))break;
   const a=all[cursor++];if(a.actionHeading)p.s+=rect(pad,y-1,inner,a.height-3,c.kind==='faction'?Text.ORANGE:p.C);
   p.s+=Text.svg(a,pad+(a.actionHeading?2:0),y+a.size,a.actionHeading||dark?'white':BLACK);p.boxes.push({x:pad,y,w:a.width,h:a.height});y+=a.height;
  }
  if(imagePending&&cursor===all.length){
   const gap=cursor>startCursor?8:0,preferredHeight=Math.min(inner/imageRatio,200,bottom-startY),available=bottom-y-gap;
   const imageHeight=available>=preferredHeight*.75?Math.min(preferredHeight,available):preferredHeight,imageWidth=Math.min(inner,imageHeight*imageRatio);
   if(y+gap+imageHeight<=bottom){
    const x=(w-imageWidth)/2;y+=gap;
    p.s+='<image class="rule-image" x="'+x+'" y="'+y+'" width="'+imageWidth+'" height="'+imageHeight+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+esc(ruleImage)+'"/>';
    p.boxes.push({kind:'image',x,y,w:imageWidth,h:imageHeight});imagePending=false;
   }
  }
  if(!all.length&&!ruleImage&&!dark){p.s+=txt('UNFILLED SLOT',pad,y+10,9,'#71796f','Display');p.s+=txt('No rule has been assigned.',pad,y+26,8,'#71796f');for(let i=0;i<4;i++)p.s+=line(pad,y+55+i*20,w-pad,y+55+i*20,'#b3bcb1',.4)}
  if(cursor<all.length||imagePending){p.s+=rect(pad,h-20,inner,12,p.C)+txt('CONTINUES ON NEXT SIDE',pad+3,h-11,8,'white','Display')}
  else if(side)p.s+=txt('END / '+(side+1),w-pad,h-9,7,dark?'#bdc5bd':'#747f75','Display','text-anchor="end"');
  sides.push(finish(p,{id:c.id,kind:c.kind,side,index,name}));
  if(sides.length>100)throw Error('Слишком длинная карточка: '+name);
 }while(cursor<all.length||imagePending);
 return sides;
}
function operativeHeader(c,hasPortrait){
 const stats=Object.entries(c.stats),statWidths=stats.map(([key])=>stats.length>4?26:/^(W|WOUNDS)$/.test(key)?36:28),statsWidth=statWidths.reduce((a,b)=>a+b,0),start=LONG-statsWidth;
 // Keep the reference stat widths. The portrait may extend left into the title
 // area, but must not borrow room from the icons and values on its right.
 const expansion=hasPortrait?Math.min(50*LONG/640,statsWidth*.25):0;
 const portraitWidth=Math.min(110,start*.5)+expansion;
 return {stats,statWidths,start,portraitWidth,portraitX:start-portraitWidth};
}
function portraitFrame(c){return {width:operativeHeader(c,true).portraitWidth,height:OPERATIVE_HEADER}}
function portraitPlacement(crop,imageWidth,imageHeight,frame){
 const width=crop.width*imageWidth,height=crop.height*imageHeight,scale=Math.max(frame.width/width,(frame.height-2)/height)*(crop.scale??1);
 return {x:(frame.width-width*scale)/2,y:1+(crop.offsetY||0)*height*scale,width:width*scale,height:height*scale,scale};
}
function operative(c,d,assets={},index=0){
 const w=LONG,h=SHORT,pad=8,inner=w-16,baseHeader=OPERATIVE_HEADER,C=d.layout.accent,sides=[];
 const baseSize=(c.baseSize||'').trim(),baseWidth=baseSize?(/^\d+(?:[.,]\d+)?$/.test(baseSize)?16:Math.max(16,Math.min(48,measure(baseSize,7,'RobotoBold')+6))):0;
 const baseSpace=baseSize?baseWidth+6:0,logoSpace=Model.isLogo(d.team.logo)?24:0;
 const keywordLines=richLines(Model.operativeKeywords(c,d.team.name).join(', '),inner-(baseSize?baseSpace+logoSpace:24),5.6,'RobotoBold',0,true);
 const keywordHeight=keywordLines.reduce((sum,line)=>sum+line.height,0);
 // Reserve room for the chosen type size instead of cutting off keywords after
 // two lines. Extremely long footers scale together to leave usable card space.
 const keywordScale=Math.min(1,(h-baseHeader-70)/Math.max(1,keywordHeight)),footer=Math.max(18,Math.ceil(keywordHeight*keywordScale+8));
 const uploaded=/^data:image\/(png|jpeg);base64,/.test(c.image||''),portrait=uploaded?c.image:assets[c.image];
 // Names share the full header up to the stats and render above the portrait.
 const {stats,statWidths,start,portraitWidth,portraitX}=operativeHeader(c,!!portrait),nw=start-pad*2;
 let size=c.nameFontSize??14;
 if(c.nameFontSize===undefined)while(wrap(c.name,nw,size,face(c.name)).length>2&&size>8)size-=.25;
 const titleLines=wrap(c.name,nw,size,face(c.name)),title=titleLines.slice(0,2);
 if(titleLines.length>2){let last=title[1];while(measure(last+'…',size,face(c.name))>nw)last=last.slice(0,-1);title[1]=last.trimEnd()+'…'}
 const titleStep=size>14?size:12,titleY=title.length>1?Math.max(14,size):Math.max(23,size+2),underlineY=titleY+(title.length-1)*titleStep+3,nameHeader=Math.max(baseHeader,underlineY+3),loreTop=nameHeader+4;
 const loreLines=Text.plain(c.lore).trim()?richLines(c.lore,start-pad*2,6.8,'RobotoItalic',0,true):[];
 let loreCursor=0;
 const make=()=>{const p=base(w,h,d,false,assets),firstLore=loreCursor;
  let loreBottom=loreTop;
  while(loreCursor<loreLines.length&&loreBottom+loreLines[loreCursor].height<=h-footer-16)loreBottom+=loreLines[loreCursor++].height;
  const header=loreCursor>firstLore?Math.max(nameHeader,loreBottom+4):nameHeader;p.header=header;
  p.s+=rect(0,0,w,header,BLACK);
  if(portrait){
   // Move the chosen fragment independently of the fixed header clipping frame.
   p.s+='<defs><clipPath id="headerclip"><rect x="'+portraitX+'" width="'+portraitWidth+'" height="'+baseHeader+'"/></clipPath></defs><g class="operative-portrait" clip-path="url(#headerclip)">';
   if(c.imageCrop&&c.imageWidth&&c.imageHeight){
    const crop=c.imageCrop,placement=portraitPlacement(crop,c.imageWidth,c.imageHeight,{width:portraitWidth,height:baseHeader}),{scale,y}=placement,x=portraitX+placement.x;
    p.s+='<defs><clipPath id="operativecrop"><rect x="'+x+'" y="'+y+'" width="'+placement.width+'" height="'+placement.height+'"/></clipPath></defs><g class="operative-image-crop" clip-path="url(#operativecrop)"><image x="'+(x-crop.x*c.imageWidth*scale)+'" y="'+(y-crop.y*c.imageHeight*scale)+'" width="'+c.imageWidth*scale+'" height="'+c.imageHeight*scale+'" preserveAspectRatio="none" xlink:href="'+esc(portrait)+'"/></g>';
   }else p.s+='<image x="'+portraitX+'" y="1" width="'+portraitWidth+'" height="'+(baseHeader-2)+'" preserveAspectRatio="xMidYMin slice" xlink:href="'+esc(portrait)+'"/>';
   p.s+='</g>';
  }
  p.s+='<g class="operative-name">';
  title.forEach((t,i)=>p.s+=txt(t,pad,titleY+i*titleStep,size,'white',face(c.name)));
  p.s+=line(0,underlineY,Math.min(pad+nw,...title.map(t=>measure(t,size,face(c.name))+pad)),underlineY,C,.5)+'</g>';
  if(loreCursor>firstLore){
   let y=loreTop;p.s+='<g class="operative-lore">';
   for(const text of loreLines.slice(firstLore,loreCursor)){
    p.s+=Text.svg(text,pad,y+text.size,'#e6e8e4');p.boxes.push({kind:'operative-lore',x:pad,y,w:text.width,h:text.height});y+=text.height;
   }
   p.s+='</g>';
  }
  let statX=start;
  stats.forEach(([key,val],i)=>{
   const sw=statWidths[i],x=statX,statKey=({M:'MOVE',SV:'SAVE',W:'WOUNDS'})[key]||key,[left,top,right,bottom]=STAT_ICON_BOUNDS[statKey]||[0,0,32,32],iconSize=10*32/(bottom-top),iconWidth=(right-left)*iconSize/32,gap=1.5;
   const valueSize=Math.min(15,15*(sw-3.5-iconWidth-gap)/Math.max(1,measure(val,15,'Display'))),valueWidth=measure(val,valueSize,'Display'),inkX=x+1.6+(sw-1.6-iconWidth-gap-valueWidth)/2;
   statX+=sw;p.s+='<g class="operative-stat" data-stat="'+esc(key)+'">'+rect(x,0,1.6,header,'#e6e8e4')+txt(key,x+(sw+1.6)/2,14,7.5,'white','Display','text-anchor="middle"')+icon(key,inkX-left*iconSize/32,19.5-top*iconSize/32,iconSize,C)+txt(val,inkX+iconWidth+gap+valueWidth/2,29.5,valueSize,'white','Display','text-anchor="middle"')+'</g>';
  });
  p.s+=rect(0,h-footer,w,footer,BLACK);
  let keywordY=0;p.s+='<g class="operative-keywords" transform="translate('+pad+' '+(h-footer+4)+') scale('+keywordScale+')">';
  for(const text of keywordLines){p.s+=Text.svg(text,0,keywordY+text.size,'white');keywordY+=text.height}
  p.s+='</g>';
  p.s+=teamLogo(d,w-pad-16-baseSpace,h-footer+1,16);
  if(baseSize){
   const x=w-pad-baseWidth,y=h-footer+(footer-16)/2,size=Math.min(7,(baseWidth-4)/Math.max(1,measure(baseSize,1,'RobotoBold')));
   p.s+='<g class="operative-base-size">'+rect(x,y,baseWidth,16,'none','rx="8" stroke="white" stroke-width=".7"')+txt(baseSize,x+baseWidth/2,y+8+size*.35,size,'white','RobotoBold','text-anchor="middle"')+'</g>';
  }
  return p;
 };
 let p=make(),y=p.header+3,weaponIndex=0,rowCount=0,lastGroup='';
 const newSide=()=>{p.s+=rect(0,h-footer-8,w,8,C)+txt(loreCursor<loreLines.length?'TEXT CONTINUES ON NEXT SIDE':'RULES CONTINUE ON NEXT SIDE',w-8,h-footer-1.5,6.4,'white','Display','text-anchor="end"');sides.push(finish(p,{id:c.id,kind:c.kind,side:sides.length,index,name:c.name}));if(sides.length>100)throw Error('Слишком длинная карточка: '+c.name);p=make();y=p.header+4;lastGroup=''};
 while(loreCursor<loreLines.length)newSide();
 const columnX=[pad+15,132,151,173,192],columnWidths=[101,18,18,23,w-pad-192];
 const tableHead=()=>{['NAME','ATK','HIT','DMG','WR'].forEach((t,i)=>p.s+=txt(t,columnX[i],y+7,8,BLACK,'Display',i>0&&i<4?'text-anchor="middle"':''));y+=10;p.s+=line(pad,y,w-pad,y,C,.5)};
 if(c.weapons.length){if(y+21>h-footer-14)newSide();tableHead()}
 while(weaponIndex<c.weapons.length){
  const weapon=c.weapons[weaponIndex],group=weapon.group&&weapon.group!==lastGroup?weapon.group+' - select one profile':'';
  const columns=[weapon.mode||weapon.name,String(weapon.attacks),String(weapon.hit),String(weapon.damage),Model.weaponRules(weapon)||'-'].map((text,i)=>richLines(text,columnWidths[i],6.6,i===0?'RobotoBold':'Roboto',0,true));
  const height=Math.max(12,Math.max(...columns.map(lines=>lines.reduce((n,a)=>n+a.height,0)))+3),gh=group?9:0;
  if(y+Math.min(height,35)+gh>h-footer-14||(height+gh<=h-footer-14-(baseHeader+14)&&y+height+gh>h-footer-14)){newSide();tableHead()}
  if(group){p.s+=txt(group,pad,y+7,6.4,BLACK,'RobotoItalic');y+=9;lastGroup=weapon.group}
  while(columns.some(lines=>lines.length)){
   const available=h-footer-14-y-3;
   if(columns.some(lines=>lines[0]?.height>available)){newSide();tableHead();continue}
   const segments=columns.map(lines=>{const picked=[];let used=0;while(lines.length&&used+lines[0].height<=available){const a=lines.shift();picked.push(a);used+=a.height}return {lines:picked,height:used}});
   const chunkHeight=Math.max(12,...segments.map(s=>s.height+3));
   if(rowCount%2===0)p.s+=rect(pad,y,inner,chunkHeight,'#cdd1cc');
   p.s+=icon(weapon.kind,pad+1,y+(chunkHeight-11)/2,11,C);
   segments.forEach((segment,j)=>{let yy=y+(chunkHeight-segment.height)/2;for(const a of segment.lines){const x=columnX[j]-(j>0&&j<4?a.width/2:0);p.s+=Text.svg(a,x,yy+a.size);p.boxes.push({kind:'weapon',x,y:yy,w:a.width,h:a.height});yy+=a.height}});
   y+=chunkHeight;
   if(columns.some(lines=>lines.length)){newSide();tableHead()}
  }
  weaponIndex++;rowCount++;
 }
 if(c.weapons.length){p.s+=line(pad,y,w-pad,y,C,.5);y+=3}
 const full=c.rulesLayout==='full',gutter=8,columnWidth=full?inner:(inner-gutter)/2,items=blocks(c,d,columnWidth,true);
 let cursor=0,col=0,top=y;
 while(cursor<items.length){
  const a=items[cursor],bottom=h-footer-10;
  const keep=a.groupHeight&&a.groupHeight<=bottom-top?a.groupHeight:a.keepHeight||a.height;
  if(y+Math.max(a.height,keep)>bottom){if(!full&&col===0&&keep<=bottom-top){col=1;y=top}else{newSide();col=0;top=y}continue}
  const x=pad+col*(columnWidth+gutter);
  if(a.actionHeading)p.s+=rect(x,y-1,columnWidth,a.height-1,C);
  p.s+=Text.svg(a,x+(a.actionHeading?2:0),y+a.size,a.actionHeading?'white':BLACK);p.boxes.push({x,y,w:a.width,h:a.height});y+=a.height;cursor++;
  if(sides.length>100)throw Error('Слишком длинная карточка: '+c.name);
 }
 sides.push(finish(p,{id:c.id,kind:c.kind,side:sides.length,index,name:c.name}));
 return sides;
}
function selectionCard(c,d,assets={},index=0){
 const w=SHORT,h=LONG,pad=8,inner=w-pad*2,sides=[],all=[],name=c.name||d.team.name+' KILL TEAM',size=7.8;
 const add=(text,indent=0,bullet='',gap=4,font='Selection')=>{
  if(!text)return;
  const lines=richLines(text,inner-indent,size,font,gap/2),start=all.length;
  for(const line of lines)if(!line.text.trim())line.height/=2;
  lines.forEach((line,i)=>all.push({...line,listIndent:indent,bullet:i===0?bullet:''}));
  all[start].keepHeight=lines.slice(0,2).reduce((n,line)=>n+line.height,0);
 };
 add(c.lore,0,'',7,'RobotoItalic');add(c.body);
 for(const group of c.selectionGroups||[]){
  const start=all.length;add(group.count+' '+group.description,10,'arrow',5);
  if(all[start])all[start].keepHeight+=size*1.28;
  for(const entry of group.entries){if(entry.operativeId&&c.excludedOperativeIds.includes(entry.operativeId))continue;add(entry.text,19,'dot',2);for(const option of entry.options)add(option,28,'ring',2)}
  if(all.length)all[all.length-1].height+=4;
 }
 add(c.selectionRules,0,'',9);add(c.selectionNotes,0,'',7);
 for(const a of [...c.abilities,...c.actions]){add(a.name+(a.cost?' / '+a.cost:''),0,'',2,'RobotoBold');add(a.body)}
 for(const weapon of c.weapons){add(weapon.name,0,'',2,'RobotoBold');add('ATK '+weapon.attacks+'   HIT '+weapon.hit+'   DMG '+weapon.damage);add(Model.weaponRules(weapon))}
 let cursor=0;
 do{
  const p=base(w,h,d,true,assets),side=sides.length;
  let y=10;
  if(side===0){
   const title=wrap(name.replace(/ KILL TEAM$/,'\nKILL TEAM'),inner,18,face(name));
   title.forEach((t,i)=>p.s+=txt(t,pad,y+17+i*19,18,'white',face(name)));y+=title.length*19+6;
   const archetypes=c.archetypes.map(value=>value.trim()).filter(Boolean);
   if(archetypes.length){
    const text='ARCHETYPES: '+archetypes.join(', '),font=face(text);
    const rows=Text.layout(text.replace(/[\\*\[\]]/g,'\\$&'),inner,9.3,font,0,1.15),bandHeight=Math.max(14,rows.reduce((n,row)=>n+row.height,0)+3.4);
    p.s+='<g class="archetype-band">'+rect(0,y,w,bandHeight,p.C);
    let rowY=y+10.6;for(const row of rows){p.s+=Text.svg(row,pad,rowY,'white');rowY+=row.height}
    p.s+='</g>';y+=bandHeight;
   }
   y+=15;
   p.s+=txt('OPERATIVES',pad,y,13,'white','Display')+line(pad,y+4,w-pad,y+4,p.C,.7);y+=13;
  }
  const bottom=h-23,startY=y,startCursor=cursor;
  while(cursor<all.length&&y+all[cursor].height<=bottom){
   const next=all[cursor];if(cursor>startCursor&&next.keepHeight&&y+next.keepHeight>bottom)break;
   const a=all[cursor++],x=pad+a.listIndent;
   if(a.bullet==='arrow')p.s+='<path d="M'+(x-9)+' '+(y+2)+'l5 5m-5 0h5v-5" fill="none" stroke="'+p.C+'" stroke-width=".7"/>';
   if(a.bullet==='dot'||a.bullet==='ring')p.s+='<circle cx="'+(x-6)+'" cy="'+(y+5)+'" r="1.35" fill="'+(a.bullet==='dot'?p.C:'none')+'" stroke="'+p.C+'" stroke-width=".6"/>';
   p.s+=Text.svg(a,x,y+a.size,'white',p.C,d.team.name);
   p.boxes.push({x,y,w:a.width,h:a.height});y+=a.height;
  }
  if(cursor<all.length)p.s+=rect(pad,h-20,inner,12,p.C)+txt('CONTINUES ON OTHER SIDE',pad+3,h-11,8,'white','Display');
  sides.push(finish(p,{id:c.id,kind:c.kind,side,index,name}));
  if(sides.length>100)throw Error('Слишком длинная карточка состава: '+name);
 }while(cursor<all.length);
 return sides;
}
function renderCard(c,d,assets={},index=0){return c.kind==='token-guide'?Tokens.renderCard(c,d,assets,index,root.KTCards):c.kind==='selection'?selectionCard(c,d,assets,index):c.kind==='operative'?operative(c,d,assets,index):portrait(c,d,assets,index)}
function renderDeck(d,assets={}){
 return [...d.selectionCards,...d.teamCards,...(d.tokenCards||[]),...d.strategicPloys,...d.firefightPloys,...d.equipment,...d.operatives].flatMap((c,i)=>renderCard(c,d,assets,(['equipment','firefight','strategic'].includes(c.kind)?d[c.kind==='equipment'?'equipment':c.kind==='firefight'?'firefightPloys':'strategicPloys'].indexOf(c):i)));
}
root.KTCards={renderCard,renderDeck,selectionCard,measure,wrap,SHORT,LONG,esc,teamLogo,inlineSVG,portraitFrame,portraitPlacement};
if(typeof module!=='undefined')module.exports=root.KTCards;
})(typeof window!=='undefined'?window:globalThis);

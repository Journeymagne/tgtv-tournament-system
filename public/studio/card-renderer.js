(function(root){
'use strict';
const F=root.KTFontMetrics||(typeof require!=='undefined'?require('./font-metrics.js'):null);
const Text=root.KTText||(typeof require!=='undefined'?require('./rich-text.js'):null);
const MM=72/25.4,SHORT=70*MM,LONG=121*MM,BLACK='#141718',SAGE='#6e7b70';
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
// Melee sword: vector contour from the supplied Kasrkin PDF, page 1, in a 32-unit box.
function icon(key,x,y,size,c){
 const paths={APL:'<path d="M2 5h28L16 28z"/><path d="M7 6l9 16L25 6" fill="none" stroke="'+BLACK+'" stroke-width="2"/>',M:'<path d="M2 14L22 5v5l8-3-4 19-5-5-16 7z"/>',MOVE:'<path d="M2 14L22 5v5l8-3-4 19-5-5-16 7z"/>',SV:'<path d="M5 4h22v18L16 29 5 22z" fill="none" stroke="'+c+'" stroke-width="2"/><path d="M10 7h12v13l-6 4-6-4z"/>',W:'<path d="M16 3l7 21-7 6-7-6z"/>',GA:'<path d="M3 8h10v10H3zM19 8h10v10H19zM11 21h10v8H11z"/>',DF:'<path d="M4 6h24v14L16 29 4 20z" fill="none" stroke="'+c+'" stroke-width="3"/><path d="M10 11h12v7l-6 5-6-5z"/>',ranged:'<path d="M3 10l4-6 4 6v19H3zM13 10l4-6 4 6v19h-8zM23 10l4-6 4 6v19h-8z"/>',melee:'<path d="M32 14.187H22.303V8.444H20.95V12.64H3.088L0.05 15.324H20.95V16.681H0L3.088 19.41H20.95V23.556H22.303V17.861H32Z"/>'};
 return '<g transform="translate('+x+' '+y+') scale('+(size/32)+')" fill="'+c+'">'+(paths[key]||paths[key==='SAVE'?'SV':key==='WOUNDS'?'W':'APL'])+'</g>';
}
function richLines(value,width,size=8.2,font='Roboto',gap=3){
 return Text.layout(value,width,size,font,gap);
}
function blocks(c,d,width,operative=false){
 const result=[],size=operative?(c.rulesLayout==='full'?6.4:6.8):c.kind==='selection'?7.8:8.2;
 const add=(t,font='Roboto',gap=5,s=size)=>{if(t){const lines=richLines(t,width,s,font,gap);lines[0].groupHeight=lines.reduce((n,l)=>n+l.height,0);lines[0].keepHeight=font==='RobotoBold'||font==='Display'?lines[0].height+size*2.56:0;result.push(...lines)}};
 if(c.kind==='selection'){
  add(c.lore,'RobotoItalic',7);
  add(c.body);
  add('OPERATIVES','Display',3,13);
  for(const g of c.selectionGroups||[]){add(g.count+' '+g.description);for(const e of g.entries){add(e.text);for(const option of e.options)add('• '+option)}}
  add(c.selectionRules);add(c.selectionNotes);
 }else{
  add(c.lore,'RobotoItalic',9);
  add(c.body);
 }
 if(c.restriction)add(c.restriction,'RobotoBold');
 if(c.unique)add('Maximum once per team.','RobotoItalic');
 if(c.bashaAllowed)add('Available to NOB BASHA.','RobotoItalic');
 for(const a of c.abilities){const start=result.length;add(a.name,'RobotoBold',1);add(a.body);if(result[start])result[start].groupHeight=result.slice(start).reduce((n,l)=>n+l.height,0)}
 for(const a of c.actions){const start=result.length;add(a.name+(a.cost?'  /  '+a.cost:''),'RobotoBold',4);for(let i=start;i<result.length;i++)result[i].actionHeading=true;add(a.body);if(result[start])result[start].groupHeight=result.slice(start).reduce((n,l)=>n+l.height,0)}
 if(c.kind==='firefight'&&c.cost?.includes('+')&&d.ployNote)add(d.ployNote,'RobotoItalic');
 if(c.kind==='strategic'&&c.cost?.includes('+')&&d.ployNote)add(d.ployNote,'RobotoItalic');
 let trailing=0;for(let i=result.length-1;i>=0;i--){trailing+=result[i].height;if(result[i].keepHeight)result[i].keepHeight=Math.min(result[i].keepHeight,trailing)}
 return result;
}
function base(w,h,d,dark=false,assets={}){
 const C=d.layout.accent;
 let s='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">';
 s+='<defs><clipPath id="cardclip"><rect width="'+w+'" height="'+h+'" rx="12"/></clipPath></defs><g clip-path="url(#cardclip)">';
 s+=rect(0,0,w,h,dark?BLACK:'#edf0eb');
 if(assets['assets/paper.jpg'])s+='<image x="0" y="0" width="'+w+'" height="'+h+'" preserveAspectRatio="xMidYMid slice" opacity="'+(dark?.07:.5)+'" xlink:href="'+assets['assets/paper.jpg']+'"/>';
 // A neutral team monogram is kept separate from the source faction's insignia.
 if(!dark)s+=txt(d.team.name.slice(0,1),w/2,h*.76,w*.85,'#d2d9d1','Display','text-anchor="middle" opacity=".23"');
 return {s,C,w,h,dark,boxes:[]};
}
function finish(p,meta){return {svg:p.s+'</g></svg>',width:p.w,height:p.h,boxes:p.boxes,...meta}}
const category={selection:'KILL TEAM',recruitment:'KILL TEAM SELECTION',faction:'FACTION RULE',strategic:'STRATEGY PLOY',firefight:'FIREFIGHT PLOY',equipment:'FACTION EQUIPMENT'};
function portrait(c,d,assets={},index=0){
 const w=SHORT,h=LONG,pad=8,inner=w-2*pad,dark=['selection','recruitment'].includes(c.kind),sides=[];
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
  all.push(...richLines([weapon.special,weapon.critical?'CR: '+weapon.critical:''].filter(Boolean).join('; ')||'-',inner,8.2,'Roboto',8));
 }
 let cursor=0;
 do{
  const p=base(w,h,d,dark,assets),side=sides.length;
  p.s+=rect(0,0,w,46,BLACK);
  p.s+=txt(d.team.name,w/2,18,10.3,p.C,'RobotoBold','text-anchor="middle"');
  p.s+=txt(labels,w/2,35,18,'white','Display','text-anchor="middle"');
  let y=54;
  const bandLines=wrap(name,inner-(c.cost?35:6),12,face(name));
  const bh=Math.max(15,bandLines.length*13+3);
  if(['strategic','firefight'].includes(c.kind)){
   const fill=c.kind==='strategic'?SAGE:'#232323';
   p.s+=rect(pad,y,inner,bh,fill)+rect(pad+2,y+2,inner-4,bh-2,'none','stroke="#e4e9e1" stroke-width=".6"');
  }else if(c.kind==='equipment')p.s+=rect(pad,y,inner,bh,'none','stroke="'+BLACK+'" stroke-width=".6"');
  else p.s+=line(pad,y+bh, w-pad,y+bh,p.C,.7);
  const titleColor=['strategic','firefight'].includes(c.kind)?'white':dark?'white':c.kind==='equipment'?BLACK:p.C;
  bandLines.forEach((t,i)=>p.s+=txt(t,pad+2,y+12+i*13,12,titleColor,face(name)));
  if(c.cost)p.s+=txt(c.cost,w-pad-3,y+11,7.5,titleColor,'RobotoBold','text-anchor="end"');
  y+=bh+10;
  if(c.subtitle){const sub=wrap(c.subtitle,inner-6,10,'RobotoBold'),sh=sub.length*12+4;p.s+=rect(pad,y-3,inner,sh,p.C);sub.forEach((t,i)=>p.s+=txt(t,pad+3,y+7+i*12,10,'white','RobotoBold'));y+=sh+5}
  if(side){p.s+=txt('CONTINUED / '+(side+1),pad,y,7.5,dark?'#d1d8d0':'#6a746c','RobotoBold');y+=12}
  const bottom=h-23,startY=y,startCursor=cursor;
  while(cursor<all.length&&y+all[cursor].height<=bottom){
   const next=all[cursor];if(cursor>startCursor&&((next.keepHeight&&y+next.keepHeight>bottom)||(next.groupHeight<=bottom-startY&&y+next.groupHeight>bottom)))break;
   const a=all[cursor++];p.s+=Text.svg(a,pad,y+a.size,dark?'white':BLACK);p.boxes.push({x:pad,y,w:a.width,h:a.height});y+=a.height;
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
function operative(c,d,assets={},index=0){
 const w=LONG,h=SHORT,pad=8,inner=w-16,header=33,footer=22,C=d.layout.accent,sides=[];
 const make=()=>{const p=base(w,h,d,false,assets),stats=Object.entries(c.stats),sw=stats.length>4?24:28,start=w-stats.length*sw;
  p.s+=rect(0,0,w,header,BLACK);
  const uploaded=/^data:image\/(png|jpeg);base64,/.test(c.image||''),portrait=uploaded?c.image:assets[c.image];
  if(portrait){
   p.s+='<defs><clipPath id="headerclip"><rect width="'+w+'" height="'+header+'"/></clipPath></defs><g clip-path="url(#headerclip)">';
   if(c.imageCrop&&c.imageWidth&&c.imageHeight){
    const crop=c.imageCrop,cw=crop.width*c.imageWidth,ch=crop.height*c.imageHeight,scale=Math.min(61/cw,(header-2)/ch);
    const x=start-61+(61-cw*scale)/2,y=1+(header-2-ch*scale)/2;
    p.s+='<defs><clipPath id="operativecrop"><rect x="'+x+'" y="'+y+'" width="'+cw*scale+'" height="'+ch*scale+'"/></clipPath></defs><g class="operative-image-crop" clip-path="url(#operativecrop)"><image x="'+(x-crop.x*c.imageWidth*scale)+'" y="'+(y-crop.y*c.imageHeight*scale)+'" width="'+c.imageWidth*scale+'" height="'+c.imageHeight*scale+'" preserveAspectRatio="none" xlink:href="'+esc(portrait)+'"/></g>';
   }else p.s+='<image x="'+(start-61)+'" y="'+(uploaded?1:-7)+'" width="61" height="'+(uploaded?header-2:44)+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+esc(portrait)+'"/>';
   p.s+='</g>';
  }
  const nw=start-(portrait?64:8)-8;
  let size=14;while(measure(c.name,size,face(c.name))>nw&&size>10)size-=.25;
  wrap(c.name,nw,size,face(c.name)).slice(0,2).forEach((t,i)=>p.s+=txt(t,8,20+i*11,size,'white',face(c.name)));
  p.s+=line(0,24,Math.min(start-4,measure(c.name,size,face(c.name))+9),24,C,.5);
  stats.forEach(([key,val],i)=>{const x=start+i*sw,hasDistance=/[″"]/.test(String(val));p.s+=rect(x,0,2,header,'#e6e8e4')+txt(key,x+sw/2,12,7,'white','Display','text-anchor="middle"')+(hasDistance?'':icon(key,x+3,20,9,C))+txt(val,hasDistance?x+sw/2:x+sw-3,29,11,'white','Display',hasDistance?'text-anchor="middle"':'text-anchor="end"')});
  p.s+=rect(0,h-footer,w,footer,BLACK);
  wrap(c.keywords.join(', '),inner-16,5.6,'RobotoBold').slice(0,2).forEach((t,i)=>p.s+=txt(t,pad,h-10+i*6,5.6,'white','RobotoBold'));
  return p;
 };
 let p=make(),y=header+3,weaponIndex=0,rowCount=0,lastGroup='';
 const newSide=()=>{p.s+=rect(0,h-footer-8,w,8,C)+txt('RULES CONTINUE ON NEXT SIDE',w-8,h-footer-1.5,6.4,'white','Display','text-anchor="end"');sides.push(finish(p,{id:c.id,kind:c.kind,side:sides.length,index,name:c.name}));p=make();y=header+4;lastGroup=''};
 const tableHead=()=>{['NAME','ATK','HIT','DMG','WR'].forEach((t,i)=>p.s+=txt(t,[pad+14,142,163,182,205][i],y+7,8,BLACK,'Display'));y+=10;p.s+=line(pad,y,w-pad,y,C,.5)};
 if(c.weapons.length)tableHead();
 while(weaponIndex<c.weapons.length){
  const weapon=c.weapons[weaponIndex],group=weapon.group&&weapon.group!==lastGroup?weapon.group+' - select one profile':'';
  const columns=[wrap(weapon.mode||weapon.name,118,6.6),[String(weapon.attacks)],[String(weapon.hit)],[String(weapon.damage)],wrap([weapon.special,weapon.critical?'CR: '+weapon.critical:''].filter(Boolean).join('; ')||'-',w-pad-205,6.6)];
  const height=Math.max(...columns.map(a=>a.length))*8+3,gh=group?10:0;
  if(y+height+gh>h-footer-14){newSide();tableHead()}
  if(group){p.s+=txt(group,pad,y+8,6.4,BLACK,'RobotoItalic');y+=10;lastGroup=weapon.group}
  if(rowCount%2===0)p.s+=rect(pad,y,inner,height,'#cdd1cc');
  p.s+=icon(weapon.kind,pad+1,y+1,11,C);
  columns.forEach((lines,j)=>lines.forEach((t,i)=>{const x=[pad+14,142,163,182,205][j];p.s+=txt(t,x,y+8+i*8,6.6);p.boxes.push({x,y:y+i*8,w:measure(t,6.6),h:8})}));
  y+=height;weaponIndex++;rowCount++;
 }
 if(c.weapons.length){p.s+=line(pad,y,w-pad,y,C,.5);y+=5}
 const full=c.rulesLayout==='full',columnWidth=full?inner:(inner-12)/2,items=blocks(c,d,columnWidth,true);
 let cursor=0,col=0,top=y;
 while(cursor<items.length){
  const a=items[cursor],bottom=h-footer-12;
  const keep=a.groupHeight&&a.groupHeight<=h-footer-12-(header+4)?a.groupHeight:a.keepHeight||a.height;
  if(y+Math.max(a.height,keep)>bottom){if(!full&&col===0&&keep<=bottom-top){col=1;y=top}else{newSide();col=0;top=y}continue}
  const x=pad+col*(columnWidth+12);
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
  const lines=richLines(text,inner-indent,size,font,gap),start=all.length;
  lines.forEach((line,i)=>all.push({...line,indent,bullet:i===0?bullet:''}));
  all[start].keepHeight=lines.slice(0,2).reduce((n,line)=>n+line.height,0);
 };
 add(c.lore,0,'',7,'RobotoItalic');add(c.body);
 for(const group of c.selectionGroups||[]){
  const start=all.length;add(group.count+' '+group.description,10,'arrow',5);
  if(all[start])all[start].keepHeight+=size*1.28;
  for(const entry of group.entries){if(entry.operativeId&&c.excludedOperativeIds.includes(entry.operativeId))continue;add(entry.text,19,'dot',2);for(const option of entry.options)add(option,28,'ring',2)}
  if(all.length)all[all.length-1].height+=8;
 }
 add(c.selectionRules,0,'',9);add(c.selectionNotes,0,'',7);
 for(const a of [...c.abilities,...c.actions]){add(a.name+(a.cost?' / '+a.cost:''),0,'',2,'RobotoBold');add(a.body)}
 for(const weapon of c.weapons){add(weapon.name,0,'',2,'RobotoBold');add('ATK '+weapon.attacks+'   HIT '+weapon.hit+'   DMG '+weapon.damage);add([weapon.special,weapon.critical].filter(Boolean).join('; '))}
 let cursor=0;
 do{
  const p=base(w,h,d,true,assets),side=sides.length;
  let y=10;
  if(side===0){
   const title=wrap(name.replace(/ KILL TEAM$/,'\nKILL TEAM'),inner,18,face(name));
   title.forEach((t,i)=>p.s+=txt(t,pad,y+17+i*19,18,'white',face(name)));y+=title.length*19+6;
   const archetypes='ARCHETYPES: '+c.archetypes.map((value,i)=>value||'SELECT ARCHETYPE '+(i+1)).join(', ');
   let as=9.3;while(measure(archetypes,as,'Display')>inner&&as>6)as-=.2;
   p.s+='<g class="archetype-band">'+rect(0,y,w,14,p.C)+txt(archetypes,pad,y+10.6,as,'white','Display')+'</g>';y+=29;
   p.s+=txt('OPERATIVES',pad,y,13,'white','Display')+line(pad,y+4,w-pad,y+4,p.C,.7);y+=13;
  }
  const bottom=h-23,startY=y,startCursor=cursor;
  while(cursor<all.length&&y+all[cursor].height<=bottom){
   const next=all[cursor];if(cursor>startCursor&&next.keepHeight&&y+next.keepHeight>bottom)break;
   const a=all[cursor++],x=pad+a.indent;
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
function renderCard(c,d,assets={},index=0){return c.kind==='selection'?selectionCard(c,d,assets,index):c.kind==='operative'?operative(c,d,assets,index):portrait(c,d,assets,index)}
function renderDeck(d,assets={}){
 return [...d.selectionCards,...d.teamCards,...d.strategicPloys,...d.firefightPloys,...d.equipment,...d.operatives].flatMap((c,i)=>renderCard(c,d,assets,(['equipment','firefight','strategic'].includes(c.kind)?d[c.kind==='equipment'?'equipment':c.kind==='firefight'?'firefightPloys':'strategicPloys'].indexOf(c):i)));
}
root.KTCards={renderCard,renderDeck,selectionCard,measure,wrap,SHORT,LONG,esc};
if(typeof module!=='undefined')module.exports=root.KTCards;
})(typeof window!=='undefined'?window:globalThis);


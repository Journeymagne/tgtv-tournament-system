(function(root){
'use strict';
const Metrics=root.KTFontMetrics||(typeof require!=='undefined'?require('./font-metrics.js'):null);
const MIN_SIZE=6,MAX_SIZE=24;
const ORANGE='#f4511e',SKULL='💀',COLOR_OPEN='[color=orange]',COLOR_CLOSE='[/color]';
const TRIANGLE='▶',DIAMOND='◆',BULLET='•',SYMBOLS={[SKULL]:'Skull',[TRIANGLE]:'Triangle',[DIAMOND]:'Diamond',[BULLET]:'Bullet'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const same=(a,b)=>a.bold===b.bold&&a.italic===b.italic&&a.size===b.size&&a.font===b.font&&a.accentKey===b.accentKey&&a.color===b.color;
function append(runs,text,style){
 if(!text)return;
 const last=runs[runs.length-1];
 if(last&&same(last,style))last.text+=text;else runs.push({...style,text});
}
// A deliberately small, text-only Markdown subset. Unclosed markers stay literal;
// HTML is never interpreted. Bound recursion/work even for malformed pasted text.
function parse(value){
 const source=String(value??'').replace(/\r/g,'').replace(/💀[\ufe0e\ufe0f]/g,SKULL),initial={bold:false,italic:false,size:null};
 let budget=source.length*8+100;
 function segment(start,closing,style,depth){
  const runs=[];let i=start;
  while(i<source.length){
   if(--budget<0){append(runs,source.slice(i),style);return closing?null:{runs,end:source.length}}
   if(closing&&source.startsWith(closing,i)&&(closing.startsWith('[/')||! /\s/.test(source[i-1]||'')))return {runs,end:i+closing.length};
   if(source[i]==='\\'&&/[\\*\[\]]/.test(source[i+1]||'')){append(runs,source[i+1],style);i+=2;continue}
   const size=source.slice(i,i+16).match(/^\[size=(\d+(?:\.\d+)?)\]/);
   let open='',close='',nextStyle;
   if(size&&Number(size[1])>=MIN_SIZE&&Number(size[1])<=MAX_SIZE){open=size[0];close='[/size]';nextStyle={...style,size:Number(size[1])}}
   else if(source.startsWith(COLOR_OPEN,i)){open=COLOR_OPEN;close=COLOR_CLOSE;nextStyle={...style,color:ORANGE}}
   else if(source[i]==='*'){
    open=source.startsWith('***',i)?'***':source.startsWith('**',i)?'**':'*';close=open;
    if(!source[i+open.length]||/\s/.test(source[i+open.length]))open='';
    nextStyle={...style,bold:style.bold||open.length>=2,italic:style.italic||open.length===1||open.length===3};
   }
   if(open&&depth<16&&source.indexOf(close,i+open.length)>=0){
    const nested=segment(i+open.length,close,nextStyle,depth+1);
    if(nested){for(const run of nested.runs)append(runs,run.text,run);i=nested.end;continue}
   }
   // Consume an unmatched delimiter as a unit, so ** cannot become empty italics.
   const literal=open||source[i];append(runs,literal,style);i+=literal.length;
  }
  return closing?null:{runs,end:i};
 }
 return segment(0,null,initial,0).runs;
}
function plain(value){return parse(value).map(run=>run.text).join('')}
function glyphWidth(char,size,font){return (char===BULLET?.55:SYMBOLS[char]?.85:Metrics[char==='″'&&font==='Display'?'Roboto':font]?.[char]??.56)*size}
function layout(value,width,size=8.2,font='Roboto',gap=3,leading=1.28){
 const styled=[];
 for(const run of parse(value)){
  const parts=font==='Selection'?run.text.split(/(\b[A-Z][A-Z-]*(?: [A-Z][A-Z-]*)*\b|\*)/g):[run.text];
  for(const text of parts){
   const bold=run.bold||font.includes('Bold')||font==='Selection'&&/^[A-Z][A-Z -]*$/.test(text);
   const italic=run.italic||font.includes('Italic');
   const resolved=font==='Display'&&!bold&&!italic?'Display':'Roboto'+(bold?'Bold':'')+(italic?'Italic':'');
   styled.push({...run,text,size:run.size??size,font:resolved,bold,italic,accentKey:font==='Selection'?text:null});
  }
 }
 const lines=[];let glyphs=[],used=0,word=[],space=null,indent=0,hanging=0,paragraphStarted=false;
 const finish=()=>{
  const runs=[];let largest=size;
  for(const glyph of glyphs){append(runs,glyph.char,glyph.style);largest=Math.max(largest,glyph.style.size)}
  // Explicitly sized text may be smaller than the card's default size.
  if(glyphs.length)largest=Math.max(...runs.map(run=>run.size));
  lines.push({runs,text:runs.map(run=>run.text).join(''),width:used+indent,indent,size:largest,font,height:largest*leading});
  glyphs=[];used=0;indent=hanging;
 };
 const add=glyph=>{if(!paragraphStarted){if(glyph.char===TRIANGLE||glyph.char===DIAMOND||glyph.char===BULLET)hanging=Math.min(width/2,glyph.width+glyphWidth(' ',glyph.style.size,'Roboto'));paragraphStarted=true}glyphs.push(glyph);used+=glyph.width};
 const flushWord=()=>{
  if(!word.length)return;
  const wordWidth=word.reduce((sum,glyph)=>sum+glyph.width,0),spaceWidth=glyphs.length&&space?space.width:0;
  if(glyphs.length&&indent+used+spaceWidth+wordWidth>width)finish();
  if(glyphs.length&&space)add(space);
  for(const glyph of word){if(glyphs.length&&indent+used+glyph.width>width)finish();add(glyph)}
  word=[];space=null;
 };
 for(const style of styled)for(const char of style.text){
  if(char==='\n'){flushWord();finish();space=null;indent=hanging=0;paragraphStarted=false}
  else if(/\s/.test(char)){flushWord();space={char:' ',style,width:glyphWidth(' ',style.size,style.font)}}
  else word.push({char,style:SYMBOLS[char]?{...style,font:SYMBOLS[char]}:style,width:glyphWidth(char,style.size,style.font)});
 }
 flushWord();finish();lines[lines.length-1].height+=gap;
 return lines;
}
function svg(line,x,y,color='#141718',accent='',team=''){
 let cursor=x+(line.indent||0);const symbols=[];
 const runs=line.runs.map(run=>{
  const width=text=>Array.from(text).reduce((sum,char)=>sum+glyphWidth(char,run.size,run.font),0);
  const runX=cursor+width(run.text.match(/^\s*/)[0]);cursor+=width(run.text);
  if(!run.text.trim())return '';
  const fillColor=run.color||(accent&&(run.accentKey==='*'||run.accentKey===team)?accent:color);
  if(run.font==='Bullet'){
   for(let i=0;i<Array.from(run.text).length;i++)symbols.push('<circle class="text-bullet" cx="'+(runX+(i*.55+.22)*run.size).toFixed(4)+'" cy="'+(y-run.size*.35)+'" r="'+(run.size*.14)+'" fill="'+ORANGE+'"/>');
   return '';
  }
  if(run.font==='Skull'){
   // A font-independent skull keeps the same outline in SVG, PDF and TTS.
   for(let i=0;i<Array.from(run.text).length;i++)symbols.push('<g class="text-skull" transform="translate('+(runX+i*run.size*.85).toFixed(4)+' '+(y-run.size*.8)+') scale('+(run.size*.85/16)+')"><path fill="'+esc(fillColor)+'" fill-rule="evenodd" d="M8 1C4 1 1 3.6 1 7c0 2.4 1 4 3 4.6V14h2v-2h1v2h2v-2h1v2h2v-2.4c2-.6 3-2.2 3-4.6C15 3.6 12 1 8 1Z M6.8 7.8a1.9 1.7 0 1 0-3.8 0a1.9 1.7 0 1 0 3.8 0Z M12.9 7.8a1.9 1.7 0 1 0-3.8 0a1.9 1.7 0 1 0 3.8 0Z M8 9l-1 2h2Z"/></g>');
   return '';
  }
  if(run.font==='Triangle'||run.font==='Diamond'){
   const triangle=run.font==='Triangle',path=triangle?'M0 0L16 8 0 16Z':'M8 0L16 8 8 16 0 8Z';
   for(let i=0;i<Array.from(run.text).length;i++)symbols.push('<g class="text-'+(triangle?'triangle':'diamond')+'" transform="translate('+(runX+i*run.size*.85).toFixed(4)+' '+(y-run.size*.8)+') scale('+(run.size*.85/16)+')"><path fill="'+(triangle?'#269b48':'#c52b26')+'" d="'+path+'"/></g>');
   return '';
  }
  const family=run.font==='Display'?'Display':'Roboto';
  const fill=fillColor!==color?' fill="'+esc(fillColor)+'"':'';
  const content=run.text.trim(),text=family==='Display'?content.split(/(″)/g).map(part=>part==='″'?'<tspan font-family="Roboto">″</tspan>':esc(part)).join(''):esc(content);
  return '<tspan x="'+runX.toFixed(4)+'" y="'+y+'" font-family="'+family+'" font-size="'+run.size+'" font-weight="'+(run.bold?'bold':'normal')+'" font-style="'+(run.italic?'italic':'normal')+'"'+fill+'>'+text+'</tspan>';
 }).join('');
 // pdfmake reserializes SVG with indentation. Explicit run positions keep that
 // whitespace from changing word spacing or pushing text past a card's edge.
 return '<text x="'+x+'" y="'+y+'" font-family="Roboto" font-size="'+line.size+'" fill="'+esc(color)+'">'+runs+'</text>'+symbols.join('');
}
// Return a replacement and selection, leaving the DOM and persistence to the editor.
function format(value,start,end,kind,size){
 let from=start,to=end;
 if(kind==='bullet'){
  from=value.slice(0,start).lastIndexOf('\n')+1;
  const last=end>start&&value[end-1]==='\n'?end-1:end;
  to=value.indexOf('\n',last);if(to<0)to=value.length;
  const lines=value.slice(from,to).split('\n'),prefix=/^([ \t]*)•(?:[ \t]+|$)/;
  const populated=lines.filter(line=>line.trim()),remove=populated.length>0&&populated.every(line=>prefix.test(line));
  const text=lines.map(line=>remove?line.replace(prefix,'$1'):prefix.test(line)||!line.trim()&&lines.length>1?line:line.replace(/^([ \t]*)/,'$1• ')).join('\n');
  if(start===end){const min=text.match(/^(?:[ \t]*•[ \t]*|[ \t]*)/)[0].length,caret=from+Math.max(min,Math.min(text.length,start-from+text.length-(to-from)));return {from,to,text,start:caret,end:caret}}
  return {from,to,text,start:from,end:from+text.length};
 }
 if(kind==='list-enter'){
  const lineStart=value.slice(0,start).lastIndexOf('\n')+1;
  let lineEnd=value.indexOf('\n',start);if(lineEnd<0)lineEnd=value.length;
  const line=value.slice(lineStart,lineEnd),prefix=/^([ \t]*)•[ \t]+/.exec(line);
  if(!prefix||start<lineStart+prefix[0].length||end>lineEnd)return null;
  if(!line.slice(prefix[0].length).trim())return {from:lineStart,to:lineEnd,text:'',start:lineStart,end:lineStart};
  const text='\n'+prefix[1]+BULLET+' ';return {from,to,text,start:from+text.length,end:from+text.length};
 }
 if(kind==='skull')return {from,to,text:SKULL,start:from+SKULL.length,end:from+SKULL.length};
 if(kind==='triangle'||kind==='diamond'){const text=(kind==='triangle'?TRIANGLE:DIAMOND)+' ';return {from,to,text,start:from+text.length,end:from+text.length}}
 if((kind==='size'||kind==='clear')&&from===to){from=0;to=value.length}
 // Include surrounding wrappers when resizing/resetting an existing selection.
 if(kind==='size'||kind==='clear'){
  let found=true;
  while(found){
   found=false;
   const sizeOpen=value.slice(0,from).match(/\[size=\d+(?:\.\d+)?\]$/);
   if(sizeOpen&&value.startsWith('[/size]',to)){from-=sizeOpen[0].length;to+=7;found=true}
   if(kind==='clear'&&value.slice(0,from).endsWith(COLOR_OPEN)&&value.startsWith(COLOR_CLOSE,to)){from-=COLOR_OPEN.length;to+=COLOR_CLOSE.length;found=true}
   if(kind==='clear')for(const marker of ['***','**','*'])if(from>=marker.length&&value.slice(from-marker.length,from)===marker&&value.startsWith(marker,to)){from-=marker.length;to+=marker.length;found=true;break}
  }
 }
 const selected=value.slice(from,to);
 if(kind==='clear'){const text=plain(selected);return {from,to,text,start:from,end:from+text.length}}
 if(selected&&!selected.trim())return null;
 let open=kind==='bold'?'**':kind==='italic'?'*':kind==='orange'?COLOR_OPEN:'[size='+size+']',close=kind==='size'?'[/size]':kind==='orange'?COLOR_CLOSE:open;
 if(kind==='size'&&(!Number.isFinite(Number(size))||Number(size)<MIN_SIZE||Number(size)>MAX_SIZE))return null;
 // Each list option is stored on its own line; keep wrappers within those lines.
 let text=selected||'текст';
 if(kind==='size')text=text.replace(/\[size=\d+(?:\.\d+)?\]|\[\/size\]/g,'');
 const wrapped=text.split('\n').map(line=>line.trim()?line.replace(/^(\s*(?:•[ \t]+)?)(.*?)(\s*)$/,(_,before,body,after)=>before+open+body+close+after):line).join('\n');
 const starsBefore=value.slice(0,from).match(/\*+$/)?.[0].length||0,starsAfter=value.slice(to).match(/^\*+/)?.[0].length||0;
 const surrounding=kind==='bold'?starsBefore>=2&&starsAfter>=2:kind==='italic'?starsBefore%2===1&&starsAfter%2===1:kind==='orange'?value.slice(0,from).endsWith(open)&&value.startsWith(close,to):false;
 if(surrounding)return {from:from-open.length,to:to+close.length,text:selected,start:from-open.length,end:to-open.length};
 if(kind!=='size'&&selected.startsWith(open)&&selected.endsWith(close)&&selected.length>=open.length+close.length){const runs=parse(selected);if(runs.length&&runs.every(run=>kind==='bold'?run.bold:kind==='orange'?run.color===ORANGE:run.italic))return {from,to,text:selected.slice(open.length,-close.length),start:from,end:to-open.length-close.length}}
 const leading=text.match(/^\s*(?:•[ \t]+)?/)[0].length,trailing=text.match(/\s*$/)[0].length;
 return {from,to,text:wrapped,start:from+(text.includes('\n')?0:leading+open.length),end:from+wrapped.length-(text.includes('\n')?0:trailing+close.length)};
}
root.KTText={parse,plain,layout,svg,format,MIN_SIZE,MAX_SIZE,ORANGE,SKULL,TRIANGLE,DIAMOND,BULLET};
if(typeof module!=='undefined')module.exports=root.KTText;
})(typeof window!=='undefined'?window:globalThis);

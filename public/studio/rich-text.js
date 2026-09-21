(function(root){
'use strict';
const Metrics=root.KTFontMetrics||(typeof require!=='undefined'?require('./font-metrics.js'):null);
const MIN_SIZE=6,MAX_SIZE=24;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const same=(a,b)=>a.bold===b.bold&&a.italic===b.italic&&a.size===b.size&&a.font===b.font&&a.accentKey===b.accentKey;
function append(runs,text,style){
 if(!text)return;
 const last=runs[runs.length-1];
 if(last&&same(last,style))last.text+=text;else runs.push({...style,text});
}
// A deliberately small, text-only Markdown subset. Unclosed markers stay literal;
// HTML is never interpreted. Bound recursion/work even for malformed pasted text.
function parse(value){
 const source=String(value??'').replace(/\r/g,''),initial={bold:false,italic:false,size:null};
 let budget=source.length*8+100;
 function segment(start,closing,style,depth){
  const runs=[];let i=start;
  while(i<source.length){
   if(--budget<0){append(runs,source.slice(i),style);return closing?null:{runs,end:source.length}}
   if(closing&&source.startsWith(closing,i)&&(closing==='[/size]'||! /\s/.test(source[i-1]||'')))return {runs,end:i+closing.length};
   if(source[i]==='\\'&&/[\\*\[\]]/.test(source[i+1]||'')){append(runs,source[i+1],style);i+=2;continue}
   const size=source.slice(i,i+16).match(/^\[size=(\d+(?:\.\d+)?)\]/);
   let open='',close='',nextStyle;
   if(size&&Number(size[1])>=MIN_SIZE&&Number(size[1])<=MAX_SIZE){open=size[0];close='[/size]';nextStyle={...style,size:Number(size[1])}}
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
function glyphWidth(char,size,font){return (Metrics[char==='″'&&font==='Display'?'Roboto':font]?.[char]??.56)*size}
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
 const lines=[];let glyphs=[],used=0,word=[],space=null;
 const finish=()=>{
  const runs=[];let largest=size;
  for(const glyph of glyphs){append(runs,glyph.char,glyph.style);largest=Math.max(largest,glyph.style.size)}
  // Explicitly sized text may be smaller than the card's default size.
  if(glyphs.length)largest=Math.max(...runs.map(run=>run.size));
  lines.push({runs,text:runs.map(run=>run.text).join(''),width:used,size:largest,font,height:largest*leading});
  glyphs=[];used=0;
 };
 const add=glyph=>{glyphs.push(glyph);used+=glyph.width};
 const flushWord=()=>{
  if(!word.length)return;
  const wordWidth=word.reduce((sum,glyph)=>sum+glyph.width,0),spaceWidth=glyphs.length&&space?space.width:0;
  if(glyphs.length&&used+spaceWidth+wordWidth>width)finish();
  if(glyphs.length&&space)add(space);
  for(const glyph of word){if(glyphs.length&&used+glyph.width>width)finish();add(glyph)}
  word=[];space=null;
 };
 for(const style of styled)for(const char of style.text){
  if(char==='\n'){flushWord();finish();space=null}
  else if(/\s/.test(char)){flushWord();space={char:' ',style,width:glyphWidth(' ',style.size,style.font)}}
  else word.push({char,style,width:glyphWidth(char,style.size,style.font)});
 }
 flushWord();finish();lines[lines.length-1].height+=gap;
 return lines;
}
function svg(line,x,y,color='#141718',accent='',team=''){
 let cursor=x;
 const runs=line.runs.map(run=>{
  const width=text=>Array.from(text).reduce((sum,char)=>sum+glyphWidth(char,run.size,run.font),0);
  const runX=cursor+width(run.text.match(/^\s*/)[0]);cursor+=width(run.text);
  if(!run.text.trim())return '';
  const family=run.font==='Display'?'Display':'Roboto';
  const fill=accent&&(run.accentKey==='*'||run.accentKey===team)?' fill="'+esc(accent)+'"':'';
  const content=run.text.trim(),text=family==='Display'?content.split(/(″)/g).map(part=>part==='″'?'<tspan font-family="Roboto">″</tspan>':esc(part)).join(''):esc(content);
  return '<tspan x="'+runX.toFixed(4)+'" y="'+y+'" font-family="'+family+'" font-size="'+run.size+'" font-weight="'+(run.bold?'bold':'normal')+'" font-style="'+(run.italic?'italic':'normal')+'"'+fill+'>'+text+'</tspan>';
 }).join('');
 // pdfmake reserializes SVG with indentation. Explicit run positions keep that
 // whitespace from changing word spacing or pushing text past a card's edge.
 return '<text x="'+x+'" y="'+y+'" font-family="Roboto" font-size="'+line.size+'" fill="'+esc(color)+'">'+runs+'</text>';
}
// Return a replacement and selection, leaving the DOM and persistence to the editor.
function format(value,start,end,kind,size){
 let from=start,to=end;
 if((kind==='size'||kind==='clear')&&from===to){from=0;to=value.length}
 // Include surrounding wrappers when resizing/resetting an existing selection.
 if(kind==='size'||kind==='clear'){
  let found=true;
  while(found){
   found=false;
   const sizeOpen=value.slice(0,from).match(/\[size=\d+(?:\.\d+)?\]$/);
   if(sizeOpen&&value.startsWith('[/size]',to)){from-=sizeOpen[0].length;to+=7;found=true}
   if(kind==='clear')for(const marker of ['***','**','*'])if(from>=marker.length&&value.slice(from-marker.length,from)===marker&&value.startsWith(marker,to)){from-=marker.length;to+=marker.length;found=true;break}
  }
 }
 const selected=value.slice(from,to);
 if(kind==='clear'){const text=plain(selected);return {from,to,text,start:from,end:from+text.length}}
 if(selected&&!selected.trim())return null;
 let open=kind==='bold'?'**':kind==='italic'?'*':'[size='+size+']',close=kind==='size'?'[/size]':open;
 if(kind==='size'&&(!Number.isFinite(Number(size))||Number(size)<MIN_SIZE||Number(size)>MAX_SIZE))return null;
 // Each list option is stored on its own line; keep wrappers within those lines.
 let text=selected||'текст';
 if(kind==='size')text=text.replace(/\[size=\d+(?:\.\d+)?\]|\[\/size\]/g,'');
 const wrapped=text.split('\n').map(line=>line.trim()?line.replace(/^(\s*)(.*?)(\s*)$/,(_,before,body,after)=>before+open+body+close+after):line).join('\n');
 const starsBefore=value.slice(0,from).match(/\*+$/)?.[0].length||0,starsAfter=value.slice(to).match(/^\*+/)?.[0].length||0;
 const surrounding=kind==='bold'?starsBefore>=2&&starsAfter>=2:kind==='italic'?starsBefore%2===1&&starsAfter%2===1:false;
 if(surrounding)return {from:from-open.length,to:to+close.length,text:selected,start:from-open.length,end:to-open.length};
 if(kind!=='size'&&selected.startsWith(open)&&selected.endsWith(close)&&selected.length>=open.length+close.length){const runs=parse(selected);if(runs.length&&runs.every(run=>kind==='bold'?run.bold:run.italic))return {from,to,text:selected.slice(open.length,-close.length),start:from,end:to-open.length-close.length}}
 const leading=text.match(/^\s*/)[0].length,trailing=text.match(/\s*$/)[0].length;
 return {from,to,text:wrapped,start:from+(text.includes('\n')?0:leading+open.length),end:from+wrapped.length-(text.includes('\n')?0:trailing+close.length)};
}
root.KTText={parse,plain,layout,svg,format,MIN_SIZE,MAX_SIZE};
if(typeof module!=='undefined')module.exports=root.KTText;
})(typeof window!=='undefined'?window:globalThis);

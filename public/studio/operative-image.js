(function(root){
'use strict';
const MAX_FILE=10*1024*1024,MAX_EDGE=480,MAX_DATA=100000;
const PROFILES={operative:{edge:MAX_EDGE,data:MAX_DATA},logo:{edge:192,data:24000},card:{edge:960,data:180000},page:{edge:1600,data:600000}};
function typeOf(bytes){
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return '';
}
async function prepare(file,options={}){
 const {edge:maxEdge,data:maxData}=PROFILES[options.profile]||PROFILES.operative;
 if(!file||!file.size)throw Error('Выберите изображение PNG, JPG или WebP');
 if(file.size>MAX_FILE)throw Error('Картинка больше 10 МБ. Выберите файл поменьше.');
 const type=typeOf(new Uint8Array(await file.slice(0,12).arrayBuffer()));
 if(!type)throw Error('Поддерживаются PNG, JPG и WebP');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Не удалось прочитать картинку')),20000);image.onload=()=>{clearTimeout(timer);resolve()};image.onerror=()=>{clearTimeout(timer);reject(Error('Не удалось прочитать картинку. Попробуйте другой файл.'))};image.src=url});
  const w=image.naturalWidth,h=image.naturalHeight;
  if(!w||!h||w*h>40000000)throw Error('Изображение слишком большое. Уменьшите его до 40 мегапикселей.');
  // Keep already compact PNG/JPEG bytes intact, including on repeated optimization.
  const prefix='data:'+type+';base64,';
  if(type!=='image/webp'&&Math.max(w,h)<=maxEdge&&Math.ceil(file.size/3)*4+prefix.length<=maxData){
   const uri=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(prefix+String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Не удалось прочитать картинку'));reader.readAsDataURL(file)});
   return options.details?{image:uri,width:w,height:h}:uri;
  }
  let ratio=Math.min(1,maxEdge/Math.max(w,h)),uri;
  const canvas=document.createElement('canvas');
  do{
   canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
   const context=canvas.getContext('2d');if(!context)throw Error('Браузер не поддерживает обработку картинок');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
   // PDF supports PNG/JPEG. Keep real transparency, but avoid inflating opaque WebP photos into PNG.
   let transparent=false;
   if(type!=='image/jpeg'){const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<255){transparent=true;break}}
   if(transparent)uri=canvas.toDataURL('image/png');
   else{
    const jpeg=canvas.toDataURL('image/jpeg',.82);
    const png=type==='image/jpeg'?'':canvas.toDataURL('image/png');
    uri=png&&png.length<=jpeg.length*1.1?png:jpeg;
   }
   if(!/^data:image\/(png|jpeg);base64,/.test(uri))throw Error('Не удалось подготовить картинку');
   ratio*=.8;
  }while(uri.length>maxData&&Math.max(canvas.width,canvas.height)>64);
  if(uri.length>maxData)throw Error('Картинка слишком сложная. Выберите файл поменьше.');
  return options.details?{image:uri,width:canvas.width,height:canvas.height}:uri;
 }finally{URL.revokeObjectURL(url)}
}
function imageEntries(project){
 const entries=[];
 const add=(owner,key,profile)=>{if(/^data:image\/(png|jpeg|webp);base64,/.test(owner?.[key]||''))entries.push({owner,key,profile})};
 add(project.team,'logo','logo');
 for(const key of ['selectionCards','teamCards','strategicPloys','firefightPloys','equipment','operatives'])for(const card of project[key]||[])add(card,'image',key==='operatives'?'operative':'card');
 for(const card of project.tokenCards||[])for(const token of card.tokens){add(token,'image','card');add(token,'symbolImage','card')}
 for(const page of project.lorePages||[])for(const img of page.images||[])add(img,'image',page.layout==='references'?'card':'page');
 return entries;
}
function imageFile(uri){const [header,body]=uri.split(','),bytes=Uint8Array.from(atob(body),char=>char.charCodeAt(0));return new Blob([bytes],{type:header.slice(5,-7)})}
async function shrinkProject(project,{isCurrent=()=>true,onProgress=()=>{},prepareImage=prepare}={}){
 const entries=imageEntries(project).map(entry=>({...entry,source:entry.owner[entry.key],crop:JSON.stringify(entry.owner.imageCrop||null)})),cache=new Map(),pending=[];
 let skipped=0;
 for(const [i,entry] of entries.entries()){
  if(!isCurrent())return {changed:0,saved:0,skipped,aborted:true};
  try{
   const profiles=cache.get(entry.source)||new Map();cache.set(entry.source,profiles);
   if(!profiles.has(entry.profile))profiles.set(entry.profile,await prepareImage(imageFile(entry.source),{profile:entry.profile,details:true}));
   const result=profiles.get(entry.profile);
   if(result.image.length<entry.source.length)pending.push({...entry,result});
  }catch{skipped++}
  onProgress(i+1,entries.length);
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(!isCurrent())return {changed:0,saved:0,skipped,aborted:true};
 // Apply only to images that have not been replaced, recropped or deleted while encoding.
 const current=imageEntries(project);let changed=0,saved=0;
 for(const entry of pending){
  const {owner,key,source,crop,result}=entry;
  if(owner[key]!==source||JSON.stringify(owner.imageCrop||null)!==crop||!current.some(item=>item.owner===owner&&item.key===key)){skipped++;continue}
  // Preserve tiny existing crop regions rather than rounding their framing away.
  if(owner.imageCrop&&(owner.imageCrop.width*result.width<1||owner.imageCrop.height*result.height<1)){skipped++;continue}
  owner[key]=result.image;
  if(key==='image'){owner.imageWidth=result.width;owner.imageHeight=result.height}
  saved+=source.length-result.image.length;changed++;
 }
 return {changed,saved,skipped,aborted:false};
}
root.KTOperativeImage={prepare,typeOf,MAX_FILE,MAX_DATA,PROFILES,imageEntries,shrinkProject};
if(typeof module!=='undefined')module.exports=root.KTOperativeImage;
})(typeof window!=='undefined'?window:globalThis);

(function(root){
'use strict';
const MAX_FILE=10*1024*1024,MAX_EDGE=960,MAX_DATA=360000;
function typeOf(bytes){
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return '';
}
async function prepare(file,options={}){
 const maxEdge=options.profile==='page'?2400:MAX_EDGE,maxData=options.profile==='page'?1500000:MAX_DATA;
 if(!file||!file.size)throw Error('Выберите изображение PNG, JPG или WebP');
 if(file.size>MAX_FILE)throw Error('Картинка больше 10 МБ. Выберите файл поменьше.');
 const type=typeOf(new Uint8Array(await file.slice(0,12).arrayBuffer()));
 if(!type)throw Error('Поддерживаются PNG, JPG и WebP');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Не удалось прочитать картинку')),20000);image.onload=()=>{clearTimeout(timer);resolve()};image.onerror=()=>{clearTimeout(timer);reject(Error('Не удалось прочитать картинку. Попробуйте другой файл.'))};image.src=url});
  const w=image.naturalWidth,h=image.naturalHeight;
  if(!w||!h||w*h>40000000)throw Error('Изображение слишком большое. Уменьшите его до 40 мегапикселей.');
  let ratio=Math.min(1,maxEdge/Math.max(w,h)),uri;
  const canvas=document.createElement('canvas');
  do{
   canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));
   const context=canvas.getContext('2d');if(!context)throw Error('Браузер не поддерживает обработку картинок');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
   // PNG preserves transparency; JPEG keeps photos compact. WebP becomes PNG for PDF compatibility.
   uri=canvas.toDataURL(type==='image/jpeg'?'image/jpeg':'image/png',.9);
   if(!/^data:image\/(png|jpeg);base64,/.test(uri))throw Error('Не удалось подготовить картинку');
   ratio*=.8;
  }while(uri.length>maxData&&Math.max(canvas.width,canvas.height)>128);
  if(uri.length>maxData)throw Error('Картинка слишком сложная. Выберите файл поменьше.');
  return options.details?{image:uri,width:canvas.width,height:canvas.height}:uri;
 }finally{URL.revokeObjectURL(url)}
}
root.KTOperativeImage={prepare,typeOf,MAX_FILE,MAX_DATA};
if(typeof module!=='undefined')module.exports=root.KTOperativeImage;
})(typeof window!=='undefined'?window:globalThis);

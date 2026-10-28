(function(root){
'use strict';
const defaults={name:'Мой D6',body:'#202b30',ink:'#ff8a24',logoColor:'#ff8a24',style:'pips',valueScale:100,logoFace:6,logoScale:65,tintLogo:false,sizeMm:16};
function projectDefaults(){return {...defaults,name:'Кубики команды',enabled:false,quantity:6};}
function resetDesign(settings){return {...settings,...defaults,name:settings.name};}
function validate(settings){
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||typeof settings.enabled!=='boolean'||
  typeof settings.name!=='string'||!settings.name.trim()||settings.name.length>120||/[\u0000-\u001f\u007f]/.test(settings.name)||
  !['body','ink'].every(key=>typeof settings[key]==='string'&&/^#[0-9a-f]{6}$/i.test(settings[key]))||
  !['pips','numbers'].includes(settings.style)||typeof settings.tintLogo!=='boolean')throw Error('Проверьте название и оформление кубиков команды');
 if(settings.logoColor!==undefined&&(typeof settings.logoColor!=='string'||!/^#[0-9a-f]{6}$/i.test(settings.logoColor)))throw Error('Проверьте цвет логотипа кубика');
 for(const [key,min,max] of [['quantity',1,24],['logoFace',0,6],['valueScale',30,200],['logoScale',30,200],['sizeMm',12,30]]){
  if(!Number.isInteger(settings[key])||settings[key]<min||settings[key]>max)throw Error('Проверьте количество, размер и масштаб кубиков команды');
 }
 return settings;
}
async function loadLogo(uri){
 if(!uri)return null;
 if(typeof uri!=='string'||uri.length>2000000||!/^data:image\/(png|jpeg);base64,[a-z0-9+/]+={0,2}$/i.test(uri))throw Error('Некорректный логотип кубика');
 const image=new Image();image.src=uri;await image.decode();
 if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw Error('Логотип слишком большой или повреждён');
 return image;
}
const pips={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
function drawFace(canvas,value,settings,logoImage){
 const ctx=canvas.getContext('2d'),size=canvas.width;
 ctx.clearRect(0,0,size,size);ctx.fillStyle=settings.body;ctx.fillRect(0,0,size,size);
 const shade=ctx.createLinearGradient(0,0,size,size);shade.addColorStop(0,'#ffffff09');shade.addColorStop(.5,'#00000000');shade.addColorStop(1,'#00000025');
 ctx.fillStyle=shade;ctx.fillRect(0,0,size,size);ctx.strokeStyle='#ffffff15';ctx.lineWidth=size*.008;ctx.strokeRect(size*.03,size*.03,size*.94,size*.94);ctx.fillStyle=settings.ink;
 if(value===settings.logoFace&&logoImage){
  const logo=document.createElement('canvas');logo.width=logo.height=size;
  const ink=logo.getContext('2d'),max=size*settings.logoScale/100,ratio=Math.min(max/logoImage.naturalWidth,max/logoImage.naturalHeight);
  const w=logoImage.naturalWidth*ratio,h=logoImage.naturalHeight*ratio;
  ink.drawImage(logoImage,(size-w)/2,(size-h)/2,w,h);
  if(settings.tintLogo){ink.globalCompositeOperation='source-in';ink.fillStyle=settings.logoColor||settings.ink;ink.fillRect(0,0,size,size);}
  ctx.drawImage(logo,0,0);
 }else if(settings.style==='numbers'){
  ctx.font='700 '+size*.58*settings.valueScale/100+'px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(value),size/2,size*.525);
 }else{
  for(const [x,y] of pips[value]){ctx.beginPath();ctx.arc(size*(.5+x*.245),size*(.5+y*.245),size*.067*settings.valueScale/100,0,Math.PI*2);ctx.fill();}
 }
}
function atlas(settings,logoImage){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;
 const ctx=canvas.getContext('2d'),cell=2048/3;ctx.fillStyle=settings.body;ctx.fillRect(0,0,2048,2048);
 // Native TTS D6 atlas: blank top row; 2,4,5; 1,3,6. Rotate 1 and 6.
 for(const [value,column,row,rotate] of [[2,0,1,0],[4,1,1,0],[5,2,1,0],[1,0,2,1],[3,1,2,0],[6,2,2,1]]){
  const face=document.createElement('canvas');face.width=face.height=768;drawFace(face,value,settings,logoImage);
  ctx.save();ctx.translate((column+.5)*cell,(row+.5)*cell);if(rotate)ctx.rotate(Math.PI);ctx.drawImage(face,-cell/2,-cell/2,cell,cell);ctx.restore();
 }
 return canvas;
}
root.KTDice={defaults,projectDefaults,resetDesign,validate,loadLogo,drawFace,atlas};
if(typeof module!=='undefined')module.exports=root.KTDice;
})(typeof window!=='undefined'?window:globalThis);

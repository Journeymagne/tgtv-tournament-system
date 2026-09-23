(function(root){
'use strict';
const Cards=root.KTCards||(typeof require!=='undefined'?require('./card-renderer.js'):null);
const LIGHT='assets/murderwing-page-light.jpg',DARK='assets/murderwing-page-dark.jpg';
const W=595.276,H=841.89;
function previewAssets(embedded={}){return Object.fromEntries([LIGHT,DARK].map(path=>[path,embedded[path]||path]))}
function svg(assets={},dark=false){
 const source=assets[dark?DARK:LIGHT];
 return '<rect width="'+W+'" height="'+H+'" fill="'+(dark?'#17191b':'#fff')+'"/>'+(source?'<image class="page-background" width="'+W+'" height="'+H+'" preserveAspectRatio="xMidYMid slice" xlink:href="'+Cards.esc(source)+'"/>':'');
}
root.KTPageBackground={LIGHT,DARK,W,H,paths:[LIGHT,DARK],previewAssets,svg};
if(typeof module!=='undefined')module.exports=root.KTPageBackground;
})(typeof window!=='undefined'?window:globalThis);

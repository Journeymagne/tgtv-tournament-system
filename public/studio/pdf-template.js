(function(root){
'use strict';
const Cards=root.KTCards||(typeof require!=='undefined'?require('./card-renderer.js'):null);
const Model=root.KTModel||(typeof require!=='undefined'?require('./model.js'):null);
const Lore=root.KTLore||(typeof require!=='undefined'?require('./lore-renderer.js'):null);
function buildTeamPDF(d,assets={},selection=null){
 d=Model.validate(Model.migrate(d));
 const loreOnly=selection?.section==='lorePages';
 const deck=loreOnly?[]:selection?Cards.renderCard(d[selection.section][selection.index],d,assets,selection.index):Cards.renderDeck(d,assets);
 const groups=[deck.filter(c=>['selection','recruitment','faction'].includes(c.kind)),...['strategic','firefight','equipment','operative'].map(kind=>deck.filter(c=>c.kind===kind))],content=[],W=595.276,H=841.89;
 let pages=0;
 for(const cards of groups)for(let i=0;i<cards.length;i+=4){
  const batch=cards.slice(i,i+4),landscape=batch[0].kind==='operative',cw=batch[0].width,ch=batch[0].height;
  const x0=(W-cw*(landscape?1:2))/2,y0=(H-ch*(landscape?4:2))/2,marks=[];
  content.push({text:' ',fontSize:1,margin:0,...(pages++?{pageBreak:'before'}:{})});
  batch.forEach((card,j)=>{
   const x=x0+(landscape?0:j%2*cw),y=y0+(landscape?j:Math.floor(j/2))*ch;
   content.push({svg:card.svg,width:cw,height:ch,absolutePosition:{x,y}});
   marks.push({type:'rect',x,y,w:cw,h:ch,lineWidth:.3,lineColor:'#666f66',dash:{length:1.5,space:2}});
   for(const px of [x,x+cw])for(const py of [y,y+ch])marks.push({type:'line',x1:px-3,y1:py,x2:px+3,y2:py,lineWidth:.3,lineColor:'#222'},{type:'line',x1:px,y1:py-3,x2:px,y2:py+3,lineWidth:.3,lineColor:'#222'});
  });
  content.push({canvas:marks,absolutePosition:{x:0,y:0}});
 }
 if(!selection||loreOnly)for(const page of Lore.renderAll(d,assets)){
  content.push({text:' ',fontSize:1,margin:0,...(pages++?{pageBreak:'before'}:{})});
  content.push({svg:page.svg,width:W,height:H,absolutePosition:{x:0,y:0}});
 }
 if(!content.length)content.push({text:loreOnly?'Добавьте страницу в разделе «Картинки и лор».':'No cards',margin:34});
 const unfilled=selection&&selection.section==='selectionCards'?d.selectionCards[selection.index].archetypes.filter(a=>!a.trim()).length:[...d.strategicPloys,...d.firefightPloys,...d.equipment].filter(c=>!c.name.trim()||!(c.body.trim()||c.weapons.length||c.abilities.length||c.actions.length)).length+d.selectionCards.reduce((n,c)=>n+c.archetypes.filter(a=>!a.trim()).length,0);
 return {pageSize:'A4',pageMargins:[0,0,0,18],defaultStyle:{font:'Roboto'},info:{title:d.team.name+(loreOnly?' / Pictures and lore':' / Printable cards')+' / v.'+d.team.version,author:'Kill Team Studio',subject:loreOnly?'Pictures and lore':'70 x 121 mm cards / '+(unfilled?'draft':'rules')},content,
 footer:(n,total)=>({text:d.team.name+' / '+(unfilled&&!loreOnly?'DRAFT: '+unfilled+' UNFILLED SLOTS / ':'')+'PRINT AT 100% / '+n+'-'+total,fontSize:6,color:'#899187',alignment:'center',margin:[0,6,0,0]})};
}
root.buildTeamPDF=buildTeamPDF;if(typeof module!=='undefined')module.exports={buildTeamPDF};
})(typeof window!=='undefined'?window:globalThis);

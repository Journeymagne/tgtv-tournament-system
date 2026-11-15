const test=require('node:test');
const assert=require('node:assert/strict');
const Model=require('../../public/studio/model');
const Page=require('../../public/studio/page-background');
const Lore=require('../../public/studio/lore-renderer');
const Cards=require('../../public/studio/card-renderer');
const {buildTeamPDF}=require('../../public/studio/pdf-template');
const LOGO='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const assets={[Page.LIGHT]:'data:image/jpeg;base64,bGlnaHQ=',[Page.DARK]:'data:image/jpeg;base64,ZGFyaw=='};
function project(){
 const d=Model.newProject('page-backgrounds','Page background test');d.team.logo=LOGO;
 d.teamCards.push({...Model.blank('faction','faction'),name:'Rule',body:'A rule.'});
 d.operatives.push({...Model.blank('operative','operative'),name:'OPERATIVE',stats:{APL:2,MOVE:'6″',SAVE:'4+',WOUNDS:8},keywords:[],loadouts:[]});
 d.lorePages.push({...Model.newLorePage('lore'),name:'Team lore',body:'The team history.'}, {...Model.newReferencePage('references'),images:[Model.referenceModel('photo',{name:'Miniature',image:LOGO,imageWidth:50,imageHeight:80})]});
 return d;
}
test('PDF sheets reuse the background and logo, retaining physical card sizes and clear trim areas',()=>{
 const data=project(),definition=buildTeamPDF(data,assets),deck=Cards.renderDeck(data,assets);
 let page=1,cardCount=0;
 for(const item of definition.content){
  if(item.pageBreak==='before')page++;
  if(!item.svg||item.width===Page.W)continue;
  cardCount++;
  const layers=definition.background(page).stack;
  assert.deepEqual(layers.map(l=>l.image),['studioPageBackground','studioPageLogo']);
  assert.equal(layers[0].width,Page.W);assert.equal(layers[0].height,Page.H);
  const logo=layers[1],card=item.absolutePosition;
  assert.deepEqual(logo.fit,[72,72]);assert.equal(logo.absolutePosition.x,16);assert.equal(logo.absolutePosition.y,20);
  assert(logo.absolutePosition.x+72<card.x-3,'logo must clear cards and trim marks');
  const source=deck.find(c=>c.svg===item.svg);assert(source);assert.equal(item.width,source.width);assert.equal(item.height,source.height);
 }
 assert.equal(cardCount,deck.length);assert.equal(definition.images.studioPageBackground,assets[Page.LIGHT]);assert.equal(definition.images.studioPageLogo,LOGO);
 assert.equal(definition.background(page),null,'reference sheets have their own dark background');
 assert.equal(definition.background(page-1),null,'lore sheets carry their own background');
});
test('lore and reference pages show the appropriate background and project logo on every continuation',()=>{
 const data=project();data.lorePages[0].body='History of this team.\n'.repeat(100);
 data.lorePages[1].images=Array.from({length:7},(_,i)=>({...data.lorePages[1].images[0],id:'model-'+i}));
 const light=Lore.renderPage(data.lorePages[0],data,assets),dark=Lore.renderPage(data.lorePages[1],data,assets);
 assert(light.length>1);assert.equal(dark.length,2);
 for(const [pages,source]of [[light,assets[Page.LIGHT]],[dark,assets[Page.DARK]]])for(const page of pages){
  assert(page.svg.includes(source));assert.equal((page.svg.match(/class="team-logo"/g)||[]).length,1);assert(page.svg.includes(LOGO));
 }
 const pdf=buildTeamPDF(data,assets,{section:'lorePages'});
 assert.deepEqual(pdf.content.filter(item=>item.svg).map(item=>item.svg),[...light,...dark].map(p=>p.svg));
});
test('a missing logo leaves no placeholder; selection-only export also has the page background',()=>{
 const data=project();data.team.logo='';
 const definition=buildTeamPDF(data,assets,{section:'selectionCards',index:0});
 assert.equal(definition.images.studioPageLogo,undefined);assert.equal(definition.background(1).stack.length,1);
 for(const page of Lore.renderAll(data,assets))assert(!page.svg.includes('class="team-logo"'));
 assert.equal(buildTeamPDF(data,{}, {section:'selectionCards',index:0}).background(1),null,'rendering without loaded assets remains supported');
});

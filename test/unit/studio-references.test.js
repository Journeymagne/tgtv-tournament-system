const test=require('node:test');
const assert=require('node:assert/strict');
const Model=require('../../public/studio/model');
const Lore=require('../../public/studio/lore-renderer');
const References=require('../../public/studio/reference-renderer');
const Image=require('../../public/studio/operative-image');
const {buildTeamPDF}=require('../../public/studio/pdf-template');
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function project(count=7){
 const data=Model.newProject('references','Reference team'),page=Model.newReferencePage('references');
 page.images=Array.from({length:count},(_,i)=>({...Model.referenceModel('model-'+i,{name:'MODEL '+i,image:PNG,imageWidth:400,imageHeight:600}),callouts:[{...Model.referenceCallout('weapon',0),text:'Weapon '+i}]}));
 data.lorePages.push(page);return Model.validate(data);
}
test('references survive project JSON/migration and old album layouts remain intact',()=>{
 const data=project();data.lorePages.unshift({...Model.newLorePage('old'),body:'Existing lore',images:[{id:'old-photo',image:PNG,caption:'Original caption'}]});
 const restored=Model.validate(Model.migrate(JSON.parse(JSON.stringify(data))));
 assert.deepEqual(restored.lorePages,data.lorePages);
 assert(Lore.renderPage(restored.lorePages[0],restored)[0].svg.includes('Original caption'));
 const source={name:'Operative',image:PNG,imageWidth:300,imageHeight:600,imageCrop:{x:0,y:0,width:.5,height:.5}};
 const copy=Model.referenceModel('copy',source);copy.modelName='Independent name';
 assert.equal(source.name,'Operative');assert.equal(copy.imageCrop,undefined,'full miniature is copied, not a header crop');
});
test('reference grid paginates in groups of six with bounded, non-overlapping cells and identical PDF output',()=>{
 for(const count of [0,1,6,7,40]){
  const data=project(count),pages=Lore.renderAll(data),boxes=pages.flatMap(p=>p.boxes);
  assert.equal(pages.length,Math.max(1,Math.ceil(count/6)));assert.equal(boxes.length,count);
  assert.deepEqual(boxes.map(b=>b.id),data.lorePages[0].images.map(m=>m.id));
  for(const page of pages)for(const [i,box]of page.boxes.entries()){
   assert(box.x>=0&&box.x+box.w<=page.width&&box.y>=0&&box.y+box.h<page.height-30);
   for(const other of page.boxes.slice(i+1))assert(box.x+box.w<=other.x||other.x+other.w<=box.x||box.y+box.h<=other.y||other.y+other.h<=box.y);
  }
  const pdf=buildTeamPDF(data,{}, {section:'lorePages'});
  assert.deepEqual(pdf.content.filter(c=>c.svg).map(c=>c.svg),pages.map(p=>p.svg));
 }
});
test('malformed callouts, external images and excessive models are rejected before saving/export',()=>{
 for(const change of [
  img=>img.callouts[0].x=-.1,img=>img.callouts[0].y=1.1,img=>img.callouts[0].x='50',
  img=>img.callouts[0].edge='middle',img=>img.callouts[0].align='center',img=>img.callouts[0].text='x'.repeat(81),
  img=>img.callouts.push({...img.callouts[0]}),img=>img.callouts=Array.from({length:5},(_,i)=>Model.referenceCallout(String(i),i)),
  img=>img.modelName='x'.repeat(81),img=>img.image='https://example.com/image.jpg'
 ]){const data=project(1);change(data.lorePages[0].images[0]);assert.throws(()=>Model.validate(data))}
 const data=project(40);data.lorePages[0].images.push({...data.lorePages[0].images[0],id:'extra'});assert.throws(()=>Model.validate(data));
});
test('callouts follow the contained image for portrait/landscape pictures and text is escaped',()=>{
 const data=project(1),model=data.lorePages[0].images[0];
 model.modelName='<script>name</script>';model.callouts[0].text='<weapon & ammo>';
 for(const [width,height]of [[400,1200],[1200,400]])for(const edge of ['top','bottom']){
  model.imageWidth=width;model.imageHeight=height;model.callouts=Array.from({length:4},(_,i)=>({...Model.referenceCallout('c'+i,i),text:i?('Name '+i):'<weapon & ammo>',edge}));
  const g=References.geometry(model);
  assert(g.x>=0&&g.y>=26&&g.x+g.w<=References.CW&&g.y+g.h<References.CH);
  assert(Math.abs(g.w/g.h-width/height)<1e-9);
  const svg=References.renderModel(model);assert(!svg.includes('<script>'));assert(svg.includes('&lt;weapon &amp; ammo&gt;'));
  assert.equal((svg.match(/class="reference-callout"/g)||[]).length,4);
 }
});
test('batch image optimization keeps reference metadata and target coordinates',async()=>{
 const data=project(1),before=structuredClone(data.lorePages[0].images[0]),profiles=[];
 const result=await Image.shrinkProject(data,{prepareImage:async(file,options)=>{profiles.push(options.profile);return {image:'data:image/png;base64,YQ==',width:100,height:150}}});
 assert.equal(result.changed,1);assert.deepEqual(profiles,['card']);
 assert.deepEqual(data.lorePages[0].images[0].callouts,before.callouts);assert.equal(data.lorePages[0].images[0].modelName,before.modelName);
 Model.validate(data);
});

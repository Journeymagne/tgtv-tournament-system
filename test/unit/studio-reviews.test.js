const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {setImmediate:nextTurn}=require('node:timers/promises');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../public/studio/reviews.js'),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
const decode=value=>String(value).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&amp;/g,'&');

function setup(existing){
 const listeners=new Map(),calls=[],started=deferred(),response=deferred();let currentVersion='2';
 const mine=existing?{id:'review',author:{id:7,name:'Reader'},body:'Published review',themeScore:1,balanceScore:2,loreScore:3,versionLabel:'1',previousVersion:true,canEdit:true,revision:1,createdAt:'2026-11-01',updatedAt:'2026-11-01'}:null;
 const status={textContent:'',classList:{add(){}},append(...nodes){this.nodes.push(...nodes)},nodes:[]};
 const host={dataset:{},contains:()=>true,form:null,
  set innerHTML(value){
   this.html=value;status.textContent='';status.nodes=[];this.form=null;
   const markup=/<form class="review-form">([\s\S]*?)<\/form>/.exec(value)?.[1];if(!markup)return;
   const elements={body:{value:decode(/<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(markup)?.[1]||'')}};
   for(const name of ['themeScore','balanceScore','loreScore'])elements[name]={value:/value="(\d)"[^>]*checked/.exec([...markup.matchAll(/<input[^>]+>/g)].map(match=>match[0]).filter(tag=>tag.includes('name="'+name+'"')).join(''))?.[1]||''};
   const checkbox=/<input[^>]*name="reevaluate"[^>]*>/.exec(markup)?.[0];if(checkbox)elements.reevaluate={checked:/\bchecked\b/.test(checkbox)};
   const nodes={
    '[data-review-submit]':{disabled:false},
    '[data-review-length]':{textContent:''},
    '[data-rated-version]':{textContent:decode(/<p data-rated-version>([^<]*)/.exec(markup)?.[1]||'')}
   };
   this.form={elements,matches:selector=>selector==='.review-form',closest:()=>this.form,querySelector:selector=>nodes[selector]||null};
  },
  get innerHTML(){return this.html},
  querySelector(selector){if(selector==='form.review-form')return this.form;if(selector==='textarea')return {focus(){}};if(selector==='[data-review-status]')return status;return null}
 };
 const document={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)},createElement:()=>({dataset:{}})};
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
 let sequence=0;
 const root={KTUI:{locale:()=> 'en'},KTCompanion:{session:async()=>({user:{id:7}}),serviceUrl:()=>'/tournament'},addEventListener(){}};
 const fetch=async(url,options={})=>{
  calls.push({url,...options,body:options.body?JSON.parse(options.body):undefined});
  if(options.method==='PATCH'||options.method==='POST'){started.resolve();return response.promise}
  let value;
  if(url==='/api/studio/session')value={csrfToken:'csrf'};
  else if(url==='/api/studio/review-preferences')value={notifications:true};
  else value={items:mine?[{...mine}]:[],myReview:mine?{...mine}:null,currentVersionLabel:currentVersion,canReview:true,
   ratingSummary:{count:mine?1:0,currentVersion:{versionLabel:currentVersion,count:0},overall:{count:0}}};
  return {ok:true,json:async()=>structuredClone(value)};
 };
 vm.runInNewContext(source,{window:root,document,fetch,KTCards:{esc},crypto:{randomUUID:()=>`request-${++sequence}`},confirm:()=>true,setTimeout,URL,navigator:{}});
 async function emit(type,target){for(const listener of listeners.get(type)||[])await listener({target,preventDefault(){}});await nextTurn()}
 function click(action){const target={dataset:{reviewAction:action},closest:selector=>selector==='[data-review-action]'?target:null};return emit('click',target)}
 function input(values){const form=host.form;for(const [key,value] of Object.entries(values)){assert(form.elements[key],`visible form control ${key} exists`);if(key==='reevaluate')form.elements[key].checked=value;else form.elements[key].value=String(value)}return emit('input',{closest:()=>form})}
 return {host,status,calls,started,root,click,input,emit,setVersion:version=>{currentVersion=version},setReviewRevision:revision=>{mine.revision=revision},setReviewVersion:version=>{mine.versionLabel=version;mine.previousVersion=version!==currentVersion},conflict:()=>response.resolve({ok:false,status:409,json:async()=>({error:'Publication version changed'})})};
}

for(const existing of [true,false])test(`review ${existing?'reassessment':'new form'} reconciles publication v2 to v3 while retaining its draft and requiring confirmation`,async()=>{
 const h=setup(existing);await h.root.KTReviews.open(h.host,{id:'publication'});await h.click('new');
 await h.input({body:'My unsaved detailed review',themeScore:5,balanceScore:4,loreScore:2,...(existing?{reevaluate:true}:{})});
 const submitting=h.emit('submit',h.host.form);await h.started.promise;
 const first=h.calls.find(row=>row.method==='PATCH'||row.method==='POST');
 assert.equal(first.body.versionLabel,'2');assert.equal(first.body.reevaluate,existing);
 h.setVersion('3');h.conflict();await submitting;await nextTurn();
 assert(h.status.nodes.some(node=>node?.dataset?.reviewAction==='reconcile'),'409 exposes draft-preserving reconciliation');
 await h.click('reconcile');
 assert.match(h.host.innerHTML,/Current version · 3/,'reconciliation refreshes publication metadata, including forms with no myReview');
 assert.equal(h.host.form.elements.body.value,'My unsaved detailed review');
 for(const [key,value] of Object.entries({themeScore:5,balanceScore:4,loreScore:2}))assert.equal(Number(h.host.form.elements[key].value),value);
 assert(h.host.form.elements.reevaluate,'the refreshed version has an explicit confirmation control');
 assert.equal(h.host.form.elements.reevaluate.checked,false,'approval to assess v2 never silently becomes approval for v3');
 assert.equal(h.host.form.querySelector('[data-review-submit]').disabled,true,'retained scores wait for confirmation of the refreshed version');
 assert.match(h.host.form.querySelector('[data-rated-version]').textContent,/3$/,'the refreshed target version is visible before confirmation');
 await h.emit('submit',h.host.form);
 assert.equal(h.calls.filter(row=>row.method==='PATCH'||row.method==='POST').length,1,'programmatic submit cannot bypass refreshed-version consent');
 await h.input({reevaluate:true});
 assert.match(h.host.form.querySelector('[data-rated-version]').textContent,/3$/,'confirmation targets the refreshed publication');
 assert.equal(h.host.form.querySelector('[data-review-submit]').disabled,false);
 await h.emit('submit',h.host.form);
 const attempts=h.calls.filter(row=>row.method==='PATCH'||row.method==='POST');
 assert.equal(attempts.length,2);assert.equal(attempts[1].body.versionLabel,'3');assert.equal(attempts[1].body.reevaluate,true);
 assert.equal(attempts[1].body.body,'My unsaved detailed review');
 assert.deepEqual([attempts[1].body.themeScore,attempts[1].body.balanceScore,attempts[1].body.loreScore],[5,4,2]);
});

test('review revision-only reconciliation keeps its version consent and can retry retained draft',async()=>{
 const h=setup(true);await h.root.KTReviews.open(h.host,{id:'publication'});await h.click('new');
 await h.input({body:'Retained reassessment',themeScore:5,balanceScore:4,loreScore:2,reevaluate:true});
 const submitting=h.emit('submit',h.host.form);await h.started.promise;h.setReviewRevision(2);h.conflict();await submitting;await nextTurn();
 await h.click('reconcile');assert.equal(h.host.form.elements.reevaluate.checked,true);
 assert.equal(h.host.form.querySelector('[data-review-submit]').disabled,false);
 await h.emit('submit',h.host.form);const attempts=h.calls.filter(row=>row.method==='PATCH');
 assert.equal(attempts.length,2);assert.equal(attempts[1].body.revision,2);assert.equal(attempts[1].body.versionLabel,'2');
 assert.equal(attempts[1].body.body,'Retained reassessment');assert.equal(attempts[1].body.reevaluate,true);
});

test('historical review reconciliation requires consent when another tab moves the review target to the unchanged current version',async()=>{
 const h=setup(true);await h.root.KTReviews.open(h.host,{id:'publication'});await h.click('new');
 await h.input({body:'Retained historical v1 text',themeScore:4,balanceScore:3,loreScore:5,reevaluate:false});
 assert.match(h.host.form.querySelector('[data-rated-version]').textContent,/1$/,'the draft is explicitly editing historical v1');
 const submitting=h.emit('submit',h.host.form);await h.started.promise;
 const first=h.calls.find(row=>row.method==='PATCH');assert.equal(first.body.reevaluate,false);
 // Tab B reassesses the same review to publication v2. The publication itself
 // remains v2; only the saved review's rating target and revision have changed.
 h.setReviewVersion('2');h.setReviewRevision(2);h.conflict();await submitting;await nextTurn();
 await h.click('reconcile');
 assert.equal(h.host.form.elements.body.value,'Retained historical v1 text');
 for(const [key,value] of Object.entries({themeScore:4,balanceScore:3,loreScore:5}))assert.equal(Number(h.host.form.elements[key].value),value);
 assert.equal(h.host.form.querySelector('[data-review-submit]').disabled,true,'historical scores must not silently become scores for the newer saved review target');
 assert.match(h.host.form.querySelector('[data-rated-version]').textContent,/2$/,'the changed target is visible before confirming it');
 assert(h.host.form.elements.reevaluate,'target change offers explicit confirmation even though publication metadata did not change');
 assert.equal(h.host.form.elements.reevaluate.checked,false);
 await h.emit('submit',h.host.form);assert.equal(h.calls.filter(row=>row.method==='PATCH').length,1);
 await h.input({reevaluate:true});assert.equal(h.host.form.querySelector('[data-review-submit]').disabled,false);
 await h.emit('submit',h.host.form);const attempts=h.calls.filter(row=>row.method==='PATCH');
 assert.equal(attempts.length,2);assert.equal(attempts[1].body.revision,2);assert.equal(attempts[1].body.versionLabel,'2');assert.equal(attempts[1].body.reevaluate,true);
 assert.equal(attempts[1].body.body,'Retained historical v1 text');
 assert.deepEqual([attempts[1].body.themeScore,attempts[1].body.balanceScore,attempts[1].body.loreScore],[4,3,5]);
});

test('historical review revision-only reconciliation can retry when its rating target is unchanged',async()=>{
 const h=setup(true);await h.root.KTReviews.open(h.host,{id:'publication'});await h.click('new');
 await h.input({body:'Historical v1 correction',themeScore:4,balanceScore:3,loreScore:5,reevaluate:false});
 const submitting=h.emit('submit',h.host.form);await h.started.promise;
 h.setReviewRevision(2);h.conflict();await submitting;await nextTurn();await h.click('reconcile');
 assert.match(h.host.form.querySelector('[data-rated-version]').textContent,/1$/);
 assert.equal(h.host.form.elements.reevaluate.checked,false);assert.equal(h.host.form.querySelector('[data-review-submit]').disabled,false);
 await h.emit('submit',h.host.form);const attempts=h.calls.filter(row=>row.method==='PATCH');
 assert.equal(attempts.length,2);assert.equal(attempts[1].body.revision,2);assert.equal(attempts[1].body.reevaluate,false);
 assert.equal(attempts[1].body.body,'Historical v1 correction');
});

const crypto=require('node:crypto');
const MarkdownIt=require('markdown-it');
const {HttpError,ValidationError}=require('../http/io');
const seed=require('../faq-data/seed.json');
const access=require('../db/repositories/access');
const {KILL_TEAMS}=require('../domain/kill-teams');
const fs=require('node:fs'),path=require('node:path');
const {PUBLIC_DIR}=require('../config');
const logos=fs.readdirSync(path.join(PUBLIC_DIR,'kill-team-logos')).filter(s=>s.endsWith('.webp')).map(s=>s.slice(0,-5));
const markdown=new MarkdownIt({html:false,linkify:false,breaks:true});
const categories=['community','official','conduct','info'];
const types=['RAW','Правка','Спор','Произвол','GW','Этикет'];
function canModerate(user){return Boolean(user&&(user.isAdmin||user.isSuperAdmin||user.isFAQModerator));}
function moderator(user){if(!canModerate(user))throw new HttpError(403,'FAQ Moderator rights required');}
function text(value,name,min,max){if(typeof value!=='string')throw new ValidationError(name+': expected text');const s=value.trim();if(s.length<min||s.length>max)throw new ValidationError(name+': '+min+'–'+max+' characters');return s;}
function validateImages(value=[]){
 if(!Array.isArray(value)||value.length>6)throw new ValidationError('Maximum 6 images');
 return value.map(v=>{
  const src=String(v?.src||'');
  if(/^\/faq\/source-images\/[a-z0-9-]+\.(png|jpg|webp)$/.test(src)&&fs.existsSync(path.join(PUBLIC_DIR,src)))return {src,caption:text(v.caption||'','Image caption',0,300)};
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if(!match)throw new ValidationError('Use an uploaded PNG, JPEG or WebP image');
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>400000)throw new ValidationError('Image exceeds 400 KB');
  const ok=match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
   match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(!ok)throw new ValidationError('Invalid image file');
  return {src,caption:text(v.caption||'','Image caption',0,300)};
 });
}
function content(body,{submission=false}={}){
 const category=submission?(['conduct','info'].includes(body.category)?body.category:'community'):body.category;if(!categories.includes(category))throw new ValidationError('Choose a FAQ section');
 const rulingType=body.rulingType||'RAW';if(!types.includes(rulingType))throw new ValidationError('Choose a ruling type');
 if(category==='official'&&rulingType!=='GW'||category==='conduct'&&rulingType!=='Этикет')throw new ValidationError('Ruling type does not match the section');
 const allowed=new Set(['Все команды',...KILL_TEAMS,...seed.entries.flatMap(x=>x.teams)]);
 if(!Array.isArray(body.teams)||!body.teams.length||body.teams.length>8||body.teams.some(t=>!allowed.has(t)))throw new ValidationError('Choose up to 8 kill teams');
 const sourceUrl=text(body.sourceUrl||'','Source URL',0,1000);
 if(sourceUrl){let u;try{u=new URL(sourceUrl);}catch{throw new ValidationError('Invalid source URL');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new ValidationError('Use an HTTP(S) source URL');}
 if(category==='official'&&!sourceUrl)throw new ValidationError('Official FAQ requires its source');
 return {category,rulingType,teams:[...new Set(body.teams)],question:text(body.question,'Question',3,1500),answer:text(body.answer||'','Answer',submission?0:1,30000),
  topic:text(body.topic||'Действия и способности','Topic',1,80),images:validateImages(body.images),sourceUrl,
  sourceLabel:text(body.sourceLabel||'TTS Community FAQ','Source label',1,150),sourceVersion:text(body.sourceVersion||'','Source version',0,50),
  sourceDate:body.sourceDate&&/^\d{4}-\d{2}-\d{2}$/.test(body.sourceDate)?body.sourceDate:null};
}
function view(row){return {id:row.id,...row.content,answerHtml:markdown.render(row.content.answer||''),revision:row.revision,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,questionCount:Number(row.question_count||0)};}
function submissionView(row){return {id:row.id,...row.content,entryId:row.entry_id,status:row.status,authorId:row.author_id,author:row.author||'Удалённый аккаунт',createdAt:row.created_at,resolution:row.resolution,resultEntryId:row.result_entry_id,decidedAt:row.decided_at};}
async function list({client,user}){
 const {rows}=await client.query(`SELECT e.*, (SELECT COUNT(*) FROM faq_questions q WHERE q.entry_id=e.id AND NOT q.hidden) question_count
 FROM faq_entries e WHERE e.status='published' ORDER BY e.created_at,e.id`);
 return {entries:rows.map(view),canModerate:canModerate(user),canManageRoles:!!user?.isSuperAdmin,
  teams:[...new Set(['Все команды',...KILL_TEAMS,...seed.entries.flatMap(e=>e.teams)])].sort((a,b)=>a.localeCompare(b)),logos,snapshot:seed.snapshot,communityVersion:seed.communityVersion,communitySource:seed.communitySource};
}
async function entry(client,id,lock=false){const {rows:[row]}=await client.query('SELECT * FROM faq_entries WHERE id=$1'+(lock?' FOR UPDATE':''),[id]);if(!row)throw new HttpError(404,'FAQ entry not found');return row;}
async function history(client,user,id,action,snapshot){await client.query('INSERT INTO faq_history(entry_id,actor_id,action,snapshot) VALUES($1,$2,$3,$4)',[id,user.id,action,JSON.stringify(snapshot)]);}
async function save({client,user,params,body}){
 moderator(user);let payload=content(body),id=params.id||crypto.randomUUID(),before=null;
 if(params.id){before=await entry(client,id,true);if(before.revision!==body.revision)throw new HttpError(409,'Эта карточка уже изменена. Откройте её заново.');
  // Retain source provenance when editing imported records.
  payload={...before.content,...payload};
  await client.query('UPDATE faq_entries SET content=$2,revision=revision+1,updated_by=$3,updated_at=NOW() WHERE id=$1',[id,JSON.stringify(payload),user.id]);
 }else await client.query('INSERT INTO faq_entries(id,content,created_by,updated_by) VALUES($1,$2,$3,$3)',[id,JSON.stringify(payload),user.id]);
 await history(client,user,id,before?'edited':'created',{before:before?.content,after:payload});return {entry:view(await entry(client,id))};
}
async function submissions({client,user}){
 const all=canModerate(user);const {rows}=await client.query(`SELECT s.*,u.name author FROM faq_submissions s LEFT JOIN users u ON u.id=s.author_id
 WHERE ($1::boolean OR s.author_id=$2) ORDER BY CASE WHEN s.status='pending' THEN 0 WHEN s.status='needs_changes' THEN 1 ELSE 2 END,s.created_at DESC LIMIT 200`,[all,user.id]);return {submissions:rows.map(submissionView)};
}
async function submit({client,user,body}){
 const data=content(body,{submission:true}),id=crypto.randomUUID();let entryId=null;
 if(body.entryId){const row=await entry(client,String(body.entryId));if(row.status!=='published')throw new HttpError(404,'FAQ entry not found');entryId=row.id;}
 const {rows:[limit]}=await client.query("SELECT count(*) n FROM faq_submissions WHERE author_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",[user.id]);
 if(Number(limit.n)>=10)throw new HttpError(429,'Можно отправить до 10 заявок в час.');
 await client.query('INSERT INTO faq_submissions(id,author_id,entry_id,content) VALUES($1,$2,$3,$4)',[id,user.id,entryId,JSON.stringify(data)]);return {status:201,body:{id}};
}
async function decide({client,user,params,body}){
 moderator(user);const {rows:[s]}=await client.query('SELECT * FROM faq_submissions WHERE id=$1 FOR UPDATE',[params.id]);if(!s)throw new HttpError(404,'Submission not found');
 if(s.status!=='pending')throw new HttpError(409,'Эта заявка уже рассмотрена.');
 if(!['accepted','rejected','needs_changes'].includes(body.status))throw new ValidationError('Choose a decision');
 const note=text(body.resolution||'','Moderator comment',body.status==='accepted'?0:3,2000);let resultId=null;
 if(body.status==='accepted'){
  const payload=content(body.entry);if(payload.category==='official')throw new ValidationError('Community submissions cannot publish as official GW answers');
  const original=s.entry_id?await entry(client,s.entry_id,true):null;
  if(original&&original.content.category!=='official'){const before=original;if(body.entry.revision!==before.revision)throw new HttpError(409,'Карточка изменилась. Откройте заявку заново.');
   resultId=s.entry_id;await client.query('UPDATE faq_entries SET content=$2,revision=revision+1,updated_by=$3,updated_at=NOW() WHERE id=$1',[resultId,JSON.stringify({...before.content,...payload}),user.id]);
   await history(client,user,resultId,'submission_accepted',{before:before.content,after:payload,submissionId:s.id});
  }else{resultId=crypto.randomUUID();await client.query('INSERT INTO faq_entries(id,content,created_by,updated_by) VALUES($1,$2,$3,$3)',[resultId,JSON.stringify(payload),user.id]);await history(client,user,resultId,'submission_accepted',{after:payload,submissionId:s.id});}
 }
 await client.query('UPDATE faq_submissions SET status=$2,resolution=$3,result_entry_id=$4,decided_by=$5,decided_at=NOW() WHERE id=$1',[s.id,body.status,note,resultId,user.id]);return {ok:true,entryId:resultId};
}
async function reviseSubmission({client,user,params,body}){
 const {rows:[s]}=await client.query('SELECT * FROM faq_submissions WHERE id=$1 FOR UPDATE',[params.id]);if(!s)throw new HttpError(404,'Submission not found');
 if(s.author_id!==user.id)throw new HttpError(403,'This is another account’s submission');if(s.status!=='needs_changes')throw new HttpError(409,'Заявка не ожидает правок.');
 const data=content(body,{submission:true});await client.query("UPDATE faq_submissions SET content=$2,status='pending',decided_at=NULL,decided_by=NULL WHERE id=$1",[s.id,JSON.stringify(data)]);return {ok:true};
}
async function questions({client,user,params}){
 const e=await entry(client,params.id);if(e.status!=='published'&&!canModerate(user))throw new HttpError(404,'FAQ entry not found');
 const {rows}=await client.query(`SELECT q.id,q.body,q.reply,q.created_at,q.replied_at,q.author_id,u.name author,m.name moderator
 FROM faq_questions q LEFT JOIN users u ON u.id=q.author_id LEFT JOIN users m ON m.id=q.replied_by
 WHERE q.entry_id=$1 AND NOT q.hidden ORDER BY q.created_at LIMIT 100`,[params.id]);return {questions:rows};
}
async function ask({client,user,params,body}){
 const e=await entry(client,params.id);if(e.status!=='published')throw new HttpError(404,'FAQ entry not found');
 const id=crypto.randomUUID(),s=text(body.body,'Question',3,2000);
 const {rows:[limit]}=await client.query("SELECT count(*) n FROM faq_questions WHERE author_id=$1 AND created_at>NOW()-INTERVAL '1 hour'",[user.id]);if(Number(limit.n)>=20)throw new HttpError(429,'Можно оставить до 20 вопросов в час.');
 await client.query('INSERT INTO faq_questions(id,entry_id,author_id,body) VALUES($1,$2,$3,$4)',[id,params.id,user.id,s]);return {status:201,body:{id}};
}
async function reply({client,user,params,body}){
 moderator(user);const message=text(body.reply,'Reply',3,5000);const {rowCount}=await client.query('UPDATE faq_questions SET reply=$2,replied_by=$3,replied_at=NOW() WHERE id=$1',[params.questionId,message,user.id]);if(!rowCount)throw new HttpError(404,'Question not found');return {ok:true};
}
async function moderators({client,user}){if(!user.isSuperAdmin)throw new HttpError(403,'Only the platform owner assigns FAQ Moderators');const {rows}=await client.query('SELECT id,name,is_faq_moderator FROM users ORDER BY name');return {users:rows};}
async function setModerator({client,user,params,body}){
 if(!user.isSuperAdmin)throw new HttpError(403,'Only the platform owner assigns FAQ Moderators');
 if(typeof body.enabled!=='boolean')throw new ValidationError('Invalid role');const id=Number(params.userId);if(!Number.isSafeInteger(id)||id<1)throw new ValidationError('Invalid account');
 const {rows:[before]}=await client.query('SELECT is_faq_moderator FROM users WHERE id=$1 FOR UPDATE',[id]);if(!before)throw new HttpError(404,'User not found');
 await client.query('UPDATE users SET is_faq_moderator=$2 WHERE id=$1',[id,body.enabled]);await access.audit(client,user,'faq_moderator_changed','user',id,{enabled:before.is_faq_moderator},{enabled:body.enabled});return {ok:true};
}
async function recordHistory({client,user,params}){moderator(user);await entry(client,params.id);const {rows}=await client.query('SELECT h.action,h.snapshot,h.created_at,u.name actor FROM faq_history h LEFT JOIN users u ON u.id=h.actor_id WHERE entry_id=$1 ORDER BY h.id DESC LIMIT 50',[params.id]);return {history:rows};}
const routes=[
 {method:'GET',path:'/api/faq',handler:list,loadUser:true},
 {method:'POST',path:'/api/faq/render',handler:({body})=>({html:markdown.render(text(body.markdown||'','Text',0,30000))}),tx:true,maxBodyBytes:100000},
 {method:'POST',path:'/api/faq/entries',handler:save,auth:'user',tx:true,maxBodyBytes:4000000},
 {method:'PATCH',path:'/api/faq/entries/:id',handler:save,auth:'user',tx:true,maxBodyBytes:4000000},
 {method:'GET',path:'/api/faq/entries/:id/history',handler:recordHistory,auth:'user'},
 {method:'GET',path:'/api/faq/submissions',handler:submissions,auth:'user'},
 {method:'POST',path:'/api/faq/submissions',handler:submit,auth:'user',tx:true,maxBodyBytes:4000000},
 {method:'PATCH',path:'/api/faq/submissions/:id',handler:reviseSubmission,auth:'user',tx:true,maxBodyBytes:4000000},
 {method:'POST',path:'/api/faq/submissions/:id/decision',handler:decide,auth:'user',tx:true,maxBodyBytes:4000000},
 {method:'GET',path:'/api/faq/entries/:id/questions',handler:questions,loadUser:true},
 {method:'POST',path:'/api/faq/entries/:id/questions',handler:ask,auth:'user',tx:true,maxBodyBytes:10000},
 {method:'PATCH',path:'/api/faq/questions/:questionId',handler:reply,auth:'user',tx:true,maxBodyBytes:30000},
 {method:'GET',path:'/api/faq/moderators',handler:moderators,auth:'user'},
 {method:'PATCH',path:'/api/faq/moderators/:userId',handler:setModerator,auth:'user',tx:true,maxBodyBytes:10000}
];
const safeRoutes=routes.map(route=>({...route,handler:context=>{
 const req=context.req;
 if(route.auth==='user'&&req.headers['x-faq-account']!==String(context.user.id))throw new HttpError(409,'Аккаунт Companion изменился. Обнови FAQ, чтобы продолжить.');
 if(['POST','PATCH','DELETE','PUT'].includes(route.method)){
  if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))throw new HttpError(415,'Use application/json');
  if(req.headers['sec-fetch-site']==='cross-site')throw new HttpError(403,'Cross-site requests are not allowed');
  if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin);}catch{throw new HttpError(403,'Invalid request origin');}if(origin.host!==req.headers.host)throw new HttpError(403,'Cross-site requests are not allowed');}
 }
 return route.handler(context);
}}));
module.exports={routes:safeRoutes,canModerate};

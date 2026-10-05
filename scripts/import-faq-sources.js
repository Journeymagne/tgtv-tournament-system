// node scripts/import-faq-sources.js work/faq/community-source.json <source-index.json>
// Raw Google Docs exports and expiring image URLs stay in ignored work/.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const flat=s=>String(s||'').replace(/[\r\v]/g,'').trim().replace(/\s+/g,' ');
function topic(s){
 if(/terrain|cover|кав[её]р|обскур|террейн|лестниц|руин|Chalnath|ITD|visibility|визиб|conceal|суперконсил|seek/i.test(s))return 'Террейн и видимость';
 if(/move|climb|jump|slicing|двиг|движ|мув|чардж|баз[ау]|траверс|charge|reposition/i.test(s))return 'Движение';
 if(/shoot|fight|damage|poison|toxic|devastating|dice|куб|стрельб|файт|урон|выстрел/i.test(s))return 'Атака и урон';
 if(/marker|token|маркер|бикон|токен|CP|КП/i.test(s))return 'Маркеры и ресурсы';
 return 'Действия и способности';
}
async function main(){
 const native=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),index=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const records=[],imageMap=new Map(),imageErrors=[];
 const sourceUrl='https://docs.google.com/document/d/12_kkWQiYa3cwUkZDG7UdnOf5i5P_WT5P3Db0SZItIwA/edit?tab=t.0';
 fs.mkdirSync(path.join(root,'public/faq/source-images'),{recursive:true});
 for(const [id,v] of Object.entries(native.inlineObjects||{})){
  const url=v.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri;if(!url)continue;
  try{const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer()),mime=r.headers.get('content-type')||'';
   const ext=mime.includes('png')?'png':mime.includes('webp')?'webp':mime.includes('jpeg')?'jpg':null;if(!ext||b.length>2000000)throw Error('Unsupported image');
   const name=crypto.createHash('sha256').update(b).digest('hex').slice(0,16)+'.'+ext;fs.writeFileSync(path.join(root,'public/faq/source-images',name),b);imageMap.set(id,'/faq/source-images/'+name);
  }catch(e){imageErrors.push({id,error:e.message});}
 }
 const paragraphs=native.body.content.filter(x=>x.paragraph).map(x=>({index:x.startIndex,heading:x.paragraph.paragraphStyle?.headingId,bullet:!!x.paragraph.bullet,
  text:flat(x.paragraph.elements.map(e=>e.textRun?.content||'').join('')),elements:x.paragraph.elements}));
 function md(p){let s=p.elements.map(e=>{if(e.inlineObjectElement){const url=imageMap.get(e.inlineObjectElement.inlineObjectId);return url?'\n\n![Иллюстрация из community FAQ]('+url+')\n\n':'';}
  const r=e.textRun;if(!r)return '';let t=r.content.replace(/[\r\v]/g,'').replace(/\n$/,'');if(!t.trim())return t;
  if(r.textStyle?.bold)t=t.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_,l,c,r)=>l+'**'+c+'**'+r);
  if(r.textStyle?.italic)t=t.replace(/^(\s*)([\s\S]*?)(\s*)$/,(_,l,c,r)=>l+'*'+c+'*'+r);
  return t;}).join('').trim();return p.bullet?'- '+s:s;}
 const aliases={Kasarkin:'Kasrkin','Vespid Stingwing':'Vespid Stingwings','Stealth Suits':'XV26 Stealth Battlesuits','Tempestus Aquillons':'Tempestus Aquilons'};
 const teams=new Set(index.documents.filter(d=>d.categories.includes('team-rules')).map(d=>d.title));
 let section='conduct',team='Все команды',current=null,n=0;
 function add(p,title,body,category,type){const r={id:'community-'+String(++n).padStart(3,'0'),category,rulingType:type,teams:[team],topic:category==='conduct'?'Этика и организация':topic(title+' '+body),question:title,answer:body,images:[],sourceLabel:'TTS Community FAQ · v1.7',sourceUrl:sourceUrl+(p.heading?'#heading='+p.heading:''),sourceVersion:'1.7',sourceDate:null,sourceSection:category==='conduct'?'Code of Conduct':'Community FAQ'};records.push(r);return r;}
 for(const p of paragraphs.filter(p=>p.index>=3240)){
  const t=p.text;if(!t&&!p.elements.some(e=>e.inlineObjectElement))continue;
  if(t==='Code Of Conduct'){current=null;continue;}
  if(t==='Направляющие принципы FAQ'){section='community';current=add(p,t,'','info','RAW');continue;}
  if(t==='Terrain'||t==='Правила Килл-тим'){team='Все команды';current=null;continue;}
  if(teams.has(t)||aliases[t]){team=aliases[t]||t;current=null;continue;}
  if(section==='conduct'&&p.bullet){add(p,t.length>90?t.slice(0,87)+'…':t,md(p).replace(/^- /,''),'conduct','Этикет');continue;}
  if(section==='conduct'&&['Основные правила:','Принципы:'].includes(t)){current=null;continue;}
  if(section==='conduct'&&p.index===3256){add(p,'Правила участия в турнирах',md(p),'conduct','Этикет');continue;}
  if(t==='Мантра против тильта:'){team='Все команды';current=add(p,'Мантра против тильта','','conduct','Этикет');continue;}
  const type=['RAW','Правка','Спор','Произвол'].find(type=>new RegExp('(?:\\s|^)'+type+'\\s*$').test(t));
  if(type||(section==='conduct'&&p.heading)){current=add(p,type?t.replace(new RegExp('\\s*'+type+'\\s*$'),'').trim():t,'',section,type||'Этикет');continue;}
  if(current)current.answer+=(current.answer?'\n\n':'')+md(p);
 }
 const official=[];
 for(const d of index.documents.filter(d=>d.categories.includes('team-rules'))){
  const chunks=fs.readFileSync(d.text,'utf8').replace(/\r/g,'').split(/--- PAGE (\d+) ---/);let k=0,lastHeading='';
  for(let i=1;i<chunks.length;i+=2){const page=Number(chunks[i]),body=chunks[i+1],h=/(?:PREVIOUS )?RULES COMMENTAR(?:IES|Y)(?: [A-Z]+ [’'\d]+)?/.exec(body);
   if(h)lastHeading=h[0];else if(!/^\s*Q:/.test(body))lastHeading='';if(!lastHeading)continue;
   const part=(h?body.slice(h.index+h[0].length):body).split(/(?:PREVIOUS )?ERRATAS/)[0];
   for(const m of part.matchAll(/(?:^|\n)\s*Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*?)(?=\n\s*Q:|$)/g)){
    const q=flat(m[1]),a=flat(m[2]).replace(/\s+\d+\s*$/,'').replace(/\s+[A-Z][A-Z &’-]+\s*»\s*[A-Z ]+\s*$/,'').trim();if(!q||!a)throw Error('Empty Q/A: '+d.title);
    const diagrams=/shown below|diagram|templates?|widening shape|TORCH ZONE|PIVOT POINT|3" MOVE/i.test(q+' '+a);
    const attachments=[];
    if(diagrams){const name='gw-'+path.basename(d.pdf,'.pdf')+'-'+page,file=path.join(root,'public/faq/source-images',name+'.png');
     if(!fs.existsSync(file))execFileSync('pdftoppm',['-f',String(page),'-l',String(page),'-scale-to','1400','-singlefile','-png',d.pdf,file.slice(0,-4)],{windowsHide:true});
     attachments.push({src:'/faq/source-images/'+name+'.png',caption:'Схемы из официального источника · PDF p. '+page});
    }
    const answer=a.replace(/\s+GEOMANCER 6" 6" GEOMANCER$/,'').replace(/\s+CENTRE PIVOT POINT FRONT\/BACK PIVOT POINT$/,'').replace(/\s+TORCH ZONE SWARMGUARD$/,'');
    official.push({id:'official-'+path.basename(d.pdf,'.pdf')+'-'+(++k),category:'official',rulingType:'GW',teams:[d.title==='Exodite Dragon Masters'?'Dragon Masters':d.title],sourceTeam:d.title,topic:topic(q+' '+answer),question:q,answer,images:attachments,sourceLabel:'Games Workshop · PDF p. '+page,sourceUrl:d.url+'#page='+page,sourceVersion:index.snapshot,sourceDate:d.last_updated.split('/').reverse().join('-'),sourcePage:page,sourceSection:lastHeading});
   }
  }
 }
 const data={snapshot:index.snapshot,communityVersion:'1.7',communitySource:sourceUrl,officialDocuments:48,importedAt:new Date().toISOString(),entries:[...records,...official]};
 fs.mkdirSync(path.join(root,'src/faq-data'),{recursive:true});fs.writeFileSync(path.join(root,'src/faq-data/seed.json'),JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify({community:records.filter(r=>r.category==='community').length,info:records.filter(r=>r.category==='info').length,conduct:records.filter(r=>r.category==='conduct').length,official:official.length,officialTeams:new Set(official.flatMap(x=>x.teams)).size,images:imageMap.size,imageErrors}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

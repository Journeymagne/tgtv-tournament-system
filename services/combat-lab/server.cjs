const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/)) {
 const m = line.match(/^([A-Z_]+)=(.*)$/); if(m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const catalog = () => JSON.parse(fs.readFileSync(path.join(root,'public/catalog.json'),'utf8'));
const referenceRoot = process.env.REFERENCE_DIR || 'C:/Users/Journeymagne/Documents/Kill Team References/Warhammer Community/2026-09-25';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.md':'text/markdown; charset=utf-8','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
function sendFile(res,file){fs.stat(file,(err,stat)=>{if(err || !stat.isFile()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});}
function api(req,res){const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({status:'ok',service:'Companion Combat Lab',upstream:'80760be900c72831dde9da53071510901af3ab95',snapshot:'2026-09-25',...catalog().counts}));return true;}
 if(pathname==='/api/catalog'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(catalog()));return true;}
 const m=pathname.match(/^\/library\/([a-z0-9-]+)\.pdf$/);
 if(m){if(!catalog().teams.some(t=>t.id===m[1])){res.writeHead(404);res.end();return true;}sendFile(res,path.join(referenceRoot,'pdfs/team-rules',m[1]+'.pdf'));return true;}
 return false;
}
if(require.main===module){
 const buildRoot=path.join(root,'build');if(!fs.existsSync(path.join(buildRoot,'index.html'))){console.error('Build missing. Run npm run build:demo first.');process.exit(1);}
 const host=process.env.HOST||'127.0.0.1';const port=Number(process.env.PORT||3000);
 http.createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}if(api(req,res))return;
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 const file=path.resolve(buildRoot,'.'+pathname);if(file!==buildRoot && !file.startsWith(buildRoot+path.sep)){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isFile())sendFile(res,file);else if(path.extname(pathname)){res.writeHead(404);res.end('Not found');}else sendFile(res,path.join(buildRoot,'index.html'));
 }).listen(port,host,()=>console.log(`Companion Combat Lab is running at http://${host}:${port} — local demo, no database`));
}
module.exports={api};

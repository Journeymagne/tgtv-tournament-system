const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const config = require('../src/config');
const { SERVICES, DEFAULT_PORTS } = require('../src/services/catalog');

async function startCluster({ gatewayEntry = 'server.js' } = {}) {
  const base = new URL(config.requireDatabaseUrl());
  const work = path.join(config.ROOT,'work'); fs.mkdirSync(work,{recursive:true});
  const children = [], info = [];
  const ports = new Set();
  for (const service of ['gateway',...SERVICES]) {
    const port = service === 'gateway' ? config.PORT : Number(process.env[service.toUpperCase()+'_PORT'] || DEFAULT_PORTS[service]);
    if (!Number.isInteger(port)||port<1||port>65535||ports.has(port)) throw Error('Invalid or duplicate service port: '+port);
    ports.add(port);
    if (!['gateway','calculators'].includes(service) && !process.env[service.toUpperCase()+'_DB_PASSWORD']) throw Error('Missing '+service.toUpperCase()+'_DB_PASSWORD');
    await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(Error('Port '+port+' for '+service+' is busy')));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
  }
  for (const service of ['gateway',...SERVICES]) {
    const port = service === 'gateway' ? config.PORT : Number(process.env[service.toUpperCase()+'_PORT'] || DEFAULT_PORTS[service]);
    const env = { ...process.env, SERVICE_NAME:service,PORT:String(port),HOST:'127.0.0.1',DATABASE_URL:'',TRUST_PROXY:service==='gateway'?'false':'true' };
    if (!['gateway','calculators'].includes(service)) {
      const password=process.env[service.toUpperCase()+'_DB_PASSWORD'];
      if (!password) throw Error('Missing '+service.toUpperCase()+'_DB_PASSWORD');
      const database=new URL(base);database.username='kt_'+service;database.password=password;env.DATABASE_URL=database.href;
    }
    for(const upstream of SERVICES)env[upstream.toUpperCase()+'_URL']='http://127.0.0.1:'+(process.env[upstream.toUpperCase()+'_PORT']||DEFAULT_PORTS[upstream]);
    const out=fs.openSync(path.join(work,service+'-'+port+'.out.log'),'a');
    const err=fs.openSync(path.join(work,service+'-'+port+'.err.log'),'a');
    const child=spawn(process.execPath,[service==='gateway'?gatewayEntry:'server.js'],{cwd:config.ROOT,env,stdio:['ignore',out,err],windowsHide:true});
    fs.closeSync(out);fs.closeSync(err);children.push(child);info.push({service,port,pid:child.pid});
  }
  fs.writeFileSync(path.join(work,'services-pids.json'),JSON.stringify({root:config.ROOT,supervisor:process.pid,services:info},null,2));
  let stopping=false;
  function stop(){if(stopping)return;stopping=true;for(const child of children)if(child.exitCode===null)child.kill();}
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  // A failed service stays failed; other children remain available for diagnosis.
  for(let i=0;i<children.length;i++)children[i].on('exit',code=>{if(!stopping)console.error(info[i].service+' exited ('+code+'); see work logs');});
  const ready=await Promise.all(info.map(async entry=>{
    for(let attempt=0;attempt<40;attempt++){
      try{const response=await fetch(`http://127.0.0.1:${entry.port}/health/ready`,{signal:AbortSignal.timeout(1000)});if(response.ok&&(await response.json()).service===entry.service)return{...entry,ready:true};}catch{}
      if(children[info.indexOf(entry)].exitCode!==null)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    return{...entry,ready:false};
  }));
  for(const entry of ready)console.log(entry.service+': '+(entry.ready?'ready':'unavailable')+' on '+entry.port);
  return { children,info,stop,ready };
}
if(require.main===module)startCluster().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={startCluster};

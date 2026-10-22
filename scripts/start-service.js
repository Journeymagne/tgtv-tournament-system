const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');if(fs.existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const {serviceName,DEFAULT_PORTS}=require('../src/services/catalog');
const service=serviceName(process.argv[2]);if(service==='monolith')throw Error('Choose a service name');
process.env.SERVICE_NAME=service;
process.env.PORT=process.env[service.toUpperCase()+'_PORT']||String(DEFAULT_PORTS[service]||process.env.PORT||3000);
if(['gateway','calculators'].includes(service))process.env.DATABASE_URL='';
else{
  const explicit=process.env[service.toUpperCase()+'_DATABASE_URL'];
  if(explicit)process.env.DATABASE_URL=explicit;
  else {const password=process.env[service.toUpperCase()+'_DB_PASSWORD'];if(!password)throw Error('Missing service database password');
    const database=new URL(process.env.DATABASE_URL);database.username='kt_'+service;database.password=password;process.env.DATABASE_URL=database.href;}
}
const app=require('../server');app.start().catch(error=>{console.error(error);process.exit(1);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.stop().then(()=>process.exit(0)).catch(()=>process.exit(1)));

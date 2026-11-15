const {api}=require('../server.cjs');
module.exports=function(app){app.use((req,res,next)=>{if(!api(req,res))next();});};

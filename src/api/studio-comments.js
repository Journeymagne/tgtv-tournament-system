const {HttpError}=require('../http/io');
const store=require('../db/repositories/studio-comments');
const {validation:{UUID,cursor,revision,text,read,write}}=require('./studio-reviews');
function sort(ctx){const value=ctx.query.get('sort')||'newest';if(!['newest','oldest'].includes(value))throw new HttpError(400,'Некорректная сортировка.');return value;}
const args=ctx=>[ctx.client,ctx.params.id,ctx.params.commentId,ctx.user];
module.exports={
  list:read(ctx=>store.list(ctx.client,ctx.params.id,ctx.user,cursor(ctx),sort(ctx))),
  replies:read(ctx=>store.replies(...args(ctx),cursor(ctx))),
  context:read(ctx=>store.context(...args(ctx))),
  create:write(ctx=>{
    if(!UUID.test(ctx.body.clientRequestId||'')||(ctx.body.replyToCommentId!=null&&!UUID.test(ctx.body.replyToCommentId)))throw new HttpError(400,'Некорректный идентификатор.');
    return store.create(ctx.client,ctx.params.id,ctx.user,{...ctx.body,body:text(ctx.body.body,2000)});
  }),
  update:write(ctx=>{revision(ctx.body);return store.change(...args(ctx),{...ctx.body,body:text(ctx.body.body,2000)})}),
  remove:write(ctx=>{revision(ctx.body);return store.change(...args(ctx),ctx.body,true)}),
  report:write(ctx=>{if(!['spam','abuse','other'].includes(ctx.body.reason)||typeof ctx.body.details!=='string'||ctx.body.details.length>500)throw new HttpError(400,'Проверьте причину жалобы.');return store.report(...args(ctx),ctx.body)}),
  adminList:read(ctx=>store.list(ctx.client,ctx.params.id,ctx.user,cursor(ctx),sort(ctx),true)),
  adminReplies:read(ctx=>store.replies(...args(ctx),cursor(ctx),true)),
  adminContext:read(ctx=>store.context(...args(ctx),true)),
  reports:read(ctx=>store.reports(ctx.client,cursor(ctx))),
  resolve:write(ctx=>store.resolve(ctx.client,ctx.params.reportId,ctx.user,text(ctx.body.reason,500))),
  moderate:write(ctx=>{revision(ctx.body);if(typeof ctx.body.hidden!=='boolean')throw new HttpError(400,'Некорректное действие.');return store.moderate(...args(ctx),{...ctx.body,reason:text(ctx.body.reason,500)})}),
  history:read(ctx=>store.history(ctx.client,ctx.params.id,ctx.params.commentId))
};

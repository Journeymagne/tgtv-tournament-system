const {randomUUID}=require('node:crypto');
const {HttpError}=require('../../http/io');
const reviews=require('./studio-reviews');
const visible='c.deleted_at IS NULL AND c.hidden_at IS NULL';
const select=`SELECT c.*,u.name AS author_name,u.avatar_version,
  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
  FROM studio_comments c LEFT JOIN users u ON u.id=c.author_id`;
const encode=row=>Buffer.from(JSON.stringify([row.cursor_time,row.id])).toString('base64url');
function view(row,user,team,admin=false){
  const available=!row.deleted_at&&!row.hidden_at;
  return {id:row.id,rootId:row.root_id,replyToId:row.reply_to_id,
    author:{id:row.author_id,name:row.author_name||'Удалённый пользователь',avatarVersion:row.avatar_version},
    isTeamAuthor:row.author_id===team.owner_id,body:available||(admin&&!row.deleted_at)?row.body:null,
    deleted:!!row.deleted_at,hidden:!!row.hidden_at,moderationReason:row.hidden_at?row.moderation_reason:'',
    versionLabel:row.version_label,previousVersion:row.publication_revision!==team.published_revision,
    createdAt:row.created_at,updatedAt:row.updated_at,revision:row.revision,
    canEdit:available&&user?.id===row.author_id&&!team.locked_at,
    canDelete:!row.deleted_at&&(user?.id===row.author_id||!!user?.isSuperAdmin),
    canReply:available&&!!user&&!team.locked_at};
}
async function counts(client,ids){
  if(!ids.length)return {};
  const {rows}=await client.query(`SELECT publication_id,count(*)::int AS count FROM studio_comments c
    WHERE publication_id=ANY($1::uuid[]) AND ${visible} GROUP BY publication_id`,[ids]);
  return Object.fromEntries(rows.map(row=>[row.publication_id,row.count]));
}
async function attachReplies(client,roots,user,team,admin){
  if(!roots.length)return [];
  const {rows}=await client.query(`SELECT * FROM (
    SELECT q.*,row_number() OVER(PARTITION BY root_id ORDER BY created_at,id) AS position,
      count(*) OVER(PARTITION BY root_id)::int AS total
    FROM (${select} WHERE c.root_id=ANY($1::uuid[]) AND ${admin?'c.deleted_at IS NULL':visible}) q
    ) ranked WHERE position<=3 ORDER BY created_at,id`,[roots.map(row=>row.id)]);
  return roots.map(root=>{
    const replies=rows.filter(row=>row.root_id===root.id);
    return {...view(root,user,team,admin),replies:replies.map(row=>view(row,user,team,admin)),
      replyCount:replies[0]?.total||0,repliesCursor:replies.length&&replies[0].total>replies.length?encode(replies.at(-1)):null};
  });
}
async function list(client,id,user,cursor,sort='newest',admin=false){
  const team=await reviews.publication(client,id),ascending=sort==='oldest';
  const {rows}=await client.query(`${select} WHERE c.publication_id=$1 AND c.root_id IS NULL
    AND (${admin?'c.deleted_at IS NULL':visible} OR EXISTS(SELECT 1 FROM studio_comments child
      WHERE child.root_id=c.id AND child.deleted_at IS NULL ${admin?'':'AND child.hidden_at IS NULL'}))
    AND ($2::timestamptz IS NULL OR (c.created_at,c.id)${ascending?'>':'<'}($2,$3::uuid))
    ORDER BY c.created_at ${ascending?'ASC':'DESC'},c.id ${ascending?'ASC':'DESC'} LIMIT 21`,[id,cursor?.[0]||null,cursor?.[1]||null]);
  return {items:await attachReplies(client,rows.slice(0,20),user,team,admin),nextCursor:rows.length>20?encode(rows[19]):null,
    count:(await counts(client,[id]))[id]||0,locked:!!team.locked_at,lockReason:team.lock_reason||'',
    canComment:!!user&&!team.locked_at,isModerator:!!user?.isAdmin};
}
async function find(client,id,commentId){
  const {rows:[row]}=await client.query(`${select} WHERE c.publication_id=$1 AND c.id=$2`,[id,commentId]);
  if(!row)throw new HttpError(404,'Комментарий недоступен.');
  return row;
}
async function replies(client,id,rootId,user,cursor,admin=false){
  const team=await reviews.publication(client,id),root=await find(client,id,rootId);
  if(root.root_id)throw new HttpError(400,'Укажите начало обсуждения.');
  const {rows}=await client.query(`${select} WHERE c.publication_id=$1 AND c.root_id=$2
    AND ${admin?'c.deleted_at IS NULL':visible}
    AND ($3::timestamptz IS NULL OR (c.created_at,c.id)>($3,$4::uuid)) ORDER BY c.created_at,c.id LIMIT 21`,[id,rootId,cursor?.[0]||null,cursor?.[1]||null]);
  return {items:rows.slice(0,20).map(row=>view(row,user,team,admin)),nextCursor:rows.length>20?encode(rows[19]):null};
}
async function context(client,id,commentId,user,admin=false){
  const team=await reviews.publication(client,id),row=await find(client,id,commentId);
  if(row.deleted_at||(!admin&&row.hidden_at))throw new HttpError(404,'Комментарий удалён или скрыт.');
  const root=row.root_id?await find(client,id,row.root_id):row;
  const [thread]=await attachReplies(client,[root],user,team,admin);
  // The selected reply may be outside the first page. It is added explicitly;
  // the normal reply cursor is retained so loading the middle never skips data.
  if(row.root_id&&!thread.replies.some(item=>item.id===row.id))thread.replies.push(view(row,user,team,admin));
  return {thread};
}
async function audit(client,row,user,action,reason=''){
  await client.query('INSERT INTO studio_comment_audit(comment_id,actor_id,action,snapshot,reason) VALUES($1,$2,$3,$4,$5)',[row.id,user.id,action,row,reason]);
}
async function retract(client,id){await client.query('DELETE FROM notification_inbox_items WHERE notification_id=$1',['studio_comment:'+id]);}
async function create(client,id,user,input){
  const team=await reviews.publication(client,id,true);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['studio-reviews-user:'+user.id]);
  const {rows:[retry]}=await client.query('SELECT id,publication_id FROM studio_comments WHERE author_id=$1 AND request_id=$2',[user.id,input.clientRequestId]);
  if(retry){if(retry.publication_id!==id)throw new HttpError(409,'Этот запрос уже использован.');return {id:retry.id,count:(await counts(client,[id]))[id]||0};}
  if(team.locked_at)throw new HttpError(403,'Обсуждение закрыто модератором.');
  const parent=input.replyToCommentId?await find(client,id,input.replyToCommentId):null;
  if(parent&&(parent.deleted_at||parent.hidden_at))throw new HttpError(409,'Комментарий удалён или скрыт. Выберите другой ответ.');
  const root=parent?.root_id?await find(client,id,parent.root_id):parent;
  await reviews.rate(client,user.id);
  const {rows:[row]}=await client.query(`INSERT INTO studio_comments
    (id,publication_id,author_id,root_id,reply_to_id,body,publication_revision,version_label,request_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[randomUUID(),id,user.id,root?.id||null,parent?.id||null,input.body,team.published_revision,team.version,input.clientRequestId]);
  await audit(client,row,user,'create');
  const recipients=[...new Set([team.owner_id,root?.author_id,parent?.author_id])].filter(value=>value&&value!==user.id);
  for(const recipient of recipients){
    const payload={id:'studio_comment:'+row.id,type:'studio_comment',commentId:row.id,createdAt:row.created_at,
      authorName:user.name,teamName:team.name,excerpt:row.body.slice(0,160),isReply:!!parent,
      href:'/studio#/library/'+id+'/discussion?comment='+row.id};
    await client.query(`INSERT INTO notification_inbox_items(user_id,notification_id,payload,created_at)
      SELECT $1,$2,$3,NOW() WHERE COALESCE((SELECT notifications FROM studio_review_preferences WHERE user_id=$1),TRUE)
      ON CONFLICT DO NOTHING`,[recipient,payload.id,payload]);
  }
  return {id:row.id,count:(await counts(client,[id]))[id]||0};
}
async function change(client,id,commentId,user,input,remove=false){
  const team=await reviews.publication(client,id,true),row=await find(client,id,commentId);
  if(row.deleted_at)throw new HttpError(404,'Комментарий удалён.');
  if(row.author_id!==user.id&&!(remove&&user.isSuperAdmin))throw new HttpError(403,'Можно изменять только свои комментарии.');
  if(!remove&&(team.locked_at||row.hidden_at))throw new HttpError(403,'Редактирование недоступно.');
  if(row.revision!==input.revision)throw new HttpError(409,'Комментарий изменён в другой вкладке. Обновите данные перед сохранением.');
  await reviews.rate(client,user.id);await audit(client,row,user,remove?'delete':'update');
  if(remove){await client.query('UPDATE studio_comments SET deleted_at=NOW(),updated_at=NOW(),revision=revision+1 WHERE id=$1',[commentId]);await retract(client,commentId);}
  else{
    await client.query('UPDATE studio_comments SET body=$2,updated_at=NOW(),revision=revision+1 WHERE id=$1',[commentId,input.body]);
    await client.query(`UPDATE notification_inbox_items SET payload=jsonb_set(payload,'{excerpt}',to_jsonb($2::text)) WHERE notification_id=$1`,['studio_comment:'+commentId,input.body.slice(0,160)]);
  }
  return {id:commentId,count:(await counts(client,[id]))[id]||0};
}
async function report(client,id,commentId,user,input){
  await reviews.publication(client,id,true);const row=await find(client,id,commentId);
  if(row.deleted_at||row.hidden_at)throw new HttpError(404,'Комментарий недоступен.');
  if(row.author_id===user.id)throw new HttpError(400,'Нельзя жаловаться на свой комментарий.');
  const {rows}=await client.query("SELECT id FROM studio_comment_reports WHERE comment_id=$1 AND reporter_id=$2 AND status='open'",[commentId,user.id]);
  if(rows.length)return {reported:true};
  await reviews.rate(client,user.id,true);
  await client.query('INSERT INTO studio_comment_reports(id,comment_id,reporter_id,reason,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),commentId,user.id,input.reason,input.details]);
  await audit(client,{id:commentId},user,'report');return {reported:true};
}
async function moderate(client,id,commentId,user,input){
  await reviews.publication(client,id,true);const row=await find(client,id,commentId);
  if(row.deleted_at)throw new HttpError(404,'Комментарий удалён.');
  if(row.revision!==input.revision)throw new HttpError(409,'Комментарий изменён. Обновите данные.');
  await audit(client,row,user,input.hidden?'hide':'restore',input.reason);
  await client.query('UPDATE studio_comments SET hidden_at=CASE WHEN $2 THEN NOW() ELSE NULL END,moderation_reason=$3,revision=revision+1 WHERE id=$1',[commentId,input.hidden,input.reason]);
  if(input.hidden){await retract(client,commentId);await client.query("UPDATE studio_comment_reports SET status='hidden',resolved_at=NOW(),resolved_by=$2,resolution=$3 WHERE comment_id=$1 AND status='open'",[commentId,user.id,input.reason]);}
  return {count:(await counts(client,[id]))[id]||0};
}
async function reports(client,cursor){
  const {rows}=await client.query(`SELECT q.*,c.publication_id,c.body,c.hidden_at,c.deleted_at,c.revision,
    p.published->'team'->>'name' AS team_name,u.name AS reporter_name,
    to_char(q.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
    FROM studio_comment_reports q JOIN studio_comments c ON c.id=q.comment_id
    JOIN studio_projects p USING(publication_id) LEFT JOIN users u ON u.id=q.reporter_id
    WHERE q.status='open' AND p.deleted_at IS NULL AND p.published IS NOT NULL
    AND ($1::timestamptz IS NULL OR (q.created_at,q.id)<($1,$2::uuid)) ORDER BY q.created_at DESC,q.id DESC LIMIT 21`,[cursor?.[0]||null,cursor?.[1]||null]);
  return {items:rows.slice(0,20),nextCursor:rows.length>20?encode(rows[19]):null};
}
async function resolve(client,reportId,user,reason){
  const {rows:[row]}=await client.query("UPDATE studio_comment_reports SET status='dismissed',resolved_at=NOW(),resolved_by=$2,resolution=$3 WHERE id=$1 AND status='open' RETURNING *",[reportId,user.id,reason]);
  if(!row)throw new HttpError(409,'Жалоба уже рассмотрена.');
  await audit(client,{id:row.comment_id,reportId},user,'dismiss_report',reason);return {resolved:true};
}
async function history(client,id,commentId){
  await reviews.publication(client,id);await find(client,id,commentId);
  const {rows}=await client.query('SELECT action,snapshot,reason,created_at,actor_id FROM studio_comment_audit WHERE comment_id=$1 ORDER BY id DESC LIMIT 100',[commentId]);
  return {items:rows};
}
module.exports={counts,list,replies,context,create,change,report,moderate,reports,resolve,history};

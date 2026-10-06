const { randomUUID } = require("node:crypto");
const { HttpError } = require("../../http/io");

const versionLabel = value => String(value||'').trim()||'1.0';
const emptySummary = () => ({ count: 0, themeAverage: null, balanceAverage: null, loreAverage: null, overallAverage: null, scope: "all_versions" });
async function summaries(client, ids) {
  const result = Object.fromEntries(ids.map(id => [id, emptySummary()]));
  if (!ids.length) return result;
  const { rows } = await client.query(`WITH ratings AS (
    SELECT p.publication_id,COALESCE(NULLIF(btrim(p.published->'team'->>'version'),''),'1.0') AS current_version,
      r.id AS review_id,v.version_label,v.theme_score,v.balance_score,v.lore_score FROM studio_projects p
      LEFT JOIN studio_reviews r ON r.publication_id=p.publication_id AND r.deleted_at IS NULL
        AND r.hidden_at IS NULL AND r.author_id<>p.owner_id
      LEFT JOIN studio_review_ratings v ON v.review_id=r.id
      WHERE p.publication_id=ANY($1::uuid[]) AND p.deleted_at IS NULL AND p.published IS NOT NULL
    ) SELECT publication_id,current_version,count(DISTINCT review_id)::int AS reviews,count(theme_score)::int AS count,
      avg(theme_score)::float8 AS theme,avg(balance_score)::float8 AS balance,avg(lore_score)::float8 AS lore,
      (avg(theme_score+balance_score+lore_score)/3)::float8 AS overall,
      count(theme_score) FILTER(WHERE version_label=current_version)::int AS current_count,
      (avg(theme_score) FILTER(WHERE version_label=current_version))::float8 AS current_theme,
      (avg(balance_score) FILTER(WHERE version_label=current_version))::float8 AS current_balance,
      (avg(lore_score) FILTER(WHERE version_label=current_version))::float8 AS current_lore,
      ((avg(theme_score+balance_score+lore_score) FILTER(WHERE version_label=current_version))/3)::float8 AS current_overall
      FROM ratings GROUP BY publication_id,current_version`, [ids]);
  for (const row of rows) {
    const overall={count:row.count,themeAverage:row.theme,balanceAverage:row.balance,loreAverage:row.lore,overallAverage:row.overall,scope:'all_versions'};
    result[row.publication_id]={...overall,count:row.reviews,overall,currentVersion:{count:row.current_count,
      versionLabel:row.current_version,themeAverage:row.current_theme,balanceAverage:row.current_balance,
      loreAverage:row.current_lore,overallAverage:row.current_overall,scope:'current_version'}};
  }
  return result;
}
async function publication(client, id, lock = false) {
  const { rows: [row] } = await client.query(`SELECT p.publication_id,p.owner_id,p.published_revision,
    p.published->'team'->>'version' AS version,p.published->'team'->>'name' AS name,
    NULL AS locked_at,'' AS lock_reason FROM studio_projects p
    WHERE p.publication_id=$1 AND p.deleted_at IS NULL AND p.published IS NOT NULL ${lock ? "FOR UPDATE OF p" : ""}`, [id]);
  if (!row) throw new HttpError(404, "Команда не найдена.");
  const {rows:[state]}=await client.query("SELECT locked_at,reason FROM studio_discussion_state WHERE publication_id=$1",[id]);
  if(state){row.locked_at=state.locked_at;row.lock_reason=state.reason;}
  row.version=versionLabel(row.version);
  return row;
}
const select = `SELECT r.*,to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
  u.name AS author_name,u.avatar_version,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('versionLabel',v.version_label,'themeScore',v.theme_score,
    'balanceScore',v.balance_score,'loreScore',v.lore_score,'updatedAt',v.updated_at) ORDER BY v.updated_at DESC),'[]'::jsonb)
    FROM studio_review_ratings v WHERE v.review_id=r.id) AS ratings
  FROM studio_reviews r JOIN users u ON u.id=r.author_id`;
function view(row, user, team, privileged = false) {
  const available = !row.deleted_at && !row.hidden_at && row.author_id !== team.owner_id;
  return { id: row.id, author: { id: row.author_id, name: row.author_name, avatarVersion: row.avatar_version },
    body: available || privileged ? row.body : null,
    themeScore: available || privileged ? row.theme_score : null,
    balanceScore: available || privileged ? row.balance_score : null,
    loreScore: available || privileged ? row.lore_score : null,
    versionLabel: row.version_label, publicationRevision: row.publication_revision,
    previousVersion: versionLabel(row.version_label) !== team.version,
    versionRatings: available || privileged ? row.ratings || [] : [],
    createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision,
    hidden: !!row.hidden_at, deleted: !!row.deleted_at,
    moderationReason: row.hidden_at ? row.moderation_reason : "",
    canEdit: available && user?.id === row.author_id && !team.locked_at,
    canDelete: !row.deleted_at && (!!user?.isSuperAdmin || (user?.id === row.author_id && !row.hidden_at)) };
}
const encodeCursor = row => Buffer.from(JSON.stringify([row.cursor_time, row.id])).toString("base64url");
async function list(client, id, user, cursor) {
  const team = await publication(client, id);
  const { rows } = await client.query(`${select} WHERE r.publication_id=$1 AND r.deleted_at IS NULL AND r.hidden_at IS NULL
    AND r.author_id<>$2 AND ($3::timestamptz IS NULL OR (r.created_at,r.id)<($3,$4::uuid))
    ORDER BY r.created_at DESC,r.id DESC LIMIT 21`, [id, team.owner_id, cursor?.[0] || null, cursor?.[1] || null]);
  const { rows: mine } = user ? await client.query(`${select} WHERE r.publication_id=$1 AND r.author_id=$2 AND r.deleted_at IS NULL`, [id, user.id]) : { rows: [] };
  return { items: rows.slice(0,20).map(row => view(row,user,team)), nextCursor: rows.length > 20 ? encodeCursor(rows[19]) : null,
    ratingSummary: (await summaries(client,[id]))[id], myReview: mine[0] ? view(mine[0],user,team) : null,
    locked: !!team.locked_at, lockReason: team.lock_reason || "", canReview: !!user && user.id !== team.owner_id && !team.locked_at && !mine.length,
    isOwner: user?.id === team.owner_id, isModerator: !!user?.isAdmin, publicationRevision: team.published_revision, currentVersionLabel:team.version };
}
async function get(client, id, reviewId, user, privileged = false) {
  const team = await publication(client,id);
  const { rows: [row] } = await client.query(`${select} WHERE r.publication_id=$1 AND r.id=$2`, [id,reviewId]);
  if (!row || (!privileged && (row.deleted_at || row.hidden_at || row.author_id === team.owner_id))) throw new HttpError(404,"Обзор недоступен.");
  return view(row,user,team,privileged);
}
async function audit(client, row, actor, action, reason = "") {
  await client.query("INSERT INTO studio_review_audit(review_id,actor_id,action,snapshot,reason) VALUES($1,$2,$3,$4,$5)", [row?.id || null,actor,action,row || null,reason]);
}
async function rate(client, actor, reporting = false) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["studio-reviews-user:"+actor]);
  const actions = reporting ? ["report"] : ["create","update","delete"];
  const { rows: [row] } = await client.query(`SELECT count(*)::int AS count,
    EXTRACT(EPOCH FROM (NOW()-MAX(created_at)))::float8 AS age FROM
    (SELECT actor_id,action,created_at FROM studio_review_audit UNION ALL
     SELECT actor_id,action,created_at FROM studio_comment_audit) activity
    WHERE actor_id=$1 AND action=ANY($2::text[]) AND created_at>NOW()-INTERVAL '1 hour'`,[actor,actions]);
  if (row.count >= (reporting ? 10 : 30) || (!reporting && row.age !== null && row.age < 10)) {
    const error = new HttpError(429,"Слишком часто. Подождите перед повторной отправкой.");
    error.headers = { "Retry-After": String(row.count >= (reporting ? 10 : 30) ? 3600 : Math.ceil(10-row.age)) };
    throw error;
  }
}
async function retractNotification(client, reviewId) {
  await client.query("DELETE FROM notification_inbox_items WHERE notification_id=$1",["studio_review:"+reviewId]);
}
async function saveRating(client,row){
  await client.query(`INSERT INTO studio_review_ratings(review_id,version_label,publication_revision,theme_score,balance_score,lore_score,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(review_id,version_label) DO UPDATE SET
    publication_revision=EXCLUDED.publication_revision,theme_score=EXCLUDED.theme_score,balance_score=EXCLUDED.balance_score,
    lore_score=EXCLUDED.lore_score,updated_at=EXCLUDED.updated_at`,
    [row.id,versionLabel(row.version_label),row.publication_revision,row.theme_score,row.balance_score,row.lore_score,row.updated_at]);
}
function checkVersion(input,team){
  if(input.versionLabel!==undefined&&input.versionLabel!==team.version)throw new HttpError(409,"Автор обновил версию команды. Обновите обзоры и оцените новую версию.");
}
async function create(client, id, user, input) {
  const team = await publication(client,id,true);
  if (team.owner_id === user.id) throw new HttpError(403,"Нельзя оценивать собственную команду.");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["studio-reviews-user:"+user.id]);
  const { rows: [retry] } = await client.query("SELECT * FROM studio_reviews WHERE author_id=$1 AND request_id=$2",[user.id,input.clientRequestId]);
  if (retry) {
    if (retry.publication_id!==id) throw new HttpError(409,"Этот запрос уже использован.");
    return { id: retry.id, ratingSummary: (await summaries(client,[id]))[id] };
  }
  if (team.locked_at) throw new HttpError(403,"Обсуждение закрыто модератором.");
  checkVersion(input,team);
  const { rows: existing } = await client.query("SELECT id FROM studio_reviews WHERE publication_id=$1 AND author_id=$2 AND deleted_at IS NULL",[id,user.id]);
  if (existing.length) throw new HttpError(409,"Вы уже написали обзор этой команды.");
  await rate(client,user.id);
  const { rows: [row] } = await client.query(`INSERT INTO studio_reviews
    (id,publication_id,author_id,body,theme_score,balance_score,lore_score,publication_revision,version_label,request_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [randomUUID(),id,user.id,input.body,input.themeScore,input.balanceScore,input.loreScore,team.published_revision,team.version||"1.0",input.clientRequestId]);
  await audit(client,row,user.id,"create");
  await saveRating(client,row);
  const payload = { id: "studio_review:"+row.id, type:"studio_review", createdAt:row.created_at,
    authorName:user.name, teamName:team.name, href:"/studio#/library/"+id+"/reviews?review="+row.id };
  await client.query(`INSERT INTO notification_inbox_items(user_id,notification_id,payload,created_at)
    SELECT $1,$2,$3,NOW() WHERE COALESCE((SELECT notifications FROM studio_review_preferences WHERE user_id=$1),TRUE)
    ON CONFLICT DO NOTHING`,[team.owner_id,payload.id,payload]);
  return { id:row.id, ratingSummary:(await summaries(client,[id]))[id] };
}
async function change(client,id,reviewId,user,input,remove = false) {
  const team = await publication(client,id,true);
  const { rows: [row] } = await client.query("SELECT * FROM studio_reviews WHERE publication_id=$1 AND id=$2 FOR UPDATE",[id,reviewId]);
  if (!row || row.deleted_at) throw new HttpError(404,"Обзор недоступен.");
  const superDelete = remove && user.isSuperAdmin;
  if (row.author_id!==user.id && !superDelete) throw new HttpError(403,"Можно изменять только собственный обзор.");
  if (row.hidden_at && !superDelete) throw new HttpError(403,"Обзор скрыт модератором. Дождитесь решения.");
  if (!remove && (team.owner_id===user.id || team.locked_at)) throw new HttpError(403,"Редактирование недоступно.");
  if (row.revision!==input.revision) throw new HttpError(409,"Обзор изменён в другой вкладке. Обновите данные перед сохранением.");
  await rate(client,user.id);
  await audit(client,row,user.id,remove ? "delete" : "update");
  if (remove) {
    await client.query("UPDATE studio_reviews SET deleted_at=NOW(),revision=revision+1,updated_at=NOW() WHERE id=$1",[reviewId]);
    await retractNotification(client,reviewId);
  } else {
    if(input.reevaluate)checkVersion(input,team);
    const {rows:[updated]}=await client.query(`UPDATE studio_reviews SET body=$2,theme_score=$3,balance_score=$4,lore_score=$5,
      publication_revision=$6,version_label=$7,revision=revision+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [reviewId,input.body,input.themeScore,input.balanceScore,input.loreScore,input.reevaluate ? team.published_revision : row.publication_revision,input.reevaluate ? team.version : row.version_label]);
    await saveRating(client,updated);
  }
  return { id:reviewId,ratingSummary:(await summaries(client,[id]))[id] };
}
async function report(client,id,reviewId,user,input) {
  await publication(client,id,true);
  const review = await get(client,id,reviewId,user);
  if (review.author.id===user.id) throw new HttpError(400,"Нельзя жаловаться на свой обзор.");
  const { rows: existing } = await client.query("SELECT id FROM studio_review_reports WHERE review_id=$1 AND reporter_id=$2 AND status='open'",[reviewId,user.id]);
  if (existing.length) return { reported:true };
  await rate(client,user.id,true);
  await client.query("INSERT INTO studio_review_reports(id,review_id,reporter_id,reason,details) VALUES($1,$2,$3,$4,$5)",[randomUUID(),reviewId,user.id,input.reason,input.details]);
  await audit(client,{id:reviewId},user.id,"report");
  return { reported:true };
}
async function moderate(client,id,reviewId,user,input) {
  await publication(client,id,true);
  const { rows:[row] } = await client.query("SELECT * FROM studio_reviews WHERE publication_id=$1 AND id=$2 FOR UPDATE",[id,reviewId]);
  if (!row || row.deleted_at) throw new HttpError(404,"Обзор недоступен.");
  if(row.revision!==input.revision) throw new HttpError(409,"Обзор изменён. Обновите данные.");
  await audit(client,row,user.id,input.hidden ? "hide" : "restore",input.reason);
  await client.query("UPDATE studio_reviews SET hidden_at=CASE WHEN $2 THEN NOW() ELSE NULL END,moderation_reason=$3,revision=revision+1 WHERE id=$1",[reviewId,input.hidden,input.reason]);
  if (input.hidden) {
    await retractNotification(client,reviewId);
    await client.query("UPDATE studio_review_reports SET status='hidden',resolved_at=NOW(),resolved_by=$2,resolution=$3 WHERE review_id=$1 AND status='open'",[reviewId,user.id,input.reason]);
  }
  return { ratingSummary:(await summaries(client,[id]))[id] };
}
async function adminList(client,id,user,cursor) {
  const team = await publication(client,id);
  const { rows } = await client.query(`${select} WHERE r.publication_id=$1 AND r.deleted_at IS NULL
    AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2,$3::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT 21`,[id,cursor?.[0]||null,cursor?.[1]||null]);
  return { items:rows.slice(0,20).map(row=>view(row,user,team,true)),nextCursor:rows.length>20?encodeCursor(rows[19]):null };
}
async function reports(client,cursor) {
  const {rows} = await client.query(`SELECT q.*,to_char(q.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,r.publication_id,r.body,r.hidden_at,r.deleted_at,r.revision,
    p.published->'team'->>'name' AS team_name,u.name AS reporter_name FROM studio_review_reports q
    JOIN studio_reviews r ON r.id=q.review_id JOIN studio_projects p USING(publication_id)
    LEFT JOIN users u ON u.id=q.reporter_id WHERE q.status='open' AND p.published IS NOT NULL AND p.deleted_at IS NULL
    AND ($1::timestamptz IS NULL OR (q.created_at,q.id)<($1,$2::uuid)) ORDER BY q.created_at DESC,q.id DESC LIMIT 21`,[cursor?.[0]||null,cursor?.[1]||null]);
  return { items:rows.slice(0,20),nextCursor:rows.length>20?encodeCursor(rows[19]):null };
}
async function resolve(client,reportId,user,reason) {
  const {rows:[row]}=await client.query("UPDATE studio_review_reports SET status='dismissed',resolved_at=NOW(),resolved_by=$2,resolution=$3 WHERE id=$1 AND status='open' RETURNING *",[reportId,user.id,reason]);
  if (!row) throw new HttpError(409,"Жалоба уже рассмотрена или недоступна.");
  await audit(client,{id:row.review_id,reportId},user.id,"dismiss_report",reason);
  return { resolved:true };
}
async function history(client,id,reviewId) {
  await get(client,id,reviewId,null,true);
  const {rows}=await client.query("SELECT action,snapshot,reason,created_at,actor_id FROM studio_review_audit WHERE review_id=$1 ORDER BY id DESC LIMIT 100",[reviewId]);
  return {items:rows};
}
async function lock(client,id,user,input) {
  await publication(client,id,true);
  await client.query(`INSERT INTO studio_discussion_state(publication_id,locked_at,locked_by,reason)
    VALUES($1,CASE WHEN $2 THEN NOW() ELSE NULL END,$3,$4) ON CONFLICT(publication_id)
    DO UPDATE SET locked_at=EXCLUDED.locked_at,locked_by=EXCLUDED.locked_by,reason=EXCLUDED.reason`,[id,input.locked,user.id,input.reason]);
  await audit(client,null,user.id,input.locked ? "lock" : "unlock",id+": "+input.reason);
  return {locked:input.locked};
}
async function preferences(client,user,enabled) {
  if (enabled!==undefined) await client.query("INSERT INTO studio_review_preferences(user_id,notifications) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET notifications=$2",[user.id,enabled]);
  const {rows:[row]}=await client.query("SELECT notifications FROM studio_review_preferences WHERE user_id=$1",[user.id]);
  return { notifications:row?.notifications ?? true };
}
module.exports={summaries,publication,list,get,create,change,report,moderate,adminList,reports,resolve,history,lock,preferences,rate};

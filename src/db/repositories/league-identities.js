const { buildEventContributions } = require('../../domain/leagues/event-contributions');
const { HttpError } = require('../../http/io');
const access = require('./access');

const PERSON = `p.id,p.user_id AS "userId",p.verified AS confirmed,p.merged_into_id AS "mergedIntoId",
  CASE WHEN u.id IS NULL THEN p.register_nickname ELSE u.register_nickname END AS "registerNickname",
  COALESCE(NULLIF(u.register_nickname,''),u.name,NULLIF(p.register_nickname,''),p.display_name) AS name`;

async function state(client,leagueId,tournamentIds) {
  const people=new Map(),byUser=new Map(),bySource=new Map(),recipients=new Map();
  if (!leagueId) return {people,byUser,bySource,recipients,bindings:[]};
  const {rows}=await client.query(`SELECT ${PERSON} FROM league_people p LEFT JOIN accounts.users u ON u.id=p.user_id
    WHERE p.league_id=$1`,[leagueId]);
  for (const p of rows) {
    people.set(p.id,p);
    if (p.userId) byUser.set(p.userId,p);
  }
  const aliases=await client.query('SELECT historical_user_id,person_id FROM league_person_accounts WHERE league_id=$1',[leagueId]);
  for (const a of aliases.rows) byUser.set(a.historical_user_id,people.get(a.person_id));
  const {rows:bindings}=await client.query(`SELECT source_key AS "sourceKey",person_id AS "personId",
    tournament_id AS "tournamentId",display_name AS name,manual FROM league_person_bindings
    WHERE league_id=$1 AND tournament_id=ANY($2) ORDER BY tournament_id,source_key`,[leagueId,tournamentIds]);
  for (const b of bindings) bySource.set(b.sourceKey,people.get(b.personId));
  const places=await client.query(`SELECT tournament_id,participant_id,person_id FROM league_place_recipients
    WHERE league_id=$1 AND tournament_id=ANY($2)`,[leagueId,tournamentIds]);
  for (const r of places.rows) recipients.set(`${r.tournament_id}:${r.participant_id}`,r.person_id);
  return {people,byUser,bySource,recipients,bindings};
}

// All sources for an account reuse one card. Identical guest names have distinct origin keys.
const INPUT = `SELECT s.*,u.id AS live_user_id,
  CASE WHEN s."userId" IS NULL THEN 'source:'||COALESCE(s."originKey",s."sourceKey") ELSE 'account:'||s."userId" END AS origin
  FROM jsonb_to_recordset($2::jsonb) AS s("sourceKey" text,"originKey" text,"tournamentId" int,"userId" int,
    "displayName" text,"registerNickname" text)
  LEFT JOIN accounts.users u ON u.id=s."userId"`;

async function sync(client,leagueId,bundles) {
  const identities=new Map();
  for (const bundle of bundles) {
    if (bundle.tournament.status!=='completed') continue;
    const facts=buildEventContributions(bundle);
    for (const item of facts.identities) identities.set(item.sourceKey,item);
  }
  if (!identities.size) return;
  const data=[leagueId,JSON.stringify([...identities.values()])];
  await client.query(`WITH src AS (${INPUT})
    INSERT INTO league_people(league_id,user_id,display_name,register_nickname,verified)
    SELECT DISTINCT $1::int,u.id,u.name,u.register_nickname,TRUE FROM src JOIN accounts.users u ON u.id=src.live_user_id
    ON CONFLICT (league_id,user_id) WHERE user_id IS NOT NULL DO UPDATE
    SET display_name=EXCLUDED.display_name,register_nickname=EXCLUDED.register_nickname,verified=TRUE
    WHERE (league_people.display_name,league_people.register_nickname) IS DISTINCT FROM
      (EXCLUDED.display_name,EXCLUDED.register_nickname)`,data);
  await client.query(`WITH src AS (${INPUT})
    INSERT INTO league_people(league_id,origin_key,display_name,register_nickname,verified)
    SELECT DISTINCT ON (s.origin) $1::int,s.origin,s."displayName",s."registerNickname",s."userId" IS NOT NULL
    FROM src s WHERE live_user_id IS NULL AND NOT EXISTS
      (SELECT 1 FROM league_person_accounts a WHERE a.league_id=$1 AND a.historical_user_id=s."userId")
      AND NOT EXISTS (SELECT 1 FROM league_person_bindings b JOIN league_people p ON p.id=b.person_id
        WHERE b.league_id=$1 AND b.source_key=s."sourceKey" AND (b.manual OR b.origin_key=s.origin
          OR (s."userId" IS NULL AND p.user_id IS NULL AND EXISTS
            (SELECT 1 FROM league_person_accounts a WHERE a.league_id=$1 AND a.person_id=p.id))))
    ORDER BY s.origin,s."sourceKey" ON CONFLICT (league_id,origin_key) DO NOTHING`,data);
  await client.query(`WITH src AS (${INPUT})
    INSERT INTO league_person_accounts(league_id,historical_user_id,person_id)
    SELECT DISTINCT $1::int,s."userId",COALESCE(account.id,guest.merged_into_id,guest.id)
    FROM src s LEFT JOIN league_people account ON account.league_id=$1 AND account.user_id=s.live_user_id
    LEFT JOIN league_people guest ON guest.league_id=$1 AND guest.origin_key=s.origin
    WHERE s."userId" IS NOT NULL AND COALESCE(account.id,guest.id) IS NOT NULL
    ON CONFLICT (league_id,historical_user_id) DO NOTHING`,data);
  await client.query(`WITH src AS (${INPUT})
    INSERT INTO league_person_bindings(league_id,source_key,origin_key,tournament_id,person_id,display_name)
    SELECT $1,s."sourceKey",s.origin,s."tournamentId",COALESCE(a.person_id,
      CASE WHEN old.manual OR old.origin_key=s.origin OR
        (s."userId" IS NULL AND prior.user_id IS NULL AND EXISTS
          (SELECT 1 FROM league_person_accounts alias WHERE alias.league_id=$1 AND alias.person_id=prior.id)) THEN old.person_id END,
      correction.person_id,guest.merged_into_id,guest.id),s."displayName"
    FROM src s LEFT JOIN league_person_accounts a ON a.league_id=$1 AND a.historical_user_id=s."userId"
    LEFT JOIN league_person_bindings old ON old.league_id=$1 AND old.source_key=s."sourceKey"
    LEFT JOIN league_people prior ON prior.id=old.person_id
    LEFT JOIN league_people guest ON guest.league_id=$1 AND guest.origin_key=s.origin
    LEFT JOIN LATERAL (SELECT min(b.person_id) AS person_id FROM league_person_bindings b
      WHERE b.league_id=$1 AND b.origin_key=s.origin AND b.manual AND s."userId" IS NULL
      HAVING count(DISTINCT b.person_id)=1) correction ON TRUE
    ON CONFLICT (league_id,source_key) DO UPDATE SET display_name=EXCLUDED.display_name,origin_key=EXCLUDED.origin_key,
      person_id=CASE WHEN league_person_bindings.manual THEN league_person_bindings.person_id ELSE EXCLUDED.person_id END
    WHERE (league_person_bindings.display_name,league_person_bindings.origin_key) IS DISTINCT FROM (EXCLUDED.display_name,EXCLUDED.origin_key)
      OR (NOT league_person_bindings.manual AND league_person_bindings.person_id<>EXCLUDED.person_id)`,data);
}

async function candidates(client,leagueId,q) {
  if (!q.trim()) return [];
  const {rows}=await client.query(`SELECT * FROM (
    SELECT p.id AS "personId",u.id AS "userId",COALESCE(NULLIF(u.register_nickname,''),u.name) AS name,
      u.name AS "displayName",u.register_nickname AS "registerNickname"
    FROM accounts.users u LEFT JOIN league_people p ON p.league_id=$1 AND p.user_id=u.id
    WHERE strpos(lower(COALESCE(u.register_nickname,'')),lower($2))>0 OR strpos(lower(u.name),lower($2))>0
    UNION ALL
    SELECT p.id,NULL,COALESCE(NULLIF(p.register_nickname,''),p.display_name),p.display_name,p.register_nickname
    FROM league_people p WHERE p.league_id=$1 AND p.user_id IS NULL AND p.merged_into_id IS NULL AND
      (strpos(lower(COALESCE(p.register_nickname,'')),lower($2))>0 OR strpos(lower(p.display_name),lower($2))>0)
    ) options ORDER BY lower(name)=lower($2) DESC,name,"personId","userId" LIMIT 30`,[leagueId,q.slice(0,120)]);
  return rows;
}

async function bind(client,leagueId,source,body,user) {
  const current=source.person;
  const choose=['personId','userId','registerNickname'].filter(k=>body[k]!=null);
  if (choose.length!==1) throw new HttpError(400,'Choose one registry card or account');
  const wantClaim=body.claimCard===true;
  if (wantClaim && (body.userId==null || (current.userId && current.userId!==body.userId))) {
    throw new HttpError(400,'Choose an unlinked registry card and an account to claim it');
  }
  let target;
  const integerId=value=>Number.isInteger(value) && value>0 && value<=2147483647;
  if (body.personId!=null) {
    if (!integerId(body.personId)) throw new HttpError(400,'Invalid registry card');
    const result=await client.query('SELECT id FROM league_people WHERE league_id=$1 AND id=$2 AND merged_into_id IS NULL',[leagueId,body.personId]);
    target=result.rows[0];
  } else if (body.userId!=null) {
    if (!integerId(body.userId)) throw new HttpError(400,'Invalid account');
    const {rows:[account]}=await client.query('SELECT id,name,register_nickname FROM accounts.users WHERE id=$1',[body.userId]);
    if (!account) throw new HttpError(404,'Account not found');
    const {rows:[existing]}=await client.query('SELECT id FROM league_people WHERE league_id=$1 AND user_id=$2',[leagueId,account.id]);
    if (existing) target=existing;
    else if (wantClaim) {
      await client.query(`UPDATE league_people SET user_id=$3,verified=TRUE,display_name=$4,register_nickname=$5
        WHERE league_id=$1 AND id=$2`,[leagueId,current.id,account.id,account.name,account.register_nickname]);
      target=current;
    } else {
      const result=await client.query(`INSERT INTO league_people(league_id,user_id,verified,display_name,register_nickname)
        VALUES ($1,$2,TRUE,$3,$4) RETURNING id`,[leagueId,account.id,account.name,account.register_nickname]);
      target=result.rows[0];
    }
  } else {
    const nickname=typeof body.registerNickname==='string' ? body.registerNickname.trim() : '';
    if (!nickname || nickname.length>120) throw new HttpError(400,'Enter a registry nickname of 1–120 characters');
    if (!current.userId && (!current.confirmed || current.registerNickname===nickname)) {
      await client.query('UPDATE league_people SET verified=TRUE,register_nickname=$3 WHERE league_id=$1 AND id=$2',[leagueId,current.id,nickname]);
      target=current;
    } else {
      const result=await client.query(`INSERT INTO league_people(league_id,verified,display_name,register_nickname)
        VALUES ($1,TRUE,$2,$3) RETURNING id`,[leagueId,source.name,nickname]);
      target=result.rows[0];
    }
  }
  if (!target) throw new HttpError(404,'Registry card not found in this league');
  if (body.userId!=null) {
    await client.query(`INSERT INTO league_person_accounts(league_id,historical_user_id,person_id) VALUES($1,$2,$3)
      ON CONFLICT (league_id,historical_user_id) DO NOTHING`,[leagueId,body.userId,target.id]);
  }
  // A claim explicitly moves the card's complete history. An ordinary correction changes only the selected performance.
  const changed=await client.query(`UPDATE league_person_bindings SET person_id=$3,manual=TRUE,confirmed_by=$4,confirmed_at=now()
    WHERE league_id=$1 AND person_id=$6 AND (source_key=ANY($2::text[]) OR $5) AND (person_id<>$3 OR NOT manual)
    RETURNING source_key`,[leagueId,source.appearanceKeys,target.id,user.id,wantClaim,current.id]);
  if (wantClaim && current.id!==target.id) {
    await client.query('UPDATE league_person_accounts SET person_id=$3 WHERE league_id=$1 AND person_id=$2',[leagueId,current.id,target.id]);
    await client.query('UPDATE league_people SET merged_into_id=$3 WHERE league_id=$1 AND (id=$2 OR merged_into_id=$2)',
      [leagueId,current.id,target.id]);
    await client.query('UPDATE league_place_recipients SET person_id=$3,confirmed_by=$4,confirmed_at=now() WHERE league_id=$1 AND person_id=$2',
      [leagueId,current.id,target.id,user.id]);
  }
  const cardChanged=(body.userId!=null && wantClaim && current.userId!==body.userId) ||
    (body.registerNickname!=null && current.id===target.id && (!current.confirmed || current.registerNickname!==body.registerNickname.trim()));
  if (!changed.rowCount && !cardChanged) return false;
  await access.audit(client,user,wantClaim?'league_card_claim':'league_binding','league',leagueId,
    {personId:current.id,userId:current.userId,registerNickname:current.registerNickname},
    {personId:target.id,sourceKey:source.sourceKey,userId:body.userId,registerNickname:body.registerNickname,affectedBindings:changed.rowCount});
  return true;
}

async function choosePlace(client,leagueId,tournamentId,participantId,personId,previous,user) {
  if (previous===personId) return false;
  await client.query(`INSERT INTO league_place_recipients(league_id,tournament_id,participant_id,person_id,confirmed_by)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT (league_id,tournament_id,participant_id) DO UPDATE
    SET person_id=EXCLUDED.person_id,confirmed_by=EXCLUDED.confirmed_by,confirmed_at=now()`,
  [leagueId,tournamentId,participantId,personId,user.id]);
  await access.audit(client,user,'league_place_recipient','league',leagueId,{personId:previous || null},
    {tournamentId,participantId,personId});
  return true;
}

module.exports={state,sync,candidates,bind,choosePlace};

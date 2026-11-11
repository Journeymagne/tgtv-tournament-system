import React,{useEffect,useState} from 'react';
import {View} from 'react-native';
import {api} from '../api/client';
import {Screen,Card,Button,TextField,Row,Label,Heading,Badge,Avatar,useDesign} from '../ui';
import type {ScreenProps} from '../types';
import {Choice,ConfirmAction,ResourceState,useResource,statusLabel} from './player-shared';
import {reference} from './reference';
import {readScoreDraft,writeScoreDraft,removeScoreDraft,ScoreDraft} from './score-drafts';


const fingerprint=(game:any)=>JSON.stringify({status:game.status,result:game.result,pendingResult:game.pendingResult});
function permissions(game:any,user:any) {
  const participant=Boolean(user&&(game.players||[]).some((p:any)=>(p.userId??p.id)===user.id&&!p.isProxy));
  return game.resultPermissions||{canSubmit:participant&&(game.status==='open'||game.status==='pending_confirmation'&&(game.sourceType==='tournament_match'||game.pendingResult?.submittedBy===user.id)),canReview:participant&&game.status==='pending_confirmation'&&game.pendingResult?.submittedBy!==user?.id};
}

export function GameScreen({route,navigate,session}:ScreenProps) {
  const {t}=useDesign();const id=route.params?.id;
  const resource=useResource(()=>api.game(id),String(id));
  const game:any=resource.data?.game, scores=game?.result?.scores||game?.pendingResult?.result?.scores, setup=game?.teamTournamentGame||game?.tournamentMatch||{};
  async function respond(action:'confirm'|'reject') {
    const {game:latest}=await api.game(id);
    if(fingerprint(latest)!==fingerprint(game)){resource.setData({game:latest});throw Object.assign(new Error(t('Результат изменился. Проверьте новый счёт.','The result changed. Review the new score.')),{status:409});}
    const next=action==='confirm'?await api.confirmResult(id):await api.rejectResult(id);
    resource.setData(next);navigate('game',{id});
  }
  return <Screen title={t('Моя игра','My game')}><ResourceState resource={resource}/>{game&&<><Card><Badge>{statusLabel(game.status,t)}</Badge><Heading>{game.tournament?.name||t('Турнирная игра','Tournament game')}</Heading><Row>{(game.players||[]).map((p:any)=><View key={p.id} style={{flex:1,minWidth:100,gap:8}}><Avatar name={p.name} uri={p.avatarUrl}/><Heading>{p.name}</Heading><Label muted>{p.faction||''}</Label><Label size={36}>{String(scores?.[p.id]?.total??'—')}</Label>{scores?.[p.id]&&<Label muted>Crit {scores[p.id].crit} · Kill {scores[p.id].kill} · Tac {scores[p.id].tac} · +{scores[p.id].primaryBonus}</Label>}</View>)}</Row><Label>{t('Раунд','Round')} {setup.roundNumber??'—'} · {t('Стол','Table')} {setup.table?.tableNumber??'—'}</Label><Label muted>{setup.mission?.critOp||t('Миссия не назначена','Mission not assigned')}</Label></Card>
    {permissions(game,session?.user).canSubmit&&<Button title={t('Внести результат','Enter result')} onPress={()=>navigate('score',{id})}/>}
    {permissions(game,session?.user).canReview&&<Card><Heading>{t('Подтверждение результата','Review result')}</Heading><ConfirmAction title={t('Подтвердить результат','Confirm result')} description={t('Подтвердить показанный счёт?','Confirm the displayed score?')} onConfirm={()=>respond('confirm')}/><ConfirmAction title={t('Вернуть на исправление','Request correction')} variant="danger" description={t('Отклонить предложенный результат?','Reject the submitted result?')} onConfirm={()=>respond('reject')}/></Card>}
    {game.tournament?.slug&&<><Button title={t('Открыть турнир','Open tournament')} variant="secondary" onPress={()=>navigate('tournament',{slug:game.tournament.slug})}/><Button title={t('Стол и миссия','Table and mission')} variant="secondary" onPress={()=>navigate('table',{slug:game.tournament.slug,tableId:setup.table?.id})}/></>}
    <Button title={t('Обновить','Refresh')} variant="secondary" onPress={resource.reload}/></>}</Screen>;
}

export function ScoreScreen(props:ScreenProps) {
  const {t}=useDesign();const resource=useResource(()=>api.game(props.route.params?.id),String(props.route.params?.id),false);
  return <Screen title={t('Ввод результата','Enter result')}><ResourceState resource={resource}/>{resource.data?.game&&<ScoreForm key={resource.data.game.id} {...props} game={resource.data.game}/>}</Screen>;
}

function ScoreForm({game,session,navigate}:ScreenProps&{game:any}) {
  const {t}=useDesign();const draftKey=`${session?.user?.id}:${game.id}:${fingerprint(game)}`;
  const initial=game.pendingResult?.result||game.result||{};
  const [scores,setScores]=useState<any>(()=>Object.fromEntries(game.players.map((p:any)=>[p.id,{crit:String(initial.scores?.[p.id]?.crit??''),kill:String(initial.scores?.[p.id]?.kill??''),tac:String(initial.scores?.[p.id]?.tac??''),primary:initial.scores?.[p.id]?.primary||'crit',faction:initial.scores?.[p.id]?.faction||p.faction||p.factions?.[0]||'',tacOp:initial.scores?.[p.id]?.tacOp||''}])));
  const setup=initial.killzone||game.teamTournamentGame?.mission||game.tournamentMatch?.mission||{};
  const [mission,setMission]=useState<any>(()=>setup);
  const [tie,setTie]=useState(Boolean(initial.tiebreakers?.enabled||game.tournament?.format==='single_elimination'));
  const [apl,setApl]=useState<any>(initial.tiebreakers?.apl||{}),[roll,setRoll]=useState(String(initial.tiebreakers?.rollOffWinnerId||''));
  const [review,setReview]=useState(false);
  const [savedDraft,setSavedDraft]=useState<ScoreDraft|null>(null),[draftLoaded,setDraftLoaded]=useState(false);
  const [draftWarning,setDraftWarning]=useState('');
  const allowed=permissions(game,session?.user).canSubmit;
  useEffect(()=>{let active=true;if(!allowed)return;void readScoreDraft(session.user.id,game.id).then(draft=>{if(!active)return;if(draft&&draft.revision===fingerprint(game))setSavedDraft(draft);else if(draft)setDraftWarning(t('Серверный результат изменился. Старый черновик не восстановлен.','The server result changed. The old draft was not restored.'));setDraftLoaded(true);});return()=>{active=false;};},[draftKey,allowed]);
  useEffect(()=>{if(!allowed||!draftLoaded||savedDraft)return;const timer=setTimeout(()=>{void writeScoreDraft(session.user.id,game.id,{revision:fingerprint(game),scores,mission,tie,apl,roll,updatedAt:Date.now()}).catch(()=>setDraftWarning(t('Не удалось сохранить черновик на устройстве.','Could not save the draft on this device.')));},400);return()=>clearTimeout(timer);},[draftKey,allowed,draftLoaded,savedDraft,scores,mission,tie,apl,roll]);
  if(!allowed)return <Card><Label>{t('Сейчас вы не можете изменять результат этой игры.','You cannot edit this game result now.')}</Label><Button title={t('К игре','Back to game')} onPress={()=>navigate('game',{id:game.id})}/></Card>;
  const update=(id:number,key:string,value:string)=>{setReview(false);setScores((old:any)=>({...old,[id]:{...old[id],[key]:value}}));};
  const valid=game.players.every((p:any)=>['crit','kill','tac'].every(k=>scores[p.id][k]!==''&&Number.isInteger(Number(scores[p.id][k]))&&Number(scores[p.id][k])>=0&&Number(scores[p.id][k])<=6));
  const total=(s:any)=>['crit','kill','tac'].reduce((n,k)=>n+Number(s[k]||0),0)+Math.ceil(Number(s[s.primary]||0)/2);
  async function submit() {
    const {game:latest}=await api.game(game.id);
    if(fingerprint(latest)!==fingerprint(game))throw Object.assign(new Error(t('Результат изменился. Вернитесь к игре и обновите данные.','The result changed. Return to the game and refresh it.')),{status:409});
    const payload:any={scores:Object.fromEntries(game.players.map((p:any)=>[p.id,{...scores[p.id],crit:Number(scores[p.id].crit),kill:Number(scores[p.id].kill),tac:Number(scores[p.id].tac)}])),killzone:{killzone:mission.killzone||'',critOp:mission.critOp||'',layout:mission.layout?Number(mission.layout):null},tiebreakers:{enabled:tie,apl:Object.fromEntries(game.players.map((p:any)=>[p.id,Number(apl[p.id]||0)])),rollOffWinnerId:roll?Number(roll):null}};
    await api.submitResult(game.id,payload);await removeScoreDraft(session.user.id,game.id);navigate('complete',{id:game.id});
  }
  return <>{savedDraft&&<Card><Heading>{t('Найден черновик','Draft found')}</Heading><Label>{t('Он сохранён только на этом устройстве и ещё не отправлен.','It is stored only on this device and has not been submitted.')}</Label><Button title={t('Восстановить черновик','Restore draft')} onPress={()=>{setScores(savedDraft.scores);setMission(savedDraft.mission);setTie(savedDraft.tie);setApl(savedDraft.apl);setRoll(savedDraft.roll);setSavedDraft(null);}}/><Button title={t('Начать заново','Start over')} variant="secondary" onPress={()=>setSavedDraft(null)}/></Card>}{Boolean(draftWarning)&&<Label>{draftWarning}</Label>}<Label muted>{t('Очки за каждую операцию: 0–6. Основной бонус считает сервер.','Each operation scores 0–6. The server calculates the primary bonus.')}</Label><Row>{game.players.map((p:any)=><View key={p.id} style={{flex:1,minWidth:250}}><Card><Heading>{p.name}</Heading><Row>{['crit','kill','tac'].map(k=><View key={k} style={{flex:1,minWidth:64}}><TextField label={k.toUpperCase()+' OP'} value={scores[p.id][k]} onChangeText={v=>update(p.id,k,v)} keyboardType="number-pad" maxLength={1}/></View>)}</Row><Choice label={t('Основная операция','Primary operation')} value={scores[p.id].primary} options={['crit','kill','tac'].map(k=>({value:k,label:k.toUpperCase()+' OP'}))} onChange={v=>update(p.id,'primary',v)}/><Choice label="Tac Op" value={scores[p.id].tacOp} options={[{value:'',label:t('Не указан','Not specified')},...reference.tacOpOptions]} onChange={v=>update(p.id,'tacOp',v)}/>{p.factions?.length?<Choice label={t('Фракция','Faction')} value={scores[p.id].faction} options={p.factions} onChange={v=>update(p.id,'faction',v)}/>:<Choice label={t('Фракция','Faction')} value={scores[p.id].faction} options={[{value:'',label:t('Не указана','Not specified')},...reference.killTeams]} onChange={v=>update(p.id,'faction',v)}/>}<Label size={24}>{t('Всего','Total')}: {valid?total(scores[p.id]):'—'}</Label></Card></View>)}</Row>
    <Card><Heading>{t('Миссия и поле','Mission and battlefield')}</Heading>{game.teamTournamentGame?.missionLocked?<Label>{setup.critOp} · {setup.killzone}</Label>:<><Choice label="Killzone" value={mission.killzone||''} options={[{value:'',label:t('Не указана','Not specified')},...reference.killzoneOptions]} onChange={v=>{setReview(false);setMission({...mission,killzone:v,layout:null});}}/><Choice label="Crit Op" value={mission.critOp||''} options={[{value:'',label:t('Не указана','Not specified')},...reference.critOpOptions]} onChange={v=>{setReview(false);setMission({...mission,critOp:v});}}/><TextField label={t('Номер расстановки','Layout number')} value={String(mission.layout||'')} keyboardType="number-pad" onChangeText={v=>{setReview(false);setMission({...mission,layout:v});}}/></>}</Card>
    {game.sourceType!=='team_match_game'&&<Card><Choice label={t('Тайбрейкеры при равном счёте','Tiebreakers for a tied score')} value={tie?'on':'off'} disabled={game.tournament?.format==='single_elimination'} options={[{value:'off',label:t('Ничья разрешена','Draw allowed')},{value:'on',label:t('Определить победителя','Determine winner')}]} onChange={v=>{setTie(v==='on');setReview(false);}}/>{tie&&<>{game.players.map((p:any)=><TextField key={p.id} label={'APL · '+p.name} value={String(apl[p.id]??'0')} keyboardType="number-pad" onChangeText={v=>{setApl({...apl,[p.id]:v});setReview(false);}}/>)}<Choice label={t('Победитель броска при полном равенстве','Roll-off winner if all tiebreakers are equal')} value={roll} options={[{value:'',label:t('Не выбран','Not selected')},...game.players.map((p:any)=>({value:String(p.id),label:p.name}))]} onChange={v=>{setRoll(v);setReview(false);}}/></>}</Card>}
    {!review?<Button title={t('Проверить результат','Review result')} disabled={!valid} onPress={()=>setReview(true)}/>:<Card><Heading>{t('Проверьте счёт','Check the score')}</Heading>{game.players.map((p:any)=><Label key={p.id}>{p.name}: {total(scores[p.id])}</Label>)}<Label muted>{t('После отправки сервер применит правила подтверждения этого турнира.','After submission the server applies this tournament’s confirmation rules.')}</Label><ConfirmAction title={t('Отправить результат','Submit result')} description={t('Отправить этот результат?','Submit this result?')} onConfirm={submit}/></Card>}
    <Button title={t('К игре','Back to game')} variant="secondary" onPress={()=>navigate('game',{id:game.id})}/></>;
}



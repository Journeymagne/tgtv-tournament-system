import React, {useEffect, useRef, useState} from 'react';
import {Image, Linking, View} from 'react-native';
import {api,assetUrl} from '../api/client';
import type {ScreenProps} from '../types';
import {Screen, Card, Button, TextField, Row, Grid, Label, Heading, Badge, Avatar, useDesign} from '../ui';
import {Choice, ConfirmAction, ErrorNotice, ResourceState, useResource, statusLabel, dateLabel} from './player-shared';
import {ScoreScreen, GameScreen} from './ScoreScreens';
import {TeamScreen, PairingScreen, RosterRegistration} from './TeamScreens';
import {reference} from './reference';
import {notificationCopy} from '../api/notification-copy';
import {CommunityScreen,communityRoutes} from './CommunityScreens';
import {clearScoreDrafts} from './score-drafts';

export const playerRoutes = ['welcome','login','onboarding','recovery','games','game','score','review','complete','tournaments','tournament','registration','roster-registration','participants','standings','schedule','team','pairing','table','notifications','profile','settings','account','english','states',...communityRoutes];

export function PlayerScreen(props:ScreenProps) {
  const {route} = props;
  if(communityRoutes.includes(route.name))return <CommunityScreen {...props}/>;
  switch(route.name) {
    case 'welcome':case 'login':case 'onboarding':case 'recovery':return <AuthScreen {...props}/>;
    case 'games':case 'english':return <GamesScreen {...props}/>;
    case 'game':case 'review':case 'complete':return <GameScreen {...props}/>;
    case 'score':return <ScoreScreen {...props}/>;
    case 'tournaments':return <TournamentsScreen {...props}/>;
    case 'tournament':case 'registration':case 'participants':case 'standings':case 'schedule':case 'table':return <TournamentScreen {...props}/>;
    case 'roster-registration':return <RosterRegistration {...props}/>;
    case 'team':return <TeamScreen {...props}/>;
    case 'pairing':return <PairingScreen {...props}/>;
    case 'notifications':return <NotificationsScreen {...props}/>;
    case 'profile':case 'account':case 'settings':return <ProfileScreen {...props}/>;
    default:return <TournamentsScreen {...props}/>;
  }
}

function AuthScreen({route,navigate,refreshSession}:ScreenProps) {
  const {t,locale} = useDesign();
  const [name,setName]=useState(''),[password,setPassword]=useState(''),[email,setEmail]=useState(''),[confirm,setConfirm]=useState(''),[telegram,setTelegram]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[sent,setSent]=useState(false);
  const lock=useRef(false), recovery=route.name==='recovery',register=route.name==='onboarding';
  async function submit() {
    if(lock.current)return;lock.current=true;setBusy(true);setError(null);
    try {
      if(recovery){await api.recovery(email.trim(),locale);setSent(true);}
      else {if(register)await api.register({name:name.trim(),password,confirmPassword:confirm,email:email.trim(),telegramContact:telegram.trim(),registerNickname:name.trim(),locale});else await api.login(name.trim(),password);setPassword('');setConfirm('');await refreshSession();navigate('games');}
    } catch(e){setError(e);}finally{lock.current=false;setBusy(false);}
  }
  return <Screen title={recovery?t('Восстановление доступа','Reset password'):register?t('Создать аккаунт','Create account'):t('Войти в компаньон','Sign in to Companion')}>
    <Card><Label muted>{t('Один аккаунт для сайта, приложения и турниров.','One account for the website, app and tournaments.')}</Label>
      {!recovery&&<TextField label={t('Имя или email','Name or email')} value={name} onChangeText={setName} autoCapitalize="none" autoComplete="username"/>}
      {(recovery||register)&&<TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"/>}
      {!recovery&&<TextField label={t('Пароль','Password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete={register?'new-password':'current-password'}/>}
      {register&&<><TextField label={t('Повторите пароль','Confirm password')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password"/><TextField label={t('Контакт в Telegram','Telegram contact')} value={telegram} onChangeText={setTelegram} autoCapitalize="none"/></>}
      <ErrorNotice error={error}/>{sent?<Label>{t('Если этот email связан с аккаунтом, письмо с инструкцией отправлено.','If this email belongs to an account, reset instructions have been sent.')}</Label>:<Button title={busy?t('Подождите…','Please wait…'):recovery?t('Отправить письмо','Send email'):register?t('Создать аккаунт','Create account'):t('Войти','Sign in')} onPress={submit} disabled={busy||(recovery?!email.trim():!name.trim()||!password)}/>} 
    </Card>
    {!recovery&&!register&&<><Button title={t('Забыли пароль?','Forgot password?')} variant="secondary" onPress={()=>navigate('recovery')}/><Button title={t('Создать аккаунт','Create account')} variant="secondary" onPress={()=>navigate('onboarding')}/></>}
    {(recovery||register)&&<Button title={t('Вернуться ко входу','Back to sign in')} variant="secondary" onPress={()=>navigate('login')}/>}
    <Button title={t('Смотреть турниры без входа','Browse tournaments as a guest')} variant="secondary" onPress={()=>navigate('tournaments')}/>
  </Screen>;
}

function RequireLogin({navigate}:ScreenProps) {const {t}=useDesign();return <Card><Heading>{t('Войдите в аккаунт','Sign in')}</Heading><Label muted>{t('Ваши игры, команды и уведомления привязаны к аккаунту.','Your games, teams and notifications belong to your account.')}</Label><Button title={t('Войти','Sign in')} onPress={()=>navigate('login')}/></Card>;}

function GamesScreen(props:ScreenProps) {
  const {session,navigate}=props,{t}=useDesign();
  const resource=useResource(()=>session?.user?api.me():Promise.resolve({user:null,games:[],teamPairings:[]}),String(session?.user?.id));
  const [filter,setFilter]=useState('active');
  const all=(resource.data?.games||[]).filter((g:any)=>g.tournament || ['tournament_match','team_match_game'].includes(g.sourceType));
  const games=all.filter((g:any)=>filter==='all'||!['completed','cancelled'].includes(g.status));
  return <Screen title={t('Мои игры','My games')}>
    {!session?.user?<RequireLogin {...props}/>:<><Row><Button title={t('Активные','Active')} variant={filter==='active'?'primary':'secondary'} onPress={()=>setFilter('active')}/><Button title={t('Все игры','All games')} variant={filter==='all'?'primary':'secondary'} onPress={()=>setFilter('all')}/></Row>
      <ResourceState resource={resource} empty={!resource.loading&&!games.length}/>
      <Grid>{games.map((g:any)=><GameCard key={g.id} game={g} onOpen={()=>navigate('game',{id:g.id})}/>)}</Grid>
      {(resource.data?.teamPairings||[]).map((pair:any)=><Card key={pair.id}><Heading>{pair.rosterA?.name || pair.tournamentName || t('Командный пейринг','Team pairing')}</Heading><Badge>{statusLabel(pair.phase,t)}</Badge><Button title={t('Открыть пейринг','Open pairing')} onPress={()=>navigate('pairing',{id:pair.id})}/></Card>)}
      <Button title={t('Обновить','Refresh')} variant="secondary" onPress={resource.reload} disabled={resource.loading}/></>}
  </Screen>;
}

export function GameCard({game,onOpen}:{game:any;onOpen:()=>void}) {
  const {t}=useDesign();const scores=game.result?.scores||game.pendingResult?.result?.scores;
  return <Card><Badge>{statusLabel(game.status,t)}</Badge><Label muted>{game.tournament?.name||t('Турнирная игра','Tournament game')}</Label><Row>{(game.players||[]).map((p:any)=><View key={p.id} style={{flex:1,minWidth:100,gap:8}}><Avatar name={p.name||p.displayName||'?'} uri={p.avatarUrl}/><Heading>{p.name||p.displayName}</Heading><Label muted>{p.faction||''}</Label><Label size={32}>{String(scores?.[p.id]?.total??'—')}</Label></View>)}</Row><Button title={t('Открыть игру','Open game')} onPress={onOpen}/></Card>;
}

function TournamentsScreen({navigate,session}:ScreenProps) {
  const {t,locale}=useDesign();const [query,setQuery]=useState(''),[scope,setScope]=useState('all'),[page,setPage]=useState(1);
  const resource=useResource(()=>api.tournaments({scope,page,pageSize:20}),`${scope}:${page}:${session?.user?.id}`);
  const list=(resource.data?.tournaments||[]).filter((x:any)=>x.name.toLowerCase().includes(query.toLowerCase()));
  return <Screen title={t('Турниры','Tournaments')}><TextField label={t('Поиск на странице','Search this page')} value={query} onChangeText={setQuery}/><Row><Button title={t('Все','All')} variant={scope==='all'?'primary':'secondary'} onPress={()=>{setScope('all');setPage(1);}}/>{session?.user&&<Button title={t('Мои','Mine')} variant={scope==='mine'?'primary':'secondary'} onPress={()=>{setScope('mine');setPage(1);}}/>}</Row><ResourceState resource={resource} empty={!resource.loading&&!list.length}/>
    <Grid>{list.map((event:any)=><Card key={event.id}><Badge>{statusLabel(event.status,t)}</Badge><Heading>{event.name}</Heading><Label muted>{dateLabel(event.startsAt,locale)} · {event.venueMode?.toUpperCase()}</Label><Label>{event.venueAddress||''}</Label><Label>{event.participantMode==='team'?t('Командный турнир','Team tournament'):t('Индивидуальный турнир','Individual tournament')} · {event.participantCount??0} {t('участников','entrants')}</Label><Button title={t('Открыть турнир','Open tournament')} onPress={()=>navigate('tournament',{slug:event.slug})}/></Card>)}</Grid>
    <Row>{page>1&&<Button title={t('Назад','Previous')} variant="secondary" onPress={()=>setPage(page-1)}/>} {Boolean(resource.data?.pagination?.hasNext || page<Number(resource.data?.pagination?.totalPages||0))&&<Button title={t('Следующая страница','Next page')} variant="secondary" onPress={()=>setPage(page+1)}/>}</Row>
  </Screen>;
}

function TournamentScreen(props:ScreenProps) {
  const {route,navigate,session}=props,{t,locale}=useDesign();
  const slug=route.params?.slug;
  const resource=useResource<any>(()=>slug?api.tournament(slug):api.tournaments({scope:session?.user?'mine':'all'}),`${slug}:${session?.user?.id}`);
  const data:any=resource.data,event=data?.tournament;
  if(!slug)return <Screen title={t('Выберите турнир','Choose a tournament')}><ResourceState resource={resource} empty={!resource.loading&&!data?.tournaments?.length}/>{data?.tournaments?.map((x:any)=><Card key={x.id}><Heading>{x.name}</Heading><Button title={t('Открыть','Open')} onPress={()=>navigate(route.name,{slug:x.slug})}/></Card>)}</Screen>;
  const title:Record<string,string>={participants:t('Участники','Participants'),standings:t('Таблица','Standings'),schedule:t('Раунды и расписание','Rounds and schedule'),registration:t('Регистрация','Registration'),table:t('Стол и миссия','Table and mission')};
  const entries=event?.participantMode==='team'?(data?.rosters||[]):(data?.participants||[]);
  const ownParticipant=(data?.participants||[]).find((p:any)=>p.userId===session?.user?.id&&!['removed','withdrawn'].includes(p.status));
  const open=(name:string,params:any={})=>navigate(name,{slug,...params});
  return <Screen title={title[route.name]||event?.name||t('Турнир','Tournament')}><ResourceState resource={resource}/>{event&&<>
    {route.name==='tournament'&&<><Card><Badge>{statusLabel(event.status,t)}</Badge><Heading>{event.name}</Heading><Label>{dateLabel(event.startsAt,locale)}</Label><Label>{event.venueAddress||event.venueMode?.toUpperCase()}</Label>{event.description&&<Label>{event.description}</Label>}{event.rulesSummary&&<Label>{event.rulesSummary}</Label>}
      {event.status==='registration_open'&&!ownParticipant&&<Button title={t('Зарегистрироваться','Register')} onPress={()=>session?.user?open(event.participantMode==='team'?'roster-registration':'registration',{tournamentId:event.id}):navigate('login')}/>}
      {ownParticipant&&['draft','registration_open','registration_closed'].includes(event.status)&&<ConfirmAction title={t('Отозвать заявку','Withdraw')} description={t('Отозвать свою заявку на этот турнир?','Withdraw your entry from this tournament?')} variant="danger" onConfirm={async()=>{await api.withdraw(event.id);await resource.reload();}}/>}
    </Card><Row>{[['participants',t('Участники','Participants')],['standings',t('Таблица','Standings')],['schedule',t('Раунды','Rounds')],['table',t('Столы','Tables')]].map(([name,label])=><Button key={name} title={label} variant="secondary" onPress={()=>open(name)}/>)}</Row>
      {event.viewer?.canAdmin&&<Button title={t('Управление турниром','Manage tournament')} onPress={()=>navigate('organizer',{tournamentId:event.id,id:event.id})}/>}
      {(data.teamMatches||[]).map((m:any)=><Card key={m.id}><Heading>{m.rosterA?.name} — {m.rosterB?.name||'BYE'}</Heading><Badge>{statusLabel(m.phase,t)}</Badge>{!m.resolution&&<Button title={t('Открыть пейринг','Open pairing')} onPress={()=>navigate('pairing',{id:m.id})}/>}</Card>)}
    </>}
    {route.name==='registration'&&<RegistrationForm event={event} onDone={()=>open('tournament')}/>}
    {route.name==='participants'&&<>{!entries.length&&<Label>{t('Пока нет участников','No participants yet')}</Label>}{entries.map((p:any)=><Card key={p.id}><Row><Avatar name={p.displayName||p.name||p.user?.name||'?'} uri={p.user?.avatarUrl}/><Heading>{p.displayName||p.name||p.user?.name}</Heading></Row><Badge>{statusLabel(p.status,t)}</Badge><Label muted>{p.factionHidden?t('Фракция скрыта до начала турнира','Faction hidden until the tournament starts'):(p.factions||[p.faction]).filter(Boolean).join(' · ')}</Label>{p.members?.map((m:any)=><Label key={m.id}>{m.displayNameSnapshot||m.user?.name||m.name}</Label>)}</Card>)}</>}
    {route.name==='standings'&&<>{!data.standings?.length&&<Label>{t('Таблица появится после публикации участников','Standings appear after participants are published')}</Label>}{(data.standings||[]).map((s:any,i:number)=>{const p=entries.find((p:any)=>p.id===(s.participantId??s.rosterId));return <Card key={s.participantId??s.rosterId??i}><Row><Label size={24}>{String(s.rank??i+1)}</Label><Heading>{p?.displayName||p?.name||s.roster?.name||t('Участник','Participant')}</Heading></Row><Row><Label>{t('Очки','Points')}: {s.matchPoints??s.tournamentPoints??s.teamTournamentPoints??0}</Label><Label>{t('Победы','Wins')}: {s.wins??0}</Label><Label>VP: {s.totalVp??s.gamePoints??0}</Label></Row></Card>;})}</>}
    {route.name==='schedule'&&<>{!data.rounds?.length&&<Label>{t('Раунды ещё не опубликованы','Rounds are not published yet')}</Label>}{(data.rounds||[]).map((r:any)=><Card key={r.id}><Heading>{t('Раунд','Round')} {r.number||r.roundNumber}</Heading><Badge>{statusLabel(r.status,t)}</Badge>{r.endsAt&&<Label>{t('Завершение','Ends')}: {dateLabel(r.endsAt,locale)}</Label>}{(r.matches||[]).map((m:any)=><View key={m.id} style={{gap:8,paddingVertical:12}}><Label>{m.participantA?.displayName||m.rosterA?.name} — {m.isBye?'BYE':m.participantB?.displayName||m.rosterB?.name||'—'}</Label><Label muted>{t('Стол','Table')} {m.table?.tableNumber??'—'}</Label>{m.gameId&&<Button title={t('Открыть игру','Open game')} variant="secondary" onPress={()=>navigate('game',{id:m.gameId})}/>}</View>)}</Card>)}</>}
    {route.name==='table'&&<>{!data.tables?.length&&<Label>{t('Столы ещё не назначены','Tables are not assigned yet')}</Label>}{(data.tables||[]).filter((table:any)=>!route.params?.tableId||table.id===route.params.tableId).map((table:any)=><Card key={table.id}><Heading>{t('Стол','Table')} {table.tableNumber}</Heading><Label>{table.killzone||t('Killzone не назначена','Killzone not assigned')}</Label><Label>{t('Расстановка','Layout')}: {table.deployment??'—'}</Label>{table.imageUrl&&<Image source={{uri:assetUrl(table.imageUrl)}} accessibilityLabel={t('Карта стола','Table map')} style={{width:'100%',aspectRatio:1.3}} resizeMode="contain"/>}</Card>)}</>}
    {route.name!=='tournament'&&<Button title={t('К турниру','Back to tournament')} variant="secondary" onPress={()=>open('tournament')}/>}<Button title={t('Обновить','Refresh')} variant="secondary" disabled={resource.loading} onPress={resource.reload}/>
  </>}</Screen>;
}

function RegistrationForm({event,onDone}:{event:any;onDone:()=>void}) {
  const {t}=useDesign();const [factions,setFactions]=useState<string[]>([]),[rules,setRules]=useState('');
  const count=Number(event.factionCount||1);
  return <Card><Heading>{event.name}</Heading>{Array.from({length:count},(_,i)=><Choice key={i} label={`${t('Фракция','Faction')} ${i+1}`} value={factions[i]||''} options={reference.killTeams.filter(f=>!factions.includes(f)||factions[i]===f)} onChange={value=>setFactions(old=>{const next=[...old];next[i]=value;return next;})}/>)}<TextField label={t('Правила фракции / примечание','Faction rules / note')} value={rules} onChangeText={setRules} multiline/><ConfirmAction title={t('Подать заявку','Submit registration')} description={t('Подтвердить регистрацию с указанными фракциями?','Register using these factions?')} disabled={factions.filter(Boolean).length!==count} onConfirm={async()=>{await api.join(event.id,{factions,factionRules:rules});onDone();}}/></Card>;
}
function NotificationsScreen(props:ScreenProps) {
  const {session,navigate}=props,{t,locale}=useDesign();const [writeError,setWriteError]=useState<unknown>(null);
  const resource=useResource(()=>session?.user?api.notifications():Promise.resolve({items:[],unreadCount:0,generatedAt:'',lastSeenAt:null}),String(session?.user?.id));
  async function mark(id:string){setWriteError(null);try{await api.setNotificationRead({id});await resource.reload();}catch(e){setWriteError(e);}}
  return <Screen title={t('Уведомления','Notifications')}>{!session?.user?<RequireLogin {...props}/>:<><ResourceState resource={resource} empty={!resource.loading&&!resource.data?.items?.length}/><ErrorNotice error={writeError}/>{(resource.data?.items||[]).map((item:any)=>{const copy=notificationCopy(item,locale);return <Card key={item.id}>{item.unread&&<Badge>{t('Новое','New')}</Badge>}<Heading>{copy.title}</Heading><Label>{copy.body}</Label><Label muted>{dateLabel(item.createdAt,locale)}</Label>{copy.route&&<Button title={copy.actionLabel||t('Открыть','Open')} onPress={()=>navigate(copy.route!.name,copy.route!.params)}/>} {copy.websiteUrl&&<Button title={copy.actionLabel||t('Открыть на сайте','Open on website')} variant="secondary" onPress={()=>{void Linking.openURL(copy.websiteUrl!).catch(setWriteError);}}/>}<Button title={t('Прочитано','Mark as read')} variant="secondary" disabled={!item.unread} onPress={()=>mark(item.id)}/></Card>;})}{resource.data?.generatedAt&&<ConfirmAction title={t('Прочитать все','Mark all as read')} description={t('Отметить показанные уведомления прочитанными?','Mark the displayed notifications as read?')} onConfirm={async()=>{await api.setNotificationRead({through:resource.data!.generatedAt});await resource.reload();}}/>}</>}</Screen>;
}
function ProfileScreen(props:ScreenProps) {
  const {route,session,navigate,refreshSession}=props,{t,locale,theme,setLocale,setTheme}=useDesign();
  const user=session?.user;const [name,setName]=useState(user?.name||''),[telegram,setTelegram]=useState(user?.telegramContact||''),[nickname,setNickname]=useState(user?.registerNickname||''),[current,setCurrent]=useState(''),[password,setPassword]=useState('');
  if(route.name==='settings')return <Screen title={t('Настройки','Settings')}><Card><Choice label={t('Язык приложения','App language')} value={locale} options={[{value:'ru',label:'Русский'},{value:'en',label:'English'}]} onChange={v=>setLocale(v as 'ru'|'en')}/><Label muted>{t('Язык приложения не меняет настройку Telegram-бота.','The app language does not change your Telegram bot setting.')}</Label><Choice label={t('Тема','Appearance')} value={theme} options={[{value:'dark',label:t('Тёмная','Dark')},{value:'light',label:t('Светлая','Light')}]} onChange={v=>setTheme(v as 'dark'|'light')}/></Card><Button title={t('Уведомления','Notifications')} variant="secondary" onPress={()=>navigate('notifications')}/></Screen>;
  if(!user)return <Screen title={t('Профиль','Profile')}><RequireLogin {...props}/></Screen>;
  if(route.name==='account')return <Screen title={t('Аккаунт и безопасность','Account and security')}><Card><TextField label={t('Имя','Name')} value={name} onChangeText={setName}/><TextField label={t('Игровой ник','Player name')} value={nickname} onChangeText={setNickname}/><TextField label={t('Контакт в Telegram','Telegram contact')} value={telegram} onChangeText={setTelegram}/><ConfirmAction title={t('Сохранить профиль','Save profile')} description={t('Сохранить изменения аккаунта?','Save your account changes?')} onConfirm={async()=>{await api.updateProfile({name,registerNickname:nickname,telegramContact:telegram});await refreshSession();}}/></Card><Card><Heading>{t('Изменить пароль','Change password')}</Heading><TextField label={t('Текущий пароль','Current password')} secureTextEntry value={current} onChangeText={setCurrent}/><TextField label={t('Новый пароль','New password')} secureTextEntry value={password} onChangeText={setPassword}/><ConfirmAction title={t('Изменить пароль','Change password')} disabled={!current||password.length<6} description={t('Изменить пароль аккаунта?','Change your account password?')} onConfirm={async()=>{await api.updateProfile({currentPassword:current,newPassword:password});setCurrent('');setPassword('');await refreshSession();}}/></Card></Screen>;
  return <Screen title={t('Профиль','Profile')}><Card><Row><Avatar name={user.name} uri={user.avatarUrl} size={64}/><View style={{flex:1,gap:8}}><Heading>{user.name}</Heading><Badge>MMR {user.ratings?.combined??user.rating??'—'}</Badge></View></Row><Label muted>{user.registerNickname||''}</Label></Card><Button title={t('Аккаунт и безопасность','Account and security')} variant="secondary" onPress={()=>navigate('account')}/><Button title={t('Команды и составы','Teams and rosters')} variant="secondary" onPress={()=>navigate('team')}/><Button title={t('Настройки','Settings')} variant="secondary" onPress={()=>navigate('settings')}/>{[['rankings',t('Рейтинг','Rankings')],['statistics',t('Статистика турниров','Tournament statistics')],['history',t('История игр','Game history')],['achievements',t('Награды и титулы','Awards and titles')],['documentation',t('Документация','Documentation')]].map(([name,label])=><Button key={name} title={label} variant="secondary" onPress={()=>navigate(name)}/>)}<Button title={t('Мои турниры','My tournaments')} variant="secondary" onPress={()=>navigate('tournaments')}/>{(user.isAdmin||user.canCreateTournaments||user.managedTournamentIds?.length)&&<Button title={t('Пульт организатора','Organizer dashboard')} onPress={()=>navigate('organizer')}/>}<ConfirmAction title={t('Выйти','Sign out')} variant="danger" description={t('Завершить сессию на этом устройстве?','Sign out on this device?')} onConfirm={async()=>{await api.logout();await clearScoreDrafts(user.id).catch(()=>{});await refreshSession();navigate('login');}}/></Screen>;
}





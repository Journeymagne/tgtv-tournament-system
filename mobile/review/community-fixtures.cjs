// Fictional read-only fixtures used only by the browser visual-review harness.
const people=[{id:1,name:'Journey',rank:1,rating:1184,ratings:{combined:1184,tts:1200,irl:1170}},{id:2,name:'North',rank:2,rating:1150,ratings:{combined:1150,tts:1130,irl:1160}}];
const team={id:21,slug:'companion-alpha',name:'Companion Alpha',leaderUserId:1,description:'Команда для визуальной проверки. Все данные вымышлены.',viewer:{isMember:true,isLeader:true,canAdmin:true,canDelete:false}};
const currentMembers=people.map((user,i)=>({id:801+i,userId:user.id,role:i===0?'leader':'member',displayNameSnapshot:user.name,user}));
const tournament={id:1,name:'Companion Open',slug:'companion-open',participantMode:'individual',status:'completed'};
const result={winnerId:1,scores:{1:{crit:4,kill:3,tac:3,primary:'crit',primaryBonus:2,total:12,faction:'Tempestus Aquilons',tacOp:'Plant Devices'},2:{crit:3,kill:2,tac:2,primary:'crit',primaryBonus:2,total:9,faction:'Goremongers',tacOp:'Rout'}}};
const games=[{id:701,players:people,playerIds:[1,2],sourceType:'tournament_match',status:'completed',tournament,result,venueMode:'irl'}];
const pagination={currentPage:1,totalPages:1,total:2};
const achievement={id:901,name:'Companion Open · Победитель',description:'Первое место в турнирной таблице.',emoji:'🏆',category:'title',kind:'player'};
const pages=[{id:'tournaments',title:'Турниры',summary:'Регистрация, расписание и результаты.'},{id:'changelog',title:'Что нового',summary:'История обновлений компаньона.'}];
function fixture(path){
  if(path==='/api/users'||path==='/api/users/search')return {users:people,pagination};
  if(path==='/api/leaderboards/teams')return {teams:[{...team,rank:1,rating:1210,ratings:{combined:1210,irl:1210,tts:1210}}],pagination};
  if(path==='/api/games')return {games,pagination};
  if(/^\/api\/users\/[12]$/.test(path))return {user:people[Number(path.split('/').pop())-1],stats:{matches:12,wins:7,draws:2,losses:3},recentGames:games,playerTeams:[team]};
  if(path==='/api/achievements')return {achievements:[achievement],pagination};
  if(path==='/api/achievements/901')return {achievement,recipients:[{id:1,userId:1,name:'Journey',awardedAt:'2026-11-11T09:00:00Z'}]};
  if(/^\/api\/documentation\/(ru|en)$/.test(path))return {pages};
  if(/^\/api\/documentation\/(ru|en)\//.test(path))return {page:{...pages[0],markdown:'# Турнирная система\n\nВступите в турнир и дождитесь публикации раунда.\n\n## Результат игры\n\n- Внесите Crit Op, Kill Op и Tac Op.\n- Проверьте счёт перед отправкой.\n\n## Важное\n\nЭти данные вымышлены и нужны только для проверки интерфейса.'}};
  if(path==='/api/teams'||path==='/api/teams/dashboard')return {teams:[team],myTeams:[team],incomingInvitations:[],outgoingInvitations:[]};
  if(path==='/api/teams/companion-alpha'||path==='/api/teams/21/members')return {team,currentMembers,rosters:[],recentGames:games};
  return undefined;
}
const routes=[{name:'rankings'},{name:'statistics'},{name:'history'},{name:'achievements'},{name:'achievement',params:{id:901}},{name:'documentation'},{name:'documentation',params:{id:'tournaments'}},{name:'player',params:{id:1}},{name:'team',params:{slug:'companion-alpha'}}];
module.exports={fixture,routes};

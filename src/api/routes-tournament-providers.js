const providers = require('./tournament-providers');
const action = (handler,value) => ctx=>handler({...ctx,action:value});
module.exports = [
  {method:'GET',path:'/api/tournament-providers',handler:providers.list,auth:'none',loadUser:true},
  {method:'GET',path:'/api/tournament-providers/dashboard',handler:providers.dashboard,auth:'user'},
  {method:'GET',path:'/api/tournament-providers/:id/events',handler:providers.events,auth:'none',loadUser:true},
  {method:'GET',path:'/api/tournament-providers/:slug',handler:providers.get,auth:'none',loadUser:true},
  {method:'GET',path:'/api/tournament-provider-logos/:id',handler:providers.logo,auth:'none'},
  {method:'POST',path:'/api/tournament-providers',handler:providers.create,auth:'user',tx:true},
  {method:'PATCH',path:'/api/tournament-providers/:id',handler:providers.update,auth:'user',tx:true},
  {method:'POST',path:'/api/tournament-providers/:id/invitations',handler:providers.invite,auth:'user',tx:true},
  ...['accept','decline','revoke'].map(value=>({method:'POST',path:'/api/tournament-provider-invitations/:id/'+value,handler:action(providers.respondInvitation,value),auth:'user',tx:true})),
  {method:'PATCH',path:'/api/tournament-providers/:id/members/:userId',handler:action(providers.changeMember,'role'),auth:'user',tx:true},
  {method:'DELETE',path:'/api/tournament-providers/:id/members/:userId',handler:action(providers.changeMember,'remove'),auth:'user',tx:true},
  {method:'POST',path:'/api/tournament-providers/:id/leave',handler:action(providers.changeMember,'leave'),auth:'user',tx:true},
  {method:'PATCH',path:'/api/tournament-providers/:id/owner',handler:action(providers.changeChief,'transfer'),auth:'user',tx:true},
  {method:'POST',path:'/api/tournament-providers/:id/owners/:userId',handler:action(providers.changeChief,'add'),auth:'user',tx:true},
  {method:'DELETE',path:'/api/tournament-providers/:id/owners/:userId',handler:action(providers.changeChief,'remove'),auth:'user',tx:true},
  ...['archive','restore'].map(value=>({method:'POST',path:'/api/tournament-providers/:id/'+value,handler:action(providers.archive,value),auth:'user',tx:true}))
];

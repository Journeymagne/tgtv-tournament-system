const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../../public/admin.js'),'utf8');
function extract(name) {
  const match=source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  assert.ok(match,name);return match[0];
}
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function helper(name,context={}) {
  const bindings={adminLabel:ru=>ru,escapeHtml,...context};
  return new Function(...Object.keys(bindings),`${extract(name)}; return ${name};`)(...Object.values(bindings));
}
function input(markup,name) {return markup.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0]||'';}
const administrator={isAdmin:true,isSuperAdmin:false};
const superadministrator={isAdmin:true,isSuperAdmin:true};

test('any administrator can edit global flags, while only the super administrator can revoke admin',()=>{
  const render=helper('adminPermissionFields');
  assert.equal(render({},{}),'');
  for(const actor of [administrator,superadministrator]) {
    const html=render(actor,{isAdmin:false});
    for(const name of ['isAdmin','canCreateTournaments','isFAQModerator'])assert.ok(input(html,name),name);
    assert.doesNotMatch(input(html,'isAdmin'),/disabled/);
  }
  const protectedHtml=render(administrator,{isAdmin:true,isFAQModerator:true});
  assert.match(input(protectedHtml,'isAdmin'),/checked.*disabled/);
  assert.doesNotMatch(input(protectedHtml,'isFAQModerator'),/disabled/);
  assert.doesNotMatch(input(render(superadministrator,{isAdmin:true}),'isAdmin'),/disabled/);
  assert.match(input(render(superadministrator,superadministrator),'isAdmin'),/disabled/);
});

test('disabled admin inputs preserve the role without blocking edits to other flags',()=>{
  const payload=helper('adminPermissionsPayload');
  const form=new Map([['isFAQModerator','on'],['reason','Update access']]);
  assert.deepEqual(payload(form,administrator,administrator),{isAdmin:true,canCreateTournaments:false,isFAQModerator:true,reason:'Update access'});
  assert.equal(payload(form,administrator,superadministrator).isAdmin,false);
  assert.equal(payload(form,superadministrator,superadministrator).isAdmin,true);
});

test('the role summary includes global roles and explicit tournament assignments',()=>{
  const label=helper('adminUserRoleLabels');
  const summary=label({isAdmin:true,canCreateTournaments:true,isFAQModerator:true,hasOwnedTournaments:true,hasJudgeAssignments:true});
  for(const part of ['Администратор','Создание турниров','Модератор FAQ','Организатор турниров','Судья турниров'])assert.ok(summary.includes(part));
  assert.equal(label({}),'Игрок');
  assert.match(label(superadministrator),/Суперадминистратор/);
  const markup=helper('adminTournamentRolesMarkup')([{tournamentId:12,name:'<Cup>',role:'organizer'},{tournamentId:13,name:'Judge cup',role:'judge'}]);
  assert.match(markup,/&lt;Cup&gt;/);assert.doesNotMatch(markup,/<Cup>/);
  assert.match(markup,/#\/administration\/tournaments\/admin\/12/);
  assert.match(markup,/Организатор/);assert.match(markup,/Судья/);
});

test('the special-users loader uses independent search and pagination and ignores stale responses',async()=>{
  const state={me:administrator,adminUsers:[{id:99}],adminSpecialUsersPage:2,adminSpecialUsersQuery:'Имя @test'};
  const pending=[];
  const loader=helper('loadAdminSpecialUsers',{state,api:url=>new Promise(resolve=>pending.push({url,resolve}))});
  const older=loader();state.adminSpecialUsersPage=3;const newer=loader();
  assert.match(pending[0].url,/access=special&page=2/);assert.ok(pending[0].url.includes(encodeURIComponent('Имя @test')));
  pending[1].resolve({users:[{id:3}],pagination:{currentPage:3}});await newer;
  pending[0].resolve({users:[{id:2}],pagination:{currentPage:2}});await older;
  assert.deepEqual(state.adminSpecialUsers,[{id:3}]);assert.equal(state.adminSpecialUsersPagination.currentPage,3);
  assert.deepEqual(state.adminUsers,[{id:99}]);
  state.me={};await loader();assert.equal(pending.length,2);
});

test('Players and teams exposes three tabs and renders the selected independent list',()=>{
  const state={adminPeopleTab:'administrators'};
  const panel=helper('adminPeoplePanel',{state,t:key=>key,adminTeamsPanel:()=>'<p>Teams</p>',adminSpecialUsersPanel:()=>'<p>Special users</p>',adminUsersPanel:()=>'<p>Players</p>'});
  const html=panel();assert.equal((html.match(/data-admin-people=/g)||[]).length,3);
  assert.match(html,/aria-pressed="true" data-admin-people="administrators"/);
  assert.match(html,/<p>Special users<\/p>/);assert.doesNotMatch(html,/<p>Players<\/p>/);
  state.adminPeopleTab='teams';assert.match(panel(),/<p>Teams<\/p>/);
});

test('ordinary administrators can transfer organizers through the existing tournament controls',()=>{
  const render=helper('adminTournamentStaffContent',{state:{me:administrator},fmtDate:value=>value});
  const html=render({staff:{canManageJudges:true,staff:[{userId:5,name:'Admin with explicit judge grant',role:'judge',active:true,assigned:true,automatic:true,canRevoke:true}]}});
  assert.match(html,/data-transfer-owner/);assert.match(html,/data-judge-assign/);assert.match(html,/data-judge-revoke="5"/);
});

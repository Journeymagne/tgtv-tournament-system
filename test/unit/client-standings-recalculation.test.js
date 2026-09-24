const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../public/admin.js'), 'utf8');
const functionSource = name => source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\r?\\n\\}`))[0];

test('recalculate is available to admins in ongoing and completed individual tournaments', () => {
  const render = new Function('t', 'rollbackRoundActionState', 'tournamentFinalStandingsReady', 'nextRoundActionState', 'escapeHtml',
    `${functionSource('adminTournamentActionButtons')}; return adminTournamentActionButtons;`)(
    key => key, () => ({}), () => false, () => ({ canGenerate: false, message: '' }), String);
  for (const status of ['in_progress','completed']) {
    const html = render({ tournament: { status, participantMode: 'individual' } });
    assert.equal((html.match(/data-admin-tournament-action="recalculate-standings"/g) || []).length, 1);
  }
  for (const status of ['draft','registration_open','cancelled']) {
    assert.doesNotMatch(render({ tournament: { status } }), /recalculate-standings/);
  }
  assert.doesNotMatch(render({ tournament: { status: 'completed', participantMode: 'team' } }), /recalculate-standings/);
});

test('confirmation cancellation sends nothing; published recalculation confirms changes and replaces displayed data', async () => {
  const state = { adminTournamentDetail: { tournament: { id: 10, status: 'completed' } } };
  const requests = [], confirmations = [], messages = [];
  let confirm = false, renders = 0;
  const refreshed = { tournament: { id: 10, status: 'completed', finalResults: [{ participantId: 108, matchPoints: 6, rank: 1 }] },
    recalculation: { repairedMatches: 1 } };
  const run = new Function('state','confirmAction','t','api','renderTournaments','setMessage',
    `${functionSource('runAdminTournamentAction')}; return runAdminTournamentAction;`)(
    state, async options => { confirmations.push(options); return confirm; }, key => key,
    async (...args) => { requests.push(args); return refreshed; }, () => { renders++; }, (...args) => messages.push(args));
  await run('recalculate-standings');
  assert.equal(requests.length, 0);
  assert.equal(state.adminStandingsRecalculating, false);
  confirm = true;
  await run('recalculate-standings');
  assert.equal(confirmations[1].message, 'dialog.admin.recalculatePublishedStandings');
  assert.equal(confirmations[1].danger, true);
  assert.deepEqual(requests, [['/api/admin/tournaments/10/standings/recalculate', { method: 'POST', body: { replacePublished: true } }]]);
  assert.equal(state.adminTournamentDetail, refreshed);
  assert.equal(state.tournamentInfoTab, 'standings');
  assert.equal(renders, 1);
  assert.equal(messages[0][0], 'admin.tournament.standingsRecalculated');
});

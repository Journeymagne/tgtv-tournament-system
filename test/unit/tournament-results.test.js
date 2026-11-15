const test = require('node:test');
const assert = require('node:assert/strict');
const results = require('../../public/tournament-results');
const { canFinishTournament } = require('../../src/domain/access');
const ready = (team = true) => ({
  tournament: { id: 7, name: 'Cup', participantMode: team ? 'team' : 'individual', status: 'in_progress', format: 'swiss', swissRoundCount: 2 },
  rounds: [1, 2].map(n => ({ id: n, roundNumber: n, status: 'completed', matches: [{ id: n, roundId: n, phase: 'completed', status: 'completed' }] }))
});
test('all configured rounds and confirmed matches are needed before explicit completion', () => {
  for (const team of [true, false]) {
    const data = ready(team);
    assert.equal(results.isReady(data), true);
    for (const status of ['draft', 'registration_closed', 'completed', 'cancelled']) {
      assert.equal(results.isReady({ ...data, tournament: { ...data.tournament, status } }), false);
    }
    const missing = ready(team); missing.rounds.pop(); assert.equal(results.isReady(missing), false);
    const empty = ready(team); empty.rounds[1].matches = []; assert.equal(results.isReady(empty), false);
    const pending = ready(team); Object.assign(pending.rounds[1].matches[0], { phase: 'in_progress', status: 'pending_confirmation' });
    assert.equal(results.isReady(pending), false);
    const draft = ready(team); draft.tournament.roundDraft = { roundNumber: 2 }; assert.equal(results.isReady(draft), false);
    const gap = ready(team); gap.rounds[1].roundNumber = 3; assert.equal(results.isReady(gap), false);
  }
});
test('compact team and flat server payloads follow the same readiness rules', () => {
  const data = ready(); const matches = data.rounds.flatMap(r => r.matches);
  const rounds = data.rounds.map(({ matches, ...round }) => round);
  assert.equal(results.isReady({ ...data, rounds, teamMatches: matches }), true);
  assert.equal(results.isReady({ ...data, rounds, matches }), true);
  assert.equal(results.isReady({ ...data, rounds, teamMatches: [] }), false);
});
test('only the owner and platform administrators can finish; a delegated judge cannot', () => {
  const cup = { id: 7, ownerUserId: 11 };
  assert.equal(canFinishTournament({ id: 11 }, cup), true);
  assert.equal(canFinishTournament({ id: 12, isAdmin: true }, cup), true);
  assert.equal(canFinishTournament({ id: 12, managedTournamentIds: [7] }, cup), false);
  assert.equal(canFinishTournament({ id: 12 }, cup), false);
  assert.equal(canFinishTournament(null, cup), false);
});
function finalData(team = true) {
  const data = ready(team); data.tournament.status = 'completed';
  data.rosters = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Roster ${i + 1}`, members: [{ displayNameSnapshot: 'Player <one>' }] }));
  data.participants = data.rosters.map(r => ({ id: r.id, displayNameSnapshot: r.name }));
  data.tournament.finalResults = data.rosters.map((r, i) => ({ rank: i + 1, rosterId: 12 - i, participantId: 12 - i,
    teamTournamentPoints: 24 - i, teamGamePoints: 220 - i, matchPoints: 18 - i, totalVp: 100 - i, wins: 6, draws: 0, losses: 0 }));
  data.standings = [...data.tournament.finalResults].reverse();
  data.individualStandings = [{ rank: 1, name: '<Raven>', rosterNames: ['<Roster>'], gamesPlayed: 6, matchPoints: 18, totalGp: 108, gpDiff: 96 },
    { rank: 1, name: 'North', rosterNames: ['Roster 2'], gamesPlayed: 6, matchPoints: 18, totalGp: 108, gpDiff: 96 },
    { rank: 3, name: 'Third', gamesPlayed: 6, matchPoints: 15 }];
  return data;
}
test('results preserve published ranks, top ten, shared personal winners and source data', () => {
  for (const team of [true, false]) {
    const data = finalData(team), before = structuredClone(data), model = results.buildModel(data);
    assert.equal(model.entries.length, 10);
    assert.equal(model.entries[0].name, 'Roster 12');
    assert.equal(model.entries[0].tp, team ? 24 : 18);
    assert.equal(model.entries[0].gp, team ? 220 : 100);
    assert.equal(model.personalWinners.length, team ? 2 : 0);
    assert.deepEqual(data, before);
  }
});
test('results require publication and handle smaller events and absent personal games', () => {
  const data = finalData(); data.tournament.status = 'in_progress'; assert.equal(results.buildModel(data), null);
  data.tournament.status = 'completed'; data.tournament.finalResults = data.tournament.finalResults.slice(0, 1);
  data.individualStandings = [{ rank: 1, name: 'No games', gamesPlayed: 0, byes: 0 }];
  assert.equal(results.buildModel(data).entries.length, 1);
  assert.equal(results.buildModel(data).personalWinners.length, 0);
});
test('HTML escapes user names and exposes an accessible public PNG action', () => {
  const data = finalData(); data.tournament.name = '<img src=x onerror=alert(1)>';
  const html = results.render(data, { t: key => key });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;Raven&gt;/);
  assert.doesNotMatch(html, /<img src=x|<Raven>/);
  assert.match(html, /data-tournament-results-download/);
  assert.equal((html.match(/data-result-entry=/g) || []).length, 10);
});

test('canvas export renders published values and grows for long names instead of clipping', () => {
  const texts = [], dividers = [], context = {
    measureText: text => ({ width: String(text).length * 10 }),
    fillText: (...args) => texts.push(args), fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo: (x,y) => dividers.push(y), arc() {}
  };
  const canvas = { getContext: () => context };
  const data = finalData(); data.rosters[11].name = 'A very long champion roster name '.repeat(12);
  const model = results.buildModel(data);
  const before = structuredClone(model);
  const image = results.createCanvas(model, { t: key => key, document: { createElement: () => canvas } });
  assert.equal(image.width, 1200);
  assert.ok(image.height > 1120);
  assert.ok(texts.some(([text]) => text === '24 TP'));
  assert.ok(texts.some(([text]) => String(text).includes('108 Total GP')));
  assert.ok(texts.every(([, x, y]) => x >= 0 && x < image.width && y >= 0 && y < image.height));
  const memberY = texts.find(([text]) => text === 'Player <one>')[2];
  assert.ok(Math.min(...dividers.filter(y => y > memberY)) >= memberY + 20, 'champion member text must clear the footer divider');
  assert.deepEqual(model, before);
});

test('download rejects a failed PNG encoding rather than creating an empty download', async () => {
  const context = { measureText: text => ({ width: String(text).length * 7 }), fillText() {}, fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, arc() {} };
  const doc = { createElement: tag => { assert.equal(tag, 'canvas'); return { getContext: () => context, toBlob: callback => callback(null) }; } };
  await assert.rejects(results.download(finalData(), { t: key => key, document: doc }), /results.exportFailed/);
});

test('the results model uses TP without manufacturing team GP for Classic events', () => {
  const data = finalData(); data.tournament.pairingType = 'sword_shield_classic';
  assert.equal(results.buildModel(data).showGp, false);
  assert.doesNotMatch(results.render(data, { t: key => key }), /<th scope="col">GP<\/th>/);
});

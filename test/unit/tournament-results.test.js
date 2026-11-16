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
  assert.equal((html.match(/data-table-viewport/g) || []).length, 2, 'each grid column must expose its own table viewport');
});

test('rosters inherit the current team logo, with snapshots only when the team is unavailable', () => {
  const data = finalData();
  const champion = data.rosters[11];
  champion.team = { name: 'Parent team', logoData: '/api/team-logos/7?v=abc123' };
  champion.teamLogoSnapshot = '/api/roster-logos/12?v=old';
  let row = results.buildModel(data).entries[0];
  assert.equal(row.logo, champion.team.logoData);
  assert.equal(row.initials, 'PA');
  assert.match(results.render(data, { t: key => key }), /<img src="\/api\/team-logos\/7\?v=abc123" alt=""/);
  champion.team.logoData = null;
  assert.equal(results.buildModel(data).entries[0].logo, null, 'removing the current logo must not revive the old snapshot');
  champion.team = null;
  assert.equal(results.buildModel(data).entries[0].logo, champion.teamLogoSnapshot);
  champion.teamLogoSnapshot = 'https://example.com/logo.png';
  assert.equal(results.buildModel(data).entries[0].logo, null, 'external images must not taint PNG exports');
  const solo = finalData(false);
  solo.participants[11].team = { logoData: '/api/team-logos/7?v=abc123' };
  assert.equal(results.buildModel(solo).entries[0].logo, null, 'individual results keep player initials');
});

test('podium records contain only numbers while table columns retain their heading', () => {
  const html = results.render(finalData(), { t: key => key });
  const footers = [...html.matchAll(/class="tournament-result-card-footer">([\s\S]*?)<\/div>/g)];
  assert.equal(footers.length, 3);
  assert.ok(footers.every(([, content]) => content.includes('6 / 0 / 0') && !content.includes('results.wdl')));
  assert.match(html, /<th scope="col">results.wdl<\/th>/);
});

test('PNG podium logos keep their aspect ratio and omit the redundant WDL suffix', () => {
  const data = finalData(), images = [], texts = [];
  data.rosters[11].team = { logoData: '/api/team-logos/7?v=abc123' };
  const logo = { naturalWidth: 400, naturalHeight: 200 };
  const context = {
    measureText: value => ({ width: String(value).length * 7 }), fillText: value => texts.push(value),
    drawImage: (...args) => images.push(args), fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, arc() {}
  };
  results.createCanvas(results.buildModel(data), { t: key => key, logos: new Map([[data.rosters[11].team.logoData, logo]]), document: { createElement: () => ({ getContext: () => context }) } });
  assert.equal(images.length, 1);
  assert.equal(images[0][0], logo);
  assert.equal(images[0][3] / images[0][4], 2);
  assert.ok(texts.includes('6 / 0 / 0'));
  assert.ok(!texts.includes('6 / 0 / 0 results.wdl'));
});

test('PNG download loads a shared team logo once and tolerates a missing logo', async () => {
  const data = finalData(), loaded = [], drawn = [];
  for (const [i, id] of [11, 10, 9].entries()) data.rosters[id].team = { logoData: `/api/team-logos/${i < 2 ? 7 : 8}?v=abc123` };
  const context = { measureText: value => ({ width: String(value).length * 7 }), fillText() {}, drawImage: image => drawn.push(image), fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, arc() {} };
  const doc = { createElement(tag) {
    if (tag === 'img') return { naturalWidth: 100, naturalHeight: 100, set src(value) {
      loaded.push(value); queueMicrotask(() => value.includes('/7?') ? this.onload() : this.onerror());
    } };
    return { getContext: () => context, toBlob: callback => callback(null) };
  } };
  await assert.rejects(results.download(data, { t: key => key, document: doc }), /results.exportFailed/);
  assert.equal(loaded.length, 2);
  assert.equal(drawn.length, 2, 'the two rosters share the loaded team image; a missing logo uses initials');
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

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const teams = require('../../public/training/team-courses');
const source = fs.readFileSync(require.resolve('../../public/app.js'), 'utf8');
const names = ['achievementTitle', 'achievementDescription', 'achievementPicture', 'achievementCards', 'profileAchievementMarkup', 'formatWilsonScore'];
const functions = names.map(name => {
  const code = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(code, name);
  return code;
}).join('\n');
const render = new Function('i18n', 't', 'escapeHtml', 'killTeamLogoSrc', 'state', 'window',
  `${functions}; return { achievementCards, profileAchievementMarkup };`)(
  { getLocale: () => 'ru' }, key => key, value => String(value), () => '/team-logo.svg', {},
  { KTTrainingJourneyUI: { achievement: journey => journey ? '<a>Know Thy Kill Team</a>' : '' } }
);
const team = 'hand-of-the-archon';
const questions = [{ id: 'a', team }, { id: 'b', team }];
const ordinary = { id: 7, name: 'Рамблер x2', description: 'Two wins', emoji: '🏅', kind: 'player' };

for (const compact of [true, false]) {
  test(`achievement cards hide unearned team awards with compact=${compact}`, () => {
    for (const stats of [{}, { a: { correct: 1 } }, { a: { correct: 10 }, b: { correct: 0 } }]) {
      const html = render.achievementCards([ordinary], { compact, trainingTeams: teams.progress(questions, stats) });
      assert.doesNotMatch(html, /Знаток команды|Hand of the Archon|team-logo/);
      assert.match(html, /Рамблер x2/);
    }
  });

  test(`achievement cards show the team award after every question is solved with compact=${compact}`, () => {
    const html = render.achievementCards([], { compact,
      trainingTeams: teams.progress(questions, { a: { correct: 1 }, b: { correct: 1 } }) });
    assert.match(html, /Знаток команды: Hand of the Archon/);
    assert.match(html, /href="\/training\?team=hand-of-the-archon#training"/);
  });
}

test('profile with only unearned team awards shows the training journey without an empty achievement list', () => {
  const html = render.profileAchievementMarkup({ achievements: [], trainingAchievement: {},
    trainingTeamAchievements: teams.progress(questions) }, true);
  assert.equal(html, '<div class="profile-achievement-list"><a>Know Thy Kill Team</a></div>');
});

test('profile puts the training rank and ordinary awards in the same compact list', () => {
  const html = render.profileAchievementMarkup({ achievements: [ordinary], trainingAchievement: {} }, true);
  assert.equal((html.match(/class="profile-achievement-list"/g) || []).length, 1);
  assert.match(html, /^<div class="profile-achievement-list"><a>Know Thy Kill Team<\/a>\s*<a class="profile-achievement-item"/);
  assert.match(html, /Рамблер x2<\/strong>\s*<\/a><\/div>$/);
});

test('profile preserves an earned Wilson badge while hiding unearned training team awards', () => {
  const html = render.profileAchievementMarkup({ achievements: [], trainingAchievement: {},
    trainingTeamAchievements: teams.progress(questions), wilsonAchievements: [{ team: 'Tempestus Aquilons',
      name: 'Опытный', nameEn: 'Experienced', emoji: '🥉', wilsonScore: 52.301386, threshold: 50, wins: 9, games: 11 }] }, true);
  assert.match(html, /Know Thy Kill Team/);
  assert.match(html, /Опытный: Tempestus Aquilons/);
  assert.doesNotMatch(html, /Знаток команды: Hand of the Archon/);
});

test('profile shows at most five awards including the rank and team expert badge', () => {
  const data = { trainingAchievement: {}, trainingTeamAchievements: [{ id: team, name: 'Hand of the Archon', earned: true }],
    achievements: Array.from({ length: 7 }, (_, index) => ({ ...ordinary, id: index + 1, name: `Award ${index + 1}` })) };
  const html = render.profileAchievementMarkup(data, true);
  assert.equal((html.match(/<a\b/g) || []).length, 5);
  assert.match(html, /Know Thy Kill Team/);
  assert.match(html, /Знаток команды: Hand of the Archon/);
  assert.match(html, /Award 3/);
  assert.doesNotMatch(html, /Award 4/);
  assert.match(html, /data-profile-achievements-all/);
  const all = render.profileAchievementMarkup(data, true, { limit: Infinity });
  assert.equal((all.match(/<a\b/g) || []).length, 9);
  assert.match(all, /Award 7/);
  assert.doesNotMatch(all, /data-profile-achievements-all/);
});

test('view all appears only when more awards exist, including unloaded API pages', () => {
  const achievements = Array.from({ length: 5 }, (_, id) => ({ ...ordinary, id }));
  assert.doesNotMatch(render.profileAchievementMarkup({ achievements }, true), /data-profile-achievements-all/);
  assert.match(render.profileAchievementMarkup({ achievements, pagination: { total: 6 } }, true), /data-profile-achievements-all/);
  assert.doesNotMatch(render.profileAchievementMarkup({ achievements: [] }, true), /data-profile-achievements-all/);
});

test('view all loads awards beyond the first API page without duplicating special badges', async () => {
  const code = source.match(/async function loadAllProfileAchievements\([^\n]*\) \{[\s\S]*?\r?\n\}/)?.[0];
  assert.ok(code);
  const urls = [];
  const load = new Function('api', `${code}; return loadAllProfileAchievements;`)(async url => {
    urls.push(url);
    return { achievements: [{ ...ordinary, id: urls.length + 1 }], pagination: { totalPages: 3 } };
  });
  const result = await load({ achievements: [{ ...ordinary, id: 1 }], trainingAchievement: { rank: 'rank' },
    pagination: { currentPage: 1, totalPages: 3 } }, 'userId', 42);
  assert.deepEqual(result.achievements.map(item => item.id), [1, 2, 3]);
  assert.deepEqual(urls, ['/api/achievements?userId=42&page=2', '/api/achievements?userId=42&page=3']);
  assert.deepEqual(result.trainingAchievement, { rank: 'rank' });
  assert.equal(result.pagination, null);
});

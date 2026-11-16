const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const teams = require('../../public/training/team-courses');
const source = fs.readFileSync(require.resolve('../../public/app.js'), 'utf8');
const names = ['achievementTitle', 'achievementDescription', 'achievementPicture', 'achievementCards', 'profileAchievementMarkup'];
const functions = names.map(name => {
  const code = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(code, name);
  return code;
}).join('\n');
const render = new Function('i18n', 't', 'escapeHtml', 'killTeamLogoSrc', 'state', 'window',
  `${functions}; return { achievementCards, profileAchievementMarkup };`)(
  { getLocale: () => 'ru' }, key => key, value => String(value), () => '/team-logo.svg', {},
  { KTTrainingJourneyUI: { achievement: () => '<a>Know Thy Kill Team</a>' } }
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
  assert.equal(html, '<a>Know Thy Kill Team</a>');
});

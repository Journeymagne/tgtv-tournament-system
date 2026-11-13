(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTTrainingChangelog = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const entries = [
    {
      date: '2026-11-13', version: '1.5.19',
      ru: { title: 'Редактура вопросов и история обновлений', items: [
        'В тренажёре появилась отдельная вкладка «Что нового». Здесь собраны изменения KnowThyKT и базы вопросов.',
        'Уточнены формулировки, варианты ответов и английские переводы 13 вопросов, на которых часто ошибались.',
        'Все 7 вопросов про Portable Barricade исключены из тренировок и требований курса.',
        'История ответов, заработанный XP и заслуженные звания сохранены. Для прежних редакций вопросов сохраняются их английские переводы.'
      ] },
      en: { title: 'Question wording and update history', items: [
        'The trainer now has a dedicated “What’s new” tab for KnowThyKT and question-bank updates.',
        'Clarified wording, answer options and English translations for 13 questions with frequent mistakes.',
        'All 7 Portable Barricade questions are excluded from training and course requirements.',
        'Answer history, earned XP and titles are retained. Historical question revisions keep their matching English translations.'
      ] }
    },
    {
      date: '2026-11-13',
      ru: { title: 'Первое редакторское ревью банка', items: [
        'После проверки жалоб исправлены и возвращены в пул 22 вопроса.',
        'Составной вопрос kt-265 разделён на два задания. Новый kt-301 отдельно проверяет ограничения на повтор бесплатного действия.',
        'Уточнены видимость, движение по террейну, действия перед удалением оперативника и взаимодействия правил оружия.'
      ] },
      en: { title: 'Initial question-bank review', items: [
        'Reviewed player reports, corrected 22 questions and returned them to the active pool.',
        'Split the compound question kt-265 into two exercises. The new kt-301 separately covers restrictions on repeating a free action.',
        'Clarified visibility, terrain movement, actions before an operative is removed and weapon-rule interactions.'
      ] }
    },
    {
      date: '2026-10-22',
      ru: { title: 'Расширение учебного курса', items: [
        'В исходный курс включены 200 дополнительных вопросов: банк общих правил расширен до 300 заданий четырёх уровней сложности.',
        'Ситуации сопровождаются объяснением ответа и ссылкой на раздел правил.'
      ] },
      en: { title: 'Expanded training course', items: [
        'Added 200 questions to the original course, expanding the core-rules bank to 300 exercises across four difficulty levels.',
        'Each scenario includes an answer explanation and a reference to the relevant rules section.'
      ] }
    }
  ];
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  function render(locale) {
    const language = locale === 'en' ? 'en' : 'ru';
    const english = language === 'en';
    const dateFormat = new Intl.DateTimeFormat(english ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    return `<section class="training-changelog" data-ui-skip>
      <div class="page-heading"><span class="eyebrow">KNOW THY KILL TEAM</span><h1>${english ? 'KnowThyKT updates' : 'Обновления KnowThyKT'}</h1><p>${english ? 'Updates to the trainer and its question bank.' : 'История изменений тренажёра и базы вопросов.'}</p></div>
      <div class="training-changelog-list">${entries.map(entry => {
        const text = entry[language];
        const date = dateFormat.format(new Date(entry.date + 'T12:00:00Z'));
        return `<article class="panel training-changelog-entry"><header><time datetime="${entry.date}">${escape(date)}</time>${entry.version ? `<span class="training-changelog-version">${escape(entry.version)}</span>` : ''}</header><h2>${escape(text.title)}</h2><ul>${text.items.map(item => `<li>${escape(item)}</li>`).join('')}</ul></article>`;
      }).join('')}</div>
    </section>`;
  }
  return { render };
});

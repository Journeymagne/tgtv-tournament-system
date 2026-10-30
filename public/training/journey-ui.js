(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function emblem(tier = 1) {
    const steps = Math.min(6, Math.max(1, Number(tier) || 1));
    const chevrons = Array.from({length:Math.min(3, steps)}, (_, i) => `<path d="M36 ${59+i*9}l24 12 24-12"/>`).join('');
    return `<svg class="kt-rank-emblem" viewBox="0 0 120 132" fill="none" aria-hidden="true"><path class="kt-emblem-fill" d="M60 5 109 23v44c0 28-23 45-49 60C34 112 11 95 11 67V23Z"/><path d="M60 13 101 28v39c0 23-19 39-41 52-22-13-41-29-41-52V28Z"/><path d="m60 28 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z"/>${chevrons}${steps>=4?'<path d="M27 50v22m66-22v22M27 79l5 10m61-10-5 10"/>':''}${steps>=5?'<path d="m38 22 7 3m30 0 7-3"/>':''}${steps===6?'<path d="m45 15 3-9 12 7 12-7 3 9"/>':''}</svg>`;
  }
  function achievement(journey, { locale = 'ru', href = '/training#journey', compact = false } = {}) {
    if (!journey) return '';
    const en = locale === 'en';
    const rank = en ? journey.rank.en : journey.rank.name;
    const next = journey.next && (en ? journey.next.en : journey.next.name);
    const recertifying = journey.recertification;
    const progressLabel = recertifying ? (en ? 'Recertification progress' : 'Прогресс переаттестации') : (en ? 'Progress to next rank' : 'Прогресс до следующего ранга');
    const note = recertifying ? (en ? `Title retained · ${journey.recertificationRemaining} course XP to recertify` : `Звание сохранено · ещё ${journey.recertificationRemaining} XP курса до переаттестации`)
      : next ? (en ? `${journey.remaining} course XP to ${next}` : `Ещё ${journey.remaining} XP курса до ранга «${next}»`) : (en ? 'All six ranks unlocked' : 'Все шесть рангов открыты');
    return `<a class="kt-training-achievement ${compact?'is-compact':''}" href="${esc(href)}" data-ui-skip>
      <div class="kt-achievement-seal" data-tier="${journey.rank.tier}">${emblem(journey.rank.tier)}<span>${String(journey.rank.tier).padStart(2,'0')} / 06</span></div>
      <div class="kt-achievement-copy"><span class="kt-achievement-label">${en?'EVOLVING ACHIEVEMENT':'РАСТУЩАЯ АЧИВКА'}</span><strong>Know Thy Kill Team</strong><span class="kt-achievement-rank">${esc(rank)}</span>
      <div class="kt-achievement-progress"><span>${journey.xp} XP</span><span>${recertifying?(en?'RECERTIFICATION':'ПЕРЕАТТЕСТАЦИЯ'):next?`${journey.percent}%`:(en?'MAX RANK':'ВЫСШИЙ РАНГ')}</span></div>
      <div class="kt-xp-track" role="progressbar" aria-label="${progressLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${journey.percent}"><span style="width:${journey.percent}%"></span></div>
      <small>${esc(note)}</small></div><span class="kt-achievement-arrow" aria-hidden="true">↗</span></a>`;
  }
  function teamAchievement(course, { locale = 'ru', compact = false, href } = {}) {
    if (!course || !course.total && !course.earned) return '';
    const en = locale === 'en';
    const title = en ? 'Team expert' : 'Знаток команды';
    const note = course.earned
      ? (en ? 'Achievement earned and retained' : 'Ачивка получена и сохранена')
      : (en ? 'Answer every active team question correctly at least once, across any sessions.' : 'Ответьте верно хотя бы один раз на каждый действующий вопрос команды за любые сессии.');
    return `<a class="kt-training-achievement ${compact ? 'is-compact' : ''}" href="${esc(href || '/training?team=' + encodeURIComponent(course.id) + '#training')}" data-ui-skip>
      <div class="kt-achievement-seal"><img class="kt-team-emblem" src="/kill-team-logos/${esc(encodeURIComponent(course.name))}.webp" alt="" width="92" height="102" loading="lazy" decoding="async"></div>
      <div class="kt-achievement-copy"><span class="kt-achievement-label">${en ? 'TEAM ACHIEVEMENT' : 'АЧИВКА КОМАНДЫ'}</span><strong>${esc(course.name)}</strong><span class="kt-achievement-rank">${title}</span>
      <div class="kt-achievement-progress"><span>${course.solved} / ${course.total}</span><span>${course.earned ? (en ? 'EARNED' : 'ПОЛУЧЕНА') : course.percent + '%'}</span></div>
      <div class="kt-xp-track" role="progressbar" aria-label="${title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${course.percent}"><span style="width:${course.percent}%"></span></div><small>${note}</small></div><span class="kt-achievement-arrow" aria-hidden="true">↗</span></a>`;
  }
  window.KTTrainingJourneyUI = { emblem, achievement, teamAchievement };
})();

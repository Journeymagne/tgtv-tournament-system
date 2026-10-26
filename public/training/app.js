(async function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let api = window.KTTrainingAPI;
  const main = $('#main');
  const emptyState = () => ({ user: null, revision: 0, active: null, history: [], stats: {}, completedCount: 0 });
  let questions, state = emptyState();
  let bankSnapshot, questionMap = new Map();
  let guestJourney, inspectedRank = null;
  const journeyUI = window.KTTrainingJourneyUI;
  const journey = () => state.journey || guestJourney;
  const achievement = () => journeyUI.achievement(journey(), { locale: window.KTUI.locale(), href: '#journey' });
  let busy = false, refreshing = false, pendingStart = null;
  function setBank(bank) {
    bankSnapshot = bank;
    questionMap = new Map(bank.questions.map(q => [q.id, q]));
    questions = bank.questions.filter(q => q.status === 'active');
    guestJourney = bank.journey;
    $('.training-footer span:last-child').textContent = `${questions.length} вопросов · Kill Team 2024`;
  }
  async function accept(result) {
    if (result.bank) setBank(result.bank);
    else if (result.state.bankRevision !== bankSnapshot.revision) setBank(await window.KTTrainingAPI.questions());
    state = result.state;
  }
  const engine = { summary(value) {
    const stats = Object.values(value.stats);
    const available = Object.entries(value.stats).filter(([id]) => questionMap.get(id)?.status === 'active').map(([, item]) => item);
    const attempts = stats.reduce((n, item) => n + item.attempts, 0);
    const correct = stats.reduce((n, item) => n + item.correct, 0);
    return { attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : null,
      seen: available.length, mastered: available.filter(item => item.lastCorrect).length, completed: value.completedCount };
  } };
  try {
    const [bank, identity] = await Promise.all([api.questions(), window.KTCompanion.ready.catch(() => ({ user: null }))]);
    if (!Array.isArray(bank.questions)) throw Error('Не удалось загрузить банк вопросов.');
    setBank(bank);
    if (identity.user) await accept(await api.connect(identity.user));
    else { api = window.KTTrainingGuest(bank); await accept(await api.refresh()); }
  } catch (error) {
    main.replaceChildren();
    const message = document.createElement('p'); message.textContent = error.message;
    const retry = document.createElement('button'); retry.className = 'secondary'; retry.textContent = 'Повторить подключение'; retry.onclick = () => location.reload();
    main.append(message, retry); return;
  }
  let selectedMode = 'mixed';
  let selectedDifficulty = '1';
  let selectedAnswer = null;
  let lastResultId = null;
  let pendingMode = null;
  let bankLevel = 'all';
  let bankTopic = 'all';
  let bankSearch = '';
  let bankMistakes = false;
  let toastTimer;
  const levelNames = { 1: 'Рекрут', 2: 'Боец', 3: 'Ветеран', 4: 'Эксперт' };
  const levels = [
    { id: 1, label: 'Рекрут', note: 'Первые шаги в киллзоне', detail: 'Приказы, фазы и основные действия', rank: 'Ⅰ' },
    { id: 2, label: 'Боец', note: 'Уверенное знание правил', detail: 'Оружие, стрельба и ближний бой', rank: 'Ⅱ' },
    { id: 3, label: 'Ветеран', note: 'Решения под давлением', detail: 'Террейн, миссии и взаимодействия', rank: 'Ⅲ' },
    { id: 4, label: 'Эксперт', note: 'Каждая деталь имеет значение', detail: 'Сложные ситуации и уточнения', rank: 'Ⅳ' }
  ];
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const byId = id => questionMap.get(id);
  const itemQuestion = item => item.question || byId(item.questionId)?.original || byId(item.questionId);
  const formatDate = iso => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const modeName = mode => mode === 'mixed' ? 'Все сложности' : levelNames[mode];
  const score = session => session.items.filter(item => item.correct).length;
  const answered = session => session.items.filter(item => item.selected !== null).length;
  const badge = level => `<span class="badge level-${level}"><span>${'ⅠⅡⅢⅣ'[level - 1]}</span> ${levelNames[level]}</span>`;
  const sourceLink = q => `<a class="source-link" href="${esc(q.source.url)}" target="_blank" rel="noopener noreferrer">${esc(q.source.title)} · ${esc(q.source.section)} <span aria-hidden="true">↗</span></a>`;
  function notify(text) {
    clearTimeout(toastTimer);
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 7000);
  }
  function status(message, error = false) {
    $('#save-status').textContent = message;
    $('#save-status').classList.toggle('save-error', error);
  }
  function updateProfile() {
    $('[data-nav="moderation"]').hidden = !state.user?.isAdmin;
    if (!busy) status(state.user ? 'Прогресс в аккаунте · ' + state.user.name : state.localPersistence ? 'Гостевой прогресс · в этом браузере' : 'Гостевой прогресс · только в этой вкладке');
  }
  function signinPanel() {
    return '<section class="signin-panel"><div><h2>Тренируйтесь без регистрации</h2><p>Гостевой прогресс сохраняется в этом браузере отдельно от аккаунта. Войдите для тренировок с синхронизацией между устройствами.</p></div><a class="button primary" href="' + esc(window.KTCompanion.loginUrl()) + '">Войти через Компаньон</a></section>';
  }
  function busyControls(value) {
    main.setAttribute('aria-busy', String(value));
    if (value) main.querySelectorAll('button').forEach(button => { button.dataset.wasDisabled = String(button.disabled); button.disabled = true; });
    else main.querySelectorAll('[data-was-disabled]').forEach(button => { button.disabled = button.dataset.wasDisabled === 'true'; delete button.dataset.wasDisabled; });
  }
  function connectionError(error) {
    status('Не удалось синхронизировать прогресс', true);
    $('#connection-notice').textContent = error.message;
    $('#connection-notice').hidden = false;
    if (error.status === 401) { state = emptyState(); main.replaceChildren(); location.reload(); }
  }
  async function pull(showMessage = false) {
    if (busy || refreshing) return;
    refreshing = true;
    try {
      const result = await api.refresh(), next = result.state;
      $('#connection-notice').hidden = true;
      if (next.revision >= state.revision && next.user?.id === state.user?.id) {
        const changed = next.revision !== state.revision || next.bankRevision !== bankSnapshot.revision;
        await accept(result);
        if (changed && location.hash !== '#moderation') { render(); if (showMessage) notify('Прогресс или банк вопросов обновлён.'); }
        else updateProfile();
      }
    } catch (error) { connectionError(error); }
    finally { refreshing = false; }
  }
  async function mutate(operation) {
    if (busy) return false;
    busy = true; busyControls(true); status(state.user ? 'Сохраняем в аккаунте…' : 'Сохраняем в браузере…');
    try {
      const previousRank = journey().rank.tier;
      const result = await operation();
      await accept(result);
      if (journey().rank.tier > previousRank) notify('Новый ранг: ' + journey().rank.name + '! Ачивка обновлена.');
      $('#connection-notice').hidden = true;
      status(state.user ? 'Сохранено в аккаунте · ' + state.user.name : state.localPersistence ? 'Сохранено в этом браузере' : 'Прогресс только в этой вкладке');
      return true;
    } catch (error) {
      if (error.status === 409 || error.status === 403) {
        try { await accept(await api.refresh()); render(); } catch (refreshError) { connectionError(refreshError); }
      }
      connectionError(error);
      return false;
    } finally { busy = false; busyControls(false); }
  }
  function changePage(page) {
    if (location.hash === `#${page}`) render();
    else location.hash = page;
  }
  function pageTitle(kicker, title, description, extra = '') {
    return `<div class="page-heading"><div><span class="eyebrow">${kicker}</span><h1>${title}</h1><p class="muted">${description}</p></div>${extra}</div>`;
  }
  function metric(label, value, note, accent = false) {
    return `<div class="metric"><span class="metric-label">${label}</span><strong${accent ? ' class="accent"' : ''}>${value}</strong><span class="metric-note">${note}</span></div>`;
  }
  function journeyPage() {
    const j = journey();
    const summary = engine.summary(state);
    const selectedRank = j.ranks.find(rank => rank.id === inspectedRank) || j.rank;
    const pathPercent = Math.min(100, ((j.rank.tier - 1 + (j.next ? j.percent / 100 : 0)) / 5) * 100);
    main.innerHTML = `<div class="journey-heading"><div><span class="eyebrow">KNOW THY KILL TEAM</span><h1>Ваш путь в киллтиме</h1><p class="muted">От первого вопроса до уверенного знания правил.</p></div><a class="text-link" href="#progress">Подробная статистика ↗</a></div>
      ${!state.user ? signinPanel() : ''}
      ${j.recertification ? `<section class="recertification-notice" role="status"><div><h2>Пора пройти переаттестацию</h2><p>База обновилась. Ваше звание и заработанный опыт сохранены. Подтвердите знания по актуальным вопросам в обычных тренировках.</p><p>Ещё ${j.recertificationRemaining} XP курса до переаттестации</p></div><a class="button secondary" href="#training">Пройти переаттестацию →</a></section>` : ''}
      <div class="journey-overview"><section class="journey-hero"><div><span class="eyebrow">ТЕКУЩИЙ РАНГ · <span data-ui-skip>${String(j.rank.tier).padStart(2, '0')} / 06</span></span><h2>${esc(j.rank.name)}</h2><p>${j.recertification ? 'Звание сохранено. Пройдите переаттестацию по актуальной базе.' : j.next ? `Следующая остановка — <strong>${esc(j.next.name)}</strong>. Каждый разобранный вопрос приближает вас к ней.` : 'Все ранги открыты. Поддерживайте форму и разбирайте ситуации, в которых ещё ошибаетесь.'}</p></div>
      <div class="journey-xp"><strong data-ui-skip>${j.xp.toLocaleString('ru')} <small>XP</small></strong><span>${j.recertification ? `Ещё ${j.recertificationRemaining} XP курса до переаттестации` : j.next ? `Ещё ${j.remaining} XP курса до следующего ранга` : 'Путь пройден'}</span></div>
      <div class="kt-xp-track" role="progressbar" aria-label="${j.recertification ? 'Прогресс переаттестации' : 'Прогресс до следующего ранга'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${j.percent}"><span style="width:${j.percent}%"></span></div>
      <div class="journey-hero-actions"><button class="button primary" data-journey-start>${state.active ? 'Продолжить сессию' : 'Начать тренировку'} <span>→</span></button><a class="button secondary" href="#training">Выбрать сложность</a></div>
      <p class="small muted">${state.active ? `${answered(state.active)} из 20 ответов сохранено · ${esc(modeName(state.active.mode))}` : '20 вопросов · без таймера · с разбором ответов'}</p></section>
      <aside class="journey-achievement"><div id="journey-achievement-card">${achievement()}</div><p>Одна ачивка на весь путь. Её ранг, знак и шкала обновляются после ответов и видны в профиле Компаньона.</p><div class="journey-mini-stats"><div><strong>${j.solved}<small> / ${j.total}</small></strong><span>Решено в актуальной базе</span></div><div><strong>${j.mastered}<small> / ${j.total}</small></strong><span>Закреплено в актуальной базе</span></div></div><p>За всё время: решено ${j.lifetimeSolved}, закреплено ${j.lifetimeMastered}. Ответы на снятые вопросы сохранены.</p></aside></div>
      <section class="journey-map"><div class="section-heading"><div><span class="eyebrow">ШЕСТЬ РАНГОВ · ОДИН ПУТЬ</span><h2>От Нубика до Судьи</h2></div><span class="small muted">Нажмите на ранг, чтобы узнать больше</span></div>
      <ol class="journey-route" style="--path-progress:${pathPercent / 100}">${j.ranks.map(rank => `<li class="${rank.tier < j.rank.tier ? 'reached' : rank.id === j.rank.id ? 'current' : 'locked'}"><button class="journey-stop" data-rank="${rank.id}" aria-pressed="${rank.id === selectedRank.id}"><span class="journey-node">${journeyUI.emblem(rank.tier)}<span class="journey-node-status" aria-hidden="true">${rank.tier < j.rank.tier ? '✓' : String(rank.tier).padStart(2, '0')}</span></span><strong>${esc(rank.name)}</strong><span class="journey-stop-xp" data-ui-skip>${rank.xp.toLocaleString('ru')} XP</span><small>${rank.id === j.rank.id ? 'Вы здесь' : rank.tier < j.rank.tier ? 'Открыт' : 'Впереди'}</small></button></li>`).join('')}</ol>
      <div id="rank-detail" class="rank-detail" role="status" aria-live="polite" data-ui-skip></div></section>
      <div class="journey-bottom"><section class="journey-practice"><div class="section-heading"><div><span class="eyebrow">ЧТО ТРЕНИРОВАТЬ ДАЛЬШЕ</span><h2>Закрепляйте знания</h2></div><span class="small muted">Два верных ответа на вопрос</span></div><div class="journey-levels">${j.levels.map(level => `<button class="journey-level" data-journey-mode="${level.difficulty}"><span class="journey-level-title">${badge(level.difficulty)}<span data-ui-skip>+${level.difficulty * 10} XP</span></span><strong>${level.mastered}<small> / ${level.total}</small></strong><span>вопросов закреплено</span><div class="kt-xp-track"><span style="width:${Math.floor(level.xp / Math.max(1, level.maxXp) * 100)}%"></span></div><span class="journey-level-foot">${level.xp} / ${level.maxXp} XP <b aria-hidden="true">→</b></span></button>`).join('')}</div></section>
      <section class="journey-rules"><span class="eyebrow">КАК РАСТЁТ РАНГ</span><h2>Практика даёт опыт</h2><ul><li>Первый и второй верный ответ на вопрос дают по 10, 20, 30 или 40 XP — в зависимости от сложности.</li><li>После двух верных ответов вопрос закреплён. Дальнейшие повторы помогают тренироваться, но не добавляют XP.</li><li>Заслуженное звание и XP сохраняются. При расширении базы может потребоваться переаттестация.</li><li>«Судья» открывается после двух верных ответов на каждый вопрос актуальной базы: ${j.total} закреплённых вопросов и ${j.maxXp} XP курса.</li><li>Вопросы «СЛОП» и удалённые вопросы не входят в требования курса. Их прежние ответы и XP остаются у вас.</li><li>Шкала курса учитывает только действующие вопросы. XP за снятые вопросы сохраняются в общем опыте.</li></ul><a class="text-link" href="#bank">Разобрать вопросы →</a></section></div>
      <section class="journey-footer-stats">${metric('СЕССИЙ ЗАВЕРШЕНО', summary.completed, 'Каждая — 20 вопросов')}${metric('ТОЧНОСТЬ ОТВЕТОВ', summary.accuracy === null ? '—' : `${summary.accuracy}%`, 'За всё время')}${metric('ЕСТЬ ЧТО ПОВТОРИТЬ', summary.seen - summary.mastered, 'Последний ответ был неверным')}</section>`;
    function showRank(rank) {
      const reached = rank.tier <= j.rank.tier;
      const en = window.KTUI.locale() === 'en';
      const notes = ['First step into the killzone', 'The rules are coming together', 'A solid foundation', 'Confidently working through situations', 'You know which details matter', 'The entire current course reinforced'];
      const detail = reached ? (j.recertification && rank.tier > j.qualifiedRank.tier ? (en ? 'Title retained. Recertification is pending.' : 'Звание сохранено. Ожидается переаттестация.') : rank.id === j.rank.id ? (en ? 'This is your current rank.' : 'Это ваш текущий ранг.') : (en ? 'This stage is complete.' : 'Этот этап уже пройден.'))
        : en ? `Requires ${rank.xp} course XP. Earn another ${rank.xp - j.courseXp} course XP to unlock.` : `Для открытия нужно ${rank.xp} XP курса. Осталось набрать ${rank.xp - j.courseXp} XP курса.`;
      const note = j.recertification && rank.tier > j.qualifiedRank.tier && reached ? (en ? 'Previously earned title' : 'Ранее достигнутое звание') : en ? notes[rank.tier - 1] : rank.note;
      $('#rank-detail').innerHTML = `<span class="rank-detail-symbol" aria-hidden="true">${reached ? '✓' : '⌖'}</span><div><strong>${esc(en ? rank.en : rank.name)}</strong><p>${esc(note)}. ${detail}</p></div><span class="rank-detail-total">${rank.xp.toLocaleString(en ? 'en' : 'ru')} XP</span>`;
      main.querySelectorAll('[data-rank]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.rank === rank.id)));
      window.KTUI.translate($('#rank-detail'));
    }
    showRank(selectedRank);
    main.querySelectorAll('[data-rank]').forEach(button => button.addEventListener('click', () => { inspectedRank = button.dataset.rank; showRank(j.ranks.find(rank => rank.id === inspectedRank)); }));
    main.querySelector('[data-journey-start]').addEventListener('click', () => state.active ? changePage('session') : startSession(j.recommendedMode));
    main.querySelectorAll('[data-journey-mode]').forEach(button => button.addEventListener('click', () => { selectedMode = selectedDifficulty = button.dataset.journeyMode; changePage('training'); }));
  }
  function training() {
    const stats = engine.summary(state);
    main.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">KILL TEAM 2024 · ПОДГОТОВКА К ИГРЕ</span><h1>KNOW THY <span>KILL TEAM</span></h1><p>Проверьте знание правил, разберите сложные ситуации и подготовьтесь к следующей игре. Ваш прогресс — в аккаунте Компаньона.</p><div class="hero-meta"><span><strong>${questions.length}</strong> вопросов</span><span><strong>4</strong> сложности</span><span><strong>20</strong> в сессии</span></div></div><span class="hero-emblem" aria-hidden="true">D6</span></section>
      ${!state.user ? signinPanel() : ''}
      <section class="metrics" aria-label="Ваш прогресс">${metric('ИЗУЧЕНО ВОПРОСОВ', `${stats.seen}<small> / ${questions.length}</small>`, 'Уникальные вопросы с ответом')}${metric('ТОЧНОСТЬ', stats.accuracy === null ? '—' : `${stats.accuracy}<small>%</small>`, stats.attempts ? `${stats.correct} верных из ${stats.attempts} ответов` : 'Начните первую тренировку', true)}${metric('ЗАВЕРШЕНО СЕССИЙ', String(stats.completed).padStart(2, '0'), 'Каждая — 20 вопросов')}${metric('НУЖНО ПОВТОРИТЬ', String(stats.seen - stats.mastered).padStart(2, '0'), 'Последний ответ был неверным')}</section>
      ${state.active ? `<section class="resume-card"><div><span class="eyebrow">СЕССИЯ СОХРАНЕНА</span><strong>${esc(modeName(state.active.mode))} · ${answered(state.active)} из 20 ответов</strong><span class="small muted">Можно продолжить с того же места.</span></div><button class="button secondary" data-action="resume">Продолжить <span>→</span></button></section>` : ''}
      ${bankSnapshot.questions.some(q => q.status === 'review') ? `<p class="moderation-notice">На проверке: ${bankSnapshot.questions.filter(q => q.status === 'review').length}. Эти вопросы временно исключены из сессий.</p>` : ''}<section class="training-setup"><div class="section-heading"><div><span class="eyebrow">ВЫБЕРИТЕ УРОВЕНЬ ПОДГОТОВКИ</span><h2>Следующая операция</h2></div><span class="small muted">Четыре уровня сложности</span></div>
      <div class="levels" role="group" aria-label="Сложность сессии">${levels.map(level => {
        const pool = questions.filter(q => q.difficulty === level.id);
        const known = pool.filter(q => state.stats[q.id]?.lastCorrect).length;
        return `<button class="level-card level-${level.id} ${String(selectedMode) === String(level.id) ? 'selected' : ''}" data-mode="${level.id}" aria-pressed="${String(selectedMode) === String(level.id)}"><div class="level-card-top"><span class="rank">${level.rank}</span><span class="selection-mark" aria-hidden="true">${String(selectedMode) === String(level.id) ? '✓' : '+'}</span></div><span class="level-number">УРОВЕНЬ 0${level.id}</span><h3>${level.label}</h3><p>${level.detail}</p><div class="level-progress"><span style="width:${Math.round(known / Math.max(1, pool.length) * 100)}%"></span></div><span class="level-foot"><span>${level.note}</span><span>${known}/${pool.length}</span></span></button>`;
      }).join('')}</div>
      <div class="launch-panel"><button class="mixed-toggle ${selectedMode === 'mixed' ? 'selected' : ''}" data-mode="mixed" role="checkbox" aria-checked="${selectedMode === 'mixed'}"><span class="toggle-check" aria-hidden="true">${selectedMode === 'mixed' ? '✓' : ''}</span><span><strong>Смешанная подготовка</strong><small>Случайные вопросы всех четырёх уровней</small></span></button><button class="button primary launch-button" data-action="start">Начать сессию <span>↗</span></button></div>
      <p class="session-hint"><span>⊙</span> 20 случайных вопросов без повторов · Без таймера · Разбор после каждого ответа</p></section>
      <section class="bottom-note"><span class="note-symbol">i</span><div><strong>Знание правила важнее удачного броска.</strong><p>У каждого вопроса есть объяснение и источник. Ошибки сохраняются, чтобы вы могли вернуться к ним в своём темпе.</p></div><a href="#sources" class="text-link">О базе правил ↗</a></section>`;
    main.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
      const mode = button.dataset.mode;
      if (mode === 'mixed') selectedMode = selectedMode === 'mixed' ? selectedDifficulty : 'mixed';
      else selectedMode = selectedDifficulty = mode;
      training();
      main.querySelector(`[data-mode="${mode}"]`).focus({ preventScroll: true });
    }));
    main.querySelector('[data-action="start"]').addEventListener('click', () => startSession(selectedMode));
    main.querySelector('[data-action="resume"]')?.addEventListener('click', () => changePage('session'));
  }
  async function startSession(mode, replaceActive = false) {
    if (busy) return;
    if (questions.filter(q => mode === 'mixed' || q.difficulty === Number(mode)).length < 20) { notify('Для сессии нужно 20 доступных вопросов. Выберите другой уровень или смешанную подготовку.'); return; }
    if (state.active && !replaceActive) { pendingMode = mode; $('#confirm-dialog').showModal(); return; }
    if (!pendingStart || pendingStart.mode !== String(mode) || pendingStart.revision !== state.revision) {
      pendingStart = { sessionId: crypto.randomUUID(), mode: String(mode), replaceSessionId: state.active?.id || null, revision: state.revision };
    }
    if (await mutate(() => api.start(pendingStart))) {
      pendingStart = null; selectedAnswer = null; changePage('session');
    }
  }
  function sessionPage() {
    if (!state.active) { changePage('training'); return; }
    const session = state.active;
    const count = answered(session);
    const index = Math.min(19, Math.max(0, Number.isInteger(session.cursor) ? session.cursor : count));
    const item = session.items[index];
    const q = itemQuestion(item);
    if (item.skipped) {
      main.innerHTML = `<section class="panel moderation-empty"><span class="eyebrow">ВОПРОС СНЯТ С ВЫДАЧИ</span><h1>Этот вопрос пропущен</h1><p>Он отправлен на модерацию или удалён. Подходящих замен без повторов сейчас нет. Ошибка и штраф не начисляются.</p><button class="button primary" id="skip-question">${index === 19 ? 'Результаты сессии' : 'Следующий вопрос'}</button></section>`;
      $('#skip-question').addEventListener('click', async () => {
        if (await mutate(() => api.advance(session.id, { questionId: item.questionId, revision: state.revision }))) {
          if (index === 19) { lastResultId = session.id; changePage('results'); } else render();
        }
      });
      return;
    }
    const submitted = item.selected !== null;
    if (submitted) selectedAnswer = item.selected;
    main.innerHTML = `<section class="session-view"><div class="session-top"><a href="#training" class="text-link">← К тренировкам</a><span class="small muted">${esc(modeName(session.mode))} <span class="divider">/</span> Без таймера</span></div>
      <div class="session-rank-strip"><a href="#journey">${esc(journey().rank.name)} <span>↗</span></a><strong data-ui-skip>${journey().xp} XP</strong><span>${journey().recertification ? `Ещё ${journey().recertificationRemaining} XP курса до переаттестации` : journey().next ? `До следующего ранга: ${journey().remaining} XP` : 'Все ранги открыты'}</span></div>
      <div class="question-tracker"><span class="eyebrow">ВОПРОС <strong>${String(index + 1).padStart(2, '0')}</strong> / 20</span><span class="small muted">${count} проверено <span class="divider">·</span> ${score(session)} верно</span></div>
      <div class="question-steps" aria-label="${count} из 20 вопросов проверено">${session.items.map((i, n) => `<span title="Вопрос ${n + 1}${i.selected === null ? '' : i.correct ? ': верно' : ': ошибка'}" class="${n === index ? 'current ' : ''}${i.selected === null ? '' : i.correct ? 'correct' : 'incorrect'}"></span>`).join('')}</div>
      <article class="question-card"><div class="question-tags">${badge(q.difficulty)}<span class="topic">${esc(q.topic)}</span><span class="question-id">${q.id.toUpperCase()}</span></div><h1 class="question-title" data-ui-skip>${esc(q.question)}</h1><p class="question-instruction">Один правильный ответ. Специальные исключения действуют только если указаны в условии.</p>
      <div class="answers" role="group" aria-label="Варианты ответа">${item.optionOrder.map((option, n) => `<button class="answer ${selectedAnswer === option ? 'chosen' : ''} ${submitted && option === q.answer ? 'right' : ''} ${submitted && option === item.selected && !item.correct ? 'wrong' : ''}" data-option="${option}" aria-pressed="${selectedAnswer === option}" ${submitted ? 'disabled' : ''}><span class="answer-key" data-ui-skip translate="no">${'ABCD'[n]}</span><span data-ui-skip>${esc(q.options[option])}</span>${submitted && option === q.answer ? '<span class="answer-symbol">✓<span class="sr-only"> Правильный ответ</span></span>' : submitted && option === item.selected ? '<span class="answer-symbol">×<span class="sr-only"> Ваш ответ неверный</span></span>' : ''}</button>`).join('')}</div>
      ${submitted ? `<div class="explanation ${item.correct ? 'success' : 'error'}" role="status"><span class="explanation-icon">${item.correct ? '✓' : '×'}</span><div><h2>${item.correct ? 'Верно. Так держать.' : 'Есть что разобрать.'}</h2>${!item.correct ? `<p><strong>Правильный ответ:</strong> ${esc(q.options[q.answer])}</p>` : ''}<p data-ui-skip>${esc(q.explanation)}</p>${sourceLink(q)}</div></div>` : ''}
      <div class="question-actions"><span class="small muted">${submitted ? 'Ответ сохранён в аккаунте' : 'Выберите вариант и проверьте решение'}</span><div class="question-action-buttons">${reportControl(q, 'Этот вопрос СЛОП')}${submitted ? `<button class="button primary" id="next-question">${index === 19 ? 'Результаты сессии' : 'Следующий вопрос'} <span>→</span></button>` : `<button class="button primary" id="check-answer" ${selectedAnswer === null ? 'disabled' : ''}>Проверить ответ <span>↗</span></button>`}</div></div></article><p class="small muted session-footnote">Сессия сохраняется в аккаунте после каждого проверенного ответа. Продолжить можно на любом устройстве.</p></section>`;
    main.querySelectorAll('[data-option]').forEach(button => button.addEventListener('click', () => {
      selectedAnswer = Number(button.dataset.option);
      main.querySelectorAll('[data-option]').forEach(b => { b.classList.toggle('chosen', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      $('#check-answer').disabled = false;
    }));
    $('#check-answer')?.addEventListener('click', async () => {
      const selection = selectedAnswer;
      if (await mutate(() => api.answer(session.id, { questionId: q.id, questionVersion: q.version || 1, selected: selection, revision: state.revision }))) {
        render(); $('#next-question')?.focus({ preventScroll: true });
      }
    });
    $('#next-question')?.addEventListener('click', async () => {
      if (await mutate(() => api.advance(session.id, { questionId: q.id, revision: state.revision }))) {
        selectedAnswer = null;
        if (index === 19) { lastResultId = session.id; changePage('results'); }
        else { render(); $('.question-title')?.setAttribute('tabindex', '-1'); $('.question-title')?.focus({ preventScroll: true }); }
      }
    });
  }
  function reviewCard(item, index = 0) {
    const q = itemQuestion(item);
    return `<details class="review-item"><summary><span class="review-status ${item.correct ? 'correct' : 'incorrect'}">${item.correct ? '✓' : '×'}</span><span data-ui-skip>${esc(q.question)}</span><span class="details-arrow" aria-hidden="true">+</span></summary><div class="review-body">${badge(q.difficulty)}<p class="muted">Ваш ответ: ${esc(q.options[item.selected])}</p><p class="correct-text">Правильный ответ: ${esc(q.options[q.answer])}</p><p data-ui-skip>${esc(q.explanation)}</p>${sourceLink(q)}<div class="question-report">${reportControl(q)}</div></div></details>`;
  }
  function resultsPage() {
    const result = state.history.find(s => s.id === lastResultId) || state.history.find(s => s.status === 'completed');
    if (!result) { changePage('training'); return; }
    const correct = score(result);
    const total = answered(result);
    const percentage = Math.round(correct / Math.max(1, total) * 100);
    const mistakes = result.items.filter(i => i.selected !== null && !i.correct);
    main.innerHTML = `${pageTitle(result.status === 'completed' ? 'ОПЕРАЦИЯ ЗАВЕРШЕНА' : 'СЕССИЯ ЗАВЕРШЕНА ДОСРОЧНО', 'Разбор полётов', `${esc(modeName(result.mode))} · ${formatDate(result.finishedAt)}`)}
      <section class="result-panel"><div class="result-ring" style="--percent:${percentage}%"><div><strong>${percentage}<small>%</small></strong><span>ТОЧНОСТЬ</span></div></div><div class="result-copy"><span class="eyebrow">${correct === 20 ? 'БЕЗУПРЕЧНАЯ ПОДГОТОВКА' : percentage >= 75 ? 'УВЕРЕННАЯ РАБОТА' : 'КАЖДЫЙ РАЗБОР ДЕЛАЕТ ВАС СИЛЬНЕЕ'}</span><h2>${correct} из ${total} ответов верны</h2><p class="muted">${mistakes.length ? `Разберите ${mistakes.length} ошибок ниже. Вопросы доступны и в разделе «База вопросов».` : 'Отличный результат. Попробуйте другой уровень или новую случайную сессию.'}${result.status === 'abandoned' ? ' Эта сессия не учитывается как завершённая.' : ''}</p><div class="result-actions"><button class="button primary" id="again">Ещё одна сессия <span>↗</span></button><a class="button secondary" href="#progress">Мой прогресс</a></div></div></section>
      <div class="result-journey">${achievement()}<a class="button secondary" href="#journey">Посмотреть мой путь →</a></div>
      <div class="section-heading"><h2>Разбор ответов</h2><label class="checkbox-label"><input type="checkbox" id="only-errors" ${mistakes.length ? 'checked' : ''}> Только ошибки</label></div><div id="review-list">${(mistakes.length ? mistakes : result.items.filter(i => i.selected !== null)).map(reviewCard).join('')}</div>`;
    $('#again').addEventListener('click', () => startSession(result.mode));
    $('#only-errors').addEventListener('change', event => { $('#review-list').innerHTML = (event.target.checked ? mistakes : result.items.filter(i => i.selected !== null)).map(reviewCard).join('') || '<div class="empty-state"><span>✓</span><h3>Ошибок нет</h3><p>В этой сессии все проверенные ответы верны.</p></div>'; });
  }
  function topicStats() {
    return [...new Set(questions.map(q => q.topic))].map(topic => {
      const items = questions.filter(q => q.topic === topic);
      const attempts = items.reduce((n, q) => n + (state.stats[q.id]?.attempts || 0), 0);
      const correct = items.reduce((n, q) => n + (state.stats[q.id]?.correct || 0), 0);
      return { topic, count: items.length, attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : null };
    });
  }
  function progressPage() {
    const stats = engine.summary(state);
    const completed = state.history.filter(s => s.status === 'completed');
    const weak = topicStats().filter(s => s.attempts).sort((a, b) => a.accuracy - b.accuracy)[0];
    main.innerHTML = `${pageTitle('ЛИЧНАЯ СТАТИСТИКА', 'Ваш прогресс', 'Каждый проверенный ответ учитывается сразу, даже в незавершённой сессии.', '<button class="button secondary" id="progress-refresh">Обновить ↻</button>')}
      <section class="metrics">${metric('ОБЩАЯ ТОЧНОСТЬ', stats.accuracy === null ? '—' : `${stats.accuracy}<small>%</small>`, `${stats.correct} верных / ${stats.attempts} попыток`, true)}${metric('ОХВАТ БАЗЫ', `${stats.seen}<small> / ${questions.length}</small>`, 'Вопросы, на которые вы ответили')}${metric('ВЕРНО В ПОСЛЕДНИЙ РАЗ', stats.mastered, 'Число вопросов с последним верным ответом')}${metric('ПОЛНЫХ СЕССИЙ', stats.completed, 'По 20 проверенных ответов')}</section>
      <div class="progress-grid"><section class="panel"><div class="section-heading"><h2>Подготовка по темам</h2><span class="eyebrow">ТОЧНОСТЬ</span></div>${topicStats().map(t => `<div class="topic-stat"><div><span>${esc(t.topic)}</span><strong>${t.accuracy === null ? '—' : `${t.accuracy}%`}</strong></div><div class="bar"><span style="width:${t.accuracy || 0}%"></span></div><span class="small muted">${t.attempts ? `${t.correct} верных из ${t.attempts} ответов` : `${t.count} вопросов · ещё не изучали`}</span></div>`).join('')}</section>
      <div><section class="panel recommendation"><span class="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><span class="recommendation-icon">⌖</span><h2>${weak ? esc(weak.topic) : 'Время первой сессии'}</h2><p class="muted">${weak ? `Точность по теме — ${weak.accuracy}%. Повторите вопросы этой темы и закрепите знания.` : 'Выберите сложность и пройдите 20 вопросов. Здесь появится ваша статистика.'}</p><button class="button secondary full" id="recommendation-action">${weak ? 'Повторить тему' : 'К тренировкам'} <span>→</span></button></section><section class="panel recent-panel"><div class="section-heading"><h2>Последние сессии</h2></div>${completed.length ? `<div class="chart" aria-label="Точность последних ${Math.min(8, completed.length)} завершённых сессий">${completed.slice(0, 8).reverse().map((s, i) => `<div class="chart-column"><span>${score(s) * 5}%</span><div class="chart-track"><div style="height:${score(s) * 5}%"></div></div><small>${i + 1}</small></div>`).join('')}</div><p class="small muted">От более ранней к последней, до 8 сессий.</p>` : '<p class="muted">График появится после завершения первой сессии.</p>'}</section></div></div>
      <div class="section-heading"><h2>Журнал тренировок</h2><span class="small muted">${state.history.length} записей · последние 100</span></div>${state.history.length ? `<div class="history-list">${state.history.map(s => `<button class="history-row" data-result="${esc(s.id)}"><span class="history-icon">${s.status === 'completed' ? '✓' : '↩'}</span><span><strong>${esc(modeName(s.mode))}</strong><small>${formatDate(s.finishedAt)}${s.status !== 'completed' ? ' · Досрочно' : ''}</small></span><span class="history-score">${score(s)}<small> / ${answered(s)}</small></span><span class="history-link">Разбор →</span></button>`).join('')}</div>` : '<div class="empty-state"><span>▥</span><h3>Журнал пока пуст</h3><p>Завершите первую тренировку — результат появится здесь.</p><a class="text-link" href="#training">Начать подготовку →</a></div>'}`;
    $('#progress-refresh').addEventListener('click', () => pull(true));
    $('#recommendation-action').addEventListener('click', () => { if (weak) { bankTopic = weak.topic; bankLevel = 'all'; bankSearch = ''; bankMistakes = false; changePage('bank'); } else changePage('training'); });
    main.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => { lastResultId = button.dataset.result; changePage('results'); }));
  }
  function bankPage() {
    main.innerHTML = `${pageTitle('АРХИВ ПОДГОТОВКИ', 'База вопросов', `${questions.length} учебных ситуаций. Просмотр ответов здесь не влияет на статистику тренировок.`)}
      <div class="bank-filters"><label class="search-field"><span class="sr-only">Поиск по вопросам</span><span aria-hidden="true">⌕</span><input type="search" id="bank-search" placeholder="Найти правило, термин или ситуацию…" value="${esc(bankSearch)}"></label><label><span class="sr-only">Сложность</span><select id="bank-level"><option value="all">Все сложности</option>${levels.map(l => `<option value="${l.id}" ${String(l.id) === bankLevel ? 'selected' : ''}>${l.label}</option>`).join('')}</select></label><label><span class="sr-only">Тема</span><select id="bank-topic"><option value="all">Все темы</option>${topicStats().map(t => `<option ${t.topic === bankTopic ? 'selected' : ''}>${esc(t.topic)}</option>`).join('')}</select></label></div>
      <div class="bank-summary"><span class="small muted" id="bank-count"></span><label class="checkbox-label"><input type="checkbox" id="bank-mistakes" ${bankMistakes ? 'checked' : ''}> Мои ошибки</label></div><div id="bank-list"></div>`;
    $('#bank-search').addEventListener('input', e => { bankSearch = e.target.value; renderBankList(); });
    $('#bank-level').addEventListener('change', e => { bankLevel = e.target.value; renderBankList(); });
    $('#bank-topic').addEventListener('change', e => { bankTopic = e.target.value; renderBankList(); });
    $('#bank-mistakes').addEventListener('change', e => { bankMistakes = e.target.checked; renderBankList(); });
    renderBankList();
  }
  function renderBankList() {
    const search = bankSearch.trim().toLocaleLowerCase('ru');
    const list = questions.filter(q => (bankLevel === 'all' || q.difficulty === Number(bankLevel)) && (bankTopic === 'all' || q.topic === bankTopic) && (!bankMistakes || state.stats[q.id] && !state.stats[q.id].lastCorrect) && `${q.id} ${q.question} ${q.topic} ${q.options.join(' ')} ${q.explanation}`.toLocaleLowerCase('ru').includes(search));
    $('#bank-count').textContent = `${list.length} из ${questions.length} вопросов`;
    $('#bank-list').innerHTML = list.map(q => `<details class="bank-item"><summary><span class="bank-item-id">${q.id.slice(-3)}</span><span class="bank-item-main"><span class="bank-item-meta">${badge(q.difficulty)}<span class="small muted">${esc(q.topic)}</span>${state.stats[q.id] ? `<span class="small ${state.stats[q.id].lastCorrect ? 'correct-text' : 'error-text'}">${state.stats[q.id].lastCorrect ? '✓' : '×'}</span>` : ''}</span><strong data-ui-skip>${esc(q.question)}</strong></span><span class="details-arrow" aria-hidden="true">+</span></summary><div class="bank-item-body"><ol class="bank-options" data-ui-skip type="A">${q.options.map((o, i) => `<li class="${i === q.answer ? 'correct-text' : ''}">${esc(o)}${i === q.answer ? ' ✓' : ''}</li>`).join('')}</ol><div class="bank-explanation"><strong>Почему так</strong><p data-ui-skip>${esc(q.explanation)}</p>${sourceLink(q)}</div><div class="question-report">${reportControl(q)}</div></div></details>`).join('') || `<div class="empty-state"><span>⌕</span><h3>${bankMistakes ? 'Подходящих ошибок нет' : 'Ничего не найдено'}</h3><p>Попробуйте изменить поиск или фильтры.</p><button class="button secondary" id="clear-filters">Сбросить фильтры</button></div>`;
    $('#clear-filters')?.addEventListener('click', () => { bankSearch = ''; bankLevel = 'all'; bankTopic = 'all'; bankMistakes = false; bankPage(); });
  }
  function sourcesPage() {
    const official = [...new Map(questions.filter(q => q.source.url.includes('warhammer-community')).map(q => [q.source.url, q.source])).values()];
    main.innerHTML = `${pageTitle('РАЗВЕДДАННЫЕ', 'Откуда берутся правила', 'Редакция Kill Team 2024 (третья). Вопросы проверены 15–16 октября 2026.')}
      <section class="source-intro panel"><span class="eyebrow">ГРАНИЦЫ УЧЕБНОГО КУРСА</span><h2>${questions.length} вопросов о правилах, которые встречаются за столом</h2><p>Базовая последовательность игры, действия, стрельба и ближний бой, оружие, террейн, универсальное снаряжение и отдельные ситуации Approved Ops 2025. Вопросы о конкретном наборе миссий или киллзоне называют его в условии.</p><p class="muted">Это выборочный учебный банк, а не полный текст книги и не проверка правил всех фракций. Специальные правила команд могут менять общий порядок. Вопросы написаны самостоятельно, с пояснениями и ссылкой на нужный раздел.</p></section>
      <div class="source-grid"><a class="source-card" href="https://www.warhammer-community.com/en-gb/downloads/kill-team/" target="_blank" rel="noopener noreferrer"><span class="eyebrow">01 / ОФИЦИАЛЬНЫЕ МАТЕРИАЛЫ</span><h2>Warhammer Community <span>↗</span></h2><p>Официальные правила, обновления и комментарии разработчиков. При расхождении приоритет у актуального официального документа.</p><span class="source-domain">warhammer-community.com</span></a><a class="source-card" href="https://wahapedia.ru/kill-team3/the-rules/core-rules/" target="_blank" rel="noopener noreferrer"><span class="eyebrow">02 / СПРАВОЧНИК</span><h2>Wahapedia <span>↗</span></h2><p>Полные общие правила третьей редакции, приложение с оружием, террейн и Approved Ops. Удобная навигация по отдельным правилам.</p><span class="source-domain">wahapedia.ru / kill-team3</span></a></div>
      <section class="panel"><div class="section-heading"><h2>Документы, использованные в вопросах</h2></div><div class="document-list">${official.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span>PDF</span><strong>${esc(s.title)}</strong><span>↗</span></a>`).join('')}<a href="https://wahapedia.ru/kill-team3/the-rules/appendix/" target="_blank" rel="noopener noreferrer"><span>WEB</span><strong>Wahapedia · Appendix / Weapon rules</strong><span>↗</span></a><a href="https://wahapedia.ru/kill-team3/the-rules/killzones/" target="_blank" rel="noopener noreferrer"><span>WEB</span><strong>Wahapedia · Killzones</strong><span>↗</span></a><a href="https://wahapedia.ru/kill-team3/the-rules/approved-ops-2025/" target="_blank" rel="noopener noreferrer"><span>WEB</span><strong>Wahapedia · Approved Ops 2025</strong><span>↗</span></a></div></section>
      <section class="source-notes"><h2>Как проверяли банк</h2><p>Использованы локальные материалы проекта: справочники Combat Lab и архив Warhammer Community от 25.09.2026. Упрощённые Lite Rules сверены с общими правилами; допущения калькулятора не приняты за официальные правила. Core Rules Update Log проверен в редакции June ’26. Миссионные уточнения сверены по Approved Ops 2025.</p><p class="muted">Это датированный снимок: банк не обновляется автоматически при выходе новых правил. Ссылка у каждого ответа помогает проверить первоисточник. Названия Kill Team и Warhammer принадлежат Games Workshop; проект не связан с Games Workshop.</p></section>`;
  }
  function render() {
    updateProfile();
    selectedAnswer = null;
    const route = location.hash.slice(1) || 'journey';
    const activeNav = ['session', 'results'].includes(route) ? 'training' : route;
    document.querySelectorAll('[data-nav]').forEach(a => { const active = a.dataset.nav === activeNav; a.classList.toggle('active', active); if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#breadcrumb').textContent = { journey: 'МОЙ ПУТЬ', training: 'ТРЕНИРОВКА', session: 'АКТИВНАЯ СЕССИЯ', results: 'РЕЗУЛЬТАТЫ', progress: 'МОЙ ПРОГРЕСС', bank: 'БАЗА ВОПРОСОВ', sources: 'ИСТОЧНИКИ', moderation: 'МОДЕРАЦИЯ' }[route] || 'МОЙ ПУТЬ';
    ({ journey: journeyPage, training, session: sessionPage, results: resultsPage, progress: progressPage, bank: bankPage, sources: sourcesPage, moderation: moderationPage }[route] || journeyPage)();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function reportControl(q, label) {
    const current = byId(q.id);
    if (current?.status !== 'active') return `<span class="moderation-status">${current?.status === 'review' ? 'На модерации' : 'Удалён из пула'}</span>`;
    if ((q.version || 1) !== current.version) return '<span class="moderation-status">Вопрос уже исправлен</span>';
    if (!state.user) return `<a class="button secondary slop-button" href="${esc(window.KTCompanion.loginUrl())}">Войти и оспорить · Слоп</a>`;
    return `<button type="button" class="button secondary slop-button" data-report="${esc(q.id)}">${label ? esc(label) : 'Слоп <span class="small">· Оспорить вопрос</span>'}</button>`;
  }
  let pendingReport = null;
  main.addEventListener('click', event => {
    const button = event.target.closest('[data-report]');
    if (!button || busy) return;
    const question = byId(button.dataset.report);
    if (!question || !state.user) return;
    pendingReport = { id: question.id, questionVersion: question.version, questionRevision: question.revision, requestId: crypto.randomUUID() };
    $('#report-question').textContent = `${question.id.toUpperCase()} · ${question.question}`;
    $('#report-comment').value = ''; $('#report-error').textContent = '';
    $('#report-dialog').showModal(); $('#report-comment').focus();
  });
  $('#report-cancel').addEventListener('click', () => $('#report-dialog').close());
  $('#report-dialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('#report-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!pendingReport || busy) return;
    $('#report-submit').disabled = true; $('#report-cancel').disabled = true;
    const report = { ...pendingReport, comment: $('#report-comment').value };
    if (await mutate(() => window.KTTrainingAPI.report(report.id, report))) {
      $('#report-dialog').close(); pendingReport = null; render();
      notify('Вопрос снят с выдачи и отправлен на модерацию.');
    } else $('#report-error').textContent = $('#connection-notice').textContent;
    $('#report-submit').disabled = false; $('#report-cancel').disabled = false;
  });
  const moderation = window.KTTrainingModeration({ main, api: window.KTTrainingAPI, esc, notify,
    onChange: async () => { await accept(await api.refresh()); updateProfile(); } });
  function moderationPage() {
    if (!state.user?.isAdmin) { changePage('journey'); return; }
    moderation.open();
  }
  $('#confirm-cancel').addEventListener('click', () => { $('#confirm-dialog').close(); pendingMode = null; changePage('session'); });
  $('#confirm-accept').addEventListener('click', async () => {
    const mode = pendingMode || 'mixed';
    $('#confirm-dialog').close(); pendingMode = null;
    await startSession(mode, true);
  });
  $('.skip-link').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView({ block: 'start' }); });
  window.addEventListener('hashchange', render);
  window.addEventListener('kt:locale', () => { if (!location.hash || location.hash === '#journey') journeyPage(); });
  window.addEventListener('focus', () => pull(true));
  window.addEventListener('online', () => pull(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(true); });
  window.addEventListener('pageshow', event => { if (event.persisted) pull(true); });
  setInterval(() => { if (!document.hidden) pull(true); }, 20000);
  render();
})();

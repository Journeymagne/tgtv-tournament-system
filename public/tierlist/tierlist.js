(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const ranks = ['S', 'A', 'B', 'C', 'F'];
  const zoneKeys = [...ranks, 'pool'];
  const copy = {
    heading: ['Тирлисты', 'Tier lists'], intro: ['Ваша оценка команд — в контексте сезона.', 'Your team rankings, in the context of a season.'],
    myLists: ['Мои тирлисты', 'My tier lists'], newList: ['Новый тирлист', 'New tier list'], loading: ['Загрузка каталога…', 'Loading the catalog…'],
    retry: ['Повторить', 'Retry'], settings: ['Настройки тирлиста', 'Tier list settings'], titleLabel: ['Название', 'Title'], titlePlaceholder: ['Мой тирлист', 'My tier list'],
    seasonLabel: ['Сезон оценки', 'Ranking season'], save: ['Сохранить', 'Save'], saveCopy: ['Сохранить копию', 'Save a copy'], undo: ['Отменить ход', 'Undo move'],
    reset: ['Вернуть вниз', 'Return all to pool'], export: ['Экспорт JSON', 'Export JSON'], import: ['Импорт JSON', 'Import JSON'], pictureSize: ['Размер', 'Size'],
    showNames: ['Названия', 'Names'], recordMode: ['Для записи', 'Recording view'], exitRecording: ['Вернуть управление · Esc', 'Show controls · Esc'],
    tiers: ['Тиры команд', 'Team tiers'], pool: ['Для распределения', 'Unranked'], searchLabel: ['Найти команду', 'Find a team'], searchPlaceholder: ['Найти команду…', 'Find a team…'],
    noResults: ['По этому запросу команд нет.', 'No teams match this search.'],
    help: ['Перетащите фигурку или выберите её и нажмите букву тира. S / A / B / C / F — переместить, 0 — вернуть вниз, Esc — снять выбор. Ctrl+Z — отменить.', 'Drag a miniature, or select it and choose a tier. S / A / B / C / F — move, 0 — return to pool, Esc — clear selection. Ctrl+Z — undo.'],
    restoreGuest: ['Открыть гостевой черновик', 'Open guest draft'], filterSeason: ['Фильтр по сезону', 'Filter by season'], allSeasons: ['Все сезоны', 'All seasons'],
    refresh: ['Обновить', 'Refresh'], close: ['Закрыть', 'Close'], cancel: ['Отмена', 'Cancel'], continue: ['Продолжить', 'Continue'], delete: ['Удалить', 'Delete'],
    guest: ['Можно распределять команды без входа. Войдите в KT Companion, чтобы сохранить тирлист в профиле.', 'You can rank teams without signing in. Sign in to KT Companion to save this tier list to your profile.'],
    authUnavailable: ['Не удалось проверить вход. Черновик сохраняется в этом браузере; повторите проверку перед сохранением в профиль.', 'Could not verify your session. Your draft is stored in this browser; retry before saving it to your profile.'],
    loginSave: ['Войти и сохранить', 'Sign in to save'], unsaved: ['Есть изменения', 'Unsaved changes'], draft: ['Черновик', 'Draft'],
    saving: ['Сохранение…', 'Saving…'], saved: ['Сохранено в профиле', 'Saved to profile'], browserDraft: ['Черновик автоматически сохраняется в этом браузере. Для переноса используйте JSON.', 'Your draft is saved automatically in this browser. Use JSON to transfer it.'],
    scopedDraft: ['Черновик в этом браузере относится только к вашему аккаунту. Сохраните его в профиль для доступа с других устройств.', 'This browser draft belongs to your account only. Save it to your profile to access it on other devices.'],
    allRanked: ['Все команды распределены', 'All teams are ranked'], selected: ['Выбрана: {name}. Нажмите букву тира или свободное место в ряду.', 'Selected: {name}. Choose a tier label or an empty row.'],
    tierLabel: ['Тир {rank}', 'Tier {rank}'], moveHint: ['Переместить выбранную команду в тир {rank}', 'Move selected team to tier {rank}'],
    laneHint: ['Перетащите команду сюда', 'Drop a team here'], noSaved: ['В этом сезоне сохранённых тирлистов пока нет.', 'No tier lists saved for this season yet.'],
    listLoading: ['Загрузка ваших тирлистов…', 'Loading your tier lists…'], listCount: ['Сохранено: {count}', 'Saved: {count}'],
    authLists: ['Чтобы открыть свои тирлисты, войдите в KT Companion.', 'Sign in to KT Companion to open your tier lists.'],
    invalidTitle: ['Введите название тирлиста (до 120 символов).', 'Enter a tier list title (up to 120 characters).'],
    invalidSeason: ['Выберите сезон.', 'Choose a season.'], genericError: ['Не удалось выполнить действие. Повторите попытку.', 'Could not complete the action. Try again.'],
    networkError: ['Нет связи с сервером. Черновик сохранён в этом браузере.', 'The server is unreachable. Your draft is stored in this browser.'],
    expired: ['Вход изменился или истёк. Черновик сохранён; войдите снова, чтобы продолжить.', 'Your session changed or expired. Your draft is stored; sign in again to continue.'],
    conflict: ['Тирлист изменён в другом окне. Ваш черновик сохранён. Сохраните копию или откройте свежую версию через «Мои тирлисты».', 'This tier list changed in another window. Your draft is preserved. Save a copy or open the latest version from My tier lists.'],
    notFound: ['Этот тирлист недоступен или уже удалён.', 'This tier list is unavailable or has been deleted.'],
    wrongAccount: ['Аккаунт изменился. Этот черновик остался сохранён за прежним аккаунтом.', 'The account changed. This draft remains stored for the previous account.'],
    switchDraft: ['Открыть другой тирлист?', 'Open another tier list?'],
    discardDescription: ['Изменения текущего тирлиста ещё не сохранены в профиль. Продолжить и заменить черновик?', 'Changes to the current tier list have not been saved to your profile. Continue and replace this draft?'],
    resetTitle: ['Вернуть все команды вниз?', 'Return all teams to the pool?'], resetDescription: ['Название и выбранный сезон сохранятся. Распределение можно будет восстановить кнопкой отмены.', 'The title and season will stay unchanged. You can undo this move.'],
    deleteTitle: ['Удалить сохранённый тирлист?', 'Delete this saved tier list?'], deleteDescription: ['«{title}» будет удалён из профиля. Это действие нельзя отменить.', '“{title}” will be deleted from your profile. This cannot be undone.'],
    deleted: ['Тирлист удалён из профиля.', 'Tier list deleted from your profile.'], deletedDraft: ['Сохранение удалено. Текущая раскладка осталась как новый черновик.', 'The saved list was deleted. The current ranking remains as a new draft.'],
    loaded: ['Тирлист открыт.', 'Tier list opened.'], imported: ['Раскладка импортирована как новый черновик.', 'Ranking imported as a new draft.'],
    invalidJSON: ['Не удалось прочитать JSON тирлиста.', 'Could not read the tier list JSON.'], invalidRows: ['В файле некорректные тиры, повторяющиеся или неизвестные команды.', 'The file contains invalid tiers, duplicate teams, or unknown teams.'],
    restored: ['Восстановлен черновик из этого браузера.', 'Browser draft restored.'], accountChanged: ['Открыт черновик текущего аккаунта. Черновик прежнего аккаунта сохранён отдельно.', 'The current account draft is open. The previous account draft was stored separately.'],
    unknownSeason: ['Сезон {id}', 'Season {id}'], activeSeason: ['текущий', 'current'], login: ['Войти', 'Sign in'],
    storageFull: ['Не удалось сохранить черновик в браузере. Скачайте JSON перед уходом со страницы.', 'Could not store the browser draft. Export JSON before leaving the page.'],
    statsLatest: ['Последний сезон', 'Latest season'], statsClose: ['Закрыть статистику команды', 'Close team statistics'],
    statsLoading: ['Загрузка статистики…', 'Loading statistics…'], statsError: ['Не удалось загрузить статистику команды. Попробуйте ещё раз.', 'Could not load team statistics. Try again.'],
    statsGames: ['Игры', 'Games'], statsWinRate: ['Винрейт', 'Win rate'], statsTacOps: ['Топ-3 вторички', 'Top 3 Tac Ops'], statsPlayers: ['Топ-3 игрока', 'Top 3 players'],
    statsEmpty: ['За этот сезон игр пока нет.', 'No games recorded for this season yet.'], statsNoEntries: ['За этот сезон записей нет.', 'No entries for this season.'],
    statsGameCount: ['Игр: {count}', 'Games: {count}'], statsMirrors: ['Зеркальные матчи учитывают обе стороны.', 'Mirror matches count both sides.']
  };
  const locale = () => (window.KTAppearance?.locale || document.documentElement.lang) === 'en' ? 'en' : 'ru';
  function t(key, vars = {}) {
    let value = (copy[key] || [key, key])[locale() === 'en' ? 1 : 0];
    for (const [name, v] of Object.entries(vars)) value = value.replaceAll('{' + name + '}', String(v));
    return value;
  }
  const state = { teams: [], teamsById: new Map(), seasons: [], currentSeasonId: '', user: null, authVerified: false,
    record: null, baseline: '', history: [], selected: null, dragging: null, busy: false, booted: false,
    csrf: '', savedLists: [], accountGeneration: 0, requestSerial: 0, lastIdentityCheck: 0 };
  const draftKey = user => 'kt-tierlist-draft-v1:' + (user?.id ?? 'guest');
  const preferencesKey = 'kt-tierlist-view-v1';
  const teamStats = { teamId: null, status: 'idle', data: null, controller: null, serial: 0, cache: new Map() };
  const snapshot = () => JSON.stringify({ title: state.record?.title || '', seasonId: state.record?.seasonId || '', rows: state.record?.rows || {} });
  const isDirty = () => Boolean(state.record && snapshot() !== state.baseline);
  function emptyRows() { return Object.fromEntries(zoneKeys.map(k => [k, k === 'pool' ? state.teams.map(team => team.id) : []])); }
  function blankRecord() { return { id: null, revision: null, title: '', seasonId: state.currentSeasonId, rows: emptyRows() }; }
  function normalizeRows(raw) {
    if (!raw || typeof raw !== 'object') throw Error(t('invalidRows'));
    const rows = Object.fromEntries(zoneKeys.map(k => [k, []])), seen = new Set(), seenInput = new Set();
    for (const k of zoneKeys) {
      if (!Array.isArray(raw[k])) throw Error(t('invalidRows'));
      for (const rawId of raw[k]) {
        if (seenInput.has(rawId)) throw Error(t('invalidRows'));
        seenInput.add(rawId);
        let id = rawId;
        if (id === 'spectre-squad') id = 'spectre-veteran-sergeant';
        if (!state.teamsById.has(id)) throw Error(t('invalidRows'));
        if (seen.has(id)) {
          if (id === 'spectre-veteran-sergeant' && seenInput.has('spectre-squad') && seenInput.has(id)) continue;
          throw Error(t('invalidRows'));
        }
        rows[k].push(id); seen.add(id);
      }
    }
    for (const team of state.teams) if (!seen.has(team.id)) rows.pool.push(team.id);
    return rows;
  }
  function message(value, error = false) {
    $('page-status').textContent = value;
    $('page-status').dataset.kind = error ? 'error' : '';
  }
  function toast(value) {
    $('toast').textContent = value; $('toast').hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  function explain(error) {
    if (error.status === 409) return t('conflict');
    if (error.status === 401 || error.status === 403) return t('expired');
    if (error.status === 404) return t('notFound');
    return error.message || t('genericError');
  }
  async function api(path, options = {}, accountBound = true) {
    const identity = state.user?.id, generation = state.accountGeneration;
    const headers = { Accept: 'application/json', ...options.headers };
    if (accountBound && identity != null) headers['X-Tierlist-Account'] = String(identity);
    if (options.body) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = state.csrf; }
    let response;
    try { response = await fetch('/api/tierlists' + path, { credentials: 'same-origin', cache: 'no-store', ...options, headers }); }
    catch { throw Error(t('networkError')); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const error = Error(result.error || t('genericError')); error.status = response.status; throw error; }
    if (accountBound && (generation !== state.accountGeneration || String(result.accountId) !== String(identity))) {
      const error = Error(t('wrongAccount')); error.status = 401; throw error;
    }
    if (accountBound && result.csrfToken) state.csrf = result.csrfToken;
    return result;
  }
  function persist() {
    if (!state.record || !state.authVerified) return;
    try { localStorage.setItem(draftKey(state.user), JSON.stringify({ version: 1, record: state.record, baseline: state.baseline })); }
    catch { message(t('storageFull'), true); }
  }
  function readDraft(user) {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(user)));
      if (!saved?.record || typeof saved.record.title !== 'string' || typeof saved.record.seasonId !== 'string') return null;
      const rows = normalizeRows(saved.record.rows);
      return { record: { id: user ? saved.record.id || null : null, revision: user ? saved.record.revision || null : null,
        title: saved.record.title.slice(0, 120), seasonId: saved.record.seasonId, rows }, baseline: typeof saved.baseline === 'string' ? saved.baseline : '' };
    } catch { return null; }
  }
  function remember() {
    state.history.push(JSON.stringify(state.record));
    if (state.history.length > 80) state.history.shift();
  }
  function applyRecord(record, { baseline, persistDraft = true } = {}) {
    state.record = { id: record.id || null, revision: record.revision || null, title: record.title || '',
      seasonId: record.seasonId || state.currentSeasonId, rows: normalizeRows(record.rows) };
    state.baseline = baseline === undefined ? snapshot() : baseline;
    state.selected = null; state.history = [];
    $('list-title').value = state.record.title; fillSeasonSelects(); $('season').value = state.record.seasonId;
    if (persistDraft) persist();
    render(); updateControls();
  }
  function setIdentity(user, verified = true) {
    const changed = state.booted && String(user?.id ?? '') !== String(state.user?.id ?? '');
    if (changed) persist();
    state.user = user || null; state.authVerified = verified; state.csrf = ''; state.accountGeneration++;
    window.KTAccount = user ? { id: user.id } : null;
    if (changed) {
      state.savedLists = [];
      const saved = readDraft(state.user);
      applyRecord(saved?.record || blankRecord(), { baseline: saved?.baseline, persistDraft: false });
      if ($('library-dialog').open) $('library-dialog').close();
      toast(t('accountChanged'));
    }
    updateControls();
  }
  async function checkIdentity() {
    if (Date.now() - state.lastIdentityCheck < 1500 || !state.booted) return;
    state.lastIdentityCheck = Date.now();
    try {
      const session = await window.KTCompanion.session();
      if (String(session.user?.id ?? '') !== String(state.user?.id ?? '') || !state.authVerified) setIdentity(session.user, true);
    } catch { state.authVerified = false; updateControls(); }
  }
  function seasonLabel(id) {
    const season = state.seasons.find(s => s.id === id);
    if (!season) return t('unknownSeason', { id });
    return typeof season.label === 'object' ? season.label[locale()] || season.label.en || id : season.label || id;
  }
  function fillSeasonSelects() {
    const editorValue = state.record?.seasonId || state.currentSeasonId;
    const filterValue = $('library-season').value;
    for (const [element, all] of [[$('season'), false], [$('library-season'), true]]) {
      element.replaceChildren();
      if (all) { const option = document.createElement('option'); option.value = ''; option.textContent = t('allSeasons'); element.append(option); }
      for (const season of state.seasons) {
        const option = document.createElement('option'); option.value = season.id;
        option.textContent = seasonLabel(season.id) + (season.isActive ? ' · ' + t('activeSeason') : '');
        element.append(option);
      }
      if (!all && editorValue && !state.seasons.some(s => s.id === editorValue)) {
        const option = document.createElement('option'); option.value = editorValue; option.textContent = seasonLabel(editorValue); element.append(option);
      }
      element.value = all ? filterValue : editorValue;
    }
  }
  function updateControls() {
    $('account-note').hidden = Boolean(state.user && state.authVerified);
    $('account-note').textContent = t(state.authVerified ? 'guest' : 'authUnavailable');
    $('my-lists').disabled = !state.booted || state.busy; $('new-list').disabled = !state.booted || state.busy;
    $('save-list').disabled = !state.booted || state.busy;
    $('save-list').textContent = t(state.busy ? 'saving' : state.user && state.authVerified ? 'save' : 'loginSave');
    $('save-copy').hidden = !state.record?.id || !state.user;
    $('save-copy').disabled = state.busy;
    $('list-title').disabled = $('season').disabled = state.busy;
    for (const id of ['reset', 'import-json', 'restore-guest']) $(id).disabled = state.busy;
    $('undo').disabled = state.busy || !state.history.length;
    $('save-state').textContent = state.record?.id ? (isDirty() ? t('unsaved') : t('saved')) : t('draft');
    $('draft-note').textContent = t(state.user ? 'scopedDraft' : 'browserDraft');
    $('restore-guest').hidden = !state.user || !readDraft(null);
    $('record-caption').textContent = [state.record?.title || t('titlePlaceholder'), seasonLabel(state.record?.seasonId || state.currentSeasonId)].join(' · ');
  }
  function buildBoard() {
    $('board').replaceChildren();
    for (const rank of ranks) {
      const row = document.createElement('div'); row.className = 'tl-tier';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tl-rank'; button.dataset.rank = rank;
      button.textContent = rank; button.setAttribute('aria-label', t('moveHint', { rank })); button.addEventListener('click', () => move(state.selected, rank));
      const lane = document.createElement('div'); lane.className = 'tl-lane'; lane.dataset.zone = rank; lane.id = 'tier-' + rank; lane.tabIndex = 0;
      lane.setAttribute('role', 'group'); lane.setAttribute('aria-label', t('tierLabel', { rank }));
      row.append(button, lane); $('board').append(row);
    }
    for (const lane of document.querySelectorAll('.tl-lane')) {
      lane.addEventListener('click', event => { if (!event.target.closest('.tl-card')) move(state.selected, lane.dataset.zone); });
      lane.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === lane && state.selected) { event.preventDefault(); move(state.selected, lane.dataset.zone); }
      });
      lane.addEventListener('dragover', event => {
        if (state.busy || !state.dragging) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move'; lane.classList.add('drag-over');
      });
      lane.addEventListener('dragleave', event => { if (!lane.contains(event.relatedTarget)) lane.classList.remove('drag-over'); });
      lane.addEventListener('drop', event => {
        event.preventDefault(); lane.classList.remove('drag-over');
        if (!state.dragging) return;
        const target = event.target.closest('.tl-card');
        move(state.dragging, lane.dataset.zone, target?.dataset.id || null); state.dragging = null; document.body.classList.remove('tl-card-dragging');
      });
    }
  }
  function select(id) {
    if (state.busy) return;
    state.selected = state.selected === id ? null : id;
    updateSelection();
  }
  function updateSelection() {
    document.querySelectorAll('.tl-card').forEach(card => {
      const selected = card.dataset.id === state.selected;
      card.classList.toggle('selected', selected); card.setAttribute('aria-pressed', String(selected)); card.setAttribute('aria-expanded', String(selected));
    });
    $('selection-note').textContent = state.selected ? t('selected', { name: state.teamsById.get(state.selected).name }) : '';
    syncTeamStats();
  }
  function clearSelection(returnFocus = false) {
    const previous = state.selected; state.selected = null; updateSelection();
    if (returnFocus && previous) document.querySelector('.tl-card[data-id="' + previous + '"]')?.focus({ preventScroll: true });
  }
  function cancelTeamStats() {
    teamStats.serial++; teamStats.controller?.abort(); teamStats.controller = null;
    teamStats.teamId = null; teamStats.status = 'idle'; teamStats.data = null;
    $('team-stats').hidden = true;
  }
  function positionTeamStats() {
    const panel = $('team-stats');
    if (panel.hidden || window.matchMedia('(max-width:700px)').matches) return;
    const board = $('board').getBoundingClientRect(), nav = document.querySelector('[data-companion-nav]')?.getBoundingClientRect();
    const top = Math.round(Math.max(12, (nav?.bottom || 0) + 12, board.top));
    panel.style.setProperty('--tl-stats-top', top + 'px');
    panel.style.setProperty('--tl-stats-right', Math.max(16, Math.round(window.innerWidth - board.right)) + 'px');
    panel.classList.toggle('tl-stats-offscreen', top > window.innerHeight - 80);
  }
  function statsPercent(value, games) {
    return games > 0 && Number.isFinite(value) ? new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value) + '%' : '—';
  }
  function renderStatsRows(target, entries, players = false) {
    const list = $(target); list.replaceChildren();
    for (const entry of (Array.isArray(entries) ? entries : []).slice(0, 3)) {
      if (!entry || typeof entry !== 'object') continue;
      const row = document.createElement('li'); row.className = 'tl-team-stats-row';
      const canLink = players && Number.isSafeInteger(entry.userId) && entry.userId > 0;
      const name = document.createElement(canLink ? 'a' : 'span'); name.className = 'tl-team-stats-name'; name.textContent = String(entry.name || '—');
      if (canLink) {
        const tournament = window.KT_SITES?.urls?.tournament || '/tournament';
        name.href = new URL(tournament, location.origin).href.replace(/\/$/, '') + '#/players/' + entry.userId;
      }
      const games = Number.isFinite(entry.games) ? entry.games : 0;
      const result = document.createElement('span'); result.className = 'tl-team-stats-result';
      const rate = document.createElement('strong'); rate.textContent = statsPercent(entry.winRate, games);
      const count = document.createElement('small'); count.textContent = t('statsGameCount', { count: new Intl.NumberFormat(locale()).format(games) });
      result.append(rate, count); row.append(name, result); list.append(row);
    }
    if (!list.childElementCount) {
      const empty = document.createElement('li'); empty.className = 'tl-team-stats-empty'; empty.textContent = t('statsNoEntries'); list.append(empty);
    }
  }
  function renderTeamStats() {
    const team = state.teamsById.get(teamStats.teamId);
    if (!team || state.selected !== team.id || document.body.classList.contains('tl-recording')) { cancelTeamStats(); return; }
    const panel = $('team-stats'); panel.hidden = false;
    $('team-stats-title').textContent = team.name;
    const image = $('team-stats-logo');
    let logo = null;
    try { const url = new URL(team.logo, location.origin); if (url.origin === location.origin && url.pathname.startsWith('/kill-team-logos/')) logo = url.href; } catch {}
    if (image.getAttribute('src') !== logo) {
      image.hidden = !logo;
      if (logo) image.src = logo; else image.removeAttribute('src');
    }
    const data = teamStats.data, ready = teamStats.status === 'ready';
    $('team-stats-season').textContent = ready ? String(data.season.name || '') : '';
    $('team-stats-status').textContent = teamStats.status === 'loading' ? t('statsLoading') : teamStats.status === 'error' ? t('statsError') : '';
    $('team-stats-status').dataset.kind = teamStats.status === 'error' ? 'error' : '';
    $('team-stats-retry').hidden = teamStats.status !== 'error';
    $('team-stats-content').hidden = !ready;
    panel.setAttribute('aria-busy', String(teamStats.status === 'loading'));
    if (ready) {
      $('team-stats-games').textContent = new Intl.NumberFormat(locale()).format(data.games);
      $('team-stats-winrate').textContent = statsPercent(data.winRate, data.games);
      $('team-stats-empty').hidden = data.games !== 0;
      $('team-stats-rankings').hidden = data.games === 0;
      renderStatsRows('team-stats-tacops', data.topTacOps);
      renderStatsRows('team-stats-players', data.topPlayers, true);
      $('team-stats-mirrors').hidden = !(data.mirrorGames > 0);
    }
    positionTeamStats();
  }
  function syncTeamStats() {
    if (!state.selected || document.body.classList.contains('tl-recording')) { cancelTeamStats(); return; }
    if (teamStats.teamId === state.selected) { renderTeamStats(); return; }
    void loadTeamStats(state.selected);
  }
  async function loadTeamStats(id, force = false) {
    const team = state.teamsById.get(id);
    if (!team || state.selected !== id || document.body.classList.contains('tl-recording')) return;
    cancelTeamStats(); teamStats.teamId = id;
    const cached = teamStats.cache.get(id);
    if (!force && cached && Date.now() < cached.expiresAt) {
      teamStats.status = 'ready'; teamStats.data = cached.data; renderTeamStats(); return;
    }
    const serial = teamStats.serial, controller = new AbortController(); teamStats.controller = controller; teamStats.status = 'loading'; renderTeamStats();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/statistics/kill-team?team=' + encodeURIComponent(team.statsName || team.name), {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal
      });
      if (!response.ok) throw Error('statistics');
      const data = await response.json();
      if (!data || data.team !== (team.statsName || team.name) || !Number.isFinite(data.games) || data.games < 0 || !data.season || typeof data.season.name !== 'string') throw Error('statistics');
      if (serial !== teamStats.serial || state.selected !== id || teamStats.teamId !== id) return;
      const cacheControl = response.headers?.get('Cache-Control') || '';
      const maxAge = cacheControl.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)"?(?:\s*,|\s*$)/i);
      const lifetime = /(?:^|,)\s*(?:no-store|no-cache)\b/i.test(cacheControl) ? 0 : Math.min(60, maxAge ? Number(maxAge[1]) : 60);
      const now = Date.now(), seasonEnd = data.season.endsAt == null ? NaN : Date.parse(data.season.endsAt);
      const expiresAt = Math.min(now + lifetime * 1000, Number.isFinite(seasonEnd) ? seasonEnd : Infinity);
      if (expiresAt > now) teamStats.cache.set(id, { expiresAt, data }); else teamStats.cache.delete(id);
      teamStats.data = data; teamStats.status = 'ready';
    } catch {
      if (serial !== teamStats.serial || state.selected !== id || teamStats.teamId !== id) return;
      teamStats.status = 'error'; teamStats.data = null;
    } finally {
      clearTimeout(timeout);
      if (serial === teamStats.serial && state.selected === id && teamStats.teamId === id) { teamStats.controller = null; renderTeamStats(); }
    }
  }
  function move(id, destination, before = null) {
    if (state.busy || !id || !state.teamsById.has(id) || !zoneKeys.includes(destination) || id === before) return;
    const next = JSON.parse(JSON.stringify(state.record.rows));
    for (const k of zoneKeys) next[k] = next[k].filter(team => team !== id);
    const at = before ? next[destination].indexOf(before) : -1;
    if (at < 0) next[destination].push(id); else next[destination].splice(at, 0, id);
    if (JSON.stringify(next) === JSON.stringify(state.record.rows)) return;
    remember(); state.record.rows = next; state.selected = null; persist(); render();
    const focus = document.querySelector('.tl-card[data-id="' + id + '"]');
    focus?.focus({ preventScroll: true });
  }
  function render() {
    if (!state.record) return;
    const query = $('search').value.trim().toLocaleLowerCase();
    let visiblePool = 0;
    for (const k of zoneKeys) {
      const lane = k === 'pool' ? $('pool') : $('tier-' + k);
      if (!lane) continue;
      lane.replaceChildren();
      lane.dataset.hint = t(k === 'pool' ? 'allRanked' : 'laneHint');
      for (const id of state.record.rows[k]) {
        const team = state.teamsById.get(id);
        if (k === 'pool' && query && !team.name.toLocaleLowerCase().includes(query)) continue;
        if (k === 'pool') visiblePool++;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'tl-card'; button.dataset.id = id;
        button.classList.toggle('selected', id === state.selected); button.draggable = !state.busy;
        button.setAttribute('aria-label', team.name); button.setAttribute('aria-pressed', String(id === state.selected)); button.setAttribute('aria-controls', 'team-stats'); button.setAttribute('aria-expanded', String(id === state.selected)); button.title = team.name;
        const image = document.createElement('img'); image.src = team.image; image.alt = ''; image.draggable = false; image.decoding = 'async';
        const caption = document.createElement('span'); caption.className = 'tl-card-name'; caption.textContent = team.name;
        button.append(image, caption);
        button.addEventListener('click', () => select(id));
        button.addEventListener('dragstart', event => {
          if (state.busy) { event.preventDefault(); return; }
          state.dragging = id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); button.classList.add('dragging'); document.body.classList.add('tl-card-dragging');
        });
        button.addEventListener('dragend', () => { state.dragging = null; document.body.classList.remove('tl-card-dragging'); document.querySelectorAll('.drag-over,.dragging').forEach(el => el.classList.remove('drag-over', 'dragging')); });
        lane.append(button);
      }
    }
    $('pool-count').textContent = state.record.rows.pool.length + ' / ' + state.teams.length;
    $('no-results').hidden = !query || visiblePool > 0;
    $('pool').dataset.hint = query && !visiblePool ? '' : t('allRanked');
    updateSelection(); updateControls();
  }
  let confirmResolve = null;
  function ask(title, description, accept = 'continue') {
    if (confirmResolve) return Promise.resolve(false);
    $('confirm-title').textContent = title; $('confirm-description').textContent = description; $('confirm-accept').textContent = t(accept);
    $('confirm-dialog').showModal(); $('confirm-cancel').focus();
    return new Promise(resolve => { confirmResolve = resolve; });
  }
  function finishConfirm(value) {
    $('confirm-dialog').close(); const resolve = confirmResolve; confirmResolve = null; resolve?.(value);
  }
  const mayReplace = () => !isDirty() ? Promise.resolve(true) : ask(t('switchDraft'), t('discardDescription'));
  async function refreshLists() {
    if (!state.user || !state.authVerified) { $('library-status').textContent = t('authLists'); return; }
    const serial = ++state.requestSerial;
    state.savedLists = []; $('saved-lists').replaceChildren();
    $('library-status').textContent = t('listLoading');
    try {
      const filter = $('library-season').value;
      const result = await api(filter ? '?seasonId=' + encodeURIComponent(filter) : '');
      if (serial !== state.requestSerial) return;
      state.savedLists = result.tierlists; renderLists();
      $('library-status').textContent = result.tierlists.length ? t('listCount', { count: result.tierlists.length }) : t('noSaved');
    } catch (error) { if (serial === state.requestSerial) $('library-status').textContent = explain(error); }
  }
  function renderLists() {
    $('saved-lists').replaceChildren();
    for (const list of state.savedLists) {
      const row = document.createElement('div'); row.className = 'tl-saved-row';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'tl-open-list';
      const title = document.createElement('strong'); title.textContent = list.title;
      const detail = document.createElement('small');
      const date = new Date(list.updatedAt);
      detail.textContent = seasonLabel(list.seasonId) + ' · ' + (Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale()));
      open.append(title, detail); open.addEventListener('click', () => loadList(list.id));
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'tl-action tl-danger'; remove.textContent = t('delete');
      remove.setAttribute('aria-label', t('delete') + ': ' + list.title); remove.addEventListener('click', () => deleteList(list));
      row.append(open, remove); $('saved-lists').append(row);
    }
  }
  async function loadList(id) {
    if (state.busy || !await mayReplace()) return;
    state.busy = true; updateControls();
    try {
      const result = await api('/' + encodeURIComponent(id));
      applyRecord(result.tierlist); $('library-dialog').close(); message(''); toast(t('loaded'));
    } catch (error) { $('library-status').textContent = explain(error); }
    finally { state.busy = false; updateControls(); }
  }
  async function saveList(asCopy = false) {
    if (state.busy || !state.record) return;
    const initialAccount = String(state.user?.id ?? '');
    if (!state.authVerified) await checkIdentity();
    if (String(state.user?.id ?? '') !== initialAccount) { message(t('accountChanged')); return; }
    if (!state.user || !state.authVerified) { persist(); location.href = window.KTCompanion.loginUrl(); return; }
    const title = $('list-title').value.trim(), seasonId = $('season').value;
    if (!title || title.length > 120) { message(t('invalidTitle'), true); $('list-title').focus(); return; }
    if (!state.seasons.some(s => s.id === seasonId)) { message(t('invalidSeason'), true); $('season').focus(); return; }
    state.record.title = title; state.record.seasonId = seasonId; persist();
    state.busy = true; updateControls(); message('');
    try {
      if (!state.csrf) await api('');
      const update = state.record.id && !asCopy;
      const body = { title, seasonId, rows: state.record.rows, ...(update ? { revision: state.record.revision } : {}) };
      const result = await api(update ? '/' + encodeURIComponent(state.record.id) : '', { method: update ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      applyRecord(result.tierlist); toast(t('saved'));
    } catch (error) {
      if (error.status === 401 || error.status === 403) state.csrf = '';
      persist();
      if (error.status === 401) state.authVerified = false;
      message(explain(error), true);
    }
    finally { state.busy = false; render(); }
  }
  async function deleteList(list) {
    if (state.busy || !await ask(t('deleteTitle'), t('deleteDescription', { title: list.title }), 'delete')) return;
    state.busy = true; updateControls();
    try {
      await api('/' + encodeURIComponent(list.id), { method: 'DELETE', body: JSON.stringify({ revision: list.revision }) });
      if (state.record.id === list.id) { state.record.id = null; state.record.revision = null; state.baseline = ''; state.history = []; persist(); toast(t('deletedDraft')); }
      else toast(t('deleted'));
      await refreshLists();
    } catch (error) { $('library-status').textContent = explain(error); }
    finally { state.busy = false; updateControls(); }
  }
  function appearance() {
    document.querySelectorAll('[data-copy]').forEach(el => { el.textContent = t(el.dataset.copy); });
    document.querySelectorAll('[data-placeholder-copy]').forEach(el => { el.placeholder = t(el.dataset.placeholderCopy); });
    document.querySelectorAll('[data-aria-copy]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.ariaCopy)); });
    document.title = (locale() === 'en' ? 'Kill Team tier lists' : 'Тирлисты Kill Team') + ' — KT Companion';
    fillSeasonSelects();
    document.querySelectorAll('.tl-rank').forEach(el => { el.setAttribute('aria-label', t('moveHint', { rank: el.dataset.rank })); });
    ranks.forEach(rank => $('tier-' + rank)?.setAttribute('aria-label', t('tierLabel', { rank })));
    renderLists(); render(); updateControls();
  }
  function recording(on) {
    document.body.classList.toggle('tl-recording', on); $('record-caption').hidden = !on; $('exit-recording').hidden = !on;
    if (on) { clearSelection(); $('search').value = ''; render(); window.scrollTo({ top: 0 }); }
  }
  function savePreferences() {
    $('workspace').style.setProperty('--tl-card-size', $('card-size').value + 'px');
    document.body.classList.toggle('tl-names', $('show-names').checked);
    try { localStorage.setItem(preferencesKey, JSON.stringify({ size: $('card-size').value, names: $('show-names').checked })); } catch {}
  }
  $('confirm-cancel').addEventListener('click', () => finishConfirm(false));
  $('team-stats-close').addEventListener('click', () => clearSelection(true));
  $('team-stats-retry').addEventListener('click', () => { if (state.selected) void loadTeamStats(state.selected, true); });
  $('team-stats-logo').addEventListener('error', event => { event.currentTarget.hidden = true; });
  let statsPositionFrame = null;
  const scheduleStatsPosition = () => { if (statsPositionFrame == null) statsPositionFrame = requestAnimationFrame(() => { statsPositionFrame = null; positionTeamStats(); }); };
  window.addEventListener('scroll', scheduleStatsPosition, { passive: true });
  window.addEventListener('resize', scheduleStatsPosition);
  $('confirm-accept').addEventListener('click', () => finishConfirm(true));
  $('confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); finishConfirm(false); });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  $('my-lists').addEventListener('click', async () => {
    if (state.busy) return;
    if (!state.user) { persist(); location.href = window.KTCompanion.loginUrl(); return; }
    $('library-dialog').showModal(); await refreshLists();
  });
  $('refresh-library').addEventListener('click', refreshLists);
  $('library-season').addEventListener('change', refreshLists);
  $('new-list').addEventListener('click', async () => { if (!state.busy && await mayReplace()) { applyRecord(blankRecord()); message(''); $('list-title').focus(); } });
  $('save-list').addEventListener('click', () => saveList(false)); $('save-copy').addEventListener('click', () => saveList(true));
  $('list-title').addEventListener('input', () => { if (state.record) { state.record.title = $('list-title').value; persist(); updateControls(); } });
  $('season').addEventListener('change', () => { if (state.record) { state.record.seasonId = $('season').value; persist(); updateControls(); } });
  $('undo').addEventListener('click', () => { if (!state.busy && state.history.length) {
    state.record = JSON.parse(state.history.pop()); state.selected = null; $('list-title').value = state.record.title; fillSeasonSelects(); persist(); render();
  } });
  $('reset').addEventListener('click', async () => { if (!state.busy && await ask(t('resetTitle'), t('resetDescription'))) {
    remember(); state.record.rows = emptyRows(); state.selected = null; $('search').value = ''; persist(); render();
  } });
  $('search').addEventListener('input', render);
  $('card-size').addEventListener('input', savePreferences); $('show-names').addEventListener('change', savePreferences);
  $('record-mode').addEventListener('click', () => recording(true)); $('exit-recording').addEventListener('click', () => recording(false));
  $('export-json').addEventListener('click', () => {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, title: state.record.title, topic: state.record.title, seasonId: state.record.seasonId, zones: state.record.rows }, null, 2)], { type: 'application/json' }));
    a.href = url; a.download = 'kill-team-tierlist.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('import-json').addEventListener('click', () => { if (!state.busy) $('import-file').click(); });
  $('import-file').addEventListener('change', async event => {
    try {
      const file = event.target.files[0]; if (!file) return; if (file.size > 1024 * 1024) throw Error(t('invalidJSON'));
      const data = JSON.parse(await file.text()), rows = normalizeRows(data.rows || data.zones);
      if (!await mayReplace()) return;
      const seasonId = state.seasons.some(s => s.id === data.seasonId) ? data.seasonId : state.currentSeasonId;
      const title = String(data.title || data.topic || '').slice(0, 120);
      applyRecord({ title, seasonId, rows }, { baseline: '' }); message(''); toast(t('imported'));
    } catch (error) { message(error instanceof SyntaxError ? t('invalidJSON') : error.message, true); }
    finally { event.target.value = ''; }
  });
  $('restore-guest').addEventListener('click', async () => {
    const saved = readDraft(null);
    if (!saved || state.busy || !await mayReplace()) return;
    applyRecord({ ...saved.record, id: null, revision: null }, { baseline: '' }); toast(t('restored'));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { recording(false); clearSelection(true); return; }
    if (event.target.closest('input,textarea,select,dialog') || !state.booted) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('undo').click(); return; }
    const key = event.key.toUpperCase();
    if (!event.ctrlKey && !event.metaKey && !event.altKey && state.selected && (ranks.includes(key) || key === '0')) {
      event.preventDefault(); move(state.selected, key === '0' ? 'pool' : key);
    }
  });
  window.addEventListener('beforeunload', event => { persist(); if (isDirty()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('kt:appearance', appearance);
  window.addEventListener('focus', checkIdentity);
  window.addEventListener('storage', event => { if (event.key === 'kt-companion-session-change') void checkIdentity(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkIdentity(); });
  let initializing = false;
  async function init() {
    if (initializing) return; initializing = true; $('retry').hidden = true; message(t('loading'));
    try {
      const [catalog, seasons, session] = await Promise.all([
        api('/catalog', {}, false), api('/seasons', {}, false), window.KTCompanion.session().then(value => ({ ...value, verified: true })).catch(() => ({ user: null, verified: false }))
      ]);
      if (!session.verified) throw Error(t('authUnavailable'));
      state.teams = catalog.teams; state.teamsById = new Map(state.teams.map(team => [team.id, team]));
      if (!state.teams.length || state.teamsById.size !== state.teams.length) throw Error(t('genericError'));
      state.seasons = seasons.seasons; state.currentSeasonId = seasons.currentSeasonId || state.seasons.find(s => s.isActive)?.id || state.seasons[0]?.id || '';
      setIdentity(session.user, session.verified);
      buildBoard();
      const saved = state.authVerified ? readDraft(state.user) : null;
      applyRecord(saved?.record || blankRecord(), { baseline: saved?.baseline, persistDraft: false });
      state.booted = true; $('workspace').hidden = false; message(''); appearance();
      try { const prefs = JSON.parse(localStorage.getItem(preferencesKey)); if (prefs) { $('card-size').value = Math.max(64, Math.min(144, Number(prefs.size) || 96)); $('show-names').checked = Boolean(prefs.names); } } catch {}
      savePreferences();
      if (saved && isDirty()) toast(t('restored'));
    } catch (error) { message(explain(error), true); $('retry').hidden = false; }
    finally { initializing = false; updateControls(); }
  }
  $('retry').addEventListener('click', init);
  void init();
})();

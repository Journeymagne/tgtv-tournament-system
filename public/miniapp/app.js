(() => {
  "use strict";
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";
  const content = document.getElementById("content");
  const nav = document.getElementById("bottom-nav");
  const connection = document.getElementById("connection");
  const launch = new URLSearchParams(location.search);
  const icons = {
    tournament: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5m-4 3h8m-7-3h6"/>',
    match: '<path d="m4 3 6 4 7 10-3 2L6 9 4 3Zm16 0-6 4-2 3m-2 4-3 4-3 3m12-4 4 4M4 17l3 4m10-4-3 4"/>',
    standings: '<path d="M4 20h16M5 20V10h4v10m2 0V4h4v16m2 0v-7h4v7"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
    theme: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.tournament}</svg>`;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const integer = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const statuses = { in_progress: "Идёт турнир", registration_open: "Регистрация открыта", registration_closed: "Скоро начало", completed: "Завершён", cancelled: "Отменён", open: "Можно внести счёт", pending_confirmation: "Ожидает подтверждения" };
  const state = { token: null, csrf: null, user: null, data: null, detail: null, game: null, slug: launch.get("tournament"), dirty: false, busy: false, sequence: 0, query: "", onlyMine: false, ready: false };
  const tabs = [["tournament", "Мой турнир"], ["match", "Мой матч"], ["standings", "Таблица"], ["profile", "Профиль"]];

  function route() {
    const [screen, id] = location.hash.slice(1).split("/");
    return { screen: tabs.some(([key]) => key === screen) ? screen : "tournament", id: integer(id) };
  }
  function urlImage(value) {
    if (typeof value !== "string") return "";
    if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(value)) return value;
    try { const url = new URL(value, location.origin); return url.origin === location.origin && url.pathname.startsWith("/") ? url.href : ""; } catch { return ""; }
  }
  const websiteTournament = slug => "/tournaments/" + encodeURIComponent(slug);
  const websiteButton = (href, text = "Открыть на сайте") => `<a class="secondary" data-external href="${esc(href)}">${esc(text)}${icon("arrow")}</a>`;
  function badge(status) { return `<span class="badge ${["in_progress", "open", "pending_confirmation"].includes(status) ? "active" : status === "completed" ? "good" : ""}">${esc(statuses[status] || status)}</span>`; }
  function heading(title) { return `<div class="page-heading"><h1>${esc(title)}</h1></div>`; }
  function empty(title, text, actions = "", type = "tournament") { return `<section class="card empty">${icon(type)}<h2>${esc(title)}</h2><p>${esc(text)}</p>${actions ? `<div class="actions">${actions}</div>` : ""}</section>`; }
  function stat(value, label, accent = false) { return `<div class="stat${String(value).includes("/") ? " stat-record" : ""}"><b${accent ? ' class="accent"' : ""}>${esc(value ?? "—")}</b><span>${esc(label)}</span></div>`; }
  function date(value) { if (!value || !Number.isFinite(Date.parse(value))) return "Дата уточняется"; return new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
  function avatar(player) { const image = urlImage(player.avatarUrl); return `<span class="avatar">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : esc((player.name || "?").slice(0, 1).toUpperCase())}</span>`; }
  function playerIsMe(player) { return !player.isProxy && (player.userId ?? player.id) === state.user.id; }
  function scores(game) { return game.pendingResult?.result?.scores || game.result?.scores || null; }
  function scoreLine(game) { const points = scores(game); return points ? (game.players || []).map(p => points[p.id]?.total ?? "—").join(" : ") : "VS"; }
  function roundOf(game) { return game.tournamentMatch?.roundNumber || game.teamMatch?.roundNumber; }
  function missionName(value) { return typeof value === "string" ? value : value?.critOp || value?.name || value?.title || "Не назначена"; }
  function chosenTournament() { return state.detail?.tournament || state.data?.tournaments.find(t => t.slug === state.slug); }
  function gamesForSelection() { return (state.data?.games || []).filter(g => !state.slug || g.tournament?.slug === state.slug).sort((a, b) => {
    const order = { pending_confirmation: 0, open: 1, completed: 2, cancelled: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4) || (roundOf(b) || 0) - (roundOf(a) || 0) || b.id - a.id;
  }); }

  async function api(path, body, method = "GET") {
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      if (!state.token && state.csrf) { headers["X-CSRF-Token"] = state.csrf; headers["X-Telegram-Account"] = String(state.user.id); }
    }
    let response;
    try { response = await fetch("/api/miniapp" + path, { method, headers, credentials: state.token ? "omit" : "same-origin", cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) }); }
    catch { throw new Error("Нет связи с сервером. Проверьте подключение и попробуйте снова."); }
    const data = await response.json();
    if (!response.ok) { const err = new Error(data.error || "Не удалось загрузить данные."); err.status = response.status; throw err; }
    return data;
  }
  function toast(text) { const element = document.getElementById("toast"); element.textContent = text; element.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.hidden = true; }, 4000); }
  function showError(err) {
    connection.innerHTML = `<span>${esc(err.message)}</span><button type="button" data-retry>Обновить</button>`;
    connection.hidden = false;
    if (err.status === 401) { state.ready = false; nav.hidden = true; content.innerHTML = empty("Нужно войти снова", err.message, websiteButton("/tournament#/profile", "Профиль на сайте"), "shield"); }
  }
  async function confirmAction(title, text) {
    const dialog = document.getElementById("confirm-dialog");
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-copy").textContent = text;
    dialog.returnValue = "cancel";
    dialog.showModal();
    return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
  }
  function rememberSelection() { try { localStorage.setItem("kt-miniapp-tournament:" + state.user.id, state.slug || ""); } catch {} }
  function chooseDefault() {
    const available = state.data.tournaments;
    if (state.slug && available.some(t => t.slug === state.slug)) return;
    let stored;
    try { stored = localStorage.getItem("kt-miniapp-tournament:" + state.user.id); } catch {}
    const mine = available.filter(t => state.data.myTournamentIds.includes(t.id));
    state.slug = mine.find(t => t.status === "in_progress")?.slug || mine.find(t => ["registration_open", "registration_closed"].includes(t.status))?.slug || available.find(t => t.slug === stored)?.slug || mine[0]?.slug || available.find(t => t.status === "in_progress")?.slug || available[0]?.slug || null;
  }
  function picker() {
    if (!state.data.tournaments.length) return "";
    const list = [...state.data.tournaments].sort((a, b) => Number(state.data.myTournamentIds.includes(b.id)) - Number(state.data.myTournamentIds.includes(a.id)));
    return `<label class="picker">Турнир<select data-tournament aria-label="Выбрать турнир">${list.map(t => `<option value="${esc(t.slug)}"${t.slug === state.slug ? " selected" : ""}>${state.data.myTournamentIds.includes(t.id) ? "★ " : ""}${esc(t.name)} · ${esc(statuses[t.status])}</option>`).join("")}</select></label>`;
  }
  function matchLink(game) { return `<a class="match-link" href="#match/${game.id}"><span><strong>${esc((game.players || []).map(p => p.name).join(" — "))}</strong><small>${roundOf(game) ? `Раунд ${roundOf(game)} · ` : ""}${esc(statuses[game.status] || game.status)}</small></span><span class="score">${esc(scoreLine(game))}</span></a>`; }
  function standingsRows() {
    const detail = state.detail;
    if (!detail) return [];
    const team = detail.tournament.participantMode === "team";
    const final = detail.tournament.status === "completed" && Array.isArray(detail.finalResults) && detail.finalResults.length ? detail.finalResults : null;
    return (final || detail.standings || []).map(row => {
      const entity = team ? detail.rosters?.find(p => p.id === row.rosterId) : detail.participants?.find(p => p.id === row.participantId);
      const own = team ? entity?.captainUserId === state.user.id || entity?.members?.some(m => m.userId === state.user.id && !m.endedAt) : entity?.userId === state.user.id;
      return { ...row, name: team ? entity?.name : entity?.user?.name || entity?.displayName, faction: team ? entity?.team?.name || entity?.teamNameSnapshot : entity?.faction,
        own, points: team ? row.teamTournamentPoints : row.matchPoints, rank: row.rank ?? row.place };
    });
  }
  function tournamentScreen() {
    const t = chosenTournament();
    let html = heading("Мой турнир") + picker();
    if (!t) return html + empty("Пока нет турниров", "Когда организатор опубликует турнир, он появится здесь.", websiteButton("/tournament#/tournaments", "Турниры на сайте"));
    const isMine = state.data.myTournamentIds.includes(t.id);
    const myRow = standingsRows().find(row => row.own);
    const games = gamesForSelection();
    const active = games.filter(g => ["open", "pending_confirmation"].includes(g.status));
    const round = state.detail?.rounds?.at(-1);
    html += `<section class="card hero"><div class="hero-top">${badge(t.status)}<span class="badge">${t.venueMode === "irl" ? "За столом · IRL" : "Tabletop Simulator"}</span></div><h2>${esc(t.name)}</h2><div class="meta-list"><div>${icon("date")}<span>${esc(date(t.startsAt))}</span></div>${t.venueAddress ? `<div>${icon("pin")}<span>${esc(t.venueAddress)}</span></div>` : ""}<div>${icon("profile")}<span>${t.participantMode === "team" ? `Командный · ${t.teamSize || ""} игроков в составе` : "Индивидуальный"} · ${t.format === "single_elimination" ? "На выбывание" : "Швейцарская система"}</span></div></div><div class="actions"><a class="primary" href="#match${active[0] ? "/" + active[0].id : ""}">Мой матч${icon("arrow")}</a><a class="secondary" href="#standings">Таблица</a></div></section>`;
    html += `<div class="stat-grid">${stat(myRow?.rank, "Ваше место", true)}${stat(round?.roundNumber || "—", "Текущий раунд")}${stat(state.detail?.rosters?.filter(r => r.status !== "withdrawn").length ?? state.detail?.participants?.length ?? t.participantCount, t.participantMode === "team" ? "Команд" : "Участников")}</div>`;
    if (!isMine) html += `<div class="notice">Вы смотрите этот турнир как зритель. Подать заявку можно на странице турнира.</div>`;
    html += `<div class="section-title"><h2>${active.length ? "Следующая игра" : "Ваши игры"}</h2><span>${games.length}</span></div>`;
    html += games.length ? games.slice(0, 4).map(matchLink).join("") : empty("Пары ещё нет", isMine ? "Соперник появится после публикации пары организатором." : "После регистрации здесь появятся ваши турнирные игры.", "", "match");
    const bye = round?.matches?.find(m => m.isBye && [m.participantA, m.participantB].some(p => p?.userId === state.user.id));
    if (bye) html += '<div class="notice">В этом раунде у вас BYE — игра без соперника. Результат учитывается системой автоматически.</div>';
    html += `<details><summary>О турнире и правила</summary><p class="subtle">${esc(t.description || t.rulesSummary || "Подробности доступны на странице турнира.")}</p>${websiteButton(websiteTournament(t.slug), isMine ? "Страница турнира" : "Регистрация на сайте")}</details>`;
    return html;
  }
  function tableFor(game) {
    const tableId = game.tournamentMatch?.tableId || game.teamTournamentGame?.tableId;
    return game.tournamentMatch?.table || state.detail?.rounds?.find(r => r.roundNumber === roundOf(game))?.tables?.find(t => t.id === tableId) || state.detail?.tables?.find(t => t.id === tableId);
  }
  function options(values, selected, blank = "Выберите") { return `<option value="">${esc(blank)}</option>` + values.map(value => `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(value)}</option>`).join(""); }
  function scoreForm(game) {
    const points = scores(game) || {};
    const reference = state.data.reference;
    const team = game.sourceType === "team_match_game";
    const elimination = game.tournament?.format === "single_elimination";
    const setup = game.pendingResult?.result?.killzone || game.teamTournamentGame?.mission || game.tournamentMatch?.mission || {};
    const locked = game.teamTournamentGame?.missionLocked;
    return `<form id="result-form" class="card"><h2>${game.status === "pending_confirmation" ? "Изменить результат" : "Внести результат"}</h2><p class="subtle">Очки за операции и основной бонус считаются по правилам сайта.</p>${game.players.map(p => {
      const score = points[p.id] || {};
      const factions = p.factions?.length ? p.factions : p.faction ? [p.faction] : [];
      return `<fieldset class="score-fieldset" data-player="${p.id}"><legend>${esc(p.name)}${playerIsMe(p) ? " · вы" : ""}</legend><div class="score-fields">${["crit", "kill", "tac"].map(key => `<label>${key.toUpperCase()} OP<input type="number" inputmode="numeric" min="0" max="6" step="1" required name="${p.id}:${key}" value="${score[key] ?? ""}" aria-label="${esc(p.name)} — ${key.toUpperCase()} OP"></label>`).join("")}</div><div class="form-row"><label>Основная операция<select name="${p.id}:primary" required>${options(["crit", "kill", "tac"], score.primary)}</select></label><label>Tac Op<select name="${p.id}:tacOp">${options(reference.tacOpOptions, score.tacOp, "Не указан")}</select></label></div>${factions.length ? `<label class="picker">Команда<select name="${p.id}:faction" required>${options(factions, score.faction || (factions.length === 1 ? factions[0] : ""))}</select></label>` : ""}<div class="score-total"><span>Всего с основным бонусом</span><b data-total="${p.id}">—</b></div></fieldset>`;
    }).join("")}<details${locked ? "" : " open"}><summary>Миссия и поле</summary>${locked ? `<p class="subtle">${esc(missionName(setup))} · ${esc(setup.killzone || "Поле назначено организатором")}. Настройки закреплены за парой.</p>` : `<div class="form-row"><label>Killzone<select name="killzone">${options(reference.killzoneOptions, setup.killzone || tableFor(game)?.killzone, "Не указан")}</select></label><label>Crit Op<select name="critOp">${options(reference.critOpOptions, setup.critOp, "Не указан")}</select></label></div><label class="picker">Расстановка<select name="layout">${options([1, 2, 3, 4, 5, 6], setup.layout, "Не указана")}</select></label>`}</details>${!team ? `<details${elimination ? " open" : ""}><summary>При равном счёте</summary><label class="check-row"><input type="checkbox" name="tiebreaker"${elimination ? " checked disabled" : game.pendingResult?.result?.tiebreakers?.enabled ? " checked" : ""}><span>Определить победителя по тайбрейкерам</span></label><p class="subtle">Основной бонус → Crit + Tac → оставшийся APL → бросок кубика.</p><div class="form-row">${game.players.map(p => `<label>APL · ${esc(p.name)}<input type="number" name="${p.id}:apl" min="0" max="99" inputmode="numeric" value="${game.pendingResult?.result?.tiebreakers?.apl?.[p.id] ?? 0}"></label>`).join("")}</div><label class="picker">Победитель броска (если всё остальное равно)<select name="rollOffWinnerId"><option value="">Не требуется / не выбран</option>${game.players.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label></details>` : ""}<p class="notice" style="margin-top:20px">${game.confirmationRequired ? "Результат будет отправлен на подтверждение другой стороне." : "После сохранения результат сразу попадёт в турнирную таблицу."}</p><div id="result-error" class="notice error" role="alert" hidden></div><button type="submit" class="primary wide">Проверить и ${game.confirmationRequired ? "отправить" : "сохранить"}</button></form>`;
  }
  function matchScreen() {
    let html = heading("Мой матч") + picker();
    const games = gamesForSelection();
    if (!state.game) {
      html += empty("Нет назначенной игры", "Когда организатор опубликует вашу пару, здесь появятся соперник, стол и форма результата.", '<a class="primary" href="#tournament">К турниру</a>', "match");
      const pairs = state.data.teamPairings?.filter(p => !state.slug || p.tournament?.slug === state.slug) || [];
      if (pairs.length) html += `<section class="card"><h2>Капитанская паровка</h2><p class="subtle">Сначала завершите выбор игроков и столов. Индивидуальные игры появятся здесь после паровки.</p>${pairs.map(p => websiteButton(`/tournament#/team-matches/${p.id}`, `${p.rosterA.name} — ${p.rosterB.name}`)).join("")}</section>`;
      return html;
    }
    const game = state.game, table = tableFor(game), points = scores(game);
    const mission = game.teamTournamentGame?.mission || game.tournamentMatch?.mission;
    html += `<section class="card hero"><div class="hero-top">${badge(game.status)}${roundOf(game) ? `<span class="badge">Раунд ${roundOf(game)}</span>` : ""}</div><div class="match-intro">${game.players.map((p, i) => `${i ? '<span class="versus">VS</span>' : ""}<div class="player${playerIsMe(p) ? " own" : ""}">${avatar(p)}<strong>${esc(p.name)}</strong><small>${esc(p.faction || "Команда не указана")}${playerIsMe(p) ? " · вы" : ""}</small>${points ? `<span class="match-score">${esc(points[p.id]?.total ?? "—")}</span>` : ""}</div>`).join("")}</div><div class="match-facts"><div><small>СТОЛ</small><b>${esc(table?.tableNumber ?? "Уточняется")}</b></div><div><small>МИССИЯ</small><b>${esc(missionName(mission))}</b></div><div><small>KILLZONE</small><b>${esc(table?.killzone || mission?.killzone || "Уточняется")}</b></div><div><small>ФОРМАТ</small><b>${game.venueMode === "irl" || game.tournament?.venueMode === "irl" ? "За столом · IRL" : "Tabletop Simulator"}</b></div></div>${table?.imageUrl ? `<details><summary>Схема стола</summary><a data-external href="${esc(table.imageUrl)}"><img class="table-image" src="${esc(table.imageUrl)}" alt="Схема назначенного стола" loading="lazy"></a></details>` : ""}</section>`;
    if (game.resultPermissions.canReview) html += `<section class="card"><h2>Проверьте счёт</h2><p class="subtle">${game.resultPermissions.requiresCaptainReview ? "Подтверждение ожидается от капитана другой команды." : "Другая сторона отправила результат на подтверждение."}</p><div class="actions"><button class="primary" data-result-action="confirm-result">${icon("check")}Подтвердить ${esc(scoreLine(game))}</button><button class="danger" data-result-action="reject-result">Вернуть на исправление</button></div></section>`;
    else if (game.status === "pending_confirmation" && !game.resultPermissions.canSubmit) html += '<p class="notice">Ожидаем подтверждение другой стороны. Обновление появится автоматически.</p>';
    if (game.resultPermissions.canSubmit) html += scoreForm(game);
    if (points) html += `<details><summary>Очки по операциям</summary><div class="table-scroll"><table><thead><tr><th>Игрок</th><th>Crit</th><th>Kill</th><th>Tac</th><th>Бонус</th></tr></thead><tbody>${game.players.map(p => { const s = points[p.id] || {}; return `<tr><td>${esc(p.name)}</td><td>${esc(s.crit)}</td><td>${esc(s.kill)}</td><td>${esc(s.tac)}</td><td>+${esc(s.primaryBonus)}</td></tr>`; }).join("")}</tbody></table></div></details>`;
    if (games.length > 1) html += `<div class="section-title"><h2>Другие игры</h2></div>${games.filter(g => g.id !== game.id).slice(0, 8).map(matchLink).join("")}`;
    return html;
  }
  function tableBody() {
    const rows = standingsRows().filter(row => (!state.onlyMine || row.own) && (!state.query || `${row.name || ""} ${row.faction || ""}`.toLocaleLowerCase("ru").includes(state.query.toLocaleLowerCase("ru"))));
    return rows.length ? rows.map(row => `<tr${row.own ? ' class="my-row"' : ""}><td><span class="rank">${esc(row.rank)}</span></td><td><strong>${esc(row.name || "Участник")}${row.own ? ' <span class="accent">· вы</span>' : ""}</strong><small>${esc(row.faction || "")}</small></td><td class="numeric"><b>${esc(row.points ?? 0)}</b></td><td class="numeric">${esc(row.totalVp ?? 0)}</td><td class="numeric">${esc(row.strengthOfSchedule ?? 0)}</td></tr>`).join("") : '<tr><td colspan="5">Ничего не найдено.</td></tr>';
  }
  function standingsScreen() {
    let html = heading("Турнирная таблица") + picker();
    if (!state.detail) return html + empty("Таблица ещё не готова", "Выберите опубликованный турнир, чтобы увидеть участников и результаты.");
    const mine = standingsRows().find(r => r.own);
    if (mine) html += `<div class="stat-grid">${stat(mine.rank, "Ваше место", true)}${stat(mine.points, "Турнирные очки")}${stat(`${mine.wins ?? 0} / ${mine.draws ?? 0} / ${mine.losses ?? 0}`, "Победы / ничьи / поражения")}</div>`;
    html += `<div class="section-title"><h2>${esc(state.detail.tournament.name)}</h2><span>${state.detail.tournament.status === "completed" ? "Итоговая" : "Текущая"}</span></div><div class="table-tools"><input id="standings-search" type="search" placeholder="Найти игрока или команду" aria-label="Поиск по таблице" value="${esc(state.query)}"></div><label class="check-row"><input id="only-mine" type="checkbox"${state.onlyMine ? " checked" : ""}><span>Только моя строка</span></label><section class="card table-card"><div class="table-scroll"><table><thead><tr><th>#</th><th>${state.detail.tournament.participantMode === "team" ? "Команда" : "Игрок"}</th><th class="numeric">TP</th><th class="numeric">VP</th><th class="numeric">SoS</th></tr></thead><tbody id="standings-body">${tableBody()}</tbody></table></div><p class="table-foot">TP — турнирные очки · VP — победные очки · SoS — сила соперников. Порядок мест рассчитывается по правилам турнира.</p></section>`;
    return html;
  }
  function profileScreen() {
    const { user, profile, notifications } = state.data, stats = profile.stats;
    let html = heading("Профиль");
    html += `<section class="card"><div class="profile-top">${avatar(user)}<div><h2>${esc(user.name)}</h2><p class="subtle">${esc(user.registerNickname || "Игрок KT Companion")}</p></div></div></section><div class="stat-grid">${stat(user.ratings?.combined ?? user.rating, "Общий рейтинг", true)}${stat(user.ratings?.irl, "Рейтинг IRL")}${stat(user.ratings?.tts, "Рейтинг TTS")}</div><div class="stat-grid">${stat(stats.matches, "Сыграно матчей")}${stat(`${stats.winRate}%`, "Побед")}${stat(`${stats.wins} / ${stats.draws} / ${stats.losses}`, "П / Н / ПР")}</div>`;
    if (profile.teams?.length) html += `<section class="card"><h2>Мои команды</h2>${profile.teams.filter(t => !t.archivedAt).map(t => `<span class="team-chip">${esc(t.name)}</span>`).join("")}</section>`;
    html += `<div class="section-title"><h2>Последние игры</h2></div>${profile.recentGames?.length ? profile.recentGames.map(matchLink).join("") : empty("Первая игра впереди", "Завершённые матчи и ваш прогресс появятся здесь.", "", "match")}`;
    html += notifications ? `<form id="preferences-form" class="card"><h2>Уведомления в Telegram</h2>${notifications.blocked ? '<p class="notice">Бот заблокирован. Откройте диалог с ним и нажмите Start, чтобы снова получать уведомления.</p>' : ""}<label class="check-row"><input name="enabled" type="checkbox"${notifications.enabled ? " checked" : ""}><span>Получать уведомления</span></label>${[["pairings", "Турнирные пары"], ["results", "Подтверждение результатов"], ["invitations", "Вызовы и приглашения"], ["tournaments", "Начало турниров"]].map(([key, title]) => `<label class="check-row"><input name="${key}" type="checkbox"${notifications.preferences[key] ? " checked" : ""}><span>${title}</span></label>`).join("")}<button class="primary wide" type="submit">Сохранить настройки</button></form>` : `<section class="card"><h2>Уведомления в Telegram</h2><p class="subtle">Подключите Telegram к существующему аккаунту в профиле сайта.</p>${websiteButton("/tournament#/profile", "Подключить аккаунт")}</section>`;
    html += `<div class="actions">${websiteButton("/tournament#/profile", "Полный профиль")}${user.isAdmin || user.canCreateTournaments ? websiteButton("/tournament#/administration/tournaments", "Управление турнирами") : ""}</div>`;
    return html;
  }

  function render() {
    const { screen } = route();
    nav.innerHTML = tabs.map(([key, name]) => `<a href="#${key}"${key === screen ? ' aria-current="page"' : ""}>${icon(key)}<span>${name}</span></a>`).join("");
    nav.hidden = false;
    content.innerHTML = ({ tournament: tournamentScreen, match: matchScreen, standings: standingsScreen, profile: profileScreen })[screen]();
    content.setAttribute("aria-busy", "false");
    document.title = `${tabs.find(([key]) => key === screen)[1]} · KT Companion`;
    if (initData && tg?.BackButton) screen === "tournament" ? tg.BackButton.hide() : tg.BackButton.show();
    updateTotals();
  }
  async function loadScreen({ silent = false, refresh = false } = {}) {
    const sequence = ++state.sequence;
    if (!silent) content.setAttribute("aria-busy", "true");
    try {
      if (refresh || !state.data) {
        const data = await api("/summary");
        if (sequence !== state.sequence) return;
        state.data = data; state.user = data.user; chooseDefault();
      }
      const current = route();
      let game = null;
      if (current.screen === "match") {
        const selectedId = current.id || gamesForSelection()[0]?.id;
        if (selectedId) game = (await api(`/games/${selectedId}`)).game;
        if (sequence !== state.sequence) return;
        if (game?.tournament?.slug) state.slug = game.tournament.slug;
      }
      let detail = null;
      if (state.slug && current.screen !== "profile") detail = await api(`/tournaments/${encodeURIComponent(state.slug)}`);
      if (sequence !== state.sequence) return;
      if (silent && (state.dirty || state.busy || document.activeElement?.matches("input,select"))) return;
      state.detail = detail; state.game = game; rememberSelection();
      if (!state.dirty) tg?.disableClosingConfirmation?.();
      connection.hidden = true; render();
    } catch (err) {
      if (sequence !== state.sequence) return;
      content.setAttribute("aria-busy", "false");
      if (!silent && err.status !== 401) content.innerHTML = empty("Не удалось открыть экран", err.message, '<button class="primary" data-retry>Попробовать снова</button>', "shield");
      showError(err);
    }
  }
  function updateTotals() {
    const form = document.getElementById("result-form");
    if (!form) return;
    const data = new FormData(form);
    for (const player of state.game.players) {
      const primary = data.get(player.id + ":primary");
      const values = ["crit", "kill", "tac"].map(key => data.get(player.id + ":" + key));
      const total = primary && values.every(v => v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 6) ? values.reduce((sum, v) => sum + Number(v), 0) + Math.ceil(Number(data.get(player.id + ":" + primary)) / 2) : "—";
      form.querySelector(`[data-total="${player.id}"]`).textContent = total;
    }
  }
  function resultBody(form) {
    const data = new FormData(form), game = state.game;
    const points = Object.fromEntries(game.players.map(p => [p.id, Object.fromEntries(["crit", "kill", "tac", "primary", "faction", "tacOp"].map(key => [key, data.get(`${p.id}:${key}`) || ""]))]));
    const tiebreakers = { enabled: game.sourceType !== "team_match_game" && (data.has("tiebreaker") || game.tournament?.format === "single_elimination"),
      apl: Object.fromEntries(game.players.map(p => [p.id, Number(data.get(`${p.id}:apl`) || 0)])), rollOffWinnerId: data.get("rollOffWinnerId") || null };
    return { scores: points, tiebreakers, killzone: { killzone: data.get("killzone") || "", critOp: data.get("critOp") || "", layout: data.get("layout") || "" }, revision: game.revision };
  }
  async function saveResult(action, form) {
    if (state.busy) return;
    const gameId = state.game.id;
    const body = form ? resultBody(form) : { revision: state.game.revision };
    const summary = form ? state.game.players.map(p => `${p.name}: ${form.querySelector(`[data-total="${p.id}"]`).textContent}`).join("\n") : scoreLine(state.game);
    const explanation = action === "reject-result" ? "Результат будет возвращён на исправление." : state.game.confirmationRequired && action === "result" ? "Результат уйдёт на подтверждение другой стороне." : "Результат будет сохранён в системе.";
    state.busy = true;
    try {
      if (!await confirmAction(action === "reject-result" ? "Вернуть результат?" : "Всё верно?", summary + "\n\n" + explanation)) return;
      content.querySelectorAll("button").forEach(b => { b.disabled = true; });
      const result = await api(`/games/${gameId}/${action}`, body, "POST");
      state.dirty = false; state.game = result.game;
      tg?.HapticFeedback?.notificationOccurred("success");
      toast(action === "reject-result" ? "Результат возвращён на исправление" : result.game.status === "completed" ? "Результат сохранён" : "Отправлено на подтверждение");
      await loadScreen({ refresh: true });
    } catch (err) {
      const error = document.getElementById("result-error");
      if (error) { error.textContent = err.message; error.hidden = false; error.scrollIntoView({ block: "center" }); }
      showError(err);
    } finally { state.busy = false; content.querySelectorAll("button").forEach(b => { b.disabled = false; }); }
  }

  async function reload() {
    if (state.busy) return;
    if (state.dirty && !await confirmAction("Обновить данные?", "Несохранённые изменения формы будут потеряны.")) return;
    state.dirty = false;
    if (!state.ready) return boot();
    await loadScreen({ refresh: true });
  }
  function syncTheme() {
    const light = document.documentElement.dataset.theme === "light";
    document.querySelector(".mini-brand img").src = `/brand/kt-companion/mark-${light ? "light" : "dark"}.png`;
    document.getElementById("theme-button").setAttribute("aria-label", light ? "Включить тёмную тему" : "Включить светлую тему");
    if (initData && tg?.isVersionAtLeast?.("6.1")) {
      const color = light ? "#f2f3f5" : "#050505";
      tg.setBackgroundColor(color);
      if (tg.isVersionAtLeast("6.9")) tg.setHeaderColor(light ? "#ffffff" : "#101010");
      if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor(light ? "#ffffff" : "#101010");
    }
  }
  async function boot() {
    document.getElementById("refresh-button").disabled = true;
    content.innerHTML = '<div class="loading"><span class="loader"></span><p>Загружаем ваши турниры…</p></div>';
    try {
      const session = await api("/session", initData ? { initData } : {}, "POST");
      if (!session.authenticated) {
        state.ready = false; nav.hidden = true; content.setAttribute("aria-busy", "false");
        content.innerHTML = heading("Турниры в Telegram") + empty(session.reason === "not_linked" ? "Подключите свой аккаунт" : "Добро пожаловать", session.reason === "not_linked" ? "Войдите в профиль сайта, подключите этого Telegram-бота и подтвердите привязку. Ваш рейтинг и история сохранятся. Затем вернитесь сюда." : "Откройте миниап из бота или войдите в свой аккаунт на сайте.", websiteButton("/tournament#/profile", "Открыть профиль сайта") + '<button class="secondary" data-retry>Я подключил аккаунт</button>', "shield");
        return;
      }
      state.token = session.accessToken || null; state.csrf = session.csrfToken; state.user = session.user; state.ready = true;
      await loadScreen({ refresh: true });
    } catch (err) { content.innerHTML = empty("Не удалось войти", err.message, '<button class="primary" data-retry>Повторить</button>', "shield"); showError(err); }
    finally { document.getElementById("refresh-button").disabled = false; }
  }
  document.getElementById("theme-button").innerHTML = icon("theme");
  document.getElementById("refresh-button").innerHTML = icon("refresh");
  document.getElementById("theme-button").addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    if (window.KTAppearance?.setTheme) window.KTAppearance.setTheme(theme);
    else { document.documentElement.dataset.theme = theme; try { localStorage.setItem("tgtv-theme", theme); } catch {} }
    syncTheme();
  });
  document.getElementById("refresh-button").addEventListener("click", reload);
  document.addEventListener("click", async event => {
    const target = event.target.closest("a,button");
    if (!target) return;
    if (target.hasAttribute("data-retry")) { event.preventDefault(); await reload(); return; }
    if (target.dataset.resultAction) { event.preventDefault(); await saveResult(target.dataset.resultAction); return; }
    if (target.hasAttribute("data-external") && initData && tg?.openLink) { event.preventDefault(); tg.openLink(new URL(target.getAttribute("href"), location.origin).href); return; }
    if (target.getAttribute("href")?.startsWith("#") && (state.dirty || state.busy)) {
      event.preventDefault();
      if (state.busy || !await confirmAction("Перейти в другой раздел?", "Несохранённые изменения формы будут потеряны.")) return;
      state.dirty = false; location.hash = target.getAttribute("href");
    }
  });
  document.addEventListener("change", async event => {
    if (event.target.matches("[data-tournament]")) {
      const next = event.target.value;
      if (state.busy || (state.dirty && !await confirmAction("Сменить турнир?", "Несохранённые изменения формы будут потеряны."))) { event.target.value = state.slug; return; }
      state.slug = next; state.dirty = false; state.query = ""; state.onlyMine = false; rememberSelection();
      if (route().screen === "match" && route().id) history.replaceState(null, "", "#match");
      await loadScreen();
    }
    if (event.target.id === "only-mine") { state.onlyMine = event.target.checked; document.getElementById("standings-body").innerHTML = tableBody(); }
    if (event.target.closest("#result-form,#preferences-form")) { state.dirty = true; tg?.enableClosingConfirmation?.(); updateTotals(); }
  });
  document.addEventListener("input", event => {
    if (event.target.id === "standings-search") { state.query = event.target.value; document.getElementById("standings-body").innerHTML = tableBody(); }
    if (event.target.closest("#result-form")) { state.dirty = true; tg?.enableClosingConfirmation?.(); updateTotals(); }
  });
  document.addEventListener("submit", async event => {
    if (event.target.id === "result-form") { event.preventDefault(); await saveResult("result", event.target); }
    if (event.target.id === "preferences-form") {
      event.preventDefault(); if (state.busy) return;
      const data = new FormData(event.target); state.busy = true;
      const submit = event.target.querySelector("button"); submit.disabled = true;
      try {
        await api("/preferences", { enabled: data.has("enabled"), preferences: Object.fromEntries(["pairings", "results", "invitations", "tournaments"].map(key => [key, data.has(key)])) }, "PATCH");
        state.dirty = false; toast("Настройки сохранены"); await loadScreen({ refresh: true });
      } catch (err) { showError(err); } finally { state.busy = false; submit.disabled = false; }
    }
  });
  let previousHash = location.hash;
  window.addEventListener("hashchange", async () => {
    if (state.busy || (state.dirty && !await confirmAction("Перейти в другой раздел?", "Несохранённые изменения формы будут потеряны."))) { history.replaceState(null, "", previousHash || "#tournament"); return; }
    previousHash = location.hash; state.dirty = false; tg?.disableClosingConfirmation?.();
    if (state.ready) { window.scrollTo(0, 0); await loadScreen(); }
  });
  window.addEventListener("beforeunload", event => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });
  window.addEventListener("kt:appearance", syncTheme);
  window.addEventListener("offline", () => showError(new Error("Нет интернета. Показаны последние загруженные данные.")));
  window.addEventListener("online", () => { if (state.ready && !state.dirty && !state.busy) loadScreen({ silent: true, refresh: true }); });
  setInterval(() => { if (state.ready && !state.dirty && !state.busy && !document.hidden && !document.activeElement?.matches("input,select")) loadScreen({ silent: true, refresh: true }); }, 45000);
  if (initData) {
    tg.ready(); tg.expand();
    tg.BackButton?.onClick(() => { location.hash = "tournament"; });
    tg.onEvent?.("themeChanged", () => { document.documentElement.dataset.theme = tg.colorScheme === "light" ? "light" : "dark"; syncTheme(); });
    document.documentElement.dataset.theme = tg.colorScheme === "light" ? "light" : "dark";
  }
  const start = tg?.initDataUnsafe?.start_param || launch.get("tgWebAppStartParam") || "";
  let initial = tabs.some(([key]) => key === launch.get("screen")) ? launch.get("screen") : "tournament";
  if (integer(launch.get("game"))) initial = "match/" + integer(launch.get("game"));
  if (/^game_\d+$/.test(start)) initial = "match/" + integer(start.slice(5));
  else if (start.startsWith("tournament_")) { state.slug = start.slice(11); initial = "tournament"; }
  else if (tabs.some(([key]) => key === start)) initial = start;
  if (!/^#(tournament|match(?:\/\d+)?|standings|profile)$/.test(location.hash)) history.replaceState(null, "", location.pathname + "#" + initial);
  previousHash = location.hash;
  syncTheme(); boot();
})();

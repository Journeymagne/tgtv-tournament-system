/* Public tournament league screens. Rules and rankings are evaluated by the service. */
(function (scope) {
  "use strict";

  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const pathPart = value => encodeURIComponent(String(value));
  const FORMATS = ["solo", "doubles", "team"];
  const METRICS = ["total_vp", "vp_diff", "individual_wins", "tac_op", "strength_of_schedule", "average_sos", "buchholz", "head_to_head", "events"];
  const trackFor = format => format === "solo" ? "solo" : "org";
  const tracksFor = formats => [...new Set(FORMATS.filter(format => formats.includes(format)).map(trackFor))];
  const labels = {
    solo: ["Соло", "Solo"], doubles: ["Парные 2×2", "Doubles 2×2"], team: ["Командные 3×3", "Teams 3×3"],
    soloTrack: ["Личный зачёт", "Individual standings"], orgTrack: ["Зачёт организаций", "Organization standings"],
    leagues: ["Лиги", "Leagues"], eventsTitle: ["Турниры лиги", "League tournaments"], ruleTitle: ["Правила зачёта", "Scoring rules"],
    registry: ["Сверка с Реестром", "Registry review"], edit: ["Настроить лигу", "League settings"], create: ["Создать лигу", "Create league"],
    total_vp: ["Суммарные VP", "Total VP"], vp_diff: ["Разница VP", "VP differential"], individual_wins: ["Личные победы", "Individual wins"],
    tac_op: ["Tac Op", "Tac Op"], strength_of_schedule: ["Сила соперников (SoS)", "Strength of schedule (SoS)"],
    average_sos: ["Средний SoS этапа", "Stage average SoS"], buchholz: ["Усечённый Бухгольц", "Cut Buchholz"],
    head_to_head: ["Личные встречи", "Head-to-head wins"], events: ["Ивенты", "Events"],
    tp: ["Сумма турнирных очков", "Total tournament points"], place: ["Очки за итоговое место", "Points by final place"],
    counted: ["Учтён", "Counted"], pending: ["Ожидает итогов", "Awaiting results"], needs_data: ["Требует данных", "Needs data"],
    excluded: ["Исключён", "Excluded"], completed: ["Завершён", "Completed"], registration: ["Регистрация", "Registration"],
    in_progress: ["Идёт", "In progress"], published: ["Опубликован", "Published"], scheduled: ["Предстоящий", "Upcoming"],
    registration_open: ["Регистрация открыта", "Registration open"], registration_closed: ["Регистрация закрыта", "Registration closed"], cancelled: ["Отменён", "Cancelled"],
    loyal: ["Лоялы", "Loyalists"], chaos: ["Хаос", "Chaos"], xenos: ["Ксеносы", "Xenos"], unknown: ["Сторона не указана", "Side unknown"],
    guest: ["Требует сверки", "Needs registry review"], missing_nickname: ["Ник в Реестре не указан", "No registry nickname"],
    rank: ["Место", "Rank"], points: ["Очки", "Points"], picks: ["Киллтимы", "Kill teams"],
    standings: ["Зачёт", "Standings"], tournaments: ["Турниры", "Tournaments"], close: ["Закрыть", "Close"],
    retry: ["Повторить", "Retry"], load: ["Загрузка…", "Loading…"], cancel: ["Отмена", "Cancel"],
    source: ["Источник", "Source"], preview: ["Предпросмотр зачёта", "Standings preview"],
    tpShort: ["ТП", "TP"], save: ["Сохранить", "Save"], apply: ["Подтвердить", "Confirm"],
    search: ["Найти", "Search"], reload: ["Загрузить актуальные настройки", "Reload current settings"],
    registerNickname: ["Ник в Реестре", "Registry nickname"], participantId: ["Слот игрока", "Player slot"], rosterId: ["Состав", "Roster"],
    teamId: ["Организация состава", "Roster organization"], finalResults: ["Официальные итоги", "Published results"], rankField: ["Итоговое место", "Final rank"],
    matchPoints: ["Турнирные очки игрока", "Player tournament points"], teamTournamentPoints: ["Турнирные очки состава", "Roster tournament points"],
    participantSnapshots: ["История замен", "Substitution history"], formats: ["Форматы", "Formats"], rules: ["Регламент", "Rules"],
    importTournamentId: ["Турнир-источник", "Source tournament"],
    correct_published_results: ["Уточните данные и повторно опубликуйте итоги этапа.", "Correct the tournament data and republish its results."],
    change_league_criteria: ["Измените критерии зачёта.", "Change the league criteria."],
    confirm_registry_identity: ["Сверьте игрока с Реестром.", "Match the player to the registry."], confirm_place_recipient: ["Выберите получателя очков за место.", "Choose the placement award recipient."],
    "Enable the tournament format or remove this stage": ["Включите формат или уберите этап.", "Enable the tournament format or remove this stage."],
    "Change the league criterion or remove this stage": ["Измените критерий или уберите этап.", "Change the league criterion or remove this stage."],
    "Choose a published completed tournament in this track": ["Выберите проведённый турнир этого зачёта с опубликованными итогами.", "Choose a completed tournament in this track with published results."]
  };
  const shortMetric = {total_vp: "VP", vp_diff: "Δ VP", strength_of_schedule: "SoS", tac_op: "Tac Op"};
  const button = (label, action, value = "", options = {}) =>
    `<button type="button" class="${options.className || "lg-button"}${options.primary ? " lg-primary" : ""}" data-action="${escape(action)}" data-value="${escape(value)}"${options.disabled ? " disabled" : ""}${options.expanded === undefined ? "" : ` aria-expanded="${Boolean(options.expanded)}"`}${options.title ? ` aria-label="${escape(options.title)}" title="${escape(options.title)}"` : ""}>${escape(label)}</button>`;
  const leagueUrl = (slug, track) => slug ? `/leagues/${pathPart(slug)}${track ? `?track=${pathPart(track)}` : ""}` : "/leagues";
  const leagueLink = (label, slug = "", track = "", buttonStyle = false) =>
    `<a href="${leagueUrl(slug, track)}" data-league="${escape(slug)}" data-track="${escape(track)}"${buttonStyle ? ' class="lg-button"' : ""}>${escape(label)}</a>`;
  const tournamentLink = (name, slug) => slug
    ? `<a href="/tournaments/${pathPart(slug)}">${escape(name)}</a>` : escape(name);
  const optionsHtml = (items, value) => items.map(([key, label]) =>
    `<option value="${escape(key)}"${String(key) === String(value) ? " selected" : ""}>${escape(label)}</option>`).join("");
  const tabClass = active => "tab " + (active ? "active primary-button" : "ghost-button");
  const tabs = (items, active, action, label) =>
    `<div class="tabs lg-tabs" role="group" aria-label="${escape(label)}">${items.map(([key, title]) =>
      `<button type="button" class="${tabClass(key === active)}" data-action="${action}" data-value="${escape(key)}" aria-pressed="${key === active}">${escape(title)}</button>`).join("")}</div>`;
  const list = items => `<ul class="lg-list">${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
  const status = message => `<p role="status" class="lg-note">${escape(message)}</p>`;
  const shared = {escape, pathPart, FORMATS, METRICS, trackFor, tracksFor, button, optionsHtml, tabs, list, status};

  class LeagueScreen {
    constructor(root, options) {
      this.root = root;
      this.options = options;
      this.api = options.api;
      this.english = String(options.locale || "ru").startsWith("en");
      this.locale = this.english ? "en" : "ru";
      this.number = new Intl.NumberFormat(this.locale, {maximumFractionDigits: 3});
      this.date = new Intl.DateTimeFormat(this.locale, {day: "numeric", month: "short", year: "numeric"});
      this.slug = options.slug || "";
      this.track = options.track;
      this.page = this.slug ? "standings" : "directory";
      this.details = new Map();
      this.root.addEventListener("click", event => this.click(event));
      this.root.addEventListener("submit", event => this.submit(event));
      this.root.addEventListener("change", event => this.editor?.change(event.target));
      this.root.addEventListener("input", event => this.editor?.input(event.target));
    }
    tr(ru, en) { return this.english ? en : ru; }
    t(key) { return labels[key] ? this.tr(...labels[key]) : String(key ?? ""); }
    current() { return this.root.isConnected; }
    num(value) { return value == null || !Number.isFinite(Number(value)) ? "—" : this.number.format(Number(value)); }
    dateLabel(value) {
      if (!value) return "";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "" : this.date.format(date);
    }
    criterion(c) { return c?.name || this.t(c?.metric || c); }
    trackTitle(track) { return this.t(track === "org" ? "orgTrack" : "soloTrack"); }
    formats(formats = []) { return formats.map(format => this.t(format)).join(" · "); }
    eventMeta(event) { return [this.dateLabel(event.date || event.tournamentDate), this.t(event.format)].filter(Boolean).join(" · "); }
    head(title, subtitle, actions = "") {
      return `<header class="lg-head"><div><h1 tabindex="-1">${escape(title)}</h1>${subtitle ? `<p>${escape(subtitle)}</p>` : ""}</div>${actions ? `<div class="lg-actions">${actions}</div>` : ""}</header>`;
    }
    crumb(last) {
      return `<nav class="lg-crumb" aria-label="${this.tr("Навигация", "Breadcrumb")}">${leagueLink(this.t("leagues"))}${this.league && last ? `<span aria-hidden="true">/</span>${leagueLink(this.league.name, this.slug, this.track)}` : ""}<span aria-hidden="true">/</span><span aria-current="page">${escape(last || this.league?.name)}</span></nav>`;
    }
    errorBox(error, action = "retry", value = "") {
      const conflict = error?.status === 409;
      const message = conflict ? this.tr("Лига изменилась с момента загрузки. Откройте текущие данные и повторите изменение.", "This league changed since you opened it. Reload the current data and apply your change again.") :
        (error?.message || this.tr("Не удалось получить данные лиги.", "Could not load league data."));
      return `<div role="alert" class="lg-notice">${escape(message)} ${action || conflict ? button(this.t(conflict ? "reload" : "retry"), conflict ? "reload" : action, value) : ""}</div>`;
    }
    issue(issue, events) {
      const eventName = events?.find(e => String(e.id) === String(issue.tournamentId))?.name || issue.tournamentName || (issue.tournamentId ? `#${issue.tournamentId}` : "");
      const kinds = {
        guest: this.t("guest"), missing_data: this.tr("В итогах турнира нет обязательных данных", "The published results are missing required data"),
        incompatible_metric: this.tr("Показатель несовместим с форматом турнира", "This metric is incompatible with the tournament format"),
        invalid_rule: this.tr("Проверьте регламент зачёта", "Check the scoring rule"), invalid_format: this.tr("Проверьте форматы этапов", "Check the stage formats"),
        place_recipient: this.tr("Очки за место на сверке", "Placement points await a recipient")
      };
      return [eventName, kinds[issue.code] || issue.message || issue.code, this.t(issue.field), this.t(issue.action)].filter(Boolean).join(" · ");
    }
    async load() {
      this.pageError = null;
      this.loading = true;
      this.editor = null;
      this.registry = null;
      this.details.clear();
      this.expanded = "";
      this.draw();
      const ticket = this.loadTicket = Symbol();
      try {
        if (this.slug) {
          const {league} = await this.api(`/api/leagues/${pathPart(this.slug)}`);
          if (ticket !== this.loadTicket || !this.current()) return;
          this.league = league;
          const tracks = tracksFor(league.formats);
          if (!tracks.includes(this.track)) this.track = tracks[0];
          const response = await this.api(`/api/leagues/${pathPart(this.slug)}/standings?track=${this.track}`);
          if (ticket !== this.loadTicket || !this.current()) return;
          this.rows = response.rows;
          this.criteria = response.criteria || league.rules[this.track].criteria;
          this.page = "standings";
        } else {
          const response = await this.api("/api/leagues");
          if (ticket !== this.loadTicket || !this.current()) return;
          this.leagues = response.leagues;
          this.canCreate = response.viewer?.canCreate ?? this.options.canCreate;
          this.page = "directory";
        }
      } catch (error) {
        if (ticket === this.loadTicket) this.pageError = error;
      } finally {
        if (ticket === this.loadTicket && this.current()) { this.loading = false; this.draw(); }
      }
    }
    draw(focus) {
      if (!this.current()) return;
      let html;
      if (this.loading) html = status(this.t("load"));
      else if (this.pageError) html = this.errorBox(this.pageError);
      else if (this.editor) html = this.editor.render();
      else if (this.page === "directory") html = this.directory();
      else if (this.page === "registry") html = this.registryView();
      else html = this.detailPage();
      this.root.innerHTML = html;
      if (focus) this.root.querySelector(focus)?.focus({preventScroll: true});
    }
    directory() {
      return this.head(this.t("leagues"), this.tr("Сезонные зачёты игроков и организаций.", "Season standings for players and organizations."),
        this.canCreate ? button(this.t("create"), "create", "", {primary: true}) : "") +
        `<section class="lg-panel"><h2>${this.tr("Каталог лиг", "League directory")}</h2>${this.leagues.length ? list(this.leagues.map(league =>
          `<div><strong>${leagueLink(league.name, league.slug)}</strong><small>${escape(this.formats(league.formats))} · ${this.t("tournaments")} ${this.num(league.eventCount)}</small></div>${leagueLink(this.tr("Открыть", "Open"), league.slug, "", true)}`
        )) : status(this.tr("Лиг пока нет.", "There are no leagues yet."))}</section>`;
    }
    detailPage() {
      const league = this.league;
      const editor = league.viewer?.canManage ? button(this.t("edit"), "edit") : "";
      const sections = [["standings", this.t("standings")], ["events", this.t("eventsTitle")], ["rules", this.t("ruleTitle")]];
      if (league.viewer?.canManage) sections.push(["registry", this.t("registry")]);
      return this.crumb() + this.head(league.name, this.formats(league.formats), editor) +
        tabs(sections, this.page, "page", this.t("leagues")) +
        (this.page === "events" ? this.eventsPanel() : this.page === "rules" ?
          `<div class="lg-stack lg-rule-sections">${tracksFor(league.formats).map(track => this.rulesPanel(track, true)).join("")}</div>` : this.trackTabs() + this.standings());
    }
    trackTabs() {
      const tracks = tracksFor(this.league.formats);
      if (tracks.length < 2) return "";
      return `<nav class="tabs lg-tabs" aria-label="${this.tr("Зачёты лиги", "League tracks")}">${tracks.map(track =>
        `<a class="${tabClass(track === this.track)}" href="${leagueUrl(this.slug, track)}" data-league="${escape(this.slug)}" data-track="${track}"${track === this.track ? ' aria-current="page"' : ""}>${escape(this.trackTitle(track))}</a>`).join("")}</nav>`;
    }
    provisional(track) {
      return (this.league.events || []).some(e => trackFor(e.format) === track && e.status === "counted" &&
        (e.issues || []).some(issue => ["guest", "place_recipient"].includes(issue.code)));
    }
    rulesPanel(track = this.track, full = false) {
      const rule = this.league.rules[track];
      const titles = [this.t(rule.primary), ...rule.criteria.map(c => this.criterion(c) + (c.name ?
        ` · ${this.t(c.metric)} · ${c.aggregate === "max" ? this.tr("лучшее за этап", "best stage") : this.tr("сумма", "sum")}` : ""))];
      return `<section class="lg-panel"><h2>${full ? this.trackTitle(track) : this.tr("Как считается место", "How ranks are calculated")}</h2>
        <ol class="lg-rules">${titles.map(title => `<li>${escape(title)}</li>`).join("")}</ol>
        ${rule.primary === "place" ? this.scaleDescription(rule.scale) : ""}
        ${rule.sourceName ? `<p class="lg-note">${this.t("source")} · ${escape(rule.sourceName)}</p>` : ""}
        <p class="lg-note">${this.tr("При полном равенстве участники делят место.", "Ties across all criteria share a rank.")}</p>
        ${full && this.provisional(track) ? status(this.tr("Места предварительные до завершения сверки.", "Ranks are provisional until registry and placement review is complete.")) : ""}</section>`;
    }
    scaleDescription(scale) {
      return `<p class="lg-note">${escape(scale.map((value, index) => index === scale.length - 1 ?
        this.tr(`с ${index + 1}-го места — ${value}`, `place ${index + 1} onward — ${value}`) : `#${index + 1} → ${value}`).join(" · "))}</p>`;
    }
    eventsPanel() {
      const events = this.league.events || [];
      const edit = this.league.viewer?.canManage ? button(this.tr("Привязать турнир", "Link a tournament"), "edit-events") : "";
      return `<section class="lg-panel"><div class="lg-section-head"><h2>${this.t("eventsTitle")}</h2>${edit}</div>${events.length ? list(events.map(event => {
        const issues = event.issues || [];
        const warnings = issues.map(issue => `<small>${escape(this.issue(issue))}</small>`).join("");
        const counted = event.status === "counted";
        const contribution = counted && event.appearanceCount != null ? `<small>${this.tr("Выступлений", "Appearances")} · ${this.num(event.appearanceCount)} / ${this.t("points")} · ${this.num(event.points)}</small>` : "";
        return `<div><strong>${tournamentLink(event.name, event.slug)}</strong><small>${escape(this.eventMeta(event))}</small>${contribution}${warnings}</div>
          <div class="lg-actions"><span class="lg-state lg-${counted ? "counted" : "waiting"}">${escape(this.t(event.status))}</span>
          ${this.league.viewer?.canManage && issues.some(i => i.code === "guest" || i.code === "place_recipient") ? button(this.t("registry"), "page", "registry") : ""}</div>`;
      })) : status(this.tr("К лиге пока не привязаны турниры.", "No tournaments are linked to this league."))}</section>`;
    }
    standings() {
      const solo = this.track === "solo";
      const counted = (this.league.events || []).filter(e => trackFor(e.format) === this.track && e.status === "counted");
      const provisional = this.rows.some(row => row.identityStatus === "guest") || this.provisional(this.track);
      return `<div class="lg-split"><section class="lg-panel lg-board"><header><h2>${this.trackTitle(this.track)}</h2>
        <p class="lg-note">${solo ? this.tr("Игроков", "Players") : this.tr("Организаций", "Organizations")} · ${this.num(this.rows.length)} &nbsp; ${this.tr("Учтено турниров", "Counted tournaments")} · ${this.num(counted.length)}</p></header>
        ${provisional ? `<div class="lg-notice">${this.tr("Места предварительные. Есть участники или награды, ожидающие сверки.", "Standings are provisional while participants or placement awards await review.")} ${this.league.viewer?.canManage ? button(this.t("registry"), "page", "registry", {className: "lg-text-button"}) : ""}</div>` : ""}
        ${this.rows.length ? this.table() : status(this.tr("После публикации итогов привязанного турнира здесь появятся участники.", "Participants will appear when a linked tournament publishes its results."))}
        <footer class="lg-legend">${solo ? ["loyal", "chaos", "xenos"].map(side =>
          `<span><i class="lg-dot lg-${side}" aria-hidden="true"></i>${this.t(side)}</span>`).join("") :
          this.tr("Все составы приносят очки. Каждый турнир даёт организации один ивент.", "All rosters contribute points. Each tournament counts once per organization.")}</footer></section>
        <aside class="lg-stack">${this.rulesPanel()}<section class="lg-panel"><h2>${this.tr("Учтённые турниры", "Counted tournaments")}</h2>
        ${counted.length ? list(counted.map(e => `<div><strong>${tournamentLink(e.name, e.slug)}</strong><small>${escape(this.eventMeta(e))}</small></div>`)) :
          status(this.tr("Пока нет учтённых этапов.", "No stages have counted yet."))}</section></aside></div>`;
    }
    table() {
      const solo = this.track === "solo";
      const first = this.criteria[0];
      const tieLabel = first?.name || shortMetric[first?.metric] || this.criterion(first);
      const header = [this.t("rank"), solo ? this.tr("Ник в Реестре", "Registry nickname") : this.tr("Организация", "Organization"), this.t("points"),
        ...(first ? [tieLabel] : []), this.t("events"), ...(solo ? [this.t("picks")] : [])];
      return `<table class="lg-table" aria-label="${escape(this.trackTitle(this.track))}"><thead><tr>${header.map(title => `<th scope="col">${escape(title)}</th>`).join("")}</tr></thead><tbody>
        ${this.rows.map((row, index) => {
          const open = this.expanded === row.subjectKey;
          const meta = ["guest", "missing_nickname"].includes(row.identityStatus) ? this.t(row.identityStatus) : "";
          const picks = row.picks || [];
          return `<tr class="lg-standing${row.rank === 1 ? " lg-leader" : ""}"><td class="lg-rank">${this.num(row.rank)}</td>
            <td class="lg-who">${button(row.name, "expand", index, {className: "lg-name", expanded: open})}${meta ? `<small>${escape(meta)}</small>` : ""}</td>
            <td class="lg-score" data-label="${this.t("points")}">${this.num(row.points)}</td>
            ${first ? `<td class="lg-tie" data-label="${escape(tieLabel)}">${this.num(row.criteriaValues?.[0])}</td>` : ""}
            <td class="lg-count" data-label="${this.t("events")}">${this.num(row.eventCount)}</td>
            ${solo ? `<td class="lg-picks"><div class="lg-chips">${picks.slice(0, 2).map((pick, pickIndex) =>
              button(pick.code || pick.name, "pick", `${index},${pickIndex}`, {className: `lg-pick-button lg-${this.pickSide(pick)}`, title: this.pickText(pick)})).join("")}
              ${picks.length > 2 ? button(`+${picks.length - 2}`, "more-picks", index, {className: "lg-more", title: this.tr("Все киллтимы", "All kill teams")}) : ""}</div></td>` : ""}</tr>
            ${open ? `<tr class="lg-detail-row"><td colspan="${header.length}">${this.history(row, index)}</td></tr>` : ""}`;
        }).join("")}</tbody></table>`;
    }
    pickSide(pick) { return ["loyal", "chaos", "xenos"].includes(pick.side) ? pick.side : "unknown"; }
    pickText(pick) {
      return [pick.name, this.t(this.pickSide(pick)), pick.declared ? this.tr("Заявлена", "Declared") : null].filter(Boolean).join(" · ");
    }
    fullPicks(picks = []) {
      return picks.length ? `<ul class="lg-full-picks">${picks.map(pick => {
        const logo = scope.killTeamLogoSrc?.(pick.name) || "/kill-team-logos/" + pathPart(pick.name === "Navy Breachers" ? "Imperial Navy Breachers" : pick.name) + ".webp";
        return `<li>${pick.code ? `<img src="${escape(logo)}" width="24" height="24" loading="lazy" alt=""><b class="lg-chip lg-${this.pickSide(pick)}">${escape(pick.code)}</b>` : ""}${escape(this.pickText(pick))}</li>`;
      }).join("")}</ul>` : "";
    }
    history(row, index) {
      const data = this.details.get(row.subjectKey);
      if (!data) return status(this.t("load"));
      if (data.error) return this.errorBox(data.error, "history-retry", index);
      const solo = this.track === "solo";
      return `<h3>${solo ? this.tr("Выступления игрока", "Player appearances") : this.tr("Вклад всех составов", "All roster contributions")}</h3>
        ${this.criteria.length ? `<p class="lg-note">${this.criteria.map((c, i) => `${escape(this.criterion(c))} · ${this.num(row.criteriaValues?.[i])}`).join(" / ")}</p>` : ""}
        ${list((data.history || []).map(c => {
          const facts = Object.entries(c.metrics || {}).filter(([key, val]) => METRICS.includes(key) && val != null).map(([key, val]) => `${this.t(key)} ${this.num(val)}`);
          const values = [c.rank == null ? "" : `#${this.num(c.rank)}`, c.rawTp == null ? "" : `${this.num(c.rawTp)} ${this.t("tpShort")}`, ...facts,
            this.tr(`в лигу +${this.num(c.points)}`, `league +${this.num(c.points)}`)].filter(Boolean);
          const names = [...new Set([c.displayName, ...(c.aliases || []), c.teamNameSnapshot].filter(Boolean))];
          return `<div><strong>${tournamentLink(c.tournamentName, c.tournamentSlug)}</strong> ${escape(names.join(" · "))}
            <small>${escape([this.dateLabel(c.tournamentDate), ...values].filter(Boolean).join(" · "))}</small>${this.fullPicks(c.picks)}
            ${(c.members || []).map(member => `<div class="lg-member"><strong>${escape(member.name)}</strong>${this.fullPicks(member.picks)}</div>`).join("")}</div>`;
        }))}`;
    }
    async expand(index, retry = false) {
      const row = this.rows[index];
      if (!row) return;
      const focus = `[data-action="expand"][data-value="${index}"]`;
      if (!retry && this.expanded === row.subjectKey) { this.expanded = ""; this.draw(focus); return; }
      this.expanded = row.subjectKey;
      if (retry) this.details.delete(row.subjectKey);
      this.draw(focus);
      if (this.details.has(row.subjectKey)) return;
      const ticket = this.loadTicket;
      try {
        const {row: detail} = await this.api(`/api/leagues/${pathPart(this.slug)}/standings/${pathPart(row.subjectKey)}?track=${this.track}`);
        if (ticket === this.loadTicket) this.details.set(row.subjectKey, detail);
      } catch (error) {
        if (ticket === this.loadTicket) this.details.set(row.subjectKey, {error});
      }
      if (this.current() && ticket === this.loadTicket && this.page === "standings" && !this.editor && this.expanded === row.subjectKey) {
        const cell = this.root.querySelector(".lg-detail-row > td");
        if (cell) cell.innerHTML = this.history(row, index);
      }
    }
    showPicks(value, all) {
      const [index, pickIndex] = value.split(",").map(Number);
      const row = this.rows[index];
      const dialog = document.createElement("dialog");
      dialog.className = "lg-dialog";
      dialog.setAttribute("aria-label", this.t("picks"));
      dialog.innerHTML = `<h2>${escape(row.name)}</h2>${this.fullPicks(all ? row.picks : [row.picks[pickIndex]])}<form method="dialog"><button class="lg-button">${this.t("close")}</button></form>`;
      const trigger = document.activeElement;
      dialog.addEventListener("close", () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); }, {once: true});
      this.root.append(dialog);
      dialog.showModal();
    }
    async openRegistry(all = false) {
      if (!this.league.viewer?.canManage) return;
      this.page = "registry";
      const registry = this.registry = {all, loading: true};
      this.draw();
      try {
        const url = `/api/leagues/${this.league.id}/bindings?status=${all ? "all" : "pending"}`;
        Object.assign(registry, await this.api(url));
      } catch (error) { registry.error = error; }
      if (this.registry === registry && this.page === "registry") { registry.loading = false; this.draw(); }
    }
    registryView() {
      const r = this.registry;
      const head = this.crumb(this.t("registry")) + this.head(this.t("registry"), this.league.name, button(this.t("standings"), "page", "standings"));
      if (r.loading) return head + status(this.t("load"));
      if (r.error) return head + this.errorBox(r.error, "registry-retry");
      const bindings = r.bindings || [];
      const places = r.places || [];
      const eventName = id => this.league.events.find(event => String(event.id) === String(id))?.name || `#${id}`;
      return head + tabs([["pending", this.tr("Требуют сверки", "Pending review")], ["all", this.tr("Все записи", "All records")]], r.all ? "all" : "pending", "registry-filter", this.t("registry")) +
        `<div class="lg-split"><section class="lg-panel"><h2>${this.tr("Исходные выступления", "Source appearances")}</h2>${bindings.length ? list(bindings.map((binding, index) =>
          `<div><strong>${escape(binding.name)}</strong><small>${escape(eventName(binding.tournamentId))} · ${binding.confirmed ? this.tr("Подтверждено", "Confirmed") : this.t("guest")}</small>
          <small>${escape(binding.sourceKey)}</small></div>${button(binding.confirmed ? this.tr("Исправить", "Correct") : this.tr("Сверить", "Review"), "select-binding", index, {expanded: r.selected === index})}`
        )) : status(this.tr("Нет записей для сверки.", "No appearances to review."))}
        ${places.length ? `<h2>${this.tr("Получатели очков за место", "Placement recipients")}</h2>${list(places.map((place, index) =>
          `<form data-form="place" data-index="${index}" class="lg-form lg-wide"><strong>${escape(eventName(place.tournamentId))} · ${this.tr("Слот", "Slot")} #${escape(place.participantId)}</strong>
          <label>${this.tr("Получатель единственной награды за место", "Recipient of the single placement award")}<select name="person" required>${optionsHtml([["", this.tr("Выберите участника", "Choose a participant")],
            ...place.candidates.map(c => [c.personId, c.name + " · #" + c.personId])], place.personId || "")}</select></label><button class="lg-button">${this.t("apply")}</button></form>`))}` : ""}
        </section><aside class="lg-panel" data-registry-panel>${this.bindingPanel()}</aside></div>
        ${r.writeError ? this.errorBox(r.writeError, "") : ""}`;
    }
    bindingPanel() {
      const r = this.registry;
      const binding = r.bindings?.[r.selected];
      if (!binding) return status(this.tr("Выберите выступление для сверки с Реестром.", "Select an appearance to match it to the registry."));
      const candidates = r.results || [];
      return `<h2>${escape(binding.name)}</h2><p class="lg-note">${escape(this.league.events.find(e => String(e.id) === String(binding.tournamentId))?.name || "")}</p>
        <form data-form="binding-search" class="lg-search"><label>${this.tr("Никнейм в Реестре", "Registry nickname")}<input name="query" maxlength="120" value="${escape(r.query || "")}"></label><button class="lg-button">${this.t("search")}</button></form>
        ${r.searching ? status(this.t("load")) : r.searchError ? this.errorBox(r.searchError, "candidate-retry") : `<form data-form="bind" class="lg-form">
          <fieldset><legend>${this.tr("Карточки Реестра", "Registry matches")}</legend>${candidates.length ? candidates.map((c, i) => {
            const ids = [c.userId && this.tr(`профиль #${c.userId}`, `profile #${c.userId}`), c.personId && this.tr(`карточка #${c.personId}`, `card #${c.personId}`)].filter(Boolean).join(" · ");
            return `<label class="lg-option"><input type="radio" name="candidate" value="${i}" required><span><strong>${escape(c.registerNickname || c.name)}</strong><small>${escape([c.displayName, ids].filter(Boolean).join(" · "))}</small></span></label>`;
          }).join("") : status(this.tr("Подходящих карточек не найдено.", "No matching cards found."))}</fieldset>
          ${candidates.length ? `
            ${binding.confirmed && binding.personId && !binding.userId ? `<label class="lg-option"><input type="checkbox" name="claimCard"><span>${this.tr("Связать с выбранным профилем все выступления этой гостевой карточки", "Link all appearances on this guest card to the selected profile")}</span></label>` : ""}
            <p class="lg-note">${this.tr("Очки, ивенты и пики выступления перейдут к выбранному участнику. Обе строки пересчитаются.", "Points, events and picks for this appearance will move to the selected person. Both rows will be recalculated.")}</p>
            <button class="lg-button lg-primary">${this.t("apply")}</button>` : ""}</form>
          <form class="lg-form" data-form="new-card"><h3>${this.tr("Игрок без аккаунта", "Player without an account")}</h3><label>${this.tr("Подтверждённый ник в Реестре", "Confirmed registry nickname")}<input name="nickname" required maxlength="80"></label>
          <button class="lg-button">${this.tr("Создать карточку и привязать", "Create card and link")}</button></form>`}`;
    }
    async findCandidates(query) {
      const r = this.registry;
      const binding = r.bindings[r.selected];
      r.query = query;
      r.searching = true;
      r.searchError = null;
      const ticket = r.searchTicket = Symbol();
      this.draw();
      try {
        const params = new URLSearchParams({status: r.all ? "all" : "pending", sourceKey: binding.sourceKey, q: query});
        const data = await this.api(`/api/leagues/${this.league.id}/bindings?${params}`);
        if (ticket === r.searchTicket) r.results = data.candidates;
      } catch (error) { if (ticket === r.searchTicket) r.searchError = error; }
      if (ticket === r.searchTicket && r === this.registry && this.page === "registry") {
        r.searching = false;
        this.draw('[data-form="binding-search"] input');
      }
    }
    async saveBinding(form) {
      const r = this.registry;
      if (r.writing) return;
      const data = new FormData(form);
      const kind = form.dataset.form;
      let endpoint;
      const body = {revision: this.league.revision};
      if (kind === "place") {
        const place = r.places[Number(form.dataset.index)];
        endpoint = `places/${pathPart(place.tournamentId)}/${pathPart(place.participantId)}`;
        body.personId = Number(data.get("person"));
      } else {
        const binding = r.bindings[r.selected];
        endpoint = `bindings/${pathPart(binding.sourceKey)}`;
        if (kind === "new-card") {
          body.registerNickname = String(data.get("nickname")).trim();
          if (!body.registerNickname) return;
        } else {
          const candidate = r.results[Number(data.get("candidate"))];
          if (!candidate) return;
          if (data.has("claimCard") && !candidate.userId) {
            r.writeError = new Error(this.tr("Чтобы связать всю карточку, выберите профиль с аккаунтом.", "Select an account profile to link the entire card."));
            this.draw();
            return;
          }
          if (candidate.userId) body.userId = candidate.userId;
          else body.personId = candidate.personId;
          if (data.has("claimCard")) body.claimCard = true;
        }
      }
      r.writing = true;
      form.querySelector("button").disabled = true;
      try {
        const result = await this.api(`/api/leagues/${this.league.id}/${endpoint}`, {method: "PUT", body});
        if (!this.current()) return;
        this.league.revision = result.revision;
        const wasAll = r.all;
        const keepRegistry = r === this.registry && this.page === "registry";
        await this.load();
        if (this.current() && !this.pageError && keepRegistry) await this.openRegistry(wasAll);
      } catch (error) { r.writeError = error; if (r === this.registry) this.draw(); }
      finally { r.writing = false; }
    }
    startEditor(step) {
      if (this.league ? !this.league.viewer?.canManage : !this.canCreate) return;
      this.editor = new scope.KTLeagueEditor(this, shared, step);
      this.editor.open();
    }
    click(event) {
      const link = event.target.closest("a[data-league]");
      if (link && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.button === 0) {
        event.preventDefault();
        this.options.navigate(link.dataset.league || null, link.dataset.track || null);
        return;
      }
      const target = event.target.closest("button[data-action]");
      if (!target || target.disabled) return;
      const {action, value} = target.dataset;
      if (action === "reload" || action === "retry") { this.load(); return; }
      if (this.editor) { this.editor.click(action, value); return; }
      switch (action) {
        case "create": case "edit": case "edit-events": this.startEditor(action === "edit-events" ? 2 : 1); break;
        case "page":
          if (value === "registry") this.openRegistry();
          else { this.page = value; this.registry = null; this.draw(`[data-action="page"][data-value="${value}"]`); }
          break;
        case "expand": this.expand(Number(value)); break;
        case "history-retry": this.expand(Number(value), true); break;
        case "pick": case "more-picks": this.showPicks(value, action === "more-picks"); break;
        case "registry-retry": this.openRegistry(this.registry.all); break;
        case "registry-filter": this.openRegistry(value === "all"); break;
        case "select-binding":
          this.registry.selected = Number(value);
          this.registry.writeError = null;
          this.findCandidates(this.registry.bindings[Number(value)].name || "");
          break;
        case "candidate-retry": this.findCandidates(this.registry.query || ""); break;
      }
    }
    submit(event) {
      const form = event.target;
      if (!form.dataset.form) return;
      event.preventDefault();
      if (this.editor) this.editor.submit(form);
      else if (form.dataset.form === "binding-search") this.findCandidates(new FormData(form).get("query").trim());
      else this.saveBinding(form);
    }
  }

  function mount(container, options) {
    const root = document.createElement("div");
    root.className = "kt-leagues";
    container.replaceChildren(root);
    const screen = new LeagueScreen(root, options);
    return screen.load();
  }
  scope.KTLeagues = {mount};
  if (typeof module !== "undefined" && module.exports) module.exports = {LeagueScreen, shared, leagueUrl, mount};
})(typeof window === "undefined" ? globalThis : window);

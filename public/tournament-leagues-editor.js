/* Creation and configuration share one draft, preview and atomic save. */
(function (scope) {
  "use strict";

  function defaultRule(track) {
    return {primary: track === "solo" ? "tp" : "place", scale: [10, 8, 6, 4, 0], criteria: []};
  }
  class LeagueEditor {
    constructor(screen, shared, step) {
      this.screen = screen;
      this.ui = shared;
      this.step = step;
      this.tr = screen.tr.bind(screen);
      this.t = screen.t.bind(screen);
      const league = screen.league;
      this.name = league?.name || "";
      this.formats = new Set(league?.formats || shared.FORMATS);
      this.selected = new Set((league?.tournamentIds || []).map(String));
      this.sources = new Map((league?.events || []).map(event => [String(event.id), event]));
      this.rules = {};
      this.importing = {};
      this.include = {};
      for (const track of ["solo", "org"]) {
        this.rules[track] = structuredClone(league?.rules?.[track] || defaultRule(track));
        this.importing[track] = Boolean(this.rules[track].sourceTournamentId);
      }
      this.track = this.tracks().includes(screen.track) ? screen.track : this.tracks()[0];
      this.visible = [];
      this.searchText = "";
    }
    tracks() { return this.ui.tracksFor([...this.formats]); }
    active() { return this.screen.current() && this.screen.editor === this; }
    open() {
      this.screen.draw();
      this.fetchSources("");
      if (this.step > 1) this.queuePreview();
    }
    async fetchSources(query) {
      this.searchText = query;
      this.searchError = null;
      this.searching = true;
      const ticket = this.searchTicket = Symbol();
      this.drawSources();
      try {
        const params = new URLSearchParams({q: query});
        if (this.screen.league) params.set("leagueId", this.screen.league.id);
        const response = await this.screen.api(`/api/leagues/sources?${params}`);
        if (!this.active() || ticket !== this.searchTicket) return;
        this.visible = response.sources.map(source => String(source.id));
        for (const source of response.sources) {
          const key = String(source.id);
          this.sources.set(key, {...this.sources.get(key), ...source});
        }
      } catch (error) { if (ticket === this.searchTicket) this.searchError = error; }
      finally {
        if (this.active() && ticket === this.searchTicket) {
          this.searching = false;
          this.drawSources();
        }
      }
    }
    drawSources() {
      if (!this.active()) return;
      const list = this.screen.root.querySelector("[data-source-results]");
      if (list) list.innerHTML = this.step === 2 ? this.sourceList() : this.importFields();
    }
    configure() {
      const rules = {};
      const ids = new Set(this.selected);
      for (const track of this.tracks()) {
        const rule = this.rules[track];
        rules[track] = structuredClone(rule);
        if (this.include[track] && rule.importTournamentId) ids.add(String(rule.importTournamentId));
      }
      const body = {name: this.name.trim(), formats: [...this.formats], tournamentIds: [...ids].map(Number), rules};
      if (this.screen.league) body.revision = this.screen.league.revision;
      return body;
    }
    validation() {
      if (!this.name.trim()) return this.tr("Укажите название лиги.", "Enter a league name.");
      if (!this.formats.size) return this.tr("Выберите хотя бы один формат.", "Choose at least one format.");
      if (this.step === 1) return "";
      for (const id of this.selected) {
        const source = this.sources.get(id);
        if (source && !this.formats.has(source.format)) {
          return this.tr(`Уберите этап «${source.name}» или включите его формат.`, `Remove “${source.name}” or enable its format.`);
        }
      }
      for (const track of this.tracks()) {
        const rule = this.rules[track];
        if (this.importing[track] && !rule.importTournamentId && !rule.sourceTournamentId)
          return this.tr("Выберите турнир для копирования порядка.", "Choose a tournament to copy the order from.") + " " + this.screen.trackTitle(track);
        if (!rule.scale.length || rule.scale.some((v, i) => !Number.isSafeInteger(v) || v < 0 || (i && v > rule.scale[i - 1])))
          return this.tr("Задайте шкалу целыми неотрицательными значениями по убыванию.", "Use nonnegative whole numbers in non-increasing order for the place scale.") + " " + this.screen.trackTitle(track);
      }
      return "";
    }
    endpoint() { return "/api/leagues" + (this.screen.league ? `/${this.screen.league.id}` : ""); }
    queuePreview() {
      clearTimeout(this.timer);
      this.savedError = null;
      this.preview = null;
      this.previewError = null;
      const ticket = this.previewTicket = Symbol();
      if (this.step < 2 || !this.active()) return;
      this.busy = !this.validation();
      this.drawPreview();
      if (this.busy) this.timer = setTimeout(() => this.fetchPreview(ticket), 180);
    }
    async fetchPreview(ticket) {
      if (!this.active() || this.previewTicket !== ticket) return;
      try {
        const preview = await this.screen.api(this.endpoint() + "/preview", {method: "POST", body: this.configure()});
        if (this.previewTicket === ticket) this.preview = preview;
      } catch (error) { if (this.previewTicket === ticket) this.previewError = error; }
      finally {
        if (this.active() && this.previewTicket === ticket) { this.busy = false; this.drawPreview(); }
      }
    }
    drawPreview() {
      const panel = this.screen.root.querySelector("[data-preview]");
      if (panel) panel.innerHTML = this.previewPanel();
      const save = this.screen.root.querySelector('[data-action="save-league"]');
      if (save) save.disabled = !this.canSave();
    }
    canSave() { return this.preview?.valid === true && !this.saving && !this.validation() && this.savedError?.status !== 409; }
    go(step) {
      this.step = step;
      this.formError = "";
      this.track = this.tracks().includes(this.track) ? this.track : this.tracks()[0];
      this.screen.draw();
      this.queuePreview();
      this.screen.root.querySelector(".lg-head h1")?.focus();
    }
    render() {
      const {button, escape} = this.ui;
      const s = this.screen;
      const editing = Boolean(s.league);
      const title = editing ? this.t("edit") : this.tr("Новая лига", "New league");
      const steps = [this.tr("Название и форматы", "Name and formats"), this.t("tournaments"), this.tr("Правила", "Rules")];
      return s.crumb(title) + s.head(title, editing ? s.league.name : "", button(this.t("cancel"), "editor-cancel", "", {disabled: this.saving})) +
        `<ol class="lg-steps">${steps.map((label, i) => `<li${this.step === i + 1 ? ' aria-current="step"' : ""}><span>${i + 1}</span>${escape(label)}</li>`).join("")}</ol>
        <fieldset class="lg-workarea"${this.saving ? " disabled" : ""}>${this.step === 1 ? this.firstStep() : this.step === 2 ? this.eventStep() : this.ruleStep()}</fieldset>`;
    }
    firstStep() {
      const {escape, FORMATS} = this.ui;
      return `<form class="lg-panel lg-form" data-form="basics"><label>${this.tr("Название лиги", "League name")}<input name="name" required maxlength="120" value="${escape(this.name)}"></label>
        <fieldset><legend>${this.tr("Форматы турниров", "Tournament formats")}</legend><div class="lg-options">${FORMATS.map(format =>
          `<label class="lg-option"><input type="checkbox" name="format" value="${format}"${this.formats.has(format) ? " checked" : ""}><span><strong>${this.t(format)}</strong><small>${this.screen.trackTitle(this.ui.trackFor(format))}</small></span></label>`).join("")}</div></fieldset>
        <p class="lg-note">${this.tr("Парные и командные турниры можно объединить в одной таблице организаций.", "Doubles and team events can share one organization table.")}</p>
        ${this.formError ? `<p class="lg-notice" role="alert">${escape(this.formError)}</p>` : ""}
        <div class="lg-actions"><button class="lg-button lg-primary">${this.tr("Далее к турнирам", "Continue to tournaments")}</button></div></form>`;
    }
    searchForm() {
      return `<form data-form="source-search" class="lg-search"><label>${this.tr("Найти турнир по названию", "Find a tournament by name")}<input name="query" type="search" maxlength="160" value="${this.ui.escape(this.searchText)}"></label><button class="lg-button">${this.t("search")}</button></form>`;
    }
    sourceList() {
      const {escape, list, status} = this.ui;
      if (this.searchError) return this.screen.errorBox(this.searchError, "sources-retry");
      if (this.searching) return status(this.t("load"));
      const keys = [...new Set([...this.selected, ...this.visible])];
      const options = keys.map(id => this.sources.get(id)).filter(s => s && (this.formats.has(s.format) || this.selected.has(String(s.id))));
      return options.length ? list(options.map(source => {
        const id = String(source.id);
        const wasLinked = (this.screen.league?.tournamentIds || []).some(value => String(value) === id);
        const caption = [this.screen.eventMeta(source), this.t(source.status), wasLinked ? this.tr("Уже в лиге", "Already linked") : ""].filter(Boolean);
        return `<label class="lg-choice"><input type="checkbox" name="tournament" value="${escape(id)}"${this.selected.has(id) ? " checked" : ""}>
          <span><strong>${escape(source.name)}</strong><small>${escape(caption.join(" · "))}</small></span></label>`;
      })) : status(this.tr("Подходящие турниры не найдены. Можно создать лигу без этапов.", "No matching tournaments found. You can start a league without stages."));
    }
    eventStep() {
      const {button} = this.ui;
      return `<div class="lg-split"><section class="lg-panel"><h2>${this.tr("Подключить этапы", "Link tournaments")}</h2><p class="lg-note">${this.tr("Опубликованные итоги войдут сразу. Предстоящие этапы появятся в зачёте после публикации.", "Published results count immediately. Upcoming stages start counting once results are published.")}</p>
        ${this.searchForm()}<div data-source-results>${this.sourceList()}</div>
        <div class="lg-step-actions">${button(this.tr("Назад", "Back"), "step", 1)}${button(this.tr("Далее к правилам", "Continue to rules"), "step", 3, {primary: true})}</div></section>
        <aside class="lg-panel lg-preview" data-preview>${this.previewPanel()}</aside></div>`;
    }
    ruleStep() {
      const {button, tabs} = this.ui;
      const tracks = this.tracks();
      const rule = this.rules[this.track];
      const trackTabs = tracks.length > 1 ? tabs(tracks.map(t => [t, this.screen.trackTitle(t)]), this.track, "editor-track", this.t("standings")) : "";
      return trackTabs + `<div class="lg-split"><section class="lg-panel lg-form"><h2>${this.screen.trackTitle(this.track)}</h2><fieldset><legend>${this.tr("Основные очки", "Primary points")}</legend>
        <div class="lg-options">${["tp", "place"].map(primary => `<label class="lg-option"><input type="radio" name="primary" value="${primary}"${rule.primary === primary ? " checked" : ""}><span>${this.t(primary)}</span></label>`).join("")}</div></fieldset>
        ${rule.primary === "place" ? this.scaleFields() : this.pointFormats()}
        <h3>${this.tr("Тай-брейки", "Tie-breakers")}</h3>
        ${tabs([["custom", this.tr("Свой порядок", "Custom order")], ["import", this.tr("Из турнира", "Copy from tournament")]], this.importing[this.track] ? "import" : "custom", "rule-mode", this.tr("Источник тай-брейков", "Tie-breaker source"))}
        ${this.importing[this.track] ? this.searchForm() + `<div data-source-results>${this.importFields()}</div>` : this.criteriaFields()}
        <div class="lg-step-actions">${button(this.tr("Назад", "Back"), "step", 2)}${button(this.saving ? this.tr("Сохранение…", "Saving…") : this.screen.league ? this.t("save") : this.t("create"), "save-league", "", {primary: true, disabled: !this.canSave()})}</div>
        ${this.savedError ? this.screen.errorBox(this.savedError, "save-league") : ""}</section><aside class="lg-panel lg-preview" data-preview>${this.previewPanel()}</aside></div>`;
    }
    pointFormats() {
      if (this.track === "solo") return "";
      return `<p class="lg-note">${this.tr("Складываются опубликованные ТП всех составов в исходной шкале турнира. В Doubles учитываются базовые ТП и бонус VP, в WTC — результат 2/1/0 за матч, в классическом «Мече и щите» — очки каждого стола.", "Each roster contributes its published TP on its tournament’s scale. Doubles uses base TP and VP bonuses, WTC uses 2/1/0 per match, and classic Sword and Shield scores each table.")}</p>`;
    }
    scaleFields() {
      const {escape, button} = this.ui;
      const scale = this.rules[this.track].scale;
      return `<fieldset><legend>${this.tr("Шкала мест", "Placement scale")}</legend><div class="lg-scale">${scale.map((v, index) =>
        `<label>${index === scale.length - 1 ? this.tr(`С ${index + 1}-го`, `#${index + 1} onward`) : `#${index + 1}`}<input type="number" min="0" step="1" required name="scale" data-index="${index}" value="${escape(v)}"></label>`).join("")}</div>
        <div class="lg-actions">${button(this.tr("Добавить место", "Add a place"), "scale-add", "", {disabled: scale.length >= 256})}${button(this.tr("Убрать место", "Remove a place"), "scale-remove", "", {disabled: scale.length < 2})}</div></fieldset>`;
    }
    availableMetrics() {
      const {METRICS, trackFor} = this.ui;
      const sources = [...this.selected].map(id => this.sources.get(id)).filter(s => s && trackFor(s.format) === this.track);
      return METRICS.filter(metric => {
        if (this.track === "org" && ["buchholz", "head_to_head"].includes(metric)) return false;
        if (this.track === "solo" && metric === "average_sos") return false;
        if (this.track === "org" && !this.formats.has("doubles") && ["strength_of_schedule", "average_sos"].includes(metric)) return false;
        return sources.every(s => !s.supportedMetrics || s.supportedMetrics.includes(metric));
      });
    }
    criteriaFields() {
      const {button, escape, optionsHtml} = this.ui;
      const rule = this.rules[this.track];
      const metrics = this.availableMetrics();
      const available = metrics.filter(m => !rule.criteria.some(c => c.metric === m && c.aggregate === "sum"));
      const up = this.tr("Выше", "Up"), down = this.tr("Ниже", "Down"), remove = this.tr("Убрать", "Remove");
      return `<ol class="lg-criterion-list">${rule.criteria.map((criterion, i) => {
        const name = this.screen.criterion(criterion);
        return `<li><div><strong>${escape(name)}</strong>${criterion.name ? `<small>${escape(this.t(criterion.metric))} · ${criterion.aggregate === "max" ? this.tr("лучшее за этап", "best stage") : this.tr("сумма", "sum")}</small>` : ""}</div>
          <div class="lg-actions">${button(up, "criterion-up", i, {disabled: i === 0, title: up + " · " + name})}${button(down, "criterion-down", i, {disabled: i === rule.criteria.length - 1, title: down + " · " + name})}${button(remove, "criterion-remove", i, {title: remove + " · " + name})}</div></li>`;
      }).join("")}</ol>${rule.criteria.length ? "" : `<p class="lg-note">${this.tr("При равных основных очках участники делят место.", "Participants with equal primary points share a rank.")}</p>`}
        ${available.length ? `<form class="lg-search" data-form="criterion"><label>${this.tr("Добавить тай-брейк", "Add a tie-breaker")}<select name="metric">${optionsHtml(available.map(m => [m, this.t(m)]))}</select></label><button class="lg-button">${this.tr("Добавить", "Add")}</button></form>` : ""}
        <details class="lg-custom"${this.customOpen ? " open" : ""}><summary>${this.tr("Свой критерий", "Custom criterion")}</summary>
        <form class="lg-form" data-form="custom"><label>${this.tr("Название критерия", "Criterion name")}<input name="criterionName" maxlength="80" required></label>
        <label>${this.tr("Показатель", "Metric")}<select name="metric">${optionsHtml(metrics.map(m => [m, this.t(m)]))}</select></label>
        <label>${this.tr("Способ объединения", "Aggregation")}<select name="aggregate"><option value="sum">${this.tr("Сумма", "Sum")}</option><option value="max">${this.tr("Лучшее значение за этап", "Best stage value")}</option></select></label>
        <p class="lg-note">${this.tr("Большее значение выше. Для организации сначала складываются значения всех её составов внутри этапа.", "Higher values rank first. An organization’s rosters are added together within each stage before aggregation.")}</p>
        <p role="alert" class="lg-notice" data-custom-error hidden></p><button class="lg-button">${this.tr("Добавить критерий", "Add criterion")}</button></form></details>`;
    }
    importFields() {
      const {optionsHtml, escape, status, trackFor} = this.ui;
      if (this.searchError) return this.screen.errorBox(this.searchError, "sources-retry");
      if (this.searching) return status(this.t("load"));
      const rule = this.rules[this.track];
      const saved = rule.sourceTournamentId;
      const importId = rule.importTournamentId;
      const keys = [...new Set([...(importId ? [String(importId)] : []), ...this.visible])];
      const sources = keys.map(id => this.sources.get(id)).filter(s => s && this.formats.has(s.format) && trackFor(s.format) === this.track &&
        ["completed", "counted", "needs_data", "published"].includes(s.status));
      const options = [["", saved ? this.tr("Сохранённая копия", "Saved snapshot") + " · " + rule.sourceName : this.tr("Выберите турнир", "Select a tournament")],
        ...sources.map(s => [s.id, s.name])];
      const criteria = importId ? this.sources.get(String(importId))?.order || [] : saved ? rule.criteria : [];
      return `<div class="lg-form"><label>${this.tr("Турнир — источник порядка", "Tournament to copy from")}<select name="import-source">${optionsHtml(options, importId || "")}</select></label>
        ${saved || importId ? `<p class="lg-note">${escape(criteria.map(c => this.screen.criterion(c)).join(" → ") || this.tr("Без тай-брейков", "No tie-breakers"))}</p>` : ""}
        ${importId ? `<label class="lg-option"><input type="checkbox" name="include-source"${this.include[this.track] || this.selected.has(String(importId)) ? " checked" : ""}${this.selected.has(String(importId)) ? " disabled" : ""}>
        <span>${this.tr("Добавить источник как этап лиги", "Also link the source as a league stage")}</span></label>` : ""}</div>`;
    }
    previewPanel() {
      const {escape, list, status} = this.ui;
      const title = `<h2>${this.t("preview")}</h2>`;
      const warning = this.validation();
      if (warning) return title + status(warning);
      if (this.previewError) return title + this.screen.errorBox(this.previewError, "preview-retry");
      if (this.busy || !this.preview) return title + status(this.t("load"));
      const p = this.preview;
      const events = p.league?.events || [...this.sources.values()];
      const issues = (p.issues || []).map(issue => this.screen.issue(issue, events));
      const summary = p.league?.events ? `<p class="lg-note">${this.tr("Привязано турниров", "Linked tournaments")} · ${p.league.events.length}. ${this.tr("Учтено сразу", "Counting now")} · ${p.league.events.filter(e => e.status === "counted").length}.</p>` : "";
      const shown = this.step === 3 ? [this.track] : this.tracks();
      return title + summary + (issues.length ? `<div role="status" class="lg-notice">${list(issues.map(escape))}</div>` : "") +
        shown.map(track => {
          const rows = p.standings?.[track] || [];
          const changes = p.changes?.[track] || [];
          const criteria = p.league?.rules?.[track]?.criteria || this.rules[track].criteria;
          return `<h3>${this.screen.trackTitle(track)}</h3>${rows.length ? list(rows.map(row =>
            `<div><strong>#${this.screen.num(row.rank)} · ${escape(row.name)}</strong>
              <small>${escape(criteria.map((c, i) => this.screen.criterion(c) + " " + this.screen.num(row.criteriaValues?.[i])).join(" · "))}</small></div>
              <strong>${this.screen.num(row.points)} ${this.t("points").toLocaleLowerCase(this.screen.locale)}</strong>`)) : status(this.tr("Пока нет учтённых выступлений.", "No appearances counted yet."))}
              ${changes.length ? `<details><summary>${this.tr("Изменения мест", "Rank changes")} (${changes.length})</summary>${list(changes.map(c => `<span>${escape(c.name)}</span><b>${this.screen.num(c.from)} → ${this.screen.num(c.to)}</b>`))}</details>` : ""}`;
        }).join("");
    }
    changed(focus) {
      this.queuePreview();
      this.screen.draw(focus);
    }
    input(target) {
      if (target.name === "name") this.name = target.value;
      if (target.name === "scale") {
        this.rules[this.track].scale[Number(target.dataset.index)] = target.value === "" ? null : Number(target.value);
        this.queuePreview();
      }
    }
    change(target) {
      if (this.saving) return;
      const rule = this.rules[this.track];
      const name = target.name;
      if (name === "format") {
        if (target.checked) this.formats.add(target.value); else this.formats.delete(target.value);
      } else if (name === "tournament") {
        if (target.checked) this.selected.add(target.value); else this.selected.delete(target.value);
        this.queuePreview();
      } else if (name === "primary") {
        rule.primary = target.value;
        this.changed(`input[name=primary][value="${target.value}"]`);
      } else if (name === "import-source") {
        if (target.value) rule.importTournamentId = Number(target.value); else delete rule.importTournamentId;
        this.include[this.track] = false;
        this.changed("[name=import-source]");
      } else if (name === "include-source") {
        this.include[this.track] = target.checked;
        this.queuePreview();
      } else if (name === "metric" && target.form?.dataset.form === "custom") {
        const max = target.form.querySelector('option[value="max"]');
        max.disabled = ["head_to_head", "events"].includes(target.value);
        if (max.disabled) target.form.elements.aggregate.value = "sum";
      }
    }
    submit(form) {
      if (this.saving) return;
      const data = new FormData(form);
      if (form.dataset.form === "basics") {
        this.name = String(data.get("name"));
        this.formats = new Set(data.getAll("format"));
        this.formError = this.validation();
        if (this.formError) this.screen.draw();
        else this.go(2);
      } else if (form.dataset.form === "source-search") {
        this.fetchSources(String(data.get("query")).trim());
      } else {
        const rule = this.rules[this.track];
        const metric = data.get("metric");
        const custom = form.dataset.form === "custom";
        const aggregate = custom ? data.get("aggregate") : "sum";
        const name = custom ? String(data.get("criterionName")).trim() : "";
        if (custom) {
          let message = "";
          if (!name) message = this.tr("Укажите название критерия.", "Enter a criterion name.");
          else if (rule.criteria.some(c => c.metric === metric && c.aggregate === aggregate))
            message = this.tr("Такой показатель с этим способом объединения уже добавлен.", "This metric and aggregation are already in the order.");
          if (message) {
            const error = form.querySelector("[data-custom-error]");
            error.textContent = message;
            error.hidden = false;
            return;
          }
        }
        if (!this.availableMetrics().includes(metric)) return;
        rule.criteria.push({metric, aggregate, ...(custom ? {name} : {})});
        this.changed(`[data-action=criterion-up][data-value="${rule.criteria.length - 1}"]:enabled, .lg-custom summary`);
      }
    }
    click(action, value) {
      if (this.saving) return;
      const rule = this.rules[this.track];
      const index = Number(value);
      switch (action) {
        case "editor-cancel":
          clearTimeout(this.timer);
          this.screen.editor = null;
          this.screen.draw();
          break;
        case "step": this.go(index); break;
        case "editor-track":
          this.track = value;
          this.screen.draw(`[data-action=editor-track][data-value="${value}"]`);
          break;
        case "rule-mode": {
          if (this.importing[this.track] === (value === "import")) return;
          if (value === "custom" && rule.importTournamentId) {
            const copied = this.sources.get(String(rule.importTournamentId));
            if (copied) rule.criteria = copied.order.map(metric => ({metric, aggregate: "sum"}));
          }
          this.importing[this.track] = value === "import";
          delete rule.importTournamentId;
          delete rule.sourceTournamentId;
          delete rule.sourceName;
          this.include[this.track] = false;
          this.changed(`[data-action=rule-mode][data-value="${value}"]`);
          break;
        }
        case "criterion-up": case "criterion-down": {
          const to = index + (action === "criterion-up" ? -1 : 1);
          if (to < 0 || to >= rule.criteria.length) return;
          [rule.criteria[to], rule.criteria[index]] = [rule.criteria[index], rule.criteria[to]];
          this.changed(`[data-action=criterion-remove][data-value="${to}"]`);
          break;
        }
        case "criterion-remove":
          rule.criteria.splice(index, 1);
          this.changed("[data-form=criterion] select, .lg-custom summary");
          break;
        case "scale-add":
          rule.scale.splice(-1, 0, rule.scale.at(-1));
          this.changed(`input[name=scale][data-index="${rule.scale.length - 2}"]`);
          break;
        case "scale-remove":
          if (rule.scale.length > 1) rule.scale.splice(-2, 1);
          this.changed("[data-action=scale-add]");
          break;
        case "preview-retry": this.queuePreview(); break;
        case "sources-retry": this.fetchSources(this.searchText); break;
        case "save-league": this.save(); break;
      }
    }
    async save() {
      if (!this.canSave()) return;
      this.saving = true;
      this.savedError = null;
      this.screen.draw();
      try {
        const body = this.configure();
        const {league} = await this.screen.api(this.endpoint(), {method: this.screen.league ? "PATCH" : "POST", body});
        if (!this.active()) return;
        this.screen.editor = null;
        const track = this.ui.tracksFor(league.formats).includes(this.track) ? this.track : this.ui.tracksFor(league.formats)[0];
        this.screen.options.navigate(league.slug, track);
      } catch (error) {
        this.savedError = error;
        this.saving = false;
        if (this.active()) this.screen.draw();
      }
    }
  }
  scope.KTLeagueEditor = LeagueEditor;
  if (typeof module !== "undefined" && module.exports) module.exports = {LeagueEditor};
})(typeof window === "undefined" ? globalThis : window);

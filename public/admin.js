// Administration UI, loaded on demand.
//
// Nothing here runs for a player who is not an administrator, and it was a
// fifth of the client bundle -- so app.js fetches this file only after /api/me
// says the visitor is one. It is a classic script loaded after app.js and shares
// that file's global scope, which is where state, api, t, escapeHtml and the
// render helpers come from. The export at the bottom is the surface app.js calls
// back into.

function adminTournamentSettingsContent(data) {
  return adminTournamentEditForm(data.tournament || {});
}

function wireFeedbackAdminActions() {
  document.querySelectorAll("[data-feedback-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/admin/feedback/${button.dataset.feedbackStatus}`, {
          method: "PATCH",
          body: { status: button.dataset.status }
        });
        await loadFeedback();
        renderFeedback();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });
  document.querySelectorAll("[data-feedback-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!await confirmDelete(t("dialog.feedback.delete"))) return;
      try {
        await api(`/api/admin/feedback/${button.dataset.feedbackDelete}`, { method: "DELETE" });
        await loadFeedback();
        renderFeedback();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });
}

function adminPlayerToolsCard(user) {
  const reset = state.adminPasswordReset?.userId === user.id ? state.adminPasswordReset : null;
  return `
    <div class="card panel">
      <div class="panel-header">
        <div>
          <h3>${t("profile.admin.toolsTitle")}</h3>
          <p class="muted">${t("profile.admin.toolsSubtitle")}</p>
        </div>
      </div>
      <div class="row-actions">
        <button class="danger-button" data-admin-reset-password="${user.id}">${t("profile.admin.resetPassword")}</button>
      </div>
      ${reset ? `
        <div class="row-card admin-password-card">
          <div class="row-main">
            <div class="row-title">${t("profile.admin.tempPasswordTitle")}</div>
            <div class="row-meta">${t("profile.admin.tempPasswordHint")}</div>
          </div>
          <div class="row-actions">
            <code class="admin-password-value">${escapeHtml(reset.password)}</code>
            <button class="small-button" data-admin-copy-password="${escapeHtml(reset.password)}">${t("profile.admin.copy")}</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function wireAdminPlayerTools(profileUserId) {
  document.querySelector("[data-admin-reset-password]")?.addEventListener("click", async () => {
    const confirmed = await confirmAction({ message: t("dialog.admin.resetPassword"), confirmLabel: t("profile.admin.resetPassword") });
    if (!confirmed) return;
    try {
      const data = await api(`/api/admin/users/${profileUserId}/reset-password`, { method: "POST" });
      state.adminPasswordReset = { userId: profileUserId, password: data.password };
      renderShell();
    } catch (err) {
      setPlayerProfileMessage(err.message, true);
    }
  });
  document.querySelector("[data-admin-copy-password]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    try {
      await copyText(button.dataset.adminCopyPassword);
      button.textContent = t("profile.admin.copied");
      button.disabled = true;
      window.setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1400);
    } catch (err) {
      setPlayerProfileMessage(err.message, true);
    }
  });
}

function adminPendingGamesCard(profile) {
  const games = profile.pendingGames || [];
  return `
    <div class="card panel">
      <div class="panel-header">
        <div>
          <h3>${t("profile.admin.pendingGamesTitle")}</h3>
          <p class="muted">${t("profile.admin.pendingGamesSubtitle")}</p>
        </div>
      </div>
      <div class="list">
        ${games.length ? games.map((game) => `
          <div class="row-card">
            <div class="row-main">
              <div class="row-title">${escapeHtml(gameTitle(game))}</div>
              <div class="row-meta">${escapeHtml(pendingResultSummary(game))}</div>
            </div>
            <div class="row-actions">
              <button class="small-button" data-admin-pending-open="${game.id}">${t("tournaments.card.open")}</button>
              <button class="small-button" data-admin-pending-confirm="${game.id}">${t("games.detail.forceConfirm")}</button>
              <button class="danger-button" data-admin-pending-delete="${game.id}">${t("common.delete")}</button>
            </div>
          </div>
        `).join("") : `<div class="empty">${t("profile.admin.pendingGamesEmpty")}</div>`}
      </div>
    </div>
  `;
}

function wireAdminPendingGameButtons(profileUserId) {
  document.querySelectorAll("[data-admin-pending-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openGameDetail(Number(button.dataset.adminPendingOpen));
    });
  });
  document.querySelectorAll("[data-admin-pending-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminDeleteGame(Number(button.dataset.adminPendingDelete), profileUserId);
    });
  });
  document.querySelectorAll("[data-admin-pending-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminForceConfirmGame(Number(button.dataset.adminPendingConfirm), profileUserId);
    });
  });
}

function adminChallengeActions(progress) {
  const current = progress.teams.find((item) => item.status === "current");
  return `
    <div class="row-actions">
      ${current ? `<button class="primary-button" data-credit-user="${progress.user.id}" data-credit-team="${escapeHtml(current.team)}">${t("challenge.admin.creditNext")}</button>` : ""}
      ${progress.wildcards.filter((item) => item.status !== "completed").map((item) => `
        <button class="small-button" data-credit-user="${progress.user.id}" data-credit-team="${escapeHtml(item.team)}">${t("challenge.admin.creditTeam", { team: escapeHtml(item.team) })}</button>
      `).join("")}
    </div>
  `;
}

// The stems are the Kill Team names; only the spellings that differ from the
// file on disk are listed. WebP at the same 256x256 is visually identical to
// the PNG it replaced and 42% of the bytes -- which matters because the stats
// and challenge screens render all 48 of these at once.

async function adminChallengeCredit(userId, team, action) {
  try {
    const data = await api(`/api/admin/users/${userId}/challenge-credit`, { method: "POST", body: { team, action, track: state.challengeTab } });
    upsertChallengeProgress(data.progress);
    state.selectedChallengeUserId = userId;
    renderChallenge();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function adminDeleteGame(gameId, profileUserId = null) {
  const game = getKnownGame(gameId);
  const confirmed = await confirmDelete(
    game?.status === "pending_confirmation" ? t("dialog.games.deletePendingGame") : t("dialog.games.deleteActiveGame")
  );
  if (!confirmed) return;
  try {
    await api(`/api/admin/games/${gameId}`, { method: "DELETE" });
    await refresh();
    if (state.me?.isAdmin) await loadAdminGames();
    await loadGames();
    if (profileUserId) {
      await loadPlayerProfile(profileUserId);
      renderShell();
      setPlayerProfileMessage(t("message.games.deleted"));
      return;
    }
    state.view = "games";
    state.gamesTab = state.me?.isAdmin ? "sessions" : "history";
    state.selectedGameId = null;
    syncAppHash();
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
    setPlayerProfileMessage(err.message, true);
  }
}

async function adminForceConfirmGame(gameId, profileUserId = null) {
  const confirmed = await confirmAction({ message: t("dialog.games.forceConfirmResult"), confirmLabel: t("games.detail.forceConfirm"), danger: false });
  if (!confirmed) return;
  try {
    await api(`/api/admin/games/${gameId}/confirm-result`, { method: "POST" });
    await refresh();
    if (state.me?.isAdmin) await loadAdminGames();
    await loadTop();
    await loadGames();
    if (profileUserId) {
      await loadPlayerProfile(profileUserId);
      renderShell();
      setPlayerProfileMessage(t("message.games.forceConfirmed"));
      return;
    }
    if (state.view === "gameDetail") {
      state.selectedGameId = gameId;
    }
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
    setPlayerProfileMessage(err.message, true);
  }
}

async function loadAdminTeams() {
  const data = await api("/api/admin/teams");
  state.adminTeams = data.teams || [];
}

function filterAdminTeams(teams, query) {
  const search = String(query || "").trim().toLocaleLowerCase();
  return search ? teams.filter((team) => team.name.toLocaleLowerCase().includes(search)) : teams;
}

function adminTeamsPanel() {
  return `<section class="card panel">
    <div class="panel-header"><div><h2>${t("teams.admin.title")}</h2><p class="muted">${t("teams.admin.hint")}</p></div></div>
    <div class="filter-row"><div class="field compact-field"><label for="admin-teams-search">${t("teams.search.label")}</label><input id="admin-teams-search" type="search" value="${escapeHtml(state.adminTeamsQuery)}" placeholder="${t("teams.search.placeholder")}" data-admin-teams-search></div></div>
    <div data-admin-teams-results>${teamsTable(filterAdminTeams(state.adminTeams, state.adminTeamsQuery), { admin: true })}</div>
    <div class="message" data-message></div>
  </section>`;
}

function wireAdminTeams() {
  wireTeamLinks();
  wirePaginationControls();
  document.querySelector("[data-admin-teams-search]")?.addEventListener("input", (event) => {
    state.adminTeamsQuery = event.target.value;
    state.adminTeamsPage = 1;
    document.querySelector("[data-admin-teams-results]").innerHTML = teamsTable(filterAdminTeams(state.adminTeams, state.adminTeamsQuery), { admin: true });
    wireTeamLinks();
    wirePaginationControls();
  });
}

async function loadAdminUsers() {
  const data = await api("/api/admin/users");
  state.adminUsers = data.users || [];
}

async function loadAdminGames() {
  const data = await api("/api/admin/games");
  state.adminGames = data.games || [];
}

async function loadAdminTournaments() {
  const data = await api("/api/admin/tournaments");
  state.adminTournaments = data.tournaments || [];
}

async function openAdminTournamentList() {
  await loadAdminTournaments();
  state.adminTournamentMode = "list";
  state.selectedTournamentId = null;
  state.adminTournamentDetail = null;
  state.adminTournamentPreview = null;
  syncAppHash();
  renderTournaments();
}

async function loadTournamentAdmin() {
  if (state.selectedTournamentId) {
    await loadAdminTournamentDetail(state.selectedTournamentId, { preservePreview: true });
    return;
  }
  if (state.adminTournamentMode !== "create") await loadAdminTournaments();
}

async function loadAdminTournamentDetail(id, options = {}) {
  const { preservePreview = false } = options;
  state.selectedTournamentId = Number(id);
  state.adminTournamentDetail = await api(`/api/admin/tournaments/${state.selectedTournamentId}`);
  if (
    !preservePreview ||
    !["draft", "registration_open", "registration_closed"].includes(state.adminTournamentDetail?.tournament?.status)
  ) {
    state.adminTournamentPreview = null;
  }
}

async function loadAdminTournamentPreview(id) {
  const data = await api(`/api/admin/tournaments/${id}/preview`);
  state.adminTournamentPreview = data.preview || null;
}

function adminTournamentAdminView() {
  if (state.adminTournamentDetail) return adminTournamentDetailPanel(state.adminTournamentDetail);
  if (state.adminTournamentMode === "create") return adminTournamentCreatePanel();
  return adminTournamentsPanel();
}

function adminTournamentsPanel() {
  const tournaments = state.adminTournaments || [];
  return `
    <section class="card panel admin-tournaments-panel">
      <div class="panel-header">
        <div>
          <h2>${t("tournaments.tab.adminList")}</h2>
          <p class="muted">${t("admin.tournament.list.hint")}</p>
        </div>
        <button class="primary-button" data-admin-tournament-new>${t("admin.tournament.list.create")}</button>
      </div>
      <div class="list admin-tournament-list">
        ${tournaments.length ? tournaments.map(adminTournamentRow).join("") : `<div class="empty">${t("admin.tournament.list.empty")}</div>`}
      </div>
      <div class="message" data-message></div>
    </section>
  `;
}

function adminTournamentCreatePanel() {
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("admin.tournament.create.title")}</h2>
          <p class="muted">${t("admin.tournament.create.hint")}</p>
        </div>
        <button class="ghost-button" data-admin-tournament-create-cancel>${t("games.result.back")}</button>
      </div>
      <form class="admin-tournament-form" data-admin-tournament-create>
        ${tournamentLogoField()}
        <div class="grid-2">
          <div class="field">
            <label>${t("admin.tournament.field.name")}</label>
            <input name="name" maxlength="120" required placeholder="${t("admin.tournament.field.namePlaceholder")}">
          </div>
          <div class="field">
            <label>${t("admin.tournament.field.slug")}</label>
            <input name="slug" maxlength="120" placeholder="${t("admin.tournament.optionalPlaceholder")}">
          </div>
          <div class="field">
            <label>${t("admin.tournament.field.participantMode")}</label>
            <select name="participantMode" data-admin-tournament-participant-mode>
              <option value="individual">${t("tournaments.participantMode.individual")}</option>
              <option value="team">${t("tournaments.participantMode.team")}</option>
            </select>
          </div>
          <div class="field" data-individual-mode-field>
            <label>${t("admin.tournament.field.format")}</label>
            <select name="format" data-admin-tournament-format>
              <option value="single_elimination">${t("tournaments.format.singleElimination")}</option>
              <option value="swiss">${t("tournaments.format.swiss")}</option>
            </select>
          </div>
          <div class="field" data-format-field="single_elimination">
            <label>${t("admin.tournament.field.bracketSize")}</label>
            <select name="singleEliminationSize">
              ${singleEliminationSizes.map((size) => `<option value="${size}">${plural("admin.tournament.playerCount", size)}</option>`).join("")}
            </select>
          </div>
          <div class="field" data-format-field="swiss">
            <label>${t("admin.tournament.field.swissRounds")}</label>
            <input name="swissRoundCount" type="number" min="1" value="3">
          </div>
          <div class="field" data-team-mode-field hidden>
            <label>${t("admin.tournament.field.teamSize")}</label>
            <input value="${t("tournaments.teamVariant.teamsOfThree")}" readonly>
          </div>
          <div class="field" data-team-mode-field hidden>
            <label>${t("admin.tournament.field.pairingType")}</label>
            <select name="pairingType"><option value="shield_sword">${t("tournaments.pairingType.shieldSword")}</option></select>
          </div>
          <div class="field">
            <label>${t("admin.tournament.field.startsAt")}</label>
            <input name="startsAt" type="datetime-local">
          </div>
          <div class="field">
            <label>${t("admin.tournament.field.ratingPolicy")}</label>
            <select name="ratingPolicy">
              <option value="ranked">${t("tournaments.card.ranked")}</option>
              <option value="unranked">${t("tournaments.card.unranked")}</option>
            </select>
          </div>
          <div class="field">
            <label>${t("nav.challenge")}</label>
            <select name="challengeCreditPolicy">
              <option value="count">${t("admin.tournament.field.enabled")}</option>
              <option value="none">${t("admin.tournament.field.disabled")}</option>
            </select>
          </div>
          <div class="field">
            <label>${t("admin.tournament.field.gameSystem")}</label>
            <select name="gameSystem">
              ${gameSystemOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>${t("tournaments.field.season")}</label>
            <select name="seasonId">
              ${seasons.map((season) => `<option value="${escapeHtml(season.id)}" ${season.id === newTournamentDefaultSeason().id ? "selected" : ""}>${escapeHtml(season.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>${t("tournaments.field.venue")}</label>
            <select name="venueMode">
              ${venueModeOptions.map((option) => `<option value="${escapeHtml(option.key)}">${escapeHtml(t(option.labelKey))}</option>`).join("")}
            </select>
          </div>
        </div>
        ${markdownEditorField({
          name: "tournamentRules",
          label: t("admin.tournament.field.rules"),
          placeholder: t("admin.tournament.field.rulesPlaceholder")
        })}
        <div class="field tournament-rules-upload">
          <label>${t("admin.tournament.field.rulesLink")}</label>
          <input name="rulesLink" maxlength="2048" placeholder="${t("admin.tournament.field.rulesLinkPlaceholder")}">
          <div class="rules-file-row">
            <input type="file" accept="application/pdf,.pdf" data-tournament-rules-file>
            <input type="hidden" name="rulesFileData">
            <span class="field-help" data-tournament-rules-file-status>${t("admin.tournament.field.noPdfSelected")}</span>
          </div>
        </div>
        <div class="tournament-tiebreakers" data-individual-mode-field>
          ${tournamentTiebreakerHeading()}
          ${tournamentTiebreakerSelects([])}
        </div>
        <button class="primary-button" type="submit">${t("admin.tournament.list.create")}</button>
        <div class="message" data-message></div>
      </form>
    </section>
  `;
}

function adminTournamentRow(tournament) {
  return `
    <div class="row-card tournament-card">
      <div class="row-main tournament-card-heading">
        ${tournament.logoData ? tournamentLogoMarkup(tournament) : ""}
        <div>
        <button class="text-button row-title" data-admin-tournament-open="${tournament.id}">${escapeHtml(tournament.name || t("tournaments.list.untitled"))}</button>
        <div class="row-meta">${escapeHtml(tournamentFormatLabel(tournament))} / ${escapeHtml(tournament.slug)} / ${tournament.startsAt ? fmtDate(tournament.startsAt) : t("tournaments.date.none")}</div>
        </div>
      </div>
      <div class="tournament-card-actions">
        <span class="status ${tournamentStatusClass(tournament.status)}">${escapeHtml(tournamentStatusLabel(tournament.status))}</span>
        <div class="tournament-card-buttons">
          <button class="small-button" type="button" data-admin-tournament-open="${tournament.id}">${t("admin.action.open")}</button>
        </div>
      </div>
    </div>
  `;
}

function adminTournamentDetailPanel(data) {
  const tournament = data.tournament || {};
  const publicUrl = tournamentPublicUrl(tournament);
  return `
    <section class="card panel admin-tournament-detail">
      <div class="panel-header admin-tournament-header">
        <div class="tournament-heading">
          ${tournament.logoData ? tournamentLogoMarkup(tournament) : ""}
          <div>
          <p class="profile-label">${escapeHtml(tournamentFormatSummary(tournament))}</p>
          <h2>${escapeHtml(tournament.name || t("tournaments.list.untitled"))}</h2>
          <p class="muted">${escapeHtml(tournamentStatusLabel(tournament.status))}${tournament.startsAt ? ` / ${fmtDate(tournament.startsAt)}` : ""}</p>
          </div>
        </div>
        <div class="row-actions admin-tournament-header-actions">
          <button class="small-button" data-admin-tournament-public="${tournament.slug}">${t("admin.tournament.detail.viewPublic")}</button>
          <button class="small-button" data-admin-tournament-copy="${escapeHtml(publicUrl)}">${t("admin.tournament.detail.copyLink")}</button>
          <button class="danger-button" data-admin-tournament-action="delete">${t("admin.tournament.detail.delete")}</button>
          <button class="ghost-button" data-admin-tournament-close>${t("admin.tournament.detail.backToList")}</button>
        </div>
      </div>
      <section class="profile-grid tournament-metrics">
        ${metricCard(t("tournaments.field.date"), tournamentDateLabel(tournament))}
        ${metricCard(t(tournament.participantMode === "team" ? "teams.tournament.rosters" : "tournaments.field.participants"), String(tournament.participantMode === "team" ? (data.rosters || []).filter((roster) => roster.status !== "withdrawn").length : listedTournamentParticipants(data.participants || []).length))}
        ${metricCard(t("tournaments.field.rounds"), tournamentRoundsLabel(tournament, data))}
        ${metricCard(t("tournaments.field.venue"), venueModeLabel(tournament.venueMode))}
        ${metricCard(t("tournaments.field.season"), seasonLabel(tournament.seasonId))}
      </section>
      <div class="admin-tournament-actions">
        ${adminTournamentActionButtons(data)}
      </div>
      ${tournamentInfoPanel(data, { admin: true })}
      <div class="message" data-message></div>
    </section>
  `;
}

function adminTournamentActionButtons(data) {
  const tournament = data.tournament || {};
  const buttons = [];
  if (tournament.status === "draft") {
    buttons.push(`<button class="primary-button" data-admin-tournament-action="publish-open">${t("admin.tournament.action.publishOpen")}</button>`);
    buttons.push(`<button class="small-button" data-admin-tournament-action="publish-closed">${t("admin.tournament.action.publishClosed")}</button>`);
  }
  if (tournament.status === "registration_open") {
    buttons.push(`<button class="small-button" data-admin-tournament-action="close-registration">${t("admin.tournament.action.closeRegistration")}</button>`);
  }
  if (tournament.status === "registration_closed") {
    buttons.push(`<button class="small-button" data-admin-tournament-action="reopen-registration">${t("admin.tournament.action.reopenRegistration")}</button>`);
    buttons.push(`<button class="primary-button" data-admin-tournament-action="start">${t("admin.tournament.action.start")}</button>`);
  }
  if (["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
    buttons.push(`<button class="small-button" data-admin-tournament-action="preview">${t("admin.tournament.action.preview")}</button>`);
  }
  if (tournament.status === "in_progress") {
    const rollbackState = rollbackRoundActionState(data);
    if (rollbackState.canRollback) {
      buttons.push(`<button class="danger-button" data-admin-tournament-action="rollback-latest-round">${t("admin.tournament.action.rollbackLatestRound")}</button>`);
    }
    if (tournamentFinalStandingsReady(data)) {
      buttons.push(`<button class="primary-button" data-admin-tournament-action="close-tournament">${t("admin.tournament.action.closeTournament")}</button>`);
    } else {
      const nextRoundState = nextRoundActionState(data);
      if (nextRoundState.canGenerate) {
        const label = (data.rounds || []).length ? t("admin.tournament.action.generateNext") : t("admin.tournament.action.generateFirst");
        buttons.push(`<button class="primary-button" data-admin-tournament-action="generate-next-round">${label}</button>`);
      } else {
        buttons.push(`<span class="muted">${escapeHtml(nextRoundState.message)}</span>`);
      }
    }
  }
  return buttons.length ? buttons.join("") : `<span class="muted">${t("admin.tournament.action.locked")}</span>`;
}

function adminTournamentEditForm(tournament) {
  const setupLocked = tournament.status === "in_progress";
  const readOnly = ["completed", "cancelled"].includes(tournament.status);
  const lockAttrs = setupLocked || readOnly ? "disabled" : "";
  const textLockAttrs = readOnly ? "disabled" : "";
  const existingRulesLinkType = tournament.rulesLinkType || "";
  const rulesLinkValue = existingRulesLinkType === "url" ? tournament.rulesLink : "";
  return `
    <form class="admin-tournament-form compact-admin-form tournament-settings-form" data-admin-tournament-update data-existing-rules-link-type="${existingRulesLinkType}">
      ${tournamentLogoField(tournament, textLockAttrs)}
      <div class="grid-2">
        <div class="field">
          <label>${t("admin.tournament.field.name")}</label>
          <input name="name" maxlength="120" value="${escapeHtml(tournament.name || "")}" ${lockAttrs}>
        </div>
        <div class="field">
          <label>${t("admin.tournament.field.startsAt")}</label>
          <input name="startsAt" type="datetime-local" value="${escapeHtml(datetimeLocalValue(tournament.startsAt))}" ${textLockAttrs}>
        </div>
        <div class="field">
          <label>${t("admin.tournament.field.participantMode")}</label>
          <select name="participantMode" data-admin-tournament-participant-mode ${lockAttrs}>
            <option value="individual" ${tournament.participantMode !== "team" ? "selected" : ""}>${t("tournaments.participantMode.individual")}</option>
            <option value="team" ${tournament.participantMode === "team" ? "selected" : ""}>${t("tournaments.participantMode.team")}</option>
          </select>
        </div>
        <div class="field" data-individual-mode-field>
          <label>${t("admin.tournament.field.format")}</label>
          <select name="format" data-admin-tournament-format ${lockAttrs}>
            <option value="single_elimination" ${tournament.format === "single_elimination" ? "selected" : ""}>${t("tournaments.format.singleElimination")}</option>
            <option value="swiss" ${tournament.format === "swiss" ? "selected" : ""}>${t("tournaments.format.swiss")}</option>
          </select>
        </div>
        <div class="field" data-format-field="single_elimination">
          <label>${t("admin.tournament.field.bracketSize")}</label>
          <select name="singleEliminationSize" ${lockAttrs}>
            ${singleEliminationSizes.map((size) => `<option value="${size}" ${Number(tournament.singleEliminationSize || 8) === size ? "selected" : ""}>${plural("admin.tournament.playerCount", size)}</option>`).join("")}
          </select>
        </div>
        <div class="field" data-format-field="swiss">
          <label>${t("admin.tournament.field.swissRounds")}</label>
          <input name="swissRoundCount" type="number" min="1" value="${tournament.swissRoundCount || 3}" ${lockAttrs}>
        </div>
        <div class="field" data-team-mode-field ${tournament.participantMode === "team" ? "" : "hidden"}>
          <label>${t("admin.tournament.field.teamSize")}</label>
          <input value="${t("tournaments.teamVariant.teamsOfThree")}" readonly ${lockAttrs}>
        </div>
        <div class="field" data-team-mode-field ${tournament.participantMode === "team" ? "" : "hidden"}>
          <label>${t("admin.tournament.field.pairingType")}</label>
          <select name="pairingType" ${lockAttrs}><option value="shield_sword">${t("tournaments.pairingType.shieldSword")}</option></select>
        </div>
        <div class="field">
          <label>${t("admin.tournament.field.ratingPolicy")}</label>
          <select name="ratingPolicy" ${lockAttrs}>
            <option value="ranked" ${tournament.ratingPolicy === "ranked" ? "selected" : ""}>${t("tournaments.card.ranked")}</option>
            <option value="unranked" ${tournament.ratingPolicy === "unranked" ? "selected" : ""}>${t("tournaments.card.unranked")}</option>
          </select>
        </div>
        <div class="field">
          <label>${t("nav.challenge")}</label>
          <select name="challengeCreditPolicy" ${lockAttrs}>
            <option value="count" ${tournament.challengeCreditPolicy === "count" ? "selected" : ""}>${t("admin.tournament.field.enabled")}</option>
            <option value="none" ${tournament.challengeCreditPolicy === "none" ? "selected" : ""}>${t("admin.tournament.field.disabled")}</option>
          </select>
        </div>
        <div class="field">
          <label>${t("admin.tournament.field.gameSystem")}</label>
          <select name="gameSystem" ${lockAttrs}>
            ${gameSystemOptions.map((option) => `<option value="${escapeHtml(option)}" ${(tournament.gameSystem || gameSystemOptions[0]) === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>${t("tournaments.field.season")}</label>
          <select name="seasonId" ${lockAttrs}>
            ${seasons.map((season) => `<option value="${escapeHtml(season.id)}" ${(tournament.seasonId || newTournamentDefaultSeason().id) === season.id ? "selected" : ""}>${escapeHtml(season.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>${t("tournaments.field.venue")}</label>
          <select name="venueMode" ${lockAttrs}>
            ${venueModeOptions.map((option) => `<option value="${escapeHtml(option.key)}" ${(tournament.venueMode || "tts") === option.key ? "selected" : ""}>${escapeHtml(t(option.labelKey))}</option>`).join("")}
          </select>
        </div>
      </div>
      ${markdownEditorField({
        name: "tournamentRules",
        label: t("admin.tournament.field.rules"),
        placeholder: t("admin.tournament.field.rulesPlaceholder"),
        value: tournamentRulesValue(tournament),
        disabledAttrs: textLockAttrs
      })}
      <div class="field tournament-rules-upload">
        <label>${t("admin.tournament.field.rulesLink")}</label>
        <input name="rulesLink" maxlength="2048" value="${escapeHtml(rulesLinkValue)}" placeholder="${t("admin.tournament.field.rulesLinkPlaceholder")}" ${textLockAttrs}>
        <div class="rules-file-row">
          <input type="file" accept="application/pdf,.pdf" data-tournament-rules-file ${textLockAttrs}>
          <input type="hidden" name="rulesFileData">
          <span class="field-help" data-tournament-rules-file-status>${existingRulesLinkType === "pdf" ? t("admin.tournament.field.existingPdf") : t("admin.tournament.field.noPdfSelected")}</span>
        </div>
        ${tournament.rulesLink ? tournamentRulesLinkMarkup(tournament) : ""}
      </div>
      <div class="tournament-tiebreakers" data-individual-mode-field>
        ${tournamentTiebreakerHeading()}
        ${tournamentTiebreakerSelects(tournament.tiebreakerOrder || [], lockAttrs)}
      </div>
      <div class="admin-save-row">
        <button class="primary-button admin-save-button" type="submit" data-admin-tournament-save-button ${readOnly ? "disabled" : ""}>${t("admin.tournament.edit.save")}</button>
        <span class="autosave-status" data-admin-tournament-autosave-status aria-live="polite"></span>
      </div>
    </form>
  `;
}

function adminTournamentParticipantsPanel(data) {
  return `
    <section class="admin-subpanel">
      ${adminTournamentParticipantsContent(data)}
    </section>
  `;
}

function adminTournamentTablesContent(data) {
  const tournament = data.tournament || {};
  const tables = data.tables || [];
  const readOnly = ["completed", "cancelled"].includes(tournament.status) || tournament.teamTablesLocked;
  if (tournament.venueMode !== "irl" && tournament.participantMode !== "team") return `<div class="empty">${t("admin.tournament.tables.irlOnly", { venue: t("venue.irl") })}</div>`;
  return `
    <div class="tournament-table-admin">
      <form class="admin-table-form" data-admin-tournament-table-add>
        <div class="grid-3">
          <div class="field">
            <label>${t("admin.tournament.tables.field.number")}</label>
            <input name="tableNumber" type="number" min="1" placeholder="${t("admin.tournament.tables.field.numberPlaceholder")}" ${readOnly ? "disabled" : ""}>
          </div>
          <div class="field">
            <label>${t("games.result.killzoneLabel")}</label>
            <select name="killzone" ${readOnly ? "disabled" : ""}>
              <option value="">${t("games.result.notSelected")}</option>
              ${optionsHtml(killzoneOptions, "")}
            </select>
          </div>
          <div class="field">
            <label>${t("admin.tournament.tables.field.deployment")}</label>
            <select name="deployment" ${readOnly ? "disabled" : ""}>
              <option value="">${t("games.result.notSelected")}</option>
              ${[1, 2, 3, 4, 5, 6].map((item) => `<option value="${item}">${item}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="small-button" type="submit" ${readOnly || (tournament.participantMode === "team" && tables.length >= 3) ? "disabled" : ""}>${t("admin.tournament.tables.add")}</button>
      </form>
      <div class="list">
        ${tables.length ? tables.map((table) => adminTournamentTableRow(table, readOnly)).join("") : `<div class="empty">${t("admin.tournament.tables.empty")}</div>`}
      </div>
    </div>
  `;
}

function adminTournamentTableRow(table, readOnly) {
  return `
    <div class="row-card compact-row-card tournament-table-row">
      <div class="row-main">
        <div class="row-title">${t("tournaments.match.table", { number: table.tableNumber })}</div>
        <div class="row-meta">${escapeHtml(table.killzone || t("admin.tournament.tables.noKillzone"))} / ${t("tournaments.mission.deployment", { layout: table.deployment || "-" })}</div>
        <div class="table-admin-controls">
          <div class="field">
            <label>${t("games.result.killzoneLabel")}</label>
            <select name="table-killzone-${table.id}" ${readOnly ? "disabled" : ""}>
              <option value="">${t("games.result.notSelected")}</option>
              ${optionsHtml(killzoneOptions, table.killzone || "")}
            </select>
          </div>
          <div class="field">
            <label>${t("admin.tournament.tables.field.deployment")}</label>
            <select name="table-deployment-${table.id}" ${readOnly ? "disabled" : ""}>
              <option value="">${t("games.result.notSelected")}</option>
              ${[1, 2, 3, 4, 5, 6].map((item) => `<option value="${item}" ${Number(table.deployment) === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="row-actions">
        <button class="small-button" data-admin-table-save="${table.id}" ${readOnly ? "disabled" : ""}>${t("common.save")}</button>
        <button class="danger-button" data-admin-table-delete="${table.id}" ${readOnly ? "disabled" : ""}>${t("common.delete")}</button>
      </div>
    </div>
  `;
}

function adminTournamentParticipantsContent(data) {
  const tournament = data.tournament || {};
  if (tournament.participantMode === "team") return adminTeamRostersContent(data);
  const participants = data.participants || [];
  const visibleParticipants = listedTournamentParticipants(participants);
  const canRemove = !["completed", "cancelled"].includes(tournament.status);
  const canBulkAdd = !["in_progress", "completed", "cancelled"].includes(tournament.status);
  const readOnly = ["completed", "cancelled"].includes(tournament.status);
  const seedLocked = ["in_progress", "completed", "cancelled"].includes(tournament.status);
  const hasCompetitiveParticipants = participants.some((participant) =>
    ["joined", "active"].includes(participant.status)
  );
  const availableUsers = availableTournamentUsers(participants);
  return `
    <div class="tournament-participant-admin">
      <div class="participant-admin-note muted">
        ${tournament.format === "swiss" && tournament.status === "in_progress" ? t("admin.tournament.participants.lateAddsNote") : t("admin.tournament.participants.hint")}
      </div>
      <form class="admin-participant-form" data-admin-tournament-add-participant>
        <div class="grid-2">
          ${comboField(t("admin.tournament.participants.tgtvUserLabel"), "userId", "users", "", t("admin.tournament.participants.unregisteredPlaceholder"), {
            optional: true,
            valueMode: "value",
            items: userComboItems(availableUsers)
          })}
          <div class="field">
            <label>${t("admin.tournament.participants.displayNameLabel")}</label>
            <input name="displayName" maxlength="80" placeholder="${t("admin.tournament.participants.displayNamePlaceholder")}">
          </div>
        </div>
        ${comboField(t("tournaments.field.faction"), "faction", "faction", "", t("admin.tournament.optionalPlaceholder"), { optional: true })}
        <button class="small-button" type="submit">${t("admin.tournament.participants.add")}</button>
      </form>
      ${canBulkAdd ? `
        <form class="admin-participant-form" data-admin-tournament-bulk>
          <div class="field">
            <label>${t("admin.tournament.participants.bulkLabel")}</label>
            <textarea name="names" placeholder="${t("admin.tournament.participants.bulkPlaceholder")}"></textarea>
          </div>
          <button class="small-button" type="submit">${t("admin.tournament.participants.bulkAdd")}</button>
        </form>
      ` : ""}
      <div class="list">
        ${visibleParticipants.length ? visibleParticipants.map((participant) => adminTournamentParticipantAdminRow(participant, data, {
          canRemove,
          readOnly,
          seedLocked
        })).join("") : `<div class="empty">${t("tournaments.participants.empty")}</div>`}
      </div>
      <div class="row-actions">
        <button class="small-button" data-admin-tournament-regenerate-seeds ${seedLocked || !hasCompetitiveParticipants ? "disabled" : ""}>${t("admin.tournament.participants.regenerateSeeds")}</button>
        <button class="small-button" data-admin-tournament-save-seeds ${seedLocked ? "disabled" : ""}>${t("admin.tournament.participants.saveSeeds")}</button>
      </div>
    </div>
  `;
}

function adminTournamentParticipantAdminRow(participant, data, options = {}) {
  const tournament = data.tournament || {};
  const participants = data.participants || [];
  const inactive = ["withdrawn", "removed"].includes(participant.status);
  const locked = options.readOnly || inactive;
  const canRemove = options.canRemove && canRemoveTournamentParticipant(data, participant);
  const replacementUsers = availableTournamentUsers(participants, participant.id)
    .filter((user) => user.id !== participant.userId);
  const replaceLabel = participant.userId ? t("admin.tournament.participants.replace") : t("admin.tournament.participants.linkUser");
  const replacePlaceholder = participant.userId ? t("admin.tournament.participants.replacePlaceholder") : t("admin.tournament.participants.linkPlaceholder");
  const replaceLockedAfterStart = tournament.status === "in_progress" && participant.userId;
  const replaceDisabled = locked || replaceLockedAfterStart || !replacementUsers.length;
  return `
    <div class="row-card compact-row-card participant-admin-row">
      <div class="row-main">
        <div class="row-title">${tournamentParticipantProfileLink(participant)}</div>
        <div class="row-meta">${t("admin.tournament.participants.seedLabel", { seed: participant.seed || "-" })} / ${escapeHtml(participantUserLabel(participant))} / ${escapeHtml(participant.factionHidden ? t("tournaments.participant.factionHidden") : participant.faction || t("tournaments.participant.factionMissing"))}</div>
        <div class="participant-admin-controls">
          <div class="participant-faction-control">
            ${comboField(t("games.filter.teamLabel"), `participant-faction-${participant.id}`, "faction", participant.faction || "", t("admin.tournament.optionalPlaceholder"), { optional: true })}
            <button class="small-button" data-admin-participant-save-faction="${participant.id}" ${locked ? "disabled" : ""}>${t("admin.tournament.participants.saveFaction")}</button>
          </div>
          <div class="participant-replace-control">
            <div class="participant-replace-row">
              ${comboField(t("admin.tournament.participants.registeredUserLabel"), `replacement-user-${participant.id}`, "users", "", replacePlaceholder, {
                optional: true,
                valueMode: "value",
                items: userComboItems(replacementUsers),
                disabled: replaceDisabled,
                valueAttributes: `data-admin-participant-replace-user="${participant.id}"`
              })}
              <button class="small-button" data-admin-participant-replace="${participant.id}" ${replaceDisabled ? "disabled" : ""}>${replaceLabel}</button>
            </div>
          </div>
        </div>
      </div>
      <div class="row-actions">
        <input class="seed-input" type="number" min="1" value="${participant.seed || 1}" data-participant-seed="${participant.id}" ${options.seedLocked || !["joined", "active"].includes(participant.status) ? "disabled" : ""}>
        <span class="status ${participant.status === "active" || participant.status === "joined" ? "completed" : participant.status === "pending_placement" ? "pending" : ""}">${escapeHtml(tournamentParticipantStatusLabel(participant.status))}</span>
        ${canRemove ? `<button class="danger-button" data-admin-participant-remove="${participant.id}">${t("admin.tournament.participants.remove")}</button>` : ""}
      </div>
    </div>
  `;
}

function adminTournamentStandingsPanel(data) {
  return `
    <section class="admin-subpanel">
      <div class="panel-header">
        <div>
          <h3>${t("tournaments.tab.standings")}</h3>
          <p class="muted">${standingsSubtitle(data.tournament || {})}</p>
        </div>
      </div>
      ${publicStandingsTable(data)}
    </section>
  `;
}

function adminTournamentPreviewPanel(data) {
  const preview = state.adminTournamentPreview;
  if (!preview) return "";
  if (data.tournament?.participantMode === "team") return adminTeamTournamentPreviewPanel(data, preview);
  const names = participantNameLookup(data.participants || []);
  return `
    <section class="admin-subpanel wide-panel">
      <div class="panel-header">
        <div>
          <h3>${t("admin.tournament.preview.title")}</h3>
          <p class="muted">${t("admin.tournament.preview.hint", { format: formatLabel(preview.format) })}</p>
        </div>
      </div>
      ${previewRoundsMarkup(preview.rounds || [], names)}
    </section>
  `;
}

function adminTournamentRoundsPanel(data) {
  const rounds = data.rounds || [];
  if (!rounds.length) {
    return `<section class="admin-subpanel wide-panel"><div class="empty">${t("tournaments.matches.empty")}</div></section>`;
  }
  return `
    <section class="admin-subpanel wide-panel">
      <div class="panel-header">
        <div>
          <h3>${t("admin.tournament.rounds.title")}</h3>
          <p class="muted">${t("admin.tournament.rounds.hint")}</p>
        </div>
      </div>
      ${tournamentRoundsTabbedMarkup(rounds, adminTournamentMatchMarkup)}
    </section>
  `;
}

function adminTournamentMatchMarkup(match) {
  const canResult = ["active", "pending_confirmation", "completed"].includes(match.status) && !match.isBye;
  const actionLabel = match.status === "completed" ? t("play.action.editResult") : t("play.action.enterResult");
  const meta = [publicMatchScore(match), matchSetupMeta(match)].filter(Boolean).join(" / ");
  return `
    <div class="row-card compact-row-card">
      <div class="row-main">
        <div class="row-title">${tournamentParticipantProfileLink(match.participantA)} vs ${match.isBye ? t("tournaments.match.byeUpper") : tournamentParticipantProfileLink(match.participantB)}</div>
        <div class="row-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${match.status === "active" || match.status === "pending_confirmation" ? "pending" : match.status === "completed" ? "completed" : ""}">${escapeHtml(tournamentMatchStatusLabel(match.status))}</span>
        ${canResult ? `<button class="small-button" data-admin-tournament-match-result="${match.id}">${actionLabel}</button>` : ""}
      </div>
    </div>
  `;
}

function adminActiveGamesPanel() {
  const games = state.adminGames || [];
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("games.tabs.sessions")}</h2>
          <p class="muted">${t("admin.games.hint")}</p>
        </div>
      </div>
      <div class="list">
        ${games.length ? games.map((game) => {
          const pending = game.status === "pending_confirmation";
          return `
            <div class="row-card">
              <div class="row-main">
                <div class="row-title">${escapeHtml(gameTitle(game))}</div>
                <div class="row-meta">${escapeHtml(pending ? pendingResultSummary(game) : t("admin.games.acceptedMatch", { date: fmtDate(game.createdAt) }))}</div>
              </div>
              <div class="row-actions">
                <span class="status ${pending ? "pending" : "open"}">${pending ? t("play.game.status.pending") : t("admin.games.status.open")}</span>
                <button class="small-button" data-admin-game-open="${game.id}">${t("admin.action.open")}</button>
                ${pending && game.pendingResult?.result ? `<button class="small-button" data-admin-game-confirm="${game.id}">${t("games.detail.forceConfirm")}</button>` : ""}
                <button class="danger-button" data-admin-game-delete="${game.id}">${t("common.delete")}</button>
              </div>
            </div>
          `;
        }).join("") : `<div class="empty">${t("admin.games.empty")}</div>`}
      </div>
    </section>
  `;
}

function filterAdminUsers(users, query) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase();
  if (!normalizedQuery) return users;
  return users.filter((user) => String(user.name || "").toLocaleLowerCase().includes(normalizedQuery));
}

function adminTeamTournamentPreviewPanel(data, preview) {
  const rosters = new Map((data.rosters || []).map((roster) => [roster.id, roster]));
  return `<section class="admin-subpanel wide-panel"><div class="panel-header"><div><h3>${t("admin.tournament.preview.title")}</h3><p class="muted">${t("teams.tournament.previewHint")}</p></div></div>
    <div class="public-rounds">${(preview.rounds || []).map((round) => `<section class="public-round"><div class="public-round-title"><strong>${t("tournaments.round.title", { number: round.roundNumber })}</strong></div><div class="list">${(round.matches || []).map((match) => `<div class="row-card compact-row-card"><div class="row-main"><div class="row-title">${teamRosterLabel(rosters.get(match.rosterAId))} vs ${teamRosterLabel(rosters.get(match.rosterBId), t("teams.pairing.bye"))}</div><div class="row-meta">${t("tournaments.pairingType.shieldSword")}</div></div></div>`).join("")}</div></section>`).join("")}</div>
  </section>`;
}

function adminTeamRostersContent(data) {
  const tournament = data.tournament || {};
  const started = Boolean(tournament.startedAt) || ["in_progress", "completed"].includes(tournament.status);
  const rosters = data.rosters || [];
  const seedLocked = ["in_progress", "completed", "cancelled"].includes(tournament.status);
  const canAddRoster = !["in_progress", "completed", "cancelled"].includes(tournament.status);
  const active = rosters.filter((roster) => roster.status !== "withdrawn");
  return `<div class="tournament-participant-admin">
    <div class="panel-header">
      <p class="participant-admin-note muted">${t("teams.tournament.adminRosterHint")} ${t(started ? "teams.tournament.removeAfterStartHint" : "teams.tournament.deleteHint")}</p>
      <div class="row-actions"><button class="primary-button" data-admin-team-roster-add ${canAddRoster ? "" : "disabled"}>${t("teams.tournament.add")}</button></div>
    </div>
    <div class="list">${rosters.length ? rosters.map((roster) => `
      <div class="row-card team-roster-admin-row ${roster.status === "withdrawn" ? "is-muted" : ""}">
        <div class="row-main">
          <div class="row-title">${teamRosterLabel(roster)}</div>
          <div class="row-meta">${t("teams.roster.seed", { seed: roster.seed || "-" })} · ${escapeHtml(roster.teamNameSnapshot || "")} · ${escapeHtml(teamRosterStatusLabel(roster.status))}</div>
          <div class="team-roster-members">${activeRosterMembersForUi(roster).map((member) => `<span>${escapeHtml(member.displayNameSnapshot)} · ${escapeHtml(member.factionHidden ? t("tournaments.participant.factionHidden") : member.factionSnapshot)}${member.userId === roster.captainUserId ? ` · ${t("teams.role.captain")}` : ""}</span>`).join("")}</div>
        </div>
        <div class="row-actions">
          ${roster.status !== "withdrawn" ? `<input class="seed-input" type="number" min="1" max="128" value="${roster.seed || 1}" data-team-roster-seed="${roster.id}" ${seedLocked ? "disabled" : ""}>` : ""}
          ${!["withdrawn", "finished"].includes(roster.status) && !["completed", "cancelled"].includes(tournament.status) ? `<button class="small-button" data-admin-team-roster-edit="${roster.id}">${t("teams.tournament.edit")}</button>` : ""}
          ${!seedLocked && roster.status !== "withdrawn" ? `<button class="danger-button" data-admin-team-roster-withdraw="${roster.id}">${t("teams.tournament.withdraw")}</button>` : ""}
          ${!started || roster.status !== "withdrawn" ? `<button class="danger-button" data-admin-team-roster-delete="${roster.id}">${t("teams.tournament.delete")}</button>` : ""}
        </div>
      </div>`).join("") : `<div class="empty">${t("teams.tournament.rostersEmpty")}</div>`}</div>
    <div class="row-actions"><button class="small-button" data-admin-team-roster-save-seeds ${seedLocked || !active.length ? "disabled" : ""}>${t("admin.tournament.participants.saveSeeds")}</button></div>
  </div>`;
}

async function openAdminTeamRosterCreator(data) {
  const response = await api("/api/teams");
  const teams = (response.teams || []).filter((team) => !team.archivedAt && Number(team.memberCount || 0) >= 3);
  if (!teams.length) {
    setMessage(t("teams.tournament.adminNoEligibleTeam"), true);
    return;
  }

  const dialog = document.createElement("dialog");
  dialog.className = "tiebreaker-help-dialog team-roster-editor-dialog";
  dialog.innerHTML = `<form class="tiebreaker-help-content" data-admin-team-roster-creator>
    <div class="tiebreaker-help-header"><div><h3>${t("teams.tournament.addTitle")}</h3></div><button class="dialog-close-button" type="button" data-team-roster-creator-close aria-label="${t("common.close")}">&times;</button></div>
    <div class="grid-2">
      <div class="field"><label>${t("teams.tournament.team")}</label><select name="teamId" required>${teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join("")}</select></div>
      <div class="field"><label>${t("teams.tournament.rosterName")}</label><input name="name" minlength="2" maxlength="80" data-default-name="${escapeHtml(suggestedRosterName(teams[0], data.rosters))}" value="${escapeHtml(suggestedRosterName(teams[0], data.rosters))}"></div>
    </div>
    <div data-admin-team-roster-creator-members><div class="empty">${t("teams.loading")}</div></div>
    <div class="message" data-admin-team-roster-creator-message></div>
    <div class="row-actions"><button class="small-button" type="button" data-team-roster-creator-cancel>${t("common.cancel")}</button><button class="primary-button" type="submit" data-team-roster-creator-submit disabled>${t("teams.tournament.add")}</button></div>
  </form>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.querySelector("[data-team-roster-creator-close]")?.addEventListener("click", close);
  dialog.querySelector("[data-team-roster-creator-cancel]")?.addEventListener("click", close);
  const form = dialog.querySelector("[data-admin-team-roster-creator]");
  const fields = form.querySelector("[data-admin-team-roster-creator-members]");
  const submit = form.querySelector("[data-team-roster-creator-submit]");
  const message = form.querySelector("[data-admin-team-roster-creator-message]");
  let loadedTeamId = null;
  let loadVersion = 0;
  const showError = (value = "") => {
    message.textContent = value;
    message.classList.toggle("error", Boolean(value));
  };
  const loadSelectedTeam = async () => {
    const version = ++loadVersion;
    const team = teams.find((item) => item.id === Number(form.elements.teamId.value));
    loadedTeamId = null;
    submit.disabled = true;
    showError();
    fields.innerHTML = `<div class="empty">${t("teams.loading")}</div>`;
    updateRosterNameDefault(form, team, data.rosters);
    try {
      const profile = await api(`/api/teams/${encodeURIComponent(team.slug)}`);
      if (version !== loadVersion) return;
      const selectedTeam = { ...profile.team, members: profile.currentMembers || [] };
      if (selectedTeam.members.length < 3) throw new Error(t("teams.tournament.adminNoEligibleTeam"));
      fields.innerHTML = teamRosterMemberFields(selectedTeam);
      wireTeamRosterMemberSelection(form);
      loadedTeamId = selectedTeam.id;
      submit.disabled = false;
    } catch (err) {
      if (version !== loadVersion) return;
      fields.innerHTML = "";
      showError(err.message);
    }
  };
  form.elements.teamId.addEventListener("change", loadSelectedTeam);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const teamId = Number(form.elements.teamId.value);
    if (!loadedTeamId || loadedTeamId !== teamId) return;
    const selected = [1, 2, 3].map((slot) => ({
      userId: Number(form.elements[`member-${slot}`].value),
      faction: form.elements[`faction-${slot}`].value
    }));
    if (new Set(selected.map((member) => member.userId)).size !== 3) {
      showError(t("teams.tournament.uniquePlayersRequired"));
      return;
    }
    submit.disabled = true;
    showError();
    try {
      await api(`/api/admin/tournaments/${data.tournament.id}/rosters`, { method: "POST", body: {
        teamId,
        name: rosterNameFromForm(form),
        captainUserId: Number(form.elements.captainUserId.value),
        members: selected
      } });
      close();
      await refreshTeamTournamentUi(data, { admin: true });
    } catch (err) {
      showError(err.message);
      submit.disabled = false;
    }
  });
  dialog.showModal();
  await loadSelectedTeam();
}

function openAdminTeamRosterEditor(data, roster) {
  const members = roster.availableMembers || [];
  if (members.length < 3) {
    setMessage(t("teams.tournament.noEligibleTeam"), true);
    return;
  }
  const dialog = document.createElement("dialog");
  dialog.className = "tiebreaker-help-dialog team-roster-editor-dialog";
  dialog.innerHTML = `<form class="tiebreaker-help-content" data-admin-team-roster-editor>
    <div class="tiebreaker-help-header"><div><h3>${t("teams.tournament.editTitle")}</h3><p>${escapeHtml(roster.teamNameSnapshot || "")}</p></div><button class="dialog-close-button" type="button" data-team-roster-editor-close aria-label="${t("common.close")}">&times;</button></div>
    <div class="field"><label>${t("teams.tournament.rosterName")}</label><input name="name" minlength="2" maxlength="80" value="${escapeHtml(roster.name || "")}" required></div>
    ${teamRosterMemberFields({ members }, roster)}
    <div class="row-actions"><button class="small-button" type="button" data-team-roster-editor-cancel>${t("common.cancel")}</button><button class="primary-button" type="submit">${t("common.save")}</button></div>
  </form>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.querySelector("[data-team-roster-editor-close]")?.addEventListener("click", close);
  dialog.querySelector("[data-team-roster-editor-cancel]")?.addEventListener("click", close);
  const form = dialog.querySelector("[data-admin-team-roster-editor]");
  wireTeamRosterMemberSelection(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = [1, 2, 3].map((slot) => ({
      userId: Number(form.elements[`member-${slot}`].value),
      faction: form.elements[`faction-${slot}`].value
    }));
    if (new Set(selected.map((member) => member.userId)).size !== 3) {
      setMessage(t("teams.tournament.uniquePlayersRequired"), true);
      return;
    }
    try {
      await api(`/api/tournaments/${data.tournament.id}/rosters/${roster.id}`, { method: "PATCH", body: {
        name: form.elements.name.value,
        captainUserId: Number(form.elements.captainUserId.value),
        members: selected
      } });
      close();
      await refreshTeamTournamentUi(data, { admin: true });
    } catch (err) { setMessage(err.message, true); }
  });
  dialog.showModal();
}

function adminUsersPanel() {
  const filteredUsers = filterAdminUsers(state.adminUsers, state.adminUsersQuery);
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("leaderboard.tab.users")}</h2>
          <p class="muted">${t("leaderboard.users.hint")}</p>
        </div>
      </div>
      <div class="filter-row">
        <div class="field compact-field">
          <label for="admin-users-search">${t("leaderboard.users.searchLabel")}</label>
          <input id="admin-users-search" type="search" value="${escapeHtml(state.adminUsersQuery)}" placeholder="${t("leaderboard.users.searchPlaceholder")}" autocomplete="off" data-admin-users-search>
          <span class="field-help">${t("leaderboard.users.searchHint")}</span>
        </div>
      </div>
      <div data-admin-users-results>
        ${adminUsersResultsMarkup(filteredUsers)}
      </div>
      <div class="message" data-message></div>
    </section>
  `;
}

function adminTeamPairingOverrideForm(match) {
  if (match.phase !== "environment_selection" || (match.games || []).length || !(match.pairings || []).length) return "";
  const membersA = activeRosterMembersForUi(match.rosterA);
  const membersB = activeRosterMembersForUi(match.rosterB);
  const options = (members, selectedId) => members.map((member) => `<option value="${member.id}" ${member.id === Number(selectedId) ? "selected" : ""}>${escapeHtml(member.displayNameSnapshot)}</option>`).join("");
  return `<form class="team-pairing-override" data-team-pairings-override="${match.id}">
    <strong>${t("teams.pairing.override")}</strong>
    ${(match.pairings || []).map((pairing, index) => `<div class="team-pairing-override-row"><span>${index + 1}</span><select name="pair-a-${index + 1}" data-user-search data-user-search-label="${t("admin.roundSetup.playerA")}" required>${options(membersA, pairing.rosterAMemberId)}</select><span>vs</span><select name="pair-b-${index + 1}" data-user-search data-user-search-label="${t("admin.roundSetup.playerB")}" required>${options(membersB, pairing.rosterBMemberId)}</select></div>`).join("")}
    <button class="small-button" type="submit">${t("teams.pairing.saveOverride")}</button>
  </form>`;
}

function adminUsersResultsMarkup(users) {
  const pageData = paginate(users, state.adminUsersPage);
  state.adminUsersPage = pageData.currentPage;
  return `
    <div class="table-wrap">
      ${pageData.total ? `<table>
          <thead>
            <tr><th>${t("leaderboard.users.column.name")}</th><th>${t("leaderboard.users.column.contacts")}</th><th>${t("leaderboard.users.column.venueRatings")}</th><th>${t("profile.metric.matches")}</th><th>${t("leaderboard.users.column.admin")}</th><th></th></tr>
          </thead>
          <tbody>
            ${pageData.items.map((user) => `
              <tr>
                <td><button class="text-link-button inline-profile-link" data-profile-user="${user.id}">${escapeHtml(user.name)}</button></td>
                <td>
                  <div class="admin-contact-cell">
                    <span>${t("leaderboard.users.contact.register", { value: escapeHtml(user.registerNickname || "-") })}</span>
                    <span>${t("leaderboard.users.contact.telegram", { value: escapeHtml(user.telegramContact || "-") })}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-controls">
                    <label>${t("venue.combined")} <input class="rating-input" type="number" min="0" max="5000" value="${playerRating(user, "combined")}" data-rating-combined="${user.id}"></label>
                    <label>TTS <input class="rating-input" type="number" min="0" max="5000" value="${playerRating(user, "tts")}" data-rating-tts="${user.id}"></label>
                    <label>${t("venue.irl")} <input class="rating-input" type="number" min="0" max="5000" value="${playerRating(user, "irl")}" data-rating-irl="${user.id}"></label>
                    <button class="small-button" data-save-rating="${user.id}">${t("common.save")}</button>
                  </div>
                </td>
                <td>${user.gamesPlayed}</td>
                <td><input type="checkbox" ${user.isAdmin ? "checked" : ""} ${user.id === state.me.id ? "disabled" : ""} data-admin-toggle="${user.id}"></td>
                <td><button class="danger-button" ${user.id === state.me.id ? "disabled" : ""} data-delete-user="${user.id}">${t("common.delete")}</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>` : `<div class="empty">${t(state.adminUsersQuery ? "leaderboard.users.searchEmpty" : "leaderboard.empty")}</div>`}
    </div>
    ${paginationMarkup("admin-users", pageData, "leaderboard.users.pagination.users")}
  `;
}

function renderAdmin() {
  state.view = "tournaments";
  state.tournamentsTab = "admin";
  renderTournaments();
}

function wireAdminUserControls() {
  document.querySelector("[data-admin-users-search]")?.addEventListener("input", (event) => {
    state.adminUsersQuery = event.currentTarget.value;
    state.adminUsersPage = 1;
    const results = document.querySelector("[data-admin-users-results]");
    if (!results) return;
    results.innerHTML = adminUsersResultsMarkup(filterAdminUsers(state.adminUsers, state.adminUsersQuery));
    wirePaginationControls();
    wireAdminUserRowControls();
  });
  wireAdminUserRowControls();
}

function wireAdminUserRowControls() {
  document.querySelectorAll("[data-save-rating]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveRating;
      const ratingCombined = Number(document.querySelector(`[data-rating-combined="${id}"]`).value);
      const ratingTts = Number(document.querySelector(`[data-rating-tts="${id}"]`).value);
      const ratingIrl = Number(document.querySelector(`[data-rating-irl="${id}"]`).value);
      await adminPatch(id, { ratingCombined, ratingTts, ratingIrl });
    });
  });
  document.querySelectorAll("[data-admin-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      await adminPatch(checkbox.dataset.adminToggle, { isAdmin: checkbox.checked });
    });
  });
  document.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const user = state.adminUsers.find((item) => item.id === Number(button.dataset.deleteUser));
      if (!await confirmDelete(t("dialog.admin.deleteUser", { name: user?.name || "" }))) return;
      try {
        await api(`/api/admin/users/${button.dataset.deleteUser}`, { method: "DELETE" });
        await refresh();
        await loadAdminUsers();
        await loadTop();
        renderShell();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });
  wireLeaderboardProfiles();
}

function wireAdminGameButtons() {
  document.querySelectorAll("[data-admin-game-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openGameDetail(Number(button.dataset.adminGameOpen));
    });
  });
  document.querySelectorAll("[data-admin-game-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminForceConfirmGame(Number(button.dataset.adminGameConfirm));
    });
  });
  document.querySelectorAll("[data-admin-game-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminDeleteGame(Number(button.dataset.adminGameDelete));
    });
  });
}

function wireAdminTournamentFormBehavior() {
  document.querySelectorAll(".admin-tournament-form").forEach((form) => {
    wireTournamentLogo(form);
    const formatSelect = form.querySelector("[data-admin-tournament-format]");
    if (formatSelect && formatSelect.dataset.modeBaseDisabled === undefined) {
      formatSelect.dataset.modeBaseDisabled = formatSelect.disabled ? "1" : "0";
    }
    if (formatSelect) {
      const updateFormatFields = () => updateTournamentParticipantModeFields(form);
      formatSelect.addEventListener("change", updateFormatFields);
    }
    form.querySelector("[data-admin-tournament-participant-mode]")?.addEventListener("change", () => {
      updateTournamentParticipantModeFields(form);
    });
    updateTournamentParticipantModeFields(form);

    const rulesFile = form.querySelector("[data-tournament-rules-file]");
    if (rulesFile) {
      rulesFile.addEventListener("change", () => handleTournamentRulesFile(rulesFile));
    }

    const rulesLink = form.elements.rulesLink;
    if (rulesLink) {
      rulesLink.addEventListener("input", () => {
        if (!rulesLink.value) return;
        if (form.elements.rulesFileData) form.elements.rulesFileData.value = "";
        if (rulesFile) rulesFile.value = "";
        const status = form.querySelector("[data-tournament-rules-file-status]");
        if (status) status.textContent = t("admin.tournament.field.noPdfSelected");
      });
    }

    form.querySelectorAll("[data-tournament-tiebreaker-select]").forEach((select) => {
      select.addEventListener("change", () => updateTournamentTiebreakerSelects(form));
    });
    const tiebreakerHelp = form.querySelector("[data-tournament-tiebreaker-help]");
    form.querySelector("[data-tournament-tiebreaker-help-open]")?.addEventListener("click", () => {
      if (typeof tiebreakerHelp?.showModal === "function") tiebreakerHelp.showModal();
    });
    form.querySelector("[data-tournament-tiebreaker-help-close]")?.addEventListener("click", () => {
      tiebreakerHelp?.close();
    });
    tiebreakerHelp?.addEventListener("click", (event) => {
      if (event.target === tiebreakerHelp) tiebreakerHelp.close();
    });
    updateTournamentTiebreakerSelects(form);
    wireMarkdownEditors(form);
    wireAdminTournamentAutosave(form);
  });
}

function wireAdminTournamentAutosave(form) {
  if (!form.matches("[data-admin-tournament-update]") || form.dataset.autosaveWired === "1") return;
  form.dataset.autosaveWired = "1";

  let timer = null;
  let saving = false;
  let pending = false;
  let lastSnapshot = adminTournamentAutosaveSnapshot(form);
  const status = form.querySelector("[data-admin-tournament-autosave-status]");

  const setStatus = (text, kind = "") => {
    if (!status) return;
    status.textContent = text;
    status.dataset.status = kind;
  };

  const runSave = async () => {
    timer = null;
    if (saving) {
      pending = true;
      return;
    }
    const snapshot = adminTournamentAutosaveSnapshot(form);
    if (!snapshot) {
      setStatus(t("admin.tournament.autosave.notSaved"), "error");
      return;
    }
    if (snapshot === lastSnapshot) {
      setStatus("", "");
      return;
    }

    saving = true;
    setStatus(t("admin.tournament.autosave.saving"), "saving");
    try {
      await saveAdminTournamentUpdate(form, { renderAfterSave: false });
      lastSnapshot = snapshot;
      setStatus(t("admin.tournament.autosave.saved"), "saved");
    } catch (err) {
      setStatus(t("admin.tournament.autosave.saveFailed"), "error");
      setMessage(err.message, true);
    } finally {
      saving = false;
      if (pending) {
        pending = false;
        schedule(TOURNAMENT_AUTOSAVE_CHANGE_DELAY_MS);
      }
    }
  };

  const schedule = (delay) => {
    if (!adminTournamentCanAutosave(form)) {
      setStatus(t("admin.tournament.autosave.notSaved"), "error");
      return;
    }
    setStatus(t("admin.tournament.autosave.unsaved"), "pending");
    window.clearTimeout(timer);
    timer = window.setTimeout(runSave, delay);
  };

  form.addEventListener("tournament-autosave-request", () => schedule(TOURNAMENT_AUTOSAVE_CHANGE_DELAY_MS));
  form.querySelectorAll("input, select, textarea").forEach((control) => {
    if (control.type === "hidden" || control.type === "submit") return;
    const isTextControl = control.tagName === "TEXTAREA" || ["text", "datetime-local", "number"].includes(control.type);
    control.addEventListener("input", () => schedule(isTextControl ? TOURNAMENT_AUTOSAVE_TEXT_DELAY_MS : TOURNAMENT_AUTOSAVE_CHANGE_DELAY_MS));
    control.addEventListener("change", () => schedule(TOURNAMENT_AUTOSAVE_CHANGE_DELAY_MS));
  });
}

function adminTournamentCanAutosave(form) {
  if (!state.adminTournamentDetail?.tournament?.id) return false;
  if (form.dataset.rulesFileLoading === "1") return false;
  if (form.dataset.logoLoading === "1") return false;
  if (!form.checkValidity()) return false;
  const rulesLink = form.elements.rulesLink;
  const rulesFileData = form.elements.rulesFileData?.value || "";
  const rulesLinkValue = String(rulesLink?.value || "").trim();
  if (rulesLink && !rulesLink.disabled && rulesLinkValue && !rulesFileData && !/^https?:\/\/\S+$/i.test(rulesLinkValue)) {
    return false;
  }
  return true;
}

function adminTournamentAutosaveSnapshot(form) {
  if (!adminTournamentCanAutosave(form)) return "";
  try {
    return JSON.stringify(adminTournamentBodyFromForm(form));
  } catch (err) {
    return "";
  }
}

function wireTournamentTableAdminControls() {
  document.querySelector("[data-admin-tournament-table-add]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAdminTournamentTable(event.currentTarget);
  });

  document.querySelectorAll("[data-admin-table-save]").forEach((button) => {
    button.addEventListener("click", async () => {
      await saveAdminTournamentTable(Number(button.dataset.adminTableSave));
    });
  });

  document.querySelectorAll("[data-admin-table-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteAdminTournamentTable(Number(button.dataset.adminTableDelete));
    });
  });
}

function wireTournamentParticipantAdminControls() {
  document.querySelector("[data-admin-tournament-add-participant]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAdminTournamentParticipant(event.currentTarget);
  });

  document.querySelector("[data-admin-tournament-bulk]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAdminTournamentBulk(event.currentTarget);
  });

  document.querySelector("[data-admin-tournament-save-seeds]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await saveAdminTournamentSeeds();
  });

  document.querySelector("[data-admin-tournament-regenerate-seeds]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await regenerateAdminTournamentSeeds();
  });

  document.querySelectorAll("[data-admin-participant-remove]").forEach((button) => {
    button.addEventListener("click", async () => {
      await removeAdminTournamentParticipant(Number(button.dataset.adminParticipantRemove));
    });
  });

  document.querySelectorAll("[data-admin-participant-save-faction]").forEach((button) => {
    button.addEventListener("click", async () => {
      await saveAdminTournamentParticipantFaction(Number(button.dataset.adminParticipantSaveFaction));
    });
  });

  document.querySelectorAll("[data-admin-participant-replace]").forEach((button) => {
    button.addEventListener("click", async () => {
      await replaceAdminTournamentParticipant(Number(button.dataset.adminParticipantReplace));
    });
  });

  document.querySelectorAll("[data-admin-participant-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      await linkAdminTournamentParticipant(Number(button.dataset.adminParticipantLink));
    });
  });
}

function wireAdminTournamentControls() {
  wireAdminTournamentFormBehavior();
  wireTournamentInfoControls(state.adminTournamentDetail, { admin: true });

  document.querySelector("[data-admin-tournament-new]")?.addEventListener("click", () => {
    state.adminTournamentMode = "create";
    state.selectedTournamentId = null;
    state.adminTournamentDetail = null;
    state.adminTournamentPreview = null;
    syncAppHash();
    renderTournaments();
  });

  document.querySelector("[data-admin-tournament-create-cancel]")?.addEventListener("click", async () => {
    try {
      await openAdminTournamentList();
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  document.querySelector("[data-admin-tournament-create]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = adminTournamentBodyFromForm(event.currentTarget, { includeSlug: true });
      const data = await api("/api/admin/tournaments", { method: "POST", body });
      state.selectedTournamentId = data.tournament.id;
      state.adminTournamentMode = "detail";
      state.tournamentInfoTab = "settings";
      state.adminTournamentPreview = null;
      await loadTournamentAdmin();
      syncAppHash();
      renderShell();
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  document.querySelectorAll("[data-admin-tournament-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        state.adminTournamentMode = "detail";
        state.tournamentInfoTab = "settings";
        await loadAdminTournamentDetail(Number(button.dataset.adminTournamentOpen));
        syncAppHash();
        renderTournaments();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });

  document.querySelector("[data-admin-tournament-close]")?.addEventListener("click", async () => {
    try {
      await openAdminTournamentList();
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  document.querySelector("[data-admin-tournament-update]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveAdminTournamentUpdate(event.currentTarget);
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  document.querySelectorAll("[data-admin-tournament-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runAdminTournamentAction(button.dataset.adminTournamentAction);
    });
  });

  document.querySelector("[data-admin-tournament-public]")?.addEventListener("click", () => {
    const slug = document.querySelector("[data-admin-tournament-public]")?.dataset.adminTournamentPublic;
    if (!slug) return;
    navigateToPublicTournament(slug);
  });

  document.querySelector("[data-admin-tournament-copy]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await copyText(button.dataset.adminTournamentCopy);
      button.textContent = t("admin.tournament.detail.copied");
      window.setTimeout(() => {
        button.textContent = t("admin.tournament.detail.copyLink");
      }, 1400);
    } catch (err) {
      setMessage(err.message, true);
    }
  });

  document.querySelectorAll("[data-admin-tournament-match-result]").forEach((button) => {
    button.addEventListener("click", () => {
      const detail = state.adminTournamentDetail;
      const match = findTournamentMatch(detail, Number(button.dataset.adminTournamentMatchResult));
      if (match) renderTournamentResultForm(detail, match, { admin: true });
    });
  });
}

async function saveAdminTournamentUpdate(form, options = {}) {
  const { renderAfterSave = true } = options;
  const id = state.adminTournamentDetail?.tournament?.id;
  const data = await api(`/api/admin/tournaments/${id}`, {
    method: "PATCH",
    body: adminTournamentBodyFromForm(form)
  });
  state.adminTournamentPreview = null;
  if (data?.tournament && state.adminTournamentDetail?.tournament?.id === data.tournament.id) {
    state.adminTournamentDetail.tournament = {
      ...state.adminTournamentDetail.tournament,
      ...data.tournament
    };
  }
  if (data?.tournament) {
    state.adminTournaments = (state.adminTournaments || []).map((tournament) =>
      tournament.id === data.tournament.id ? { ...tournament, ...data.tournament } : tournament
    );
  }
  if (renderAfterSave) {
    await loadTournamentAdmin();
    renderTournaments();
  }
  return data;
}

function adminTournamentBodyFromForm(form, options = {}) {
  const { includeSlug = false } = options;
  if (form.dataset.logoLoading === "1") throw new Error(t("tournaments.logo.loading"));
  if (form.dataset.rulesFileLoading === "1") {
    throw new Error(t("admin.tournament.rulesFile.stillLoading"));
  }
  const body = {};
  if (form.elements.logoData?.dataset.changed === "1") body.logoData = form.elements.logoData.value || null;
  setFormValue(body, form, "name");
  setFormValue(body, form, "gameSystem");
  setFormValue(body, form, "startsAt");
  if (Object.prototype.hasOwnProperty.call(body, "startsAt")) {
    // datetime-local has no timezone; convert in the browser before the API sees it.
    body.startsAt = datetimeLocalToIso(body.startsAt);
  }
  const participantMode = form.elements.participantMode?.value === "team" ? "team" : "individual";
  if (!form.elements.participantMode?.disabled) {
    body.participantMode = participantMode;
    if (participantMode === "team") {
      body.format = "swiss";
      body.teamSize = 3;
      body.pairingType = "shield_sword";
    } else {
      setFormValue(body, form, "format");
    }
  }
  setFormValue(body, form, "ratingPolicy");
  setFormValue(body, form, "challengeCreditPolicy");
  setFormValue(body, form, "seasonId");
  setFormValue(body, form, "venueMode");
  if (includeSlug) setFormValue(body, form, "slug");

  const tournamentRulesField = form.elements.tournamentRules;
  if (tournamentRulesField && !tournamentRulesField.disabled) {
    body.tournamentRules = tournamentRulesField.value;
  } else {
    setFormValue(body, form, "description");
    setFormValue(body, form, "rulesSummary");
  }

  const swissRoundField = form.elements.swissRoundCount;
  if (swissRoundField && !swissRoundField.disabled && body.format === "swiss") {
    body.swissRoundCount = Number(swissRoundField.value || 0);
  }
  const singleEliminationSizeField = form.elements.singleEliminationSize;
  if (singleEliminationSizeField && !singleEliminationSizeField.disabled && body.format === "single_elimination") {
    body.singleEliminationSize = Number(singleEliminationSizeField.value || 0);
  }

  const rulesFileData = form.elements.rulesFileData?.value || "";
  const rulesLinkField = form.elements.rulesLink;
  if (rulesFileData) {
    body.rulesLink = rulesFileData;
  } else if (rulesLinkField && !rulesLinkField.disabled) {
    const rulesLink = String(rulesLinkField.value || "").trim();
    if (rulesLink || form.dataset.existingRulesLinkType !== "pdf") {
      body.rulesLink = rulesLink;
    }
  }

  const tiebreakerSelects = Array.from(form.querySelectorAll("[data-tournament-tiebreaker-select]"))
    .filter((select) => !select.disabled);
  if (tiebreakerSelects.length) {
    const selected = [];
    const seen = new Set();
    for (const select of tiebreakerSelects) {
      const value = select.value;
      if (!value || seen.has(value)) continue;
      seen.add(value);
      selected.push(value);
    }
    body.tiebreakerOrder = selected.slice(0, 4);
  }
  return body;
}

async function runAdminTournamentAction(action) {
  const tournament = state.adminTournamentDetail?.tournament;
  if (!tournament) return;
  try {
    if (action === "preview") {
      await loadAdminTournamentPreview(tournament.id);
    } else if (action === "publish-open") {
      await api(`/api/admin/tournaments/${tournament.id}/publish`, {
        method: "POST",
        body: { status: "registration_open" }
      });
    } else if (action === "publish-closed") {
      await api(`/api/admin/tournaments/${tournament.id}/publish`, {
        method: "POST",
        body: { status: "registration_closed" }
      });
    } else if (action === "close-registration") {
      await api(`/api/admin/tournaments/${tournament.id}/registration/close`, { method: "POST" });
    } else if (action === "reopen-registration") {
      await api(`/api/admin/tournaments/${tournament.id}/registration/reopen`, { method: "POST" });
    } else if (action === "start") {
      if (tournament.participantMode === "team") { openTeamTournamentStart(tournament); return; }
      if (!await confirmAction({ message: t("dialog.admin.startTournament"), confirmLabel: t("admin.tournament.action.start"), danger: false })) return;
      await api(`/api/admin/tournaments/${tournament.id}/start`, { method: "POST" });
    } else if (action === "generate-next-round") {
      await openNextRoundSetupModal(tournament.id);
      return;
    } else if (action === "close-tournament") {
      if (!await confirmAction({ message: t("dialog.admin.closeTournament"), confirmLabel: t("admin.tournament.action.closeTournament"), danger: false })) return;
      const participantIds = (state.adminTournamentDetail?.standings || []).map((row) => row.participantId);
      await api(`/api/admin/tournaments/${tournament.id}/standings/publish`, {
        method: "POST",
        body: { participantIds }
      });
    } else if (action === "rollback-latest-round") {
      const rollbackState = rollbackRoundActionState(state.adminTournamentDetail || {});
      if (!await confirmAction({ message: t("dialog.admin.rollbackLatestRound", { number: rollbackState.roundNumber || "" }), confirmLabel: t("admin.tournament.action.rollbackLatestRound") })) return;
      await api(`/api/admin/tournaments/${tournament.id}/rounds/latest`, { method: "DELETE" });
      await loadTournamentAdmin();
      renderTournaments();
      await openNextRoundSetupModal(tournament.id);
      return;
    } else if (action === "delete") {
      if (!await confirmDelete(t("dialog.admin.deleteTournament", { name: tournament.name || t("tournaments.list.untitled") }))) return;
      await api(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE" });
      await openAdminTournamentList();
      return;
    }
    await loadTournamentAdmin();
    renderTournaments();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function refreshAdminTournamentDetailView() {
  await loadTournamentAdmin();
  renderTournaments();
}

async function submitAdminTournamentTable(form) {
  const tournament = state.adminTournamentDetail?.tournament;
  if (!tournament) return;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/tables`, {
      method: "POST",
      body: tablePayloadFromForm(form)
    });
    form.reset();
    await refreshAdminTournamentDetailView();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function saveAdminTournamentTable(tableId) {
  const tournament = state.adminTournamentDetail?.tournament;
  if (!tournament) return;
  const killzone = document.querySelector(`[name="table-killzone-${tableId}"]`)?.value || "";
  const deployment = document.querySelector(`[name="table-deployment-${tableId}"]`)?.value || "";
  try {
    await api(`/api/admin/tournaments/${tournament.id}/tables/${tableId}`, {
      method: "PATCH",
      body: { killzone, deployment }
    });
    await refreshAdminTournamentDetailView();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function deleteAdminTournamentTable(tableId) {
  const tournament = state.adminTournamentDetail?.tournament;
  if (!tournament) return;
  const table = (state.adminTournamentDetail?.tables || []).find((item) => item.id === tableId);
  if (!await confirmDelete(t("dialog.admin.deleteTable", { number: table?.tableNumber || "" }))) return;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/tables/${tableId}`, { method: "DELETE" });
    await refreshAdminTournamentDetailView();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function submitAdminTournamentParticipant(form) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const formData = new FormData(form);
  const body = {
    displayName: formData.get("displayName") || "",
    faction: formData.get("faction") || ""
  };
  const userId = Number(formData.get("userId") || 0);
  if (userId) body.userId = userId;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/participants`, { method: "POST", body });
    form.reset();
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function submitAdminTournamentBulk(form) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const names = new FormData(form).get("names") || "";
  try {
    await api(`/api/admin/tournaments/${tournament.id}/participants/bulk`, {
      method: "POST",
      body: { names }
    });
    form.reset();
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function saveAdminTournamentSeeds() {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const participantIds = (detail.participants || [])
    .filter((participant) => ["joined", "active"].includes(participant.status))
    .map((participant) => ({
      id: participant.id,
      seed: Number(document.querySelector(`[data-participant-seed="${participant.id}"]`)?.value || participant.seed || 9999)
    }))
    .sort((a, b) => a.seed - b.seed || a.id - b.id)
    .map((participant) => participant.id);
  try {
    await api(`/api/admin/tournaments/${tournament.id}/seeds`, {
      method: "POST",
      body: { participantIds }
    });
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function regenerateAdminTournamentSeeds() {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  if (!await confirmAction({ message: t("dialog.admin.regenerateSeeds"), danger: false })) return;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/seeds/regenerate`, { method: "POST" });
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function removeAdminTournamentParticipant(participantId) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const participant = (detail.participants || []).find((item) => item.id === participantId);
  if (!await confirmDelete(t("dialog.admin.removeParticipant", { name: participant?.displayName || t("dialog.admin.participantFallback") }), t("admin.tournament.participants.remove"))) return;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/participants/${participantId}`, { method: "DELETE" });
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function linkAdminTournamentParticipant(participantId) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const select = document.querySelector(`[data-admin-participant-link-user="${participantId}"]`);
  const userId = Number(select?.value || 0);
  if (!userId) {
    setMessage(t("admin.tournament.participants.chooseUser"), true);
    return;
  }
  try {
    await api(`/api/admin/tournaments/${tournament.id}/participants/${participantId}`, {
      method: "PATCH",
      body: { userId }
    });
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function saveAdminTournamentParticipantFaction(participantId) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const input = document.querySelector(`[name="participant-faction-${participantId}"]`);
  if (input && !input.reportValidity()) return;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/participants/${participantId}`, {
      method: "PATCH",
      body: { faction: input?.value || "" }
    });
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function replaceAdminTournamentParticipant(participantId) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const participant = (detail.participants || []).find((item) => item.id === participantId);
  if (tournament.status === "in_progress" && participant?.userId) {
    setMessage(t("admin.tournament.participants.replaceLocked"), true);
    return;
  }
  const select = document.querySelector(`[data-admin-participant-replace-user="${participantId}"]`);
  const userId = Number(select?.value || 0);
  if (!userId) {
    setMessage(t("admin.tournament.participants.chooseRegisteredUser"), true);
    return;
  }
  const user = (state.adminUsers || []).find((item) => item.id === userId);
  const body = { userId };
  if (user && tournament.status !== "in_progress") body.displayName = user.name;
  try {
    await api(`/api/admin/tournaments/${tournament.id}/participants/${participantId}`, {
      method: "PATCH",
      body
    });
    await refreshTournamentParticipantView(tournament);
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function adminPatch(id, body) {
  try {
    await api(`/api/admin/users/${id}`, { method: "PATCH", body });
    await refresh();
    await loadAdminUsers();
    await loadTop();
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
  }
}

function wireAdminTeamRosterControls(data) {
  document.querySelector("[data-admin-team-roster-add]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await openAdminTeamRosterCreator(data);
    } catch (err) {
      setMessage(err.message, true);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  document.querySelectorAll("[data-admin-team-roster-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const roster = (data.rosters || []).find((item) => item.id === Number(button.dataset.adminTeamRosterEdit));
      if (roster) openAdminTeamRosterEditor(data, roster);
    });
  });
  document.querySelector("[data-admin-team-roster-save-seeds]")?.addEventListener("click", async () => {
    const inputs = Array.from(document.querySelectorAll("[data-team-roster-seed]"));
    const rosterIds = inputs
      .map((input) => ({ id: Number(input.dataset.teamRosterSeed), seed: Number(input.value) }))
      .sort((a, b) => a.seed - b.seed || a.id - b.id)
      .map((item) => item.id);
    try {
      await api(`/api/admin/tournaments/${data.tournament.id}/rosters/seeds`, { method: "POST", body: { rosterIds } });
      await refreshTeamTournamentUi(data, { admin: true });
    } catch (err) { setMessage(err.message, true); }
  });
  document.querySelectorAll("[data-admin-team-roster-withdraw]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!await confirmAction({ message: t("teams.tournament.withdrawConfirm"), confirmLabel: t("teams.tournament.withdraw") })) return;
      try {
        await api(`/api/tournaments/${data.tournament.id}/rosters/${button.dataset.adminTeamRosterWithdraw}/withdraw`, { method: "POST" });
        await refreshTeamTournamentUi(data, { admin: true });
      } catch (err) { setMessage(err.message, true); }
    });
  });
  document.querySelectorAll("[data-admin-team-roster-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const roster = (data.rosters || []).find((item) => item.id === Number(button.dataset.adminTeamRosterDelete));
      const started = Boolean(data.tournament.startedAt) || ["in_progress", "completed"].includes(data.tournament.status);
      if (!await confirmDelete(t(started ? "teams.tournament.removeAfterStartConfirm" : "teams.tournament.deleteConfirm", { name: roster?.name || roster?.teamNameSnapshot || "" }))) return;
      try {
        await api(`/api/tournaments/${data.tournament.id}/rosters/${button.dataset.adminTeamRosterDelete}`, { method: "DELETE" });
        await refreshTeamTournamentUi(data, { admin: true });
      } catch (err) { setMessage(err.message, true); }
    });
  });
}

window.TGTV_ADMIN = {
  adminActiveGamesPanel,
  adminChallengeActions,
  adminChallengeCredit,
  adminDeleteGame,
  adminForceConfirmGame,
  adminPendingGamesCard,
  adminPlayerToolsCard,
  adminTeamPairingOverrideForm,
  adminTeamsPanel,
  adminTournamentAdminView,
  adminTournamentParticipantsContent,
  adminTournamentPreviewPanel,
  adminTournamentRoundsPanel,
  adminTournamentSettingsContent,
  adminTournamentTablesContent,
  adminUsersPanel,
  loadAdminGames,
  loadAdminTeams,
  loadAdminTournamentDetail,
  loadAdminUsers,
  loadTournamentAdmin,
  refreshAdminTournamentDetailView,
  wireAdminGameButtons,
  wireAdminPendingGameButtons,
  wireAdminPlayerTools,
  wireAdminTeamRosterControls,
  wireAdminTeams,
  wireAdminTournamentControls,
  wireAdminUserControls,
  wireFeedbackAdminActions,
  wireTournamentParticipantAdminControls,
  wireTournamentTableAdminControls
};

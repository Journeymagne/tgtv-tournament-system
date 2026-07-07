const app = document.querySelector("#app");

const state = {
  me: null,
  hasAdmin: false,
  view: "play",
  authMode: "login",
  users: [],
  allGames: [],
  gamesError: "",
  selectedGameId: null,
  challengeProgress: [],
  challengeError: "",
  selectedChallengeUserId: null,
  challengeOpenedFromProfile: false,
  challengeTab: "classified",
  statisticsTab: "killTeamWinrates",
  selectedStatisticsTeam: null,
  searchResults: [],
  adminUsers: [],
  playerProfile: null,
  feedback: [],
  feedbackError: "",
  feedbackMode: "form"
};

let searchDebounce = null;
let searchRequestId = 0;

const opLabels = {
  crit: "Crit Op",
  kill: "Kill Op",
  tac: "Tac Op"
};

const killTeamOptions = [
  "Celestian Insidiants",
  "Novitiates",
  "Battleclade",
  "Hunter Clade",
  "Elucidian Starstriders",
  "Exaction Squad",
  "Navy Breachers",
  "Inquisitorial Agents",
  "Sanctifiers",
  "Death Korps",
  "Kasrkin",
  "Ratlings",
  "Spectre Squad",
  "Tempestus Aquilons",
  "Angels of Death",
  "Deathwatch",
  "Phobos Strike Team",
  "Scout Squad",
  "Wolf Scouts",
  "Gellerpox Infected",
  "Legionaries",
  "Murderwing",
  "Nemesis Claw",
  "Blooded",
  "Chaos Cult",
  "Fellgor Ravagers",
  "Plague Marines",
  "Warpcoven",
  "Goremongers",
  "Corsair Voidscarred",
  "Blades of Khaine",
  "Hand of the Archon",
  "Mandrakes",
  "Void-Dancer Troupe",
  "Brood Brothers",
  "Wyrmblade",
  "Hearthkyn Salvagers",
  "Hernkyn Yaegirs",
  "Canoptek Circle",
  "Hierotek Circle",
  "Kommandos",
  "Wrecka Krew",
  "Farstalker Kinband",
  "Pathfinders",
  "Vespid Stingwings",
  "XV26 Stealth Battlesuits",
  "Raveners"
];

const allKillTeamExtraTeams = [
  "Novitiates",
  "Elucidian Starstriders",
  "Hunter Clade",
  "Death Korps",
  "Phobos Strike Team",
  "Gellerpox Infected",
  "Legionaries",
  "Blooded",
  "Warpcoven",
  "Corsair Voidscarred",
  "Wyrmblade",
  "Void-Dancer Troupe",
  "Kommandos",
  "Pathfinders"
];

const classifiedChallengeExtraTeams = [
  "Spectre Squad"
];

const challengeWildcardTeams = [
  "Navy Breachers",
  "XV26 Stealth Suits"
];

const tacOpOptions = [
  "Plant Devices",
  "Steal Intelligence",
  "Track Enemy",
  "Flank",
  "Retrieval",
  "Scout Enemy Movement",
  "Plant Banner",
  "Martyrs",
  "Envoy",
  "Rout",
  "Sweep & Clear",
  "Dominate"
];

const critOpOptions = [
  "Secure",
  "Loot",
  "Transmission",
  "Orb",
  "Stake Claim",
  "Energy Cells",
  "Download",
  "Data",
  "Reboot"
];

const killzoneOptions = [
  "Volkus",
  "Gallowdark",
  "Bheta-Decima",
  "Octarius",
  "WTC ITD",
  "WTC Open",
  "Non-specific"
];

const killTeamAliases = new Map([
  ["angel of death", "Angels of Death"],
  ["angels of death", "Angels of Death"],
  ["brood brother", "Brood Brothers"],
  ["brood brothers", "Brood Brothers"],
  ["celestian insidiant", "Celestian Insidiants"],
  ["celestian insidiants", "Celestian Insidiants"],
  ["corsair voidscarred", "Corsair Voidscarred"],
  ["elucidian starstrider", "Elucidian Starstriders"],
  ["elucidian starstriders", "Elucidian Starstriders"],
  ["farstalker kinband", "Farstalker Kinband"],
  ["fellgor ravager", "Fellgor Ravagers"],
  ["fellgor ravagers", "Fellgor Ravagers"],
  ["goremonger", "Goremongers"],
  ["goremongers", "Goremongers"],
  ["hearthkyn salvager", "Hearthkyn Salvagers"],
  ["hearthkyn salvagers", "Hearthkyn Salvagers"],
  ["hernkyn yaegir", "Hernkyn Yaegirs"],
  ["hernkyn yaegirs", "Hernkyn Yaegirs"],
  ["imperial navy breacher", "Navy Breachers"],
  ["imperial navy breachers", "Navy Breachers"],
  ["inquisitorial agent", "Inquisitorial Agents"],
  ["inquisitorial agents", "Inquisitorial Agents"],
  ["legionary", "Legionaries"],
  ["legionaries", "Legionaries"],
  ["navy breacher", "Navy Breachers"],
  ["navy breachers", "Navy Breachers"],
  ["novitiate", "Novitiates"],
  ["novitiates", "Novitiates"],
  ["kommando", "Kommandos"],
  ["kommandos", "Kommandos"],
  ["tempestus aquilons", "Tempestus Aquilons"],
  ["tempestus aquillons", "Tempestus Aquilons"],
  ["vespid stingwings", "Vespid Stingwings"],
  ["void dancer troupe", "Void-Dancer Troupe"],
  ["void dancer", "Void-Dancer Troupe"],
  ["void-dancer troupe", "Void-Dancer Troupe"],
  ["warp coven", "Warpcoven"],
  ["warpcoven", "Warpcoven"],
  ["xv26 stealth battlesuits", "XV26 Stealth Battlesuits"],
  ["xv26 stealth suits", "XV26 Stealth Battlesuits"]
]);

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));
}

function approvedTotal(score) {
  const crit = Number(score?.crit || 0);
  const kill = Number(score?.kill || 0);
  const tac = Number(score?.tac || 0);
  const primary = score?.primary || "crit";
  return crit + kill + tac + Math.ceil(Number(score?.[primary] || 0) / 2);
}

function setMessage(text, isError = false) {
  const el = document.querySelector("[data-message]");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(isError));
}

function setProfileMessage(text, isError = false) {
  const el = document.querySelector("[data-profile-message]");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(isError));
}

function setPlayerProfileMessage(text, isError = false) {
  const el = document.querySelector("[data-player-profile-message]");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(isError));
}

function userInitials(user) {
  const name = String(user?.name || "KT").trim();
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "KT";
}

function avatarMarkup(user) {
  if (user?.avatarData) {
    return `<img src="${escapeHtml(user.avatarData)}" alt="">`;
  }
  return `<span>${escapeHtml(userInitials(user))}</span>`;
}

function crossedSwordsIcon() {
  return `
    <svg class="inline-icon swords-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 4.5 19 9l-2 2-4.5-4.5z"></path>
      <path d="m4 20 7.6-7.6"></path>
      <path d="m12.4 11.6 1.4-1.4"></path>
      <path d="M9.5 4.5 5 9l2 2 4.5-4.5z"></path>
      <path d="m20 20-7.6-7.6"></path>
      <path d="m11.6 11.6-1.4-1.4"></path>
      <path d="M3.5 18.5 5.5 20.5"></path>
      <path d="M18.5 20.5 20.5 18.5"></path>
    </svg>
  `;
}

function profileInfoMarkup(user) {
  const rows = [
    ["Register Nickname", user?.registerNickname],
    ["Telegram", user?.telegramContact]
  ].filter(([, value]) => String(value || "").trim());

  if (!rows.length) return "";
  return `
    <div class="profile-info-list">
      ${rows.map(([label, value]) => `
        <span class="profile-info-item">
          <small>${escapeHtml(label)}</small>
          <strong>${escapeHtml(value)}</strong>
        </span>
      `).join("")}
    </div>
  `;
}

function profileContactsCard(user) {
  const rows = [
    ["Register Nickname", user?.registerNickname],
    ["Telegram Contact", user?.telegramContact]
  ];
  return `
    <div class="card panel">
      <div class="panel-header">
        <div>
          <h3>Contacts</h3>
          <p class="muted">Player contact details.</p>
        </div>
      </div>
      <div class="contact-list">
        ${rows.map(([label, value]) => `
          <div class="contact-row">
            <span>${escapeHtml(label)}</span>
            <strong>${value ? escapeHtml(value) : "Not filled"}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

async function refresh() {
  const data = await api("/api/me");
  state.me = data.user;
  state.hasAdmin = data.hasAdmin;
  state.challenges = data.challenges || [];
  state.games = data.games || [];
}

async function boot() {
  try {
    await refresh();
    await loadTop();
    render();
  } catch (err) {
    app.innerHTML = `<div class="loading">${escapeHtml(err.message)}</div>`;
  }
}

function render() {
  if (!state.me) {
    renderAuth();
    return;
  }
  renderShell();
}

function renderAuth() {
  const setupOpen = !state.hasAdmin;
  const title = state.authMode === "setup"
    ? "First administrator"
    : state.authMode === "register"
      ? "Create account"
      : "Sign in";
  const subtitle = state.authMode === "setup"
    ? "Create the account that can manage players and ratings."
    : state.authMode === "register"
      ? "Your name will be visible in player search and the leaderboard."
      : "Return to your challenges, matches, and rating.";
  const action = state.authMode === "setup" ? "Create administrator" : state.authMode === "register" ? "Create account" : "Sign in";
  const profileFields = state.authMode !== "login" ? `
    <div class="field">
      <label for="register-nickname">Register Nickname</label>
      <input id="register-nickname" name="registerNickname" maxlength="40" placeholder="Optional">
    </div>
    <div class="field">
      <label for="telegram-contact">Telegram Contact</label>
      <input id="telegram-contact" name="telegramContact" maxlength="80" placeholder="@username" required>
    </div>
  ` : "";
  const confirmPasswordField = state.authMode !== "login"
    ? passwordFieldMarkup("Confirm password", "confirmPassword", "confirm-password", "new-password")
    : "";

  app.innerHTML = `
    <main class="auth-layout">
      <section class="brand-panel">
        <div>
          <img class="brand-logo" src="/logo.png" alt="TGTV logo">
          <h1>TGTV Ranking Tournament System</h1>
          <p>Kill Team challenges, Approved Ops results, and player ratings in one place.</p>
        </div>
      </section>
      <section class="auth-stack">
        <div class="card auth-card">
          <div class="tabs">
            <button class="tab ${state.authMode === "login" ? "active" : ""}" data-auth-tab="login">Sign in</button>
            <button class="tab ${state.authMode === "register" ? "active" : ""}" data-auth-tab="register">Register</button>
            ${setupOpen ? `<button class="tab ${state.authMode === "setup" ? "active" : ""}" data-auth-tab="setup">Admin</button>` : ""}
          </div>
          <h2 class="section-title">${title}</h2>
          <p class="section-subtitle">${subtitle}</p>
          <form data-auth-form>
            <div class="field">
              <label for="name">Name</label>
              <input id="name" name="name" autocomplete="username" required minlength="2" maxlength="24">
            </div>
            ${passwordFieldMarkup("Password", "password", "password", state.authMode === "login" ? "current-password" : "new-password")}
            ${confirmPasswordField}
            ${profileFields}
            <button class="primary-button" type="submit">${action}</button>
            <div class="message" data-message></div>
          </form>
        </div>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authTab;
      renderAuth();
    });
  });
  document.querySelector("[data-auth-form]").addEventListener("submit", submitAuth);
  wirePasswordToggles();
}

function passwordFieldMarkup(label, name, id, autocomplete) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="password-control">
        <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" required minlength="6">
        <button class="password-toggle" type="button" data-password-toggle="${id}" aria-label="Show password" aria-pressed="false">
          ${eyeIcon()}
        </button>
      </div>
    </div>
  `;
}

function eyeIcon() {
  return `
    <svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
    </svg>
  `;
}

function wirePasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.setAttribute("aria-pressed", String(show));
    });
  });
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = { name: form.get("name"), password: form.get("password") };
  if (state.authMode !== "login") {
    body.confirmPassword = form.get("confirmPassword");
    if (body.password !== body.confirmPassword) {
      setMessage("Passwords do not match", true);
      return;
    }
    body.registerNickname = form.get("registerNickname");
    body.telegramContact = form.get("telegramContact");
  }
  const path = state.authMode === "setup" ? "/api/setup-admin" : state.authMode === "register" ? "/api/register" : "/api/login";
  try {
    await api(path, { method: "POST", body });
    await refresh();
    await loadTop();
    state.view = "play";
    render();
  } catch (err) {
    setMessage(err.message, true);
  }
}

function renderShell() {
  setSidebarOpen(false);
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-title">
        <div class="app-brand">
          <img class="app-logo" src="/logo.png" alt="TGTV logo">
          <div>
            <div class="app-brand-name">TGTV Ranking</div>
            <div class="app-brand-subtitle">Tournament System</div>
          </div>
        </div>
        <div class="topbar-user-controls">
          <button class="menu-toggle" data-sidebar-toggle aria-label="Open navigation" aria-expanded="false">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <button class="mark avatar-button" data-header-profile aria-label="Open profile">${avatarMarkup(state.me)}</button>
        </div>
        <div class="topbar-player">
          <div class="topbar-name-row">
            <h1>${escapeHtml(state.me.name)}</h1>
            <span class="rating-pill inline-rating">${state.me.rating} Elo</span>
          </div>
        </div>
      </div>
    </header>
    <button class="sidebar-backdrop" data-sidebar-close aria-label="Close navigation"></button>
    <main class="layout">
      <aside class="card sidebar">
        ${navButton("top", "Leaderboard")}
        ${navButton("play", "Matchmaking")}
        ${navButton("games", "Games")}
        ${navButton("statistics", "Stats")}
        ${navButton("profile", "Profile")}
        ${navButton("challenge", "All Kill Team Challenge")}
        ${state.me.isAdmin ? navButton("admin", "Administration") : ""}
        ${navButton("feedback", "Feedback")}
        <button class="nav-button sidebar-logout" data-logout>Sign out</button>
      </aside>
      <section class="content" data-content></section>
    </main>
  `;

  document.querySelector("[data-sidebar-toggle]").addEventListener("click", () => {
    setSidebarOpen(!document.body.classList.contains("sidebar-open"));
  });
  document.querySelector("[data-sidebar-close]").addEventListener("click", () => setSidebarOpen(false));
  document.querySelector("[data-logout]").addEventListener("click", logout);
  document.querySelector("[data-header-profile]").addEventListener("click", async () => {
    setSidebarOpen(false);
    state.view = "profile";
    state.playerProfile = null;
    state.selectedChallengeUserId = state.me.id;
    await loadChallengeProgress();
    renderShell();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      setSidebarOpen(false);
      const targetView = button.dataset.view;
      state.view = targetView;
      state.playerProfile = null;
      state.selectedGameId = null;
      if (targetView === "challenge") {
        state.challengeOpenedFromProfile = false;
        state.selectedChallengeUserId = state.me.id;
      } else {
        state.selectedChallengeUserId = null;
        state.challengeOpenedFromProfile = false;
      }
      if (targetView === "games") await loadGames();
      if (targetView === "statistics") await loadGames();
      if (targetView === "profile") await loadChallengeProgress();
      if (targetView === "challenge") await loadChallengeProgress();
      if (targetView === "feedback") state.feedbackMode = "form";
      if (targetView === "top") await loadTop();
      if (targetView === "admin") await loadAdmin();
      renderShell();
    });
  });

  if (state.view === "profile") renderProfile();
  else if (state.view === "player") renderPlayerProfile();
  else if (state.view === "games") renderGames();
  else if (state.view === "gameDetail") renderGameDetail();
  else if (state.view === "statistics") renderStatistics();
  else if (state.view === "challenge") renderChallenge();
  else if (state.view === "feedback") renderFeedback();
  else if (state.view === "top") renderTop();
  else if (state.view === "admin") renderAdmin();
  else renderPlay();
}

function setSidebarOpen(isOpen) {
  document.body.classList.toggle("sidebar-open", Boolean(isOpen));
  document.querySelector("[data-sidebar-toggle]")?.setAttribute("aria-expanded", String(Boolean(isOpen)));
}

if (!window.__tgtvSidebarEscapeBound) {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSidebarOpen(false);
  });
  window.__tgtvSidebarEscapeBound = true;
}

function navButton(id, label) {
  const active = state.view === id || (id === "top" && state.view === "player") || (id === "games" && state.view === "gameDetail");
  return `<button class="nav-button ${active ? "active" : ""}" data-view="${id}">${label}</button>`;
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.me = null;
  state.view = "play";
  render();
}

function renderPlay() {
  const content = document.querySelector("[data-content]");
  const incoming = state.challenges.filter((item) => item.status === "pending" && item.toUserId === state.me.id);
  const outgoing = state.challenges.filter((item) => item.status === "pending" && item.fromUserId === state.me.id);
  const openGames = state.games.filter((game) => ["open", "pending_confirmation"].includes(game.status));
  const completedGames = state.games.filter((game) => game.status === "completed").slice(0, 8);

  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>New challenge</h2>
          <p class="muted">Find a player by name or contacts and send a challenge.</p>
        </div>
      </div>
      <div class="search-row">
        <div class="field" style="margin:0">
          <input data-search-input placeholder="Player name or contacts">
        </div>
        <button class="primary-button" data-search>Search</button>
      </div>
      <div class="list search-results" data-search-results style="margin-top:14px"></div>
    </section>

    <section class="grid-2">
      <div class="card panel">
        <div class="panel-header"><h3>Incoming challenges</h3></div>
        <div class="list">${incoming.length ? incoming.map(challengeCard).join("") : `<div class="empty">No new challenges.</div>`}</div>
      </div>
      <div class="card panel">
        <div class="panel-header"><h3>Sent challenges</h3></div>
        <div class="list">${outgoing.length ? outgoing.map(challengeCard).join("") : `<div class="empty">No pending challenges.</div>`}</div>
      </div>
    </section>

    <section class="card panel">
      <div class="panel-header"><h2>Active matches</h2></div>
      <div class="list">${openGames.length ? openGames.map(gameCard).join("") : `<div class="empty">No accepted matches yet.</div>`}</div>
    </section>

    <section class="card panel">
      <div class="panel-header"><h2>Recent results</h2></div>
      <div class="list">${completedGames.length ? completedGames.map(gameCard).join("") : `<div class="empty">Completed matches will appear here.</div>`}</div>
    </section>
  `;

  const searchInput = document.querySelector("[data-search-input]");
  document.querySelector("[data-search]").addEventListener("click", () => searchUsers({ allowEmpty: true }));
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchUsers();
  });
  wireChallengeButtons();
  wireGameButtons();
}

function challengeCard(challenge) {
  const other = challenge.fromUserId === state.me.id ? challenge.to : challenge.from;
  const direction = challenge.fromUserId === state.me.id ? "You challenged" : "Challenge from";
  const actions = challenge.toUserId === state.me.id
    ? `<button class="small-button" data-challenge-action="accept" data-id="${challenge.id}">Accept</button>
       <button class="small-button" data-challenge-action="decline" data-id="${challenge.id}">Decline</button>`
    : `<button class="small-button" data-challenge-action="cancel" data-id="${challenge.id}">Cancel</button>`;
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${direction}: ${escapeHtml(other?.name || "deleted player")}</div>
        <div class="row-meta">${escapeHtml(other?.rating || "-")} Elo &middot; ${fmtDate(challenge.createdAt)}</div>
      </div>
      <div class="row-actions">${actions}</div>
    </div>
  `;
}

function gameCard(game) {
  const players = game.players || [];
  const title = players.map((player) => player.id === state.me.id ? "You" : player.name).join(" vs ");
  const isParticipant = players.some((player) => player.id === state.me.id);
  const isPending = game.status === "pending_confirmation";
  const status = game.status === "completed" ? "completed" : isPending ? "pending" : "open";
  const result = game.status === "completed"
    ? resultSummary(game)
    : isPending
      ? pendingResultSummary(game)
      : "Waiting for Approved Ops result";
  const mainAction = isParticipant && game.status === "open"
    ? `<button class="primary-button" data-game-result="${game.id}">Enter result</button>`
    : isParticipant && isPending && game.pendingResult?.submittedBy === state.me.id
      ? `<button class="small-button" data-game-result="${game.id}">Edit result</button>`
      : isParticipant && isPending
        ? `<button class="primary-button" data-game-review="${game.id}">Review result</button>`
        : "";
  const canExit = isParticipant && (game.status === "open" || (isPending && game.pendingResult?.submittedBy === state.me.id));
  const exitAction = canExit
    ? `<button class="danger-button" data-game-exit="${game.id}">${isPending ? "Delete pending" : "Exit game"}</button>`
    : "";
  const detailsAction = game.status === "open"
    ? ""
    : `<button class="small-button" data-game-open="${game.id}">Details</button>`;
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-meta">${escapeHtml(result)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${status}">${game.status === "completed" ? "completed" : isPending ? "pending" : "active"}</span>
        ${detailsAction}
        ${mainAction}
        ${exitAction}
      </div>
    </div>
  `;
}

function pendingResultSummary(game) {
  const pending = game.pendingResult;
  const result = pending?.result;
  const players = game.players || [];
  const submitter = players.find((player) => player.id === pending?.submittedBy);
  if (!result) return "Result submitted. Waiting for confirmation.";
  const score = resultHeadline(game, result);
  const prefix = pending?.submittedBy === state.me.id
    ? "You submitted"
    : `${submitter?.name || "Opponent"} submitted`;
  return `${prefix}: ${score}. Waiting for confirmation.`;
}

function resultSummary(game) {
  const players = game.players || [];
  if (!game.result) return "Result saved";
  const score = resultHeadline(game, game.result);
  const eloParts = players.map((player) => `${player.name} ${signed(game.elo?.[player.id]?.delta ?? 0)}`);
  return `${score} - Elo ${eloParts.join(", ")}`;
}

async function loadFeedback() {
  if (!state.me?.isAdmin) return;
  try {
    const data = await api("/api/admin/feedback");
    state.feedback = data.feedback || [];
    state.feedbackError = "";
  } catch (err) {
    state.feedback = [];
    state.feedbackError = err.message;
  }
}

function renderFeedback() {
  const content = document.querySelector("[data-content]");
  const adminInbox = state.me.isAdmin && state.feedbackMode === "inbox";
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Feedback</h2>
          <p class="muted">Send a short note about a screen, bug, or improvement.</p>
        </div>
        ${state.me.isAdmin ? `
          <div class="row-actions">
            <button class="${adminInbox ? "ghost-button" : "primary-button"}" data-feedback-mode="form">Form</button>
            <button class="${adminInbox ? "primary-button" : "ghost-button"}" data-feedback-mode="inbox">Admin inbox</button>
          </div>
        ` : ""}
      </div>
      ${adminInbox ? feedbackInboxMarkup() : feedbackFormMarkup()}
      <div class="message" data-message></div>
    </section>
  `;

  document.querySelectorAll("[data-feedback-mode]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.feedbackMode = button.dataset.feedbackMode;
      if (state.feedbackMode === "inbox") await loadFeedback();
      renderFeedback();
    });
  });
  document.querySelector("[data-feedback-form]")?.addEventListener("submit", submitFeedback);
  wireFeedbackAdminActions();
}

function feedbackFormMarkup() {
  return `
    <form class="feedback-form" data-feedback-form>
      <div class="field">
        <label>Screen</label>
        <input name="screen" maxlength="80" placeholder="Example: Matchmaking" required>
      </div>
      <div class="field">
        <label>Description</label>
        <textarea name="description" maxlength="1200" rows="6" placeholder="What happened or what should be improved?" required></textarea>
      </div>
      <button class="primary-button" type="submit">Send feedback</button>
    </form>
  `;
}

function feedbackInboxMarkup() {
  if (state.feedbackError) {
    return `<div class="empty">Could not load feedback: ${escapeHtml(state.feedbackError)}</div>`;
  }
  if (!state.feedback.length) return `<div class="empty">No feedback yet.</div>`;
  return `
    <div class="list">
      ${state.feedback.map((item) => `
        <div class="row-card feedback-card">
          <div class="row-main">
            <div class="row-title">${escapeHtml(item.screen)}</div>
            <div class="row-meta">${escapeHtml(item.user?.name || "Deleted player")} &middot; ${fmtDate(item.createdAt)}</div>
            ${item.status === "resolved" ? `<div class="row-meta">Resolved${item.resolvedByUser?.name ? ` by ${escapeHtml(item.resolvedByUser.name)}` : ""}${item.resolvedAt ? ` &middot; ${fmtDate(item.resolvedAt)}` : ""}</div>` : ""}
            <p class="feedback-description">${escapeHtml(item.description)}</p>
          </div>
          <div class="row-actions">
            <span class="status ${item.status === "resolved" ? "completed" : "open"}">${escapeHtml(item.status || "open")}</span>
            <button class="small-button" data-feedback-status="${item.id}" data-status="${item.status === "resolved" ? "open" : "resolved"}">${item.status === "resolved" ? "Reopen" : "Resolve"}</button>
            <button class="danger-button" data-feedback-delete="${item.id}">Delete</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
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
      if (!window.confirm("Delete this feedback item?")) return;
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

async function submitFeedback(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await api("/api/feedback", {
      method: "POST",
      body: {
        screen: form.get("screen"),
        description: form.get("description")
      }
    });
    formElement?.reset();
    setMessage("Feedback sent. Thank you.");
  } catch (err) {
    setMessage(err.message, true);
  }
}

function scoreSummary(result, players) {
  const [a, b] = players;
  if (!a || !b || !result?.scores) return "Result saved";
  const scoreA = result.scores[a.id];
  const scoreB = result.scores[b.id];
  if (!scoreA || !scoreB) return "Result saved";
  const winner = result.winnerId ? players.find((p) => p.id === result.winnerId)?.name : "Draw";
  const tiebreak = result.tiebreakers?.decidedBy ? ` by ${tieBreakerLabel(result.tiebreakers.decidedBy)}` : "";
  return `${a.name} ${scoreA.total} - ${b.name} ${scoreB.total} - ${winner}${tiebreak}`;
}

function tieBreakerLabel(value) {
  return {
    primary: "Primary",
    critTac: "Crit Op + Tac Op",
    apl: "APL on table",
    rollOff: "Roll-off"
  }[value] || "Tie-breakers";
}

function getProfileStats() {
  const completedGames = state.games.filter((game) => game.status === "completed");
  const openGames = state.games.filter((game) => ["open", "pending_confirmation"].includes(game.status));
  const pendingIncoming = state.challenges.filter((item) => item.status === "pending" && item.toUserId === state.me.id);
  const pendingOutgoing = state.challenges.filter((item) => item.status === "pending" && item.fromUserId === state.me.id);
  const wins = completedGames.filter((game) => game.result?.winnerId === state.me.id).length;
  const draws = completedGames.filter((game) => game.result && !game.result.winnerId).length;
  const losses = completedGames.filter((game) => game.result?.winnerId && game.result.winnerId !== state.me.id).length;
  const eloDelta = completedGames.reduce((sum, game) => sum + Number(game.elo?.[state.me.id]?.delta || 0), 0);
  const winRate = completedGames.length ? Math.round((wins / completedGames.length) * 100) : 0;
  return { completedGames, openGames, pendingIncoming, pendingOutgoing, wins, draws, losses, eloDelta, winRate };
}

function renderProfile() {
  const content = document.querySelector("[data-content]");
  const stats = getProfileStats();
  const recentGames = stats.completedGames.slice(0, 5);
  const latestActiveMatchmaking = latestActiveMatchmakingItem(stats);
  const challengeProgress = ownChallengeProgress();
  content.innerHTML = `
    <section class="card panel profile-hero">
      <div class="profile-avatar">${avatarMarkup(state.me)}</div>
      <div class="profile-main">
        <p class="profile-label">Player profile</p>
        <h2>${escapeHtml(state.me.name)}</h2>
        <p class="muted">${state.me.isAdmin ? "Administrator" : "Player"} &middot; joined ${fmtDate(state.me.createdAt)}</p>
        ${profileInfoMarkup(state.me)}
      </div>
      <div class="profile-rating">
        <span>${state.me.rating}</span>
        <small>Elo</small>
      </div>
    </section>

    <section class="profile-grid">
      ${metricCard("Matches", stats.completedGames.length)}
      ${metricCard("Wins", stats.wins)}
      ${metricCard("Draws", stats.draws)}
      ${metricCard("Losses", stats.losses)}
      ${metricCard("Elo change", signed(stats.eloDelta))}
      ${metricCard("Win rate", `${stats.winRate}%`)}
    </section>

    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Profile settings</h2>
          <p class="muted">Update your avatar, nickname, or password.</p>
        </div>
      </div>
      <div class="settings-grid">
        <div class="settings-block">
          <h3>Avatar</h3>
          <div class="avatar-settings-row">
            <div class="profile-avatar compact-avatar" data-avatar-preview>${avatarMarkup(state.me)}</div>
            <div>
              <label class="primary-button custom-btn">Выберите файл
                <input class="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-input hidden>
              </label>
              <p class="muted small-note">PNG, JPG, WebP or GIF. Large images are resized automatically.</p>
              <div class="row-actions">
                <button class="small-button" data-remove-avatar type="button">Remove avatar</button>
              </div>
            </div>
          </div>
        </div>
        <form class="settings-block" data-profile-name-form>
          <h3>Nickname</h3>
          <div class="field">
            <label for="profile-name">Name</label>
            <input id="profile-name" name="name" value="${escapeHtml(state.me.name)}" required minlength="2" maxlength="24">
          </div>
          <button class="primary-button" type="submit">Save nickname</button>
        </form>
        <form class="settings-block" data-profile-contact-form>
          <h3>Contacts</h3>
          <div class="field">
            <label for="profile-register-nickname">Register Nickname</label>
            <input id="profile-register-nickname" name="registerNickname" value="${escapeHtml(state.me.registerNickname || "")}" maxlength="40" placeholder="Optional">
          </div>
          <div class="field">
            <label for="profile-telegram-contact">Telegram Contact</label>
            <input id="profile-telegram-contact" name="telegramContact" value="${escapeHtml(state.me.telegramContact || "")}" maxlength="80" placeholder="@username" required>
          </div>
          <button class="primary-button" type="submit">Save contacts</button>
        </form>
        <form class="settings-block" data-profile-password-form>
          <h3>Password</h3>
          <div class="field">
            <label for="current-password">Current password</label>
            <input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required>
          </div>
          <div class="field">
            <label for="new-password">New password</label>
            <input id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="6" required>
          </div>
          <button class="primary-button" type="submit">Change password</button>
        </form>
      </div>
      <div class="message" data-profile-message></div>
    </section>

    <section class="grid-2">
      <div class="card panel">
        <div class="panel-header">
          <div>
            <h3>Active matchmaking</h3>
            <p class="muted">${latestActiveMatchmaking ? "Latest active game or challenge." : "No active games or pending challenges."}</p>
          </div>
        </div>
        ${latestActiveMatchmaking ? activeMatchmakingPreview(latestActiveMatchmaking) : `<div class="empty">No active game or challenge.</div>`}
      </div>
      <div class="card panel">
        <div class="panel-header">
          <div>
            <h3>All Kill Team Challenge</h3>
            <p class="muted">Your ordered Kill Team win tracker.</p>
          </div>
        </div>
        ${profileChallengeNextCard(challengeProgress)}
      </div>
      <div class="card panel wide-panel">
        <div class="panel-header"><h3>Recent matches</h3></div>
        <div class="list">
          ${recentGames.length ? recentGames.map(gameCard).join("") : `<div class="empty">No completed matches yet.</div>`}
        </div>
      </div>
    </section>
  `;

  wireProfileSettings();
  wireGameButtons();
  wireOpenMatchmakingButton();
  wireChallengeProgressButtons();
}

function ownChallengeProgress() {
  return state.challengeProgress.find((item) => item.user.id === state.me.id) || null;
}

function profileChallengeNextCard(progress) {
  if (!progress) {
    return `
      <div class="empty">Challenge progress is loading.</div>
      <div class="row-actions profile-challenge-actions">
        <button class="small-button" data-profile-challenge-progress="${state.me.id}">Open challenge</button>
      </div>
    `;
  }

  const current = progress.teams.find((item) => item.status === "current");
  if (!current) {
    return `
      <div class="row-card profile-challenge-next-card">
        <div class="row-main">
          <p class="profile-label">Challenge complete</p>
          <div class="row-title">All ordered Kill Teams completed</div>
          <div class="row-meta">Progress ${progress.completedCount}/${progress.total}</div>
        </div>
        <div class="row-actions">
          <button class="small-button" data-profile-challenge-progress="${progress.user.id}">Open challenge</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="row-card profile-challenge-next-card">
      <div class="profile-challenge-next-main">
        <img class="profile-challenge-logo" src="${killTeamLogoSrc(current.team)}" alt="${escapeHtml(current.team)} logo">
        <div class="row-main">
          <p class="profile-label">Next Kill Team</p>
          <div class="row-title">${escapeHtml(current.team)}</div>
          <div class="row-meta">Progress ${progress.completedCount}/${progress.total}</div>
        </div>
      </div>
      <div class="row-actions">
        <button class="small-button" data-profile-challenge-progress="${progress.user.id}">Open challenge</button>
      </div>
    </div>
  `;
}

function wireOpenMatchmakingButton() {
  document.querySelector("[data-open-matchmaking]")?.addEventListener("click", async (event) => {
    const gameId = Number(event.currentTarget.dataset.gameId || 0);
    if (gameId) {
      await loadGames();
      const game = getKnownGame(gameId);
      if (game?.status === "open") {
        renderResultForm(gameId);
        return;
      }
      if (game?.status === "pending_confirmation") {
        if (game.pendingResult?.submittedBy === state.me.id) renderResultForm(gameId);
        else renderResultReview(gameId);
        return;
      }
      await openGameDetail(gameId);
      return;
    }
    state.view = "play";
    state.playerProfile = null;
    state.selectedGameId = null;
    renderShell();
  });
}

function latestActiveMatchmakingItem(stats) {
  const items = [
    ...stats.openGames.map((game) => ({
      type: "game",
      id: game.id,
      title: gameTitle(game),
      meta: game.status === "pending_confirmation" ? pendingResultSummary(game) : `Accepted match · ${fmtDate(game.createdAt)}`,
      at: game.submittedAt || game.updatedAt || game.createdAt
    })),
    ...stats.pendingIncoming.map((challenge) => ({
      type: "challenge",
      title: `Challenge from ${challenge.from?.name || "Player"}`,
      meta: `${challenge.from?.rating || "-"} Elo · ${fmtDate(challenge.createdAt)}`,
      at: challenge.updatedAt || challenge.createdAt
    })),
    ...stats.pendingOutgoing.map((challenge) => ({
      type: "challenge",
      title: `You challenged ${challenge.to?.name || "Player"}`,
      meta: `${challenge.to?.rating || "-"} Elo · ${fmtDate(challenge.createdAt)}`,
      at: challenge.updatedAt || challenge.createdAt
    }))
  ];
  return items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))[0] || null;
}

function activeMatchmakingPreview(item) {
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(item.title)}</div>
        <div class="row-meta">${escapeHtml(item.meta)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${item.type === "game" ? "open" : "pending"}">${item.type === "game" ? "active" : "pending"}</span>
        <button class="primary-button" data-open-matchmaking ${item.type === "game" ? `data-game-id="${item.id}"` : ""}>Open</button>
      </div>
    </div>
  `;
}

function renderPlayerProfile() {
  const content = document.querySelector("[data-content]");
  const profile = state.playerProfile;
  if (!profile?.user) {
    content.innerHTML = `<section class="card panel"><div class="empty">Player profile is loading.</div></section>`;
    return;
  }

  const user = profile.user;
  const stats = profile.stats || {};
  const recentGames = profile.recentGames || [];
  const challengeProgress = profile.challengeProgress || state.challengeProgress.find((item) => item.user.id === user.id) || null;
  const activeMatchup = profile.activeMatchup || {};
  const activeGame = activeMatchup.game || activeGameWith(user.id);
  const pendingChallenge = activeMatchup.challenge || pendingChallengeWith(user.id);
  const challengeButton = user.id === state.me.id
    ? ""
    : activeGame
      ? `<button class="primary-button game-challenge-button" data-profile-game="${activeGame.id}">Open game</button>`
      : `<button class="primary-button game-challenge-button" data-profile-challenge="${user.id}" ${pendingChallenge ? "disabled" : ""}>${pendingChallenge ? "Challenge pending" : "Challenge to Play"}</button>`;

  content.innerHTML = `
    <section class="card panel profile-hero">
      <div class="profile-avatar">${avatarMarkup(user)}</div>
      <div class="profile-main">
        <p class="profile-label">Player profile</p>
        <h2>${escapeHtml(user.name)}</h2>
        <p class="muted">Player &middot; joined ${fmtDate(user.createdAt)}</p>
        ${profileInfoMarkup(user)}
      </div>
      <div class="profile-rating">
        <span>${user.rating}</span>
        <small>Elo</small>
      </div>
    </section>

    <section class="profile-grid">
      ${metricCard("Matches", stats.matches || 0)}
      ${metricCard("Wins", stats.wins || 0)}
      ${metricCard("Draws", stats.draws || 0)}
      ${metricCard("Losses", stats.losses || 0)}
      ${metricCard("Elo change", signed(stats.eloDelta || 0))}
      ${metricCard("Win rate", `${stats.winRate || 0}%`)}
    </section>

    <section class="grid-2">
      ${profileContactsCard(user)}
      <div class="card panel">
        <div class="panel-header">
          <h3 class="icon-heading">${crossedSwordsIcon()}<span>Game challenges</span></h3>
        </div>
        <div class="game-challenge-card-body">
          <img class="game-challenge-logo" src="/game-challenge-logo.png?v=20260706-large-logo-1" alt="Game challenge logo">
          <div class="row-actions game-challenge-actions">
            ${challengeButton}
          </div>
        </div>
        <div class="message" data-player-profile-message></div>
      </div>
      ${state.me.isAdmin ? adminPendingGamesCard(profile) : ""}
      <div class="card panel">
        <div class="panel-header">
          <div>
            <h3>All Kill Team Challenge</h3>
            <p class="muted">Ordered Kill Team win tracker.</p>
          </div>
        </div>
        ${profileChallengeNextCard(challengeProgress)}
      </div>
      <div class="card panel wide-panel">
        <div class="panel-header">
          <div>
            <h3>Recent matches</h3>
            <p class="muted">Completed matches for this player.</p>
          </div>
          <button class="ghost-button" data-back-leaderboard>Leaderboard</button>
        </div>
        <div class="list">
          ${recentGames.length ? recentGames.map(gameCard).join("") : `<div class="empty">No completed matches yet.</div>`}
        </div>
      </div>
    </section>
  `;

  document.querySelector("[data-back-leaderboard]").addEventListener("click", async () => {
    state.view = "top";
    state.playerProfile = null;
    await loadTop();
    renderShell();
  });

  document.querySelector("[data-profile-challenge]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await sendChallengeToUser(Number(button.dataset.profileChallenge));
      await loadPlayerProfile(user.id);
      renderShell();
      setPlayerProfileMessage("Challenge sent.");
    } catch (err) {
      button.disabled = false;
      setPlayerProfileMessage(err.message, true);
    }
  });
  document.querySelector("[data-profile-game]")?.addEventListener("click", async (event) => {
    await openGameDetail(Number(event.currentTarget.dataset.profileGame));
  });
  wireAdminPendingGameButtons(user.id);
  wireGameButtons();
  wireChallengeProgressButtons();
}

function adminPendingGamesCard(profile) {
  const games = profile.pendingGames || [];
  return `
    <div class="card panel">
      <div class="panel-header">
        <div>
          <h3>Pending games</h3>
          <p class="muted">Admin tools for unconfirmed submitted results.</p>
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
              <button class="small-button" data-admin-pending-open="${game.id}">Open</button>
              <button class="danger-button" data-admin-pending-delete="${game.id}">Delete</button>
            </div>
          </div>
        `).join("") : `<div class="empty">No pending games.</div>`}
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
      await adminDeletePendingGame(Number(button.dataset.adminPendingDelete), profileUserId);
    });
  });
}

function wireProfileSettings() {
  const avatarInput = document.querySelector("[data-avatar-input]");
  const removeAvatar = document.querySelector("[data-remove-avatar]");
  const nameForm = document.querySelector("[data-profile-name-form]");
  const contactForm = document.querySelector("[data-profile-contact-form]");
  const passwordForm = document.querySelector("[data-profile-password-form]");

  avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;
    try {
      setProfileMessage("Preparing avatar...");
      const avatarData = await compressAvatar(file);
      await updateProfile({ avatarData }, "Avatar updated.");
    } catch (err) {
      setProfileMessage(err.message, true);
    } finally {
      avatarInput.value = "";
    }
  });

  removeAvatar?.addEventListener("click", async () => {
    await updateProfile({ avatarData: null }, "Avatar removed.");
  });

  nameForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(nameForm);
    await updateProfile({ name: form.get("name") }, "Nickname updated.");
  });

  contactForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(contactForm);
    await updateProfile({
      registerNickname: form.get("registerNickname"),
      telegramContact: form.get("telegramContact")
    }, "Contacts updated.");
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(passwordForm);
    await updateProfile({
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword")
    }, "Password changed.");
  });
}

async function compressAvatar(file) {
  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Use PNG, JPG, WebP, or GIF.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Avatar image must be 8 MB or smaller.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const size = 384;
  canvas.width = size;
  canvas.height = size;

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image file.");
  }

  const cropSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.round((sourceWidth - cropSize) / 2);
  const sourceY = Math.round((sourceHeight - cropSize) / 2);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
  return blobToDataUrl(blob);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image file."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not prepare avatar image."));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not prepare avatar image."));
    reader.readAsDataURL(blob);
  });
}

async function updateProfile(body, successMessage) {
  try {
    const data = await api("/api/me", { method: "PATCH", body });
    state.me = data.user;
    state.challenges = data.challenges || [];
    state.games = data.games || [];
    renderShell();
    setProfileMessage(successMessage);
  } catch (err) {
    setProfileMessage(err.message, true);
  }
}

function pendingChallengeWith(userId) {
  return (state.challenges || []).find((challenge) =>
    challenge.status === "pending" &&
    ((challenge.fromUserId === state.me.id && challenge.toUserId === userId) ||
      (challenge.fromUserId === userId && challenge.toUserId === state.me.id))
  ) || null;
}

function activeGameWith(userId) {
  return (state.games || []).find((game) =>
    ["open", "pending_confirmation"].includes(game.status) &&
    (game.playerIds || []).includes(state.me.id) &&
    (game.playerIds || []).includes(userId)
  ) || null;
}

async function loadPlayerProfile(userId) {
  state.playerProfile = await api(`/api/users/${Number(userId)}`);
}

async function openPlayerProfile(userId) {
  const id = Number(userId);
  if (id === state.me.id) {
    state.view = "profile";
    state.playerProfile = null;
    renderShell();
    return;
  }
  await loadPlayerProfile(id);
  state.view = "player";
  renderShell();
}

async function sendChallengeToUser(userId) {
  await api("/api/challenges", { method: "POST", body: { toUserId: Number(userId) } });
  await refresh();
}

async function loadChallengeProgress() {
  try {
    const data = await api("/api/challenge-progress");
    state.challengeProgress = data.users || [];
    state.challengeError = "";
    if (!state.selectedChallengeUserId) state.selectedChallengeUserId = state.me.id;
  } catch (err) {
    state.challengeProgress = [];
    state.challengeError = err.message;
  }
}

function selectedChallengeProgress() {
  return state.challengeProgress.find((item) => item.user.id === Number(state.selectedChallengeUserId)) ||
    state.challengeProgress.find((item) => item.user.id === state.me.id) ||
    state.challengeProgress[0] ||
    null;
}

async function openChallengeProgress(userId) {
  state.selectedChallengeUserId = Number(userId);
  state.challengeOpenedFromProfile = true;
  state.view = "challenge";
  await loadChallengeProgress();
  renderShell();
}

function wireChallengeProgressButtons() {
  document.querySelectorAll("[data-profile-challenge-progress]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openChallengeProgress(Number(button.dataset.profileChallengeProgress));
    });
  });
}

async function loadGames() {
  try {
    const data = await api("/api/games");
    state.allGames = data.games || [];
    state.gamesError = "";
  } catch (err) {
    state.allGames = [];
    state.gamesError = err.message;
  }
}

function getKnownGame(gameId) {
  const id = Number(gameId);
  return (state.allGames || []).find((game) => game.id === id) ||
    (state.games || []).find((game) => game.id === id) ||
    (state.playerProfile?.pendingGames || []).find((game) => game.id === id) ||
    (state.playerProfile?.activeMatchup?.game?.id === id ? state.playerProfile.activeMatchup.game : null) ||
    (state.playerProfile?.recentGames || []).find((game) => game.id === id) ||
    null;
}

async function openGameDetail(gameId) {
  await loadGames();
  state.selectedGameId = Number(gameId);
  state.view = "gameDetail";
  renderShell();
}

function renderGames() {
  const content = document.querySelector("[data-content]");
  const completedGames = state.allGames.filter((game) => game.status === "completed");
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Games</h2>
          <p class="muted">Latest completed games from every player.</p>
        </div>
      </div>
      <div class="list">
        ${state.gamesError
          ? `<div class="empty">Could not load games: ${escapeHtml(state.gamesError)}. Restart the local server and refresh the page.</div>`
          : completedGames.length ? completedGames.map(gameCard).join("") : `<div class="empty">No completed games yet.</div>`}
      </div>
    </section>
  `;
  wireGameButtons();
}

function renderStatistics() {
  const content = document.querySelector("[data-content]");
  const games = state.allGames || [];
  const killTeamSummary = killTeamWinrateSummary(games);
  const statisticsContent = state.statisticsTab === "teams"
    ? state.selectedStatisticsTeam
      ? renderTeamDetail(teamDetailSummary(state.selectedStatisticsTeam, games))
      : renderTeamCards(killTeamSummary)
    : state.statisticsTab === "tacOpWinrates"
      ? renderTacOpWinrates(tacOpWinrateSummary(games))
      : renderKillTeamWinrates(killTeamSummary);
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Stats</h2>
          <p class="muted">Aggregated tournament data from completed games.</p>
        </div>
      </div>
      <div class="tabs stats-tabs">
        <button class="tab ${state.statisticsTab === "killTeamWinrates" ? "active" : ""}" data-statistics-tab="killTeamWinrates">Kill Team Winrates</button>
        <button class="tab ${state.statisticsTab === "tacOpWinrates" ? "active" : ""}" data-statistics-tab="tacOpWinrates">Tac Ops Winrates</button>
        <button class="tab ${state.statisticsTab === "teams" ? "active" : ""}" data-statistics-tab="teams">Teams</button>
      </div>
      ${state.gamesError
        ? `<div class="empty">Could not load stats: ${escapeHtml(state.gamesError)}. Restart the local server and refresh the page.</div>`
        : statisticsContent}
    </section>
  `;
  document.querySelectorAll("[data-statistics-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statisticsTab = button.dataset.statisticsTab;
      state.selectedStatisticsTeam = null;
      renderStatistics();
    });
  });
  wireTeamStatistics();
}

function renderKillTeamWinrates(summary) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kill Team</th>
            <th>Games</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Draws</th>
            <th>Winrate</th>
          </tr>
        </thead>
        <tbody>
          ${summary.rows.length
            ? summary.rows.map((row) => `
              <tr>
                <td><button class="text-link-button" data-stat-team="${escapeHtml(row.team)}">${escapeHtml(row.team)}</button></td>
                <td>${row.games}</td>
                <td>${row.wins}</td>
                <td>${row.losses}</td>
                <td>${row.draws}</td>
                <td><span class="rating-pill stat-rate">${row.winRate}%</span></td>
              </tr>
            `).join("")
            : `<tr><td colspan="6">No completed non-mirror games with Kill Team data yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderTacOpWinrates(summary) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Tac Op</th>
            <th>Games</th>
            <th>Wins</th>
            <th>Winrate</th>
            <th>Avg VP</th>
            <th>Avg VP as Primary</th>
          </tr>
        </thead>
        <tbody>
          ${summary.rows.length
            ? summary.rows.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.tacOp)}</strong></td>
                <td>${row.games}</td>
                <td>${row.wins}</td>
                <td><span class="rating-pill stat-rate">${row.winRate}%</span></td>
                <td>${row.avgPoints}</td>
                <td>${row.avgPrimaryPoints}</td>
              </tr>
            `).join("")
            : `<tr><td colspan="6">No completed games with Tac Op data yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderTeamCards(summary) {
  return `
    <div class="team-card-grid">
      ${summary.rows.length
        ? summary.rows.map((row) => `
          <button class="team-stat-card" data-stat-team="${escapeHtml(row.team)}">
            <img class="team-stat-logo" src="${killTeamLogoSrc(row.team)}" alt="">
            <span>${row.games} games</span>
            <strong>${escapeHtml(row.team)}</strong>
            <div class="team-stat-rate">${row.winRate}%</div>
          </button>
        `).join("")
        : `<div class="empty">No completed non-mirror games with Kill Team data yet.</div>`}
    </div>
  `;
}

function renderTeamDetail(detail) {
  return `
    <div class="team-detail">
      <div class="team-detail-hero">
        <button class="small-button" data-team-back>Teams</button>
        <img class="team-detail-logo" src="${killTeamLogoSrc(detail.team)}" alt="">
        <div class="team-detail-main">
          <p class="profile-label">Kill Team</p>
          <h3>${escapeHtml(detail.team)}</h3>
          <p class="muted">${detail.games} games · ${detail.wins} wins · ${detail.losses} losses · ${detail.draws} draws</p>
        </div>
        <div class="profile-rating team-detail-rate">
          <span>${detail.winRate}%</span>
          <small>Winrate</small>
        </div>
        <a class="small-button" href="${killTeamRulesUrl(detail.team)}" target="_blank" rel="noreferrer">Rules</a>
      </div>

      <section class="grid-2 team-detail-grid">
        <div class="team-detail-section">
          <div class="panel-header"><h3>Recent games</h3></div>
          <div class="list">
            ${detail.recentGames.length
              ? detail.recentGames.map((item) => teamRecentGameCard(item)).join("")
              : `<div class="empty">No completed games on this Kill Team yet.</div>`}
          </div>
        </div>
        <div class="team-detail-section">
          <div class="panel-header"><h3>Best players</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Games</th><th>Wins</th><th>Winrate</th></tr></thead>
              <tbody>
                ${detail.players.length
                  ? detail.players.map((row) => `
                    <tr>
                      <td><strong>${escapeHtml(row.name)}</strong></td>
                      <td>${row.games}</td>
                      <td>${row.wins}</td>
                      <td><span class="rating-pill stat-rate">${row.winRate}%</span></td>
                    </tr>
                  `).join("")
                  : `<tr><td colspan="4">No player data yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="team-detail-section">
        <div class="panel-header"><h3>Matchups</h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Opponent</th><th>Games</th><th>Wins</th><th>Losses</th><th>Draws</th><th>Winrate</th></tr></thead>
            <tbody>
              ${detail.matchups.length
                ? detail.matchups.map((row) => `
                  <tr>
                    <td><strong>${escapeHtml(row.team)}</strong></td>
                    <td>${row.games}</td>
                    <td>${row.wins}</td>
                    <td>${row.losses}</td>
                    <td>${row.draws}</td>
                    <td><span class="rating-pill stat-rate">${row.winRate}%</span></td>
                  </tr>
                `).join("")
                : `<tr><td colspan="6">No non-mirror matchup data yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function killTeamWinrateSummary(games) {
  const stats = new Map();
  const completedGames = games.filter((item) => item.status === "completed" && item.result);
  const totalGames = completedGames.length;
  let countedGames = 0;
  let mirrorGames = 0;
  let skippedGames = 0;

  for (const game of completedGames) {
    const players = game.players || [];
    if (players.length < 2) {
      skippedGames += 1;
      continue;
    }
    const [a, b] = players;
    const scoreA = game.result.scores?.[a.id] || {};
    const scoreB = game.result.scores?.[b.id] || {};
    const teamA = canonicalKillTeamName(scoreA.faction || scoreA.killTeam || scoreA.team);
    const teamB = canonicalKillTeamName(scoreB.faction || scoreB.killTeam || scoreB.team);
    if (!teamA || !teamB) {
      skippedGames += 1;
      continue;
    }
    if (teamA === teamB) {
      mirrorGames += 1;
      continue;
    }

    countedGames += 1;
    const winnerId = game.result.winnerId ? Number(game.result.winnerId) : null;
    addKillTeamStat(stats, teamA, winnerId, a.id);
    addKillTeamStat(stats, teamB, winnerId, b.id);
  }

  const rows = Array.from(stats.values()).map((row) => ({
    ...row,
    winRate: row.games ? Math.round((row.wins / row.games) * 100) : 0
  })).sort((a, b) =>
    b.winRate - a.winRate ||
    b.wins - a.wins ||
    b.games - a.games ||
    a.team.localeCompare(b.team)
  );

  return { rows, totalGames, countedGames, mirrorGames, skippedGames };
}

function tacOpWinrateSummary(games) {
  const stats = new Map();
  const completedGames = games.filter((item) => item.status === "completed" && item.result);
  let totalPicks = 0;

  for (const game of completedGames) {
    const winnerId = game.result.winnerId ? Number(game.result.winnerId) : null;
    for (const player of game.players || []) {
      const score = game.result.scores?.[player.id] || {};
      const tacOp = canonicalTacOpName(score.tacOp);
      if (!tacOp) continue;

      totalPicks += 1;
      if (!stats.has(tacOp)) {
        stats.set(tacOp, { tacOp, games: 0, wins: 0, points: 0, primaryGames: 0, primaryPoints: 0 });
      }
      const row = stats.get(tacOp);
      const tacVp = statNumber(score.tac);
      row.games += 1;
      row.points += tacVp;
      if (winnerId === Number(player.id)) row.wins += 1;
      if (score.primary === "tac") {
        const primaryBonus = score.primaryBonus !== undefined ? statNumber(score.primaryBonus) : Math.ceil(tacVp / 2);
        row.primaryGames += 1;
        row.primaryPoints += tacVp + primaryBonus;
      }
    }
  }

  const rows = Array.from(stats.values()).map((row) => ({
    ...row,
    winRate: row.games ? Math.round((row.wins / row.games) * 100) : 0,
    avgPoints: formatAverage(row.games ? row.points / row.games : 0),
    avgPrimaryPoints: row.primaryGames ? formatAverage(row.primaryPoints / row.primaryGames) : "-"
  })).sort((a, b) =>
    b.winRate - a.winRate ||
    b.wins - a.wins ||
    b.games - a.games ||
    Number.parseFloat(b.avgPoints) - Number.parseFloat(a.avgPoints) ||
    a.tacOp.localeCompare(b.tacOp)
  );

  return { rows, totalGames: completedGames.length, totalPicks };
}

function teamDetailSummary(team, games) {
  const targetTeam = canonicalKillTeamName(team);
  const playerStats = new Map();
  const matchupStats = new Map();
  const recentGames = [];
  const totals = { games: 0, wins: 0, losses: 0, draws: 0 };

  for (const game of games.filter((item) => item.status === "completed" && item.result)) {
    const players = game.players || [];
    if (players.length < 2) continue;
    const [playerA, playerB] = players;
    const scoreA = game.result.scores?.[playerA.id] || {};
    const scoreB = game.result.scores?.[playerB.id] || {};
    const teamA = canonicalKillTeamName(scoreA.faction || scoreA.killTeam || scoreA.team);
    const teamB = canonicalKillTeamName(scoreB.faction || scoreB.killTeam || scoreB.team);
    if (!teamA || !teamB) continue;

    const entries = [
      { player: playerA, score: scoreA, team: teamA, opponent: playerB, opponentScore: scoreB, opponentTeam: teamB },
      { player: playerB, score: scoreB, team: teamB, opponent: playerA, opponentScore: scoreA, opponentTeam: teamA }
    ].filter((entry) => entry.team === targetTeam);

    for (const entry of entries) {
      const result = teamEntryResult(game, entry.player.id);
      totals.games += 1;
      totals.wins += result === "win" ? 1 : 0;
      totals.losses += result === "loss" ? 1 : 0;
      totals.draws += result === "draw" ? 1 : 0;

      if (!playerStats.has(entry.player.id)) {
        playerStats.set(entry.player.id, { id: entry.player.id, name: entry.player.name, games: 0, wins: 0, losses: 0, draws: 0 });
      }
      addRecord(playerStats.get(entry.player.id), result);

      if (entry.opponentTeam !== targetTeam) {
        if (!matchupStats.has(entry.opponentTeam)) {
          matchupStats.set(entry.opponentTeam, { team: entry.opponentTeam, games: 0, wins: 0, losses: 0, draws: 0 });
        }
        addRecord(matchupStats.get(entry.opponentTeam), result);
      }

      recentGames.push({
        game,
        player: entry.player,
        opponent: entry.opponent,
        score: entry.score,
        opponentScore: entry.opponentScore,
        opponentTeam: entry.opponentTeam,
        result
      });
    }
  }

  const withWinRate = (row) => ({
    ...row,
    winRate: row.games ? Math.round((row.wins / row.games) * 100) : 0
  });

  return {
    team: targetTeam,
    ...withWinRate(totals),
    recentGames: recentGames.sort((a, b) =>
      String(b.game.submittedAt || b.game.createdAt).localeCompare(String(a.game.submittedAt || a.game.createdAt))
    ),
    players: Array.from(playerStats.values()).map(withWinRate).sort(statRowSort).slice(0, 10),
    matchups: Array.from(matchupStats.values()).map(withWinRate).sort(statRowSort)
  };
}

function teamEntryResult(game, playerId) {
  const winnerId = game.result?.winnerId ? Number(game.result.winnerId) : null;
  if (!winnerId) return "draw";
  return winnerId === Number(playerId) ? "win" : "loss";
}

function addRecord(row, result) {
  row.games += 1;
  if (result === "win") row.wins += 1;
  else if (result === "loss") row.losses += 1;
  else row.draws += 1;
}

function statRowSort(a, b) {
  return b.winRate - a.winRate ||
    b.wins - a.wins ||
    b.games - a.games ||
    String(a.name || a.team).localeCompare(String(b.name || b.team));
}

function teamRecentGameCard(item) {
  const score = approvedTotal(item.score);
  const opponentScore = approvedTotal(item.opponentScore);
  const resultLabel = item.result === "win" ? "Won" : item.result === "loss" ? "Lost" : "Draw";
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(item.player.name)} vs ${escapeHtml(item.opponent.name)}</div>
        <div class="row-meta">${resultLabel}, ${score}-${opponentScore} · vs ${escapeHtml(item.opponentTeam)} · ${fmtDate(item.game.submittedAt || item.game.createdAt)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${item.result === "win" ? "completed" : item.result === "loss" ? "pending" : "open"}">${item.result}</span>
        <button class="small-button" data-game-open="${item.game.id}">Details</button>
      </div>
    </div>
  `;
}

function killTeamRulesUrl(team) {
  const slugs = {
    "Angels of Death": "angel-of-death",
    "Brood Brothers": "brood-brother",
    "Elucidian Starstriders": "elucidian-starstrider",
    "Fellgor Ravagers": "fellgor-ravager",
    "Goremongers": "goremonger",
    "Hearthkyn Salvagers": "hearthkyn-salvager",
    "Hernkyn Yaegirs": "hernkyn-yaegir",
    "Inquisitorial Agents": "inquisitorial-agent",
    "Navy Breachers": "imperial-navy-breacher",
    "Tempestus Aquilons": "tempestus-aquilons",
    "Void-dancer Troupe": "void-dancer-troupe",
    "XV26 Stealth Battlesuits": "xv26-stealth-battlesuits"
  };
  const slug = slugs[team] || statKey(team).replace(/\s+/g, "-");
  return `https://wahapedia.ru/kill-team3/kill-teams/${slug}/`;
}

function wireTeamStatistics() {
  document.querySelectorAll("[data-stat-team]").forEach((button) => {
    button.addEventListener("click", () => {
      state.statisticsTab = "teams";
      state.selectedStatisticsTeam = button.dataset.statTeam;
      renderStatistics();
    });
  });
  document.querySelector("[data-team-back]")?.addEventListener("click", () => {
    state.selectedStatisticsTeam = null;
    renderStatistics();
  });
  wireGameButtons();
}

function addKillTeamStat(stats, team, winnerId, playerId) {
  if (!stats.has(team)) stats.set(team, { team, games: 0, wins: 0, losses: 0, draws: 0 });
  const row = stats.get(team);
  row.games += 1;
  if (!winnerId) {
    row.draws += 1;
  } else if (winnerId === Number(playerId)) {
    row.wins += 1;
  } else {
    row.losses += 1;
  }
}

function statNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatAverage(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function statKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[`']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalKillTeamName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = statKey(raw);
  return killTeamAliases.get(key) || killTeamOptions.find((item) => statKey(item) === key) || raw;
}

function validKillTeamName(value) {
  const canonical = canonicalKillTeamName(value);
  return killTeamOptions.includes(canonical) ? canonical : "";
}

function canonicalTacOpName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = statKey(raw);
  return tacOpOptions.find((item) => statKey(item) === key) || raw;
}

function renderChallenge() {
  const content = document.querySelector("[data-content]");
  const selected = selectedChallengeProgress();
  const activeProgress = selected ? challengeTrackProgress(selected) : null;
  const subtitle = selected?.user?.id === state.me.id
    ? "Your personal All Kill Team Challenge progress."
    : `Challenge progress for ${selected ? escapeHtml(selected.user.name) : "this player"}.`;
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>All Kill Team Challenge</h2>
          <p class="muted">${subtitle} Win with each Kill Team in order. Wildcards can be completed at any time.</p>
        </div>
      </div>
      <div class="tabs stats-tabs">
        <button class="tab ${state.challengeTab === "classified" ? "active" : ""}" data-challenge-tab="classified">Classified</button>
        <button class="tab ${state.challengeTab === "allKillTeam" ? "active" : ""}" data-challenge-tab="allKillTeam">All Kill Team</button>
      </div>
      ${state.challengeError ? `<div class="empty">Could not load challenge progress: ${escapeHtml(state.challengeError)}</div>` : ""}
    </section>
    ${activeProgress ? challengeDetail(activeProgress) : ""}
  `;

  document.querySelectorAll("[data-challenge-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.challengeTab = button.dataset.challengeTab;
      renderChallenge();
    });
  });
  document.querySelectorAll("[data-credit-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminChallengeCredit(Number(button.dataset.creditUser), button.dataset.creditTeam, "credit");
    });
  });
  document.querySelectorAll("[data-remove-credit-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminChallengeCredit(Number(button.dataset.removeCreditUser), button.dataset.removeCreditTeam, "remove");
    });
  });
}

function challengeTrackProgress(progress) {
  if (state.challengeTab === "classified") {
    return moveChallengeTeamToEnd(progress?.tracks?.classified || classifiedFallbackProgress(progress), "Spectre Squad");
  }
  return moveChallengeTeamToEnd(progress?.tracks?.allKillTeam || allKillTeamFallbackProgress(progress), "Spectre Squad");
}

function classifiedFallbackProgress(progress) {
  if (!progress || progress.teams?.some((item) => item.team === "Spectre Squad")) return progress;
  return appendTeamsToChallengeProgress(progress, classifiedChallengeExtraTeams);
}

function allKillTeamFallbackProgress(progress) {
  if (!progress) return null;
  const teams = uniqueList([
    ...allKillTeamExtraTeams,
    ...(progress.teams || []).map((item) => item.team),
    ...classifiedChallengeExtraTeams
  ]).filter((team) => !challengeWildcardTeams.includes(team));
  const completedByTeam = new Map((progress.completed || []).map((item) => [item.team, item]));
  const wildcardCompletedByTeam = new Map((progress.wildcardCompleted || []).map((item) => [item.team, item]));
  const completedTeams = new Set([...completedByTeam.keys()].filter((team) => teams.includes(team)));
  const completedWildcards = new Set([...wildcardCompletedByTeam.keys()].filter((team) => challengeWildcardTeams.includes(team)));
  const nextIndex = teams.findIndex((team) => !completedTeams.has(team));
  const currentIndex = nextIndex === -1 ? teams.length : nextIndex;
  return {
    ...progress,
    total: teams.length,
    completedCount: completedTeams.size,
    nextTeam: teams[currentIndex] || null,
    teams: teams.map((team, index) => ({
      order: index + 1,
      team,
      status: completedTeams.has(team) ? "completed" : index === currentIndex ? "current" : "locked",
      credit: completedByTeam.get(team) || null
    })),
    wildcards: challengeWildcardTeams.map((team) => ({
      team,
      status: completedWildcards.has(team) ? "completed" : "available",
      credit: wildcardCompletedByTeam.get(team) || null
    }))
  };
}

function moveChallengeTeamToEnd(progress, teamName) {
  if (!progress?.teams?.some((item) => item.team === teamName)) return progress;
  const teams = [
    ...progress.teams.filter((item) => item.team !== teamName),
    ...progress.teams.filter((item) => item.team === teamName)
  ];
  const completedTeams = new Set(teams.filter((item) => item.status === "completed").map((item) => item.team));
  const currentIndex = teams.findIndex((item) => !completedTeams.has(item.team));
  return {
    ...progress,
    nextTeam: currentIndex === -1 ? null : teams[currentIndex].team,
    teams: teams.map((item, index) => ({
      ...item,
      order: index + 1,
      status: completedTeams.has(item.team) ? "completed" : index === currentIndex ? "current" : "locked"
    }))
  };
}

function appendTeamsToChallengeProgress(progress, extraTeams) {
  const teams = uniqueList([...(progress.teams || []).map((item) => item.team), ...extraTeams]);
  const completedByTeam = new Map((progress.completed || []).map((item) => [item.team, item]));
  const completedTeams = new Set([...completedByTeam.keys()].filter((team) => teams.includes(team)));
  const nextIndex = teams.findIndex((team) => !completedTeams.has(team));
  const currentIndex = nextIndex === -1 ? teams.length : nextIndex;
  return {
    ...progress,
    total: teams.length,
    completedCount: completedTeams.size,
    nextTeam: teams[currentIndex] || null,
    teams: teams.map((team, index) => ({
      order: index + 1,
      team,
      status: completedTeams.has(team) ? "completed" : index === currentIndex ? "current" : "locked",
      credit: completedByTeam.get(team) || null
    }))
  };
}

function uniqueList(items) {
  return items.reduce((list, item) => {
    if (item && !list.includes(item)) list.push(item);
    return list;
  }, []);
}

function challengeUserCard(progress) {
  const selected = Number(state.selectedChallengeUserId) === progress.user.id;
  const percent = progress.total ? Math.round((progress.completedCount / progress.total) * 100) : 0;
  const wildcards = progress.wildcards.filter((item) => item.status === "completed").length;
  return `
    <button class="challenge-user-card ${selected ? "active" : ""}" data-challenge-user="${progress.user.id}">
      <span>${escapeHtml(progress.user.name)}</span>
      <strong>${progress.completedCount}/${progress.total}</strong>
      <small>${percent}% &middot; next: ${escapeHtml(progress.nextTeam || "Complete")} &middot; wildcards ${wildcards}/${progress.wildcards.length}</small>
    </button>
  `;
}

function challengeDetail(progress) {
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${escapeHtml(progress.user.name)}</h2>
          <p class="muted">Progress ${progress.completedCount}/${progress.total}${progress.nextTeam ? ` &middot; next: ${escapeHtml(progress.nextTeam)}` : " &middot; challenge complete"}</p>
        </div>
        ${canEditChallengeProgress(progress) ? adminChallengeActions(progress) : ""}
      </div>
      <div class="challenge-track">
        ${progress.teams.map((item) => challengeTeamCard(item, false, progress.user.id)).join("")}
      </div>
      ${progress.wildcards?.length ? `<div class="panel-header challenge-subheader">
        <div>
          <h3>Wildcards</h3>
          <p class="muted">These can be completed at any time.</p>
        </div>
      </div>
      <div class="challenge-track wildcard-track">
        ${progress.wildcards.map((item) => challengeTeamCard(item, true, progress.user.id)).join("")}
      </div>` : ""}
      <div class="message" data-message></div>
    </section>
  `;
}

function canEditChallengeProgress(progress) {
  if (!state.me.isAdmin) return false;
  if (progress.user.id === state.me.id) return true;
  return state.challengeOpenedFromProfile;
}

function adminChallengeActions(progress) {
  const current = progress.teams.find((item) => item.status === "current");
  return `
    <div class="row-actions">
      ${current ? `<button class="primary-button" data-credit-user="${progress.user.id}" data-credit-team="${escapeHtml(current.team)}">Credit next</button>` : ""}
      ${progress.wildcards.filter((item) => item.status !== "completed").map((item) => `
        <button class="small-button" data-credit-user="${progress.user.id}" data-credit-team="${escapeHtml(item.team)}">Credit ${escapeHtml(item.team)}</button>
      `).join("")}
    </div>
  `;
}

function killTeamLogoSrc(team) {
  const logoFiles = {
    "Elucidian Starstriders": "Elucidian Starstriders.png",
    "Navy Breachers": "Imperial Navy Breachers.png",
    "Tempestus Aquilons": "Tempestus Aquilons.png",
    "Tempestus Aquillons": "Tempestus Aquilons.png",
    "Void-dancer Troupe": "Void-Dancer Troupe.png",
    "Void-Dancer Troupe": "Void-Dancer Troupe.png",
    "Warp Coven": "Warpcoven.png",
    "Warpcoven": "Warpcoven.png",
    "XV26 Stealth Suits": "XV26 Stealth Battlesuits.png"
  };
  const fileName = logoFiles[team] || `${team}.png`;
  return `/kill-team-logos/${encodeURIComponent(fileName)}`;
}

function challengeTeamCard(item, wildcard = false, userId = null) {
  const credit = item.credit;
  const meta = credit
    ? `${credit.source === "manual" ? "Manual credit" : `Game #${credit.gameId}`} - ${fmtDate(credit.at)}`
    : item.status === "current" ? "Current target" : item.status === "available" ? "Available anytime" : "Locked";
  const canEdit = userId && canEditChallengeProgress({ user: { id: userId } });
  const adminAction = canEdit
    ? item.status === "completed"
      ? `<button class="small-button" data-remove-credit-user="${userId}" data-remove-credit-team="${escapeHtml(item.team)}">Subtract</button>`
      : `<button class="small-button" data-credit-user="${userId}" data-credit-team="${escapeHtml(item.team)}">Credit</button>`
    : "";
  return `
    <div class="challenge-team-card ${item.status}">
      <div class="challenge-team-main">
        <img class="challenge-team-logo" src="${killTeamLogoSrc(item.team)}" alt="">
        <div>
          <span>${wildcard ? "Wildcard" : `#${item.order}`}</span>
          <strong>${escapeHtml(item.team)}</strong>
          <small>${escapeHtml(meta)}</small>
        </div>
      </div>
      <div class="row-actions">
        <span class="status ${item.status === "completed" ? "completed" : item.status === "current" || item.status === "available" ? "open" : ""}">${item.status}</span>
        ${adminAction}
      </div>
    </div>
  `;
}

async function adminChallengeCredit(userId, team, action) {
  try {
    await api(`/api/admin/users/${userId}/challenge-credit`, { method: "POST", body: { team, action, track: state.challengeTab } });
    await loadChallengeProgress();
    state.selectedChallengeUserId = userId;
    renderChallenge();
  } catch (err) {
    setMessage(err.message, true);
  }
}

function renderGameDetail() {
  const content = document.querySelector("[data-content]");
  const game = getKnownGame(state.selectedGameId);
  if (!game) {
    content.innerHTML = `<section class="card panel"><div class="empty">Game not found.</div></section>`;
    return;
  }

  const result = game.result || game.pendingResult?.result || null;
  const statusLabel = game.status === "completed" ? "completed" : game.status === "pending_confirmation" ? "pending" : "active";
  const submitter = game.players?.find((player) => player.id === game.pendingResult?.submittedBy || player.id === game.submittedBy);
  const isParticipant = game.players?.some((player) => player.id === state.me.id);
  const canDeletePending = isParticipant && game.status === "pending_confirmation" && game.pendingResult?.submittedBy === state.me.id;
  const playerAction = isParticipant && game.status === "open"
    ? `<button class="primary-button" data-game-result="${game.id}">Enter result</button>
       <button class="danger-button" data-exit-game="${game.id}">Exit game</button>`
    : canDeletePending
      ? `<button class="danger-button" data-exit-game="${game.id}">Delete pending</button>`
    : "";
  const adminAction = state.me.isAdmin
    ? `<button class="primary-button" data-admin-edit-game="${game.id}">${result ? "Edit result" : "Enter result"}</button>
       ${game.status === "pending_confirmation" ? `<button class="danger-button" data-admin-delete-game="${game.id}">Delete pending</button>` : ""}`
    : "";

  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Game #${game.id}</h2>
          <p class="muted">${gamePlayerLinks(game)} &middot; ${fmtDate(game.createdAt)}</p>
        </div>
        <div class="row-actions">
          <span class="status ${game.status === "completed" ? "completed" : game.status === "pending_confirmation" ? "pending" : "open"}">${statusLabel}</span>
          <button class="ghost-button" data-back-games>Games</button>
          ${playerAction}
          ${adminAction}
        </div>
      </div>
      ${result ? `
        <div class="result-headline">${escapeHtml(resultHeadline(game, result))}</div>
        ${submitter ? `<p class="muted">Submitted by ${escapeHtml(submitter.name)}${game.submittedAt ? ` &middot; ${fmtDate(game.submittedAt)}` : ""}</p>` : ""}
        ${killzoneReview(result)}
        <div class="score-grid">
          ${game.players.map((player) => reviewScoreCard(player, result.scores?.[player.id])).join("")}
        </div>
        ${result.tiebreakers?.enabled ? tieBreakerReview(game, result) : ""}
        ${game.elo ? eloReview(game) : ""}
      ` : `
        <div class="empty">No result has been submitted yet.</div>
      `}
      <div class="message" data-message></div>
    </section>
  `;

  document.querySelector("[data-back-games]").addEventListener("click", async () => {
    state.view = "games";
    state.selectedGameId = null;
    await loadGames();
    renderShell();
  });
  document.querySelector("[data-admin-edit-game]")?.addEventListener("click", () => {
    renderResultForm(game.id, { adminEdit: true });
  });
  document.querySelector("[data-admin-delete-game]")?.addEventListener("click", (event) => {
    adminDeletePendingGame(Number(event.currentTarget.dataset.adminDeleteGame));
  });
  document.querySelector("[data-exit-game]")?.addEventListener("click", (event) => {
    exitOpenGame(Number(event.currentTarget.dataset.exitGame));
  });
  document.querySelector("[data-game-result]")?.addEventListener("click", (event) => {
    renderResultForm(Number(event.currentTarget.dataset.gameResult));
  });
  wireLeaderboardProfiles();
}

function gameTitle(game) {
  return (game.players || []).map((player) => player.name).join(" vs ") || "Deleted players";
}

function gamePlayerLinks(game) {
  const players = game.players || [];
  if (!players.length) return "Deleted players";
  return players.map((player) => playerProfileLink(player)).join(" vs ");
}

function playerProfileLink(player) {
  return `<button class="text-link-button inline-profile-link" data-profile-user="${player.id}">${escapeHtml(player.name)}</button>`;
}

function eloReview(game) {
  return `
    <section class="card metric-card elo-detail-card">
      <span>Elo changes</span>
      <div class="review-lines">
        ${(game.players || []).map((player) => {
          const item = game.elo?.[player.id] || {};
          return metricRow(player.name, `${item.before ?? "-"} -> ${item.after ?? "-"} (${signed(item.delta ?? 0)})`);
        }).join("")}
      </div>
    </section>
  `;
}

function metricCard(label, value) {
  return `
    <div class="card metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function metricRow(label, value) {
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(label)}</div>
      </div>
      <div class="row-actions">
        <span class="status">${escapeHtml(value)}</span>
      </div>
    </div>
  `;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function handleSearchInput(event) {
  clearTimeout(searchDebounce);
  const value = event.currentTarget.value.trim();
  const box = document.querySelector("[data-search-results]");
  searchRequestId += 1;

  if (!value) {
    state.searchResults = [];
    box.innerHTML = `<div class="empty">Start typing a player name or contact.</div>`;
    return;
  }

  box.innerHTML = `<div class="empty">Searching for matches...</div>`;
  searchDebounce = setTimeout(() => searchUsers(), 220);
}

async function searchUsers(options = {}) {
  const { allowEmpty = false } = options;
  const input = document.querySelector("[data-search-input]");
  const box = document.querySelector("[data-search-results]");
  const raw = input.value.trim();
  if (!raw && !allowEmpty) {
    state.searchResults = [];
    box.innerHTML = `<div class="empty">Start typing a player name or contact.</div>`;
    return;
  }

  const requestId = ++searchRequestId;
  const q = encodeURIComponent(raw);
  try {
    const data = await api(`/api/users/search?q=${q}`);
    if (requestId !== searchRequestId) return;
    state.searchResults = data.users || [];
    renderSearchResults(box);
  } catch (err) {
    box.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
  }
}

function renderSearchResults(box) {
  box.innerHTML = state.searchResults.length ? state.searchResults.map((user) => `
    <div class="row-card suggestion-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(user.name)}</div>
        <div class="row-meta">${escapeHtml(searchResultMeta(user))}</div>
      </div>
      <div class="row-actions">
        <button class="primary-button" data-challenge-user="${user.id}">Challenge</button>
      </div>
    </div>
  `).join("") : `<div class="empty">No players found.</div>`;

  document.querySelectorAll("[data-challenge-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await sendChallengeToUser(Number(button.dataset.challengeUser));
        renderShell();
      } catch (err) {
        box.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
      }
    });
  });
}

function searchResultMeta(user) {
  const contacts = [
    user.registerNickname ? `Register: ${user.registerNickname}` : "",
    user.telegramContact ? `Telegram: ${user.telegramContact}` : ""
  ].filter(Boolean).join(" / ");
  return contacts ? `${user.rating} Elo / ${contacts}` : `${user.rating} Elo`;
}

function wireChallengeButtons() {
  document.querySelectorAll("[data-challenge-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.challengeAction;
      await api(`/api/challenges/${button.dataset.id}/${action}`, { method: "POST" });
      await refresh();
      renderShell();
    });
  });
}

function wireGameButtons() {
  document.querySelectorAll("[data-game-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openGameDetail(Number(button.dataset.gameOpen));
    });
  });
  document.querySelectorAll("[data-game-result]").forEach((button) => {
    button.addEventListener("click", () => renderResultForm(Number(button.dataset.gameResult)));
  });
  document.querySelectorAll("[data-game-review]").forEach((button) => {
    button.addEventListener("click", () => renderResultReview(Number(button.dataset.gameReview)));
  });
  document.querySelectorAll("[data-game-exit]").forEach((button) => {
    button.addEventListener("click", () => exitOpenGame(Number(button.dataset.gameExit)));
  });
}

async function exitOpenGame(gameId) {
  const game = getKnownGame(gameId);
  const confirmed = window.confirm(`${game?.status === "pending_confirmation" ? "Delete this pending game" : "Exit this game"}? The match will be closed without Elo changes.`);
  if (!confirmed) return;
  try {
    await api(`/api/games/${gameId}/exit`, { method: "POST" });
    await refresh();
    await loadGames();
    state.view = "play";
    state.selectedGameId = null;
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function adminDeletePendingGame(gameId, profileUserId = null) {
  const confirmed = window.confirm("Delete this pending game? The match will be closed without Elo changes.");
  if (!confirmed) return;
  try {
    await api(`/api/admin/games/${gameId}`, { method: "DELETE" });
    await refresh();
    await loadGames();
    if (profileUserId) {
      await loadPlayerProfile(profileUserId);
      renderShell();
      setPlayerProfileMessage("Pending game deleted.");
      return;
    }
    state.view = "games";
    state.selectedGameId = null;
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
    setPlayerProfileMessage(err.message, true);
  }
}

function renderResultForm(gameId, options = {}) {
  const { adminEdit = false } = options;
  const game = getKnownGame(gameId);
  if (!game) return;
  const content = document.querySelector("[data-content]");
  const existingResult = adminEdit
    ? game.result || game.pendingResult?.result || null
    : game.pendingResult?.submittedBy === state.me.id ? game.pendingResult.result : null;
  const canExitFromForm = !adminEdit && (game.status === "open" || (game.status === "pending_confirmation" && game.pendingResult?.submittedBy === state.me.id));
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${adminEdit ? "Edit Approved Ops result" : "Approved Ops result"}</h2>
          <p class="muted">Each op scores 0-6 VP. Primary Op adds half of its VP, rounded up.</p>
        </div>
        <div class="row-actions">
          ${canExitFromForm ? `<button class="danger-button" type="button" data-exit-game="${game.id}">${game.status === "pending_confirmation" ? "Delete pending" : "Exit game"}</button>` : ""}
          <button class="ghost-button" type="button" data-back>Back</button>
        </div>
      </div>
      <form class="result-form" data-result-form>
        <div class="score-grid">
          ${game.players.map((player) => scoreCard(player, existingResult?.scores?.[player.id])).join("")}
        </div>
        <section class="killzone-panel">
          <h3>Mission</h3>
          <div class="killzone-grid">
            <div class="field">
              <label>Killzone</label>
              <select name="killzone">
                <option value="">Not selected</option>
                ${killzoneOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${existingResult?.killzone?.killzone === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Crit Op</label>
              <select name="critOp">
                <option value="">Not selected</option>
                ${critOpOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${existingResult?.killzone?.critOp === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>Layout</label>
              <select name="killzoneLayout">
                <option value="">Not selected</option>
                ${[1, 2, 3, 4, 5, 6].map((layout) => `
                  <option value="${layout}" ${Number(existingResult?.killzone?.layout) === layout ? "selected" : ""}>${layout}</option>
                `).join("")}
              </select>
            </div>
          </div>
        </section>
        <section class="tiebreaker-panel">
          <label class="checkbox-line">
            <input type="checkbox" data-tiebreaker-enabled ${existingResult?.tiebreakers?.enabled ? "checked" : ""}>
            <span>Enable Tie-Breakers</span>
          </label>
          <div class="tiebreaker-menu" data-tiebreaker-menu ${existingResult?.tiebreakers?.enabled ? "" : "hidden"}>
            <ol class="tiebreaker-list">
              <li>Primary</li>
              <li>Tac Op + Crit Op</li>
              <li>APL on table</li>
              <li>Roll-off</li>
            </ol>
            <div class="tiebreaker-grid">
              ${game.players.map((player) => `
                <div class="field">
                  <label>APL on table: ${escapeHtml(player.name)}</label>
                  <input data-tiebreaker-input name="apl-${player.id}" type="number" min="0" max="99" value="${existingResult?.tiebreakers?.apl?.[player.id] ?? 0}">
                </div>
              `).join("")}
              <div class="field">
                <label>Roll-off winner</label>
                <select data-tiebreaker-input name="rollOffWinnerId">
                  <option value="">Select if still tied</option>
                  ${game.players.map((player) => `<option value="${player.id}" ${existingResult?.tiebreakers?.rollOffWinnerId === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
                </select>
              </div>
            </div>
          </div>
          <div class="tiebreaker-live" data-result-preview></div>
        </section>
        <button class="primary-button" type="submit">${adminEdit ? "Save result" : "Submit result"}</button>
        <div class="message" data-message></div>
      </form>
    </section>
  `;

  document.querySelector("[data-back]").addEventListener("click", () => {
    if (adminEdit) {
      renderGameDetail();
      return;
    }
    if (state.view === "games") {
      renderGames();
      return;
    }
    if (state.view === "profile") {
      renderProfile();
      return;
    }
    renderPlay();
  });
  document.querySelector("[data-exit-game]")?.addEventListener("click", (event) => {
    exitOpenGame(Number(event.currentTarget.dataset.exitGame));
  });
  const refreshResultPreview = () => {
    updateTotals();
    updateTiebreakerMenu();
    updateResultPreview(game);
  };
  document.querySelectorAll("[data-score-input], [data-primary-select], [data-tiebreaker-input]").forEach((input) => {
    input.addEventListener("input", refreshResultPreview);
    input.addEventListener("change", refreshResultPreview);
  });
  document.querySelector("[data-tiebreaker-enabled]").addEventListener("change", refreshResultPreview);
  wireComboFields();
  document.querySelector("[data-result-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const scores = {};
    game.players.forEach((player) => {
      scores[player.id] = {
        faction: document.querySelector(`[name="faction-${player.id}"]`).value,
        tacOp: document.querySelector(`[name="tac-op-${player.id}"]`).value,
        crit: Number(document.querySelector(`[name="crit-${player.id}"]`).value),
        kill: Number(document.querySelector(`[name="kill-${player.id}"]`).value),
        tac: Number(document.querySelector(`[name="tac-${player.id}"]`).value),
        primary: document.querySelector(`[name="primary-${player.id}"]`).value
      };
    });
    const tiebreakersEnabled = document.querySelector("[data-tiebreaker-enabled]").checked;
    const tiebreakers = {
      enabled: tiebreakersEnabled,
      apl: Object.fromEntries(game.players.map((player) => [
        player.id,
        Number(document.querySelector(`[name="apl-${player.id}"]`).value || 0)
      ])),
      rollOffWinnerId: document.querySelector(`[name="rollOffWinnerId"]`).value || null
    };
    const killzone = {
      killzone: document.querySelector(`[name="killzone"]`).value || "",
      critOp: document.querySelector(`[name="critOp"]`).value || "",
      layout: document.querySelector(`[name="killzoneLayout"]`).value || ""
    };
    try {
      const path = adminEdit ? `/api/admin/games/${game.id}/result` : `/api/games/${game.id}/result`;
      await api(path, { method: "POST", body: { scores, tiebreakers, killzone } });
      await refresh();
      await loadTop();
      await loadGames();
      if (adminEdit) {
        state.selectedGameId = game.id;
        state.view = "gameDetail";
      }
      renderShell();
    } catch (err) {
      setMessage(err.message, true);
    }
  });
  refreshResultPreview();
}

function renderResultReview(gameId) {
  const game = getKnownGame(gameId);
  const pending = game?.pendingResult;
  const result = pending?.result;
  if (!game || !result) return;
  const content = document.querySelector("[data-content]");
  const submitter = game.players.find((player) => player.id === pending.submittedBy);
  const reviewSummary = resultHeadline(game, result);
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Confirm result</h2>
          <p class="muted">Submitted by ${escapeHtml(submitter?.name || "opponent")}.</p>
        </div>
        <button class="ghost-button" data-back>Back</button>
      </div>
      <div class="result-headline">${escapeHtml(reviewSummary)}</div>
      ${killzoneReview(result)}
      <div class="score-grid">
        ${game.players.map((player) => reviewScoreCard(player, result.scores?.[player.id])).join("")}
      </div>
      ${result.tiebreakers?.enabled ? tieBreakerReview(game, result) : ""}
      <div class="review-actions">
        <button class="primary-button" data-confirm-result="${game.id}">Confirm result</button>
        <button class="danger-button" data-reject-result="${game.id}">Reject</button>
      </div>
      <div class="message" data-message></div>
    </section>
  `;

  document.querySelector("[data-back]").addEventListener("click", () => {
    if (state.view === "games") {
      renderGames();
      return;
    }
    renderPlay();
  });
  document.querySelector("[data-confirm-result]").addEventListener("click", async () => {
    try {
      await api(`/api/games/${game.id}/confirm-result`, { method: "POST" });
      await refresh();
      await loadTop();
      await loadGames();
      renderShell();
    } catch (err) {
      setMessage(err.message, true);
    }
  });
  document.querySelector("[data-reject-result]").addEventListener("click", async () => {
    try {
      await api(`/api/games/${game.id}/reject-result`, { method: "POST" });
      await refresh();
      await loadGames();
      renderShell();
    } catch (err) {
      setMessage(err.message, true);
    }
  });
  wireLeaderboardProfiles();
}

function killzoneReview(result = {}) {
  const killzone = result.killzone || {};
  const hasKillzone = Boolean(killzone.killzone);
  const hasCritOp = Boolean(killzone.critOp);
  const hasLayout = Boolean(killzone.layout);
  if (!hasKillzone && !hasCritOp && !hasLayout) return "";
  const text = [
    hasKillzone ? `Killzone: ${killzone.killzone}` : "",
    hasCritOp ? `Crit Op: ${killzone.critOp}` : "",
    hasLayout ? `Layout ${killzone.layout}` : ""
  ].filter(Boolean).join(" / ");
  return `<div class="killzone-review">${escapeHtml(text)}</div>`;
}

function reviewScoreCard(player, score = {}) {
  return `
    <div class="score-card review-score-card">
      <h4>${playerProfileLink(player)}</h4>
      <div class="review-lines">
        ${metricRow("Kill Team", score.faction ? canonicalKillTeamName(score.faction) : "-")}
        ${metricRow("Tac Op", score.tacOp || "-")}
        ${metricRow("Crit Op", score.crit ?? 0)}
        ${metricRow("Tac Op VP", score.tac ?? 0)}
        ${metricRow("Kill Op", score.kill ?? 0)}
        ${metricRow("Primary", opLabels[score.primary] || "Crit Op")}
        ${metricRow("Primary bonus", score.primaryBonus ?? 0)}
      </div>
      <div class="total-line">
        <span>Total</span>
        <span>${score.total ?? 0} VP</span>
      </div>
    </div>
  `;
}

function tieBreakerReview(game, result) {
  const summary = tieBreakerReviewSummary(game, result);
  const winner = game.players.find((player) => player.id === summary.winnerId);
  const winnerText = winner && summary.decidedBy
    ? `${winner.name} by ${tieBreakerLabel(summary.decidedBy)}`
    : winner?.name || "Draw";
  return `
    <section class="tiebreaker-panel">
      <h3>Tie-breakers</h3>
      <div class="review-lines">
        ${metricRow("Primary", tieValueLine(game, summary.primary))}
        ${metricRow("Tac Op + Crit Op", tieValueLine(game, summary.critTac))}
        ${metricRow("APL on table", tieValueLine(game, summary.apl))}
        ${metricRow("Roll-off", game.players.find((player) => player.id === summary.rollOffWinnerId)?.name || "-")}
        ${metricRow("Winner", winnerText)}
      </div>
    </section>
  `;
}

function tieBreakerReviewSummary(game, result) {
  const players = game.players || [];
  const [a, b] = players;
  const tiebreakers = result?.tiebreakers || {};
  const scores = result?.scores || {};
  const primary = Object.fromEntries(players.map((player) => [
    player.id,
    primaryBonusForReview(scores[player.id], tiebreakers.primary?.[player.id])
  ]));
  const critTac = Object.fromEntries(players.map((player) => {
    const score = scores[player.id] || {};
    const value = Number(score.crit ?? NaN) + Number(score.tac ?? NaN);
    return [player.id, Number.isFinite(value) ? value : Number(tiebreakers.critTac?.[player.id] || 0)];
  }));
  const apl = Object.fromEntries(players.map((player) => [
    player.id,
    Number(tiebreakers.apl?.[player.id] || 0)
  ]));
  const rollOffWinnerId = tiebreakers.rollOffWinnerId ? Number(tiebreakers.rollOffWinnerId) : null;

  let winnerId = null;
  let decidedBy = null;
  if (a && b) {
    const winnerByPrimary = higherValueWinner(a, b, primary);
    const winnerByCritTac = higherValueWinner(a, b, critTac);
    const winnerByApl = higherValueWinner(a, b, apl);
    if (winnerByPrimary) {
      winnerId = winnerByPrimary.id;
      decidedBy = "primary";
    } else if (winnerByCritTac) {
      winnerId = winnerByCritTac.id;
      decidedBy = "critTac";
    } else if (winnerByApl) {
      winnerId = winnerByApl.id;
      decidedBy = "apl";
    } else if (rollOffWinnerId) {
      winnerId = Number(rollOffWinnerId);
      decidedBy = "rollOff";
    }
  }

  return { primary, critTac, apl, rollOffWinnerId, winnerId, decidedBy };
}

function primaryBonusForReview(score = {}, fallbackValue = 0) {
  if (score.primaryBonus !== undefined) return Number(score.primaryBonus || 0);
  if (score.primaryScore !== undefined) return Math.ceil(Number(score.primaryScore || 0) / 2);
  if (score.primary) return Math.ceil(Number(score[score.primary] || 0) / 2);
  const fallback = Number(fallbackValue || 0);
  return fallback > 3 ? Math.ceil(fallback / 2) : fallback;
}

function tieValueLine(game, values = {}) {
  return game.players.map((player) => `${player.name}: ${values[player.id] ?? 0}`).join(" / ");
}

function scoreCard(player, score = {}) {
  return `
    <div class="score-card" data-score-card="${player.id}">
      <h4>${escapeHtml(player.name)}</h4>
      <div class="score-meta-grid">
        ${comboField("Kill Team", `faction-${player.id}`, "faction", score.faction, "Search Kill Team")}
        ${comboField("Tac Op", `tac-op-${player.id}`, "tacOp", score.tacOp, "Search Tac Op")}
      </div>
      <div class="score-fields">
        ${["crit", "tac", "kill"].map((op) => `
          <div class="field">
            <label>${opLabels[op]}</label>
            <input data-score-input name="${op}-${player.id}" type="number" min="0" max="6" value="${score[op] ?? 0}">
          </div>
        `).join("")}
      </div>
      <div class="field">
        <label>Primary Op</label>
        <select data-primary-select name="primary-${player.id}">
          <option value="crit" ${(score.primary || "crit") === "crit" ? "selected" : ""}>Crit Op</option>
          <option value="tac" ${score.primary === "tac" ? "selected" : ""}>Tac Op</option>
          <option value="kill" ${score.primary === "kill" ? "selected" : ""}>Kill Op</option>
        </select>
      </div>
      <div class="total-line">
        <span>Total</span>
        <span data-total="${player.id}">0 VP</span>
      </div>
    </div>
  `;
}

function comboField(label, name, optionsKey, selected = "", placeholder = "Search or select") {
  const normalizedSelected = optionsKey === "faction"
    ? validKillTeamName(selected) || selected
    : selected;
  return `
    <div class="field combo-field" data-combo data-combo-options="${optionsKey}">
      <label>${escapeHtml(label)}</label>
      <div class="combo-control">
        <input
          class="combo-input"
          name="${escapeHtml(name)}"
          value="${escapeHtml(normalizedSelected || "")}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
          required
          data-combo-input
        >
        <button class="combo-toggle" type="button" data-combo-toggle aria-label="Show options"></button>
      </div>
      <div class="combo-menu" data-combo-menu hidden></div>
    </div>
  `;
}

function comboOptionsFor(key) {
  return key === "faction" ? killTeamOptions : tacOpOptions;
}

function wireComboFields() {
  document.querySelectorAll("[data-combo]").forEach((combo) => {
    const input = combo.querySelector("[data-combo-input]");
    const menu = combo.querySelector("[data-combo-menu]");
    const toggle = combo.querySelector("[data-combo-toggle]");
    const optionsKey = combo.dataset.comboOptions;
    const options = comboOptionsFor(optionsKey);
    let activeIndex = -1;

    const normalizeValue = () => {
      if (optionsKey !== "faction") return true;
      const validValue = validKillTeamName(input.value);
      if (validValue) {
        input.value = validValue;
        input.setCustomValidity("");
        return true;
      }
      input.setCustomValidity("Choose a Kill Team from the list");
      return false;
    };

    const close = () => {
      menu.hidden = true;
      combo.classList.remove("open");
      activeIndex = -1;
    };

    const filteredOptions = (showAll = false) => {
      const query = input.value.trim().toLowerCase();
      return (showAll || !query)
        ? options
        : options.filter((option) => option.toLowerCase().includes(query))
            .sort((a, b) => {
              const aStarts = a.toLowerCase().startsWith(query);
              const bStarts = b.toLowerCase().startsWith(query);
              return Number(!aStarts) - Number(!bStarts) || a.localeCompare(b);
            });
    };

    const renderOptions = (showAll = false) => {
      const matches = filteredOptions(showAll);
      menu.innerHTML = matches.length
        ? matches.map((option, index) => `
          <button class="combo-option ${index === activeIndex ? "active" : ""}" type="button" data-combo-value="${escapeHtml(option)}">
            ${escapeHtml(option)}
          </button>
        `).join("")
        : `<div class="combo-empty">No matches</div>`;
      menu.hidden = false;
      combo.classList.add("open");
    };

    const choose = (value) => {
      input.value = value;
      normalizeValue();
      close();
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    input.addEventListener("focus", () => renderOptions(false));
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        normalizeValue();
        if (!combo.contains(document.activeElement)) close();
      }, 0);
    });
    input.addEventListener("input", () => {
      activeIndex = -1;
      normalizeValue();
      renderOptions(false);
    });
    input.addEventListener("keydown", (event) => {
      const items = Array.from(menu.querySelectorAll("[data-combo-value]"));
      if (event.key === "Escape") {
        close();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        if (menu.hidden) renderOptions(false);
        const count = menu.querySelectorAll("[data-combo-value]").length;
        activeIndex = Math.min(activeIndex + 1, Math.max(count - 1, 0));
        renderOptions(false);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (menu.hidden) renderOptions(false);
        activeIndex = Math.max(activeIndex - 1, 0);
        renderOptions(false);
      } else if (event.key === "Enter" && !menu.hidden && items[activeIndex]) {
        event.preventDefault();
        choose(items[activeIndex].dataset.comboValue);
      }
    });
    toggle.addEventListener("click", () => {
      input.focus();
      activeIndex = -1;
      renderOptions(true);
    });
    menu.addEventListener("mousedown", (event) => event.preventDefault());
    menu.addEventListener("click", (event) => {
      const option = event.target.closest("[data-combo-value]");
      if (option) choose(option.dataset.comboValue);
    });
    normalizeValue();
  });

  if (!wireComboFields.bound) {
    document.addEventListener("click", (event) => {
      document.querySelectorAll("[data-combo]").forEach((combo) => {
        if (!combo.contains(event.target)) {
          combo.querySelector("[data-combo-menu]").hidden = true;
          combo.classList.remove("open");
        }
      });
    });
    wireComboFields.bound = true;
  }
}

function optionsHtml(options, selected) {
  return options.map((option) => `
    <option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>
  `).join("");
}

function updateTiebreakerMenu() {
  const checkbox = document.querySelector("[data-tiebreaker-enabled]");
  const menu = document.querySelector("[data-tiebreaker-menu]");
  if (!checkbox || !menu) return;
  menu.hidden = !checkbox.checked;
}

function updateResultPreview(game) {
  const el = document.querySelector("[data-result-preview]");
  if (!el) return;
  const preview = calculateResultPreview(game);
  if (!preview) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="preview-summary">${escapeHtml(preview.headline)}</div>
    ${preview.steps.length ? `
      <div class="preview-steps">
        ${preview.steps.map((step) => `
          <div class="preview-step ${step.state}">
            <span>${escapeHtml(step.label)}</span>
            <strong>${escapeHtml(step.text)}</strong>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function calculateResultPreview(game) {
  const players = game.players || [];
  const [a, b] = players;
  if (!a || !b) return null;
  const scores = Object.fromEntries(players.map((player) => [player.id, scoreFromForm(player.id)]));
  const scoreA = scores[a.id];
  const scoreB = scores[b.id];
  const scoreText = `${scoreA.total}-${scoreB.total}`;
  const tiebreakersEnabled = document.querySelector("[data-tiebreaker-enabled]")?.checked;

  if (scoreA.total !== scoreB.total) {
    const winner = scoreA.total > scoreB.total ? a : b;
    return {
      winnerId: winner.id,
      headline: `Player ${winner.name} Won, ${winnerScoreText(winner, a, b, scoreA, scoreB)}`,
      steps: []
    };
  }

  if (!tiebreakersEnabled) {
    return {
      winnerId: null,
      headline: `Draw, ${scoreText}`,
      steps: []
    };
  }

  const steps = [];
  const primary = { [a.id]: scoreA.primaryBonus, [b.id]: scoreB.primaryBonus };
  const critTac = { [a.id]: scoreA.crit + scoreA.tac, [b.id]: scoreB.crit + scoreB.tac };
  const apl = Object.fromEntries(players.map((player) => [
    player.id,
    Number(document.querySelector(`[name="apl-${player.id}"]`)?.value || 0)
  ]));
  const rollOffWinnerId = Number(document.querySelector(`[name="rollOffWinnerId"]`)?.value || 0) || null;

  const winnerByPrimary = higherValueWinner(a, b, primary);
  steps.push(previewStep("Primary", primary, a, b, winnerByPrimary));
  if (winnerByPrimary) {
    appendSkippedSteps(steps, ["Tac Op + Crit Op", "APL on table", "Roll-off"]);
    return previewFromWinner(winnerByPrimary, scoreText, steps, "primary");
  }

  const winnerByCritTac = higherValueWinner(a, b, critTac);
  steps.push(previewStep("Tac Op + Crit Op", critTac, a, b, winnerByCritTac));
  if (winnerByCritTac) {
    appendSkippedSteps(steps, ["APL on table", "Roll-off"]);
    return previewFromWinner(winnerByCritTac, scoreText, steps, "critTac");
  }

  const winnerByApl = higherValueWinner(a, b, apl);
  steps.push(previewStep("APL on table", apl, a, b, winnerByApl));
  if (winnerByApl) {
    appendSkippedSteps(steps, ["Roll-off"]);
    return previewFromWinner(winnerByApl, scoreText, steps, "apl");
  }

  const rollOffWinner = players.find((player) => player.id === rollOffWinnerId) || null;
  steps.push({
    label: "Roll-off",
    text: rollOffWinner ? `${rollOffWinner.name} wins` : "Select roll-off winner",
    state: rollOffWinner ? "winner" : "pending"
  });

  return rollOffWinner
    ? previewFromWinner(rollOffWinner, scoreText, steps, "rollOff")
    : { winnerId: null, headline: `Draw, ${scoreText}. Select roll-off winner.`, steps };
}

function scoreFromForm(playerId) {
  const crit = Number(document.querySelector(`[name="crit-${playerId}"]`)?.value || 0);
  const kill = Number(document.querySelector(`[name="kill-${playerId}"]`)?.value || 0);
  const tac = Number(document.querySelector(`[name="tac-${playerId}"]`)?.value || 0);
  const primary = document.querySelector(`[name="primary-${playerId}"]`)?.value || "crit";
  const primaryScore = { crit, kill, tac }[primary] || 0;
  return {
    crit,
    kill,
    tac,
    primary,
    primaryScore,
    primaryBonus: Math.ceil(primaryScore / 2),
    total: crit + kill + tac + Math.ceil(primaryScore / 2)
  };
}

function higherValueWinner(a, b, values) {
  if (values[a.id] === values[b.id]) return null;
  return values[a.id] > values[b.id] ? a : b;
}

function previewStep(label, values, a, b, winner) {
  return {
    label,
    text: `${a.name}: ${values[a.id]} / ${b.name}: ${values[b.id]}${winner ? ` - ${winner.name} wins` : " - tied"}`,
    state: winner ? "winner" : "tie"
  };
}

function appendSkippedSteps(steps, labels) {
  labels.forEach((label) => {
    steps.push({ label, text: "Not reached", state: "skipped" });
  });
}

function previewFromWinner(winner, scoreText, steps, decidedBy = null) {
  const suffix = decidedBy ? ` by ${tieBreakerLabel(decidedBy)}` : "";
  return {
    winnerId: winner.id,
    headline: `Player ${winner.name} Won, ${scoreText}${suffix}`,
    steps
  };
}

function resultHeadline(game, result) {
  const players = game.players || [];
  const [a, b] = players;
  const scoreA = result?.scores?.[a?.id];
  const scoreB = result?.scores?.[b?.id];
  if (!a || !b || !scoreA || !scoreB) return "Result submitted";
  const tiedByTotal = Number(scoreA.total) === Number(scoreB.total);
  const tiebreakerSummary = tiedByTotal && result.tiebreakers?.enabled
    ? tieBreakerReviewSummary(game, result)
    : null;
  const winnerId = tiebreakerSummary ? tiebreakerSummary.winnerId : result.winnerId;
  const winner = players.find((player) => player.id === winnerId);
  const scoreText = winner
    ? winnerScoreText(winner, a, b, scoreA, scoreB)
    : `${scoreA.total}-${scoreB.total}`;
  const suffix = tiebreakerSummary?.decidedBy ? ` by ${tieBreakerLabel(tiebreakerSummary.decidedBy)}` : "";
  return winner ? `Player ${winner.name} Won, ${scoreText}${suffix}` : `Draw, ${scoreText}`;
}

function winnerScoreText(winner, a, b, scoreA, scoreB) {
  const loser = winner.id === a.id ? b : a;
  const byId = {
    [a.id]: scoreA,
    [b.id]: scoreB
  };
  return `${byId[winner.id].total}-${byId[loser.id].total}`;
}

function updateTotals() {
  document.querySelectorAll("[data-score-card]").forEach((card) => {
    const id = card.dataset.scoreCard;
    const score = {
      crit: Number(card.querySelector(`[name="crit-${id}"]`).value || 0),
      kill: Number(card.querySelector(`[name="kill-${id}"]`).value || 0),
      tac: Number(card.querySelector(`[name="tac-${id}"]`).value || 0),
      primary: card.querySelector(`[name="primary-${id}"]`).value
    };
    card.querySelector(`[data-total="${id}"]`).textContent = `${approvedTotal(score)} VP`;
  });
}

async function loadTop() {
  const data = await api("/api/users");
  state.users = data.users || [];
}

function renderTop() {
  const content = document.querySelector("[data-content]");
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Leaderboard</h2>
          <p class="muted">Sorted by current Elo.</p>
        </div>
      </div>
      ${usersTable(state.users)}
      <div class="message" data-message></div>
    </section>
  `;
  wireLeaderboardProfiles();
}

function usersTable(users) {
  if (!users.length) return `<div class="empty">No users yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th class="rank">#</th><th>Player</th><th>Rating</th><th>Role</th></tr></thead>
        <tbody>
          ${users.map((user, index) => `
            <tr>
              <td class="rank">${index + 1}</td>
              <td><button class="text-button player-name-button" data-profile-user="${user.id}">${escapeHtml(user.name)}</button></td>
              <td>${user.rating}</td>
              <td>${user.isAdmin ? "Admin" : "Player"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function wireLeaderboardProfiles() {
  document.querySelectorAll("[data-profile-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await openPlayerProfile(Number(button.dataset.profileUser));
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });
}

async function loadAdmin() {
  const data = await api("/api/admin/users");
  state.adminUsers = data.users || [];
}

function renderAdmin() {
  const content = document.querySelector("[data-content]");
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Users</h2>
          <p class="muted">Ratings, administrator rights, and account removal.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Contacts</th><th>Rating</th><th>Matches</th><th>Admin</th><th></th></tr>
          </thead>
          <tbody>
            ${state.adminUsers.map((user) => `
              <tr>
                <td>${escapeHtml(user.name)}</td>
                <td>
                  <div class="admin-contact-cell">
                    <span>Register: ${escapeHtml(user.registerNickname || "-")}</span>
                    <span>Telegram: ${escapeHtml(user.telegramContact || "-")}</span>
                  </div>
                </td>
                <td>
                  <div class="admin-controls">
                    <input class="rating-input" type="number" min="0" max="5000" value="${user.rating}" data-rating="${user.id}">
                    <button class="small-button" data-save-rating="${user.id}">Save</button>
                  </div>
                </td>
                <td>${user.gamesPlayed}</td>
                <td><input type="checkbox" ${user.isAdmin ? "checked" : ""} ${user.id === state.me.id ? "disabled" : ""} data-admin-toggle="${user.id}"></td>
                <td><button class="danger-button" ${user.id === state.me.id ? "disabled" : ""} data-delete-user="${user.id}">Delete</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="message" data-message></div>
    </section>
  `;

  document.querySelectorAll("[data-save-rating]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveRating;
      const rating = Number(document.querySelector(`[data-rating="${id}"]`).value);
      await adminPatch(id, { rating });
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
      if (!confirm(`Delete user ${user?.name || ""}?`)) return;
      try {
        await api(`/api/admin/users/${button.dataset.deleteUser}`, { method: "DELETE" });
        await refresh();
        await loadAdmin();
        await loadTop();
        renderShell();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });
}

async function adminPatch(id, body) {
  try {
    await api(`/api/admin/users/${id}`, { method: "PATCH", body });
    await refresh();
    await loadAdmin();
    await loadTop();
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
  }
}

boot();

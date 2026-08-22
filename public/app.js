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
  tournaments: [],
  tournamentsError: "",
  challengeProgress: [],
  challengeError: "",
  selectedChallengeUserId: null,
  challengeOpenedFromProfile: false,
  challengeTab: "classified",
  statisticsTab: "killTeamWinrates",
  selectedStatisticsTeam: null,
  selectedSeasonId: "2026-q2-dataslate",
  statisticsFilters: { classification: "all", team: "" },
  statisticsSort: { key: "winRate", dir: "desc" },
  gameFilters: { playerQuery: "", playerId: "", team: "" },
  leaderboardTab: "leaderboard",
  leaderboardPage: 1,
  adminUsersPage: 1,
  gamesTab: "history",
  tournamentsTab: "public",
  searchResults: [],
  adminUsers: [],
  adminGames: [],
  adminTournaments: [],
  adminTournamentMode: "list",
  selectedTournamentId: null,
  adminTournamentDetail: null,
  adminTournamentPreview: null,
  publicTournamentDetail: null,
  tournamentInfoTab: "standings",
  adminPasswordReset: null,
  playerProfile: null,
  feedback: [],
  feedbackError: "",
  feedbackMode: "form",
  sharedChallengeTokenHandled: ""
};

let searchDebounce = null;
let searchRequestId = 0;
let publicTournamentRequestId = 0;

const LEADERBOARD_PAGE_SIZE = 50;
const THEME_STORAGE_KEY = "tgtv-theme";

const standingsTiebreakerOptions = [
  {
    key: "strength_of_schedule",
    labelKey: "tiebreaker.strengthOfSchedule.label",
    descriptionKey: "tiebreaker.strengthOfSchedule.description"
  },
  {
    key: "buchholz",
    labelKey: "tiebreaker.buchholz.label",
    descriptionKey: "tiebreaker.buchholz.description"
  },
  {
    key: "head_to_head",
    labelKey: "tiebreaker.headToHead.label",
    descriptionKey: "tiebreaker.headToHead.description"
  },
  {
    key: "total_vp",
    labelKey: "tiebreaker.totalVp.label",
    descriptionKey: "tiebreaker.totalVp.description"
  },
  {
    key: "vp_diff",
    labelKey: "tiebreaker.vpDiff.label",
    descriptionKey: "tiebreaker.vpDiff.description"
  }
];

const singleEliminationSizes = [8, 16, 32, 64];
const MAX_TOURNAMENT_RULES_PDF_SIZE = 2 * 1024 * 1024;
const TOURNAMENT_AUTOSAVE_TEXT_DELAY_MS = 900;
const TOURNAMENT_AUTOSAVE_CHANGE_DELAY_MS = 180;

const opLabels = {
  crit: "op.crit",
  kill: "op.kill",
  tac: "op.tac"
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
  "Dragon Masters",
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

const nonClassifiedKillTeams = new Set([
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
]);

const classifiedChallengeExtraTeams = [
  "Spectre Squad",
  "Dragon Masters"
];

const challengeWildcardTeams = [
  "Navy Breachers",
  "XV26 Stealth Suits"
];

const killTeamAliases = new Map([
  ["angel of death", "Angels of Death"],
  ["angels of death", "Angels of Death"],
  ["brood brother", "Brood Brothers"],
  ["brood brothers", "Brood Brothers"],
  ["celestian insidiant", "Celestian Insidiants"],
  ["celestian insidiants", "Celestian Insidiants"],
  ["corsair voidscarred", "Corsair Voidscarred"],
  ["dragon master", "Dragon Masters"],
  ["dragon masters", "Dragon Masters"],
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
  ["stealth battlesuit", "XV26 Stealth Battlesuits"],
  ["stealth battlesuits", "XV26 Stealth Battlesuits"],
  ["stealth suit", "XV26 Stealth Battlesuits"],
  ["stealth suits", "XV26 Stealth Battlesuits"],
  ["xv 26 stealth battlesuit", "XV26 Stealth Battlesuits"],
  ["xv 26 stealth battlesuits", "XV26 Stealth Battlesuits"],
  ["xv 26 stealth suit", "XV26 Stealth Battlesuits"],
  ["xv 26 stealth suits", "XV26 Stealth Battlesuits"],
  ["xv26 stealth battlesuit", "XV26 Stealth Battlesuits"],
  ["xv26 stealth battlesuits", "XV26 Stealth Battlesuits"],
  ["xv26 stealth suit", "XV26 Stealth Battlesuits"],
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
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
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

function markdownToHtml(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```(\w+)?\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length + 2;
      blocks.push(`<h${level}>${markdownInlineToHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*([-*+])\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*([-*+])\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ul>${items.map((item) => `<li>${markdownInlineToHtml(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(`<ol>${items.map((item) => `<li>${markdownInlineToHtml(item)}</li>`).join("")}</ol>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quote.map(markdownInlineToHtml).join("<br>")}</blockquote>`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(markdownInlineToHtml).join("<br>")}</p>`);
  }

  return blocks.join("");
}

function isMarkdownBlockStart(line) {
  return /^\s*```/.test(line) ||
    /^(#{1,4})\s+/.test(line) ||
    /^\s*([-*+])\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*---+\s*$/.test(line);
}

function markdownInlineToHtml(value) {
  const tokens = [];
  const token = (html) => {
    const key = `\uE000${tokens.length}\uE001`;
    tokens.push(html);
    return key;
  };
  let text = String(value || "");

  text = text.replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const safeUrl = safeMarkdownUrl(href);
    if (!safeUrl) return match;
    return token(`<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
  });
  text = text.replace(/(^|[\s(])(https?:\/\/[^\s<>"')]+)/g, (match, prefix, href) => {
    const safeUrl = safeMarkdownUrl(href);
    if (!safeUrl) return match;
    return `${prefix}${token(`<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`)}`;
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");

  tokens.forEach((html, itemIndex) => {
    text = text.replaceAll(`\uE000${itemIndex}\uE001`, html);
  });
  return text;
}

function safeMarkdownUrl(value) {
  const text = String(value || "").trim();
  if (!/^(https?:\/\/|mailto:)/i.test(text)) return "";
  return text;
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
    if (state.me) await applyAppRouteFromHash();
    render();
  } catch (err) {
    app.innerHTML = `<div class="loading">${escapeHtml(err.message)}</div>`;
  }
}

function render() {
  const tournamentSlug = tournamentSlugFromLocation();
  if (tournamentSlug) {
    renderPublicTournamentRoute(tournamentSlug);
    return;
  }
  if (!state.me) {
    renderAuth();
    return;
  }
  renderShell();
  handleSharedChallengeHash();
}

window.addEventListener("hashchange", handleHashNavigation);
window.addEventListener("popstate", handleHashNavigation);

async function handleHashNavigation() {
  try {
    if (tournamentSlugFromLocation() || !state.me) {
      render();
      return;
    }
    const routed = await applyAppRouteFromHash();
    if (routed) renderShell();
    else render();
  } catch (err) {
    setMessage(err.message, true);
  }
}

function hashSegments() {
  const raw = String(window.location.hash || "").replace(/^#\/?/, "").replace(/\/+$/, "");
  if (!raw) return [];
  return raw.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return "";
    }
  });
}

function appRouteFromHash() {
  if (tournamentSlugFromLocation() || sharedChallengeTokenFromHash()) return null;
  const segments = hashSegments();
  if (!segments.length) return null;
  const [section, subroute, id] = segments;
  if (section === "matchmaking" || section === "play") return { view: "play" };
  if (section === "leaderboard" || section === "top") {
    return { view: "top", leaderboardTab: subroute === "users" ? "users" : "leaderboard" };
  }
  if (section === "games") {
    if (subroute === "game") return { view: "gameDetail", selectedGameId: Number(id) };
    return { view: "games", gamesTab: subroute === "sessions" ? "sessions" : "history" };
  }
  if (section === "tournaments") {
    if (subroute === "admin") {
      return {
        view: "tournaments",
        tournamentsTab: "admin",
        adminTournamentMode: id === "create" ? "create" : id ? "detail" : "list",
        selectedTournamentId: id && id !== "create" ? Number(id) : null
      };
    }
    return { view: "tournaments", tournamentsTab: "public" };
  }
  if (section === "stats" || section === "statistics") return { view: "statistics" };
  if (section === "profile") return { view: "profile" };
  if (section === "players") return { view: "player", selectedPlayerId: Number(subroute) };
  if (section === "challenge") return { view: "challenge" };
  if (section === "feedback") return { view: "feedback" };
  return null;
}

async function applyAppRouteFromHash() {
  const route = appRouteFromHash();
  if (!route) return false;
  await applyAppRoute(route);
  return true;
}

async function applyAppRoute(route) {
  state.adminPasswordReset = null;
  state.view = route.view;
  state.playerProfile = null;
  state.selectedGameId = null;
  if (route.view !== "tournaments") {
    state.adminTournamentMode = "list";
    state.selectedTournamentId = null;
    state.adminTournamentDetail = null;
    state.adminTournamentPreview = null;
  }
  if (route.view === "challenge") {
    state.challengeOpenedFromProfile = false;
    state.selectedChallengeUserId = state.me.id;
  } else {
    state.selectedChallengeUserId = null;
    state.challengeOpenedFromProfile = false;
  }
  if (route.view === "feedback") state.feedbackMode = "form";
  if (route.view === "top") {
    state.leaderboardTab = state.me?.isAdmin ? route.leaderboardTab || "leaderboard" : "leaderboard";
    if (state.leaderboardTab === "users") await loadAdminUsers();
    else await loadTop();
  } else if (route.view === "games") {
    state.gamesTab = state.me?.isAdmin ? route.gamesTab || "history" : "history";
    if (state.gamesTab === "sessions") await loadAdminGames();
    else await loadGames();
  } else if (route.view === "gameDetail") {
    state.selectedGameId = Number.isInteger(route.selectedGameId) && route.selectedGameId > 0 ? route.selectedGameId : null;
    await loadGames();
  } else if (route.view === "tournaments") {
    state.tournamentsTab = state.me?.isAdmin ? route.tournamentsTab || "public" : "public";
    if (state.tournamentsTab === "admin") {
      state.adminTournamentMode = route.adminTournamentMode || "list";
      state.selectedTournamentId = Number.isInteger(route.selectedTournamentId) && route.selectedTournamentId > 0
        ? route.selectedTournamentId
        : null;
      if (state.adminTournamentMode === "detail" && state.selectedTournamentId) state.tournamentInfoTab = "settings";
      state.adminTournamentDetail = null;
      state.adminTournamentPreview = null;
      await loadTournamentAdmin();
    } else {
      state.adminTournamentMode = "list";
      state.selectedTournamentId = null;
      state.adminTournamentDetail = null;
      state.adminTournamentPreview = null;
      await loadTournaments();
    }
  } else if (route.view === "statistics") {
    await loadGames();
  } else if (route.view === "profile") {
    await loadChallengeProgress(state.me.id);
  } else if (route.view === "player") {
    const selectedPlayerId = Number.isInteger(route.selectedPlayerId) && route.selectedPlayerId > 0 ? route.selectedPlayerId : state.me.id;
    if (selectedPlayerId === state.me.id) {
      state.view = "profile";
      state.playerProfile = null;
      await loadChallengeProgress(state.me.id);
    } else {
      await loadPlayerProfile(selectedPlayerId);
    }
  } else if (route.view === "challenge") {
    await loadChallengeProgress(state.selectedChallengeUserId || state.me.id);
  }
}

function appHashForState() {
  if (state.view === "play") return "#/matchmaking";
  if (state.view === "top") return state.leaderboardTab === "users" ? "#/leaderboard/users" : "#/leaderboard";
  if (state.view === "games") return state.gamesTab === "sessions" ? "#/games/sessions" : "#/games";
  if (state.view === "gameDetail" && state.selectedGameId) return `#/games/game/${encodeURIComponent(state.selectedGameId)}`;
  if (state.view === "tournaments") {
    if (state.tournamentsTab === "admin") {
      if (state.adminTournamentMode === "create") return "#/tournaments/admin/create";
      if (state.selectedTournamentId) return `#/tournaments/admin/${encodeURIComponent(state.selectedTournamentId)}`;
      return "#/tournaments/admin";
    }
    return "#/tournaments";
  }
  if (state.view === "statistics") return "#/stats";
  if (state.view === "profile") return "#/profile";
  if (state.view === "player" && state.playerProfile?.user?.id) return `#/players/${encodeURIComponent(state.playerProfile.user.id)}`;
  if (state.view === "challenge") return "#/challenge";
  if (state.view === "feedback") return "#/feedback";
  return "";
}

function syncAppHash(options = {}) {
  const hash = appHashForState();
  const pathname = tournamentSlugFromPath() ? "/" : window.location.pathname;
  if (!hash || (window.location.hash === hash && window.location.pathname === pathname)) return;
  const url = `${pathname}${window.location.search}${hash}`;
  if (options.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

function pathSegments() {
  const raw = String(window.location.pathname || "/").replace(/^\/+|\/+$/g, "");
  if (!raw) return [];
  return raw.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return "";
    }
  });
}

function sharedChallengeTokenFromHash() {
  const match = String(window.location.hash || "").match(/^#challenge\/([^/?#]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

function tournamentSlugFromHash() {
  const segments = hashSegments();
  if (segments.length !== 2 || segments[0] !== "tournaments" || segments[1] === "admin") return "";
  return segments[1] || "";
}

function tournamentSlugFromPath() {
  const segments = pathSegments();
  if (segments.length !== 2 || segments[0] !== "tournaments" || segments[1] === "admin") return "";
  return segments[1] || "";
}

function tournamentPublicPath(slug) {
  return `/tournaments/${encodeURIComponent(slug || "")}`;
}

function tournamentSlugFromLocation() {
  const pathSlug = tournamentSlugFromPath();
  if (pathSlug) return pathSlug;
  const hashSlug = tournamentSlugFromHash();
  if (hashSlug) {
    window.history.replaceState(null, "", `${tournamentPublicPath(hashSlug)}${window.location.search}`);
    return hashSlug;
  }
  return "";
}

function navigateToPublicTournament(slug) {
  if (!slug) return;
  window.history.pushState(null, "", tournamentPublicPath(slug));
  renderPublicTournamentRoute(slug);
}

function clearSharedChallengeHash() {
  if (!String(window.location.hash || "").startsWith("#challenge/")) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function clearTournamentRoute() {
  if (!tournamentSlugFromLocation()) return;
  window.history.replaceState(null, "", `/${window.location.search}`);
}

async function renderPublicTournamentRoute(slug) {
  const requestId = ++publicTournamentRequestId;
  publicTournamentContainer().innerHTML = `<div class="loading">${t("tournaments.loading")}</div>`;
  try {
    const data = await api(`/api/tournaments/${encodeURIComponent(slug)}`);
    if (requestId !== publicTournamentRequestId) return;
    renderPublicTournament(data);
  } catch (err) {
    if (requestId !== publicTournamentRequestId) return;
    state.publicTournamentDetail = null;
    publicTournamentContainer().innerHTML = `
      <div class="public-tournament-layout ${state.me ? "embedded-public-tournament" : ""}">
        <section class="card panel public-tournament-shell">
          <div class="panel-header">
            <div>
              <h2>${t("tournaments.notFound.title")}</h2>
              <p class="muted">${escapeHtml(err.message)}</p>
            </div>
            ${state.me ? "" : `
              <div class="row-actions">
                <button class="small-button" data-public-login>${t("auth.tab.signIn")}</button>
              </div>
            `}
          </div>
        </section>
      </div>
    `;
    wirePublicTournamentNav();
  }
}

function publicTournamentContainer() {
  if (!state.me) return app;
  const shouldRenderShell = state.view !== "tournaments" || !document.querySelector("[data-content]");
  state.view = "tournaments";
  state.tournamentsTab = "public";
  state.adminTournamentMode = "list";
  state.selectedTournamentId = null;
  state.adminTournamentDetail = null;
  state.adminTournamentPreview = null;
  if (shouldRenderShell) renderShell();
  return document.querySelector("[data-content]");
}

function renderPublicTournament(data) {
  const tournament = data.tournament || {};
  const listedParticipants = listedTournamentParticipants(data.participants || []);
  state.publicTournamentDetail = data;
  publicTournamentContainer().innerHTML = `
    <div class="public-tournament-layout ${state.me ? "embedded-public-tournament" : ""}">
      <section class="card panel public-tournament-shell">
        <div class="panel-header public-tournament-header">
          <div>
            <p class="profile-label">${escapeHtml(formatLabel(tournament.format))}</p>
            <h2>${escapeHtml(tournament.name || t("tournaments.fallbackName"))}</h2>
            <p class="muted">${escapeHtml(tournamentStatusLabel(tournament.status))}${tournament.startsAt ? ` · ${fmtDate(tournament.startsAt)}` : ""}</p>
          </div>
          <div class="row-actions">
            ${state.me ? `
              ${publicTournamentViewerActions(data)}
            ` : `
              <button class="small-button" data-public-login>${t("auth.tab.signIn")}</button>
              <button class="primary-button" data-public-register>${t("auth.tab.register")}</button>
            `}
          </div>
        </div>
        ${tournament.description ? `<div class="public-tournament-description markdown-content">${markdownToHtml(tournament.description)}</div>` : ""}
        ${tournamentRulesLinkMarkup(tournament)}
        <section class="profile-grid">
          ${metricCard(t("tournaments.field.date"), tournamentDateLabel(tournament))}
          ${metricCard(t("tournaments.field.participants"), String(listedParticipants.length))}
          ${metricCard(t("tournaments.field.rounds"), tournamentRoundsLabel(tournament, data))}
          ${metricCard(t("tournaments.field.venue"), venueModeLabel(tournament.venueMode))}
          ${metricCard(t("tournaments.field.season"), seasonLabel(tournament.seasonId))}
        </section>
      </section>
      ${tournamentInfoPanel(data, { publicRoute: true })}
    </div>
  `;
  wirePublicTournamentNav(data);
}

function publicTournamentViewerActions(data) {
  const tournament = data.tournament || {};
  const viewer = tournament.viewer || {};
  if (!state.me) return "";
  if (!viewer.participantId && tournament.status === "registration_open") {
    return `<button class="primary-button" data-public-tournament-join="${tournament.id}">${t("tournaments.action.join")}</button>`;
  }
  if (viewer.participantId && ["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
    return `<button class="danger-button" data-public-tournament-withdraw="${tournament.id}">${t("tournaments.action.withdraw")}</button>`;
  }
  return "";
}

function renderTournamentJoinForm(data) {
  const tournament = data.tournament || {};
  const telegramContact = state.me?.telegramContact || "";
  publicTournamentContainer().innerHTML = `
    <div class="public-tournament-layout ${state.me ? "embedded-public-tournament" : ""}">
      <section class="card panel public-tournament-shell tournament-registration-shell">
        <div class="panel-header public-tournament-header">
          <div>
            <p class="profile-label">${t("tournaments.registration.title")}</p>
            <h2>${t("tournaments.registration.heading", { name: escapeHtml(tournament.name || t("tournaments.fallbackName")) })}</h2>
            <p class="muted">${t("tournaments.registration.hint")}</p>
          </div>
          <div class="row-actions">
            <button class="small-button" type="button" data-tournament-registration-cancel>${t("common.cancel")}</button>
          </div>
        </div>
        <form class="tournament-registration-form" data-public-tournament-registration>
          <div class="field">
            <label for="tournament-telegram-contact">${t("tournaments.field.telegram")}</label>
            <input
              id="tournament-telegram-contact"
              name="telegramContact"
              value="${escapeHtml(telegramContact)}"
              placeholder="${t("tournaments.registration.telegramPlaceholder")}"
              maxlength="80"
              required
            >
          </div>
          ${comboField(t("tournaments.field.faction"), "faction", "faction", "", t("tournaments.registration.factionPlaceholder"))}
          <button class="primary-button" type="submit">${t("tournaments.registration.submit")}</button>
          <div class="message" data-message></div>
        </form>
      </section>
    </div>
  `;

  wireComboFields();
  document.querySelector("[data-tournament-registration-cancel]")?.addEventListener("click", () => {
    renderPublicTournament(data);
  });
  document.querySelector("[data-public-tournament-registration]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const telegram = String(formData.get("telegramContact") || "").trim();
    const faction = validKillTeamName(formData.get("faction"));
    if (!telegram) {
      setMessage(t("tournaments.registration.telegramRequired"), true);
      return;
    }
    if (!faction) {
      setMessage(t("tournaments.registration.factionRequired"), true);
      return;
    }

    try {
      const profile = await api("/api/me", {
        method: "PATCH",
        body: { telegramContact: telegram }
      });
      state.me = profile.user || state.me;
      await api(`/api/tournaments/${tournament.id}/join`, {
        method: "POST",
        body: { faction }
      });
      await renderPublicTournamentRoute(tournament.slug);
    } catch (err) {
      setMessage(err.message, true);
    }
  });
}

function wirePublicTournamentNav(data) {
  const tournament = data?.tournament || {};
  wireTournamentInfoControls(data, { publicRoute: true });
  document.querySelector("[data-public-login]")?.addEventListener("click", () => {
    state.authMode = "login";
    clearTournamentRoute();
    render();
  });
  document.querySelector("[data-public-register]")?.addEventListener("click", () => {
    state.authMode = "register";
    clearTournamentRoute();
    render();
  });
  document.querySelector("[data-public-back]")?.addEventListener("click", () => {
    clearTournamentRoute();
    render();
  });
  document.querySelector("[data-public-tournament-join]")?.addEventListener("click", async () => {
    renderTournamentJoinForm(data);
  });
  document.querySelector("[data-public-tournament-withdraw]")?.addEventListener("click", async () => {
    if (!window.confirm("Withdraw from this tournament?")) return;
    try {
      await api(`/api/tournaments/${tournament.id}/withdraw`, { method: "POST" });
      await renderPublicTournamentRoute(tournament.slug);
    } catch (err) {
      window.alert(err.message);
    }
  });
  document.querySelectorAll("[data-public-tournament-result]").forEach((button) => {
    button.addEventListener("click", () => {
      const match = findTournamentMatch(data, Number(button.dataset.publicTournamentResult));
      const admin = button.dataset.publicTournamentAdminResult === "1";
      if (match) renderTournamentResultForm(data, match, { admin, publicRoute: true });
    });
  });
  document.querySelectorAll("[data-public-tournament-review]").forEach((button) => {
    button.addEventListener("click", () => {
      const match = findTournamentMatch(data, Number(button.dataset.publicTournamentReview));
      if (match) renderTournamentResultReview(data, match, { publicRoute: true });
    });
  });
}

function tournamentStatusLabel(status) {
  const labels = {
    draft: "tournaments.status.draft",
    registration_open: "tournaments.status.registrationOpen",
    registration_closed: "tournaments.status.registrationClosed",
    in_progress: "tournaments.status.inProgress",
    completed: "tournaments.status.completed",
    cancelled: "tournaments.status.cancelled"
  };
  return labels[status] ? t(labels[status]) : status || "";
}

function formatLabel(format) {
  return t(format === "swiss" ? "tournaments.format.swiss" : "tournaments.format.singleElimination");
}

function tournamentMatchStatusLabel(status) {
  const labels = {
    not_ready: "tournaments.status.notReady",
    active: "tournaments.status.active",
    pending_confirmation: "tournaments.status.pendingConfirmation",
    completed: "tournaments.status.completed"
  };
  return labels[status] ? t(labels[status]) : status || "";
}

function tournamentParticipantStatusLabel(status) {
  const labels = {
    joined: "tournaments.participant.status.joined",
    active: "tournaments.status.active",
    pending_placement: "tournaments.participant.status.pendingPlacement",
    withdrawn: "tournaments.participant.status.withdrawn",
    removed: "tournaments.participant.status.removed",
    eliminated: "tournaments.participant.status.eliminated",
    finished: "tournaments.participant.status.finished"
  };
  return labels[status] ? t(labels[status]) : status || "";
}

function latestSeason() {
  return seasons[seasons.length - 1] || { id: "2026-q2-dataslate", name: "2026 Q2 Dataslate" };
}

function seasonLabel(seasonId) {
  return seasons.find((season) => season.id === seasonId)?.name || seasonId || latestSeason().name;
}

function venueModeLabel(mode) {
  return t(venueModeOptions.find((item) => item.key === mode)?.labelKey || "venue.tts");
}

function tournamentDateLabel(tournament = {}) {
  return tournament.startsAt ? fmtDate(tournament.startsAt) : t("tournaments.date.none");
}

function tournamentRoundsLabel(tournament = {}, data = {}) {
  if (tournament.format === "single_elimination") {
    return String(Math.round(Math.log2(Number(tournament.singleEliminationSize || 8))));
  }
  return String(tournament.swissRoundCount || (data.rounds || []).length || 0);
}

function standingsSubtitle(tournament) {
  const tiebreakers = tournament.tiebreakerOrder || [];
  return tiebreakers.length
    ? t("tournaments.standings.tiebreakersLabel", { list: tiebreakers.map(tiebreakerLabelForStandings).join(", ") })
    : t("tournaments.standings.noTiebreakers");
}

function tournamentRulesLinkMarkup(tournament) {
  const link = tournament?.rulesLink || "";
  if (!link) return "";
  const isPdf = isTournamentRulesPdf(link);
  const label = t(isPdf ? "tournaments.rules.openPdf" : "tournaments.rules.open");
  const download = isPdf ? ` download="${escapeHtml(`${tournament?.slug || "tournament"}-rules.pdf`)}"` : "";
  return `
    <p class="tournament-rules-link">
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener"${download}>${label}</a>
    </p>
  `;
}

function isTournamentRulesPdf(link) {
  return String(link || "").startsWith("data:application/pdf;base64,");
}

function tiebreakerLabelForStandings(key) {
  const option = standingsTiebreakerOptions.find((item) => item.key === key);
  return option ? t(option.labelKey) : key;
}

function participantStatusSummary(participants) {
  const listed = listedTournamentParticipants(participants);
  const active = listed.filter((item) => ["joined", "active"].includes(item.status)).length;
  const pending = listed.filter((item) => item.status === "pending_placement").length;
  return pending
    ? plural("tournaments.participants.summaryWithPending", active, { pending })
    : plural("tournaments.participants.summaryActiveOnly", active);
}

function isListedTournamentParticipant(participant) {
  return !["withdrawn", "removed"].includes(participant?.status);
}

function listedTournamentParticipants(participants) {
  return (participants || []).filter(isListedTournamentParticipant);
}

function canManageTournamentParticipants(data) {
  const tournament = data?.tournament || {};
  return Boolean(state.me?.isAdmin && tournament.id);
}

function tournamentInfoPanel(data, options = {}) {
  const tournament = data.tournament || {};
  const canManage = Boolean(options.admin && canManageTournamentParticipants(data));
  const activeTab = tournamentInfoActiveTab(data, options);
  const wrapperTag = options.admin ? "section" : "div";
  const wrapperClass = options.admin ? "admin-subpanel wide-panel" : "card panel wide-panel";
  const titleByTab = {
    settings: t("tournaments.tab.settings"),
    standings: t("tournaments.tab.standings"),
    matches: t("tournaments.tab.matches"),
    stats: t("tournaments.tab.stats"),
    participants: t("tournaments.field.participants"),
    tables: t("tournaments.tab.tables")
  };
  const subtitleByTab = {
    settings: t("tournaments.info.settingsSubtitle"),
    standings: standingsSubtitle(tournament),
    matches: t("tournaments.info.matchesSubtitle"),
    stats: t("tournaments.info.statsSubtitle", { name: tournament.name || t("tournaments.fallbackName") }),
    participants: participantStatusSummary(data.participants || []),
    tables: t("tournaments.info.tablesSubtitle")
  };
  return `
    <${wrapperTag} class="${wrapperClass}">
      <div class="panel-header">
        <div>
          <h3>${titleByTab[activeTab]}</h3>
          <p class="muted">${escapeHtml(subtitleByTab[activeTab])}</p>
        </div>
      </div>
      ${tournamentInfoTabs(activeTab, data, options)}
      ${tournamentInfoTabContent(activeTab, data, options)}
      ${canManage ? `<div class="message" data-message></div>` : ""}
    </${wrapperTag}>
  `;
}

function tournamentInfoTabDefinitions(data, options = {}) {
  const tabs = [
    { id: "standings", label: t("tournaments.tab.standings") },
    { id: "matches", label: t("tournaments.tab.matches") },
    { id: "stats", label: t("tournaments.tab.stats") }
  ];
  if (options.admin) tabs.unshift({ id: "settings", label: t("tournaments.tab.settings") });
  if (options.admin && canManageTournamentParticipants(data)) {
    tabs.push({ id: "participants", label: t("tournaments.field.participants") });
    if (data?.tournament?.venueMode === "irl") tabs.push({ id: "tables", label: t("tournaments.tab.tables") });
  }
  return tabs;
}

function tournamentInfoActiveTab(data, options = {}) {
  const tabs = tournamentInfoTabDefinitions(data, options);
  const fallbackTab = tabs[0]?.id || "standings";
  const activeTab = tabs.some((tab) => tab.id === state.tournamentInfoTab) ? state.tournamentInfoTab : fallbackTab;
  state.tournamentInfoTab = activeTab;
  return activeTab;
}

function tournamentInfoTabs(activeTab, data, options = {}) {
  const tabs = tournamentInfoTabDefinitions(data, options);
  return `
    <div class="tabs tournament-info-tabs">
      ${tabs.map((tab) => `
        <button class="tab ${activeTab === tab.id ? "active" : ""}" data-tournament-info-tab="${tab.id}">${escapeHtml(tab.label)}</button>
      `).join("")}
    </div>
  `;
}

function tournamentInfoTabContent(activeTab, data, options = {}) {
  if (activeTab === "settings" && options.admin) return adminTournamentSettingsContent(data);
  if (activeTab === "participants") return adminTournamentParticipantsContent(data);
  if (activeTab === "tables") return adminTournamentTablesContent(data);
  if (activeTab === "stats") return tournamentStatsContent(data);
  if (activeTab === "matches") return tournamentMatchesContent(data, options);
  return `${publicStandingsTable(data)}${options.admin ? adminFinalStandingsEditor(data) : ""}`;
}

function tournamentMatchesContent(data, options = {}) {
  if (options.admin) {
    return `${adminTournamentPreviewPanel(data)}${adminTournamentRoundsPanel(data)}`;
  }
  return publicRoundsMarkup(data.rounds || [], data.tournament || {});
}

function adminTournamentSettingsContent(data) {
  return adminTournamentEditForm(data.tournament || {});
}

function displayedStandings(data) {
  const finalResults = data.tournament?.finalResults;
  return Array.isArray(finalResults) && finalResults.length ? finalResults : data.standings || [];
}

function publicStandingsTable(data) {
  const standings = displayedStandings(data);
  const participants = new Map((data.participants || []).map((item) => [item.id, item]));
  const extraColumns = (data.tournament?.tiebreakerOrder || [])
    .filter((key, index, order) => order.indexOf(key) === index)
    .map((key) => {
      if (key === "strength_of_schedule") {
        return { label: t("tiebreaker.strengthOfSchedule.label"), value: (row) => row.strengthOfSchedule ?? 0 };
      }
      if (key === "buchholz") return { label: t("tiebreaker.buchholz.label"), value: (row) => row.buchholz ?? 0 };
      return null;
    })
    .filter(Boolean);
  if (!standings.length) return `<div class="empty">${t("tournaments.standings.empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="rank">#</th>
            <th>${t("tournaments.player.fallback")}</th>
            <th>${t("games.filter.teamLabel")}</th>
            <th>${t("tournaments.standings.column.tp")}</th>
            <th>${t("tournaments.standings.column.wdl")}</th>
            <th>${t("tournaments.standings.totalVp")}</th>
            <th>${t("tournaments.standings.vpDiff")}</th>
            ${extraColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${standings.map((row) => {
            const participant = participants.get(row.participantId);
            return `
              <tr>
                <td class="rank">${row.rank}</td>
                <td>${tournamentParticipantProfileLink(participant, t("tournaments.player.fallback"))}</td>
                <td>${escapeHtml(participant?.faction || t("tournaments.participant.factionMissing"))}</td>
                <td>${row.matchPoints}</td>
                <td>${row.wins}-${row.draws}-${row.losses}</td>
                <td>${row.totalVp}</td>
                <td>${row.vpDiff}</td>
                ${extraColumns.map((column) => `<td>${column.value(row)}</td>`).join("")}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function publicParticipantsList(participants) {
  if (!participants.length) return `<div class="empty">${t("tournaments.participants.empty")}</div>`;
  return `
    <div class="list">
      ${participants.map((participant) => `
        <div class="row-card compact-row-card">
          <div class="row-main">
            <div class="row-title">${tournamentParticipantProfileLink(participant)}</div>
            <div class="row-meta">${escapeHtml(participant.faction || t("tournaments.participant.factionMissing"))}</div>
          </div>
          <span class="status ${participant.status === "active" ? "completed" : participant.status === "pending_placement" ? "pending" : ""}">${escapeHtml(tournamentParticipantStatusLabel(participant.status))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function publicRoundsMarkup(rounds, tournament = {}) {
  if (!rounds.length) return `<div class="empty">${t("tournaments.matches.empty")}</div>`;
  return `
    <div class="public-rounds">
      ${rounds.map((round) => `
        <section class="public-round">
          <div class="public-round-title">
            <strong>${t("tournaments.round.title", { number: round.roundNumber })}</strong>
            <span class="status ${round.status === "active" ? "pending" : round.status === "completed" ? "completed" : ""}">${escapeHtml(tournamentMatchStatusLabel(round.status))}</span>
          </div>
          <div class="list">
            ${(round.matches || []).map((match) => publicMatchMarkup(match, tournament)).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function publicMatchMarkup(match, tournament = {}) {
  const score = publicMatchScore(match);
  const meta = [score, matchSetupMeta(match)].filter(Boolean).join(" / ");
  return `
    <div class="row-card compact-row-card">
      <div class="row-main">
          <div class="row-title">${tournamentParticipantProfileLink(match.participantA)} vs ${match.isBye ? t("tournaments.match.byeUpper") : tournamentParticipantProfileLink(match.participantB)}</div>
          <div class="row-meta">${escapeHtml(meta)}</div>
        </div>
      <div class="row-actions">
        <span class="status ${match.status === "active" || match.status === "pending_confirmation" ? "pending" : match.status === "completed" ? "completed" : ""}">${escapeHtml(tournamentMatchStatusLabel(match.status))}</span>
        ${publicMatchActions(match, tournament)}
      </div>
    </div>
  `;
}

function publicMatchActions(match, tournament = {}) {
  const participantId = tournament.viewer?.participantId;
  if (!state.me || match.isBye) return "";
  if (!participantId) return "";
  if (![match.participantAId, match.participantBId].includes(participantId)) return "";
  if (match.status === "active") {
    return `<button class="small-button" data-public-tournament-result="${match.id}">${t("play.action.enterResult")}</button>`;
  }
  if (match.status === "pending_confirmation" && match.pendingResult?.result) {
    if (match.pendingResult.submittedBy === state.me.id) {
      return `<button class="small-button" data-public-tournament-result="${match.id}">${t("play.action.editResult")}</button>`;
    }
    return `<button class="primary-button" data-public-tournament-review="${match.id}">${t("tournaments.action.review")}</button>`;
  }
  return "";
}

function publicMatchScore(match) {
  if (match.isBye) return t("tournaments.match.bye");
  const result = match.result || match.pendingResult?.result;
  const a = match.participantA;
  const b = match.participantB;
  if (!result || !a || !b) return t("tournaments.match.waitingForResult");
  const scoreA = result.scores?.[a.userId] || result.scores?.[-a.id] || {};
  const scoreB = result.scores?.[b.userId] || result.scores?.[-b.id] || {};
  const totalA = Number(scoreA.total || 0);
  const totalB = Number(scoreB.total || 0);
  const winner = match.winnerParticipantId
    ? [a, b].find((participant) => participant.id === match.winnerParticipantId)
    : null;
  return winner
    ? t("tournaments.match.wonSuffix", { score: `${totalA}-${totalB}`, name: winner.displayName })
    : `${totalA}-${totalB}`;
}

function matchSetupMeta(match) {
  const mission = match.mission || match.result?.killzone || match.pendingResult?.result?.killzone || {};
  const parts = [];
  if (match.table?.tableNumber) parts.push(t("tournaments.match.table", { number: match.table.tableNumber }));
  if (mission.killzone) parts.push(t("tournaments.mission.killzone", { name: mission.killzone }));
  if (mission.critOp) parts.push(t("tournaments.mission.critOp", { name: mission.critOp }));
  if (mission.layout) parts.push(t("tournaments.mission.deployment", { layout: mission.layout }));
  return parts.join(" / ");
}

async function loadTournaments() {
  try {
    const data = await api("/api/tournaments");
    state.tournaments = data.tournaments || [];
    state.tournamentsError = "";
  } catch (err) {
    state.tournaments = [];
    state.tournamentsError = err.message;
  }
}

function pageTabs(section, tabs, active) {
  if (!state.me?.isAdmin) return "";
  return `
    <div class="tabs page-tabs">
      ${tabs.map((tab) => `
        <button class="tab ${active === tab.id ? "active" : ""}" data-page-tab="${section}" data-page-tab-value="${tab.id}">
          ${escapeHtml(tab.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function wirePageTabs() {
  document.querySelectorAll("[data-page-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      const section = button.dataset.pageTab;
      const value = button.dataset.pageTabValue;
      try {
        if (section === "leaderboard") {
          state.leaderboardTab = value;
          if (value === "users") await loadAdminUsers();
          else await loadTop();
        } else if (section === "games") {
          state.gamesTab = value;
          if (value === "sessions") await loadAdminGames();
          else await loadGames();
        } else if (section === "tournaments") {
          state.tournamentsTab = value;
          if (value === "admin") {
            if (!state.selectedTournamentId && state.adminTournamentMode !== "create") state.adminTournamentMode = "list";
            await loadTournamentAdmin();
          } else {
            state.adminTournamentMode = "list";
            state.selectedTournamentId = null;
            state.adminTournamentDetail = null;
            state.adminTournamentPreview = null;
            await loadTournaments();
          }
        }
        syncAppHash();
        renderShell();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });
}

function renderTournaments() {
  const content = document.querySelector("[data-content]");
  const tournaments = state.tournaments || [];
  const activeTab = state.me?.isAdmin ? state.tournamentsTab : "public";
  if (state.tournamentsTab !== activeTab) state.tournamentsTab = activeTab;
  content.innerHTML = `
    ${pageTabs("tournaments", [
      { id: "public", label: t("tournaments.tab.publicList") },
      { id: "admin", label: t("tournaments.tab.adminList") }
    ], activeTab)}
    ${activeTab === "admin" ? adminTournamentAdminView() : `
      <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("nav.tournaments")}</h2>
          <p class="muted">${t("tournaments.page.hint")}</p>
        </div>
      </div>
      ${state.tournamentsError ? `<div class="empty">${escapeHtml(state.tournamentsError)}</div>` : `
        ${publicTournamentSections(tournaments)}
      `}
      </section>
    `}
  `;
  wirePageTabs();
  if (activeTab === "admin") {
    wireAdminTournamentControls();
    return;
  }
  document.querySelectorAll("[data-tournament-open]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateToPublicTournament(button.dataset.tournamentOpen);
    });
  });
}

function publicTournamentSections(tournaments) {
  if (!tournaments.length) return `<div class="empty">${t("tournaments.list.empty")}</div>`;
  const sections = [
    { title: t("tournaments.section.ongoing"), items: tournaments.filter((tournament) => tournament.status === "in_progress") },
    {
      title: t("tournaments.section.future"),
      items: tournaments.filter((tournament) =>
        ["registration_open", "registration_closed"].includes(tournament.status)
      )
    },
    {
      title: t("tournaments.section.ended"),
      items: tournaments.filter((tournament) => ["completed", "cancelled"].includes(tournament.status))
    }
  ];
  return `
    <div class="tournament-sections">
      ${sections.map((section) => `
        <section class="tournament-list-section">
          <div class="tournament-list-heading">
            <h3>${escapeHtml(section.title)}</h3>
            <span>${section.items.length}</span>
          </div>
          <div class="list tournament-card-list">
            ${section.items.length ? section.items.map(publicTournamentCard).join("") : `<div class="empty compact-empty">${t("tournaments.section.empty")}</div>`}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function publicTournamentCard(tournament) {
  return `
    <div class="row-card tournament-card">
      <div class="row-main tournament-card-main">
        <div>
          <div class="row-title">${escapeHtml(tournament.name || t("tournaments.list.untitled"))}</div>
          <div class="row-meta">${escapeHtml(formatLabel(tournament.format))} / ${escapeHtml(tournamentStatusLabel(tournament.status))}</div>
        </div>
        <dl class="tournament-card-facts">
          ${tournamentCardFact(t("tournaments.field.participants"), tournamentParticipantCountLabel(tournament))}
          ${tournamentCardFact(t("tournaments.card.rating"), tournament.ratingPolicy === "ranked" ? t("tournaments.card.ranked") : t("tournaments.card.unranked"))}
          ${tournamentCardFact(t("tournaments.card.starts"), tournament.startsAt ? fmtDate(tournament.startsAt) : t("tournaments.date.none"))}
          ${tournamentCardFact(t("tournaments.field.rounds"), tournamentRoundCountLabel(tournament))}
        </dl>
      </div>
      <div class="row-actions">
        <span class="status ${tournamentStatusClass(tournament.status)}">${escapeHtml(tournamentStatusLabel(tournament.status))}</span>
        <button class="primary-button" data-tournament-open="${escapeHtml(tournament.slug)}">${t("tournaments.card.open")}</button>
      </div>
    </div>
  `;
}

function tournamentCardFact(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function tournamentParticipantCountLabel(tournament) {
  const count = Number(tournament.participantCount || 0);
  const limit = tournamentParticipantLimit(tournament);
  return limit ? `${count}/${limit}` : String(count);
}

function tournamentParticipantLimit(tournament) {
  if (tournament.format !== "single_elimination") return 0;
  return Number(tournament.singleEliminationSize || 0);
}

function tournamentRoundCountLabel(tournament) {
  if (tournament.format === "swiss") {
    return String(tournament.swissRoundCount || tournament.roundCount || 0);
  }
  const size = Number(tournament.singleEliminationSize || 0);
  if (size > 1) return String(Math.ceil(Math.log2(size)));
  return String(tournament.roundCount || 0);
}

async function handleSharedChallengeHash() {
  const token = sharedChallengeTokenFromHash();
  if (!token || state.sharedChallengeTokenHandled === token) return;
  state.sharedChallengeTokenHandled = token;
  try {
    const data = await api(`/api/challenges/share/${encodeURIComponent(token)}`);
    const challenge = data.challenge;
    if (!challenge || challenge.status !== "pending") {
      throw new Error("This challenge has already been handled");
    }
    if (challenge.toUserId !== state.me.id) {
      throw new Error("This challenge link is for another player");
    }
    const opponentName = challenge.from?.name || "your opponent";
    if (!window.confirm(`Accept challenge from ${opponentName}?`)) {
      clearSharedChallengeHash();
      state.sharedChallengeTokenHandled = "";
      return;
    }
    await api(`/api/challenges/share/${encodeURIComponent(token)}/accept`, { method: "POST" });
    clearSharedChallengeHash();
    state.sharedChallengeTokenHandled = "";
    await refresh();
    state.view = "play";
    renderShell();
  } catch (err) {
    window.alert(err.message);
  }
}

function renderAuth() {
  const setupOpen = !state.hasAdmin;
  const title = state.authMode === "setup"
    ? t("auth.title.setup")
    : state.authMode === "register"
      ? t("auth.title.register")
      : t("auth.title.login");
  const subtitle = state.authMode === "setup"
    ? t("auth.subtitle.setup")
    : state.authMode === "register"
      ? t("auth.subtitle.register")
      : t("auth.subtitle.login");
  const action = state.authMode === "setup" ? t("auth.action.setup") : state.authMode === "register" ? t("auth.action.register") : t("auth.action.login");
  const profileFields = state.authMode !== "login" ? `
    <div class="field">
      <label for="register-nickname">${t("auth.field.registerNickname")}</label>
      <input id="register-nickname" name="registerNickname" maxlength="40" placeholder="${t("auth.field.registerNicknamePlaceholder")}">
    </div>
    <div class="field">
      <label for="telegram-contact">${t("auth.field.telegramContact")}</label>
      <input id="telegram-contact" name="telegramContact" maxlength="80" placeholder="${t("auth.field.telegramContactPlaceholder")}" required>
    </div>
  ` : "";
  const passwordMinLength = state.authMode === "login" ? 1 : 6;
  const confirmPasswordField = state.authMode !== "login"
    ? passwordFieldMarkup(t("auth.field.confirmPassword"), "confirmPassword", "confirm-password", "new-password", 6)
    : "";

  app.innerHTML = `
    <main class="auth-layout">
      <section class="brand-panel">
        <div>
          <img class="brand-logo" src="/logo.png" alt="${t("auth.brand.logoAlt")}">
          <h1>${t("auth.brand.title")}</h1>
          <p>${t("auth.brand.tagline")}</p>
        </div>
      </section>
      <section class="auth-stack">
        <div class="card auth-card">
          <div class="tabs">
            <button class="tab ${state.authMode === "login" ? "active" : ""}" data-auth-tab="login">${t("auth.tab.signIn")}</button>
            <button class="tab ${state.authMode === "register" ? "active" : ""}" data-auth-tab="register">${t("auth.tab.register")}</button>
            ${setupOpen ? `<button class="tab ${state.authMode === "setup" ? "active" : ""}" data-auth-tab="setup">${t("auth.tab.admin")}</button>` : ""}
          </div>
          <h2 class="section-title">${title}</h2>
          <p class="section-subtitle">${subtitle}</p>
          <form data-auth-form>
            <div class="field">
              <label for="name">${t("auth.field.name")}</label>
              <input id="name" name="name" autocomplete="username" required minlength="2" maxlength="24">
            </div>
            ${passwordFieldMarkup(t("auth.field.password"), "password", "password", state.authMode === "login" ? "current-password" : "new-password", passwordMinLength)}
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

function passwordFieldMarkup(label, name, id, autocomplete, minLength = 6) {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="password-control">
        <input id="${id}" name="${name}" type="password" autocomplete="${autocomplete}" required minlength="${minLength}">
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
    const routed = await applyAppRouteFromHash();
    if (!routed && !tournamentSlugFromLocation()) {
      state.view = "play";
      syncAppHash({ replace: true });
    }
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
          <button class="menu-toggle" data-sidebar-toggle aria-label="${t("nav.openNavigation")}" aria-expanded="false">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <button class="mark avatar-button" data-header-profile aria-label="${t("nav.openProfile")}">${avatarMarkup(state.me)}</button>
        </div>
        <div class="topbar-player">
          <div class="topbar-name-row">
            <h1>${escapeHtml(state.me.name)}</h1>
            <span class="rating-pill inline-rating">${state.me.rating} Elo</span>
          </div>
        </div>
      </div>
    </header>
    <button class="sidebar-backdrop" data-sidebar-close aria-label="${t("nav.closeNavigation")}"></button>
    <main class="layout">
      <aside class="card sidebar">
        ${navButton("top", t("nav.leaderboard"))}
        ${navButton("play", t("nav.matchmaking"))}
        ${navButton("games", t("nav.games"))}
        ${navButton("tournaments", t("nav.tournaments"))}
        ${navButton("statistics", t("nav.stats"))}
        ${navButton("profile", t("nav.profile"))}
        ${navButton("challenge", t("nav.challenge"))}
        ${navButton("feedback", t("nav.feedback"))}
        <button class="nav-button sidebar-logout" data-logout>${t("nav.signOut")}</button>
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
    state.adminPasswordReset = null;
    state.view = "profile";
    state.playerProfile = null;
    state.selectedChallengeUserId = state.me.id;
    syncAppHash();
    renderShell();
    await loadChallengeProgress(state.me.id);
    if (state.view === "profile") renderShell();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      setSidebarOpen(false);
      const targetView = button.dataset.view;
      state.adminPasswordReset = null;
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
      if (targetView === "feedback") state.feedbackMode = "form";
      if (targetView === "top") state.leaderboardTab = "leaderboard";
      if (targetView === "games") state.gamesTab = "history";
      if (targetView === "tournaments") {
        state.tournamentsTab = "public";
        state.adminTournamentMode = "list";
        state.selectedTournamentId = null;
        state.adminTournamentDetail = null;
        state.adminTournamentPreview = null;
      }
      syncAppHash();
      renderShell();
      try {
        if (targetView === "games") await loadGames();
        if (targetView === "tournaments") await loadTournaments();
        if (targetView === "statistics") await loadGames();
        if (targetView === "profile") await loadChallengeProgress(state.me.id);
        if (targetView === "challenge") await loadChallengeProgress(state.selectedChallengeUserId || state.me.id);
        if (targetView === "top") await loadTop();
      } finally {
        if (state.view === targetView) renderShell();
      }
    });
  });

  if (state.view === "profile") renderProfile();
  else if (state.view === "player") renderPlayerProfile();
  else if (state.view === "games") renderGames();
  else if (state.view === "tournaments") renderTournaments();
  else if (state.view === "gameDetail") renderGameDetail();
  else if (state.view === "statistics") renderStatistics();
  else if (state.view === "challenge") renderChallenge();
  else if (state.view === "feedback") renderFeedback();
  else if (state.view === "top") renderTop();
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

if (!window.__tgtvSharedChallengeHashBound) {
  window.addEventListener("hashchange", () => {
    if (state.me) handleSharedChallengeHash();
  });
  window.__tgtvSharedChallengeHashBound = true;
}

function navButton(id, label) {
  const active = state.view === id || (id === "top" && state.view === "player") || (id === "games" && state.view === "gameDetail");
  return `<button class="nav-button ${active ? "active" : ""}" data-view="${id}">${label}</button>`;
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.me = null;
  state.view = "play";
  state.sharedChallengeTokenHandled = "";
  state.adminPasswordReset = null;
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
          <h2>${t("play.newChallenge.title")}</h2>
          <p class="muted">${t("play.newChallenge.hint")}</p>
        </div>
      </div>
      <div class="search-row">
        <div class="field" style="margin:0">
          <input data-search-input placeholder="${t("play.newChallenge.searchPlaceholder")}">
        </div>
        <button class="primary-button" data-search>${t("play.newChallenge.searchAction")}</button>
      </div>
      <div class="list search-results" data-search-results style="margin-top:14px"></div>
    </section>

    <section class="grid-2">
      <div class="card panel">
        <div class="panel-header"><h3>${t("play.incoming.title")}</h3></div>
        <div class="list">${incoming.length ? incoming.map(challengeCard).join("") : `<div class="empty">${t("play.incoming.empty")}</div>`}</div>
      </div>
      <div class="card panel">
        <div class="panel-header"><h3>${t("play.outgoing.title")}</h3></div>
        <div class="list">${outgoing.length ? outgoing.map(challengeCard).join("") : `<div class="empty">${t("play.outgoing.empty")}</div>`}</div>
      </div>
    </section>

    <section class="card panel">
      <div class="panel-header"><h2>${t("play.active.title")}</h2></div>
      <div class="list">${openGames.length ? openGames.map(gameCard).join("") : `<div class="empty">${t("play.active.empty")}</div>`}</div>
    </section>

    <section class="card panel">
      <div class="panel-header"><h2>${t("play.recent.title")}</h2></div>
      <div class="list">${completedGames.length ? completedGames.map(gameCard).join("") : `<div class="empty">${t("play.recent.empty")}</div>`}</div>
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
  const shareUrl = challengeShareUrl(challenge);
  const shareAction = shareUrl
    ? `<button class="small-button" data-challenge-share="${escapeHtml(shareUrl)}">Copy link</button>`
    : "";
  const actions = challenge.toUserId === state.me.id
    ? `<button class="small-button" data-challenge-action="accept" data-id="${challenge.id}">Accept</button>
       <button class="small-button" data-challenge-action="decline" data-id="${challenge.id}">Decline</button>`
    : `${shareAction}<button class="small-button" data-challenge-action="cancel" data-id="${challenge.id}">Cancel</button>`;
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

function challengeShareUrl(challenge) {
  if (!challenge?.shareToken || challenge.fromUserId !== state.me.id || challenge.status !== "pending") return "";
  return `${window.location.origin}${window.location.pathname}#challenge/${encodeURIComponent(challenge.shareToken)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.top = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function gameCard(game) {
  if (game.sourceType === "tournament_match") {
    return game.status === "completed"
      ? completedTournamentGameCard(game)
      : tournamentMatchGameCard(game);
  }

  const players = game.players || [];
  const title = players.map((player) => player.id === state.me.id ? t("play.game.you") : player.name).join(" vs ");
  const isParticipant = players.some((player) => player.id === state.me.id);
  const isPending = game.status === "pending_confirmation";
  const status = game.status === "completed" ? "completed" : isPending ? "pending" : "open";
  const result = game.status === "completed"
    ? resultSummary(game)
    : isPending
      ? pendingResultSummary(game)
      : t("play.game.waitingForResult");
  const mainAction = isParticipant && game.status === "open"
    ? `<button class="primary-button" data-game-result="${game.id}">${t("play.action.enterResult")}</button>`
    : isParticipant && isPending && game.pendingResult?.submittedBy === state.me.id
      ? `<button class="small-button" data-game-result="${game.id}">${t("play.action.editResult")}</button>`
      : isParticipant && isPending
        ? `<button class="primary-button" data-game-review="${game.id}">${t("play.action.reviewResult")}</button>`
        : "";
  const canExit = isParticipant && (game.status === "open" || (isPending && game.pendingResult?.submittedBy === state.me.id));
  const exitAction = canExit
    ? `<button class="danger-button" data-game-exit="${game.id}">${isPending ? t("play.action.deletePending") : t("play.action.exitGame")}</button>`
    : "";
  const detailsAction = game.status === "open"
    ? ""
    : `<button class="small-button" data-game-open="${game.id}">${t("play.action.details")}</button>`;
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-meta">${escapeHtml(result)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${status}">${game.status === "completed" ? t("play.game.status.completed") : isPending ? t("play.game.status.pending") : t("play.game.status.active")}</span>
        ${detailsAction}
        ${mainAction}
        ${exitAction}
      </div>
    </div>
  `;
}

function tournamentMatchLabel(game) {
  const match = game.tournamentMatch || {};
  const tournament = game.tournament || {};
  return [
    tournament.name || "Tournament",
    match.roundNumber ? `Round ${match.roundNumber}` : "",
    match.bracketPosition ? `Match ${match.bracketPosition}` : ""
  ].filter(Boolean).join(" / ");
}

function tournamentMatchSourceId(game) {
  const fromSource = Number(game?.sourceId || game?.tournamentMatch?.id || 0);
  if (Number.isInteger(fromSource) && fromSource > 0) return fromSource;
  const fromSyntheticId = Number(String(game?.id || "").replace(/^tournament-match-/, ""));
  return Number.isInteger(fromSyntheticId) && fromSyntheticId > 0 ? fromSyntheticId : 0;
}

function getKnownTournamentGame(matchId) {
  const id = Number(matchId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return [...(state.games || []), ...(state.allGames || [])].find((game) =>
    game.sourceType === "tournament_match" && tournamentMatchSourceId(game) === id
  ) || null;
}

function tournamentMatchDataFromGame(game) {
  const match = game?.tournamentMatch || {};
  return {
    tournament: game?.tournament || {},
    participants: [match.participantA, match.participantB].filter(Boolean),
    rounds: [{ roundNumber: match.roundNumber, matches: [match] }]
  };
}

function completedTournamentGameCard(game) {
  const matchId = tournamentMatchSourceId(game);
  const players = game.players || [];
  const title = players.map((player) => Number(player.id) === state.me.id ? "You" : player.name).join(" vs ") || "Tournament match";
  const result = resultSummary(game);
  const openAction = game.tournament?.slug
    ? `<button class="small-button" data-tournament-game-open="${matchId}">Open tournament</button>`
    : "";

  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-meta">Tournament: ${escapeHtml(tournamentMatchLabel(game))} / ${escapeHtml(result)}</div>
      </div>
      <div class="row-actions">
        <span class="status completed">completed</span>
        ${openAction}
      </div>
    </div>
  `;
}

function tournamentMatchGameCard(game) {
  const match = game.tournamentMatch || {};
  const tournament = game.tournament || {};
  const matchId = tournamentMatchSourceId(game);
  const players = game.players || [];
  const title = players.map((player) => Number(player.id) === state.me.id ? "You" : player.name).join(" vs ") || "Tournament match";
  const isParticipant = players.some((player) => Number(player.id) === state.me.id);
  const canPlayerReport = isParticipant && players.length === 2;
  const canPeerReview = canPlayerReport && players.every((player) => player.hasProfile !== false && Number(player.id) > 0);
  const canAdminReport = Boolean(state.me?.isAdmin);
  const requiresAdminResult = players.some((player) => player.hasProfile === false || Number(player.id) < 0);
  const isPending = game.status === "pending_confirmation";
  const status = isPending ? "pending" : "open";
  const result = isPending
    ? pendingResultSummary(game)
    : canPlayerReport || canAdminReport
      ? t("play.game.waitingForResult")
      : "Administrator result entry required";
  const openAction = tournament.slug
    ? `<button class="small-button" data-tournament-game-open="${matchId}">Open tournament</button>`
    : "";
  const mainAction = canAdminReport && requiresAdminResult
    ? `<button class="primary-button" data-tournament-game-result="${matchId}" data-tournament-game-admin-result="1">Enter Results</button>`
    : canPlayerReport && !isPending
      ? `<button class="primary-button" data-tournament-game-result="${matchId}">Enter Results</button>`
      : canPlayerReport && isPending && game.pendingResult?.submittedBy === state.me.id
        ? `<button class="primary-button" data-tournament-game-result="${matchId}">Edit Results</button>`
        : canPeerReview && isPending
          ? `<button class="primary-button" data-tournament-game-review="${matchId}">Review Results</button>`
          : canAdminReport
            ? `<button class="primary-button" data-tournament-game-result="${matchId}" data-tournament-game-admin-result="1">Enter Results</button>`
            : "";

  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-meta">Tournament: ${escapeHtml(tournamentMatchLabel(game))} / ${escapeHtml(result)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${status}">${isPending ? "pending" : "active"}</span>
        ${mainAction}
        ${openAction}
      </div>
    </div>
  `;
}

function pendingResultSummary(game) {
  const pending = game.pendingResult;
  const result = pending?.result;
  const players = game.players || [];
  const submitter = players.find((player) => player.id === pending?.submittedBy);
  if (!result) return t("games.pendingResult.awaitingConfirmation");
  const score = resultHeadline(game, result);
  const submitterName = pending?.submittedBy === state.me.id
    ? t("play.game.you")
    : submitter?.name || t("games.pendingResult.opponentFallback");
  const waiting = players.some((player) => player.hasProfile === false || Number(player.id) < 0)
    ? t("games.pendingResult.waitingForAdmin")
    : t("games.pendingResult.waitingForConfirmation");
  return t("games.pendingResult.summary", { name: submitterName, score, waiting });
}

function resultSummary(game) {
  const players = game.players || [];
  if (!game.result) return t("games.result.savedFallback");
  const score = resultHeadline(game, game.result);
  if (!game.elo) return score;
  const eloParts = players.map((player) => `${player.name} ${signed(game.elo?.[player.id]?.delta ?? 0)}`);
  return t("games.result.withElo", { score, elo: eloParts.join(", ") });
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
              <input class="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-input>
              <p class="muted small-note">PNG, JPG, WebP or GIF. Max 1 MB.</p>
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
    syncAppHash();
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
      ${state.me.isAdmin && user.id !== state.me.id ? adminPlayerToolsCard(user) : ""}
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
    state.adminPasswordReset = null;
    await loadTop();
    syncAppHash();
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
  wireAdminPlayerTools(user.id);
  wireAdminPendingGameButtons(user.id);
  wireGameButtons();
  wireChallengeProgressButtons();
}

function adminPlayerToolsCard(user) {
  const reset = state.adminPasswordReset?.userId === user.id ? state.adminPasswordReset : null;
  return `
    <div class="card panel">
      <div class="panel-header">
        <div>
          <h3>Admin account tools</h3>
          <p class="muted">Reset this player's password and share the temporary value.</p>
        </div>
      </div>
      <div class="row-actions">
        <button class="danger-button" data-admin-reset-password="${user.id}">Reset password</button>
      </div>
      ${reset ? `
        <div class="row-card admin-password-card">
          <div class="row-main">
            <div class="row-title">Temporary password</div>
            <div class="row-meta">Visible here until you leave this profile.</div>
          </div>
          <div class="row-actions">
            <code class="admin-password-value">${escapeHtml(reset.password)}</code>
            <button class="small-button" data-admin-copy-password="${escapeHtml(reset.password)}">Copy</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function wireAdminPlayerTools(profileUserId) {
  document.querySelector("[data-admin-reset-password]")?.addEventListener("click", async () => {
    const confirmed = window.confirm("Reset this player's password? Their active sessions will be signed out.");
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
      button.textContent = "Copied";
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
              <button class="small-button" data-admin-pending-confirm="${game.id}">Force confirm</button>
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
      await adminDeleteGame(Number(button.dataset.adminPendingDelete), profileUserId);
    });
  });
  document.querySelectorAll("[data-admin-pending-confirm]").forEach((button) => {
    button.addEventListener("click", async () => {
      await adminForceConfirmGame(Number(button.dataset.adminPendingConfirm), profileUserId);
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
  if (file.size > 1024 * 1024) {
    throw new Error("Avatar image must be 1 MB or smaller.");
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
  if (state.adminPasswordReset?.userId !== Number(userId)) state.adminPasswordReset = null;
  state.playerProfile = await api(`/api/users/${Number(userId)}`);
}

async function openPlayerProfile(userId) {
  const id = Number(userId);
  if (id === state.me.id) {
    state.adminPasswordReset = null;
    state.view = "profile";
    state.playerProfile = null;
    syncAppHash();
    renderShell();
    return;
  }
  await loadPlayerProfile(id);
  state.view = "player";
  syncAppHash();
  renderShell();
}

async function sendChallengeToUser(userId) {
  await api("/api/challenges", { method: "POST", body: { toUserId: Number(userId) } });
  await refresh();
}

function upsertChallengeProgress(progress) {
  if (!progress?.user?.id) return;
  const index = state.challengeProgress.findIndex((item) => item.user.id === progress.user.id);
  if (index === -1) state.challengeProgress.push(progress);
  else state.challengeProgress[index] = progress;
}

async function loadChallengeProgress(userId = null) {
  try {
    const targetUserId = Number(userId || state.selectedChallengeUserId || state.me.id);
    const data = await api(`/api/challenge-progress?userId=${targetUserId}`);
    (data.users || []).forEach(upsertChallengeProgress);
    state.challengeError = "";
    if (!state.selectedChallengeUserId) state.selectedChallengeUserId = targetUserId || state.me.id;
  } catch (err) {
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
  renderShell();
  await loadChallengeProgress(userId);
  if (state.view === "challenge" && Number(state.selectedChallengeUserId) === Number(userId)) {
    renderShell();
  }
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
    (state.adminGames || []).find((game) => game.id === id) ||
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
  syncAppHash();
  renderShell();
}

function renderGames() {
  const content = document.querySelector("[data-content]");
  const completedGames = state.allGames.filter((game) => game.status === "completed");
  const filteredGames = filterGames(completedGames);
  const activeTab = state.me?.isAdmin ? state.gamesTab : "history";
  if (state.gamesTab !== activeTab) state.gamesTab = activeTab;
  content.innerHTML = `
    ${pageTabs("games", [
      { id: "history", label: t("games.tabs.completed") },
      { id: "sessions", label: t("games.tabs.sessions") }
    ], activeTab)}
    ${activeTab === "sessions" ? adminActiveGamesPanel() : `
      <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("games.title")}</h2>
          <p class="muted">${t("games.hint")}</p>
        </div>
      </div>
      <div class="filter-row games-filter-row">
        <div class="field compact-field">
          <label>${t("games.filter.playerLabel")}</label>
          <div class="filter-suggest-field">
            <input type="search" data-games-player-filter value="${escapeHtml(state.gameFilters.playerQuery)}" placeholder="${t("games.filter.playerPlaceholder")}" autocomplete="off">
            <div class="filter-suggestions" data-games-player-suggestions hidden></div>
          </div>
        </div>
        <div class="field compact-field">
          <label>${t("games.filter.teamLabel")}</label>
          <select data-games-team-filter>
            <option value="">${t("games.filter.allTeams")}</option>
            ${killTeamOptions.map((team) => `<option value="${escapeHtml(team)}" ${state.gameFilters.team === team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="filter-summary" data-games-filter-summary>${gamesFilterSummary(filteredGames.length, completedGames.length)}</div>
      <div class="list" data-games-list>${gamesListMarkup(filteredGames)}</div>
      </section>
    `}
  `;
  wirePageTabs();
  if (activeTab === "sessions") {
    wireAdminGameButtons();
  } else {
    wireGameFilters();
    wireGameButtons();
  }
}

function filterGames(games) {
  const playerId = Number(state.gameFilters.playerId);
  const hasPlayerFilter = Number.isInteger(playerId) && playerId > 0;
  const playerNeedle = state.gameFilters.playerQuery.trim();
  const teamFilter = state.gameFilters.team;
  return games.filter((game) => {
    const playerMatch = hasPlayerFilter
      ? (game.players || []).some((player) => Number(player.id) === playerId)
      : !playerNeedle || (game.players || []).some((player) => searchTextMatches(player.name, playerNeedle));
    const teamMatch = !teamFilter || gameScoreEntries(game).some((entry) => entry.team === teamFilter);
    return playerMatch && teamMatch;
  });
}

function gamePlayerFilterOptions(games) {
  const players = new Map();
  for (const game of games) {
    const seenInGame = new Set();
    for (const player of game.players || []) {
      const id = Number(player.id);
      if (!Number.isInteger(id) || id <= 0 || seenInGame.has(id)) continue;
      seenInGame.add(id);
      if (!players.has(id)) {
        const name = String(player.name || "").trim() || t("games.filter.playerFallback", { id });
        players.set(id, { id, name, games: 0 });
      }
      players.get(id).games += 1;
    }
  }
  return [...players.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
}

function gamePlayerSuggestionOptions(games, query) {
  const needle = query.trim();
  return gamePlayerFilterOptions(games)
    .filter((player) => !needle || searchTextMatches(player.name, needle))
    .sort((a, b) => {
      const aStarts = searchTextStartsWith(a.name, needle);
      const bStarts = searchTextStartsWith(b.name, needle);
      return Number(!aStarts) - Number(!bStarts) || b.games - a.games || a.name.localeCompare(b.name) || a.id - b.id;
    })
    .slice(0, 8);
}

function gamesFilterSummary(count, total) {
  return plural("games.filterSummary", total, { count });
}

function gamesListMarkup(games) {
  if (state.gamesError) {
    return `<div class="empty">${t("games.list.loadError", { error: escapeHtml(state.gamesError) })}</div>`;
  }
  return games.length ? games.map(gameCard).join("") : `<div class="empty">${t("games.list.empty")}</div>`;
}

function renderGamePlayerSuggestions() {
  const box = document.querySelector("[data-games-player-suggestions]");
  const input = document.querySelector("[data-games-player-filter]");
  if (!box || !input) return;
  const completedGames = state.allGames.filter((game) => game.status === "completed");
  const options = gamePlayerSuggestionOptions(completedGames, input.value);
  box.innerHTML = options.length
    ? options.map((player) => `
      <button class="filter-suggestion" type="button" data-games-player-suggestion="${player.id}" data-games-player-name="${escapeHtml(player.name)}">
        <span>${escapeHtml(player.name)}</span>
        <small>${plural("games.count", player.games)}</small>
      </button>
    `).join("")
    : `<div class="filter-suggestion-empty">${t("games.filter.noPlayersFound")}</div>`;
  box.hidden = false;
}

function closeGamePlayerSuggestions() {
  const box = document.querySelector("[data-games-player-suggestions]");
  if (box) box.hidden = true;
}

function refreshGamesList() {
  const list = document.querySelector("[data-games-list]");
  if (!list) return;
  const completedGames = state.allGames.filter((game) => game.status === "completed");
  const filteredGames = filterGames(completedGames);
  list.innerHTML = gamesListMarkup(filteredGames);
  const summary = document.querySelector("[data-games-filter-summary]");
  if (summary) summary.textContent = gamesFilterSummary(filteredGames.length, completedGames.length);
  wireGameButtons();
}

function wireGameFilters() {
  const playerInput = document.querySelector("[data-games-player-filter]");
  const suggestionBox = document.querySelector("[data-games-player-suggestions]");
  playerInput?.addEventListener("input", (event) => {
    state.gameFilters.playerQuery = event.target.value;
    state.gameFilters.playerId = "";
    refreshGamesList();
    renderGamePlayerSuggestions();
  });
  playerInput?.addEventListener("focus", () => renderGamePlayerSuggestions());
  playerInput?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeGamePlayerSuggestions();
    if (event.key !== "Enter") return;
    const first = suggestionBox?.querySelector("[data-games-player-suggestion]");
    if (!first || suggestionBox.hidden) return;
    event.preventDefault();
    chooseGamePlayerSuggestion(first);
  });
  playerInput?.addEventListener("blur", () => {
    window.setTimeout(closeGamePlayerSuggestions, 120);
  });
  suggestionBox?.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-games-player-suggestion]");
    if (!button) return;
    event.preventDefault();
    chooseGamePlayerSuggestion(button);
  });
  document.querySelector("[data-games-team-filter]")?.addEventListener("change", (event) => {
    state.gameFilters.team = event.target.value;
    refreshGamesList();
  });
}

function chooseGamePlayerSuggestion(button) {
  const input = document.querySelector("[data-games-player-filter]");
  state.gameFilters.playerId = button.dataset.gamesPlayerSuggestion;
  state.gameFilters.playerQuery = button.dataset.gamesPlayerName || "";
  if (input) input.value = state.gameFilters.playerQuery;
  closeGamePlayerSuggestions();
  refreshGamesList();
}

function renderStatistics() {
  const content = document.querySelector("[data-content]");
  const games = state.allGames || [];
  const season = activeSeason();
  const seasonGames = filterGamesBySeason(games, season);
  const showSeasonSelector = ["killTeamWinrates", "teams"].includes(state.statisticsTab);
  const killTeamSummary = killTeamWinrateSummary(seasonGames);
  const statisticsContent = state.statisticsTab === "teams"
    ? state.selectedStatisticsTeam
      ? renderTeamDetail(teamDetailSummary(state.selectedStatisticsTeam, seasonGames), season)
      : renderTeamCards(killTeamSummary)
    : state.statisticsTab === "tacOpWinrates"
      ? renderTacOpWinrates(tacOpWinrateSummary(seasonGames, state.statisticsFilters))
      : renderKillTeamWinrates(killTeamSummary);
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("stats.title")}</h2>
          <p class="muted">${t("stats.hint")}</p>
        </div>
      </div>
      <div class="tabs stats-tabs">
        <button class="tab ${state.statisticsTab === "killTeamWinrates" ? "active" : ""}" data-statistics-tab="killTeamWinrates">${t("stats.tab.killTeamWinrates")}</button>
        <button class="tab ${state.statisticsTab === "tacOpWinrates" ? "active" : ""}" data-statistics-tab="tacOpWinrates">${t("stats.tab.tacOpWinrates")}</button>
        <button class="tab ${state.statisticsTab === "teams" ? "active" : ""}" data-statistics-tab="teams">${t("stats.tab.teams")}</button>
      </div>
      ${showSeasonSelector ? seasonSelectorMarkup() : ""}
      ${["killTeamWinrates", "tacOpWinrates"].includes(state.statisticsTab) ? statsFiltersMarkup() : ""}
      ${state.gamesError
        ? `<div class="empty">${t("stats.error.loadFailed", { error: escapeHtml(state.gamesError) })}</div>`
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
  document.querySelector("[data-season-select]")?.addEventListener("change", (event) => {
    state.selectedSeasonId = event.target.value;
    state.selectedStatisticsTeam = null;
    renderStatistics();
  });
  wireStatsFilters();
  wireStatsSorting();
  wireTeamStatistics();
}

function activeSeason() {
  return seasons.find((season) => season.id === state.selectedSeasonId) || seasons[0];
}

function seasonSelectorMarkup() {
  return `
    <div class="stats-season-row">
      <label for="stats-season">${t("tournaments.field.season")}</label>
      <select id="stats-season" data-season-select>
        ${seasons.map((season) => `
          <option value="${escapeHtml(season.id)}" ${season.id === state.selectedSeasonId ? "selected" : ""}>${escapeHtml(season.name)}</option>
        `).join("")}
      </select>
    </div>
  `;
}

function statsFiltersMarkup() {
  return `
    <div class="filter-row stats-filter-row">
      <div class="field compact-field">
        <label>${t("stats.filter.classificationLabel")}</label>
        <select data-stats-classification-filter>
          <option value="all" ${state.statisticsFilters.classification === "all" ? "selected" : ""}>${t("stats.filter.all")}</option>
          <option value="classified" ${state.statisticsFilters.classification === "classified" ? "selected" : ""}>${t("stats.classification.classified")}</option>
          <option value="non-classified" ${state.statisticsFilters.classification === "non-classified" ? "selected" : ""}>${t("stats.classification.nonClassified")}</option>
        </select>
      </div>
      <div class="field compact-field">
        <label>${t("games.filter.teamLabel")}</label>
        <select data-stats-team-filter>
          <option value="">${t("games.filter.allTeams")}</option>
          ${killTeamOptions.map((team) => `<option value="${escapeHtml(team)}" ${state.statisticsFilters.team === team ? "selected" : ""}>${escapeHtml(team)}</option>`).join("")}
        </select>
      </div>
    </div>
  `;
}

function wireStatsFilters() {
  document.querySelector("[data-stats-classification-filter]")?.addEventListener("change", (event) => {
    state.statisticsFilters.classification = event.target.value;
    renderStatistics();
  });
  document.querySelector("[data-stats-team-filter]")?.addEventListener("change", (event) => {
    state.statisticsFilters.team = event.target.value;
    renderStatistics();
  });
}

function wireStatsSorting() {
  document.querySelectorAll("[data-stats-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.statsSort;
      if (state.statisticsSort.key === key) {
        state.statisticsSort.dir = state.statisticsSort.dir === "asc" ? "desc" : "asc";
      } else {
        state.statisticsSort.key = key;
        state.statisticsSort.dir = key === "team" || key === "tacOp" ? "asc" : "desc";
      }
      renderStatistics();
    });
  });
}

function filterGamesBySeason(games, season) {
  if (!season) return games;
  return games.filter((game) => {
    if (game.sourceType === "tournament_match" && game.tournament?.seasonId) {
      return game.tournament.seasonId === season.id;
    }
    const timestamp = game.submittedAt || game.result?.confirmedAt || game.createdAt || "";
    if (!timestamp) return true;
    const time = Date.parse(timestamp);
    if (Number.isNaN(time)) return true;
    if (season.startsAt && time < Date.parse(season.startsAt)) return false;
    if (season.endsAt && time >= Date.parse(season.endsAt)) return false;
    return true;
  });
}

function renderKillTeamWinrates(summary) {
  const rows = sortedStatRows(applyStatsTeamFilters(summary.rows), ["team", "games", "wins", "losses", "draws", "winRate"], "winRate");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortableHeader(t("games.filter.teamLabel"), "team")}
            ${sortableHeader(t("stats.column.games"), "games")}
            ${sortableHeader(t("stats.column.wins"), "wins")}
            ${sortableHeader(t("stats.column.losses"), "losses")}
            ${sortableHeader(t("stats.column.draws"), "draws")}
            ${sortableHeader(t("stats.column.winrate"), "winRate")}
          </tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map((row) => `
              <tr>
                <td><button class="text-link-button" data-stat-team="${escapeHtml(row.team)}">${escapeHtml(row.team)}</button></td>
                <td>${row.games}</td>
                <td>${row.wins}</td>
                <td>${row.losses}</td>
                <td>${row.draws}</td>
                <td><span class="rating-pill stat-rate">${row.winRate}%</span></td>
              </tr>
            `).join("")
            : `<tr><td colspan="6">${t("stats.empty.killTeam")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderTacOpWinrates(summary) {
  const rows = sortedStatRows(summary.rows, ["tacOp", "games", "wins", "winRate", "avgPoints", "avgPrimaryPoints"], "winRate");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortableHeader(t("stats.column.tacOp"), "tacOp")}
            ${sortableHeader(t("stats.column.games"), "games")}
            ${sortableHeader(t("stats.column.wins"), "wins")}
            ${sortableHeader(t("stats.column.winrate"), "winRate")}
            ${sortableHeader(t("stats.column.avgVp"), "avgPoints")}
            ${sortableHeader(t("stats.column.avgVpAsPrimary"), "avgPrimaryPoints")}
          </tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.tacOp)}</strong></td>
                <td>${row.games}</td>
                <td>${row.wins}</td>
                <td><span class="rating-pill stat-rate">${row.winRate}%</span></td>
                <td>${row.avgPoints}</td>
                <td>${row.avgPrimaryPoints}</td>
              </tr>
            `).join("")
            : `<tr><td colspan="6">${t("stats.empty.tacOp")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function sortableHeader(label, key) {
  const active = state.statisticsSort.key === key;
  const marker = active ? (state.statisticsSort.dir === "asc" ? " ^" : " v") : "";
  return `<th><button class="sort-button" data-stats-sort="${escapeHtml(key)}">${escapeHtml(label)}${marker}</button></th>`;
}

function sortedStatRows(rows, allowedKeys, defaultKey) {
  const key = allowedKeys.includes(state.statisticsSort.key) ? state.statisticsSort.key : defaultKey;
  const dir = state.statisticsSort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareStatValues(a[key], b[key]) * dir || String(a.team || a.tacOp || "").localeCompare(String(b.team || b.tacOp || "")));
}

function compareStatValues(a, b) {
  const aNumber = statSortNumber(a);
  const bNumber = statSortNumber(b);
  if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  return String(a || "").localeCompare(String(b || ""));
}

function statSortNumber(value) {
  if (value === "-" || value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function applyStatsTeamFilters(rows) {
  return rows.filter((row) => statsTeamFilterMatches(row.team));
}

function statsTeamFilterMatches(team) {
  return statsTeamFilterMatchesWithFilters(team, state.statisticsFilters);
}

function renderTeamCards(summary) {
  const rows = teamCardRows(summary);
  return `
    <div class="team-card-grid">
      ${rows.length
        ? rows.map((row) => `
          <button class="team-stat-card" data-stat-team="${escapeHtml(row.team)}">
            <img class="team-stat-logo" src="${killTeamLogoSrc(row.team)}" alt="">
            <span>${row.games ? plural("games.count", row.games) : t("stats.card.noGames")}</span>
            <strong>${escapeHtml(row.team)}</strong>
            <div class="team-stat-rate">${row.winRate}%</div>
          </button>
        `).join("")
        : `<div class="empty">${t("stats.empty.killTeam")}</div>`}
    </div>
  `;
}

function teamCardRows(summary) {
  const activeRows = summary.rows || [];
  const activeTeams = new Set(activeRows.map((row) => row.team));
  const inactiveRows = killTeamOptions
    .filter((team) => !activeTeams.has(team))
    .map((team) => ({ team, games: 0, wins: 0, losses: 0, draws: 0, winRate: 0 }));
  return [...activeRows, ...inactiveRows];
}

function renderTeamDetail(detail) {
  const classification = killTeamClassification(detail.team);
  return `
    <div class="team-detail">
      <div class="team-detail-hero">
        <button class="small-button" data-team-back>${t("stats.tab.teams")}</button>
        <img class="team-detail-logo" src="${killTeamLogoSrc(detail.team)}" alt="">
        <div class="team-detail-main">
          <p class="profile-label">${t("games.filter.teamLabel")}</p>
          <h3>${escapeHtml(detail.team)}</h3>
          <span class="team-classification ${classification === "Non-Classified" ? "non-classified" : "classified"}">${t(
            classification === "Non-Classified"
              ? "stats.classification.nonClassified"
              : "stats.classification.classified"
          )}</span>
          <p class="muted">${plural("games.count", detail.games)} · ${plural("stats.count.wins", detail.wins)} · ${plural("stats.count.losses", detail.losses)} · ${plural("stats.count.draws", detail.draws)}</p>
        </div>
        <div class="profile-rating team-detail-rate">
          <span>${detail.winRate}%</span>
          <small>${t("stats.column.winrate")}</small>
        </div>
        <a class="small-button" href="${killTeamRulesUrl(detail.team)}" target="_blank" rel="noreferrer">${t("stats.team.rules")}</a>
      </div>

      <section class="grid-2 team-detail-grid">
        <div class="team-detail-section">
          <div class="panel-header"><h3>${t("stats.team.recentGames.title")}</h3></div>
          <div class="list">
            ${detail.recentGames.length
              ? detail.recentGames.map((item) => teamRecentGameCard(item)).join("")
              : `<div class="empty">${t("stats.empty.teamGames")}</div>`}
          </div>
        </div>
        <div class="team-detail-section">
          <div class="panel-header"><h3>${t("stats.team.bestPlayers.title")}</h3></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>${t("games.filter.playerLabel")}</th><th>${t("stats.column.games")}</th><th>${t("stats.column.wins")}</th><th>${t("stats.column.winrate")}</th></tr></thead>
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
                  : `<tr><td colspan="4">${t("stats.empty.players")}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="team-detail-section">
        <div class="panel-header"><h3>${t("stats.team.matchups.title")}</h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>${t("stats.column.opponent")}</th><th>${t("stats.column.games")}</th><th>${t("stats.column.wins")}</th><th>${t("stats.column.losses")}</th><th>${t("stats.column.draws")}</th><th>${t("stats.column.winrate")}</th></tr></thead>
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
                : `<tr><td colspan="6">${t("stats.empty.matchups")}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function killTeamClassification(team) {
  return nonClassifiedKillTeams.has(canonicalKillTeamName(team)) ? "Non-Classified" : "Classified";
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

function tacOpWinrateSummary(games, filters = { classification: "all", team: "" }) {
  const stats = new Map();
  const completedGames = games.filter((item) => item.status === "completed" && item.result);
  let totalPicks = 0;

  for (const game of completedGames) {
    const winnerId = game.result.winnerId ? Number(game.result.winnerId) : null;
    for (const entry of gameScoreEntries(game)) {
      const { player, score, team } = entry;
      if (!statsTeamFilterMatchesWithFilters(team, filters)) continue;
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

function gameScoreEntries(game) {
  return (game.players || []).map((player) => {
    const score = game.result?.scores?.[player.id] || game.pendingResult?.result?.scores?.[player.id] || {};
    return {
      player,
      score,
      team: canonicalKillTeamName(score.faction || score.killTeam || score.team)
    };
  }).filter((entry) => entry.team);
}

function statsTeamFilterMatchesWithFilters(team, filters) {
  const canonical = canonicalKillTeamName(team);
  if (filters.team && canonical !== filters.team) return false;
  if (filters.classification === "classified" && killTeamClassification(canonical) !== "Classified") return false;
  if (filters.classification === "non-classified" && killTeamClassification(canonical) !== "Non-Classified") return false;
  return true;
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
  const resultLabel = item.result === "win" ? t("stats.result.won") : item.result === "loss" ? t("stats.result.lost") : t("stats.result.draw");
  const resultStatus = item.result === "win" ? t("stats.result.status.win") : item.result === "loss" ? t("stats.result.status.loss") : t("stats.result.status.draw");
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(item.player.name)} vs ${escapeHtml(item.opponent.name)}</div>
        <div class="row-meta">${resultLabel}, ${score}-${opponentScore} · vs ${escapeHtml(item.opponentTeam)} · ${fmtDate(item.game.submittedAt || item.game.createdAt)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${item.result === "win" ? "completed" : item.result === "loss" ? "pending" : "open"}">${resultStatus}</span>
        <button class="small-button" data-game-open="${item.game.id}">${t("play.action.details")}</button>
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

function searchKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/[`'’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function compactSearchKey(value) {
  return searchKey(value).replace(/\s+/g, "");
}

function searchTextMatches(text, query) {
  const rawText = String(text || "").toLowerCase();
  const rawQuery = String(query || "").trim().toLowerCase();
  const queryKey = searchKey(query);
  if (!rawQuery && !queryKey) return true;
  if (rawQuery && rawText.includes(rawQuery)) return true;
  if (!queryKey) return false;
  const textKey = searchKey(text);
  return textKey.includes(queryKey) || compactSearchKey(text).includes(compactSearchKey(query));
}

function searchTextStartsWith(text, query) {
  const rawQuery = String(query || "").trim().toLowerCase();
  const queryKey = searchKey(query);
  if (!rawQuery && !queryKey) return true;
  return String(text || "").toLowerCase().startsWith(rawQuery) || searchKey(text).startsWith(queryKey);
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

function comboOptionMatchesQuery(option, query) {
  const optionLabel = comboOptionLabel(option);
  if (searchTextMatches(comboOptionSearchText(option), query)) return true;
  const canonicalQuery = canonicalKillTeamName(query);
  return Boolean(canonicalQuery) && searchKey(canonicalQuery) === searchKey(optionLabel);
}

function comboOptionStartsWithQuery(option, query) {
  return searchTextStartsWith(comboOptionSearchText(option), query);
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
    ${activeProgress ? challengeDetail(activeProgress) : `<section class="card panel"><div class="empty">Loading challenge progress...</div></section>`}
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
    return moveChallengeTeamToEnd(progress?.tracks?.classified || classifiedFallbackProgress(progress), "Dragon Masters");
  }
  return moveChallengeTeamToEnd(progress?.tracks?.allKillTeam || allKillTeamFallbackProgress(progress), "Dragon Masters");
}

function classifiedFallbackProgress(progress) {
  if (!progress) return progress;
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
  const logoVersions = {
    "Dragon Masters": "20260724-transparent-1"
  };
  const fileName = logoFiles[team] || `${team}.png`;
  const version = logoVersions[team];
  return `/kill-team-logos/${encodeURIComponent(fileName)}${version ? `?v=${version}` : ""}`;
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
    const data = await api(`/api/admin/users/${userId}/challenge-credit`, { method: "POST", body: { team, action, track: state.challengeTab } });
    upsertChallengeProgress(data.progress);
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
    content.innerHTML = `<section class="card panel"><div class="empty">${t("games.detail.notFound")}</div></section>`;
    return;
  }

  const result = game.result || game.pendingResult?.result || null;
  const statusLabel = game.status === "completed" ? t("play.game.status.completed") : game.status === "pending_confirmation" ? t("play.game.status.pending") : t("play.game.status.active");
  const submitter = game.players?.find((player) => player.id === game.pendingResult?.submittedBy || player.id === game.submittedBy);
  const isParticipant = game.players?.some((player) => player.id === state.me.id);
  const canDeletePending = isParticipant && game.status === "pending_confirmation" && game.pendingResult?.submittedBy === state.me.id;
  const playerAction = isParticipant && game.status === "open"
    ? `<button class="primary-button" data-game-result="${game.id}">${t("play.action.enterResult")}</button>
       <button class="danger-button" data-exit-game="${game.id}">${t("play.action.exitGame")}</button>`
    : canDeletePending
      ? `<button class="danger-button" data-exit-game="${game.id}">${t("play.action.deletePending")}</button>`
    : "";
  const adminAction = state.me.isAdmin
    ? `<button class="primary-button" data-admin-edit-game="${game.id}">${result ? t("play.action.editResult") : t("play.action.enterResult")}</button>
       ${game.status === "pending_confirmation" && game.pendingResult?.result ? `<button class="small-button" data-admin-confirm-game="${game.id}">${t("games.detail.forceConfirm")}</button>` : ""}
       ${["open", "pending_confirmation"].includes(game.status) ? `<button class="danger-button" data-admin-delete-game="${game.id}">${t("games.detail.deleteGame")}</button>` : ""}`
    : "";

  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("games.detail.title", { id: game.id })}</h2>
          <p class="muted">${gamePlayerLinks(game)} &middot; ${fmtDate(game.createdAt)}</p>
        </div>
        <div class="row-actions">
          <span class="status ${game.status === "completed" ? "completed" : game.status === "pending_confirmation" ? "pending" : "open"}">${statusLabel}</span>
          <button class="ghost-button" data-back-games>${t("games.detail.backToGames")}</button>
          ${playerAction}
          ${adminAction}
        </div>
      </div>
      ${result ? `
        <div class="result-headline">${escapeHtml(resultHeadline(game, result))}</div>
        ${submitter ? `<p class="muted">${t("games.detail.submittedBy", { name: escapeHtml(submitter.name) })}${game.submittedAt ? ` &middot; ${fmtDate(game.submittedAt)}` : ""}</p>` : ""}
        ${killzoneReview(result)}
        <div class="score-grid">
          ${game.players.map((player) => reviewScoreCard(player, result.scores?.[player.id])).join("")}
        </div>
        ${result.tiebreakers?.enabled ? tieBreakerReview(game, result) : ""}
        ${game.elo ? eloReview(game) : ""}
      ` : `
        <div class="empty">${t("games.detail.noResult")}</div>
      `}
      <div class="message" data-message></div>
    </section>
  `;

  document.querySelector("[data-back-games]").addEventListener("click", async () => {
    state.view = "games";
    state.selectedGameId = null;
    await loadGames();
    syncAppHash();
    renderShell();
  });
  document.querySelector("[data-admin-edit-game]")?.addEventListener("click", () => {
    renderResultForm(game.id, { adminEdit: true });
  });
  document.querySelector("[data-admin-delete-game]")?.addEventListener("click", (event) => {
    adminDeleteGame(Number(event.currentTarget.dataset.adminDeleteGame));
  });
  document.querySelector("[data-admin-confirm-game]")?.addEventListener("click", (event) => {
    adminForceConfirmGame(Number(event.currentTarget.dataset.adminConfirmGame));
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
  return (game.players || []).map((player) => player.name).join(" vs ") || t("games.detail.deletedPlayers");
}

function gamePlayerLinks(game) {
  const players = game.players || [];
  if (!players.length) return t("games.detail.deletedPlayers");
  return players.map((player) => playerProfileLink(player)).join(" vs ");
}

function playerProfileLink(player) {
  return `<button class="text-link-button inline-profile-link" type="button" data-profile-user="${player.id}">${escapeHtml(player.name)}</button>`;
}

function tournamentParticipantProfileLink(participant, fallbackName = t("tournaments.participant.fallback")) {
  const displayName = participant?.displayName || fallbackName;
  if (!state.me || !participant?.userId) return escapeHtml(displayName);
  return playerProfileLink({ id: participant.userId, name: displayName });
}

function eloReview(game) {
  return `
    <section class="card metric-card elo-detail-card">
      <span>${t("games.detail.eloChanges")}</span>
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
    box.innerHTML = `<div class="empty">${t("play.search.hint")}</div>`;
    return;
  }

  box.innerHTML = `<div class="empty">${t("play.search.searching")}</div>`;
  searchDebounce = setTimeout(() => searchUsers(), 220);
}

async function searchUsers(options = {}) {
  const { allowEmpty = false } = options;
  const input = document.querySelector("[data-search-input]");
  const box = document.querySelector("[data-search-results]");
  const raw = input.value.trim();
  if (!raw && !allowEmpty) {
    state.searchResults = [];
    box.innerHTML = `<div class="empty">${t("play.search.hint")}</div>`;
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
        <button class="primary-button" data-challenge-user="${user.id}">${t("play.search.challengeAction")}</button>
      </div>
    </div>
  `).join("") : `<div class="empty">${t("play.search.empty")}</div>`;

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
  document.querySelectorAll("[data-challenge-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      try {
        await copyText(button.dataset.challengeShare);
        button.textContent = "Copied";
        button.disabled = true;
        window.setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 1400);
      } catch (err) {
        window.alert(err.message);
      }
    });
  });
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
  document.querySelectorAll("[data-tournament-game-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const game = getKnownTournamentGame(Number(button.dataset.tournamentGameOpen));
      const slug = game?.tournament?.slug;
      navigateToPublicTournament(slug);
    });
  });
  document.querySelectorAll("[data-tournament-game-result]").forEach((button) => {
    button.addEventListener("click", () => {
      const game = getKnownTournamentGame(Number(button.dataset.tournamentGameResult));
      const match = game?.tournamentMatch;
      const admin = button.dataset.tournamentGameAdminResult === "1";
      if (match) renderTournamentResultForm(tournamentMatchDataFromGame(game), match, { admin, returnTo: "play" });
    });
  });
  document.querySelectorAll("[data-tournament-game-review]").forEach((button) => {
    button.addEventListener("click", () => {
      const game = getKnownTournamentGame(Number(button.dataset.tournamentGameReview));
      const match = game?.tournamentMatch;
      if (match) renderTournamentResultReview(tournamentMatchDataFromGame(game), match, { returnTo: "play" });
    });
  });
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
    syncAppHash();
    renderShell();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function adminDeleteGame(gameId, profileUserId = null) {
  const game = getKnownGame(gameId);
  const confirmed = window.confirm(`Delete this ${game?.status === "pending_confirmation" ? "pending" : "active"} game? The match will be closed without Elo changes.`);
  if (!confirmed) return;
  try {
    await api(`/api/admin/games/${gameId}`, { method: "DELETE" });
    await refresh();
    if (state.me?.isAdmin) await loadAdminGames();
    await loadGames();
    if (profileUserId) {
      await loadPlayerProfile(profileUserId);
      renderShell();
      setPlayerProfileMessage("Game deleted.");
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
  const confirmed = window.confirm("Force confirm this submitted result? Elo changes will be applied.");
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
      setPlayerProfileMessage("Result force confirmed.");
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
          <h2>${adminEdit ? t("games.result.editTitle") : t("games.result.title")}</h2>
          <p class="muted">${t("games.result.hint")}</p>
        </div>
        <div class="row-actions">
          ${canExitFromForm ? `<button class="danger-button" type="button" data-exit-game="${game.id}">${game.status === "pending_confirmation" ? t("play.action.deletePending") : t("play.action.exitGame")}</button>` : ""}
          <button class="ghost-button" type="button" data-back>${t("games.result.back")}</button>
        </div>
      </div>
      <form class="result-form" data-result-form>
        <div class="score-grid">
          ${game.players.map((player) => scoreCard(player, existingResult?.scores?.[player.id])).join("")}
        </div>
        <section class="killzone-panel">
          <h3>${t("games.result.missionTitle")}</h3>
          <div class="killzone-grid">
            <div class="field">
              <label>${t("games.result.killzoneLabel")}</label>
              <select name="killzone">
                <option value="">${t("games.result.notSelected")}</option>
                ${killzoneOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${existingResult?.killzone?.killzone === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>${t("games.result.critOp")}</label>
              <select name="critOp">
                <option value="">${t("games.result.notSelected")}</option>
                ${critOpOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${existingResult?.killzone?.critOp === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>${t("games.result.layoutLabel")}</label>
              <select name="killzoneLayout">
                <option value="">${t("games.result.notSelected")}</option>
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
            <span>${t("games.result.tiebreaker.enable")}</span>
          </label>
          <div class="tiebreaker-menu" data-tiebreaker-menu ${existingResult?.tiebreakers?.enabled ? "" : "hidden"}>
            <ol class="tiebreaker-list">
              <li>${t("games.result.tiebreaker.primary")}</li>
              <li>${t("games.result.tiebreaker.tacCrit")}</li>
              <li>${t("games.result.tiebreaker.apl")}</li>
              <li>${t("games.result.tiebreaker.rollOff")}</li>
            </ol>
            <div class="tiebreaker-grid">
              ${game.players.map((player) => `
                <div class="field">
                  <label>${t("games.result.tiebreaker.aplPlayerLabel", { name: escapeHtml(player.name) })}</label>
                  <input data-tiebreaker-input name="apl-${player.id}" type="number" min="0" max="99" value="${existingResult?.tiebreakers?.apl?.[player.id] ?? 0}">
                </div>
              `).join("")}
              <div class="field">
                <label>${t("games.result.tiebreaker.rollOffWinnerLabel")}</label>
                <select data-tiebreaker-input name="rollOffWinnerId">
                  <option value="">${t("games.result.tiebreaker.selectIfTied")}</option>
                  ${game.players.map((player) => `<option value="${player.id}" ${existingResult?.tiebreakers?.rollOffWinnerId === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
                </select>
              </div>
            </div>
          </div>
          <div class="tiebreaker-live" data-result-preview></div>
        </section>
        ${debugRandomResultButtonMarkup()}
        <button class="primary-button" type="submit">${adminEdit ? t("games.result.saveAction") : t("games.result.submitAction")}</button>
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
  const resultForm = document.querySelector("[data-result-form]");
  resultForm.querySelector("[data-debug-random-result]")?.addEventListener("click", () => {
    fillDebugRandomResult(game.players);
    refreshResultPreview();
  });
  resultForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const path = adminEdit ? `/api/admin/games/${game.id}/result` : `/api/games/${game.id}/result`;
      await api(path, { method: "POST", body: approvedOpsPayloadFromForm(game.players) });
      await refresh();
      await loadTop();
      await loadGames();
      if (adminEdit) {
        state.selectedGameId = game.id;
        state.view = "gameDetail";
        syncAppHash();
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
          <h2>${t("games.review.title")}</h2>
          <p class="muted">${t("games.review.submittedBy", { name: escapeHtml(submitter?.name || t("games.review.opponentFallback")) })}</p>
        </div>
        <button class="ghost-button" data-back>${t("games.result.back")}</button>
      </div>
      <div class="result-headline">${escapeHtml(reviewSummary)}</div>
      ${killzoneReview(result)}
      <div class="score-grid">
        ${game.players.map((player) => reviewScoreCard(player, result.scores?.[player.id])).join("")}
      </div>
      ${result.tiebreakers?.enabled ? tieBreakerReview(game, result) : ""}
      <div class="review-actions">
        <button class="primary-button" data-confirm-result="${game.id}">${t("games.review.action.confirm")}</button>
        <button class="danger-button" data-reject-result="${game.id}">${t("games.review.action.reject")}</button>
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

function findTournamentMatch(data, matchId) {
  for (const round of data.rounds || []) {
    const match = (round.matches || []).find((item) => item.id === matchId);
    if (match) return match;
  }
  return null;
}

function participantResultPlayer(participant) {
  if (!participant) return null;
  return {
    id: participant.userId || -participant.id,
    participantId: participant.id,
    name: participant.displayName || participant.user?.name || "Player",
    faction: participant.faction || "",
    hasProfile: Boolean(participant.userId)
  };
}

function tournamentGameLike(match) {
  return {
    id: match.id,
    status: match.status,
    players: [participantResultPlayer(match.participantA), participantResultPlayer(match.participantB)].filter(Boolean),
    pendingResult: match.pendingResult,
    result: match.result
  };
}

function tournamentScoreForPlayer(existingResult, player) {
  const score = existingResult?.scores?.[player.id] || {};
  return {
    ...score,
    faction: score.faction || player.faction || ""
  };
}

function renderTournamentResultForm(data, match, options = {}) {
  const { admin = false, publicRoute = false, returnTo = "" } = options;
  const tournament = data.tournament || {};
  const game = tournamentGameLike(match);
  if (game.players.length !== 2) return;
  const existingResult = match.result || match.pendingResult?.result || null;
  const missionDefaults = existingResult?.killzone || match.mission || {};
  const panel = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("tournaments.result.title")}</h2>
          <p class="muted">${escapeHtml(tournament.name || t("tournaments.fallbackName"))} / ${t("tournaments.result.roundMatch", { round: match.roundNumber, match: match.bracketPosition })}</p>
        </div>
        <button class="ghost-button" type="button" data-tournament-result-back>${t("games.result.back")}</button>
      </div>
      <form class="result-form" data-tournament-result-form>
        <div class="score-grid">
          ${game.players.map((player) => scoreCard(player, tournamentScoreForPlayer(existingResult, player))).join("")}
        </div>
        <section class="killzone-panel">
          <h3>${t("games.result.missionTitle")}</h3>
          <div class="killzone-grid">
            <div class="field">
              <label>${t("games.result.killzoneLabel")}</label>
              <select name="killzone">
                <option value="">${t("games.result.notSelected")}</option>
                ${killzoneOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${missionDefaults.killzone === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>${t("games.result.critOp")}</label>
              <select name="critOp">
                <option value="">${t("games.result.notSelected")}</option>
                ${critOpOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${missionDefaults.critOp === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>${t("games.result.layoutLabel")}</label>
              <select name="killzoneLayout">
                <option value="">${t("games.result.notSelected")}</option>
                ${[1, 2, 3, 4, 5, 6].map((layout) => `
                  <option value="${layout}" ${Number(missionDefaults.layout) === layout ? "selected" : ""}>${layout}</option>
                `).join("")}
              </select>
            </div>
          </div>
        </section>
        <section class="tiebreaker-panel">
          <label class="checkbox-line">
            <input type="checkbox" data-tiebreaker-enabled ${existingResult?.tiebreakers?.enabled ? "checked" : ""}>
            <span>${t("games.result.tiebreaker.enable")}</span>
          </label>
          <div class="tiebreaker-menu" data-tiebreaker-menu ${existingResult?.tiebreakers?.enabled ? "" : "hidden"}>
            <ol class="tiebreaker-list">
              <li>${t("games.result.tiebreaker.primary")}</li>
              <li>${t("games.result.tiebreaker.tacCrit")}</li>
              <li>${t("games.result.tiebreaker.apl")}</li>
              <li>${t("games.result.tiebreaker.rollOff")}</li>
            </ol>
            <div class="tiebreaker-grid">
              ${game.players.map((player) => `
                <div class="field">
                  <label>${t("games.result.tiebreaker.aplPlayerLabel", { name: escapeHtml(player.name) })}</label>
                  <input data-tiebreaker-input name="apl-${player.id}" type="number" min="0" max="99" value="${existingResult?.tiebreakers?.apl?.[player.id] ?? 0}">
                </div>
              `).join("")}
              <div class="field">
                <label>${t("games.result.tiebreaker.rollOffWinnerLabel")}</label>
                <select data-tiebreaker-input name="rollOffWinnerId">
                  <option value="">${t("games.result.tiebreaker.selectIfTied")}</option>
                  ${game.players.map((player) => `<option value="${player.id}" ${Number(existingResult?.tiebreakers?.rollOffWinnerId) === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
                </select>
              </div>
            </div>
          </div>
          <div class="tiebreaker-live" data-result-preview></div>
        </section>
        ${debugRandomResultButtonMarkup()}
        <button class="primary-button" type="submit">${admin ? t("tournaments.result.completeMatch") : t("games.result.submitAction")}</button>
        <div class="message" data-message></div>
      </form>
    </section>
  `;
  setTournamentResultContent(panel, publicRoute);

  document.querySelector("[data-tournament-result-back]").addEventListener("click", async () => {
    await returnFromTournamentResult(tournament, publicRoute, returnTo);
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
  const resultForm = document.querySelector("[data-tournament-result-form]");
  resultForm.querySelector("[data-debug-random-result]")?.addEventListener("click", () => {
    fillDebugRandomResult(game.players);
    refreshResultPreview();
  });
  resultForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const path = admin
        ? `/api/admin/tournaments/${tournament.id}/matches/${match.id}/result`
        : `/api/tournaments/${tournament.id}/matches/${match.id}/result`;
      await api(path, { method: "POST", body: approvedOpsPayloadFromForm(game.players) });
      await refresh();
      await loadTop();
      await loadGames();
      if (admin) await loadTournamentAdmin();
      await returnFromTournamentResult(tournament, publicRoute, returnTo);
    } catch (err) {
      setMessage(err.message, true);
    }
  });
  refreshResultPreview();
}

function renderTournamentResultReview(data, match, options = {}) {
  const { publicRoute = false, returnTo = "" } = options;
  const tournament = data.tournament || {};
  const game = tournamentGameLike(match);
  const result = match.pendingResult?.result;
  if (!result || game.players.length !== 2) return;
  const submitter = game.players.find((player) => player.id === match.pendingResult?.submittedBy);
  const panel = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("tournaments.review.title")}</h2>
          <p class="muted">${t("games.review.submittedBy", { name: escapeHtml(submitter?.name || t("games.review.opponentFallback")) })}</p>
        </div>
        <button class="ghost-button" data-tournament-review-back>${t("games.result.back")}</button>
      </div>
      <div class="result-headline">${escapeHtml(resultHeadline(game, result))}</div>
      ${killzoneReview(result)}
      <div class="score-grid">
        ${game.players.map((player) => reviewScoreCard(player, result.scores?.[player.id])).join("")}
      </div>
      ${result.tiebreakers?.enabled ? tieBreakerReview(game, result) : ""}
      <div class="review-actions">
        <button class="primary-button" data-tournament-confirm-result="${match.id}">${t("games.review.action.confirm")}</button>
        <button class="danger-button" data-tournament-reject-result="${match.id}">${t("games.review.action.reject")}</button>
      </div>
      <div class="message" data-message></div>
    </section>
  `;
  setTournamentResultContent(panel, publicRoute);
  document.querySelector("[data-tournament-review-back]").addEventListener("click", async () => {
    await returnFromTournamentResult(tournament, publicRoute, returnTo);
  });
  document.querySelector("[data-tournament-confirm-result]").addEventListener("click", async () => {
    try {
      await api(`/api/tournaments/${tournament.id}/matches/${match.id}/confirm-result`, { method: "POST" });
      await refresh();
      await loadTop();
      await loadGames();
      await returnFromTournamentResult(tournament, publicRoute, returnTo);
    } catch (err) {
      setMessage(err.message, true);
    }
  });
  document.querySelector("[data-tournament-reject-result]").addEventListener("click", async () => {
    try {
      await api(`/api/tournaments/${tournament.id}/matches/${match.id}/reject-result`, { method: "POST" });
      await returnFromTournamentResult(tournament, publicRoute, returnTo);
    } catch (err) {
      setMessage(err.message, true);
    }
  });
  wireLeaderboardProfiles();
}

function setTournamentResultContent(panel, publicRoute) {
  const content = document.querySelector("[data-content]");
  if (content && !publicRoute) {
    content.innerHTML = panel;
    return;
  }
  app.innerHTML = `<main class="public-tournament-layout">${panel}</main>`;
}

async function returnFromTournamentResult(tournament, publicRoute, returnTo = "") {
  if (returnTo === "play") {
    await refresh();
    await loadGames();
    state.view = "play";
    state.selectedGameId = null;
    syncAppHash();
    renderShell();
    return;
  }
  if (publicRoute) {
    await renderPublicTournamentRoute(tournament.slug);
    return;
  }
  state.view = "tournaments";
  state.tournamentsTab = "admin";
  state.adminTournamentMode = "detail";
  await loadTournamentAdmin();
  syncAppHash();
  renderShell();
}

function killzoneReview(result = {}) {
  const killzone = result.killzone || {};
  const hasKillzone = Boolean(killzone.killzone);
  const hasCritOp = Boolean(killzone.critOp);
  const hasLayout = Boolean(killzone.layout);
  if (!hasKillzone && !hasCritOp && !hasLayout) return "";
  const text = [
    hasKillzone ? t("tournaments.mission.killzone", { name: killzone.killzone }) : "",
    hasCritOp ? t("tournaments.mission.critOp", { name: killzone.critOp }) : "",
    hasLayout ? t("tournaments.mission.layout", { layout: killzone.layout }) : ""
  ].filter(Boolean).join(" / ");
  return `<div class="killzone-review">${escapeHtml(text)}</div>`;
}

function reviewScoreCard(player, score = {}) {
  return `
    <div class="score-card review-score-card">
      <h4>${playerNameMarkup(player)}</h4>
      <div class="review-lines">
        ${metricRow(t("games.filter.teamLabel"), score.faction ? canonicalKillTeamName(score.faction) : "-")}
        ${metricRow(t("op.tac"), score.tacOp || "-")}
        ${metricRow(t("op.crit"), score.crit ?? 0)}
        ${metricRow(t("tournaments.review.tacOpVp"), score.tac ?? 0)}
        ${metricRow(t("op.kill"), score.kill ?? 0)}
        ${metricRow(t("games.result.tiebreaker.primary"), opLabels[score.primary] ? t(opLabels[score.primary]) : t("op.crit"))}
        ${metricRow(t("tournaments.review.primaryBonus"), score.primaryBonus ?? 0)}
      </div>
      <div class="total-line">
        <span>${t("tournaments.score.total")}</span>
        <span>${score.total ?? 0} VP</span>
      </div>
    </div>
  `;
}

function playerNameMarkup(player) {
  return player?.id > 0 && player.hasProfile !== false
    ? playerProfileLink(player)
    : escapeHtml(player?.name || t("tournaments.player.fallback"));
}

function tieBreakerReview(game, result) {
  const summary = tieBreakerReviewSummary(game, result);
  const winner = game.players.find((player) => player.id === summary.winnerId);
  const winnerText = winner && summary.decidedBy
    ? t("tournaments.tiebreaker.winnerBy", { name: winner.name, reason: tieBreakerLabel(summary.decidedBy) })
    : winner?.name || t("tournaments.tiebreaker.draw");
  return `
    <section class="tiebreaker-panel">
      <h3>${t("tournaments.tiebreaker.title")}</h3>
      <div class="review-lines">
        ${metricRow(t("games.result.tiebreaker.primary"), tieValueLine(game, summary.primary))}
        ${metricRow(t("games.result.tiebreaker.tacCrit"), tieValueLine(game, summary.critTac))}
        ${metricRow(t("games.result.tiebreaker.apl"), tieValueLine(game, summary.apl))}
        ${metricRow(t("games.result.tiebreaker.rollOff"), game.players.find((player) => player.id === summary.rollOffWinnerId)?.name || "-")}
        ${metricRow(t("tournaments.tiebreaker.winner"), winnerText)}
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
        ${comboField(t("games.filter.teamLabel"), `faction-${player.id}`, "faction", score.faction, t("tournaments.score.searchKillTeam"))}
        ${comboField(t("op.tac"), `tac-op-${player.id}`, "tacOp", score.tacOp, t("tournaments.score.searchTacOp"))}
      </div>
      <div class="score-fields">
        ${["crit", "tac", "kill"].map((op) => `
          <div class="field">
            <label>${t(opLabels[op])}</label>
            <input data-score-input name="${op}-${player.id}" type="number" min="0" max="6" value="${score[op] ?? 0}">
          </div>
        `).join("")}
      </div>
      <div class="field">
        <label>${t("tournaments.score.primaryOp")}</label>
        <select data-primary-select name="primary-${player.id}">
          <option value="" ${!score.primary ? "selected" : ""}>${t("tournaments.score.selectPrimaryOp")}</option>
          <option value="crit" ${score.primary === "crit" ? "selected" : ""}>${t("op.crit")}</option>
          <option value="tac" ${score.primary === "tac" ? "selected" : ""}>${t("op.tac")}</option>
          <option value="kill" ${score.primary === "kill" ? "selected" : ""}>${t("op.kill")}</option>
        </select>
      </div>
      <div class="total-line">
        <span>${t("tournaments.score.total")}</span>
        <span data-total="${player.id}">0 VP</span>
      </div>
    </div>
  `;
}

function debugRandomResultButtonMarkup() {
  return `
    <div class="row-actions">
      <button class="small-button" type="button" data-debug-random-result>${t("tournaments.debug.randomResult")}</button>
    </div>
  `;
}

function fillDebugRandomResult(players = []) {
  for (const player of players) {
    setFormControlValue(`faction-${player.id}`, validKillTeamName(player.faction) || randomOption(killTeamOptions));
    setFormControlValue(`tac-op-${player.id}`, randomOption(tacOpOptions));
    setFormControlValue(`crit-${player.id}`, randomInteger(0, 6));
    setFormControlValue(`tac-${player.id}`, randomInteger(0, 6));
    setFormControlValue(`kill-${player.id}`, randomInteger(0, 6));
    setFormControlValue(`primary-${player.id}`, randomOption(["crit", "tac", "kill"]));
    setFormControlValue(`apl-${player.id}`, randomInteger(0, 16));
  }

  const [a, b] = players;
  if (a && b && scoreFromForm(a.id).total === scoreFromForm(b.id).total) {
    const control = document.querySelector(`[name="kill-${b.id}"]`);
    if (control) {
      const current = Number(control.value || 0);
      setFormControlValue(`kill-${b.id}`, current < 6 ? current + 1 : Math.max(0, current - 1));
    }
  }

  setFormControlValue("killzone", randomOption(killzoneOptions));
  setFormControlValue("critOp", randomOption(critOpOptions));
  setFormControlValue("killzoneLayout", randomInteger(1, 6));

  const rollOffWinnerId = randomOption(players.map((player) => String(player.id)));
  setFormControlValue("rollOffWinnerId", rollOffWinnerId);
}

function setFormControlValue(name, value) {
  const control = document.querySelector(`[name="${name}"]`);
  if (!control) return;
  control.value = String(value ?? "");
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomOption(options = []) {
  if (!options.length) return "";
  return options[randomInteger(0, options.length - 1)];
}

function comboField(label, name, optionsKey, selected = "", placeholder = t("tournaments.combo.defaultPlaceholder"), options = {}) {
  const optional = Boolean(options.optional);
  const disabled = Boolean(options.disabled);
  const valueMode = options.valueMode || (options.items ? "value" : "label");
  const items = options.items ? normalizeComboOptions(options.items) : null;
  const normalizedSelected = valueMode === "value"
    ? String(selected || "")
    : optionsKey === "faction"
      ? validKillTeamName(selected) || selected
      : selected;
  const selectedOption = items?.find((item) => String(item.value) === String(normalizedSelected));
  const displaySelected = valueMode === "value" ? selectedOption?.label || "" : normalizedSelected || "";
  const itemsAttribute = items ? ` data-combo-items="${escapeHtml(JSON.stringify(items))}"` : "";
  const valueInput = valueMode === "value"
    ? `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(normalizedSelected)}" data-combo-value-input ${disabled ? "disabled" : ""} ${options.valueAttributes || ""}>`
    : "";
  const inputName = valueMode === "value" ? "" : ` name="${escapeHtml(name)}"`;
  return `
    <div class="field combo-field" data-combo data-combo-options="${optionsKey}" data-combo-optional="${optional ? "true" : "false"}" data-combo-value-mode="${valueMode}"${itemsAttribute}>
      <label>${escapeHtml(label)}</label>
      <div class="combo-control">
        <input
          class="combo-input"
          ${inputName}
          value="${escapeHtml(displaySelected)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
          ${optional ? "" : "required"}
          ${disabled ? "disabled" : ""}
          data-combo-input
        >
        ${valueInput}
        <button class="combo-toggle" type="button" data-combo-toggle aria-label="${t("tournaments.combo.showOptions")}" ${disabled ? "disabled" : ""}></button>
      </div>
      <div class="combo-menu" data-combo-menu hidden></div>
    </div>
  `;
}

function tournamentFinalStandingsReady(data) {
  const tournament = data.tournament || {};
  const rounds = data.rounds || [];
  const matches = rounds.flatMap((round) => round.matches || []);
  if (tournament.status !== "in_progress") return false;
  if (!matches.length || matches.some((match) => match.status !== "completed")) return false;
  if (tournament.format === "swiss") {
    return rounds.length >= Number(tournament.swissRoundCount || 0);
  }
  return true;
}

function adminFinalStandingsEditor(data) {
  if (!canManageTournamentParticipants(data) || !tournamentFinalStandingsReady(data)) return "";
  const standings = data.standings || [];
  const participants = listedTournamentParticipants(data.participants || []);
  if (!standings.length || !participants.length) return "";
  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));
  const standingsByParticipantId = new Map(standings.map((row) => [row.participantId, row]));
  const optionMarkup = (selectedId) => participants.map((participant) => `
    <option value="${participant.id}" data-stats="${escapeHtml(finalStandingStatsText(standingsByParticipantId.get(participant.id)))}" ${participant.id === selectedId ? "selected" : ""}>
      ${escapeHtml(participant.displayName)}${participant.faction ? ` / ${escapeHtml(participant.faction)}` : ""}
    </option>
  `).join("");
  return `
    <form class="final-standings-editor" data-admin-final-standings>
      <div class="final-standings-header">
        <div>
          <h4>Final standings preview</h4>
          <p class="muted">Review and adjust placements before publishing the tournament result.</p>
        </div>
        <button class="primary-button final-standings-publish" type="submit">Publish standings</button>
      </div>
      <div class="final-standing-list">
        ${standings.map((row, index) => {
          const selectedParticipant = participantsById.get(row.participantId) || participants[index] || participants[0];
          return `
            <div class="final-standing-row">
              <div class="final-standing-rank">#${index + 1}</div>
              <select data-final-standing-select aria-label="Final standing ${index + 1}">
                ${optionMarkup(selectedParticipant.id)}
              </select>
              <div class="final-standing-stats">${escapeHtml(finalStandingStatsText(standingsByParticipantId.get(selectedParticipant.id) || row))}</div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="message" data-final-standings-message></div>
    </form>
  `;
}

function finalStandingStatsText(row = {}) {
  return `TP ${row.matchPoints || 0} / ${row.wins || 0}-${row.draws || 0}-${row.losses || 0} / VP ${row.totalVp || 0} / Diff ${row.vpDiff || 0}`;
}

function normalizeComboOptions(options = []) {
  return options.map((option) => {
    if (typeof option === "string") return { value: option, label: option, search: option };
    const value = String(option?.value ?? "");
    const label = String(option?.label ?? value);
    const search = String(option?.search ?? label);
    return { value, label, search };
  });
}

function comboOptionLabel(option) {
  return typeof option === "string" ? option : String(option?.label ?? option?.value ?? "");
}

function comboOptionValue(option) {
  return typeof option === "string" ? option : String(option?.value ?? option?.label ?? "");
}

function comboOptionSearchText(option) {
  if (typeof option === "string") return option;
  return [option?.label, option?.search, option?.value].filter(Boolean).join(" ");
}

function comboOptionsFor(key, combo = null) {
  if (combo?.dataset.comboItems) {
    try {
      return normalizeComboOptions(JSON.parse(combo.dataset.comboItems));
    } catch {
      return [];
    }
  }
  if (key === "faction") return normalizeComboOptions(killTeamOptions);
  if (key === "tacOp") return normalizeComboOptions(tacOpOptions);
  return [];
}

function userComboItems(users = []) {
  return users.map((user) => ({
    value: String(user.id),
    label: `${user.name} (${user.rating})`,
    search: [user.name, user.registerNickname, user.telegramContact, user.rating].filter(Boolean).join(" ")
  }));
}

function wireComboFields() {
  document.querySelectorAll("[data-combo]").forEach((combo) => {
    const input = combo.querySelector("[data-combo-input]");
    const valueInput = combo.querySelector("[data-combo-value-input]");
    const menu = combo.querySelector("[data-combo-menu]");
    const toggle = combo.querySelector("[data-combo-toggle]");
    const optionsKey = combo.dataset.comboOptions;
    const optional = combo.dataset.comboOptional === "true";
    const valueMode = combo.dataset.comboValueMode || "label";
    const options = comboOptionsFor(optionsKey, combo);
    let activeIndex = -1;

    const normalizeValue = () => {
      if (valueMode === "value") {
        const typed = String(input.value || "").trim();
        if (!valueInput.value && typed) {
          const exact = options.find((option) => searchKey(option.label) === searchKey(typed));
          if (exact) {
            input.value = exact.label;
            valueInput.value = exact.value;
          }
        }
        const current = options.find((option) => option.value === valueInput.value);
        if (current && input.value !== current.label) valueInput.value = "";
        if (valueInput.value || (optional && !typed)) {
          input.setCustomValidity("");
          return true;
        }
        input.setCustomValidity("Choose an option from the list");
        return false;
      }
      if (optionsKey !== "faction") return true;
      if (optional && !String(input.value || "").trim()) {
        input.setCustomValidity("");
        return true;
      }
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
      const query = input.value.trim();
      return (showAll || !query)
        ? options
        : options.filter((option) => comboOptionMatchesQuery(option, query))
            .sort((a, b) => {
              const aStarts = comboOptionStartsWithQuery(a, query);
              const bStarts = comboOptionStartsWithQuery(b, query);
              return Number(!aStarts) - Number(!bStarts) || comboOptionLabel(a).localeCompare(comboOptionLabel(b));
            });
    };

    const renderOptions = (showAll = false) => {
      const matches = filteredOptions(showAll);
      menu.innerHTML = matches.length
        ? matches.map((option, index) => `
          <button class="combo-option ${index === activeIndex ? "active" : ""}" type="button" data-combo-value="${escapeHtml(comboOptionValue(option))}">
            ${escapeHtml(comboOptionLabel(option))}
          </button>
        `).join("")
        : `<div class="combo-empty">No matches</div>`;
      menu.hidden = false;
      combo.classList.add("open");
    };

    const choose = (option) => {
      input.value = comboOptionLabel(option);
      if (valueInput) valueInput.value = comboOptionValue(option);
      normalizeValue();
      close();
      if (valueInput) valueInput.dispatchEvent(new Event("change", { bubbles: true }));
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
      if (valueInput) valueInput.value = "";
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
        const selected = options.find((option) => comboOptionValue(option) === items[activeIndex].dataset.comboValue);
        if (selected) choose(selected);
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
      const selected = options.find((item) => comboOptionValue(item) === option?.dataset.comboValue);
      if (selected) choose(selected);
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
  const primary = document.querySelector(`[name="primary-${playerId}"]`)?.value || "";
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

function approvedOpsPayloadFromForm(players = []) {
  const scores = {};
  players.forEach((player) => {
    const primary = document.querySelector(`[name="primary-${player.id}"]`)?.value || "";
    if (!Object.prototype.hasOwnProperty.call(opLabels, primary)) {
      throw new Error(`Select Primary Op for ${player.name}`);
    }
    scores[player.id] = {
      faction: document.querySelector(`[name="faction-${player.id}"]`)?.value || "",
      tacOp: document.querySelector(`[name="tac-op-${player.id}"]`)?.value || "",
      crit: Number(document.querySelector(`[name="crit-${player.id}"]`)?.value || 0),
      kill: Number(document.querySelector(`[name="kill-${player.id}"]`)?.value || 0),
      tac: Number(document.querySelector(`[name="tac-${player.id}"]`)?.value || 0),
      primary
    };
  });
  return {
    scores,
    tiebreakers: {
      enabled: Boolean(document.querySelector("[data-tiebreaker-enabled]")?.checked),
      apl: Object.fromEntries(players.map((player) => [
        player.id,
        Number(document.querySelector(`[name="apl-${player.id}"]`)?.value || 0)
      ])),
      rollOffWinnerId: document.querySelector(`[name="rollOffWinnerId"]`)?.value || null
    },
    killzone: {
      killzone: document.querySelector(`[name="killzone"]`)?.value || "",
      critOp: document.querySelector(`[name="critOp"]`)?.value || "",
      layout: document.querySelector(`[name="killzoneLayout"]`)?.value || ""
    }
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

function paginate(items, page, pageSize = LEADERBOARD_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return {
    items: items.slice(start, end),
    currentPage,
    totalPages,
    total,
    start,
    end
  };
}

function paginationMarkup(target, pageData, itemLabel = "players") {
  if (pageData.total <= LEADERBOARD_PAGE_SIZE) return "";
  const first = pageData.total ? pageData.start + 1 : 0;
  return `
    <div class="pagination-row">
      <div class="pagination-summary">
        Showing ${first}-${pageData.end} of ${pageData.total} ${escapeHtml(itemLabel)}.
        <span class="pagination-current">Page ${pageData.currentPage} of ${pageData.totalPages}</span>
      </div>
      <div class="pagination-actions">
        <button class="small-button" data-pagination-target="${escapeHtml(target)}" data-pagination-page="${pageData.currentPage - 1}" ${pageData.currentPage <= 1 ? "disabled" : ""}>Previous</button>
        <button class="small-button" data-pagination-target="${escapeHtml(target)}" data-pagination-page="${pageData.currentPage + 1}" ${pageData.currentPage >= pageData.totalPages ? "disabled" : ""}>Next</button>
      </div>
    </div>
  `;
}

function wirePaginationControls() {
  document.querySelectorAll("[data-pagination-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.paginationPage || 1);
      if (button.dataset.paginationTarget === "leaderboard") state.leaderboardPage = page;
      if (button.dataset.paginationTarget === "admin-users") state.adminUsersPage = page;
      renderShell();
    });
  });
}

function renderTop() {
  const content = document.querySelector("[data-content]");
  const activeTab = state.me?.isAdmin ? state.leaderboardTab : "leaderboard";
  if (state.leaderboardTab !== activeTab) state.leaderboardTab = activeTab;
  content.innerHTML = `
    ${pageTabs("leaderboard", [
      { id: "leaderboard", label: "Leaderboard" },
      { id: "users", label: "User Administration" }
    ], activeTab)}
    ${activeTab === "users" ? adminUsersPanel() : `
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
    `}
  `;
  wirePageTabs();
  wirePaginationControls();
  if (activeTab === "users") wireAdminUserControls();
  else wireLeaderboardProfiles();
}

function usersTable(users) {
  const pageData = paginate(users, state.leaderboardPage);
  state.leaderboardPage = pageData.currentPage;
  if (!pageData.total) return `<div class="empty">No users yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th class="rank">#</th><th>Player</th><th>Rating</th></tr></thead>
        <tbody>
          ${pageData.items.map((user, index) => `
            <tr>
              <td class="rank">${pageData.start + index + 1}</td>
              <td>
                <button class="text-button player-name-button leaderboard-player-button" data-profile-user="${user.id}">
                  <span class="leaderboard-avatar">${avatarMarkup(user)}</span>
                  <span>${escapeHtml(user.name)}</span>
                </button>
              </td>
              <td>${user.rating}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${paginationMarkup("leaderboard", pageData, "players")}
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
  const [usersData, gamesData, tournamentsData] = await Promise.all([
    api("/api/admin/users"),
    api("/api/admin/games"),
    api("/api/admin/tournaments")
  ]);
  state.adminUsers = usersData.users || [];
  state.adminGames = gamesData.games || [];
  state.adminTournaments = tournamentsData.tournaments || [];
  if (state.selectedTournamentId) {
    const selectedExists = state.adminTournaments.some((tournament) => tournament.id === state.selectedTournamentId);
    if (selectedExists) {
      await loadAdminTournamentDetail(state.selectedTournamentId, { preservePreview: true });
    } else {
      state.adminTournamentMode = "list";
      state.selectedTournamentId = null;
      state.adminTournamentDetail = null;
      state.adminTournamentPreview = null;
    }
  }
}

async function loadAdminUsers() {
  const data = await api("/api/admin/users");
  state.adminUsers = data.users || [];
}

async function loadAdminGames() {
  const data = await api("/api/admin/games");
  state.adminGames = data.games || [];
}

async function loadTournamentAdmin() {
  const [usersData, tournamentsData] = await Promise.all([
    api("/api/admin/users"),
    api("/api/admin/tournaments")
  ]);
  state.adminUsers = usersData.users || [];
  state.adminTournaments = tournamentsData.tournaments || [];
  if (state.selectedTournamentId) {
    const selectedExists = state.adminTournaments.some((tournament) => tournament.id === state.selectedTournamentId);
    if (selectedExists) {
      await loadAdminTournamentDetail(state.selectedTournamentId, { preservePreview: true });
    } else {
      state.adminTournamentMode = "list";
      state.selectedTournamentId = null;
      state.adminTournamentDetail = null;
      state.adminTournamentPreview = null;
    }
  }
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
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Tournament Administration</h2>
          <p class="muted">Current tournaments.</p>
        </div>
        <button class="primary-button" data-admin-tournament-new>Create</button>
      </div>
      <div class="list admin-tournament-list">
        ${tournaments.length ? tournaments.map(adminTournamentRow).join("") : `<div class="empty">No tournaments yet.</div>`}
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
          <h2>Create tournament</h2>
          <p class="muted">Configure tournament settings before opening the tournament page.</p>
        </div>
        <button class="ghost-button" data-admin-tournament-create-cancel>Back</button>
      </div>
      <form class="admin-tournament-form" data-admin-tournament-create>
        <div class="grid-2">
          <div class="field">
            <label>Name</label>
            <input name="name" maxlength="120" required placeholder="TGTV Open">
          </div>
          <div class="field">
            <label>Short URL</label>
            <input name="slug" maxlength="120" placeholder="Optional">
          </div>
          <div class="field">
            <label>Format</label>
            <select name="format" data-admin-tournament-format>
              <option value="single_elimination">Single elimination</option>
              <option value="swiss">Swiss</option>
            </select>
          </div>
          <div class="field" data-format-field="single_elimination">
            <label>Bracket size</label>
            <select name="singleEliminationSize">
              ${singleEliminationSizes.map((size) => `<option value="${size}">${size} players</option>`).join("")}
            </select>
          </div>
          <div class="field" data-format-field="swiss">
            <label>Swiss rounds</label>
            <input name="swissRoundCount" type="number" min="1" value="3">
          </div>
          <div class="field">
            <label>Starts at</label>
            <input name="startsAt" type="datetime-local">
          </div>
          <div class="field">
            <label>Rating policy</label>
            <select name="ratingPolicy">
              <option value="ranked">Ranked</option>
              <option value="unranked">Unranked</option>
            </select>
          </div>
          <div class="field">
            <label>All Kill Team Challenge</label>
            <select name="challengeCreditPolicy">
              <option value="count">Enabled</option>
              <option value="none">Disabled</option>
            </select>
          </div>
          <div class="field">
            <label>Game system</label>
            <select name="gameSystem">
              ${gameSystemOptions.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Season</label>
            <select name="seasonId">
              ${seasons.map((season) => `<option value="${escapeHtml(season.id)}" ${season.id === latestSeason().id ? "selected" : ""}>${escapeHtml(season.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Venue</label>
            <select name="venueMode">
              ${venueModeOptions.map((option) => `<option value="${escapeHtml(option.key)}">${escapeHtml(t(option.labelKey))}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label>Tournament Rules</label>
          <textarea name="tournamentRules" maxlength="6000" placeholder="Optional: event format, result reporting, scoring, and admin decisions."></textarea>
        </div>
        <div class="field tournament-rules-upload">
          <label>Tournament Rules Link</label>
          <input name="rulesLink" maxlength="2048" placeholder="https://...">
          <div class="rules-file-row">
            <input type="file" accept="application/pdf,.pdf" data-tournament-rules-file>
            <input type="hidden" name="rulesFileData">
            <span class="field-help" data-tournament-rules-file-status>No PDF selected</span>
          </div>
        </div>
        <div class="tournament-tiebreakers">
          ${tournamentTiebreakerHeading()}
          ${tournamentTiebreakerSelects([])}
        </div>
        <button class="primary-button" type="submit">Create</button>
        <div class="message" data-message></div>
      </form>
    </section>
  `;
}

function adminTournamentRow(tournament) {
  return `
    <div class="row-card">
      <div class="row-main">
        <button class="text-button row-title" data-admin-tournament-open="${tournament.id}">${escapeHtml(tournament.name || "Untitled tournament")}</button>
        <div class="row-meta">${escapeHtml(formatLabel(tournament.format))} / ${escapeHtml(tournament.slug)} / ${tournament.startsAt ? fmtDate(tournament.startsAt) : "No date"}</div>
      </div>
      <div class="row-actions">
        <span class="status ${tournamentStatusClass(tournament.status)}">${escapeHtml(tournamentStatusLabel(tournament.status))}</span>
        <button class="small-button" data-admin-tournament-open="${tournament.id}">Open</button>
      </div>
    </div>
  `;
}

function adminTournamentDetailPanel(data) {
  const tournament = data.tournament || {};
  const publicUrl = tournamentPublicUrl(tournament);
  return `
    <section class="card panel admin-tournament-detail">
      <div class="panel-header">
        <div>
          <p class="profile-label">${escapeHtml(formatLabel(tournament.format))}</p>
          <h2>${escapeHtml(tournament.name || "Untitled tournament")}</h2>
          <p class="muted">${escapeHtml(tournamentStatusLabel(tournament.status))}${tournament.startsAt ? ` / ${fmtDate(tournament.startsAt)}` : ""}</p>
        </div>
        <div class="row-actions admin-tournament-header-actions">
          <button class="small-button" data-admin-tournament-public="${tournament.slug}">View public</button>
          <button class="small-button" data-admin-tournament-copy="${escapeHtml(publicUrl)}">Copy link</button>
          <button class="danger-button" data-admin-tournament-action="delete">Delete tournament</button>
          <button class="ghost-button" data-admin-tournament-close>Back to list</button>
        </div>
      </div>
      <section class="profile-grid">
        ${metricCard("Date", tournamentDateLabel(tournament))}
        ${metricCard("Participants", String(listedTournamentParticipants(data.participants || []).length))}
        ${metricCard("Rounds", tournamentRoundsLabel(tournament, data))}
        ${metricCard("Venue", venueModeLabel(tournament.venueMode))}
        ${metricCard("Season", seasonLabel(tournament.seasonId))}
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
    buttons.push(`<button class="primary-button" data-admin-tournament-action="publish-open">Publish and open</button>`);
    buttons.push(`<button class="small-button" data-admin-tournament-action="publish-closed">Publish closed</button>`);
  }
  if (tournament.status === "registration_open") {
    buttons.push(`<button class="small-button" data-admin-tournament-action="close-registration">Close registration</button>`);
  }
  if (tournament.status === "registration_closed") {
    buttons.push(`<button class="small-button" data-admin-tournament-action="reopen-registration">Reopen registration</button>`);
    buttons.push(`<button class="primary-button" data-admin-tournament-action="start">Start tournament</button>`);
  }
  if (["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
    buttons.push(`<button class="small-button" data-admin-tournament-action="preview">Preview pairings</button>`);
  }
  if (tournament.status === "in_progress") {
    const nextRoundState = nextRoundActionState(data);
    if (nextRoundState.canGenerate) {
      const label = (data.rounds || []).length ? "Generate next round" : "Generate first round";
      buttons.push(`<button class="primary-button" data-admin-tournament-action="generate-next-round">${label}</button>`);
    } else {
      buttons.push(`<span class="muted">${escapeHtml(nextRoundState.message)}</span>`);
    }
  }
  return buttons.length ? buttons.join("") : `<span class="muted">Setup is locked while the tournament is running.</span>`;
}

function nextRoundActionState(data) {
  const tournament = data.tournament || {};
  const rounds = data.rounds || [];
  if (tournament.status !== "in_progress") return { canGenerate: false, message: "Tournament is not running." };
  if (!rounds.length) return { canGenerate: true, message: "" };

  if (tournament.format === "swiss") {
    const currentRound = rounds[rounds.length - 1];
    const complete = (currentRound.matches || []).length > 0 &&
      (currentRound.matches || []).every((match) => match.status === "completed");
    if (!complete) return { canGenerate: false, message: "Finish all matches in the current Swiss round before generating the next round." };
    if (currentRound.roundNumber >= Number(tournament.swissRoundCount || 0)) {
      return { canGenerate: false, message: "All Swiss rounds have been generated." };
    }
    return { canGenerate: true, message: "" };
  }

  const nextRound = rounds.find((round) => round.status === "not_ready");
  if (!nextRound) return { canGenerate: false, message: "No next bracket round to activate." };
  const previousRound = rounds.find((round) => round.roundNumber === nextRound.roundNumber - 1);
  const previousComplete = previousRound &&
    (previousRound.matches || []).length > 0 &&
    (previousRound.matches || []).every((match) => match.status === "completed");
  if (!previousComplete) return { canGenerate: false, message: "Finish the current bracket round before generating the next round." };
  const nextReady = (nextRound.matches || []).every((match) =>
    match.isBye || (match.participantAId && match.participantBId)
  );
  if (!nextReady) return { canGenerate: false, message: "The next bracket round is waiting for winners." };
  return { canGenerate: true, message: "" };
}

function adminTournamentEditForm(tournament) {
  const setupLocked = tournament.status === "in_progress";
  const readOnly = ["completed", "cancelled"].includes(tournament.status);
  const lockAttrs = setupLocked || readOnly ? "disabled" : "";
  const textLockAttrs = readOnly ? "disabled" : "";
  const existingRulesLinkType = isTournamentRulesPdf(tournament.rulesLink) ? "pdf" : tournament.rulesLink ? "url" : "";
  const rulesLinkValue = existingRulesLinkType === "url" ? tournament.rulesLink : "";
  return `
    <form class="admin-tournament-form compact-admin-form tournament-settings-form" data-admin-tournament-update data-existing-rules-link-type="${existingRulesLinkType}">
      <div class="grid-2">
        <div class="field">
          <label>Name</label>
          <input name="name" maxlength="120" value="${escapeHtml(tournament.name || "")}" ${lockAttrs}>
        </div>
        <div class="field">
          <label>Starts at</label>
          <input name="startsAt" type="datetime-local" value="${escapeHtml(datetimeLocalValue(tournament.startsAt))}" ${textLockAttrs}>
        </div>
        <div class="field">
          <label>Format</label>
          <select name="format" data-admin-tournament-format ${lockAttrs}>
            <option value="single_elimination" ${tournament.format === "single_elimination" ? "selected" : ""}>Single elimination</option>
            <option value="swiss" ${tournament.format === "swiss" ? "selected" : ""}>Swiss</option>
          </select>
        </div>
        <div class="field" data-format-field="single_elimination">
          <label>Bracket size</label>
          <select name="singleEliminationSize" ${lockAttrs}>
            ${singleEliminationSizes.map((size) => `<option value="${size}" ${Number(tournament.singleEliminationSize || 8) === size ? "selected" : ""}>${size} players</option>`).join("")}
          </select>
        </div>
        <div class="field" data-format-field="swiss">
          <label>Swiss rounds</label>
          <input name="swissRoundCount" type="number" min="1" value="${tournament.swissRoundCount || 3}" ${lockAttrs}>
        </div>
        <div class="field">
          <label>Rating policy</label>
          <select name="ratingPolicy" ${lockAttrs}>
            <option value="ranked" ${tournament.ratingPolicy === "ranked" ? "selected" : ""}>Ranked</option>
            <option value="unranked" ${tournament.ratingPolicy === "unranked" ? "selected" : ""}>Unranked</option>
          </select>
        </div>
        <div class="field">
          <label>All Kill Team Challenge</label>
          <select name="challengeCreditPolicy" ${lockAttrs}>
            <option value="count" ${tournament.challengeCreditPolicy === "count" ? "selected" : ""}>Enabled</option>
            <option value="none" ${tournament.challengeCreditPolicy === "none" ? "selected" : ""}>Disabled</option>
          </select>
        </div>
        <div class="field">
          <label>Game system</label>
          <select name="gameSystem" ${lockAttrs}>
            ${gameSystemOptions.map((option) => `<option value="${escapeHtml(option)}" ${(tournament.gameSystem || gameSystemOptions[0]) === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Season</label>
          <select name="seasonId" ${lockAttrs}>
            ${seasons.map((season) => `<option value="${escapeHtml(season.id)}" ${(tournament.seasonId || latestSeason().id) === season.id ? "selected" : ""}>${escapeHtml(season.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Venue</label>
          <select name="venueMode" ${lockAttrs}>
            ${venueModeOptions.map((option) => `<option value="${escapeHtml(option.key)}" ${(tournament.venueMode || "tts") === option.key ? "selected" : ""}>${escapeHtml(t(option.labelKey))}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Tournament Rules</label>
        <textarea name="tournamentRules" maxlength="6000" ${textLockAttrs}>${escapeHtml(tournamentRulesValue(tournament))}</textarea>
      </div>
      <div class="field tournament-rules-upload">
        <label>Tournament Rules Link</label>
        <input name="rulesLink" maxlength="2048" value="${escapeHtml(rulesLinkValue)}" placeholder="https://..." ${textLockAttrs}>
        <div class="rules-file-row">
          <input type="file" accept="application/pdf,.pdf" data-tournament-rules-file ${textLockAttrs}>
          <input type="hidden" name="rulesFileData">
          <span class="field-help" data-tournament-rules-file-status>${existingRulesLinkType === "pdf" ? "Existing PDF attached" : "No PDF selected"}</span>
        </div>
        ${tournament.rulesLink ? tournamentRulesLinkMarkup(tournament) : ""}
      </div>
      <div class="tournament-tiebreakers">
        ${tournamentTiebreakerHeading()}
        ${tournamentTiebreakerSelects(tournament.tiebreakerOrder || [], lockAttrs)}
      </div>
      <div class="admin-save-row">
        <button class="primary-button admin-save-button" type="submit" data-admin-tournament-save-button ${readOnly ? "disabled" : ""}>Save tournament</button>
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

function tournamentStatsContent(data) {
  const games = (data.tournamentGames || []).filter((game) => game.status === "completed" && game.result);
  if (!games.length) return `<div class="empty">No completed tournament games yet.</div>`;
  const teams = tournamentKillTeamStats(games);
  const tacOps = tournamentTacOpStats(games);
  return `
    <div class="tournament-stats">
      <section class="profile-grid">
        ${metricCard("Completed games", games.length)}
        ${metricCard("Tac Ops", tacOps.length)}
        ${metricCard("Kill Teams", teams.length)}
        ${metricCard("Season", seasonLabel(data.tournament?.seasonId))}
      </section>
      <div class="grid-2 tournament-stats-grid">
        ${tournamentTacOpStatsTable(tacOps)}
        ${tournamentStatsTable("Kill Team stats", teams, "team")}
      </div>
    </div>
  `;
}

function tournamentTacOpStats(games) {
  return tacOpWinrateSummary(games, { classification: "all", team: "" }).rows;
}

function tournamentKillTeamStats(games) {
  const byTeam = new Map();
  for (const game of games) {
    const [a, b] = game.players || [];
    if (!a || !b) continue;
    for (const player of [a, b]) {
      const team = player.faction || "Faction TBD";
      if (!byTeam.has(team)) {
        byTeam.set(team, {
          key: team,
          name: team,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          totalVp: 0,
          vpDiff: 0,
          eloDelta: 0
        });
      }
    }
    addTournamentStatLine(byTeam.get(a.faction || "Faction TBD"), a, b, game);
    addTournamentStatLine(byTeam.get(b.faction || "Faction TBD"), b, a, game);
  }
  return [...byTeam.values()].sort((a, b) =>
    b.wins * 3 + b.draws - (a.wins * 3 + a.draws) ||
    b.vpDiff - a.vpDiff ||
    b.totalVp - a.totalVp ||
    a.name.localeCompare(b.name)
  );
}

function addTournamentStatLine(row, player, opponent, game) {
  const ownScore = game.result?.scores?.[player.id] || {};
  const opponentScore = game.result?.scores?.[opponent.id] || {};
  const ownTotal = Number(ownScore.total || 0);
  const opponentTotal = Number(opponentScore.total || 0);
  row.matches += 1;
  row.totalVp += ownTotal;
  row.vpDiff += ownTotal - opponentTotal;
  row.eloDelta += Number(game.elo?.[player.id]?.delta || 0);
  if (!game.result?.winnerId) row.draws += 1;
  else if (Number(game.result.winnerId) === Number(player.id)) row.wins += 1;
  else row.losses += 1;
}

function tournamentTacOpStatsTable(rows) {
  return `
    <section class="admin-subpanel tournament-stat-table">
      <h4>Tac Op stats</h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tac Op</th>
              <th>Games</th>
              <th>Wins</th>
              <th>Win rate</th>
              <th>Avg VP</th>
              <th>Avg VP as Primary</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.tacOp)}</td>
                <td>${row.games}</td>
                <td>${row.wins}</td>
                <td>${row.winRate}%</td>
                <td>${row.avgPoints}</td>
                <td>${row.avgPrimaryPoints}</td>
              </tr>
            `).join("") : `<tr><td colspan="6">No Tac Op data yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function tournamentStatsTable(title, rows, kind) {
  return `
    <section class="admin-subpanel tournament-stat-table">
      <h4>${escapeHtml(title)}</h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${kind === "player" ? "Player" : "Kill Team"}</th>
              ${kind === "player" ? "<th>Kill Team</th>" : ""}
              <th>W-D-L</th>
              <th>Win rate</th>
              <th>Total VP</th>
              <th>VP Diff</th>
              <th>Elo</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.name)}</td>
                ${kind === "player" ? `<td>${escapeHtml(row.faction || "-")}</td>` : ""}
                <td>${row.wins}-${row.draws}-${row.losses}</td>
                <td>${row.matches ? Math.round((row.wins / row.matches) * 100) : 0}%</td>
                <td>${row.totalVp}</td>
                <td>${signed(row.vpDiff)}</td>
                <td>${signed(row.eloDelta)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function adminTournamentTablesContent(data) {
  const tournament = data.tournament || {};
  const tables = data.tables || [];
  const readOnly = ["completed", "cancelled"].includes(tournament.status);
  if (tournament.venueMode !== "irl") return `<div class="empty">Tables are available only for In Real Life tournaments.</div>`;
  return `
    <div class="tournament-table-admin">
      <form class="admin-table-form" data-admin-tournament-table-add>
        <div class="grid-3">
          <div class="field">
            <label>Table number</label>
            <input name="tableNumber" type="number" min="1" placeholder="Next" ${readOnly ? "disabled" : ""}>
          </div>
          <div class="field">
            <label>Killzone</label>
            <select name="killzone" ${readOnly ? "disabled" : ""}>
              <option value="">Not selected</option>
              ${optionsHtml(killzoneOptions, "")}
            </select>
          </div>
          <div class="field">
            <label>Deployment</label>
            <select name="deployment" ${readOnly ? "disabled" : ""}>
              <option value="">Not selected</option>
              ${[1, 2, 3, 4, 5, 6].map((item) => `<option value="${item}">${item}</option>`).join("")}
            </select>
          </div>
        </div>
        <button class="small-button" type="submit" ${readOnly ? "disabled" : ""}>Add table</button>
      </form>
      <div class="list">
        ${tables.length ? tables.map((table) => adminTournamentTableRow(table, readOnly)).join("") : `<div class="empty">No tables yet.</div>`}
      </div>
    </div>
  `;
}

function adminTournamentTableRow(table, readOnly) {
  return `
    <div class="row-card compact-row-card tournament-table-row">
      <div class="row-main">
        <div class="row-title">Table ${table.tableNumber}</div>
        <div class="row-meta">${escapeHtml(table.killzone || "No Killzone")} / Deployment ${table.deployment || "-"}</div>
        <div class="table-admin-controls">
          <div class="field">
            <label>Killzone</label>
            <select name="table-killzone-${table.id}" ${readOnly ? "disabled" : ""}>
              <option value="">Not selected</option>
              ${optionsHtml(killzoneOptions, table.killzone || "")}
            </select>
          </div>
          <div class="field">
            <label>Deployment</label>
            <select name="table-deployment-${table.id}" ${readOnly ? "disabled" : ""}>
              <option value="">Not selected</option>
              ${[1, 2, 3, 4, 5, 6].map((item) => `<option value="${item}" ${Number(table.deployment) === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="row-actions">
        <button class="small-button" data-admin-table-save="${table.id}" ${readOnly ? "disabled" : ""}>Save</button>
        <button class="danger-button" data-admin-table-delete="${table.id}" ${readOnly ? "disabled" : ""}>Delete</button>
      </div>
    </div>
  `;
}

function adminTournamentParticipantsContent(data) {
  const tournament = data.tournament || {};
  const participants = data.participants || [];
  const visibleParticipants = listedTournamentParticipants(participants);
  const canRemove = !["completed", "cancelled"].includes(tournament.status);
  const canBulkAdd = !["in_progress", "completed", "cancelled"].includes(tournament.status);
  const readOnly = ["completed", "cancelled"].includes(tournament.status);
  const seedLocked = ["in_progress", "completed", "cancelled"].includes(tournament.status);
  const availableUsers = availableTournamentUsers(participants);
  return `
    <div class="tournament-participant-admin">
      <div class="participant-admin-note muted">
        ${tournament.format === "swiss" && tournament.status === "in_progress" ? "Late adds enter only the next generated Swiss round." : "Linked users or unregistered participants."}
      </div>
      <form class="admin-participant-form" data-admin-tournament-add-participant>
        <div class="grid-2">
          ${comboField("TGTV user", "userId", "users", "", "Unregistered participant", {
            optional: true,
            valueMode: "value",
            items: userComboItems(availableUsers)
          })}
          <div class="field">
            <label>Display name</label>
            <input name="displayName" maxlength="80" placeholder="Required for unregistered">
          </div>
        </div>
        ${comboField("Faction", "faction", "faction", "", "Optional", { optional: true })}
        <button class="small-button" type="submit">Add participant</button>
      </form>
      ${canBulkAdd ? `
        <form class="admin-participant-form" data-admin-tournament-bulk>
          <div class="field">
            <label>Bulk unregistered participants</label>
            <textarea name="names" placeholder="One display name per line"></textarea>
          </div>
          <button class="small-button" type="submit">Bulk add</button>
        </form>
      ` : ""}
      <div class="list">
        ${visibleParticipants.length ? visibleParticipants.map((participant) => adminTournamentParticipantAdminRow(participant, data, {
          canRemove,
          readOnly,
          seedLocked
        })).join("") : `<div class="empty">No participants yet.</div>`}
      </div>
      <button class="small-button" data-admin-tournament-save-seeds ${seedLocked ? "disabled" : ""}>Save seed order</button>
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
  const replaceLabel = participant.userId ? "Replace" : "Link user";
  const replacePlaceholder = participant.userId ? "Replace with registered user" : "Link registered user";
  const replaceLockedAfterStart = tournament.status === "in_progress" && participant.userId;
  const replaceDisabled = locked || replaceLockedAfterStart || !replacementUsers.length;
  return `
    <div class="row-card compact-row-card participant-admin-row">
      <div class="row-main">
        <div class="row-title">${tournamentParticipantProfileLink(participant)}</div>
        <div class="row-meta">Seed ${participant.seed || "-"} / ${escapeHtml(participantUserLabel(participant))} / ${escapeHtml(participant.faction || "Faction TBD")}</div>
        <div class="participant-admin-controls">
          <div class="participant-faction-control">
            ${comboField("Kill Team", `participant-faction-${participant.id}`, "faction", participant.faction || "", "Optional", { optional: true })}
            <button class="small-button" data-admin-participant-save-faction="${participant.id}" ${locked ? "disabled" : ""}>Save faction</button>
          </div>
          <div class="participant-replace-control">
            <div class="participant-replace-row">
              ${comboField("Registered user", `replacement-user-${participant.id}`, "users", "", replacePlaceholder, {
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
        <span class="status ${participant.status === "active" || participant.status === "joined" ? "completed" : participant.status === "pending_placement" ? "pending" : ""}">${escapeHtml(participant.status)}</span>
        ${canRemove ? `<button class="danger-button" data-admin-participant-remove="${participant.id}">Remove</button>` : ""}
      </div>
    </div>
  `;
}

function tournamentParticipantHasMatch(data, participantId) {
  const id = Number(participantId);
  return (data.rounds || []).some((round) =>
    (round.matches || []).some(
      (match) => Number(match.participantAId) === id || Number(match.participantBId) === id
    )
  );
}

function canRemoveTournamentParticipant(data, participant) {
  const tournament = data.tournament || {};
  if (!participant || ["withdrawn", "removed"].includes(participant.status)) return false;
  if (["completed", "cancelled"].includes(tournament.status)) return false;
  if (tournament.status !== "in_progress") return true;
  return participant.status === "pending_placement" && !tournamentParticipantHasMatch(data, participant.id);
}

function availableTournamentUsers(participants, exceptParticipantId = null) {
  const linkedUserIds = new Set(
    participants
      .filter((participant) => participant.id !== exceptParticipantId)
      .filter((participant) => participant.userId && !["withdrawn", "removed"].includes(participant.status))
      .map((participant) => participant.userId)
  );
  return (state.adminUsers || []).filter((user) => !linkedUserIds.has(user.id));
}

function participantUserLabel(participant) {
  if (!participant.userId) return "unregistered";
  return participant.user?.name ? `TGTV: ${participant.user.name}` : `TGTV user #${participant.userId}`;
}

function allowParticipantLink(tournament, participant, availableUsers) {
  if (participant.userId) return false;
  if (!availableUsers.length) return false;
  if (["completed", "cancelled"].includes(tournament.status)) return false;
  return !["withdrawn", "removed"].includes(participant.status);
}

function adminTournamentStandingsPanel(data) {
  return `
    <section class="admin-subpanel">
      <div class="panel-header">
        <div>
          <h3>Standings</h3>
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
  const names = participantNameLookup(data.participants || []);
  return `
    <section class="admin-subpanel wide-panel">
      <div class="panel-header">
        <div>
          <h3>Preview</h3>
          <p class="muted">${escapeHtml(formatLabel(preview.format))} pairings before start.</p>
        </div>
      </div>
      ${previewRoundsMarkup(preview.rounds || [], names)}
    </section>
  `;
}

function adminTournamentRoundsPanel(data) {
  const rounds = data.rounds || [];
  if (!rounds.length) {
    return `<section class="admin-subpanel wide-panel"><div class="empty">Matches are not generated yet.</div></section>`;
  }
  return `
    <section class="admin-subpanel wide-panel">
      <div class="panel-header">
        <div>
          <h3>Rounds and matches</h3>
          <p class="muted">Admin result entry completes active tournament matches immediately.</p>
        </div>
      </div>
      <div class="public-rounds">
        ${rounds.map((round) => `
          <section class="public-round">
            <div class="public-round-title">
              <strong>Round ${round.roundNumber}</strong>
              <span class="status ${round.status === "active" ? "pending" : round.status === "completed" ? "completed" : ""}">${escapeHtml(round.status)}</span>
            </div>
            <div class="list">
              ${(round.matches || []).map((match) => adminTournamentMatchMarkup(match)).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </section>
  `;
}

function adminTournamentMatchMarkup(match) {
  const canResult = ["active", "pending_confirmation", "completed"].includes(match.status) && !match.isBye;
  const actionLabel = match.status === "completed" ? "Edit result" : "Enter result";
  const meta = [publicMatchScore(match), matchSetupMeta(match)].filter(Boolean).join(" / ");
  return `
    <div class="row-card compact-row-card">
      <div class="row-main">
        <div class="row-title">${tournamentParticipantProfileLink(match.participantA)} vs ${match.isBye ? "BYE" : tournamentParticipantProfileLink(match.participantB)}</div>
        <div class="row-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${match.status === "active" || match.status === "pending_confirmation" ? "pending" : match.status === "completed" ? "completed" : ""}">${escapeHtml(match.status)}</span>
        ${canResult ? `<button class="small-button" data-admin-tournament-match-result="${match.id}">${actionLabel}</button>` : ""}
      </div>
    </div>
  `;
}

function previewRoundsMarkup(rounds, names) {
  return `
    <div class="public-rounds">
      ${rounds.map((round) => `
        <section class="public-round">
          <div class="public-round-title">
            <strong>Round ${round.roundNumber}</strong>
            <span class="status ${round.status === "active" ? "pending" : ""}">${escapeHtml(round.status)}</span>
          </div>
          <div class="list">
            ${(round.matches || []).map((match) => `
              <div class="row-card compact-row-card">
                <div class="row-main">
                  <div class="row-title">${escapeHtml(names.get(match.participantAId) || "TBD")} vs ${escapeHtml(match.isBye ? "BYE" : names.get(match.participantBId) || "TBD")}</div>
                  <div class="row-meta">${match.isBye ? "Bye" : "Pending result"}</div>
                </div>
                <span class="status ${match.status === "active" ? "pending" : match.status === "completed" ? "completed" : ""}">${escapeHtml(match.status)}</span>
              </div>
            `).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function participantNameLookup(participants) {
  return new Map(participants.map((participant) => [participant.id, participant.displayName]));
}

function tournamentRulesValue(tournament) {
  return tournament.rulesSummary || tournament.description || "";
}

function tournamentTiebreakerSelects(selected = [], disabled = "") {
  const order = Array.isArray(selected) ? selected.slice(0, 4) : [];
  return `
    <div class="tiebreaker-rank-list">
      ${[0, 1, 2, 3].map((index) => {
        const value = order[index] || "";
        return `
          <label class="tiebreaker-rank-field">
            <span>Priority ${index + 1}</span>
            <select data-tournament-tiebreaker-select ${disabled}>
              <option value="">None</option>
              ${standingsTiebreakerOptions.map((item) => `
                <option value="${item.key}" ${item.key === value ? "selected" : ""}>${escapeHtml(t(item.labelKey))}</option>
              `).join("")}
            </select>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function tournamentTiebreakerHeading() {
  return `
    <div class="tournament-tiebreaker-heading">
      <span class="muted">Standings tiebreakers</span>
      <button class="info-icon-button" type="button" data-tournament-tiebreaker-help-open aria-label="Explain standings tiebreakers" title="How standings tiebreakers work">!</button>
    </div>
    <dialog class="tiebreaker-help-dialog" data-tournament-tiebreaker-help>
      <div class="tiebreaker-help-content">
        <div class="tiebreaker-help-header">
          <div>
            <h3>Standings tiebreakers</h3>
            <p>TP is compared first. Selected tiebreakers are then applied from Priority 1 to Priority 4.</p>
          </div>
          <button class="dialog-close-button" type="button" data-tournament-tiebreaker-help-close aria-label="Close">&times;</button>
        </div>
        <dl class="tiebreaker-help-list">
          ${standingsTiebreakerOptions.map((item) => `
            <div>
              <dt>${escapeHtml(t(item.labelKey))}</dt>
              <dd>${escapeHtml(t(item.descriptionKey))}</dd>
            </div>
          `).join("")}
        </dl>
      </div>
    </dialog>
  `;
}

function tournamentStatusClass(status) {
  if (status === "completed") return "completed";
  if (["registration_open", "in_progress"].includes(status)) return "open";
  if (["registration_closed", "draft"].includes(status)) return "pending";
  return "";
}

function tournamentPublicUrl(tournament) {
  return `${window.location.origin}${tournamentPublicPath(tournament.slug || "")}`;
}

function datetimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toISOString();
}

function adminActiveGamesPanel() {
  const games = state.adminGames || [];
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>Sessions Administration</h2>
          <p class="muted">Open games and submitted results waiting for player confirmation.</p>
        </div>
      </div>
      <div class="list">
        ${games.length ? games.map((game) => {
          const pending = game.status === "pending_confirmation";
          return `
            <div class="row-card">
              <div class="row-main">
                <div class="row-title">${escapeHtml(gameTitle(game))}</div>
                <div class="row-meta">${escapeHtml(pending ? pendingResultSummary(game) : `Accepted match · ${fmtDate(game.createdAt)}`)}</div>
              </div>
              <div class="row-actions">
                <span class="status ${pending ? "pending" : "open"}">${pending ? "pending" : "open"}</span>
                <button class="small-button" data-admin-game-open="${game.id}">Open</button>
                ${pending && game.pendingResult?.result ? `<button class="small-button" data-admin-game-confirm="${game.id}">Force confirm</button>` : ""}
                <button class="danger-button" data-admin-game-delete="${game.id}">Delete</button>
              </div>
            </div>
          `;
        }).join("") : `<div class="empty">No active games.</div>`}
      </div>
    </section>
  `;
}

function adminUsersPanel() {
  const pageData = paginate(state.adminUsers, state.adminUsersPage);
  state.adminUsersPage = pageData.currentPage;
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>User Administration</h2>
          <p class="muted">Ratings, administrator rights, and account removal.</p>
        </div>
      </div>
      <div class="table-wrap">
        ${pageData.total ? `<table>
          <thead>
            <tr><th>Name</th><th>Contacts</th><th>Rating</th><th>Matches</th><th>Admin</th><th></th></tr>
          </thead>
          <tbody>
            ${pageData.items.map((user) => `
              <tr>
                <td><button class="text-link-button inline-profile-link" data-profile-user="${user.id}">${escapeHtml(user.name)}</button></td>
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
        </table>` : `<div class="empty">No users yet.</div>`}
      </div>
      ${paginationMarkup("admin-users", pageData, "users")}
      <div class="message" data-message></div>
    </section>
  `;
}

function renderAdmin() {
  state.view = "tournaments";
  state.tournamentsTab = "admin";
  renderTournaments();
}

function wireAdminUserControls() {
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
    const formatSelect = form.querySelector("[data-admin-tournament-format]");
    if (formatSelect) {
      const updateFormatFields = () => updateTournamentFormatFields(form);
      formatSelect.addEventListener("change", updateFormatFields);
      updateFormatFields();
    }

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
        if (status) status.textContent = "No PDF selected";
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
      setStatus("Not saved", "error");
      return;
    }
    if (snapshot === lastSnapshot) {
      setStatus("", "");
      return;
    }

    saving = true;
    setStatus("Saving...", "saving");
    try {
      await saveAdminTournamentUpdate(form, { renderAfterSave: false });
      lastSnapshot = snapshot;
      setStatus("Saved", "saved");
    } catch (err) {
      setStatus("Save failed", "error");
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
      setStatus("Not saved", "error");
      return;
    }
    setStatus("Unsaved changes", "pending");
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

function updateTournamentFormatFields(form) {
  const format = form.querySelector("[data-admin-tournament-format]")?.value || "single_elimination";
  form.querySelectorAll("[data-format-field]").forEach((field) => {
    const active = field.dataset.formatField === format;
    field.hidden = !active;
    field.querySelectorAll("input, select, textarea").forEach((control) => {
      if (!control.dataset.initialDisabled) {
        control.dataset.initialDisabled = control.disabled ? "1" : "0";
      }
      control.disabled = !active || control.dataset.initialDisabled === "1";
    });
  });
}

function handleTournamentRulesFile(input) {
  const form = input.closest("form");
  const file = input.files?.[0];
  const hidden = form?.elements.rulesFileData;
  const status = form?.querySelector("[data-tournament-rules-file-status]");
  if (!form || !hidden) return;
  if (!file) {
    hidden.value = "";
    form.dataset.rulesFileLoading = "";
    if (status) status.textContent = form.dataset.existingRulesLinkType === "pdf" ? "Existing PDF attached" : "No PDF selected";
    return;
  }
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    input.value = "";
    hidden.value = "";
    form.dataset.rulesFileLoading = "";
    if (status) status.textContent = "Choose a PDF file";
    setMessage("Tournament rules file must be a PDF", true);
    return;
  }
  if (file.size > MAX_TOURNAMENT_RULES_PDF_SIZE) {
    input.value = "";
    hidden.value = "";
    form.dataset.rulesFileLoading = "";
    if (status) status.textContent = "PDF is too large";
    setMessage("Tournament rules PDF must be 2 MB or smaller", true);
    return;
  }
  form.dataset.rulesFileLoading = "1";
  if (status) status.textContent = "Loading PDF...";
  const reader = new FileReader();
  reader.onload = () => {
    hidden.value = String(reader.result || "");
    form.dataset.rulesFileLoading = "";
    if (form.elements.rulesLink) form.elements.rulesLink.value = "";
    if (status) status.textContent = file.name;
    form.dispatchEvent(new CustomEvent("tournament-autosave-request", { bubbles: true }));
  };
  reader.onerror = () => {
    input.value = "";
    hidden.value = "";
    form.dataset.rulesFileLoading = "";
    if (status) status.textContent = "Could not read PDF";
    setMessage("Could not read tournament rules PDF", true);
  };
  reader.readAsDataURL(file);
}

function updateTournamentTiebreakerSelects(form) {
  const selects = Array.from(form.querySelectorAll("[data-tournament-tiebreaker-select]"));
  const selected = new Set(selects.map((select) => select.value).filter(Boolean));
  selects.forEach((select) => {
    select.querySelectorAll("option").forEach((option) => {
      option.disabled = Boolean(option.value && option.value !== select.value && selected.has(option.value));
    });
  });
}

function currentTournamentDetail() {
  return state.adminTournamentDetail || state.publicTournamentDetail || null;
}

async function refreshTournamentParticipantView(tournament) {
  state.adminTournamentPreview = null;
  if (tournamentSlugFromLocation() && tournament?.slug) {
    await renderPublicTournamentRoute(tournament.slug);
    return;
  }
  await loadTournamentAdmin();
  renderTournaments();
}

function wireTournamentInfoControls(data, options = {}) {
  wireLeaderboardProfiles();
  document.querySelectorAll("[data-tournament-info-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.tournamentInfoTab = button.dataset.tournamentInfoTab || "standings";
      try {
        if (state.tournamentInfoTab === "participants" && canManageTournamentParticipants(data)) {
          await loadAdminUsers();
        }
        if (options.publicRoute) renderPublicTournament(data);
        else renderTournaments();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });

  wireFinalStandingsControls(data, options);

  if (document.querySelector("[data-admin-tournament-table-add]")) {
    wireTournamentTableAdminControls();
  }
  if (document.querySelector("[data-admin-tournament-add-participant]")) {
    wireComboFields();
    wireTournamentParticipantAdminControls();
  }
}

function updateFinalStandingsSelects() {
  document.querySelectorAll("[data-final-standing-select]").forEach((select) => {
    select.querySelectorAll("option").forEach((option) => {
      option.disabled = false;
    });
  });
}

function updateFinalStandingStats(select) {
  const stats = select.closest(".final-standing-row")?.querySelector(".final-standing-stats");
  if (stats) stats.textContent = select.selectedOptions[0]?.dataset.stats || "";
}

function wireFinalStandingsControls(data, options = {}) {
  const form = document.querySelector("[data-admin-final-standings]");
  if (!form) return;
  const message = form.querySelector("[data-final-standings-message]");
  const setFinalMessage = (text, isError = false) => {
    if (!message) {
      setMessage(text, isError);
      return;
    }
    message.textContent = text;
    message.classList.toggle("error", Boolean(isError));
  };
  const selects = Array.from(form.querySelectorAll("[data-final-standing-select]"));
  selects.forEach((select) => {
    updateFinalStandingStats(select);
    select.addEventListener("change", () => {
      updateFinalStandingStats(select);
      updateFinalStandingsSelects();
    });
  });
  updateFinalStandingsSelects();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const participantIds = selects.map((select) => Number(select.value));
    if (participantIds.some((id) => !Number.isSafeInteger(id)) || new Set(participantIds).size !== participantIds.length) {
      setFinalMessage("Each final position must use a different player", true);
      return;
    }
    if (!window.confirm("Publish final standings and end this tournament?")) return;
    try {
      const updated = await api(`/api/admin/tournaments/${data.tournament.id}/standings/publish`, {
        method: "POST",
        body: { participantIds }
      });
      state.adminTournamentPreview = null;
      if (options.publicRoute) {
        state.publicTournamentDetail = updated;
        renderPublicTournament(updated);
      } else {
        state.adminTournamentDetail = updated;
        renderTournaments();
      }
    } catch (err) {
      setFinalMessage(err.message, true);
    }
  });
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
  wireTournamentInfoControls(state.adminTournamentDetail);

  document.querySelector("[data-admin-tournament-new]")?.addEventListener("click", () => {
    state.adminTournamentMode = "create";
    state.selectedTournamentId = null;
    state.adminTournamentDetail = null;
    state.adminTournamentPreview = null;
    syncAppHash();
    renderTournaments();
  });

  document.querySelector("[data-admin-tournament-create-cancel]")?.addEventListener("click", () => {
    state.adminTournamentMode = "list";
    state.selectedTournamentId = null;
    state.adminTournamentDetail = null;
    state.adminTournamentPreview = null;
    syncAppHash();
    renderTournaments();
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

  document.querySelector("[data-admin-tournament-close]")?.addEventListener("click", () => {
    state.adminTournamentMode = "list";
    state.selectedTournamentId = null;
    state.adminTournamentDetail = null;
    state.adminTournamentPreview = null;
    syncAppHash();
    renderTournaments();
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
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = "Copy link";
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
  if (form.dataset.rulesFileLoading === "1") {
    throw new Error("Wait until the tournament rules PDF finishes loading");
  }
  const body = {};
  setFormValue(body, form, "name");
  setFormValue(body, form, "gameSystem");
  setFormValue(body, form, "startsAt");
  if (Object.prototype.hasOwnProperty.call(body, "startsAt")) {
    // datetime-local has no timezone; convert in the browser before the API sees it.
    body.startsAt = datetimeLocalToIso(body.startsAt);
  }
  setFormValue(body, form, "format");
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

function setFormValue(body, form, fieldName) {
  const field = form.elements[fieldName];
  if (!field || field.disabled) return;
  body[fieldName] = field.value;
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
      if (!window.confirm("Start this tournament? Seeds and setup will be locked.")) return;
      await api(`/api/admin/tournaments/${tournament.id}/start`, { method: "POST" });
    } else if (action === "generate-next-round") {
      await openNextRoundSetupModal(tournament.id);
      return;
    } else if (action === "delete") {
      if (!window.confirm(`Delete tournament "${tournament.name || "Untitled tournament"}"? Linked tournament games will be deleted and ratings will be recalculated.`)) return;
      await api(`/api/admin/tournaments/${tournament.id}`, { method: "DELETE" });
      state.adminTournamentMode = "list";
      state.selectedTournamentId = null;
      state.adminTournamentDetail = null;
      state.adminTournamentPreview = null;
      await loadTournamentAdmin();
      syncAppHash();
      renderTournaments();
      return;
    }
    await loadTournamentAdmin();
    renderTournaments();
  } catch (err) {
    setMessage(err.message, true);
  }
}

async function openNextRoundSetupModal(tournamentId) {
  try {
    const preview = await api(`/api/admin/tournaments/${tournamentId}/rounds/next/preview`);
    renderRoundSetupModal(preview);
  } catch (err) {
    setMessage(err.message, true);
  }
}

function closeRoundSetupModal() {
  document.querySelector("[data-round-setup-modal]")?.remove();
}

function renderRoundSetupModal(preview) {
  closeRoundSetupModal();
  const tournament = state.adminTournamentDetail?.tournament || {};
  const round = preview.round || {};
  const tables = preview.tables || state.adminTournamentDetail?.tables || [];
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop" data-round-setup-modal>
      <section class="card panel round-setup-dialog" role="dialog" aria-modal="true">
        <div class="panel-header">
          <div>
            <p class="profile-label">${escapeHtml(venueModeLabel(tournament.venueMode))}</p>
            <h2>Generate Round ${round.roundNumber || ""}</h2>
            <p class="muted">Review pairings before saving the round.</p>
          </div>
          <button class="ghost-button" type="button" data-round-setup-close>Cancel</button>
        </div>
        <form class="round-setup-form" data-round-setup-form>
          ${roundMissionFields(tournament, round)}
          <div class="round-setup-list" data-round-setup-list>
            ${(round.matches || []).filter((match) => !match.isBye).map((match) =>
              roundSetupMatchRow(match, tournament, tables)
            ).join("")}
          </div>
          <div class="row-actions">
            ${tournament.format === "swiss" ? `<button class="small-button" type="button" data-round-setup-add-empty>Create empty pairing</button>` : ""}
            <button class="primary-button" type="submit">Generate round</button>
          </div>
          <div class="message" data-round-setup-message></div>
        </form>
      </section>
    </div>
  `);
  wireRoundSetupModal(tournament, tables);
}

function roundMissionFields(tournament, round) {
  const mission = round.mission || {};
  const killzoneField = tournament.venueMode === "tts" ? `
    <div class="field">
      <label>Killzone</label>
      <select name="roundKillzone">
        <option value="">Not selected</option>
        ${optionsHtml(killzoneOptions, mission.killzone || "")}
      </select>
    </div>
  ` : "";
  return `
    <section class="admin-subpanel">
      <div class="grid-2">
        ${killzoneField}
        <div class="field">
          <label>Crit Op</label>
          <select name="roundCritOp">
            <option value="">Not selected</option>
            ${optionsHtml(critOpOptions, mission.critOp || "")}
          </select>
        </div>
      </div>
    </section>
  `;
}

function roundSetupMatchRow(match = {}, tournament = {}, tables = []) {
  return `
    <div class="row-card compact-row-card round-setup-match-row">
      <div class="row-main">
        <div class="round-setup-match-grid ${tournament.venueMode === "irl" ? "has-table" : ""}">
          ${roundSetupPlayerSelect("participantAId", match.participantAId)}
          ${roundSetupPlayerSelect("participantBId", match.participantBId)}
          ${tournament.venueMode === "irl" ? roundSetupTableSelect(match.tableId, tables) : ""}
        </div>
      </div>
      <div class="row-actions">
        <button class="small-button" type="button" data-round-setup-clear>Clear</button>
      </div>
    </div>
  `;
}

function roundSetupPlayerSelect(name, selectedId = "") {
  const participants = listedTournamentParticipants(state.adminTournamentDetail?.participants || [])
    .filter((participant) => ["joined", "active", "pending_placement"].includes(participant.status));
  return `
    <div class="field">
      <label>${name === "participantAId" ? "Player A" : "Player B"}</label>
      <select name="${name}">
        <option value="">Empty</option>
        ${participants.map((participant) => `
          <option value="${participant.id}" ${Number(selectedId) === participant.id ? "selected" : ""}>
            ${escapeHtml(participant.displayName)}${participant.faction ? ` / ${escapeHtml(participant.faction)}` : ""}
          </option>
        `).join("")}
      </select>
    </div>
  `;
}

function roundSetupTableSelect(selectedId, tables = []) {
  const selectedTable = tables.find((table) => Number(selectedId) === table.id);
  return `
    <div class="field">
      <label>Table</label>
      <select name="tableId">
        <option value="">Auto</option>
        ${tables.map((table) => `
          <option value="${table.id}" data-deployment="${escapeHtml(table.deployment || "")}" ${Number(selectedId) === table.id ? "selected" : ""}>
            ${escapeHtml(tableLabel(table))}
          </option>
        `).join("")}
      </select>
      <span class="field-help" data-round-table-deployment>${selectedTable?.deployment ? `Deployment ${selectedTable.deployment}` : "Deployment auto from table"}</span>
    </div>
  `;
}

function tableLabel(table = {}) {
  return [
    `Table ${table.tableNumber}`,
    table.killzone || "",
    table.deployment ? `Deployment ${table.deployment}` : ""
  ].filter(Boolean).join(" / ");
}

function wireRoundSetupModal(tournament, tables) {
  document.querySelector("[data-round-setup-close]")?.addEventListener("click", closeRoundSetupModal);
  document.querySelector("[data-round-setup-add-empty]")?.addEventListener("click", () => {
    document.querySelector("[data-round-setup-list]")?.insertAdjacentHTML(
      "beforeend",
      roundSetupMatchRow({}, tournament, tables)
    );
  });
  document.querySelector("[data-round-setup-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-round-setup-clear]");
    if (!button) return;
    const row = button.closest(".round-setup-match-row");
    row?.querySelectorAll("select").forEach((select) => {
      select.value = "";
      if (select.name === "tableId") updateRoundSetupTableDeployment(select);
    });
  });
  document.querySelector("[data-round-setup-list]")?.addEventListener("change", (event) => {
    if (event.target?.name !== "tableId") return;
    updateRoundSetupTableDeployment(event.target);
  });
  document.querySelectorAll('[name="tableId"]').forEach(updateRoundSetupTableDeployment);
  document.querySelector("[data-round-setup-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("[data-round-setup-message]");
    try {
      await api(`/api/admin/tournaments/${tournament.id}/rounds/next`, {
        method: "POST",
        body: roundSetupPayload(event.currentTarget, tournament)
      });
      closeRoundSetupModal();
      await loadTournamentAdmin();
      renderTournaments();
    } catch (err) {
      if (message) {
        message.textContent = err.message;
        message.classList.add("error");
      } else {
        setMessage(err.message, true);
      }
    }
  });
}

function updateRoundSetupTableDeployment(select) {
  const help = select.closest(".field")?.querySelector("[data-round-table-deployment]");
  if (!help) return;
  const deployment = select.selectedOptions[0]?.dataset.deployment || "";
  help.textContent = deployment ? `Deployment ${deployment}` : "Deployment auto from table";
}

function roundSetupPayload(form, tournament) {
  const rows = Array.from(form.querySelectorAll(".round-setup-match-row"));
  return {
    mission: {
      killzone: tournament.venueMode === "tts" ? form.elements.roundKillzone?.value || "" : "",
      critOp: form.elements.roundCritOp?.value || ""
    },
    matchups: rows.map((row) => ({
      participantAId: row.querySelector('[name="participantAId"]')?.value || "",
      participantBId: row.querySelector('[name="participantBId"]')?.value || "",
      tableId: tournament.venueMode === "irl" ? row.querySelector('[name="tableId"]')?.value || "" : ""
    }))
  };
}

async function refreshAdminTournamentDetailView() {
  await loadTournamentAdmin();
  renderTournaments();
}

function tablePayloadFromForm(form) {
  const data = new FormData(form);
  return {
    tableNumber: data.get("tableNumber") || "",
    killzone: data.get("killzone") || "",
    deployment: data.get("deployment") || ""
  };
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
  if (!window.confirm(`Delete Table ${table?.tableNumber || ""}?`)) return;
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

async function removeAdminTournamentParticipant(participantId) {
  const detail = currentTournamentDetail();
  const tournament = detail?.tournament;
  if (!tournament) return;
  const participant = (detail.participants || []).find((item) => item.id === participantId);
  if (!window.confirm(`Remove ${participant?.displayName || "participant"}?`)) return;
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
    setMessage("Choose a TGTV user to link", true);
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
    setMessage("Registered player replacement is locked after start; add a late participant instead.", true);
    return;
  }
  const select = document.querySelector(`[data-admin-participant-replace-user="${participantId}"]`);
  const userId = Number(select?.value || 0);
  if (!userId) {
    setMessage("Choose a registered user", true);
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

function savedThemePreference() {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (["dark", "light"].includes(saved)) return saved;
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  const nextLabel = selected === "light" ? "Switch to dark theme" : "Switch to light theme";
  button.setAttribute("aria-label", nextLabel);
  button.setAttribute("title", nextLabel);
  button.innerHTML = selected === "light" ? "&#9790;" : "&#9728;";
}

function wireThemeToggle() {
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The theme still applies for the current page when storage is blocked.
    }
    applyTheme(next);
  });
}

function savedLocalePreference() {
  try {
    const saved = window.localStorage.getItem(I18N_LOCALE_STORAGE_KEY);
    if (I18N_SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
  const preferred = window.navigator?.languages?.[0] || window.navigator?.language || "";
  return String(preferred).toLowerCase().startsWith("ru") ? "ru" : "en";
}

function applyLocale(locale) {
  const selected = i18n.setLocale(locale);
  document.documentElement.lang = selected;
  const button = document.querySelector("[data-lang-toggle]");
  if (!button) return;
  button.textContent = selected === "ru" ? "EN" : "RU";
  const label = t("common.langToggle");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function wireLocaleToggle() {
  document.querySelector("[data-lang-toggle]")?.addEventListener("click", () => {
    const next = i18n.getLocale() === "ru" ? "en" : "ru";
    try {
      window.localStorage.setItem(I18N_LOCALE_STORAGE_KEY, next);
    } catch {
      // The language still applies to the current page when storage is blocked.
    }
    applyLocale(next);
    render();
  });
}

applyTheme(savedThemePreference());
wireThemeToggle();
applyLocale(savedLocalePreference());
wireLocaleToggle();
boot();

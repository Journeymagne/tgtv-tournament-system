const app = document.querySelector("#app");

const state = {
  me: null,
  hasAdmin: false,
  view: "play",
  documentationPage: "",
  authMode: "login",
  users: [],
  allGames: [],
  gamesError: "",
  selectedGameId: null,
  tournaments: [],
  tournamentsError: "",
  teamsDashboard: null,
  teamProfile: null,
  teamPairings: [],
  teamPairingDetail: null,
  selectedTeamMatchId: null,
  teamsError: "",
  teamsQuery: "",
  teamsTab: "mine",
  adminTeams: [],
  adminTeamsQuery: "",
  adminTeamsPage: 1,
  teamLeaderboard: [],
  teamLeaderboardPage: 1,
  teamReturnHash: "",
  challengeProgress: [],
  challengeError: "",
  selectedChallengeUserId: null,
  challengeOpenedFromProfile: false,
  challengeTab: "classified",
  statisticsTab: "killTeamWinrates",
  statisticsVenue: "combined",
  selectedStatisticsTeam: null,
  selectedSeasonId: "",
  statisticsFilters: { classification: "all", team: "" },
  statisticsSort: { key: "winRate", dir: "desc" },
  gameFilters: { playerQuery: "", playerId: "", team: "" },
  leaderboardTab: "leaderboard",
  leaderboardVenue: "combined",
  leaderboardPage: 1,
  adminUsersPage: 1,
  adminUsersQuery: "",
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
  sharedChallengeTokenHandled: "",
  notifications: [],
  notificationsUnreadCount: 0,
  notificationsOpen: false,
  notificationsLoading: false,
  notificationsError: "",
  notificationsGeneratedAt: null,
  focusChallengeId: null,
  focusInvitationId: null
};

let searchDebounce = null;
let searchRequestId = 0;
let publicTournamentRequestId = 0;
let teamPairingPollTimer = null;
let teamPairingRequestId = 0;
let notificationPollTimer = null;
let notificationRequestId = 0;
let documentationRequestId = 0;
let documentationLoadPromise = null;

const LEADERBOARD_PAGE_SIZE = 50;
const THEME_STORAGE_KEY = "tgtv-theme";
const NOTIFICATION_POLL_INTERVAL_MS = 30000;

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
  if (!res.ok) throw new Error(data.message || data.error || t("common.requestFailed"));
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

const MARKDOWN_TOOLBAR_ACTIONS = [
  { action: "bold", label: "B", titleKey: "markdown.tool.bold", wrap: "**" },
  { action: "italic", label: "I", titleKey: "markdown.tool.italic", wrap: "*" },
  { action: "heading", label: "H", titleKey: "markdown.tool.heading", prefix: "## " },
  { action: "ul", label: "•", titleKey: "markdown.tool.bulletList", prefix: "- " },
  { action: "ol", label: "1.", titleKey: "markdown.tool.numberList", prefix: "1. ", prefixPattern: /^\d+[.)]\s/ },
  { action: "quote", label: "❝", titleKey: "markdown.tool.quote", prefix: "> " },
  { action: "code", label: "</>", titleKey: "markdown.tool.code", wrap: "`" },
  { action: "link", label: "🔗", titleKey: "markdown.tool.link", link: true }
];

function markdownEditorField(options = {}) {
  const {
    name,
    value = "",
    label = "",
    maxlength = 6000,
    rows = 14,
    placeholder = "",
    disabledAttrs = "",
    fieldClass = "",
    helpText = t("markdown.editor.help")
  } = options;
  const editorId = `markdown-editor-${name}-${(markdownEditorField.counter = (markdownEditorField.counter || 0) + 1)}`;
  const tools = MARKDOWN_TOOLBAR_ACTIONS.map((tool) => `
    <button type="button" class="markdown-tool" data-markdown-action="${tool.action}" title="${escapeHtml(t(tool.titleKey))}" aria-label="${escapeHtml(t(tool.titleKey))}" ${disabledAttrs}>${escapeHtml(tool.label)}</button>
  `).join("");
  return `
    <div class="field markdown-field ${fieldClass}" data-markdown-editor>
      <div class="markdown-field-head">
        <label for="${editorId}">${label}</label>
        <div class="markdown-view-tabs" role="group">
          <button type="button" class="markdown-view-tab is-active" data-markdown-view="edit">${escapeHtml(t("markdown.editor.write"))}</button>
          <button type="button" class="markdown-view-tab" data-markdown-view="preview">${escapeHtml(t("markdown.editor.preview"))}</button>
        </div>
      </div>
      <div class="markdown-toolbar">${tools}</div>
      <textarea id="${editorId}" name="${name}" rows="${rows}" maxlength="${maxlength}" placeholder="${escapeHtml(placeholder)}" data-markdown-input spellcheck="true" ${disabledAttrs}>${escapeHtml(value)}</textarea>
      <div class="markdown-preview markdown-content" data-markdown-preview hidden></div>
      <p class="field-help">${escapeHtml(helpText)}</p>
    </div>
  `;
}

function applyMarkdownTool(textarea, tool) {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const selected = value.slice(start, end);

  if (tool.wrap) {
    const marker = tool.wrap;
    const before = value.slice(start - marker.length, start);
    const after = value.slice(end, end + marker.length);
    if (selected && before === marker && after === marker) {
      // Toggle off when the selection is already wrapped.
      textarea.value = value.slice(0, start - marker.length) + selected + value.slice(end + marker.length);
      textarea.setSelectionRange(start - marker.length, end - marker.length);
    } else {
      const body = selected || t("markdown.editor.sampleText");
      textarea.value = `${value.slice(0, start)}${marker}${body}${marker}${value.slice(end)}`;
      textarea.setSelectionRange(start + marker.length, start + marker.length + body.length);
    }
    return;
  }

  if (tool.link) {
    const text = selected || t("markdown.editor.sampleLinkText");
    const snippet = `[${text}](https://)`;
    textarea.value = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    const urlStart = start + text.length + 3;
    textarea.setSelectionRange(urlStart, urlStart + 8);
    return;
  }

  if (tool.prefix) {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = value.indexOf("\n", end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    // Numbered lists renumber as they go, so matching them needs a pattern, not the literal prefix.
    const matches = (line) => (tool.prefixPattern ? tool.prefixPattern.test(line) : line.startsWith(tool.prefix));
    const allPrefixed = lines.every(matches);
    const next = lines
      .map((line, lineIndex) => {
        if (allPrefixed) {
          return tool.prefixPattern ? line.replace(tool.prefixPattern, "") : line.slice(tool.prefix.length);
        }
        const prefix = tool.action === "ol" ? `${lineIndex + 1}. ` : tool.prefix;
        return `${prefix}${line}`;
      })
      .join("\n");
    textarea.value = value.slice(0, lineStart) + next + value.slice(lineEnd);
    textarea.setSelectionRange(lineStart, lineStart + next.length);
  }
}

function setMarkdownEditorView(editor, view) {
  const textarea = editor.querySelector("[data-markdown-input]");
  const preview = editor.querySelector("[data-markdown-preview]");
  const toolbar = editor.querySelector(".markdown-toolbar");
  if (!textarea || !preview) return;
  const showPreview = view === "preview";
  if (showPreview) {
    const rendered = markdownToHtml(textarea.value);
    preview.innerHTML = rendered || `<p class="muted">${escapeHtml(t("markdown.editor.previewEmpty"))}</p>`;
    preview.style.minHeight = `${textarea.offsetHeight}px`;
  }
  textarea.hidden = showPreview;
  preview.hidden = !showPreview;
  if (toolbar) toolbar.hidden = showPreview;
  editor.querySelectorAll("[data-markdown-view]").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.markdownView === view);
  });
}

function wireMarkdownEditors(root = document) {
  root.querySelectorAll("[data-markdown-editor]").forEach((editor) => {
    if (editor.dataset.markdownWired === "1") return;
    editor.dataset.markdownWired = "1";
    const textarea = editor.querySelector("[data-markdown-input]");
    if (!textarea) return;

    editor.querySelectorAll("[data-markdown-view]").forEach((tab) => {
      tab.addEventListener("click", () => setMarkdownEditorView(editor, tab.dataset.markdownView));
    });

    editor.querySelectorAll("[data-markdown-action]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (textarea.disabled || textarea.readOnly) return;
        const tool = MARKDOWN_TOOLBAR_ACTIONS.find((item) => item.action === button.dataset.markdownAction);
        if (!tool) return;
        applyMarkdownTool(textarea, tool);
        textarea.focus();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });

    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = `${textarea.value.slice(0, start)}  ${textarea.value.slice(end)}`;
      textarea.setSelectionRange(start + 2, start + 2);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

function fmtDate(value) {
  if (!value) return "";
  return i18n.formatDate(new Date(value), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function approvedTotal(score) {
  const crit = Number(score?.crit || 0);
  const kill = Number(score?.kill || 0);
  const tac = Number(score?.tac || 0);
  const primary = ["crit", "kill", "tac"].includes(score?.primary) ? score.primary : "";
  const primaryBonus = primary ? Math.ceil(Number(score?.[primary] || 0) / 2) : 0;
  return crit + kill + tac + primaryBonus;
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
    [t("auth.field.registerNickname"), user?.registerNickname],
    [t("tournaments.field.telegram"), user?.telegramContact]
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
    [t("auth.field.registerNickname"), user?.registerNickname],
    [t("auth.field.telegramContact"), user?.telegramContact]
  ];
  return `
    <div class="card panel">
      <div class="panel-header">
        <div>
          <h3>${t("profile.contacts.title")}</h3>
          <p class="muted">${t("profile.contacts.subtitle")}</p>
        </div>
      </div>
      <div class="contact-list">
        ${rows.map(([label, value]) => `
          <div class="contact-row">
            <span>${escapeHtml(label)}</span>
            <strong>${value ? escapeHtml(value) : t("profile.contacts.notFilled")}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function notificationIcon(type) {
  if (type === "game_challenge") return "⚔";
  if (type === "team_invitation") return "+";
  if (type === "team_tournament_pairing") return "3";
  return "1";
}

function notificationTitle(item) {
  const unknown = t("notifications.unknownPlayer");
  if (item.type === "game_challenge") {
    return t("notifications.challenge.title", { name: item.actor?.name || unknown });
  }
  if (item.type === "team_invitation") {
    return t("notifications.teamInvitation.title", {
      name: item.actor?.name || unknown,
      team: item.team?.name || ""
    });
  }
  if (item.type === "team_tournament_pairing") {
    return t("notifications.teamTournamentPairing.title", { tournament: item.tournament?.name || "" });
  }
  return t("notifications.tournamentPairing.title", { tournament: item.tournament?.name || "" });
}

function notificationMetadata(item) {
  const parts = [];
  if (item.opponent?.name) parts.push(t("notifications.opponent", { name: item.opponent.name }));
  if (item.opponentTeam?.name) parts.push(t("notifications.opponentTeam", { name: item.opponentTeam.name }));
  if (item.roundNumber) parts.push(t("notifications.round", { number: item.roundNumber }));
  const mission = item.mission?.critOp || item.mission?.name || (typeof item.mission === "string" ? item.mission : "");
  if (mission) parts.push(t("notifications.mission", { name: mission }));
  if (item.table?.number) parts.push(t("notifications.table", { number: item.table.number }));
  return parts.join(" · ");
}

function notificationItemMarkup(item) {
  const meta = notificationMetadata(item);
  return `
    <button class="notification-item ${item.unread ? "is-unread" : ""}" type="button" data-notification-item="${escapeHtml(item.id)}">
      <span class="notification-item-icon" aria-hidden="true">${notificationIcon(item.type)}</span>
      <span class="notification-item-copy">
        <span class="notification-item-title">${escapeHtml(notificationTitle(item))}</span>
        ${meta ? `<span class="notification-item-meta">${escapeHtml(meta)}</span>` : ""}
        <span class="notification-item-time">${escapeHtml(fmtDate(item.createdAt))}</span>
      </span>
    </button>`;
}

function renderNotificationControl() {
  const control = document.querySelector("[data-notification-control]");
  const button = document.querySelector("[data-notification-toggle]");
  const badge = document.querySelector("[data-notification-badge]");
  const panel = document.querySelector("[data-notification-panel]");
  if (!control || !button || !badge || !panel) return;

  control.hidden = !state.me;
  if (!state.me) {
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    return;
  }

  const count = Math.max(0, Number(state.notificationsUnreadCount || 0));
  const label = count
    ? t("notifications.button.unread", { count })
    : t("notifications.button.label");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.setAttribute("aria-expanded", String(state.notificationsOpen));
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? "99+" : String(count);
  panel.hidden = !state.notificationsOpen;
  if (!state.notificationsOpen) return;

  let body;
  if (state.notificationsLoading && !state.notifications.length) {
    body = `<div class="notification-loading">${t("notifications.loading")}</div>`;
  } else if (state.notificationsError && !state.notifications.length) {
    body = `<div class="notification-error">${t("notifications.loadError")}<br><button class="small-button notification-retry" type="button" data-notification-retry>${t("notifications.retry")}</button></div>`;
  } else if (!state.notifications.length) {
    body = `<div class="notification-empty">${t("notifications.empty")}</div>`;
  } else {
    const errorNotice = state.notificationsError
      ? `<div class="notification-error">${t("notifications.loadError")}<br><button class="small-button notification-retry" type="button" data-notification-retry>${t("notifications.retry")}</button></div>`
      : "";
    body = `${errorNotice}<div class="notification-list">${state.notifications.map(notificationItemMarkup).join("")}</div>`;
  }
  panel.setAttribute("aria-label", t("notifications.title"));
  panel.innerHTML = `<div class="notification-panel-header"><h2>${t("notifications.title")}</h2></div>${body}`;
}

function resetNotifications() {
  notificationRequestId += 1;
  state.notifications = [];
  state.notificationsUnreadCount = 0;
  state.notificationsOpen = false;
  state.notificationsLoading = false;
  state.notificationsError = "";
  state.notificationsGeneratedAt = null;
  if (notificationPollTimer) window.clearTimeout(notificationPollTimer);
  notificationPollTimer = null;
  renderNotificationControl();
}

function scheduleNotificationPoll() {
  if (notificationPollTimer) window.clearTimeout(notificationPollTimer);
  notificationPollTimer = null;
  if (!state.me || document.visibilityState === "hidden") return;
  notificationPollTimer = window.setTimeout(async () => {
    await loadNotifications({ markRead: state.notificationsOpen });
  }, NOTIFICATION_POLL_INTERVAL_MS);
}

async function loadNotifications(options = {}) {
  if (!state.me) {
    resetNotifications();
    return;
  }
  if (notificationPollTimer) window.clearTimeout(notificationPollTimer);
  notificationPollTimer = null;
  const requestId = ++notificationRequestId;
  state.notificationsLoading = true;
  state.notificationsError = "";
  renderNotificationControl();
  try {
    const data = await api("/api/notifications");
    if (requestId !== notificationRequestId) return;
    state.notifications = data.items || [];
    state.notificationsUnreadCount = Number(data.unreadCount || 0);
    state.notificationsGeneratedAt = data.generatedAt || null;
    if (options.markRead && data.generatedAt) {
      const readState = await api("/api/notifications/read", {
        method: "POST",
        body: { through: data.generatedAt }
      });
      if (requestId !== notificationRequestId) return;
      state.notifications = state.notifications.map((item) => ({
        ...item,
        unread: Boolean(readState.lastSeenAt && item.createdAt > readState.lastSeenAt)
      }));
      state.notificationsUnreadCount = state.notifications.filter((item) => item.unread).length;
    }
  } catch (err) {
    if (requestId !== notificationRequestId) return;
    state.notificationsError = err.message;
  } finally {
    if (requestId === notificationRequestId) {
      state.notificationsLoading = false;
      renderNotificationControl();
      scheduleNotificationPoll();
    }
  }
}

function focusNotificationTarget(selector) {
  window.requestAnimationFrame(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    target.classList.add("notification-target-highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    window.setTimeout(() => target.classList.remove("notification-target-highlight"), 2200);
  });
}

async function openNotificationItem(item) {
  state.notificationsOpen = false;
  renderNotificationControl();
  if (item.type === "game_challenge") {
    await refresh();
    state.focusChallengeId = Number(item.sourceId);
    state.focusInvitationId = null;
    state.view = "play";
    state.teamProfile = null;
    syncAppHash();
    renderShell();
    const active = state.challenges.some((challenge) => challenge.id === state.focusChallengeId && challenge.status === "pending");
    if (!active) setMessage(t("notifications.unavailable"), true);
    return;
  }
  if (item.type === "team_invitation") {
    await loadTeamsDashboard();
    state.teamsTab = "mine";
    state.focusChallengeId = null;
    state.focusInvitationId = Number(item.sourceId);
    state.teamProfile = null;
    state.view = "teams";
    syncAppHash();
    renderShell();
    const active = (state.teamsDashboard?.incomingInvitations || []).some((invitation) => invitation.id === state.focusInvitationId);
    if (!active) setMessage(t("notifications.unavailable"), true);
    return;
  }

  const gameId = item.type === "tournament_pairing"
    ? `tournament-match-${item.sourceId}`
    : Number(item.gameId);
  const game = await loadGame(gameId);
  const tournamentInactive = game?.tournament?.status && game.tournament.status !== "in_progress";
  if (!game || !["open", "pending_confirmation"].includes(game.status) || tournamentInactive) {
    state.view = "games";
    state.gamesTab = "history";
    await loadGames();
    syncAppHash();
    renderShell();
    setMessage(t("notifications.unavailable"), true);
    return;
  }
  if (item.type === "tournament_pairing") {
    state.selectedGameId = gameId;
    state.view = "gameDetail";
    state.focusChallengeId = null;
    state.focusInvitationId = null;
    syncAppHash();
    renderShell();
    return;
  }
  await openGameDetail(game.id);
}

function wireNotificationControl() {
  document.querySelector("[data-notification-toggle]")?.addEventListener("click", async () => {
    state.notificationsOpen = !state.notificationsOpen;
    renderNotificationControl();
    if (state.notificationsOpen) await loadNotifications({ markRead: true });
  });
  document.querySelector("[data-notification-panel]")?.addEventListener("click", async (event) => {
    const retry = event.target.closest("[data-notification-retry]");
    if (retry) {
      await loadNotifications({ markRead: true });
      return;
    }
    const button = event.target.closest("[data-notification-item]");
    if (!button) return;
    const item = state.notifications.find((candidate) => candidate.id === button.dataset.notificationItem);
    if (!item) return;
    try {
      await openNotificationItem(item);
    } catch (err) {
      state.notificationsOpen = true;
      state.notificationsError = err.message;
      renderNotificationControl();
    }
  });
  document.addEventListener("click", (event) => {
    const control = document.querySelector("[data-notification-control]");
    if (!state.notificationsOpen || control?.contains(event.target)) return;
    state.notificationsOpen = false;
    renderNotificationControl();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state.notificationsOpen) return;
    state.notificationsOpen = false;
    renderNotificationControl();
    document.querySelector("[data-notification-toggle]")?.focus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.me) {
      loadNotifications({ markRead: state.notificationsOpen });
    } else {
      scheduleNotificationPoll();
    }
  });
  window.addEventListener("focus", () => {
    if (state.me) loadNotifications({ markRead: state.notificationsOpen });
  });
}

async function refresh() {
  const data = await api("/api/me");
  state.me = data.user;
  state.hasAdmin = data.hasAdmin;
  state.challenges = data.challenges || [];
  state.games = data.games || [];
  state.teamPairings = data.teamPairings || [];
  if (state.me) await loadNotifications();
  else resetNotifications();
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
  renderNotificationControl();
  const tournamentSlug = tournamentSlugFromLocation();
  if (tournamentSlug) {
    renderPublicTournamentRoute(tournamentSlug);
    return;
  }
  leavePublicTournamentRoute();
  const playerTeamSlug = playerTeamSlugFromLocation();
  if (playerTeamSlug) {
    renderPlayerTeamRoute(playerTeamSlug);
    return;
  }
  if (!state.me) {
    const route = appRouteFromHash();
    if (route?.view === "documentation") {
      state.view = "documentation";
      state.documentationPage = route.documentationPage || "";
      renderDocumentation();
      return;
    }
    if (route?.view === "teamPairing" && route.selectedTeamMatchId) {
      openTeamPairing(route.selectedTeamMatchId);
      return;
    }
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
    if (tournamentSlugFromLocation() || playerTeamSlugFromLocation() || !state.me) {
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
  if (section === "documentation") return { view: "documentation", documentationPage: subroute || "" };
  if (section === "matchmaking" || section === "play") {
    const challengeId = subroute === "challenge" ? Number(id) : null;
    return {
      view: "play",
      focusChallengeId: Number.isSafeInteger(challengeId) && challengeId > 0 ? challengeId : null
    };
  }
  if (section === "team-matches") {
    const matchId = Number(subroute);
    return {
      view: "teamPairing",
      selectedTeamMatchId: Number.isSafeInteger(matchId) && matchId > 0 ? matchId : null
    };
  }
  if (section === "leaderboard" || section === "top") {
    const venue = subroute === "teams" ? id : subroute;
    return {
      view: "top",
      leaderboardTab: ["users", "teams"].includes(subroute) ? subroute : "leaderboard",
      leaderboardVenue: ["tts", "irl"].includes(venue) ? venue : "combined"
    };
  }
  if (section === "games") {
    if (subroute === "game") return { view: "gameDetail", selectedGameId: Number(id) };
    if (subroute === "tournament-match") {
      const matchId = Number(id);
      return {
        view: "gameDetail",
        selectedGameId: Number.isSafeInteger(matchId) && matchId > 0 ? `tournament-match-${matchId}` : null
      };
    }
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
  if (section === "teams") {
    const invitationId = subroute === "invitation" ? Number(id) : null;
    return {
      view: "teams",
      teamsTab: subroute === "admin" ? "admin" : "mine",
      teamSlug: ["invitation", "admin"].includes(subroute) ? "" : subroute || "",
      focusInvitationId: Number.isSafeInteger(invitationId) && invitationId > 0 ? invitationId : null
    };
  }
  if (section === "stats" || section === "statistics") {
    return {
      view: "statistics",
      statisticsVenue: ["tts", "irl"].includes(subroute) ? subroute : "combined"
    };
  }
  if (section === "profile") return { view: "profile" };
  if (section === "players") return { view: "player", selectedPlayerId: Number(subroute) };
  if (section === "challenge") {
    const selectedChallengeUserId = Number(subroute);
    return {
      view: "challenge",
      selectedChallengeUserId: Number.isSafeInteger(selectedChallengeUserId) && selectedChallengeUserId > 0
        ? selectedChallengeUserId
        : null
    };
  }
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
  if (route.view === "documentation") state.documentationPage = route.documentationPage || "";
  state.playerProfile = null;
  state.selectedGameId = null;
  state.selectedTeamMatchId = route.view === "teamPairing" ? Number(route.selectedTeamMatchId) : null;
  if (route.view !== "teamPairing") state.teamPairingDetail = null;
  state.focusChallengeId = route.view === "play" ? route.focusChallengeId || null : null;
  state.focusInvitationId = route.view === "teams" ? route.focusInvitationId || null : null;
  if (route.view !== "tournaments") {
    state.adminTournamentMode = "list";
    state.selectedTournamentId = null;
    state.adminTournamentDetail = null;
    state.adminTournamentPreview = null;
  }
  if (route.view === "challenge") {
    const selectedChallengeUserId = Number(route.selectedChallengeUserId);
    state.selectedChallengeUserId = Number.isSafeInteger(selectedChallengeUserId) && selectedChallengeUserId > 0
      ? selectedChallengeUserId
      : state.me.id;
    state.challengeOpenedFromProfile = state.selectedChallengeUserId !== state.me.id;
  } else {
    state.selectedChallengeUserId = null;
    state.challengeOpenedFromProfile = false;
  }
  if (route.view === "feedback") state.feedbackMode = "form";
  if (route.view === "play" && state.focusChallengeId) {
    await refresh();
  } else if (route.view === "teamPairing") {
    if (!state.selectedTeamMatchId) throw new Error(t("teams.pairing.notFound"));
    await loadTeamPairing(state.selectedTeamMatchId, { force: true });
  } else if (route.view === "top") {
    state.leaderboardTab = route.leaderboardTab === "users" && !state.me?.isAdmin ? "leaderboard" : route.leaderboardTab || "leaderboard";
    state.leaderboardVenue = route.leaderboardVenue || "combined";
    if (state.leaderboardTab === "users") await loadAdminUsers();
    else if (state.leaderboardTab === "teams") await loadTeamLeaderboard();
    else await loadTop();
  } else if (route.view === "games") {
    state.gamesTab = state.me?.isAdmin ? route.gamesTab || "history" : "history";
    if (state.gamesTab === "sessions") await loadAdminGames();
    else await loadGames();
  } else if (route.view === "gameDetail") {
    state.selectedGameId = normalizedGameDetailId(route.selectedGameId);
    if (state.selectedGameId && !getKnownGame(state.selectedGameId)) {
      const game = await loadGame(state.selectedGameId);
      state.selectedGameId = game?.id || state.selectedGameId;
    }
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
  } else if (route.view === "teams") {
    state.teamsTab = state.me?.isAdmin ? route.teamsTab || "mine" : "mine";
    state.teamProfile = null;
    if (route.teamSlug) await loadPlayerTeam(route.teamSlug);
    else if (state.teamsTab === "admin") await loadAdminTeams();
    else await loadTeamsDashboard();
  } else if (route.view === "statistics") {
    state.statisticsVenue = route.statisticsVenue || "combined";
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
    const userId = state.selectedChallengeUserId || state.me.id;
    if (!getKnownChallengeProgress(userId)) await loadChallengeProgress(userId);
  }
}

function appHashForState() {
  if (state.view === "play") {
    return state.focusChallengeId
      ? `#/matchmaking/challenge/${encodeURIComponent(state.focusChallengeId)}`
      : "#/matchmaking";
  }
  if (state.view === "teamPairing" && state.selectedTeamMatchId) {
    return `#/team-matches/${encodeURIComponent(state.selectedTeamMatchId)}`;
  }
  if (state.view === "top") {
    if (state.leaderboardTab === "users") return "#/leaderboard/users";
    if (state.leaderboardTab === "teams") return state.leaderboardVenue === "combined" ? "#/leaderboard/teams" : `#/leaderboard/teams/${state.leaderboardVenue}`;
    return state.leaderboardVenue === "combined"
      ? "#/leaderboard"
      : `#/leaderboard/${state.leaderboardVenue}`;
  }
  if (state.view === "games") return state.gamesTab === "sessions" ? "#/games/sessions" : "#/games";
  if (state.view === "gameDetail" && state.selectedGameId) {
    const tournamentMatchId = tournamentMatchIdFromGameId(state.selectedGameId);
    return tournamentMatchId
      ? `#/games/tournament-match/${encodeURIComponent(tournamentMatchId)}`
      : `#/games/game/${encodeURIComponent(state.selectedGameId)}`;
  }
  if (state.view === "tournaments") {
    if (state.tournamentsTab === "admin") {
      if (state.adminTournamentMode === "create") return "#/tournaments/admin/create";
      if (state.selectedTournamentId) return `#/tournaments/admin/${encodeURIComponent(state.selectedTournamentId)}`;
      return "#/tournaments/admin";
    }
    return "#/tournaments";
  }
  if (state.view === "teams") {
    if (state.focusInvitationId) return `#/teams/invitation/${encodeURIComponent(state.focusInvitationId)}`;
    return state.teamProfile?.team?.slug
      ? `#/teams/${encodeURIComponent(state.teamProfile.team.slug)}`
      : state.teamsTab === "admin" && state.me?.isAdmin ? "#/teams/admin" : "#/teams";
  }
  if (state.view === "statistics") {
    return state.statisticsVenue === "combined" ? "#/stats" : `#/stats/${state.statisticsVenue}`;
  }
  if (state.view === "profile") return "#/profile";
  if (state.view === "player" && state.playerProfile?.user?.id) return `#/players/${encodeURIComponent(state.playerProfile.user.id)}`;
  if (state.view === "challenge") {
    return state.selectedChallengeUserId && state.selectedChallengeUserId !== state.me.id
      ? `#/challenge/${encodeURIComponent(state.selectedChallengeUserId)}`
      : "#/challenge";
  }
  if (state.view === "feedback") return "#/feedback";
  if (state.view === "documentation") return state.documentationPage
    ? `#/documentation/${encodeURIComponent(state.documentationPage)}` : "#/documentation";
  return "";
}

function syncAppHash(options = {}) {
  const hash = appHashForState();
  const pathname = tournamentSlugFromPath() || playerTeamSlugFromPath() ? "/" : window.location.pathname;
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

function playerTeamSlugFromPath() {
  const segments = pathSegments();
  return segments.length === 2 && segments[0] === "teams" ? segments[1] || "" : "";
}

function playerTeamSlugFromLocation() {
  return playerTeamSlugFromPath();
}

function playerTeamPublicPath(slug) {
  return `/teams/${encodeURIComponent(slug || "")}`;
}

function stopTeamPairingPoll() {
  if (teamPairingPollTimer !== null) window.clearTimeout(teamPairingPollTimer);
  teamPairingPollTimer = null;
}

function leavePublicTournamentRoute() {
  publicTournamentRequestId += 1;
  stopTeamPairingPoll();
}

function isCurrentPublicTournamentRoute(slug) {
  return tournamentSlugFromLocation() === String(slug || "");
}

function scheduleTeamPairingPoll(slug) {
  stopTeamPairingPoll();
  teamPairingPollTimer = window.setTimeout(async () => {
    teamPairingPollTimer = null;
    if (!isCurrentPublicTournamentRoute(slug)) return;
    if (teamPairingSubmissionPending()) { scheduleTeamPairingPoll(slug); return; }
    const requestId = publicTournamentRequestId;
    try {
      const data = await api(`/api/tournaments/${encodeURIComponent(slug)}`);
      if (requestId !== publicTournamentRequestId || !isCurrentPublicTournamentRoute(slug)) return;
      if (teamPairingSubmissionPending()) { scheduleTeamPairingPoll(slug); return; }
      const restore = preserveTeamPairingDrafts();
      state.publicTournamentDetail = data;
      renderPublicTournament(data);
      restore();
    } catch {
      if (isCurrentPublicTournamentRoute(slug)) scheduleTeamPairingPoll(slug);
    }
  }, 5000);
}

function teamPairingSubmissionPending() {
  return Boolean(document.querySelector('[data-team-pairing-form] [type="submit"]:disabled, [data-team-pair-action="roll"]:disabled, [data-team-match-reset]:disabled, [data-team-pairings-override] [type="submit"]:disabled'));
}

function preserveTeamPairingDrafts() {
  const key = (form) => `${form.dataset.teamMatchId}:${form.dataset.teamPairingForm}:${form.dataset.side || ""}:${form.dataset.step || ""}`;
  const drafts = new Map([...document.querySelectorAll("[data-team-pairing-form]")].map((form) =>
    [key(form), [...form.querySelectorAll("select[name]")].map((select) => [select.name, select.value])]));
  return () => {
    document.querySelectorAll("[data-team-pairing-form]").forEach((form) => {
      for (const [name, value] of drafts.get(key(form)) || []) {
        const select = form.elements.namedItem(name);
        if (select && [...select.options].some((option) => option.value === value)) select.value = value;
      }
    });
  };
}

function isCurrentTeamPairingRoute(matchId) {
  const segments = hashSegments();
  return segments[0] === "team-matches" && Number(segments[1]) === Number(matchId) &&
    state.view === "teamPairing" && Number(state.selectedTeamMatchId) === Number(matchId);
}

function scheduleTeamPairingScreenPoll(matchId) {
  stopTeamPairingPoll();
  teamPairingPollTimer = window.setTimeout(async () => {
    teamPairingPollTimer = null;
    if (!isCurrentTeamPairingRoute(matchId)) return;
    if (teamPairingSubmissionPending()) { scheduleTeamPairingScreenPoll(matchId); return; }
    try {
      const loaded = await loadTeamPairing(matchId, { force: true });
      if (!loaded) return;
      if (isCurrentTeamPairingRoute(matchId)) {
        if (teamPairingSubmissionPending()) { scheduleTeamPairingScreenPoll(matchId); return; }
        const restore = preserveTeamPairingDrafts();
        if (state.me) renderShell();
        else renderTeamPairing();
        restore();
      }
    } catch (err) {
      if (isCurrentTeamPairingRoute(matchId)) {
        setMessage(err.message, true);
        scheduleTeamPairingScreenPoll(matchId);
      }
    }
  }, 5000);
}

async function loadTeamPairing(matchId, options = {}) {
  const id = Number(matchId);
  if (!options.force && state.teamPairingDetail?.teamMatch?.id === id) return state.teamPairingDetail;
  const requestId = ++teamPairingRequestId;
  const data = await api(`/api/team-matches/${encodeURIComponent(id)}`);
  if (requestId !== teamPairingRequestId) return null;
  state.teamPairingDetail = data;
  state.selectedTeamMatchId = id;
  return data;
}

async function openTeamPairing(matchId) {
  const id = Number(matchId);
  if (!Number.isSafeInteger(id) || id < 1) return;
  state.view = "teamPairing";
  state.selectedTeamMatchId = id;
  state.teamPairingDetail = null;
  state.focusChallengeId = null;
  syncAppHash();
  if (state.me) renderShell();
  else renderTeamPairing();
  try {
    await loadTeamPairing(id, { force: true });
    if (isCurrentTeamPairingRoute(id)) {
      if (state.me) renderShell();
      else renderTeamPairing();
    }
  } catch (err) {
    if (isCurrentTeamPairingRoute(id)) setMessage(err.message, true);
  }
}

function navigateToPlayerTeam(slug) {
  if (!slug) return;
  if (state.view === "top" || (state.view === "teams" && !state.teamProfile)) state.teamReturnHash = appHashForState();
  else state.teamReturnHash = "";
  window.history.pushState(null, "", playerTeamPublicPath(slug));
  leavePublicTournamentRoute();
  renderPlayerTeamRoute(slug, { force: true });
}

function clearPlayerTeamRoute() {
  if (playerTeamSlugFromLocation()) window.history.replaceState(null, "", `/${window.location.search}`);
}

function navigateToPublicTournament(slug) {
  if (!slug) return;
  state.tournamentInfoTab = "standings";
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

function getKnownPublicTournament(slug) {
  return state.publicTournamentDetail?.tournament?.slug === String(slug || "")
    ? state.publicTournamentDetail
    : null;
}

async function loadPublicTournament(slug, options = {}) {
  const { force = false } = options;
  if (!force) {
    const cached = getKnownPublicTournament(slug);
    if (cached) return cached;
  }
  const data = await api(`/api/tournaments/${encodeURIComponent(slug)}`);
  state.publicTournamentDetail = data;
  return data;
}

async function renderPublicTournamentRoute(slug, options = {}) {
  if (!isCurrentPublicTournamentRoute(slug)) return;
  const { force = false } = options;
  const requestId = ++publicTournamentRequestId;
  const cached = force ? null : getKnownPublicTournament(slug);
  if (cached) {
    renderPublicTournament(cached);
    return;
  }
  publicTournamentContainer().innerHTML = `<div class="loading">${t("tournaments.loading")}</div>`;
  try {
    const data = await loadPublicTournament(slug, { force });
    if (requestId !== publicTournamentRequestId || !isCurrentPublicTournamentRoute(slug)) return;
    renderPublicTournament(data);
  } catch (err) {
    if (requestId !== publicTournamentRequestId || !isCurrentPublicTournamentRoute(slug)) return;
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
  const isTeamTournament = tournament.participantMode === "team";
  const listedParticipants = isTeamTournament
    ? (data.rosters || []).filter((roster) => roster.status !== "withdrawn")
    : listedTournamentParticipants(data.participants || []);
  state.publicTournamentDetail = data;
  publicTournamentContainer().innerHTML = `
    <div class="public-tournament-layout ${state.me ? "embedded-public-tournament" : ""}">
      <section class="card panel public-tournament-shell">
        <div class="panel-header public-tournament-header">
          <div>
            <p class="profile-label">${escapeHtml(tournamentFormatSummary(tournament))}</p>
            <h2>${escapeHtml(tournament.name || t("tournaments.fallbackName"))}</h2>
            <p class="muted">${escapeHtml(tournamentStatusLabel(tournament.status))}${tournament.startsAt ? ` · ${fmtDate(tournament.startsAt)}` : ""}</p>
          </div>
          <div class="row-actions">
            ${state.me ? `
              ${tournamentEditButton(tournament)}
              ${publicTournamentViewerActions(data)}
            ` : `
              <button class="small-button" data-public-login>${t("auth.tab.signIn")}</button>
              <button class="primary-button" data-public-register>${t("auth.tab.register")}</button>
            `}
          </div>
        </div>
        ${tournament.description ? `<div class="public-tournament-description markdown-content">${markdownToHtml(tournament.description)}</div>` : ""}
        ${tournamentRulesLinkMarkup(tournament)}
        <section class="profile-grid tournament-metrics">
          ${metricCard(t("tournaments.field.date"), tournamentDateLabel(tournament))}
          ${metricCard(t(isTeamTournament ? "teams.tournament.rosters" : "tournaments.field.participants"), String(listedParticipants.length))}
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
  if (tournament.participantMode === "team") {
    const roster = (data.rosters || []).find((item) => item.status !== "withdrawn" &&
      (item.members || []).some((member) => !member.endedAt && member.userId === state.me.id));
    if (!roster && tournament.status === "registration_open") {
      return `<button class="primary-button" data-public-tournament-join="${tournament.id}">${t("teams.tournament.register")}</button>`;
    }
    if (roster && ["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
      const team = (data.viewerTeams || []).find((item) => item.id === roster.teamId);
      const membership = (team?.members || []).find((item) => item.userId === state.me.id && !item.endedAt);
      const canManage = roster.captainUserId === state.me.id || membership?.role === "leader";
      return canManage ? `<button class="small-button" data-public-team-roster-edit="${roster.id}">${t("teams.tournament.edit")}</button><button class="danger-button" data-public-team-roster-withdraw="${roster.id}">${t("teams.tournament.withdraw")}</button>` : "";
    }
    return "";
  }
  if (!viewer.participantId && tournament.status === "registration_open") {
    return `<button class="primary-button" data-public-tournament-join="${tournament.id}">${t("tournaments.action.join")}</button>`;
  }
  if (viewer.participantId && ["draft", "registration_open", "registration_closed"].includes(tournament.status)) {
    return `<button class="danger-button" data-public-tournament-withdraw="${tournament.id}">${t("tournaments.action.withdraw")}</button>`;
  }
  return "";
}

function tournamentEditButton(tournament) {
  const id = Number(tournament?.id);
  if (!state.me?.isAdmin || !Number.isSafeInteger(id) || id < 1) return "";
  return `<button class="small-button" type="button" data-tournament-edit="${id}">${t("common.edit")}</button>`;
}

async function openTournamentEditor(tournamentId) {
  const id = Number(tournamentId);
  if (!state.me?.isAdmin || !Number.isSafeInteger(id) || id < 1) return;
  const data = await api(`/api/admin/tournaments/${id}`);
  leavePublicTournamentRoute();
  Object.assign(state, {
    view: "tournaments",
    tournamentsTab: "admin",
    adminTournamentMode: "detail",
    selectedTournamentId: id,
    adminTournamentDetail: data,
    adminTournamentPreview: null,
    tournamentInfoTab: "settings"
  });
  syncAppHash();
  renderShell();
}

function wireTournamentEditButtons() {
  document.querySelectorAll("[data-tournament-edit]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await openTournamentEditor(button.dataset.tournamentEdit);
      } catch (err) {
        setMessage(err.message, true);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  });
}

function renderTournamentJoinForm(data) {
  const tournament = data.tournament || {};
  if (tournament.participantMode === "team") {
    renderTeamRosterRegistration(data);
    return;
  }
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
      await renderPublicTournamentRoute(tournament.slug, { force: true });
    } catch (err) {
      setMessage(err.message, true);
    }
  });
}

function teamRosterMemberFields(team, roster = null) {
  const members = [...(team?.members || [])].filter((member) => member.userId && !member.endedAt);
  members.sort((a, b) => (b.userId === state.me?.id) - (a.userId === state.me?.id));
  const options = (selectedId) => members.map((member) => `
    <option value="${member.userId}" ${member.userId === Number(selectedId) ? "selected" : ""}>${escapeHtml(member.user?.name || member.displayNameSnapshot)}</option>
  `).join("");
  const rosterMembers = activeRosterMembersForUi(roster || {}).sort((a, b) => a.slot - b.slot);
  const defaults = [0, 1, 2].map((index) => rosterMembers[index]?.userId || members[index]?.userId);
  return `
    <div class="team-roster-member-grid">
      ${[0, 1, 2].map((index) => `
        <div class="team-roster-player-row">
          <div class="field">
            <label>${t("teams.tournament.player", { number: index + 1 })}</label>
            <select name="member-${index + 1}" required>${options(defaults[index])}</select>
          </div>
          <div class="field">
            <label>${t("tournaments.field.faction")}</label>
            <select name="faction-${index + 1}" required>
              <option value="">${t("tournaments.registration.factionPlaceholder")}</option>
              ${optionsHtml(killTeamOptions, rosterMembers[index]?.factionSnapshot || "")}
            </select>
          </div>
        </div>
      `).join("")}
    </div>
    <div class="field">
      <label>${t("teams.tournament.captain")}</label>
      <select name="captainUserId" required>${options(roster?.captainUserId || defaults[0])}</select>
    </div>
  `;
}

function wireTeamRosterMemberSelection(form) {
  const selects = [1, 2, 3].map((slot) => form.elements[`member-${slot}`]).filter(Boolean);
  const captain = form.elements.captainUserId;
  if (!captain) return;
  const refreshCaptain = () => {
    const previous = Number(captain.value);
    const choices = selects.map((select) => ({
      id: Number(select.value),
      label: select.selectedOptions[0]?.textContent || ""
    })).filter((choice, index, all) => choice.id && all.findIndex((item) => item.id === choice.id) === index);
    captain.innerHTML = choices.map((choice) => `<option value="${choice.id}" ${choice.id === previous ? "selected" : ""}>${escapeHtml(choice.label)}</option>`).join("");
    if (!choices.some((choice) => choice.id === previous) && choices[0]) captain.value = String(choices[0].id);
  };
  selects.forEach((select) => select.addEventListener("change", refreshCaptain));
  refreshCaptain();
}

function renderTeamRosterRegistration(data, editingRoster = null) {
  const tournament = data.tournament || {};
  const teams = (data.viewerTeams || []).filter((team) => !team.archivedAt && (team.members || []).length >= 3);
  const firstTeam = editingRoster
    ? teams.find((team) => team.id === editingRoster.teamId)
    : teams[0];
  publicTournamentContainer().innerHTML = `
    <div class="public-tournament-layout ${state.me ? "embedded-public-tournament" : ""}">
      <section class="card panel public-tournament-shell tournament-registration-shell">
        <div class="panel-header public-tournament-header">
          <div><p class="profile-label">${t(editingRoster ? "teams.tournament.editTitle" : "teams.tournament.registrationTitle")}</p><h2>${escapeHtml(tournament.name || t("tournaments.fallbackName"))}</h2><p class="muted">${t("teams.tournament.registrationHint")}</p></div>
          <button class="small-button" type="button" data-tournament-registration-cancel>${t("common.cancel")}</button>
        </div>
        ${teams.length ? `
          <form class="tournament-registration-form" data-public-team-roster-registration>
            <div class="grid-2">
              <div class="field"><label>${t("teams.tournament.team")}</label><select name="teamId" required ${editingRoster ? "disabled" : ""}>${teams.map((team) => `<option value="${team.id}" ${team.id === firstTeam?.id ? "selected" : ""}>${escapeHtml(team.name)}</option>`).join("")}</select></div>
              <div class="field"><label>${t("teams.tournament.rosterName")}</label><input name="name" minlength="2" maxlength="80" value="${escapeHtml(editingRoster?.name || firstTeam?.name || "")}" required></div>
            </div>
            <div data-team-roster-member-fields>${teamRosterMemberFields(firstTeam, editingRoster)}</div>
            <button class="primary-button" type="submit">${t(editingRoster ? "common.save" : "teams.tournament.registerSubmit")}</button>
            <div class="message" data-message></div>
          </form>
        ` : `<div class="empty">${t("teams.tournament.noEligibleTeam")}</div>`}
      </section>
    </div>`;
  document.querySelector("[data-tournament-registration-cancel]")?.addEventListener("click", () => renderPublicTournament(data));
  const form = document.querySelector("[data-public-team-roster-registration]");
  if (form) wireTeamRosterMemberSelection(form);
  form?.elements.teamId?.addEventListener("change", () => {
    const team = teams.find((item) => item.id === Number(form.elements.teamId.value));
    const fields = form.querySelector("[data-team-roster-member-fields]");
    if (fields) fields.innerHTML = teamRosterMemberFields(team);
    form.elements.name.value = team?.name || "";
    wireTeamRosterMemberSelection(form);
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = [1, 2, 3].map((slot) => ({
      userId: Number(form.elements[`member-${slot}`].value),
      faction: form.elements[`faction-${slot}`].value
    }));
    if (new Set(selected.map((member) => member.userId)).size !== 3) {
      setMessage(t("teams.tournament.uniquePlayersRequired"), true);
      return;
    }
    if (!editingRoster && !selected.some((member) => member.userId === state.me?.id)) {
      setMessage(t("teams.tournament.selfRequired"), true);
      return;
    }
    try {
      await api(editingRoster
        ? `/api/tournaments/${tournament.id}/rosters/${editingRoster.id}`
        : `/api/tournaments/${tournament.id}/rosters`, { method: editingRoster ? "PATCH" : "POST", body: {
        teamId: Number(form.elements.teamId.value),
        name: form.elements.name.value,
        captainUserId: Number(form.elements.captainUserId.value),
        members: selected
      } });
      await renderPublicTournamentRoute(tournament.slug, { force: true });
    } catch (err) {
      setMessage(err.message, true);
    }
  });
}

function wirePublicTournamentNav(data) {
  const tournament = data?.tournament || {};
  wireTournamentEditButtons();
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
    if (!window.confirm(t("dialog.tournaments.withdraw"))) return;
    try {
      await api(`/api/tournaments/${tournament.id}/withdraw`, { method: "POST" });
      await renderPublicTournamentRoute(tournament.slug, { force: true });
    } catch (err) {
      window.alert(err.message);
    }
  });
  document.querySelector("[data-public-team-roster-edit]")?.addEventListener("click", (event) => {
    const roster = (data.rosters || []).find((item) => item.id === Number(event.currentTarget.dataset.publicTeamRosterEdit));
    if (roster) renderTeamRosterRegistration(data, roster);
  });
  document.querySelector("[data-public-team-roster-withdraw]")?.addEventListener("click", async (event) => {
    if (!window.confirm(t("teams.tournament.withdrawConfirm"))) return;
    try {
      await api(`/api/tournaments/${tournament.id}/rosters/${event.currentTarget.dataset.publicTeamRosterWithdraw}/withdraw`, { method: "POST" });
      await renderPublicTournamentRoute(tournament.slug, { force: true });
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

function tournamentFormatLabel(tournament) {
  return tournament?.participantMode === "team"
    ? t("tournaments.participantMode.team")
    : formatLabel(tournament?.format);
}

function tournamentFormatSummary(tournament) {
  if (tournament?.participantMode !== "team") return formatLabel(tournament?.format);
  return [
    t("tournaments.participantMode.team"),
    t("tournaments.teamVariant.teamsOfThree"),
    t("tournaments.pairingType.shieldSword")
  ].join(" · ");
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
  const now = Date.now();
  return seasons.find((season) => {
    const startsAt = season.startsAt ? Date.parse(season.startsAt) : Number.NEGATIVE_INFINITY;
    const endsAt = season.endsAt ? Date.parse(season.endsAt) : Number.POSITIVE_INFINITY;
    return now >= startsAt && now < endsAt;
  }) || seasons[seasons.length - 1] || { id: "2026-q3-dataslate", name: "2026 Q3 Dataslate" };
}

function newTournamentDefaultSeason() {
  return seasons[seasons.length - 1] || latestSeason();
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
  const isTeamTournament = tournament.participantMode === "team";
  const canManage = Boolean(options.admin && canManageTournamentParticipants(data));
  const activeTab = tournamentInfoActiveTab(data, options);
  const wrapperTag = options.admin ? "section" : "div";
  const wrapperClass = options.admin ? "admin-subpanel wide-panel" : "card panel wide-panel";
  const titleByTab = {
    settings: t("tournaments.tab.settings"),
    standings: t("tournaments.tab.standings"),
    matches: t("tournaments.tab.matches"),
    stats: t("tournaments.tab.stats"),
    participants: t(isTeamTournament ? "teams.tournament.rosters" : "tournaments.field.participants"),
    tables: t("tournaments.tab.tables")
  };
  const subtitleByTab = {
    settings: t("tournaments.info.settingsSubtitle"),
    standings: isTeamTournament ? t("teams.tournament.standingsHint") : standingsSubtitle(tournament),
    matches: t("tournaments.info.matchesSubtitle"),
    stats: t("tournaments.info.statsSubtitle", { name: tournament.name || t("tournaments.fallbackName") }),
    participants: isTeamTournament
      ? t("teams.tournament.rosterCount", { count: (data.rosters || []).filter((roster) => roster.status !== "withdrawn").length })
      : participantStatusSummary(data.participants || []),
    tables: t(isTeamTournament ? "teams.tournament.tablesHint" : "tournaments.info.tablesSubtitle")
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
    tabs.push({ id: "participants", label: t(data?.tournament?.participantMode === "team" ? "teams.tournament.rosters" : "tournaments.field.participants") });
    if (data?.tournament?.venueMode === "irl" || data?.tournament?.participantMode === "team") tabs.push({ id: "tables", label: t("tournaments.tab.tables") });
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
  return data?.tournament?.participantMode === "team" ? teamStandingsTable(data) : publicStandingsTable(data);
}

function tournamentMatchesContent(data, options = {}) {
  if (data?.tournament?.participantMode === "team") {
    return options.admin
      ? `${adminTournamentPreviewPanel(data)}${teamTournamentRoundsMarkup(data, options)}`
      : teamTournamentRoundsMarkup(data, options);
  }
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
  const tiebreakerColumns = (data.tournament?.tiebreakerOrder || [])
    .filter((key, index, order) => order.indexOf(key) === index)
    .map((key) => {
      if (key === "strength_of_schedule") {
        return { label: t("tiebreaker.strengthOfSchedule.label"), value: (row) => row.strengthOfSchedule ?? 0 };
      }
      if (key === "buchholz") return { label: t("tiebreaker.buchholz.label"), value: (row) => row.buchholz ?? 0 };
      if (key === "head_to_head") return { label: t("tiebreaker.headToHead.label"), value: (row) => row.headToHeadWins ?? 0 };
      if (key === "total_vp") return { label: t("tiebreaker.totalVp.label"), value: (row) => row.totalVp ?? 0 };
      if (key === "vp_diff") return { label: t("tiebreaker.vpDiff.label"), value: (row) => row.vpDiff ?? 0 };
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
            ${tiebreakerColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}
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
                ${tiebreakerColumns.map((column) => `<td>${column.value(row)}</td>`).join("")}
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
  return tournamentRoundsTabbedMarkup(rounds, (match) => publicMatchMarkup(match, tournament));
}

function defaultTournamentRoundNumber(rounds = []) {
  const ordered = [...rounds].sort((a, b) => Number(a.roundNumber) - Number(b.roundNumber));
  const active = ordered.filter((round) => round.status === "active");
  return Number((active.at(-1) || ordered.at(-1))?.roundNumber || 0);
}

function tournamentRoundsTabbedMarkup(rounds, matchMarkup) {
  const ordered = [...rounds].sort((a, b) => Number(a.roundNumber) - Number(b.roundNumber));
  const selectedRoundNumber = defaultTournamentRoundNumber(ordered);
  return `
    <div class="tournament-round-switcher" data-tournament-round-switcher>
      <div class="tabs tournament-round-tabs" role="tablist" aria-label="${t("tournaments.round.tabsAria")}">
        ${ordered.map((round) => `
          <button
            class="tab ${Number(round.roundNumber) === selectedRoundNumber ? "active" : ""}"
            type="button"
            role="tab"
            aria-selected="${Number(round.roundNumber) === selectedRoundNumber ? "true" : "false"}"
            data-tournament-round-tab="${round.roundNumber}"
          >${t("tournaments.round.title", { number: round.roundNumber })}</button>
        `).join("")}
      </div>
      <div class="public-rounds">
        ${ordered.map((round) => `
        <section class="public-round" data-tournament-round-panel="${round.roundNumber}" ${Number(round.roundNumber) === selectedRoundNumber ? "" : "hidden"}>
          <div class="public-round-title">
            <strong>${t("tournaments.round.title", { number: round.roundNumber })}</strong>
            <span class="status ${round.status === "active" ? "pending" : round.status === "completed" ? "completed" : ""}">${escapeHtml(tournamentMatchStatusLabel(round.status))}</span>
          </div>
          <div class="list">
            ${(round.matches || []).map(matchMarkup).join("")}
          </div>
        </section>
        `).join("")}
      </div>
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

function pageTabs(section, tabs, active, { publicTabs = false } = {}) {
  if (!state.me?.isAdmin && !publicTabs) return "";
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

function venueTabs(scope, activeVenue) {
  return `
    <div class="tabs page-tabs venue-tabs" aria-label="${t("venue.tabsAria")}">
      <button class="tab ${activeVenue === "tts" ? "active" : ""}" data-venue-tab="${scope}" data-venue="tts">TTS</button>
      <button class="tab ${activeVenue === "irl" ? "active" : ""}" data-venue-tab="${scope}" data-venue="irl">${t("venue.irl")}</button>
      <button class="tab ${activeVenue === "combined" ? "active" : ""}" data-venue-tab="${scope}" data-venue="combined">${t("venue.combined")}</button>
    </div>
  `;
}

function wireVenueTabs() {
  document.querySelectorAll("[data-venue-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      const venue = ["combined", "irl"].includes(button.dataset.venue) ? button.dataset.venue : "tts";
      if (button.dataset.venueTab === "leaderboard") {
        state.leaderboardVenue = venue;
        state.leaderboardPage = 1;
        state.teamLeaderboardPage = 1;
        if (state.leaderboardTab === "teams") await loadTeamLeaderboard();
        else await loadTop();
      } else {
        state.statisticsVenue = venue;
        state.selectedStatisticsTeam = null;
      }
      syncAppHash();
      renderShell();
    });
  });
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
          else if (value === "teams") await loadTeamLeaderboard();
          else await loadTop();
        } else if (section === "teams") {
          state.teamsTab = value === "admin" && state.me?.isAdmin ? "admin" : "mine";
          state.teamProfile = null;
          if (state.teamsTab === "admin") await loadAdminTeams();
          else await loadTeamsDashboard();
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
  wireTournamentEditButtons();
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
          <div class="row-meta">${escapeHtml(tournamentFormatLabel(tournament))} / ${escapeHtml(tournamentStatusLabel(tournament.status))}</div>
        </div>
        <dl class="tournament-card-facts">
          ${tournamentCardFact(t(tournament.participantMode === "team" ? "teams.tournament.rosters" : "tournaments.field.participants"), tournamentParticipantCountLabel(tournament))}
          ${tournamentCardFact(t("tournaments.card.rating"), tournament.ratingPolicy === "ranked" ? t("tournaments.card.ranked") : t("tournaments.card.unranked"))}
          ${tournamentCardFact(t("tournaments.card.starts"), tournament.startsAt ? fmtDate(tournament.startsAt) : t("tournaments.date.none"))}
          ${tournamentCardFact(t("tournaments.field.rounds"), tournamentRoundCountLabel(tournament))}
        </dl>
      </div>
      <div class="tournament-card-actions">
        <span class="status ${tournamentStatusClass(tournament.status)}">${escapeHtml(tournamentStatusLabel(tournament.status))}</span>
        <div class="tournament-card-buttons">
          <button class="primary-button" type="button" data-tournament-open="${escapeHtml(tournament.slug)}">${t("tournaments.card.open")}</button>
          ${tournamentEditButton(tournament)}
        </div>
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
      throw new Error(t("play.share.alreadyHandled"));
    }
    if (challenge.toUserId !== state.me.id) {
      throw new Error(t("play.share.wrongRecipient"));
    }
    const opponentName = challenge.from?.name || t("games.review.opponentFallback");
    if (!window.confirm(t("dialog.play.acceptChallenge", { name: opponentName }))) {
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
          <a class="documentation-auth-link" href="/#/documentation">${t("nav.documentation")}</a>
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
        <button class="password-toggle" type="button" data-password-toggle="${id}" aria-label="${t("auth.password.show")}" aria-pressed="false">
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
      button.setAttribute("aria-label", show ? t("auth.password.hide") : t("auth.password.show"));
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
      setMessage(t("message.auth.passwordMismatch"), true);
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
  if (!tournamentSlugFromLocation()) leavePublicTournamentRoute();
  renderNotificationControl();
  setSidebarOpen(false);
  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-title">
        <div class="app-brand">
          <img class="app-logo" src="/logo.png" alt="${t("auth.brand.logoAlt")}">
          <div>
            <div class="app-brand-name">${t("nav.brand.name")}</div>
            <div class="app-brand-subtitle">${t("nav.brand.subtitle")}</div>
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
            <span class="rating-pill inline-rating">${t("profile.rating.mmr")} ${playerRating(state.me, "combined")}</span>
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
        ${navButton("teams", t("nav.playerTeams"))}
        ${navButton("statistics", t("nav.stats"))}
        ${navButton("profile", t("nav.profile"))}
        ${navButton("challenge", t("nav.challenge"))}
        ${navButton("documentation", t("nav.documentation"))}
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
      state.selectedTeamMatchId = null;
      state.teamPairingDetail = null;
      state.focusChallengeId = null;
      state.focusInvitationId = null;
      if (targetView === "challenge") {
        state.challengeOpenedFromProfile = false;
        state.selectedChallengeUserId = state.me.id;
      } else {
        state.selectedChallengeUserId = null;
        state.challengeOpenedFromProfile = false;
      }
      if (targetView === "feedback") state.feedbackMode = "form";
      if (targetView === "documentation") state.documentationPage = "";
      if (targetView === "top") state.leaderboardTab = "leaderboard";
      if (targetView === "games") state.gamesTab = "history";
      if (targetView === "tournaments") {
        state.tournamentsTab = "public";
        state.adminTournamentMode = "list";
        state.selectedTournamentId = null;
        state.adminTournamentDetail = null;
        state.adminTournamentPreview = null;
      }
      if (targetView === "teams") { state.teamProfile = null; state.teamsTab = "mine"; }
      syncAppHash();
      renderShell();
      try {
        if (targetView === "games") await loadGames();
        if (targetView === "tournaments") await loadTournaments();
        if (targetView === "teams") await loadTeamsDashboard();
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
  else if (state.view === "teams") renderTeams();
  else if (state.view === "gameDetail") renderGameDetail();
  else if (state.view === "teamPairing") renderTeamPairing();
  else if (state.view === "statistics") renderStatistics();
  else if (state.view === "challenge") renderChallenge();
  else if (state.view === "feedback") renderFeedback();
  else if (state.view === "documentation") renderDocumentation();
  else if (state.view === "top") renderTop();
  else renderPlay();
}

function loadDocumentation() {
  if (window.TGTV_DOCUMENTATION) return Promise.resolve(window.TGTV_DOCUMENTATION);
  if (documentationLoadPromise) return documentationLoadPromise;
  const boot = document.querySelector('script[src*="theme-boot.js"]');
  const query = boot && boot.src.includes("?") ? boot.src.slice(boot.src.indexOf("?")) : "";
  documentationLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `/documentation.js${query}`;
    script.onload = () => {
      if (window.TGTV_DOCUMENTATION) resolve(window.TGTV_DOCUMENTATION);
      else {
        documentationLoadPromise = null;
        script.remove();
        reject(new Error(t("documentation.loadError")));
      }
    };
    script.onerror = () => {
      documentationLoadPromise = null;
      script.remove();
      reject(new Error(t("documentation.loadError")));
    };
    document.head.appendChild(script);
  });
  return documentationLoadPromise;
}

async function renderDocumentation() {
  const requestId = ++documentationRequestId;
  const page = state.documentationPage || "";
  const locale = i18n.getLocale();
  const container = state.me ? document.querySelector("[data-content]") : app;
  if (!container) return;
  if (!state.me) container.innerHTML = '<main class="public-documentation" data-public-documentation></main>';
  const target = state.me ? container : container.querySelector("[data-public-documentation]");
  target.innerHTML = `<section class="card panel" role="status">${t("common.loading")}</section>`;
  const current = () => requestId === documentationRequestId && target.isConnected &&
    state.view === "documentation" && (state.documentationPage || "") === page && i18n.getLocale() === locale &&
    appRouteFromHash()?.view === "documentation";
  try {
    const documentation = await loadDocumentation();
    if (!current()) return;
    const data = await documentation.load(locale, page, api);
    if (!current()) return;
    target.innerHTML = documentation.render(locale, page, !state.me, data, Boolean(state.me?.isAdmin));
    documentation.mount(target, { api, locale, page: data.page, userId: state.me?.isAdmin ? state.me.id : null, rerender: renderDocumentation });
  } catch (err) {
    if (!current()) return;
    target.innerHTML = `<section class="card panel"><h2>${t("nav.documentation")}</h2><p role="alert">${escapeHtml(err.message)}</p><button class="small-button" data-documentation-retry>${t("documentation.retry")}</button></section>`;
    target.querySelector("[data-documentation-retry]").addEventListener("click", renderDocumentation);
  }
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
  const active = state.view === id ||
    (id === "top" && state.view === "player") ||
    (id === "games" && state.view === "gameDetail") ||
    (id === "play" && state.view === "teamPairing");
  return `<button class="nav-button ${active ? "active" : ""}" data-view="${id}">${label}</button>`;
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.me = null;
  state.view = "play";
  state.sharedChallengeTokenHandled = "";
  state.adminPasswordReset = null;
  state.teamPairings = [];
  state.teamPairingDetail = null;
  state.selectedTeamMatchId = null;
  resetNotifications();
  render();
}

function renderPlay() {
  const content = document.querySelector("[data-content]");
  const teamPairings = state.teamPairings || [];
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

    ${teamPairings.length ? `<section class="card panel captain-pairings-panel">
      <div class="panel-header">
        <div>
          <h2>${t("play.teamPairings.title")}</h2>
          <p class="muted">${t("play.teamPairings.hint")}</p>
        </div>
      </div>
      <div class="list">${teamPairings.map(teamPairingCard).join("")}</div>
    </section>` : ""}

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
    <div class="message" data-message></div>
  `;

  const searchInput = document.querySelector("[data-search-input]");
  document.querySelector("[data-search]").addEventListener("click", () => searchUsers({ allowEmpty: true }));
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchUsers();
  });
  wireChallengeButtons();
  wireGameButtons();
  document.querySelectorAll("[data-team-pairing-open]").forEach((button) => {
    button.addEventListener("click", () => openTeamPairing(button.dataset.teamPairingOpen));
  });
  if (state.focusChallengeId) {
    focusNotificationTarget(`[data-challenge-card="${state.focusChallengeId}"]`);
  }
}

function teamPairingCard(pairing) {
  const own = pairing.captainSide === "a" ? pairing.rosterA : pairing.rosterB;
  const opponent = pairing.captainSide === "a" ? pairing.rosterB : pairing.rosterA;
  return `<article class="row-card captain-pairing-card">
    <div class="row-main">
      <div class="row-title">${escapeHtml(own?.name || "")} vs ${escapeHtml(opponent?.name || "")}</div>
      <div class="row-meta">${escapeHtml(pairing.tournament?.name || "")} · ${t("notifications.round", { number: pairing.roundNumber })} · ${escapeHtml(teamMatchPhaseLabel(pairing.phase))}</div>
    </div>
    <div class="row-actions"><button class="primary-button" data-team-pairing-open="${pairing.id}">${t("play.teamPairings.open")}</button></div>
  </article>`;
}

function challengeCard(challenge) {
  const other = challenge.fromUserId === state.me.id ? challenge.to : challenge.from;
  const otherName = other?.name || t("feedback.inbox.deletedPlayer");
  const direction = challenge.fromUserId === state.me.id
    ? t("profile.matchmaking.youChallenged", { name: otherName })
    : t("profile.matchmaking.challengeFrom", { name: otherName });
  const shareUrl = challengeShareUrl(challenge);
  const shareAction = shareUrl
    ? `<button class="small-button" data-challenge-share="${escapeHtml(shareUrl)}">${t("admin.tournament.detail.copyLink")}</button>`
    : "";
  const actions = challenge.toUserId === state.me.id
    ? `<button class="small-button" data-challenge-action="accept" data-id="${challenge.id}">${t("play.action.accept")}</button>
       <button class="small-button" data-challenge-action="decline" data-id="${challenge.id}">${t("play.action.decline")}</button>`
    : `${shareAction}<button class="small-button" data-challenge-action="cancel" data-id="${challenge.id}">${t("common.cancel")}</button>`;
  const focused = Number(state.focusChallengeId) === Number(challenge.id);
  return `
    <div class="row-card ${focused ? "notification-target-highlight" : ""}" data-challenge-card="${challenge.id}" tabindex="-1">
      <div class="row-main">
        <div class="row-title">${escapeHtml(direction)}</div>
        <div class="row-meta">${escapeHtml(t("profile.matchmaking.ratingElo", { rating: other?.rating || "-" }))} &middot; ${fmtDate(challenge.createdAt)}</div>
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
  const players = game.players || [];
  const isTournamentGame = game.sourceType === "tournament_match";
  const playerUserId = (player) => Number(player.userId || (player.hasProfile === false ? 0 : player.id));
  const title = players.map((player) => playerUserId(player) === state.me.id ? t("play.game.you") : player.name).join(" vs ");
  const isParticipant = players.some((player) => playerUserId(player) === state.me.id);
  const isPending = game.status === "pending_confirmation";
  const status = game.status === "completed" ? "completed" : isPending ? "pending" : "open";
  const result = game.status === "completed"
    ? resultSummary(game)
    : isPending
      ? pendingResultSummary(game)
      : t("play.game.waitingForResult");
  const mainAction = isParticipant && game.status === "open"
    ? `<button class="primary-button" data-game-result="${game.id}">${t("play.action.enterResult")}</button>`
    : isTournamentGame && isParticipant && isPending
      ? `<button class="primary-button" data-game-result="${game.id}">${t("play.action.enterResult")}</button>`
    : isParticipant && isPending && game.pendingResult?.submittedBy === state.me.id
      ? `<button class="small-button" data-game-result="${game.id}">${t("play.action.editResult")}</button>`
      : isParticipant && isPending
        ? `<button class="primary-button" data-game-review="${game.id}">${t("play.action.reviewResult")}</button>`
        : "";
  const adminResultAction = state.me?.isAdmin && !isParticipant && game.status !== "completed"
    ? `<button class="primary-button" data-game-admin-result="${game.id}">${t("play.action.enterResult")}</button>`
    : "";
  const canExit = !isTournamentGame && isParticipant && (game.status === "open" || (isPending && game.pendingResult?.submittedBy === state.me.id));
  const exitAction = canExit
    ? `<button class="danger-button" data-game-exit="${game.id}">${isPending ? t("play.action.deletePending") : t("play.action.exitGame")}</button>`
    : "";
  const detailsAction = `<button class="small-button" data-game-open="${game.id}">${t("play.action.details")}</button>`;
  const tournamentAction = isTournamentGame && game.tournament?.slug
    ? `<button class="small-button" data-tournament-game-open="${escapeHtml(game.tournament.slug)}">${t("play.tournamentMatch.openAction")}</button>`
    : "";
  const meta = isTournamentGame
    ? t("play.tournamentMatch.meta", { label: tournamentMatchLabel(game), result })
    : result;
  return `
    <div class="row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(title)}</div>
        <div class="row-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="row-actions">
        <span class="status ${status}">${game.status === "completed" ? t("play.game.status.completed") : isPending ? t("play.game.status.pending") : t("play.game.status.active")}</span>
        ${detailsAction}
        ${tournamentAction}
        ${mainAction}
        ${adminResultAction}
        ${exitAction}
      </div>
    </div>
  `;
}

function tournamentMatchLabel(game) {
  const match = game.tournamentMatch || {};
  const tournament = game.tournament || {};
  return [
    tournament.name || t("tournaments.fallbackName"),
    match.roundNumber ? t("tournaments.round.title", { number: match.roundNumber }) : "",
    match.bracketPosition ? t("tournaments.match.numberLabel", { number: match.bracketPosition }) : ""
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
  return [
    ...(state.games || []),
    ...(state.allGames || []),
    ...(state.playerProfile?.recentGames || []),
    ...(state.playerProfile?.pendingGames || [])
  ].find((game) =>
    game.sourceType === "tournament_match" && tournamentMatchSourceId(game) === id
  ) || null;
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
          <h2>${t("feedback.title")}</h2>
          <p class="muted">${t("feedback.hint")}</p>
        </div>
        ${state.me.isAdmin ? `
          <div class="row-actions">
            <button class="${adminInbox ? "ghost-button" : "primary-button"}" data-feedback-mode="form">${t("feedback.mode.form")}</button>
            <button class="${adminInbox ? "primary-button" : "ghost-button"}" data-feedback-mode="inbox">${t("feedback.mode.inbox")}</button>
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
        <label>${t("feedback.form.screenLabel")}</label>
        <input name="screen" maxlength="80" placeholder="${t("feedback.form.screenPlaceholder")}" required>
      </div>
      <div class="field">
        <label>${t("feedback.form.descriptionLabel")}</label>
        <textarea name="description" maxlength="1200" rows="6" placeholder="${t("feedback.form.descriptionPlaceholder")}" required></textarea>
      </div>
      <button class="primary-button" type="submit">${t("feedback.form.submit")}</button>
    </form>
  `;
}

function feedbackInboxMarkup() {
  if (state.feedbackError) {
    return `<div class="empty">${t("feedback.inbox.loadError", { error: escapeHtml(state.feedbackError) })}</div>`;
  }
  if (!state.feedback.length) return `<div class="empty">${t("feedback.inbox.empty")}</div>`;
  return `
    <div class="list">
      ${state.feedback.map((item) => `
        <div class="row-card feedback-card">
          <div class="row-main">
            <div class="row-title">${escapeHtml(item.screen)}</div>
            <div class="row-meta">${escapeHtml(item.user?.name || t("feedback.inbox.deletedPlayer"))} &middot; ${fmtDate(item.createdAt)}</div>
            ${item.status === "resolved" ? `<div class="row-meta">${item.resolvedByUser?.name ? t("feedback.inbox.resolvedBy", { name: escapeHtml(item.resolvedByUser.name) }) : t("feedback.inbox.resolvedLabel")}${item.resolvedAt ? ` &middot; ${fmtDate(item.resolvedAt)}` : ""}</div>` : ""}
            <p class="feedback-description">${escapeHtml(item.description)}</p>
          </div>
          <div class="row-actions">
            <span class="status ${item.status === "resolved" ? "completed" : "open"}">${item.status === "resolved" ? t("feedback.status.resolved") : t("feedback.status.open")}</span>
            <button class="small-button" data-feedback-status="${item.id}" data-status="${item.status === "resolved" ? "open" : "resolved"}">${item.status === "resolved" ? t("feedback.inbox.reopen") : t("feedback.inbox.resolve")}</button>
            <button class="danger-button" data-feedback-delete="${item.id}">${t("common.delete")}</button>
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
      if (!window.confirm(t("dialog.feedback.delete"))) return;
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
    setMessage(t("feedback.form.successMessage"));
  } catch (err) {
    setMessage(err.message, true);
  }
}

function scoreSummary(result, players) {
  const [a, b] = players;
  if (!a || !b || !result?.scores) return t("games.result.savedFallback");
  const scoreA = result.scores[a.id];
  const scoreB = result.scores[b.id];
  if (!scoreA || !scoreB) return t("games.result.savedFallback");
  const winner = result.winnerId ? players.find((p) => p.id === result.winnerId)?.name : t("tournaments.tiebreaker.draw");
  const tiebreak = result.tiebreakers?.decidedBy
    ? ` ${t("games.result.decidedBySuffix", { reason: tieBreakerLabel(result.tiebreakers.decidedBy) })}`
    : "";
  return `${a.name} ${scoreA.total} - ${b.name} ${scoreB.total} - ${winner}${tiebreak}`;
}

function tieBreakerLabel(value) {
  return {
    primary: t("games.result.tiebreaker.primary"),
    critTac: t("games.result.tiebreaker.critTacReason"),
    apl: t("games.result.tiebreaker.apl"),
    rollOff: t("games.result.tiebreaker.rollOff")
  }[value] || t("tournaments.tiebreaker.title");
}

function getProfileStats() {
  const completedGames = state.games.filter((game) => game.status === "completed");
  const openGames = state.games.filter((game) => ["open", "pending_confirmation"].includes(game.status));
  const pendingIncoming = state.challenges.filter((item) => item.status === "pending" && item.toUserId === state.me.id);
  const pendingOutgoing = state.challenges.filter((item) => item.status === "pending" && item.fromUserId === state.me.id);
  const wins = completedGames.filter((game) => game.result?.winnerId === state.me.id).length;
  const draws = completedGames.filter((game) => game.result && !game.result.winnerId).length;
  const losses = completedGames.filter((game) => game.result?.winnerId && game.result.winnerId !== state.me.id).length;
  const eloDelta = completedGames.reduce(
    (sum, game) => sum + Number(game.elo?.combined?.[state.me.id]?.delta ?? game.elo?.[state.me.id]?.delta ?? 0),
    0
  );
  const winRate = completedGames.length ? Math.round((wins / completedGames.length) * 100) : 0;
  return { completedGames, openGames, pendingIncoming, pendingOutgoing, wins, draws, losses, eloDelta, winRate };
}

function playerRating(user, venueMode) {
  return Number(user?.ratings?.[venueMode] ?? user?.rating ?? 1000);
}

// One number, labelled MMR. It is the combined rating underneath; the per-venue
// TTS and IRL figures stay available on the leaderboard's venue tabs, which is
// where somebody goes when they want the split.
function profileRatingsMarkup(user) {
  return `
    <div class="profile-ratings">
      <div class="profile-rating"><span>${playerRating(user, "combined")}</span><small>${t("profile.rating.mmr")}</small></div>
    </div>
  `;
}

function renderProfile() {
  const content = document.querySelector("[data-content]");
  if (!state.teamsDashboard && !state.teamsError) {
    loadTeamsDashboard().then(() => {
      if (state.view === "profile") renderShell();
    }).catch(() => {});
  }
  const stats = getProfileStats();
  const recentGames = stats.completedGames.slice(0, 5);
  const latestActiveMatchmaking = latestActiveMatchmakingItem(stats);
  const challengeProgress = ownChallengeProgress();
  content.innerHTML = `
    <section class="card panel profile-hero">
      <div class="profile-avatar">${avatarMarkup(state.me)}</div>
      <div class="profile-main">
        <p class="profile-label">${t("profile.hero.label")}</p>
        <h2>${escapeHtml(state.me.name)}</h2>
        <p class="muted">${state.me.isAdmin ? t("profile.hero.role.admin") : t("profile.hero.role.player")} &middot; ${t("profile.hero.joined", { date: fmtDate(state.me.createdAt) })}</p>
        ${profileInfoMarkup(state.me)}
      </div>
      ${profileRatingsMarkup(state.me)}
    </section>

    <section class="profile-grid">
      ${metricCard(t("profile.metric.matches"), stats.completedGames.length)}
      ${metricCard(t("stats.column.wins"), stats.wins)}
      ${metricCard(t("stats.column.draws"), stats.draws)}
      ${metricCard(t("stats.column.losses"), stats.losses)}
      ${metricCard(t("profile.metric.eloChange"), signed(stats.eloDelta))}
      ${metricCard(t("profile.metric.winRate"), `${stats.winRate}%`)}
    </section>

    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("profile.settings.title")}</h2>
          <p class="muted">${t("profile.settings.subtitle")}</p>
        </div>
      </div>
      <div class="settings-grid">
        <div class="settings-block">
          <h3>${t("profile.settings.avatarTitle")}</h3>
          <div class="avatar-settings-row">
            <div class="profile-avatar compact-avatar" data-avatar-preview>${avatarMarkup(state.me)}</div>
            <div>
              <input class="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-avatar-input>
              <p class="muted small-note">${t("profile.settings.avatarHint")}</p>
              <div class="row-actions">
                <button class="small-button" data-remove-avatar type="button">${t("profile.settings.removeAvatar")}</button>
              </div>
            </div>
          </div>
        </div>
        <form class="settings-block" data-profile-name-form>
          <h3>${t("profile.settings.nicknameTitle")}</h3>
          <div class="field">
            <label for="profile-name">${t("auth.field.name")}</label>
            <input id="profile-name" name="name" value="${escapeHtml(state.me.name)}" required minlength="2" maxlength="24">
          </div>
          <button class="primary-button" type="submit">${t("profile.settings.saveNickname")}</button>
        </form>
        <form class="settings-block" data-profile-contact-form>
          <h3>${t("profile.contacts.title")}</h3>
          <div class="field">
            <label for="profile-register-nickname">${t("auth.field.registerNickname")}</label>
            <input id="profile-register-nickname" name="registerNickname" value="${escapeHtml(state.me.registerNickname || "")}" maxlength="40" placeholder="${t("auth.field.registerNicknamePlaceholder")}">
          </div>
          <div class="field">
            <label for="profile-telegram-contact">${t("auth.field.telegramContact")}</label>
            <input id="profile-telegram-contact" name="telegramContact" value="${escapeHtml(state.me.telegramContact || "")}" maxlength="80" placeholder="${t("auth.field.telegramContactPlaceholder")}" required>
          </div>
          <button class="primary-button" type="submit">${t("profile.settings.saveContacts")}</button>
        </form>
        <form class="settings-block" data-profile-password-form>
          <h3>${t("auth.field.password")}</h3>
          <div class="field">
            <label for="current-password">${t("profile.settings.currentPassword")}</label>
            <input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required>
          </div>
          <div class="field">
            <label for="new-password">${t("profile.settings.newPassword")}</label>
            <input id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="6" required>
          </div>
          <button class="primary-button" type="submit">${t("profile.settings.changePassword")}</button>
        </form>
      </div>
      <div class="message" data-profile-message></div>
    </section>

    <section class="grid-2">
      <div class="card panel">
        <div class="panel-header">
          <div>
            <h3>${t("profile.matchmaking.title")}</h3>
            <p class="muted">${latestActiveMatchmaking ? t("profile.matchmaking.subtitleLatest") : t("profile.matchmaking.subtitleEmpty")}</p>
          </div>
        </div>
        ${latestActiveMatchmaking ? activeMatchmakingPreview(latestActiveMatchmaking) : `<div class="empty">${t("profile.matchmaking.empty")}</div>`}
      </div>
      <div class="card panel">
        <div class="panel-header">
          <div>
            <h3>${t("challenge.title")}</h3>
            <p class="muted">${t("profile.challenge.subtitle")}</p>
          </div>
        </div>
        ${profileChallengeNextCard(challengeProgress)}
      </div>
      <div class="card panel wide-panel">
        ${profileTeamsMarkup(state.teamsDashboard?.myTeams || [])}
      </div>
      <div class="card panel wide-panel">
        <div class="panel-header"><h3>${t("profile.recent.title")}</h3></div>
        <div class="list">
          ${recentGames.length ? recentGames.map(gameCard).join("") : `<div class="empty">${t("profile.recent.empty")}</div>`}
        </div>
      </div>
    </section>
  `;

  wireProfileSettings();
  wireGameButtons();
  wireOpenMatchmakingButton();
  wireChallengeProgressButtons();
  wireProfileTeamLinks();
}

function profileTeamsMarkup(teams = []) {
  return `<div class="panel-header"><h3>${t("teams.profile.title")}</h3></div><div class="list">${teams.length ? teams.map((team) => `<div class="row-card compact-row-card"><div class="row-main"><div class="row-title">${escapeHtml(team.name)}</div></div><button class="small-button" data-profile-team="${escapeHtml(team.slug)}">${t("common.open")}</button></div>`).join("") : `<div class="empty">${t("teams.profile.empty")}</div>`}</div>`;
}

function wireProfileTeamLinks() {
  document.querySelectorAll("[data-profile-team]").forEach((button) => {
    button.addEventListener("click", () => navigateToPlayerTeam(button.dataset.profileTeam));
  });
}

function ownChallengeProgress() {
  return state.challengeProgress.find((item) => item.user.id === state.me.id) || null;
}

function profileChallengeNextCard(progress) {
  if (!progress) {
    return `
      <div class="empty">${t("profile.challenge.loading")}</div>
      <div class="row-actions profile-challenge-actions">
        <button class="small-button" data-profile-challenge-progress="${state.me.id}">${t("profile.challenge.openAction")}</button>
      </div>
    `;
  }

  const current = progress.teams.find((item) => item.status === "current");
  if (!current) {
    return `
      <div class="row-card profile-challenge-next-card">
        <div class="row-main">
          <p class="profile-label">${t("profile.challenge.complete")}</p>
          <div class="row-title">${t("profile.challenge.allCompleted")}</div>
          <div class="row-meta">${t("challenge.detail.progress", { completed: progress.completedCount, total: progress.total })}</div>
        </div>
        <div class="row-actions">
          <button class="small-button" data-profile-challenge-progress="${progress.user.id}">${t("profile.challenge.openAction")}</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="row-card profile-challenge-next-card">
      <div class="profile-challenge-next-main">
        <img class="profile-challenge-logo" src="${killTeamLogoSrc(current.team)}" alt="${escapeHtml(t("profile.challenge.teamLogoAlt", { team: current.team }))}">
        <div class="row-main">
          <p class="profile-label">${t("profile.challenge.nextLabel")}</p>
          <div class="row-title">${escapeHtml(current.team)}</div>
          <div class="row-meta">${t("challenge.detail.progress", { completed: progress.completedCount, total: progress.total })}</div>
        </div>
      </div>
      <div class="row-actions">
        <button class="small-button" data-profile-challenge-progress="${progress.user.id}">${t("profile.challenge.openAction")}</button>
      </div>
    </div>
  `;
}

function wireOpenMatchmakingButton() {
  document.querySelector("[data-open-matchmaking]")?.addEventListener("click", async (event) => {
    const gameId = Number(event.currentTarget.dataset.gameId || 0);
    if (gameId) {
      const game = getKnownGame(gameId) || await loadGame(gameId);
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
      meta: game.status === "pending_confirmation" ? pendingResultSummary(game) : `${t("profile.matchmaking.acceptedMatch")} · ${fmtDate(game.createdAt)}`,
      at: game.submittedAt || game.updatedAt || game.createdAt
    })),
    ...stats.pendingIncoming.map((challenge) => ({
      type: "challenge",
      title: t("profile.matchmaking.challengeFrom", { name: challenge.from?.name || t("tournaments.player.fallback") }),
      meta: `${t("profile.matchmaking.ratingElo", { rating: challenge.from?.rating || "-" })} · ${fmtDate(challenge.createdAt)}`,
      at: challenge.updatedAt || challenge.createdAt
    })),
    ...stats.pendingOutgoing.map((challenge) => ({
      type: "challenge",
      title: t("profile.matchmaking.youChallenged", { name: challenge.to?.name || t("tournaments.player.fallback") }),
      meta: `${t("profile.matchmaking.ratingElo", { rating: challenge.to?.rating || "-" })} · ${fmtDate(challenge.createdAt)}`,
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
        <span class="status ${item.type === "game" ? "open" : "pending"}">${item.type === "game" ? t("play.game.status.active") : t("play.game.status.pending")}</span>
        <button class="primary-button" data-open-matchmaking ${item.type === "game" ? `data-game-id="${item.id}"` : ""}>${t("tournaments.card.open")}</button>
      </div>
    </div>
  `;
}

function renderPlayerProfile() {
  const content = document.querySelector("[data-content]");
  const profile = state.playerProfile;
  if (!profile?.user) {
    content.innerHTML = `<section class="card panel"><div class="empty">${t("profile.playerProfile.loading")}</div></section>`;
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
      ? `<button class="primary-button game-challenge-button" data-profile-game="${activeGame.id}">${t("profile.playerProfile.openGame")}</button>`
      : `<button class="primary-button game-challenge-button" data-profile-challenge="${user.id}" ${pendingChallenge ? "disabled" : ""}>${pendingChallenge ? t("profile.playerProfile.challengePending") : t("profile.playerProfile.challengeToPlay")}</button>`;

  content.innerHTML = `
    <section class="card panel profile-hero">
      <div class="profile-avatar">${avatarMarkup(user)}</div>
      <div class="profile-main">
        <p class="profile-label">${t("profile.hero.label")}</p>
        <h2>${escapeHtml(user.name)}</h2>
        <p class="muted">${t("profile.hero.role.player")} &middot; ${t("profile.hero.joined", { date: fmtDate(user.createdAt) })}</p>
        ${profileInfoMarkup(user)}
      </div>
      ${profileRatingsMarkup(user)}
    </section>

    <section class="profile-grid">
      ${metricCard(t("profile.metric.matches"), stats.matches || 0)}
      ${metricCard(t("stats.column.wins"), stats.wins || 0)}
      ${metricCard(t("stats.column.draws"), stats.draws || 0)}
      ${metricCard(t("stats.column.losses"), stats.losses || 0)}
      ${metricCard(t("profile.metric.eloChange"), signed(stats.eloDelta || 0))}
      ${metricCard(t("profile.metric.winRate"), `${stats.winRate || 0}%`)}
    </section>

    <section class="grid-2">
      ${profileContactsCard(user)}
      ${state.me.isAdmin && user.id !== state.me.id ? adminPlayerToolsCard(user) : ""}
      <div class="card panel">
        <div class="panel-header">
          <h3 class="icon-heading">${crossedSwordsIcon()}<span>${t("profile.playerProfile.gameChallengesTitle")}</span></h3>
        </div>
        <div class="game-challenge-card-body">
          <img class="game-challenge-logo" src="/game-challenge-logo.png?v=20260706-large-logo-1" alt="${t("profile.playerProfile.gameChallengeLogoAlt")}">
          <div class="row-actions game-challenge-actions">
            ${challengeButton}
          </div>
        </div>
        <div class="message" data-player-profile-message></div>
      </div>
      ${state.me.isAdmin ? adminPendingGamesCard(profile) : ""}
      <div class="card panel">
        ${profileTeamsMarkup(profile.playerTeams || [])}
      </div>
      <div class="card panel">
        <div class="panel-header">
          <div>
            <h3>${t("challenge.title")}</h3>
            <p class="muted">${t("profile.playerProfile.challengeSubtitle")}</p>
          </div>
        </div>
        ${profileChallengeNextCard(challengeProgress)}
      </div>
      <div class="card panel wide-panel">
        <div class="panel-header">
          <div>
            <h3>${t("profile.recent.title")}</h3>
            <p class="muted">${t("profile.playerProfile.recentSubtitle")}</p>
          </div>
          <button class="ghost-button" data-back-leaderboard>${t("nav.leaderboard")}</button>
        </div>
        <div class="list">
          ${recentGames.length ? recentGames.map(gameCard).join("") : `<div class="empty">${t("profile.recent.empty")}</div>`}
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
      setPlayerProfileMessage(t("profile.playerProfile.challengeSent"));
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
  wireProfileTeamLinks();
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
    const confirmed = window.confirm(t("dialog.admin.resetPassword"));
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
      setProfileMessage(t("profile.settings.preparingAvatar"));
      const avatarData = await compressAvatar(file);
      await updateProfile({ avatarData }, t("profile.settings.avatarUpdated"));
    } catch (err) {
      setProfileMessage(err.message, true);
    } finally {
      avatarInput.value = "";
    }
  });

  removeAvatar?.addEventListener("click", async () => {
    await updateProfile({ avatarData: null }, t("profile.settings.avatarRemoved"));
  });

  nameForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(nameForm);
    await updateProfile({ name: form.get("name") }, t("profile.settings.nicknameUpdated"));
  });

  contactForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(contactForm);
    await updateProfile({
      registerNickname: form.get("registerNickname"),
      telegramContact: form.get("telegramContact")
    }, t("profile.settings.contactsUpdated"));
  });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(passwordForm);
    await updateProfile({
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword")
    }, t("profile.settings.passwordChanged"));
  });
}

async function compressAvatar(file) {
  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error(t("profile.settings.avatarTypeError"));
  }
  if (file.size > 1024 * 1024) {
    throw new Error(t("profile.settings.avatarSizeError"));
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const size = 384;
  canvas.width = size;
  canvas.height = size;

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error(t("profile.settings.avatarReadError"));
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
      reject(new Error(t("profile.settings.avatarReadError")));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(t("profile.settings.avatarPrepareError")));
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
    reader.onerror = () => reject(new Error(t("profile.settings.avatarPrepareError")));
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
  if (state.playerProfile?.challengeProgress) upsertChallengeProgress(state.playerProfile.challengeProgress);
  return state.playerProfile;
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

function getKnownChallengeProgress(userId) {
  const id = Number(userId);
  return state.challengeProgress.find((item) => item.user.id === id) || null;
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
  return getKnownChallengeProgress(state.selectedChallengeUserId || state.me.id);
}

async function openChallengeProgress(userId) {
  state.selectedChallengeUserId = Number(userId);
  state.challengeOpenedFromProfile = true;
  state.view = "challenge";
  syncAppHash();
  const needsLoad = !getKnownChallengeProgress(userId);
  renderShell();
  if (!needsLoad) return;
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

async function loadGame(gameId) {
  const tournamentMatchId = tournamentMatchIdFromGameId(gameId);
  const id = normalizedGameDetailId(gameId);
  if (!tournamentMatchId && (!Number.isSafeInteger(id) || id <= 0)) return null;
  try {
    const path = tournamentMatchId
      ? `/api/games/tournament-match/${tournamentMatchId}`
      : `/api/games/${id}`;
    const data = await api(path);
    const game = data.game || null;
    if (!game) return null;
    const knownIndex = state.allGames.findIndex((item) => String(item?.id) === String(game.id));
    if (knownIndex === -1) state.allGames.push(game);
    else state.allGames[knownIndex] = game;
    state.gamesError = "";
    return game;
  } catch (err) {
    state.gamesError = err.message;
    return null;
  }
}

function getKnownGame(gameId) {
  const tournamentMatchId = tournamentMatchIdFromGameId(gameId);
  if (tournamentMatchId) return getKnownTournamentGame(tournamentMatchId);
  const id = normalizedGameDetailId(gameId);
  if (!id) return null;
  const sameId = (game) => String(game?.id) === String(id);
  return (state.allGames || []).find(sameId) ||
    (state.adminGames || []).find(sameId) ||
    (state.games || []).find(sameId) ||
    (state.playerProfile?.pendingGames || []).find(sameId) ||
    (sameId(state.playerProfile?.activeMatchup?.game) ? state.playerProfile.activeMatchup.game : null) ||
    (state.playerProfile?.recentGames || []).find(sameId) ||
    null;
}

function tournamentMatchIdFromGameId(gameId) {
  const match = String(gameId || "").match(/^tournament-match-(\d+)$/);
  if (!match) return 0;
  const matchId = Number(match[1]);
  return Number.isSafeInteger(matchId) && matchId > 0 ? matchId : 0;
}

function normalizedGameDetailId(gameId) {
  const tournamentMatchId = tournamentMatchIdFromGameId(gameId);
  if (tournamentMatchId) return getKnownTournamentGame(tournamentMatchId)?.id || `tournament-match-${tournamentMatchId}`;
  const numericId = Number(gameId);
  return Number.isSafeInteger(numericId) && numericId > 0 ? numericId : null;
}

async function openGameDetail(gameId) {
  let id = normalizedGameDetailId(gameId);
  if (!getKnownGame(id)) {
    const game = await loadGame(id);
    id = normalizedGameDetailId(game?.id || gameId);
  }
  state.selectedGameId = id;
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
  const games = state.statisticsVenue === "combined"
    ? (state.allGames || [])
    : (state.allGames || []).filter((game) => game.venueMode === state.statisticsVenue);
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
    ${venueTabs("statistics", state.statisticsVenue)}
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("stats.title")}</h2>
          <p class="muted">${state.statisticsVenue === "combined"
            ? t("stats.hintCombined")
            : t("stats.hintWithVenue", { venue: state.statisticsVenue === "irl" ? t("venue.irl") : "TTS" })}</p>
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
  wireVenueTabs();
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
  const season = seasons.find((item) => item.id === state.selectedSeasonId) || latestSeason();
  state.selectedSeasonId = season.id;
  return season;
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
    ? t("challenge.subtitle.mine")
    : t("challenge.subtitle.other", { name: selected ? escapeHtml(selected.user.name) : t("challenge.subtitle.otherPlayer") });
  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t("challenge.title")}</h2>
          <p class="muted">${t("challenge.subtitle", { progress: subtitle })}</p>
        </div>
      </div>
      <div class="tabs stats-tabs">
        <button class="tab ${state.challengeTab === "classified" ? "active" : ""}" data-challenge-tab="classified">${t("challenge.tab.classified")}</button>
        <button class="tab ${state.challengeTab === "allKillTeam" ? "active" : ""}" data-challenge-tab="allKillTeam">${t("challenge.tab.allKillTeam")}</button>
      </div>
      ${state.challengeError ? `<div class="empty">${t("challenge.error.load", { reason: escapeHtml(state.challengeError) })}</div>` : ""}
    </section>
    ${activeProgress ? challengeDetail(activeProgress) : `<section class="card panel"><div class="empty">${t("challenge.loading")}</div></section>`}
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
  const progressLine = t("challenge.detail.progress", { completed: progress.completedCount, total: progress.total });
  const progressTail = progress.nextTeam
    ? t("challenge.detail.next", { team: escapeHtml(progress.nextTeam) })
    : t("challenge.detail.complete");
  return `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${escapeHtml(progress.user.name)}</h2>
          <p class="muted">${progressLine} &middot; ${progressTail}</p>
        </div>
        ${canEditChallengeProgress(progress) ? adminChallengeActions(progress) : ""}
      </div>
      <div class="challenge-track">
        ${progress.teams.map((item) => challengeTeamCard(item, false, progress.user.id)).join("")}
      </div>
      ${progress.wildcards?.length ? `<div class="panel-header challenge-subheader">
        <div>
          <h3>${t("challenge.wildcards.title")}</h3>
          <p class="muted">${t("challenge.wildcards.hint")}</p>
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
      ${current ? `<button class="primary-button" data-credit-user="${progress.user.id}" data-credit-team="${escapeHtml(current.team)}">${t("challenge.admin.creditNext")}</button>` : ""}
      ${progress.wildcards.filter((item) => item.status !== "completed").map((item) => `
        <button class="small-button" data-credit-user="${progress.user.id}" data-credit-team="${escapeHtml(item.team)}">${t("challenge.admin.creditTeam", { team: escapeHtml(item.team) })}</button>
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
    ? `${credit.source === "manual" ? t("challenge.card.manualCredit") : t("games.detail.title", { id: credit.gameId })} - ${fmtDate(credit.at)}`
    : item.status === "current" ? t("challenge.card.currentTarget") : item.status === "available" ? t("challenge.card.availableAnytime") : t("challenge.card.locked");
  const canEdit = userId && canEditChallengeProgress({ user: { id: userId } });
  const adminAction = canEdit
    ? item.status === "completed"
      ? `<button class="small-button" data-remove-credit-user="${userId}" data-remove-credit-team="${escapeHtml(item.team)}">${t("challenge.card.subtract")}</button>`
      : `<button class="small-button" data-credit-user="${userId}" data-credit-team="${escapeHtml(item.team)}">${t("challenge.card.credit")}</button>`
    : "";
  const statusKey = item.status === "completed" ? "challenge.status.completed"
    : item.status === "current" ? "challenge.status.current"
    : item.status === "available" ? "challenge.status.available"
    : "challenge.status.locked";
  return `
    <div class="challenge-team-card ${item.status}">
      <div class="challenge-team-main">
        <img class="challenge-team-logo" src="${killTeamLogoSrc(item.team)}" alt="">
        <div>
          <span>${wildcard ? t("challenge.card.wildcard") : `#${item.order}`}</span>
          <strong>${escapeHtml(item.team)}</strong>
          <small>${escapeHtml(meta)}</small>
        </div>
      </div>
      <div class="row-actions">
        <span class="status ${item.status === "completed" ? "completed" : item.status === "current" || item.status === "available" ? "open" : ""}">${t(statusKey)}</span>
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
  const isTournamentGame = game.sourceType === "tournament_match";
  const isTeamTournamentGame = game.sourceType === "team_match_game";
  const tournament = game.tournament || {};
  const match = game.tournamentMatch || {};
  const statusLabel = game.status === "completed" ? t("play.game.status.completed") : game.status === "pending_confirmation" ? t("play.game.status.pending") : t("play.game.status.active");
  const submitter = game.players?.find((player) => player.id === game.pendingResult?.submittedBy || player.id === game.submittedBy);
  const isParticipant = game.players?.some((player) => Number(player.userId || player.id) === state.me.id);
  const canDeletePending = isParticipant && game.status === "pending_confirmation" && game.pendingResult?.submittedBy === state.me.id;
  const playerAction = isParticipant && game.status === "open"
    ? `<button class="primary-button" data-game-result="${game.id}">${t("play.action.enterResult")}</button>
       ${isTournamentGame || isTeamTournamentGame ? "" : `<button class="danger-button" data-exit-game="${game.id}">${t("play.action.exitGame")}</button>`}`
    : isTournamentGame && isParticipant && game.status === "pending_confirmation"
      ? `<button class="primary-button" data-game-result="${game.id}">${t("play.action.enterResult")}</button>`
    : canDeletePending
      ? `<button class="small-button" data-game-result="${game.id}">${t("play.action.editResult")}</button>
         ${isTournamentGame || isTeamTournamentGame ? "" : `<button class="danger-button" data-exit-game="${game.id}">${t("play.action.deletePending")}</button>`}`
      : isParticipant && game.status === "pending_confirmation"
        ? `<button class="primary-button" data-game-review="${game.id}">${t("play.action.reviewResult")}</button>`
        : "";
  const adminAction = state.me.isAdmin
    ? `<button class="primary-button" data-admin-edit-game="${game.id}">${result ? t("play.action.editResult") : t("play.action.enterResult")}</button>
       ${!isTournamentGame && game.status === "pending_confirmation" && game.pendingResult?.result ? `<button class="small-button" data-admin-confirm-game="${game.id}">${t("games.detail.forceConfirm")}</button>` : ""}
       ${!isTournamentGame && !isTeamTournamentGame && ["open", "pending_confirmation"].includes(game.status) ? `<button class="danger-button" data-admin-delete-game="${game.id}">${t("games.detail.deleteGame")}</button>` : ""}`
    : "";
  const tournamentAction = (isTournamentGame || isTeamTournamentGame) && tournament.slug
    ? `<button class="small-button" data-detail-tournament-open="${escapeHtml(tournament.slug)}">${t("play.tournamentMatch.openAction")}</button>`
    : "";
  const detailTitle = isTournamentGame ? t("games.detail.tournamentTitle") : t("games.detail.title", { id: game.id });
  const detailMeta = isTournamentGame
    ? `${gamePlayerLinks(game)} &middot; ${escapeHtml(tournamentMatchLabel(game))} &middot; ${fmtDate(game.createdAt)}`
    : `${gamePlayerLinks(game)} &middot; ${fmtDate(game.createdAt)}`;

  content.innerHTML = `
    <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${detailTitle}</h2>
          <p class="muted">${detailMeta}</p>
        </div>
        <div class="row-actions">
          <span class="status ${game.status === "completed" ? "completed" : game.status === "pending_confirmation" ? "pending" : "open"}">${statusLabel}</span>
          <button class="ghost-button" data-back-games>${t("games.detail.backToGames")}</button>
          ${tournamentAction}
          ${playerAction}
          ${adminAction}
        </div>
      </div>
      ${isTournamentGame ? `
        <section class="profile-grid">
          ${metricCard(t("games.detail.metric.tournament"), tournament.name || t("tournaments.fallbackName"))}
          ${metricCard(t("games.detail.metric.round"), match.roundNumber ? String(match.roundNumber) : t("common.notAssigned"))}
          ${metricCard(t("games.detail.metric.match"), match.bracketPosition ? String(match.bracketPosition) : t("common.notAssigned"))}
          ${metricCard(t("games.detail.metric.table"), match.table?.tableNumber ? String(match.table.tableNumber) : t("common.notAssigned"))}
        </section>
      ` : ""}
      ${!result && game.teamTournamentGame?.mission ? killzoneReview({ killzone: game.teamTournamentGame.mission }) : ""}
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
  document.querySelector("[data-game-review]")?.addEventListener("click", (event) => {
    renderResultReview(Number(event.currentTarget.dataset.gameReview));
  });
  document.querySelector("[data-detail-tournament-open]")?.addEventListener("click", (event) => {
    navigateToPublicTournament(event.currentTarget.dataset.detailTournamentOpen);
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
  const userId = Number(player?.userId || (player?.hasProfile === false ? 0 : player?.id));
  if (!state.me || !Number.isSafeInteger(userId) || userId <= 0) return escapeHtml(player?.name || t("tournaments.player.fallback"));
  return `<button class="text-link-button inline-profile-link" type="button" data-profile-user="${userId}">${escapeHtml(player.name)}</button>`;
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
    user.registerNickname ? t("leaderboard.users.contact.register", { value: user.registerNickname }) : "",
    user.telegramContact ? t("leaderboard.users.contact.telegram", { value: user.telegramContact }) : ""
  ].filter(Boolean).join(" / ");
  const rating = t("profile.matchmaking.ratingElo", { rating: user.rating });
  return contacts ? `${rating} / ${contacts}` : rating;
}

function wireChallengeButtons() {
  document.querySelectorAll("[data-challenge-share]").forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      try {
        await copyText(button.dataset.challengeShare);
        button.textContent = t("profile.admin.copied");
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
      if (Number(state.focusChallengeId) === Number(button.dataset.id)) {
        state.focusChallengeId = null;
        syncAppHash({ replace: true });
      }
      renderShell();
    });
  });
}

function wireGameButtons() {
  document.querySelectorAll("[data-tournament-game-open]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateToPublicTournament(button.dataset.tournamentGameOpen);
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
  document.querySelectorAll("[data-game-admin-result]").forEach((button) => {
    button.addEventListener("click", () => renderResultForm(Number(button.dataset.gameAdminResult), { adminEdit: true }));
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
  const confirmed = window.confirm(
    game?.status === "pending_confirmation" ? t("dialog.games.deletePendingGame") : t("dialog.games.exitGame")
  );
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
  const confirmed = window.confirm(
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
  const confirmed = window.confirm(t("dialog.games.forceConfirmResult"));
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

function renderResultForm(gameId, options = {}) {
  const { adminEdit = false } = options;
  const game = getKnownGame(gameId);
  if (!game) return;
  const content = document.querySelector("[data-content]");
  const existingResult = adminEdit
    ? game.result || game.pendingResult?.result || null
    : game.pendingResult?.submittedBy === state.me.id ? game.pendingResult.result : null;
  const missionLocked = Boolean(game.teamTournamentGame?.missionLocked);
  const allowTiebreakers = game.sourceType !== "team_match_game";
  const missionDefaults = missionLocked ? game.teamTournamentGame.mission : existingResult?.killzone || game.teamTournamentGame?.mission || {};
  const canExitFromForm = !["tournament_match", "team_match_game"].includes(game.sourceType) && !adminEdit && (game.status === "open" || (game.status === "pending_confirmation" && game.pendingResult?.submittedBy === state.me.id));
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
              <select name="killzone" ${missionLocked ? "disabled" : ""}>
                <option value="">${t("games.result.notSelected")}</option>
                ${killzoneOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${missionDefaults.killzone === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>${t("games.result.critOp")}</label>
              <select name="critOp" ${missionLocked ? "disabled" : ""}>
                <option value="">${t("games.result.notSelected")}</option>
                ${critOpOptions.map((option) => `
                  <option value="${escapeHtml(option)}" ${missionDefaults.critOp === option ? "selected" : ""}>${escapeHtml(option)}</option>
                `).join("")}
              </select>
            </div>
            <div class="field">
              <label>${t("games.result.layoutLabel")}</label>
              <select name="killzoneLayout" ${missionLocked ? "disabled" : ""}>
                <option value="">${t("games.result.notSelected")}</option>
                ${[1, 2, 3, 4, 5, 6].map((layout) => `
                  <option value="${layout}" ${Number(missionDefaults.layout) === layout ? "selected" : ""}>${layout}</option>
                `).join("")}
              </select>
            </div>
          </div>
        </section>
        <section class="tiebreaker-panel">
          ${allowTiebreakers ? `<label class="checkbox-line">
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
          ` : `<p class="muted">${t("teams.results.noTiebreakers")}</p>`}
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
  document.querySelector("[data-tiebreaker-enabled]")?.addEventListener("change", refreshResultPreview);
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
      if (!adminEdit) {
        window.alert(t(game.sourceType === "tournament_match"
          ? "message.games.tournamentMatchSubmitted"
          : "message.games.resultSubmittedPending"));
      }
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
    name: participant.displayName || participant.user?.name || t("tournaments.player.fallback"),
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
      window.alert(t(admin ? "message.games.matchResultSaved" : "message.games.tournamentMatchSubmitted"));
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
    await renderPublicTournamentRoute(tournament.slug, { force: true });
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
  if (!matches.length || matches.some((match) => tournament.participantMode === "team" ? match.phase !== "completed" : match.status !== "completed")) return false;
  if (tournament.format === "swiss") {
    return rounds.length >= Number(tournament.swissRoundCount || 0);
  }
  return true;
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
        input.setCustomValidity(t("common.chooseFromList"));
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
      input.setCustomValidity(t("tournaments.registration.factionRequired"));
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
        : `<div class="combo-empty">${t("common.noMatches")}</div>`;
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
      headline: t("games.result.playerWon", { name: winner.name, score: winnerScoreText(winner, a, b, scoreA, scoreB) }),
      steps: []
    };
  }

  if (!tiebreakersEnabled) {
    return {
      winnerId: null,
      headline: t("games.result.draw", { score: scoreText }),
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
  steps.push(previewStep(t("games.result.tiebreaker.primary"), primary, a, b, winnerByPrimary));
  if (winnerByPrimary) {
    appendSkippedSteps(steps, [t("games.result.tiebreaker.tacCrit"), t("games.result.tiebreaker.apl"), t("games.result.tiebreaker.rollOff")]);
    return previewFromWinner(winnerByPrimary, scoreText, steps, "primary");
  }

  const winnerByCritTac = higherValueWinner(a, b, critTac);
  steps.push(previewStep(t("games.result.tiebreaker.tacCrit"), critTac, a, b, winnerByCritTac));
  if (winnerByCritTac) {
    appendSkippedSteps(steps, [t("games.result.tiebreaker.apl"), t("games.result.tiebreaker.rollOff")]);
    return previewFromWinner(winnerByCritTac, scoreText, steps, "critTac");
  }

  const winnerByApl = higherValueWinner(a, b, apl);
  steps.push(previewStep(t("games.result.tiebreaker.apl"), apl, a, b, winnerByApl));
  if (winnerByApl) {
    appendSkippedSteps(steps, [t("games.result.tiebreaker.rollOff")]);
    return previewFromWinner(winnerByApl, scoreText, steps, "apl");
  }

  const rollOffWinner = players.find((player) => player.id === rollOffWinnerId) || null;
  steps.push({
    label: t("games.result.tiebreaker.rollOff"),
    text: rollOffWinner ? t("games.result.preview.winsName", { name: rollOffWinner.name }) : t("games.result.preview.selectRollOffWinner"),
    state: rollOffWinner ? "winner" : "pending"
  });

  return rollOffWinner
    ? previewFromWinner(rollOffWinner, scoreText, steps, "rollOff")
    : { winnerId: null, headline: `${t("games.result.draw", { score: scoreText })}. ${t("games.result.preview.selectRollOffWinner")}.`, steps };
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
      throw new Error(t("games.result.selectPrimaryOpError", { name: player.name }));
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
  const compareLine = t("games.result.preview.compareLine", { aName: a.name, aValue: values[a.id], bName: b.name, bValue: values[b.id] });
  const suffix = winner ? ` - ${t("games.result.preview.winsName", { name: winner.name })}` : ` - ${t("games.result.preview.tied")}`;
  return {
    label,
    text: `${compareLine}${suffix}`,
    state: winner ? "winner" : "tie"
  };
}

function appendSkippedSteps(steps, labels) {
  labels.forEach((label) => {
    steps.push({ label, text: t("games.result.preview.notReached"), state: "skipped" });
  });
}

function previewFromWinner(winner, scoreText, steps, decidedBy = null) {
  const suffix = decidedBy ? ` ${t("games.result.decidedBySuffix", { reason: tieBreakerLabel(decidedBy) })}` : "";
  return {
    winnerId: winner.id,
    headline: `${t("games.result.playerWon", { name: winner.name, score: scoreText })}${suffix}`,
    steps
  };
}

function resultHeadline(game, result) {
  const players = game.players || [];
  const [a, b] = players;
  const scoreA = result?.scores?.[a?.id];
  const scoreB = result?.scores?.[b?.id];
  if (!a || !b || !scoreA || !scoreB) return t("games.result.submittedFallback");
  const tiedByTotal = Number(scoreA.total) === Number(scoreB.total);
  const tiebreakerSummary = tiedByTotal && result.tiebreakers?.enabled
    ? tieBreakerReviewSummary(game, result)
    : null;
  const winnerId = tiebreakerSummary ? tiebreakerSummary.winnerId : result.winnerId;
  const winner = players.find((player) => player.id === winnerId);
  const scoreText = winner
    ? winnerScoreText(winner, a, b, scoreA, scoreB)
    : `${scoreA.total}-${scoreB.total}`;
  const suffix = tiebreakerSummary?.decidedBy ? ` ${t("games.result.decidedBySuffix", { reason: tieBreakerLabel(tiebreakerSummary.decidedBy) })}` : "";
  return winner ? `${t("games.result.playerWon", { name: winner.name, score: scoreText })}${suffix}` : t("games.result.draw", { score: scoreText });
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
  const data = await api(`/api/users?venue=${encodeURIComponent(state.leaderboardVenue)}`);
  state.users = data.users || [];
}

async function loadTeamLeaderboard() {
  const data = await api(`/api/leaderboards/teams?venue=${encodeURIComponent(state.leaderboardVenue)}`);
  state.teamLeaderboard = data.teams || [];
}

async function loadAdminTeams() {
  const data = await api("/api/admin/teams");
  state.adminTeams = data.teams || [];
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

function paginationMarkup(target, pageData, itemLabelKey = "leaderboard.pagination.players") {
  if (pageData.total <= LEADERBOARD_PAGE_SIZE) return "";
  const first = pageData.total ? pageData.start + 1 : 0;
  return `
    <div class="pagination-row">
      <div class="pagination-summary">
        ${t("leaderboard.pagination.showing", { first, end: pageData.end, total: pageData.total, label: plural(itemLabelKey, pageData.total) })}
        <span class="pagination-current">${t("leaderboard.pagination.page", { current: pageData.currentPage, total: pageData.totalPages })}</span>
      </div>
      <div class="pagination-actions">
        <button class="small-button" data-pagination-target="${escapeHtml(target)}" data-pagination-page="${pageData.currentPage - 1}" ${pageData.currentPage <= 1 ? "disabled" : ""}>${t("leaderboard.pagination.previous")}</button>
        <button class="small-button" data-pagination-target="${escapeHtml(target)}" data-pagination-page="${pageData.currentPage + 1}" ${pageData.currentPage >= pageData.totalPages ? "disabled" : ""}>${t("leaderboard.pagination.next")}</button>
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
      if (button.dataset.paginationTarget === "team-leaderboard") state.teamLeaderboardPage = page;
      if (button.dataset.paginationTarget === "admin-teams") state.adminTeamsPage = page;
      renderShell();
    });
  });
}

function renderTop() {
  const content = document.querySelector("[data-content]");
  const activeTab = state.leaderboardTab === "users" && !state.me?.isAdmin ? "leaderboard" : state.leaderboardTab;
  if (state.leaderboardTab !== activeTab) state.leaderboardTab = activeTab;
  content.innerHTML = `
    ${pageTabs("leaderboard", [
      { id: "leaderboard", label: t("nav.leaderboard") },
      { id: "teams", label: t("nav.playerTeams") },
      ...(state.me?.isAdmin ? [{ id: "users", label: t("leaderboard.tab.users") }] : [])
    ], activeTab, { publicTabs: true })}
    ${activeTab === "users" ? adminUsersPanel() : `
      ${venueTabs("leaderboard", state.leaderboardVenue)}
      <section class="card panel">
      <div class="panel-header">
        <div>
          <h2>${t(activeTab === "teams" ? "teams.leaderboard.title" : "leaderboard.title")}</h2>
          <p class="muted">${activeTab === "teams" ? t(state.leaderboardVenue === "combined" ? "teams.leaderboard.hintCombined" : "teams.leaderboard.hint") : state.leaderboardVenue === "combined"
            ? t("leaderboard.hintCombined")
            : t("leaderboard.hintWithVenue", { venue: state.leaderboardVenue === "irl" ? t("venue.irl") : "TTS" })}</p>
        </div>
      </div>
      ${activeTab === "teams" ? teamsTable(state.teamLeaderboard) : usersTable(state.users)}
      <div class="message" data-message></div>
      </section>
    `}
  `;
  wirePageTabs();
  wireVenueTabs();
  wirePaginationControls();
  if (activeTab === "users") wireAdminUserControls();
  else if (activeTab === "teams") wireTeamLinks();
  else wireLeaderboardProfiles();
}

function filterAdminTeams(teams, query) {
  const search = String(query || "").trim().toLocaleLowerCase();
  return search ? teams.filter((team) => team.name.toLocaleLowerCase().includes(search)) : teams;
}

function teamsTable(teams, { admin = false } = {}) {
  const pageData = paginate(teams, admin ? state.adminTeamsPage : state.teamLeaderboardPage);
  if (admin) state.adminTeamsPage = pageData.currentPage;
  else state.teamLeaderboardPage = pageData.currentPage;
  if (!pageData.total) return `<div class="empty">${t("teams.list.empty")}</div>`;
  return `<div class="table-wrap"><table>
    <thead><tr>${admin ? "" : '<th class="rank">#</th>'}<th>${t("teams.field.name")}</th>${admin ? `<th>${t("teams.role.leader")}</th>` : ""}<th>${t("teams.members.count")}</th>${admin ? `<th>${t("teams.rating.tts")}</th><th>${t("teams.rating.irl")}</th>` : `<th>${t("tournaments.card.rating")}</th>`}</tr></thead>
    <tbody>${pageData.items.map((team, index) => `<tr>
      ${admin ? "" : `<td class="rank">${pageData.start + index + 1}</td>`}
      <td><button class="text-button player-name-button leaderboard-player-button" data-team-open="${escapeHtml(team.slug)}">
        <span class="leaderboard-avatar">${avatarMarkup({ name: team.name, avatarData: team.logoData })}</span><span>${escapeHtml(team.name)}</span>
      </button>${team.archivedAt ? `<span class="status">${t("teams.status.archived")}</span>` : ""}</td>
      ${admin ? `<td>${escapeHtml(team.leaderName || "—")}</td>` : ""}
      <td>${team.memberCount ?? 0}</td>${admin ? `<td>${team.ratings.tts}</td><td>${team.ratings.irl}</td>` : `<td>${team.rating}</td>`}
    </tr>`).join("")}</tbody>
  </table></div>${paginationMarkup(admin ? "admin-teams" : "team-leaderboard", pageData, "teams.pagination.teams")}`;
}

function wireTeamLinks() {
  document.querySelectorAll("[data-team-open]").forEach((button) => button.addEventListener("click", () => navigateToPlayerTeam(button.dataset.teamOpen)));
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

function usersTable(users) {
  const pageData = paginate(users, state.leaderboardPage);
  state.leaderboardPage = pageData.currentPage;
  if (!pageData.total) return `<div class="empty">${t("leaderboard.empty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th class="rank">#</th><th>${t("games.filter.playerLabel")}</th><th>${t("tournaments.card.rating")}</th></tr></thead>
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
    ${paginationMarkup("leaderboard", pageData, "leaderboard.pagination.players")}
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
      <div class="row-main">
        <button class="text-button row-title" data-admin-tournament-open="${tournament.id}">${escapeHtml(tournament.name || t("tournaments.list.untitled"))}</button>
        <div class="row-meta">${escapeHtml(tournamentFormatLabel(tournament))} / ${escapeHtml(tournament.slug)} / ${tournament.startsAt ? fmtDate(tournament.startsAt) : t("tournaments.date.none")}</div>
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
        <div>
          <p class="profile-label">${escapeHtml(tournamentFormatSummary(tournament))}</p>
          <h2>${escapeHtml(tournament.name || t("tournaments.list.untitled"))}</h2>
          <p class="muted">${escapeHtml(tournamentStatusLabel(tournament.status))}${tournament.startsAt ? ` / ${fmtDate(tournament.startsAt)}` : ""}</p>
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

function rollbackRoundActionState(data) {
  const rounds = (data.rounds || []).filter((round) => round.status !== "not_ready");
  const round = rounds[rounds.length - 1];
  if (!round) return { canRollback: false };
  const canRollback = data.tournament?.participantMode === "team"
    ? (round.matches || []).length > 0 && (round.matches || []).every((match) =>
      match.phase !== "completed" && !(match.games || []).some((link) => link.game?.status === "completed")
    )
    : (round.matches || []).length > 0 && (round.matches || []).every((match) =>
    match.isBye || (
      !["pending_confirmation", "completed"].includes(match.status) &&
      !match.pendingResult &&
      !match.result &&
      !match.elo
    )
    );
  return { canRollback, roundNumber: round.roundNumber };
}

function nextRoundActionState(data) {
  const tournament = data.tournament || {};
  const rounds = data.rounds || [];
  if (tournament.status !== "in_progress") return { canGenerate: false, message: t("admin.tournament.round.notRunning") };
  if (!rounds.length) return { canGenerate: true, message: "" };

  if (tournament.format === "swiss") {
    const currentRound = rounds[rounds.length - 1];
    const complete = (currentRound.matches || []).length > 0 &&
      (currentRound.matches || []).every((match) => tournament.participantMode === "team" ? match.phase === "completed" : match.status === "completed");
    if (!complete) return { canGenerate: false, message: t("admin.tournament.round.finishSwiss") };
    if (currentRound.roundNumber >= Number(tournament.swissRoundCount || 0)) {
      return { canGenerate: false, message: t("admin.tournament.round.allSwissGenerated") };
    }
    return { canGenerate: true, message: "" };
  }

  const nextRound = rounds.find((round) => round.status === "not_ready");
  if (!nextRound) return { canGenerate: false, message: t("admin.tournament.round.noNextBracket") };
  const previousRound = rounds.find((round) => round.roundNumber === nextRound.roundNumber - 1);
  const previousComplete = previousRound &&
    (previousRound.matches || []).length > 0 &&
    (previousRound.matches || []).every((match) => match.status === "completed");
  if (!previousComplete) return { canGenerate: false, message: t("admin.tournament.round.finishBracket") };
  const nextReady = (nextRound.matches || []).every((match) =>
    match.isBye || (match.participantAId && match.participantBId)
  );
  if (!nextReady) return { canGenerate: false, message: t("admin.tournament.round.waitingForWinners") };
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

function tournamentStatsContent(data) {
  const games = (data.tournamentGames || []).filter((game) => game.status === "completed" && game.result);
  if (!games.length) return `<div class="empty">${t("tournaments.stats.empty")}</div>`;
  const teams = tournamentKillTeamStats(games);
  const tacOps = tournamentTacOpStats(games);
  return `
    <div class="tournament-stats">
      <section class="profile-grid">
        ${metricCard(t("tournaments.stats.completedGames"), games.length)}
        ${metricCard(t("tournaments.stats.tacOpsCount"), tacOps.length)}
        ${metricCard(t("tournaments.stats.killTeamsCount"), teams.length)}
        ${metricCard(t("tournaments.field.season"), seasonLabel(data.tournament?.seasonId))}
      </section>
      <div class="grid-2 tournament-stats-grid">
        ${tournamentTacOpStatsTable(tacOps)}
        ${tournamentStatsTable(t("tournaments.stats.killTeamTableTitle"), teams, "team")}
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
      const team = player.faction || t("tournaments.participant.factionMissing");
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
    addTournamentStatLine(byTeam.get(a.faction || t("tournaments.participant.factionMissing")), a, b, game);
    addTournamentStatLine(byTeam.get(b.faction || t("tournaments.participant.factionMissing")), b, a, game);
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
      <h4>${t("tournaments.stats.tacOpTableTitle")}</h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("op.tac")}</th>
              <th>${t("stats.column.games")}</th>
              <th>${t("stats.column.wins")}</th>
              <th>${t("profile.metric.winRate")}</th>
              <th>${t("stats.column.avgVp")}</th>
              <th>${t("stats.column.avgVpAsPrimary")}</th>
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
            `).join("") : `<tr><td colspan="6">${t("tournaments.stats.tacOpEmpty")}</td></tr>`}
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
              <th>${kind === "player" ? t("tournaments.player.fallback") : t("games.filter.teamLabel")}</th>
              ${kind === "player" ? `<th>${t("games.filter.teamLabel")}</th>` : ""}
              <th>${t("tournaments.standings.column.wdl")}</th>
              <th>${t("profile.metric.winRate")}</th>
              <th>${t("tournaments.standings.totalVp")}</th>
              <th>${t("tournaments.standings.vpDiff")}</th>
              <th>${t("profile.hero.elo")}</th>
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
        <div class="row-meta">${t("admin.tournament.participants.seedLabel", { seed: participant.seed || "-" })} / ${escapeHtml(participantUserLabel(participant))} / ${escapeHtml(participant.faction || t("tournaments.participant.factionMissing"))}</div>
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
  if (!participant.userId) return t("admin.tournament.participants.unregistered");
  return participant.user?.name
    ? t("admin.tournament.participants.tgtvUser", { name: participant.user.name })
    : t("admin.tournament.participants.tgtvUserId", { id: participant.userId });
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

function previewRoundsMarkup(rounds, names) {
  return `
    <div class="public-rounds">
      ${rounds.map((round) => `
        <section class="public-round">
          <div class="public-round-title">
            <strong>${t("tournaments.round.title", { number: round.roundNumber })}</strong>
            <span class="status ${round.status === "active" ? "pending" : ""}">${escapeHtml(tournamentMatchStatusLabel(round.status))}</span>
          </div>
          <div class="list">
            ${(round.matches || []).map((match) => `
              <div class="row-card compact-row-card">
                <div class="row-main">
                  <div class="row-title">${escapeHtml(names.get(match.participantAId) || t("tournaments.participant.fallback"))} vs ${match.isBye ? t("tournaments.match.byeUpper") : escapeHtml(names.get(match.participantBId) || t("tournaments.participant.fallback"))}</div>
                  <div class="row-meta">${match.isBye ? t("tournaments.match.bye") : t("admin.tournament.preview.pendingResult")}</div>
                </div>
                <span class="status ${match.status === "active" ? "pending" : match.status === "completed" ? "completed" : ""}">${escapeHtml(tournamentMatchStatusLabel(match.status))}</span>
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
            <span>${t("admin.tournament.tiebreaker.priority", { index: index + 1 })}</span>
            <select data-tournament-tiebreaker-select ${disabled}>
              <option value="">${t("admin.tournament.tiebreaker.none")}</option>
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
      <span class="muted">${t("admin.tournament.tiebreaker.heading")}</span>
      <button class="info-icon-button" type="button" data-tournament-tiebreaker-help-open aria-label="${t("admin.tournament.tiebreaker.explainAria")}" title="${t("admin.tournament.tiebreaker.explainTitle")}">!</button>
    </div>
    <dialog class="tiebreaker-help-dialog" data-tournament-tiebreaker-help>
      <div class="tiebreaker-help-content">
        <div class="tiebreaker-help-header">
          <div>
            <h3>${t("admin.tournament.tiebreaker.heading")}</h3>
            <p>${t("admin.tournament.tiebreaker.explainBody")}</p>
          </div>
          <button class="dialog-close-button" type="button" data-tournament-tiebreaker-help-close aria-label="${t("common.close")}">&times;</button>
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
    <div class="public-rounds">${(preview.rounds || []).map((round) => `<section class="public-round"><div class="public-round-title"><strong>${t("tournaments.round.title", { number: round.roundNumber })}</strong></div><div class="list">${(round.matches || []).map((match) => `<div class="row-card compact-row-card"><div class="row-main"><div class="row-title">${teamRosterLabel(rosters.get(match.rosterAId))} vs ${teamRosterLabel(rosters.get(match.rosterBId))}</div><div class="row-meta">${t("tournaments.pairingType.shieldSword")}</div></div></div>`).join("")}</div></section>`).join("")}</div>
  </section>`;
}

function adminTeamRostersContent(data) {
  const tournament = data.tournament || {};
  const rosters = data.rosters || [];
  const seedLocked = ["in_progress", "completed", "cancelled"].includes(tournament.status);
  const canAddRoster = !["in_progress", "completed", "cancelled"].includes(tournament.status);
  const active = rosters.filter((roster) => roster.status !== "withdrawn");
  return `<div class="tournament-participant-admin">
    <div class="panel-header">
      <p class="participant-admin-note muted">${t("teams.tournament.adminRosterHint")}</p>
      <div class="row-actions"><button class="primary-button" data-admin-team-roster-add ${canAddRoster ? "" : "disabled"}>${t("teams.tournament.add")}</button></div>
    </div>
    <div class="list">${rosters.length ? rosters.map((roster) => `
      <div class="row-card team-roster-admin-row ${roster.status === "withdrawn" ? "is-muted" : ""}">
        <div class="row-main">
          <div class="row-title">${teamRosterLabel(roster)}</div>
          <div class="row-meta">${t("teams.roster.seed", { seed: roster.seed || "-" })} · ${escapeHtml(roster.teamNameSnapshot || "")} · ${escapeHtml(teamRosterStatusLabel(roster.status))}</div>
          <div class="team-roster-members">${activeRosterMembersForUi(roster).map((member) => `<span>${escapeHtml(member.displayNameSnapshot)} · ${escapeHtml(member.factionSnapshot)}${member.userId === roster.captainUserId ? ` · ${t("teams.role.captain")}` : ""}</span>`).join("")}</div>
        </div>
        <div class="row-actions">
          ${roster.status !== "withdrawn" ? `<input class="seed-input" type="number" min="1" max="128" value="${roster.seed || 1}" data-team-roster-seed="${roster.id}" ${seedLocked ? "disabled" : ""}>` : ""}
          ${!["withdrawn", "finished"].includes(roster.status) && !["completed", "cancelled"].includes(tournament.status) ? `<button class="small-button" data-admin-team-roster-edit="${roster.id}">${t("teams.tournament.edit")}</button>` : ""}
          ${!seedLocked && roster.status !== "withdrawn" ? `<button class="danger-button" data-admin-team-roster-withdraw="${roster.id}">${t("teams.tournament.withdraw")}</button>` : ""}
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
      <div class="field"><label>${t("teams.tournament.rosterName")}</label><input name="name" minlength="2" maxlength="80" value="${escapeHtml(teams[0].name || "")}" required></div>
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
    form.elements.name.value = team?.name || "";
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
        name: form.elements.name.value,
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

function teamRosterLabel(roster, fallback = t("teams.tournament.rosterFallback")) {
  if (!roster) return escapeHtml(fallback);
  const label = escapeHtml(roster.name || roster.teamNameSnapshot || fallback);
  return roster.team?.slug
    ? `<button class="text-link-button inline-profile-link" data-team-profile-link="${escapeHtml(roster.team.slug)}">${label}</button>`
    : label;
}

function teamRosterStatusLabel(status) {
  const key = {
    registered: "teams.roster.status.registered",
    incomplete: "teams.roster.status.incomplete",
    active: "teams.roster.status.active",
    withdrawn: "teams.roster.status.withdrawn",
    finished: "teams.roster.status.finished"
  }[status];
  return key ? t(key) : String(status || "");
}

function teamStandingsTable(data) {
  const source = Array.isArray(data.tournament?.finalResults) && data.tournament.finalResults.length
    ? data.tournament.finalResults
    : data.standings || [];
  const rosters = new Map((data.rosters || []).map((roster) => [roster.id, roster]));
  if (!source.length) return `<div class="empty">${t("teams.tournament.standingsEmpty")}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th class="rank">#</th><th>${t("teams.tournament.roster")}</th><th>${t("teams.tournament.ttp")}</th><th>${t("teams.tournament.individualWins")}</th><th>${t("teams.tournament.totalVp")}</th><th>${t("teams.tournament.tac")}</th><th>${t("tournaments.standings.column.wdl")}</th></tr></thead>
        <tbody>${source.map((row) => {
          const roster = rosters.get(Number(row.rosterId || row.roster?.id));
          return `<tr><td class="rank">${row.rank}</td><td>${teamRosterLabel(roster)}</td><td>${row.teamTournamentPoints ?? 0}</td><td>${row.individualWins ?? 0}</td><td>${row.totalVp ?? data.standings?.find((item) => item.rosterId === row.rosterId)?.totalVp ?? 0}</td><td>${row.tacOpPoints ?? 0}</td><td>${row.wins ?? 0}-${row.draws ?? 0}-${row.losses ?? 0}</td></tr>`;
        }).join("")}</tbody>
      </table>
    </div>`;
}

function teamMatchPhaseLabel(phase) {
  const key = {
    awaiting_roll: "teams.pairing.phase.awaitingRoll",
    mission_ban: "teams.pairing.phase.ban",
    shield_selection: "teams.pairing.phase.shield",
    sword_selection: "teams.pairing.phase.sword",
    environment_selection: "teams.pairing.phase.environment",
    in_progress: "teams.pairing.phase.inProgress",
    completed: "teams.pairing.phase.completed"
  }[phase];
  return key ? t(key) : String(phase || "");
}

function teamRosterMemberName(roster, memberId) {
  return (roster?.members || []).find((member) => member.id === Number(memberId))?.displayNameSnapshot || t("tournaments.player.fallback");
}

function teamPairingChoiceLabel(roster, memberId, confirmed) {
  if (memberId) return teamRosterMemberName(roster, memberId);
  return confirmed ? t("teams.pairing.choiceLocked") : t("teams.pairing.choiceWaiting");
}

function teamPairingSideMarkup(match, side) {
  const isA = side === "a";
  const roster = isA ? match.rosterA : match.rosterB;
  const opponent = isA ? match.rosterB : match.rosterA;
  const isAttacker = match.attackerRosterId === roster?.id;
  const role = match.attackerRosterId
    ? t(isAttacker ? "teams.pairing.attacker" : "teams.pairing.defender")
    : t("teams.pairing.rolePending");
  const shieldId = isA ? match.shieldAMemberId : match.shieldBMemberId;
  const shieldConfirmed = isA ? match.shieldAConfirmed : match.shieldBConfirmed;
  const swordId = isA ? match.swordAMemberId : match.swordBMemberId;
  const swordConfirmed = isA ? match.swordAConfirmed : match.swordBConfirmed;
  return `<section class="team-pairing-side">
    <div class="team-pairing-side-header">
      <strong>${teamRosterLabel(roster)}</strong>
      <span class="status-pill">${escapeHtml(role)}</span>
    </div>
    <dl class="team-pairing-choices">
      <div><dt>${t("teams.pairing.shield")}</dt><dd>${escapeHtml(teamPairingChoiceLabel(roster, shieldId, shieldConfirmed))}</dd></div>
      <div><dt>${t("teams.pairing.sword")}</dt><dd>${escapeHtml(teamPairingChoiceLabel(opponent, swordId, swordConfirmed))}</dd></div>
    </dl>
  </section>`;
}

function teamPairingSelectionsMarkup(match) {
  return `${teamRollHistoryMarkup(match)}<div class="team-pairing-selections">${teamPairingSideMarkup(match, "a")}${teamPairingSideMarkup(match, "b")}</div>${teamMissionPoolMarkup(match)}`;
}

function teamRollHistoryMarkup(match) {
  if (!(match.rollHistory || []).length) return "";
  return `<div class="team-roll-history">${match.rollHistory.map((roll, index) => `<p>${escapeHtml(t("teams.pairing.rollOffResult", {
    round: index + 1, nameA: match.rosterA?.name || "A", a: roll.a || "—", nameB: match.rosterB?.name || "B", b: roll.b || "—"
  }))}${roll.a && roll.a === roll.b ? ` · ${t("teams.pairing.reroll")}` : ""}</p>`).join("")}</div>`;
}

function teamMissionPoolMarkup(match) {
  if (match.pairingVersion !== 2) return "";
  const bans = match.missionBans || [];
  const used = new Set((match.environment?.assignments || []).map((item) => item.mission?.critOp));
  const turn = match.nextAction;
  const next = turn ? t(turn.kind === "ban" ? "teams.pairing.turnBan" : turn.kind === "table" ? "teams.pairing.turnTable" : "teams.pairing.turnMission", {
    name: (turn.side === "a" ? match.rosterA : match.rosterB)?.name || turn.side.toUpperCase(), number: turn.slot
  }) : "";
  return `<section class="team-mission-pool"><h4>${t("teams.pairing.pool")}</h4><div class="team-mission-options">${(match.missions || []).map(({ critOp }) => {
    const ban = bans.find((item) => item.mission === critOp);
    const label = ban ? t("teams.pairing.bannedBy", { name: (ban.side === "a" ? match.rosterA : match.rosterB)?.name || ban.side }) : used.has(critOp) ? t("teams.pairing.assigned") : "";
    return `<span class="team-mission-option ${ban ? "is-banned" : used.has(critOp) ? "is-assigned" : ""}">${escapeHtml(critOp)}${label ? `<small>${escapeHtml(label)}</small>` : ""}</span>`;
  }).join("")}</div>${next ? `<p class="team-pairing-turn">${escapeHtml(next)}</p>` : ""}</section>`;
}

function teamTournamentTables(tournamentId) {
  const detail = [state.teamPairingDetail, state.publicTournamentDetail, state.adminTournamentDetail]
    .find((data) => data?.tournament?.id === tournamentId);
  return detail?.tables || [];
}

function teamEnvironmentAssignmentsMarkup(match) {
  const assignments = match.environment?.assignments || [];
  if (!assignments.length) return "";
  return `<div class="team-environment-assignments">${assignments.map((assignment) => {
    const table = (match.tables || teamTournamentTables(match.tournamentId)).find((item) => item.id === Number(assignment.tableId));
    const parts = [teamMissionLabel(assignment.mission)];
    if (table) parts.push(assignment.mission?.killzone ? t("tournaments.match.table", { number: table.tableNumber }) : tableLabel(table));
    return `<div><strong>${t("teams.pairing.game", { number: assignment.slot })}</strong><span>${escapeHtml(parts.filter(Boolean).join(" · "))}</span></div>`;
  }).join("")}</div>`;
}

function teamMatchPairingsMarkup(match) {
  if (!(match.pairings || []).length) return "";
  return `<div class="team-pairings-list">${match.pairings.map((pairing) => `
    <div><strong>${t("teams.pairing.table", { number: pairing.slot })}</strong> ${escapeHtml(teamRosterMemberName(match.rosterA, pairing.rosterAMemberId))} vs ${escapeHtml(teamRosterMemberName(match.rosterB, pairing.rosterBMemberId))}${pairing.shieldOwner ? ` · ${t("teams.pairing.shieldOwner", { side: pairing.shieldOwner.toUpperCase() })}` : ""}</div>
  `).join("")}</div>`;
}

function teamMatchGamesMarkup(match) {
  if (!(match.games || []).length) return "";
  const progress = match.progress || { completed: 0, total: 3, gpA: 0, gpB: 0 };
  const summary = t("teams.results.progress", { count: progress.completed, total: progress.total, a: progress.gpA, b: progress.gpB });
  return `<p class="team-match-progress">${escapeHtml(summary)}</p><div class="team-match-games">${match.games.map((link) => {
    const game = link.game || {};
    const mission = teamMissionLabel(link.mission);
    const completed = game.status === "completed" && game.result;
    const status = t(completed ? "teams.results.completed" : game.status === "pending_confirmation" ? "teams.results.pending" : "teams.results.unplayed");
    const [playerAId, playerBId] = game.playerIds || [];
    const vpA = completed ? game.result.scores?.[playerAId]?.total ?? 0 : null;
    const vpB = completed ? game.result.scores?.[playerBId]?.total ?? 0 : null;
    const score = completed ? `${vpA}:${vpB} VP · ${link.gamePointsA}:${link.gamePointsB} GP` : t("teams.results.notCounted");
    const players = `${teamRosterMemberName(match.rosterA, link.rosterAMemberId)} vs ${teamRosterMemberName(match.rosterB, link.rosterBMemberId)}`;
    return `<div class="team-match-game" data-team-game-status="${escapeHtml(game.status || "open")}"><div class="row-main"><strong>${t("teams.pairing.game", { number: link.slot })} · ${escapeHtml(players)}</strong><div class="row-meta">${escapeHtml(mission)}</div><span>${escapeHtml(status)} · ${escapeHtml(score)}</span></div>${state.me ? `<button class="small-button" data-team-tournament-game="${game.id}">${t("play.action.details")}</button>` : ""}</div>`;
  }).join("")}</div>`;
}

function teamMissionLabel(mission = {}) {
  return [
    mission.critOp || "",
    mission.killzone || "",
    mission.layout ? t("tournaments.mission.layout", { layout: mission.layout }) : ""
  ].filter(Boolean).join(" · ");
}

function teamEnvironmentStep(match, tournament) {
  if (match.pairingVersion === 2) return match.nextAction;
  const attackerSide = match.attackerRosterId === match.rosterAId ? "a" : "b";
  const defenderSide = attackerSide === "a" ? "b" : "a";
  const attackerShieldSlot = (match.pairings || []).find((pairing) => pairing.shieldOwner === attackerSide)?.slot;
  const defenderShieldSlot = (match.pairings || []).find((pairing) => pairing.shieldOwner === defenderSide)?.slot;
  const plan = tournament.venueMode === "tts"
    ? [{ side: attackerSide, kind: "mission", slot: defenderShieldSlot }, { side: defenderSide, kind: "mission", slot: attackerShieldSlot }]
    : [{ side: defenderSide, kind: "table", slot: defenderShieldSlot }, { side: attackerSide, kind: "mission", slot: defenderShieldSlot }, { side: attackerSide, kind: "table", slot: attackerShieldSlot }, { side: defenderSide, kind: "mission", slot: attackerShieldSlot }];
  return plan[Number(match.environment?.step || 0)] || null;
}

function teamCaptainPairingControl(match, tournament) {
  if (!state.me || tournament.status !== "in_progress" || ["in_progress", "completed"].includes(match.phase)) return "";
  if (state.me.isAdmin) {
    return `<section class="team-admin-pairing"><h4>${t("teams.pairing.adminControls")}</h4><p class="muted">${t("teams.pairing.adminHint")}</p><div class="team-pairing-selections">${["a", "b"].map((side) => `
      <section class="team-pairing-side" data-admin-captain-side="${side}"><h4>${escapeHtml(t("teams.pairing.actingFor", { name: (side === "a" ? match.rosterA : match.rosterB)?.name || side.toUpperCase() }))}</h4>${teamPairingControlForSide(match, tournament, side)}</section>
    `).join("")}</div></section>`;
  }
  const side = match.rosterA?.captainUserId === state.me.id ? "a" : match.rosterB?.captainUserId === state.me.id ? "b" : null;
  return side ? teamPairingControlForSide(match, tournament, side) : "";
}

function teamPairingControlForSide(match, tournament, side) {
  const ownRoster = side === "a" ? match.rosterA : match.rosterB;
  const opponent = side === "a" ? match.rosterB : match.rosterA;
  if (match.phase === "awaiting_roll") {
    const current = (match.rollHistory || [])[Number(match.rollRound || 1) - 1];
    if (match.pairingVersion === 2 && current?.[side]) return `<span class="muted">${t("teams.pairing.rolledWaiting", { result: current[side] })}</span>`;
    return `<button class="primary-button" data-team-pair-action="roll" data-team-match-id="${match.id}" data-side="${side}" data-roll-round="${match.rollRound || 1}">${t("teams.pairing.roll")}</button>`;
  }
  if (match.phase === "mission_ban") {
    if (match.nextAction?.side !== side) return `<span class="muted">${t("teams.pairing.waitingTurn")}</span>`;
    const choices = (match.missions || []).filter(({ critOp }) => !(match.missionBans || []).some((ban) => ban.mission === critOp));
    return `<form class="team-pairing-control" data-team-pairing-form="ban" data-team-match-id="${match.id}" data-side="${side}"><label>${t("teams.pairing.banMission")}<select name="mission" required>${choices.map(({ critOp }) => `<option value="${escapeHtml(critOp)}">${escapeHtml(critOp)}</option>`).join("")}</select></label><button class="primary-button" type="submit">${t("teams.pairing.ban")}</button></form>`;
  }
  if (match.phase === "shield_selection") {
    const confirmed = side === "a" ? match.shieldAConfirmed : match.shieldBConfirmed;
    if (confirmed && !state.me.isAdmin) return `<span class="muted">${t("teams.pairing.waitingOpponent")}</span>`;
    return teamMemberChoiceForm(match, "shield", ownRoster, t("teams.pairing.chooseShield"), side, side === "a" ? match.shieldAMemberId : match.shieldBMemberId);
  }
  if (match.phase === "sword_selection") {
    const confirmed = side === "a" ? match.swordAConfirmed : match.swordBConfirmed;
    if (confirmed && !state.me.isAdmin) return `<span class="muted">${t("teams.pairing.waitingOpponent")}</span>`;
    const shieldId = side === "a" ? match.shieldBMemberId : match.shieldAMemberId;
    return teamMemberChoiceForm(match, "sword", { ...opponent, members: (opponent.members || []).filter((member) => member.id !== shieldId) }, t("teams.pairing.chooseSword"), side, side === "a" ? match.swordAMemberId : match.swordBMemberId);
  }
  if (match.phase === "environment_selection") {
    const step = teamEnvironmentStep(match, tournament);
    if (!step || step.side !== side) return `<span class="muted">${t("teams.pairing.waitingOpponent")}</span>`;
    const assigned = match.environment?.assignments || [];
    if (step.kind === "mission") {
      const used = new Set([...assigned.map((item) => item.mission?.critOp), ...(match.missionBans || []).map((item) => item.mission)].filter(Boolean));
      const choices = (match.missions || []).filter((mission) => !used.has(mission.critOp));
      return teamEnvironmentChoiceForm(match, "mission", choices.map((mission) => ({ value: mission.critOp, label: mission.critOp })), step.slot, side);
    }
    const used = new Set(assigned.map((item) => item.tableId).filter(Boolean));
    const choices = (match.tableIds || []).filter((id) => !used.has(id)).map((id) => ({ value: id, label: tableLabel((match.tables || teamTournamentTables(match.tournamentId)).find((table) => table.id === id) || { tableNumber: id }) }));
    return teamEnvironmentChoiceForm(match, "tableId", choices, step.slot, side);
  }
  return "";
}

function teamMemberChoiceForm(match, action, roster, label, side, selectedId) {
  const members = (roster.members || []).filter((member) => !member.endedAt);
  return `<form class="team-pairing-control" data-team-pairing-form="${action}" data-team-match-id="${match.id}" data-side="${side}"><label>${escapeHtml(label)}<select name="memberId" required>${members.map((member) => `<option value="${member.id}" ${member.id === selectedId ? "selected" : ""}>${escapeHtml(member.displayNameSnapshot)} · ${escapeHtml(member.factionSnapshot)}</option>`).join("")}</select></label><button class="primary-button" type="submit">${t("common.confirm")}</button></form>`;
}

function teamEnvironmentChoiceForm(match, name, choices, slot, side) {
  return `<form class="team-pairing-control" data-team-pairing-form="environment" data-team-match-id="${match.id}" data-side="${side}" data-step="${match.environment?.step || 0}"><label>${t(name === "mission" ? "teams.pairing.chooseMission" : "teams.pairing.chooseTable", { number: slot })}<select name="${name}" required>${choices.map((choice) => `<option value="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</option>`).join("")}</select></label><button class="primary-button" type="submit">${t("common.confirm")}</button></form>`;
}

function adminTeamPairingOverrideForm(match) {
  if (match.phase !== "environment_selection" || (match.games || []).length || !(match.pairings || []).length) return "";
  const membersA = activeRosterMembersForUi(match.rosterA);
  const membersB = activeRosterMembersForUi(match.rosterB);
  const options = (members, selectedId) => members.map((member) => `<option value="${member.id}" ${member.id === Number(selectedId) ? "selected" : ""}>${escapeHtml(member.displayNameSnapshot)}</option>`).join("");
  return `<form class="team-pairing-override" data-team-pairings-override="${match.id}">
    <strong>${t("teams.pairing.override")}</strong>
    ${(match.pairings || []).map((pairing, index) => `<div class="team-pairing-override-row"><span>${index + 1}</span><select name="pair-a-${index + 1}">${options(membersA, pairing.rosterAMemberId)}</select><span>vs</span><select name="pair-b-${index + 1}">${options(membersB, pairing.rosterBMemberId)}</select></div>`).join("")}
    <button class="small-button" type="submit">${t("teams.pairing.saveOverride")}</button>
  </form>`;
}

function teamTournamentMatchMarkup(match, tournament, options = {}) {
  const completeScore = match.phase === "completed" ? `${match.teamTournamentPointsA}:${match.teamTournamentPointsB} TTP · ${match.teamGamePointsA}:${match.teamGamePointsB} GP` : "";
  const canReset = Boolean(state.me?.isAdmin) && tournament.status === "in_progress";
  const canOpenPairing = !options.standalone;
  const resetPhases = ["awaiting_roll", ...(match.pairingVersion === 2 ? ["mission_ban"] : []), "shield_selection", "sword_selection", "environment_selection"];
  const resetPhaseIndex = resetPhases.indexOf(match.phase);
  const resetOptions = resetPhases.slice(0, resetPhaseIndex === -1 ? undefined : resetPhaseIndex + 1)
    .map((phase) => `<option value="${phase}">${teamMatchPhaseLabel(phase)}</option>`).join("");
  return `<article class="row-card team-match-card">
    <div class="row-main">
      <div class="row-title">${teamRosterLabel(match.rosterA)} vs ${teamRosterLabel(match.rosterB)}</div>
      <div class="row-meta">${escapeHtml([teamMatchPhaseLabel(match.phase), completeScore, match.rollResult && match.pairingVersion !== 2 ? t("teams.pairing.rollResult", { result: match.rollResult }) : ""].filter(Boolean).join(" · "))}</div>
      ${teamPairingSelectionsMarkup(match)}${teamMatchPairingsMarkup(match)}${teamEnvironmentAssignmentsMarkup(match)}${teamMatchGamesMarkup(match)}
      <div class="team-captain-control">${teamCaptainPairingControl(match, tournament)}${canReset ? adminTeamPairingOverrideForm(match) : ""}</div>
    </div>
    ${canOpenPairing || canReset ? `<div class="row-actions team-match-admin-actions">${canOpenPairing ? `<button class="small-button" data-team-pairing-open="${match.id}">${t("play.teamPairings.open")}</button>` : ""}${canReset ? `<label>${t("teams.pairing.resetTo")}<select data-team-match-reset-phase="${match.id}">${resetOptions}</select></label><button class="danger-button" data-team-match-reset="${match.id}">${t("teams.pairing.reset")}</button>` : ""}</div>` : ""}
  </article>`;
}

function renderTeamPairing() {
  const content = state.me ? document.querySelector("[data-content]") : app;
  const data = state.teamPairingDetail;
  if (!data?.teamMatch) {
    content.innerHTML = `<section class="card panel"><div class="loading">${t("teams.pairing.loading")}</div><div class="message" data-message></div></section>`;
    return;
  }
  const tournament = data.tournament || {};
  const match = data.teamMatch;
  content.innerHTML = `<div class="team-pairing-page">
    <section class="card panel team-pairing-hero">
      <div class="panel-header">
        <div>
          <p class="profile-label">${escapeHtml(tournament.name || "")} · ${t("notifications.round", { number: match.roundNumber })}</p>
          <h2>${t("teams.pairing.screenTitle")}</h2>
          <p class="muted">${t("teams.pairing.screenHint")}</p>
        </div>
        <div class="row-actions">
          ${state.me ? `<button class="small-button" data-team-pairing-back>${t("teams.pairing.backToMatchmaking")}</button>` : ""}
          ${tournament.slug ? `<button class="small-button" data-team-pairing-tournament="${escapeHtml(tournament.slug)}">${t("teams.pairing.openTournament")}</button>` : ""}
        </div>
      </div>
    </section>
    <section class="card panel team-pairing-workspace">
      ${teamTournamentMatchMarkup(match, tournament, { standalone: true })}
    </section>
    <div class="message" data-message></div>
  </div>`;
  document.querySelector("[data-team-pairing-back]")?.addEventListener("click", () => {
    stopTeamPairingPoll();
    state.view = "play";
    state.selectedTeamMatchId = null;
    state.teamPairingDetail = null;
    syncAppHash();
    renderShell();
  });
  document.querySelector("[data-team-pairing-tournament]")?.addEventListener("click", (event) => {
    navigateToPublicTournament(event.currentTarget.dataset.teamPairingTournament);
  });
  wireTeamTournamentControls(data, { standalone: true });
}

function teamTournamentRoundsMarkup(data, options = {}) {
  const rounds = data.rounds || [];
  if (!rounds.length) return `<div class="empty">${t("tournaments.matches.empty")}</div>`;
  return tournamentRoundsTabbedMarkup(rounds, (match) => teamTournamentMatchMarkup(match, data.tournament || {}, options));
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
      if (!confirm(t("dialog.admin.deleteUser", { name: user?.name || "" }))) return;
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
    if (status) status.textContent = form.dataset.existingRulesLinkType === "pdf" ? t("admin.tournament.field.existingPdf") : t("admin.tournament.field.noPdfSelected");
    return;
  }
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    input.value = "";
    hidden.value = "";
    form.dataset.rulesFileLoading = "";
    if (status) status.textContent = t("admin.tournament.rulesFile.choosePdf");
    setMessage(t("admin.tournament.rulesFile.mustBePdf"), true);
    return;
  }
  if (file.size > MAX_TOURNAMENT_RULES_PDF_SIZE) {
    input.value = "";
    hidden.value = "";
    form.dataset.rulesFileLoading = "";
    if (status) status.textContent = t("admin.tournament.rulesFile.tooLarge");
    setMessage(t("admin.tournament.rulesFile.tooLargeMessage"), true);
    return;
  }
  form.dataset.rulesFileLoading = "1";
  if (status) status.textContent = t("admin.tournament.rulesFile.loading");
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
    if (status) status.textContent = t("admin.tournament.rulesFile.readError");
    setMessage(t("admin.tournament.rulesFile.readErrorMessage"), true);
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
    await renderPublicTournamentRoute(tournament.slug, { force: true });
    return;
  }
  await loadTournamentAdmin();
  renderTournaments();
}

function wireTournamentInfoControls(data, options = {}) {
  wireLeaderboardProfiles();
  wireTournamentRoundTabs();
  if (data?.tournament?.participantMode === "team") wireTeamTournamentControls(data, options);
  document.querySelectorAll("[data-tournament-info-tab]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.tournamentInfoTab = button.dataset.tournamentInfoTab || "standings";
      try {
        if (state.tournamentInfoTab === "participants" && canManageTournamentParticipants(data)) {
          if (!state.adminUsers.length) await loadAdminUsers();
        }
        if (options.publicRoute) renderPublicTournament(data);
        else renderTournaments();
      } catch (err) {
        setMessage(err.message, true);
      }
    });
  });

  if (document.querySelector("[data-admin-tournament-table-add]")) {
    wireTournamentTableAdminControls();
  }
  if (document.querySelector("[data-admin-tournament-add-participant]")) {
    wireComboFields();
    wireTournamentParticipantAdminControls();
  }
}

function wireTournamentRoundTabs() {
  document.querySelectorAll("[data-tournament-round-switcher]").forEach((switcher) => {
    switcher.querySelectorAll("[data-tournament-round-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const roundNumber = button.dataset.tournamentRoundTab;
        switcher.querySelectorAll("[data-tournament-round-tab]").forEach((tab) => {
          const selected = tab.dataset.tournamentRoundTab === roundNumber;
          tab.classList.toggle("active", selected);
          tab.setAttribute("aria-selected", selected ? "true" : "false");
        });
        switcher.querySelectorAll("[data-tournament-round-panel]").forEach((panel) => {
          panel.hidden = panel.dataset.tournamentRoundPanel !== roundNumber;
        });
      });
    });
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
  if (form.dataset.rulesFileLoading === "1") {
    throw new Error(t("admin.tournament.rulesFile.stillLoading"));
  }
  const body = {};
  setFormValue(body, form, "name");
  setFormValue(body, form, "gameSystem");
  setFormValue(body, form, "startsAt");
  if (Object.prototype.hasOwnProperty.call(body, "startsAt")) {
    // datetime-local has no timezone; convert in the browser before the API sees it.
    body.startsAt = datetimeLocalToIso(body.startsAt);
  }
  const participantMode = form.elements.participantMode?.value === "team" ? "team" : "individual";
  body.participantMode = participantMode;
  if (participantMode === "team") {
    body.format = "swiss";
    body.teamSize = 3;
    body.pairingType = "shield_sword";
  } else {
    setFormValue(body, form, "format");
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
      if (tournament.participantMode === "team") { openTeamTournamentStart(tournament); return; }
      if (!window.confirm(t("dialog.admin.startTournament"))) return;
      await api(`/api/admin/tournaments/${tournament.id}/start`, { method: "POST" });
    } else if (action === "generate-next-round") {
      await openNextRoundSetupModal(tournament.id);
      return;
    } else if (action === "close-tournament") {
      if (!window.confirm(t("dialog.admin.closeTournament"))) return;
      const participantIds = (state.adminTournamentDetail?.standings || []).map((row) => row.participantId);
      await api(`/api/admin/tournaments/${tournament.id}/standings/publish`, {
        method: "POST",
        body: { participantIds }
      });
    } else if (action === "rollback-latest-round") {
      const rollbackState = rollbackRoundActionState(state.adminTournamentDetail || {});
      if (!window.confirm(t("dialog.admin.rollbackLatestRound", { number: rollbackState.roundNumber || "" }))) return;
      await api(`/api/admin/tournaments/${tournament.id}/rounds/latest`, { method: "DELETE" });
      await loadTournamentAdmin();
      renderTournaments();
      await openNextRoundSetupModal(tournament.id);
      return;
    } else if (action === "delete") {
      if (!window.confirm(t("dialog.admin.deleteTournament", { name: tournament.name || t("tournaments.list.untitled") }))) return;
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
            <h2>${t(preview.restoredDraft ? "admin.roundSetup.regenerateTitle" : "admin.roundSetup.title", { number: round.roundNumber || "" })}</h2>
            <p class="muted">${t(preview.restoredDraft ? "admin.roundSetup.restoredHint" : "admin.roundSetup.hint")}</p>
          </div>
          <button class="ghost-button" type="button" data-round-setup-close>${t("common.cancel")}</button>
        </div>
        <form class="round-setup-form" data-round-setup-form>
          ${preview.teamRound ? teamRoundMissionFields(tables) : roundMissionFields(tournament, round)}
          <div class="round-setup-list" data-round-setup-list>
            ${(round.matches || []).filter((match) => !match.isBye).map((match) =>
              preview.teamRound ? teamRoundSetupMatchRow(match) : roundSetupMatchRow(match, tournament, tables)
            ).join("")}
          </div>
          <div class="row-actions">
            ${tournament.format === "swiss" && !preview.teamRound ? `<button class="small-button" type="button" data-round-setup-add-empty>${t("admin.roundSetup.addEmpty")}</button>` : ""}
            <button class="primary-button" type="submit">${t(preview.restoredDraft ? "admin.roundSetup.regenerateSubmit" : "admin.roundSetup.submit")}</button>
          </div>
          <div class="message" data-round-setup-message></div>
        </form>
      </section>
    </div>
  `);
  wireRoundSetupModal(tournament, tables);
}

function teamRoundMissionFields(tables = []) {
  return `<section class="admin-subpanel"><p class="muted">${t("teams.tournament.missionPoolHint")}</p>${teamTableSetupFields(tables)}</section>`;
}

function teamTableSetupFields(tables = []) {
  return `<p class="muted">${t("teams.tournament.tablesHint")}</p><div class="team-table-setup">${[0, 1, 2].map((index) => `<div class="field"><label>${t("tournaments.match.table", { number: index + 1 })}</label><select name="teamKillzone-${index}" required><option value="">${t("games.result.notSelected")}</option>${optionsHtml(killzoneOptions, tables[index]?.killzone || "")}</select></div><div class="field"><label>${t("admin.tournament.tables.field.deployment")}</label><select name="teamLayout-${index}" required><option value="">${t("games.result.notSelected")}</option>${[1, 2, 3, 4, 5, 6].map((number) => `<option value="${number}" ${Number(tables[index]?.deployment) === number ? "selected" : ""}>${number}</option>`).join("")}</select></div>`).join("")}</div>`;
}

function teamTableSetupPayload(form) {
  return [0, 1, 2].map((index) => ({ killzone: form.elements[`teamKillzone-${index}`].value, deployment: Number(form.elements[`teamLayout-${index}`].value) }));
}

function openTeamTournamentStart(tournament) {
  const dialog = document.createElement("dialog");
  dialog.className = "team-start-dialog";
  dialog.innerHTML = `<form><h3>${t("teams.tournament.startWithTables")}</h3>${teamTableSetupFields(state.adminTournamentDetail?.tables)}<div class="row-actions"><button class="ghost-button" type="button" data-close>${t("common.cancel")}</button><button class="primary-button" type="submit">${t("admin.tournament.action.start")}</button></div><p class="message" data-error></p></form>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api(`/api/admin/tournaments/${tournament.id}/start`, { method: "POST", body: { tables: teamTableSetupPayload(event.currentTarget) } });
      close();
      await refreshAdminTournamentDetailView();
    } catch (err) { dialog.querySelector("[data-error]").textContent = err.message; button.disabled = false; }
  });
  dialog.showModal();
}

function teamRoundSetupMatchRow(match = {}) {
  return `<div class="row-card compact-row-card round-setup-match-row"><div class="row-main"><div class="round-setup-match-grid">${teamRoundSetupRosterSelect("rosterAId", match.rosterAId)}${teamRoundSetupRosterSelect("rosterBId", match.rosterBId)}</div></div></div>`;
}

function teamRoundSetupRosterSelect(name, selectedId = "") {
  const rosters = (state.adminTournamentDetail?.rosters || []).filter((roster) => ["registered", "active"].includes(roster.status));
  return `<div class="field"><label>${name === "rosterAId" ? t("teams.tournament.rosterA") : t("teams.tournament.rosterB")}</label><select name="${name}" required>${rosters.map((roster) => `<option value="${roster.id}" ${Number(selectedId) === roster.id ? "selected" : ""}>${escapeHtml(roster.name)}</option>`).join("")}</select></div>`;
}

function roundMissionFields(tournament, round) {
  const mission = round.mission || {};
  const killzoneField = tournament.venueMode === "tts" ? `
    <div class="field">
      <label>${t("games.result.killzoneLabel")}</label>
      <select name="roundKillzone">
        <option value="">${t("games.result.notSelected")}</option>
        ${optionsHtml(killzoneOptions, mission.killzone || "")}
      </select>
    </div>
  ` : "";
  return `
    <section class="admin-subpanel">
      <div class="grid-2">
        ${killzoneField}
        <div class="field">
          <label>${t("op.crit")}</label>
          <select name="roundCritOp">
            <option value="">${t("games.result.notSelected")}</option>
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
        <button class="small-button" type="button" data-round-setup-clear>${t("admin.roundSetup.clear")}</button>
      </div>
    </div>
  `;
}

function roundSetupPlayerSelect(name, selectedId = "") {
  const participants = listedTournamentParticipants(state.adminTournamentDetail?.participants || [])
    .filter((participant) => ["joined", "active", "pending_placement"].includes(participant.status));
  return `
    <div class="field">
      <label>${name === "participantAId" ? t("admin.roundSetup.playerA") : t("admin.roundSetup.playerB")}</label>
      <select name="${name}">
        <option value="">${t("admin.roundSetup.emptySlot")}</option>
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
      <label>${t("admin.roundSetup.tableLabel")}</label>
      <select name="tableId">
        <option value="">${t("admin.roundSetup.auto")}</option>
        ${tables.map((table) => `
          <option value="${table.id}" data-deployment="${escapeHtml(table.deployment || "")}" ${Number(selectedId) === table.id ? "selected" : ""}>
            ${escapeHtml(tableLabel(table))}
          </option>
        `).join("")}
      </select>
      <span class="field-help" data-round-table-deployment>${selectedTable?.deployment ? t("tournaments.mission.deployment", { layout: selectedTable.deployment }) : t("admin.roundSetup.deploymentAuto")}</span>
    </div>
  `;
}

function tableLabel(table = {}) {
  return [
    t("tournaments.match.table", { number: table.tableNumber }),
    table.killzone || "",
    table.deployment ? t("tournaments.mission.deployment", { layout: table.deployment }) : ""
  ].filter(Boolean).join(" / ");
}

function wireRoundSetupModal(tournament, tables) {
  document.querySelector("[data-round-setup-close]")?.addEventListener("click", closeRoundSetupModal);
  document.querySelector("[data-round-setup-add-empty]")?.addEventListener("click", () => {
    document.querySelector("[data-round-setup-list]")?.insertAdjacentHTML(
      "beforeend",
      roundSetupMatchRow({}, tournament, tables)
    );
    updateRoundSetupPlayerSelects();
  });
  document.querySelector("[data-round-setup-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-round-setup-clear]");
    if (!button) return;
    const row = button.closest(".round-setup-match-row");
    row?.querySelectorAll("select").forEach((select) => {
      select.value = "";
      if (select.name === "tableId") updateRoundSetupTableDeployment(select);
    });
    updateRoundSetupPlayerSelects();
  });
  document.querySelector("[data-round-setup-list]")?.addEventListener("change", (event) => {
    if (["participantAId", "participantBId", "rosterAId", "rosterBId"].includes(event.target?.name)) {
      updateRoundSetupPlayerSelects();
      return;
    }
    if (event.target?.name === "tableId") updateRoundSetupTableDeployment(event.target);
  });
  updateRoundSetupPlayerSelects();
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

function updateRoundSetupPlayerSelects() {
  const selects = Array.from(
    document.querySelectorAll('.round-setup-match-row select[name="participantAId"], .round-setup-match-row select[name="participantBId"], .round-setup-match-row select[name="rosterAId"], .round-setup-match-row select[name="rosterBId"]')
  );
  const assigned = new Set(selects.map((select) => select.value).filter(Boolean));
  selects.forEach((select) => {
    select.querySelectorAll("option").forEach((option) => {
      option.disabled = Boolean(option.value && option.value !== select.value && assigned.has(option.value));
    });
  });
}

function updateRoundSetupTableDeployment(select) {
  const help = select.closest(".field")?.querySelector("[data-round-table-deployment]");
  if (!help) return;
  const deployment = select.selectedOptions[0]?.dataset.deployment || "";
  help.textContent = deployment ? t("tournaments.mission.deployment", { layout: deployment }) : t("admin.roundSetup.deploymentAuto");
}

function roundSetupPayload(form, tournament) {
  const rows = Array.from(form.querySelectorAll(".round-setup-match-row"));
  if (tournament.participantMode === "team") {
    return {
      ...(form.elements["teamKillzone-0"] ? { tables: teamTableSetupPayload(form) } : {}),
      matchups: rows.map((row) => ({
        rosterAId: row.querySelector('[name="rosterAId"]')?.value || "",
        rosterBId: row.querySelector('[name="rosterBId"]')?.value || ""
      }))
    };
  }
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
  if (!window.confirm(t("dialog.admin.deleteTable", { number: table?.tableNumber || "" }))) return;
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
  if (!window.confirm(t("dialog.admin.regenerateSeeds"))) return;
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
  if (!window.confirm(t("dialog.admin.removeParticipant", { name: participant?.displayName || t("dialog.admin.participantFallback") }))) return;
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
  const nextLabel = selected === "light" ? t("common.themeToggle.toDark") : t("common.themeToggle.toLight");
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
  // The label states the CURRENT language; the tooltip states the action.
  button.textContent = selected === "ru" ? "RU" : "EN";
  const label = t("common.langToggle");
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

// index.html ships only the dictionary the visitor is in (theme-boot.js writes
// the tag). The other one is fetched the first time somebody actually switches
// language, which keeps ~60 KB of translations most visitors never read off
// every page load. i18n.js reads both globals through getters, so nothing else
// has to know the dictionary arrived late.
const loadedLocaleScripts = new Map();

function loadLocaleDictionary(locale) {
  const globalName = locale === "ru" ? "TGTV_I18N_RU" : "TGTV_I18N_EN";
  if (typeof window[globalName] !== "undefined") return Promise.resolve();
  if (loadedLocaleScripts.has(locale)) return loadedLocaleScripts.get(locale);

  // Reuse the version marker index.html gave theme-boot.js so a released
  // dictionary is cache-busted exactly like every other asset.
  const boot = document.querySelector('script[src*="theme-boot.js"]');
  const query = boot && boot.src.includes("?") ? boot.src.slice(boot.src.indexOf("?")) : "";
  const pending = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `/i18n/${locale}.js${query}`;
    // Resolve on failure too: a missing dictionary falls back to English keys,
    // which is far better than a toggle that silently does nothing.
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  loadedLocaleScripts.set(locale, pending);
  return pending;
}

function wireLocaleToggle() {
  const button = document.querySelector("[data-lang-toggle]");
  if (!button) return;
  // Start the fetch on hover/focus so the click itself is usually instant.
  const warm = () => loadLocaleDictionary(i18n.getLocale() === "ru" ? "en" : "ru");
  button.addEventListener("pointerenter", warm);
  button.addEventListener("focus", warm);
  button.addEventListener("click", async () => {
    const next = i18n.getLocale() === "ru" ? "en" : "ru";
    try {
      window.localStorage.setItem(I18N_LOCALE_STORAGE_KEY, next);
    } catch {
      // The language still applies to the current page when storage is blocked.
    }
    button.disabled = true;
    try {
      await loadLocaleDictionary(next);
    } finally {
      button.disabled = false;
    }
    applyLocale(next);
    applyTheme(document.documentElement.dataset.theme);
    render();
  });
}

function updateTournamentParticipantModeFields(form) {
  const participantMode = form.querySelector("[data-admin-tournament-participant-mode]")?.value || "individual";
  const isTeam = participantMode === "team";
  const formatSelect = form.querySelector("[data-admin-tournament-format]");
  if (formatSelect) {
    if (isTeam) formatSelect.value = "swiss";
    formatSelect.disabled = isTeam || formatSelect.dataset.modeBaseDisabled === "1";
    formatSelect.setAttribute("aria-disabled", formatSelect.disabled ? "true" : "false");
  }
  form.querySelectorAll("[data-team-mode-field]").forEach((field) => {
    field.hidden = !isTeam;
    field.querySelectorAll("input, select, textarea").forEach((control) => {
      if (control.dataset.modeBaseDisabled === undefined) {
        control.dataset.modeBaseDisabled = control.disabled ? "1" : "0";
      }
      control.disabled = !isTeam || control.dataset.modeBaseDisabled === "1";
    });
  });
  form.querySelectorAll("[data-individual-mode-field]").forEach((field) => {
    field.hidden = isTeam;
  });
  updateTournamentFormatFields(form);
}

async function loadTeamsDashboard(query = "") {
  state.teamsQuery = String(query || "").trim();
  try {
    const data = await api(`/api/teams/dashboard${state.teamsQuery ? `?q=${encodeURIComponent(state.teamsQuery)}` : ""}`);
    state.teamsDashboard = data;
    state.teamsError = "";
    return data;
  } catch (err) {
    state.teamsError = err.message;
    throw err;
  }
}

async function refreshTeamTournamentUi(data, options = {}) {
  if (options.standalone) {
    const matchId = Number(data.teamMatch?.id || state.selectedTeamMatchId);
    const detail = await loadTeamPairing(matchId, { force: true });
    if (["completed", "in_progress"].includes(detail.teamMatch?.phase)) {
      state.teamPairings = state.teamPairings.filter((item) => item.id !== matchId);
    } else {
      const summary = state.teamPairings.find((item) => item.id === matchId);
      if (summary) summary.phase = detail.teamMatch.phase;
    }
    if (isCurrentTeamPairingRoute(matchId)) renderShell();
    return;
  }
  if (options.admin) {
    await loadAdminTournamentDetail(data.tournament.id);
    renderTournaments();
    return;
  }
  await renderPublicTournamentRoute(data.tournament.slug, { force: true });
}

function wireTeamTournamentControls(data, options = {}) {
  stopTeamPairingPoll();
  if (options.admin && document.querySelector("[data-admin-team-roster-save-seeds]")) {
    wireAdminTeamRosterControls(data);
  }
  document.querySelectorAll("[data-team-profile-link]").forEach((button) => {
    button.addEventListener("click", () => navigateToPlayerTeam(button.dataset.teamProfileLink));
  });
  document.querySelectorAll("[data-team-pairing-open]").forEach((button) => {
    button.addEventListener("click", () => openTeamPairing(button.dataset.teamPairingOpen));
  });
  document.querySelectorAll("[data-team-tournament-game]").forEach((button) => {
    button.addEventListener("click", () => openGameDetail(Number(button.dataset.teamTournamentGame)));
  });
  document.querySelectorAll("[data-team-pair-action='roll']").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await api(`/api/tournaments/${data.tournament.id}/team-matches/${button.dataset.teamMatchId}/roll`, { method: "POST", body: { rollRound: Number(button.dataset.rollRound), side: button.dataset.side } });
        await refreshTeamTournamentUi(data, options);
      } catch (err) { setMessage(err.message, true); button.disabled = false; }
    });
  });
  document.querySelectorAll("[data-team-pairing-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const action = form.dataset.teamPairingForm;
      const body = { side: form.dataset.side };
      if (action === "ban") body.mission = form.elements.mission.value;
      if (action === "shield" || action === "sword") body.memberId = Number(form.elements.memberId.value);
      if (action === "environment") {
        body.step = Number(form.dataset.step || 0);
        if (form.elements.mission) body.mission = form.elements.mission.value;
        if (form.elements.tableId) body.tableId = Number(form.elements.tableId.value);
      }
      try {
        form.querySelector('[type="submit"]').disabled = true;
        await api(`/api/tournaments/${data.tournament.id}/team-matches/${form.dataset.teamMatchId}/${action}`, { method: "POST", body });
        await refreshTeamTournamentUi(data, options);
      } catch (err) { setMessage(err.message, true); form.querySelector('[type="submit"]').disabled = false; }
    });
  });
  document.querySelectorAll("[data-team-match-reset]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm(t("teams.pairing.resetConfirm"))) return;
      button.disabled = true;
      try {
        const phase = document.querySelector(`[data-team-match-reset-phase="${button.dataset.teamMatchReset}"]`)?.value || "awaiting_roll";
        await api(`/api/admin/tournaments/${data.tournament.id}/team-matches/${button.dataset.teamMatchReset}/reset`, { method: "POST", body: { phase, confirmResultsReset: true } });
        await refreshTeamTournamentUi(data, options);
      } catch (err) { setMessage(err.message, true); }
      finally { if (button.isConnected) button.disabled = false; }
    });
  });
  document.querySelectorAll("[data-team-pairings-override]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const pairings = [1, 2, 3].map((slot) => ({
        rosterAMemberId: Number(form.elements[`pair-a-${slot}`].value),
        rosterBMemberId: Number(form.elements[`pair-b-${slot}`].value)
      }));
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await api(`/api/admin/tournaments/${data.tournament.id}/team-matches/${form.dataset.teamPairingsOverride}/pairings`, { method: "PATCH", body: { pairings } });
        await refreshTeamTournamentUi(data, options);
      } catch (err) { setMessage(err.message, true); }
      finally { if (button.isConnected) button.disabled = false; }
    });
  });

  if (options.standalone) {
    const match = data.teamMatch;
    if (match && match.phase !== "completed" && data.tournament.status === "in_progress") {
      scheduleTeamPairingScreenPoll(match.id);
    }
    return;
  }

  if (!options.admin) {
    const waiting = (data.teamMatches || []).length > 0;
    if (waiting && data.tournament.status === "in_progress" && (data.teamMatches || []).some((match) => match.phase !== "completed")) {
      scheduleTeamPairingPoll(data.tournament.slug);
    }
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
      if (!window.confirm(t("teams.tournament.withdrawConfirm"))) return;
      try {
        await api(`/api/tournaments/${data.tournament.id}/rosters/${button.dataset.adminTeamRosterWithdraw}/withdraw`, { method: "POST" });
        await refreshTeamTournamentUi(data, { admin: true });
      } catch (err) { setMessage(err.message, true); }
    });
  });
}

async function loadPlayerTeam(slug, options = {}) {
  if (!options.force && state.teamProfile?.team?.slug === slug) return state.teamProfile;
  const data = await api(`/api/teams/${encodeURIComponent(slug)}`);
  state.teamProfile = data;
  return data;
}

function playerTeamContainer() {
  if (!state.me) return app;
  state.view = "teams";
  if (!document.querySelector("[data-content]")) renderShell();
  return document.querySelector("[data-content]");
}

async function renderPlayerTeamRoute(slug, options = {}) {
  const container = playerTeamContainer();
  container.innerHTML = `<div class="loading">${t("teams.loading")}</div>`;
  try {
    const data = await loadPlayerTeam(slug, options);
    renderPlayerTeamProfile(data);
  } catch (err) {
    container.innerHTML = `<section class="card panel"><h2>${t("teams.notFound")}</h2><p class="muted">${escapeHtml(err.message)}</p></section>`;
  }
}

function renderTeams() {
  const content = document.querySelector("[data-content]");
  if (state.teamProfile?.team) {
    renderPlayerTeamProfile(state.teamProfile);
    return;
  }
  const tabs = pageTabs("teams", [
    { id: "mine", label: t("nav.playerTeams") },
    { id: "admin", label: t("teams.admin.tab") }
  ], state.teamsTab);
  if (state.teamsTab === "admin" && state.me?.isAdmin) {
    content.innerHTML = tabs + adminTeamsPanel();
    wirePageTabs();
    wireAdminTeams();
    return;
  }
  const data = state.teamsDashboard || { myTeams: [], incomingInvitations: [], outgoingInvitations: [], teams: [] };
  const teamsQuery = String(state.teamsQuery || "").trim();
  content.innerHTML = `
    ${tabs}
    <div class="teams-layout">
      <div class="teams-page-actions">
        <button class="primary-button" type="button" data-team-create-open>${t("teams.create.title")}</button>
      </div>
      <section class="card panel">
        <form class="teams-search" data-teams-search>
          <div class="field"><label for="teams-search">${t("teams.search.label")}</label><input id="teams-search" name="q" value="${escapeHtml(teamsQuery)}" placeholder="${t("teams.search.placeholder")}"></div>
          <button class="small-button" type="submit">${t("teams.search.submit")}</button>
        </form>
        ${teamsQuery ? `<div class="list">${playerTeamCards(data.teams || [])}</div>` : ""}
      </section>
      <section class="card panel">
        <h3>${t("teams.mine.title")}</h3>
        <div class="list">${playerTeamCards(data.myTeams || [], t("teams.mine.empty"))}</div>
      </section>
      <section class="card panel">
        <h3>${t("teams.invitations.incoming")}</h3>
        <div class="list">${teamInvitationCards(data.incomingInvitations || [], "incoming")}</div>
        <h3>${t("teams.invitations.outgoing")}</h3>
        <div class="list">${teamInvitationCards(data.outgoingInvitations || [], "outgoing")}</div>
      </section>
      <div class="message ${state.teamsError ? "error" : ""}" data-message>${escapeHtml(state.teamsError || "")}</div>
    </div>`;
  wireTeamsDashboard();
  wirePageTabs();
  if (state.focusInvitationId) {
    focusNotificationTarget(`[data-invitation-card="${state.focusInvitationId}"]`);
  }
}

function playerTeamCards(teams, empty = t("teams.list.empty")) {
  if (!teams.length) return `<div class="empty">${empty}</div>`;
  return teams.map((team) => `
    <div class="row-card compact-row-card">
      <div class="row-main">
        <div class="row-title">${escapeHtml(team.name)}</div>
        <div class="row-meta">${t("teams.card.members", { count: team.memberCount ?? 0 })} / ${t("teams.card.elo", { tts: team.ratings?.tts ?? 1000, irl: team.ratings?.irl ?? 1000 })}</div>
      </div>
      <div class="row-actions">
        ${team.archivedAt ? `<span class="status">${t("teams.status.archived")}</span>` : ""}
        <button class="small-button" data-team-open="${escapeHtml(team.slug)}">${t("common.open")}</button>
      </div>
    </div>`).join("");
}

function teamInvitationCards(invitations, direction) {
  if (!invitations.length) return `<div class="empty">${t("teams.invitations.empty")}</div>`;
  return invitations.map((invitation) => {
    const focused = direction === "incoming" && Number(state.focusInvitationId) === Number(invitation.id);
    return `
    <div class="row-card compact-row-card ${focused ? "notification-target-highlight" : ""}" data-invitation-card="${invitation.id}" tabindex="-1">
      <div class="row-main"><div class="row-title">${escapeHtml(invitation.team?.name || "")}</div><div class="row-meta">${direction === "incoming" ? escapeHtml(invitation.invitedBy?.name || "") : escapeHtml(invitation.invitee?.name || "")}</div></div>
      <div class="row-actions">
        ${direction === "incoming" ? `<button class="primary-button" data-invitation-action="accept" data-invitation-id="${invitation.id}">${t("teams.invitations.accept")}</button><button class="small-button" data-invitation-action="decline" data-invitation-id="${invitation.id}">${t("teams.invitations.decline")}</button>` : `<button class="danger-button" data-invitation-action="revoke" data-invitation-id="${invitation.id}">${t("teams.invitations.revoke")}</button>`}
      </div>
    </div>`;
  }).join("");
}

async function teamLogoFromForm(form) {
  if (form.elements.removeLogo?.checked) return null;
  const file = form.elements.logo?.files?.[0];
  return file ? compressAvatar(file) : undefined;
}

function openTeamCreator() {
  const dialog = document.createElement("dialog");
  dialog.className = "tiebreaker-help-dialog team-roster-editor-dialog";
  dialog.innerHTML = `<form class="tiebreaker-help-content" data-team-create-dialog>
    <div class="tiebreaker-help-header"><div><h3>${t("teams.create.title")}</h3></div><button class="dialog-close-button" type="button" data-team-create-close aria-label="${t("common.close")}">&times;</button></div>
    <div class="field"><label>${t("teams.field.name")}</label><input name="name" minlength="2" maxlength="80" required></div>
    ${markdownEditorField({ name: "description", label: t("teams.field.description"), rows: 10 })}
    <div class="field"><label>${t("teams.field.logo")}</label><input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
    <div class="message" data-team-create-message></div>
    <div class="row-actions"><button class="small-button" type="button" data-team-create-cancel>${t("common.cancel")}</button><button class="primary-button" type="submit">${t("teams.create.submit")}</button></div>
  </form>`;
  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.querySelector("[data-team-create-close]")?.addEventListener("click", close);
  dialog.querySelector("[data-team-create-cancel]")?.addEventListener("click", close);
  const form = dialog.querySelector("[data-team-create-dialog]");
  wireMarkdownEditors(form);
  const message = form.querySelector("[data-team-create-message]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    message.textContent = "";
    message.classList.remove("error");
    try {
      const data = await api("/api/teams", { method: "POST", body: {
        name: form.elements.name.value,
        description: form.elements.description.value,
        logoData: await teamLogoFromForm(form)
      } });
      close();
      state.teamsQuery = "";
      navigateToPlayerTeam(data.team.slug);
    } catch (err) {
      message.textContent = err.message;
      message.classList.add("error");
      submit.disabled = false;
    }
  });
  dialog.showModal();
  form.elements.name.focus();
}

function wireTeamsDashboard() {
  wireTeamLinks();
  document.querySelector("[data-team-create-open]")?.addEventListener("click", openTeamCreator);
  document.querySelector("[data-teams-search]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadTeamsDashboard(String(new FormData(event.currentTarget).get("q") || ""));
    renderTeams();
  });
  document.querySelectorAll("[data-invitation-action]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await api(`/api/team-invitations/${button.dataset.invitationId}/${button.dataset.invitationAction}`, { method: "POST" });
      await loadTeamsDashboard();
      if (Number(state.focusInvitationId) === Number(button.dataset.invitationId)) {
        state.focusInvitationId = null;
        syncAppHash({ replace: true });
      }
      await loadNotifications();
      renderTeams();
    } catch (err) { setMessage(err.message, true); }
  }));
}

function renderPlayerTeamProfile(data) {
  state.teamProfile = data;
  const team = data.team || {};
  const current = data.currentMembers || [];
  const former = data.formerMembers || [];
  const canManage = Boolean(state.me && (team.viewer?.canAdmin || (team.viewer?.isLeader && !team.archivedAt)));
  const container = playerTeamContainer();
  container.innerHTML = `
    <div class="public-tournament-layout ${state.me ? "embedded-public-tournament" : ""}">
      <section class="card panel">
        <div class="panel-header">
          <div class="team-hero">${team.logoData ? `<img class="team-logo" src="${team.logoData}" alt="${t("teams.logoAlt", { name: escapeHtml(team.name) })}">` : `<span class="mark">${escapeHtml(String(team.name || "?").slice(0, 2).toUpperCase())}</span>`}<div><h2>${escapeHtml(team.name || "")}</h2><p class="muted">${team.archivedAt ? t("teams.status.archived") : fmtDate(team.createdAt)}</p></div></div>
          <div class="row-actions"><button class="small-button" data-team-back>${t("common.back")}</button>${!state.me ? `<button class="primary-button" data-team-login>${t("auth.tab.signIn")}</button>` : ""}</div>
        </div>
        ${team.description ? `<div class="markdown-content">${markdownToHtml(team.description)}</div>` : ""}
        <div class="profile-grid">${metricCard(t("teams.rating.tts"), team.ratings?.tts ?? 1000)}${metricCard(t("teams.rating.irl"), team.ratings?.irl ?? 1000)}${metricCard(t("teams.metric.tournaments"), data.stats?.tournaments ?? 0)}${metricCard(t("teams.metric.rosters"), data.stats?.rosters ?? 0)}${metricCard(t("teams.metric.record"), `${data.stats?.wins ?? 0}-${data.stats?.draws ?? 0}-${Math.max(0, Number(data.stats?.team_matches || 0) - Number(data.stats?.wins || 0) - Number(data.stats?.draws || 0))}`)}</div>
      </section>
      <section class="card panel"><h3>${t("teams.members.current")}</h3><div class="list">${teamMemberCards(current, team, canManage)}</div><h3>${t("teams.members.former")}</h3><div class="list">${teamMemberCards(former, team, false)}</div></section>
      ${canManage ? teamManagementPanel(data) : ""}
      <section class="card panel"><h3>${t("teams.history.tournaments")}</h3><div class="list">${teamRosterHistory(data.rosters || [])}</div></section>
      <section class="card panel"><h3>${t("teams.history.games")}</h3><div class="list">${teamGameHistory(data.recentGames || [])}</div></section>
      ${state.me && team.viewer?.isMember ? `<section class="card panel"><button class="danger-button" data-team-leave="${team.id}">${t("teams.action.leave")}</button></section>` : ""}
      <div class="message" data-message></div>
    </div>`;
  wirePlayerTeamProfile(data);
}

function teamMemberCards(members, team, canManage) {
  if (!members.length) return `<div class="empty">${t("teams.members.empty")}</div>`;
  return members.map((membership) => `
    <div class="row-card compact-row-card"><div class="row-main"><div class="row-title">${escapeHtml(membership.user?.name || membership.displayNameSnapshot)}</div><div class="row-meta">${membership.role === "leader" ? t("teams.role.leader") : t("teams.role.member")} / ${fmtDate(membership.joinedAt)}${membership.endedAt ? ` - ${fmtDate(membership.endedAt)}` : ""}</div></div><div class="row-actions">${state.me && membership.userId ? `<button class="small-button" data-team-player="${membership.userId}">${t("common.open")}</button>` : ""}${canManage && (membership.role !== "leader" || team.viewer?.canAdmin) && !membership.endedAt ? `<button class="danger-button" data-team-member-remove="${membership.id}">${t("teams.action.remove")}</button>` : ""}</div></div>`).join("");
}

function teamRosterHistory(rosters) {
  if (!rosters.length) return `<div class="empty">${t("teams.history.empty")}</div>`;
  return rosters.map((roster) => `<div class="row-card compact-row-card"><div class="row-main"><div class="row-title">${escapeHtml(roster.name)}</div><div class="row-meta">${escapeHtml(roster.tournament?.name || "")} / ${t("teams.roster.seed", { seed: roster.seed || "-" })} / ${escapeHtml(teamRosterStatusLabel(roster.status))}</div>${activeRosterMembersForUi(roster).map((member) => `${escapeHtml(member.displayNameSnapshot)} (${escapeHtml(member.factionSnapshot)})${member.userId === roster.captainUserId ? ` — ${t("teams.role.captain")}` : ""}`).join("<br>")}</div>${roster.tournament?.slug ? `<button class="small-button" data-team-tournament="${escapeHtml(roster.tournament.slug)}">${t("common.open")}</button>` : ""}</div>`).join("");
}

function activeRosterMembersForUi(roster) {
  return (roster.members || []).filter((member) => !member.endedAt);
}

function teamGameHistory(games) {
  if (!games.length) return `<div class="empty">${t("teams.history.empty")}</div>`;
  return games.map((game) => `<div class="row-card compact-row-card"><div class="row-main"><div class="row-title">${escapeHtml(game.tournament?.name || "")}</div><div class="row-meta">${t("tournaments.round.title", { number: game.roundNumber })} / ${escapeHtml(game.rosterA?.name || "")} vs ${escapeHtml(game.rosterB?.name || "")}</div></div>${state.me ? `<button class="small-button" data-team-game="${game.id}">${t("common.open")}</button>` : ""}</div>`).join("");
}

function teamManagementPanel(data) {
  const team = data.team;
  const current = data.currentMembers || [];
  const memberIds = new Set(current.map((membership) => membership.userId));
  const inviteCandidates = (state.users || []).filter((user) => !memberIds.has(user.id));
  return `<section class="card panel"><h3>${t("teams.manage.title")}</h3>
    <form data-team-edit>
      <div class="field"><label for="team-edit-name">${t("teams.field.name")}</label><input id="team-edit-name" name="name" minlength="2" maxlength="80" value="${escapeHtml(team.name || "")}" required></div>
      ${markdownEditorField({ name: "description", label: t("teams.field.description"), value: team.description || "", rows: 10 })}
      <div class="field"><label for="team-edit-logo">${t("teams.field.logo")}</label><input id="team-edit-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
      ${team.logoData ? `<label class="checkbox-field"><input name="removeLogo" type="checkbox">${t("teams.field.removeLogo")}</label>` : ""}
      <button class="small-button" type="submit">${t("common.save")}</button>
    </form>
    ${!team.archivedAt ? `<form data-team-invite><div class="field"><label for="team-invite-user">${t("teams.invite.player")}</label><select id="team-invite-user" name="userId" required><option value="">${t("teams.invite.choose")}</option>${inviteCandidates.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join("")}</select></div><button class="small-button" type="submit">${t("teams.invite.submit")}</button></form>` : ""}
    <form data-team-leadership><div class="field"><label for="team-leader-user">${t("teams.leadership.label")}</label><select id="team-leader-user" name="userId" required><option value="">${t("teams.invite.choose")}</option>${current.filter((membership) => membership.role !== "leader" && membership.userId).map((membership) => `<option value="${membership.userId}">${escapeHtml(membership.user?.name || membership.displayNameSnapshot)}</option>`).join("")}</select></div><button class="small-button" type="submit">${t("teams.leadership.submit")}</button></form>
    <div class="row-actions">${team.archivedAt && team.viewer?.canAdmin ? `<button class="small-button" data-team-restore="${team.id}">${t("teams.action.restore")}</button>` : !team.archivedAt ? `<button class="danger-button" data-team-archive="${team.id}">${t("teams.action.archive")}</button>` : ""}</div>
  </section>`;
}

function wirePlayerTeamProfile(data) {
  const team = data.team;
  wireMarkdownEditors();
  document.querySelector("[data-team-back]")?.addEventListener("click", async () => {
    clearPlayerTeamRoute();
    if (!state.me) return render();
    state.teamProfile = null;
    if (state.teamReturnHash) {
      window.history.replaceState(null, "", state.teamReturnHash);
      state.teamReturnHash = "";
      await applyAppRouteFromHash();
      renderShell();
      return;
    }
    state.teamsTab = "mine";
    await loadTeamsDashboard();
    syncAppHash({ replace: true });
    renderShell();
  });
  document.querySelector("[data-team-login]")?.addEventListener("click", () => { state.authMode = "login"; clearPlayerTeamRoute(); render(); });
  document.querySelectorAll("[data-team-player]").forEach((button) => button.addEventListener("click", () => openPlayerProfile(Number(button.dataset.teamPlayer))));
  document.querySelectorAll("[data-team-tournament]").forEach((button) => button.addEventListener("click", () => navigateToPublicTournament(button.dataset.teamTournament)));
  document.querySelectorAll("[data-team-game]").forEach((button) => button.addEventListener("click", () => openGameDetail(Number(button.dataset.teamGame))));
  document.querySelector("[data-team-edit]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api(`/api/teams/${team.id}`, { method: "PATCH", body: { name: form.elements.name.value, description: form.elements.description.value, logoData: await teamLogoFromForm(form) } });
      await renderPlayerTeamRoute(team.slug, { force: true });
    } catch (err) { setMessage(err.message, true); }
  });
  document.querySelector("[data-team-invite]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api(`/api/teams/${team.id}/invitations`, { method: "POST", body: { userId: Number(event.currentTarget.elements.userId.value) } }); setMessage(t("teams.message.invited")); }
    catch (err) { setMessage(err.message, true); }
  });
  document.querySelector("[data-team-leadership]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await api(`/api/teams/${team.id}/leadership`, { method: "POST", body: { userId: Number(event.currentTarget.elements.userId.value) } }); await renderPlayerTeamRoute(team.slug, { force: true }); }
    catch (err) { setMessage(err.message, true); }
  });
  document.querySelectorAll("[data-team-member-remove]").forEach((button) => button.addEventListener("click", async () => {
    const member = data.currentMembers.find((item) => item.id === Number(button.dataset.teamMemberRemove));
    if (!window.confirm(t("teams.dialog.remove", { name: member?.user?.name || member?.displayNameSnapshot || "" }))) return;
    try { await api(`/api/teams/${team.id}/members/${button.dataset.teamMemberRemove}/remove`, { method: "POST" }); await renderPlayerTeamRoute(team.slug, { force: true }); }
    catch (err) { setMessage(err.message, true); }
  }));
  document.querySelector("[data-team-leave]")?.addEventListener("click", async () => {
    if (!window.confirm(t("teams.dialog.leave"))) return;
    try { await api(`/api/teams/${team.id}/leave`, { method: "POST" }); clearPlayerTeamRoute(); state.teamProfile = null; await loadTeamsDashboard(); renderShell(); }
    catch (err) { setMessage(err.message, true); }
  });
  document.querySelector("[data-team-archive]")?.addEventListener("click", async () => {
    if (!window.confirm(t("teams.dialog.archive"))) return;
    try { await api(`/api/teams/${team.id}/archive`, { method: "POST" }); await renderPlayerTeamRoute(team.slug, { force: true }); }
    catch (err) { setMessage(err.message, true); }
  });
  document.querySelector("[data-team-restore]")?.addEventListener("click", async () => {
    try { await api(`/api/admin/teams/${team.id}/restore`, { method: "POST" }); await renderPlayerTeamRoute(team.slug, { force: true }); }
    catch (err) { setMessage(err.message, true); }
  });
}

applyLocale(savedLocalePreference());
wireLocaleToggle();
applyTheme(savedThemePreference());
wireThemeToggle();
wireNotificationControl();
boot();

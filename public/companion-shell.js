(function () {
  "use strict";
  const sites = window.KT_SITES || { subdomains: false, urls: {
    home: "/", initiative: "/initiative", tracker: "/tracker",
    tournament: "/tournament", studio: "/studio", dice: "/dice"
  } };
  const serviceUrl = name => new URL(sites.urls[name], location.origin).href;
  const path = location.pathname;
  const active = document.body.dataset.companionSection || sites.current ||
    (path.includes("initiative") ? "initiative" : path.includes("activation") ? "tracker" :
      path.startsWith("/tournament") || path.startsWith("/teams/") || path === "/index.html" ? "tournament" : "home");
  if (active === "home" && location.hash) {
    location.replace(serviceUrl("tournament") + location.search + location.hash);
    return;
  }
  for (const link of document.querySelectorAll("[data-companion-service]")) link.href = serviceUrl(link.dataset.companionService);
  let user;
  let tournamentHeader;
  const accounts = [];
  const mounts = [...document.querySelectorAll("[data-companion-nav]")];
  for (const mount of mounts) {
    mount.className = "companion-utility";
    const brand = document.createElement("div");
    brand.className = "companion-service-brand";
    const home = document.createElement("a"); home.className = "companion-logo-link";
    home.href = serviceUrl("home"); home.setAttribute("aria-label", "На главную KT Companion"); home.title = "На главную KT Companion";
    const logo = document.createElement("img"); logo.src = "/logo.webp"; logo.alt = ""; logo.width = 32; logo.height = 32;
    home.append(logo);
    const title = document.createElement(active === "home" ? "span" : "a");
    title.className = "companion-service-link";
    if (active !== "home") title.href = serviceUrl(active) + (active === "studio" ? "#/library" : active === "tournament" ? "#/mygames" : "");
    if (["initiative", "tracker"].includes(active)) title.addEventListener("click", event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !window.KTCalculator) return;
      event.preventDefault(); window.KTCalculator.reset();
      document.querySelectorAll(".page-shell details[open]").forEach(details => { details.open = false; });
      window.scrollTo(0, 0);
    });
    title.textContent = ({ home: "KT Companion", tournament: "Турнирная система", initiative: "Калькулятор инициативы", tracker: "Трекер активаций", studio: "КТ Студия", dice: "Кубики D6" })[active] || "KT Companion";
    brand.append(home, title); mount.append(brand);
    const controls = document.createElement("div"); controls.className = "companion-tools"; mount.append(controls);
    if (window.KTAppearance) {
      const language = document.createElement("button"); language.type = "button"; language.dataset.langToggle = "";
      const theme = document.createElement("div"); theme.className = "companion-theme-switch"; theme.setAttribute("role", "group");
      const themeButtons = [];
      const icons = {
        light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
        dark: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>'
      };
      for (const value of ["light", "dark"]) {
        const button = document.createElement("button"); button.type = "button"; button.className = "companion-theme-button"; button.dataset.themeChoice = value;
        button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[value] + '</svg>';
        button.addEventListener("click", () => window.KTAppearance.setTheme(value));
        themeButtons.push(button); theme.append(button);
      }
      function syncAppearance() {
        language.textContent = window.KTAppearance.locale.toUpperCase();
        language.setAttribute("aria-label", window.KTAppearance.locale === "ru" ? "Switch to English" : "Переключить на русский");
        language.title = language.getAttribute("aria-label");
        theme.setAttribute("aria-label", window.KTAppearance.locale === "ru" ? "Тема оформления" : "Color theme");
        for (const button of themeButtons) {
          const light = button.dataset.themeChoice === "light";
          const label = window.KTAppearance.locale === "ru" ? (light ? "Светлая тема" : "Тёмная тема") : (light ? "Light theme" : "Dark theme");
          button.setAttribute("aria-label", label); button.title = label;
          button.setAttribute("aria-pressed", String(window.KTAppearance.theme === button.dataset.themeChoice));
        }
      }
      language.addEventListener("click", () => window.KTAppearance.setLocale(window.KTAppearance.locale === "ru" ? "en" : "ru"));
      window.addEventListener("kt:appearance", syncAppearance); syncAppearance(); controls.append(language, theme);
    }
    {
      const account = document.createElement("div");
      account.className = "companion-account";
      controls.append(account);
      accounts.push(account);
    }
  }
  if (mounts[0]) {
    if (active === "tournament") {
      const menu = document.createElement("div"); menu.className = "companion-tournament-menu"; menu.hidden = true;
      const profile = document.createElement("div"); profile.className = "companion-tournament-profile"; profile.hidden = true;
      mounts[0].querySelector(".companion-service-brand").prepend(menu);
      mounts[0].insertBefore(profile, mounts[0].querySelector(".companion-tools"));
      tournamentHeader = { mount: mounts[0], menu, profile };
    }
    const notifications = document.querySelector(".floating-controls");
    if (notifications) {
      notifications.className = "companion-notifications";
      (tournamentHeader ? mounts[0] : mounts[0].querySelector(".companion-tools")).append(notifications);
    }
    const updateHeight = () => document.documentElement.style.setProperty("--companion-bar-height", mounts[0].offsetHeight + "px");
    updateHeight();
    new ResizeObserver(updateHeight).observe(mounts[0]);
  }
  function loginUrl(next = location.href) {
    const destination = new URL(serviceUrl("tournament"));
    destination.searchParams.set("next", new URL(next, location.origin).href);
    return destination.href;
  }
  function setTournamentHeader(profile = null, menu = null) {
    if (!tournamentHeader) return false;
    tournamentHeader.profile.replaceChildren(...(profile ? [profile] : []));
    tournamentHeader.menu.replaceChildren(...(menu ? [menu] : []));
    tournamentHeader.profile.hidden = !profile;
    tournamentHeader.menu.hidden = !menu;
    tournamentHeader.mount.classList.toggle("companion-tournament-header", Boolean(profile));
    return true;
  }
  function setUser(value) {
    user = value;
    if (!user) setTournamentHeader();
    for (const account of accounts) {
      account.replaceChildren();
      const link = document.createElement("a");
      link.href = user ? serviceUrl("tournament") + "#/profile" : loginUrl();
      link.textContent = user ? user.name : "Войти";
      if (user) link.dataset.uiSkip = "";
      account.append(link);
      if (user) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Выйти";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await window.KTCommunity?.flush?.();
            const response = await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
            if (!response.ok) throw Error("Не удалось выйти. Повторите попытку.");
            changed();
            location.reload();
          } catch (error) { button.disabled = false; button.textContent = error.message; }
        });
        account.append(button);
      }
    }
  }
  function changed() {
    try { localStorage.setItem("kt-companion-session-change", Date.now() + ":" + Math.random()); } catch {}
  }
  async function session() {
    const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw Error("Не удалось проверить вход. Обновите страницу.");
    const result = await response.json();
    const changedAccount = user !== undefined && (user?.id ?? null) !== (result.user?.id ?? null);
    setUser(result.user);
    if ((window.KTAccount?.id != null && String(result.user?.id) !== String(window.KTAccount.id)) ||
        (active === "tournament" && changedAccount)) location.reload();
    return result;
  }
  function returnAfterLogin() {
    const next = new URLSearchParams(location.search).get("next");
    if (!next || !user) return false;
    try {
      const target = new URL(next, location.origin);
      const origins = Object.keys(sites.urls).map(name => new URL(serviceUrl(name)).origin);
      // Exact configured origins only; never accept a wildcard suffix.
      if (!origins.includes(target.origin) || target.username || target.password) return false;
      target.searchParams.delete("next");
      location.replace(target.href);
      return true;
    } catch { return false; }
  }
  const ready = session();
  ready.catch(() => {
    // The tournament's /api/me may already have supplied a valid account.
    if (user !== undefined) return;
    setUser(null);
    for (const account of accounts) account.querySelector("a").textContent = "Войти / проверить вход";
  });
  window.KTCompanion = { ready, session, setUser, changed, loginUrl, returnAfterLogin, serviceUrl, setTournamentHeader };
  const exports = document.querySelector(".studio-export-menu");
  if (exports) {
    document.addEventListener("click", event => {
      if (!exports.contains(event.target) || event.target.closest(".studio-export-options button")) exports.open = false;
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && exports.open) { exports.open = false; exports.querySelector("summary").focus(); }
    });
  }
  window.addEventListener("storage", event => {
    if (event.key === "kt-companion-session-change") {
      if (active === "tournament" || (active === "studio" && window.KTAccount?.id != null)) location.reload();
      else void session().catch(() => {});
    }
  });
  window.addEventListener("focus", () => { void session().catch(() => {}); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void session().catch(() => {});
  });
  window.addEventListener("pageshow", event => {
    if (event.persisted) void session().catch(() => {});
  });
})();

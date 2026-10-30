(function () {
  "use strict";
  function brandLogoUrl(kind = "mark") {
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    return `/brand/kt-companion/${kind}-${theme}.png`;
  }
  function syncBrandLogos() {
    for (const image of document.querySelectorAll("img[data-companion-logo]")) {
      image.src = brandLogoUrl(image.dataset.companionLogo);
    }
  }
  window.addEventListener("kt:appearance", syncBrandLogos);
  syncBrandLogos();
  const sites = window.KT_SITES || { subdomains: false, urls: {
    home: "/", initiative: "/initiative", tracker: "/tracker",
    tournament: "/tournament", studio: "/studio", dice: "/dice", faq: "/faq", combat: "/combat", training: "/knowthykt"
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
    const logo = document.createElement("img"); logo.dataset.companionLogo = "mark"; logo.src = brandLogoUrl(); logo.alt = ""; logo.width = 56; logo.height = 50;
    home.append(logo);
    const title = document.createElement("a");
    title.className = "companion-service-link";
    title.href = active === "account" ? "/account" : serviceUrl(active) + (active === "studio" ? "#/library" : active === "tournament" ? "#/leaderboard" : "");
    const name = document.createElement("span"); name.className = "companion-service-name";
    name.textContent = "KT COMPANION";
    title.append(name);
    const label = ({ account: "Почта и доступ", tournament: "Турнирная система", initiative: "Калькулятор инициативы", tracker: "Трекер активаций", studio: "КТ Студия", dice: "Dice Generator", faq: "TTS Community FAQ", combat: "Combat Lab", training: "Know Thy Kill Team" })[active];
    if (label) {
      const tool = document.createElement("small"); tool.className = "companion-service-tool";
      tool.textContent = label; title.append(tool);
    }
    brand.append(home, title); mount.append(brand);
    const bar = document.createElement("div"); bar.className = "companion-account-bar";
    const profile = document.createElement("div"); profile.className = "companion-profile-slot"; profile.hidden = true;
    const controls = document.createElement("div"); controls.className = "companion-tools";
    bar.append(profile, controls); mount.append(bar);
    const status = document.createElement('span'); status.className = 'companion-account-status'; status.setAttribute('role','status'); bar.append(status);
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
      const profile = mounts[0].querySelector(".companion-profile-slot");
      mounts[0].querySelector(".companion-service-brand").prepend(menu);
      tournamentHeader = { mount: mounts[0], menu, profile };
    }
    const notifications = document.querySelector(".floating-controls");
    if (notifications) {
      notifications.className = "companion-notifications";
      mounts[0].querySelector(".companion-tools").append(notifications);
    }
    const updateHeight = () => document.documentElement.style.setProperty("--companion-bar-height", mounts[0].offsetHeight + "px");
    updateHeight();
    new ResizeObserver(updateHeight).observe(mounts[0]);
  }
  function loginUrl(next = location.href) {
    const destination = new URL('/account', location.origin);
    destination.searchParams.set("next", new URL(next, location.origin).href);
    return destination.href;
  }
  function setTournamentHeader(profile = null, menu = null) {
    if (!tournamentHeader) return false;
    profile?.classList.add("companion-profile");
    if (profile) {
      const name = profile.querySelector('.tournament-header-name');
      if (name) name.title = name.textContent;
      const image = profile.querySelector('.avatar-button img');
      image?.addEventListener('error', () => {
        const initials = String(name?.textContent || 'KT').trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0] || '').join('').toUpperCase();
        image.parentElement?.replaceChildren(document.createTextNode(initials));
      }, { once:true });
    }
    tournamentHeader.profile.replaceChildren(...(profile ? [profile] : []));
    tournamentHeader.menu.replaceChildren(...(menu ? [menu] : []));
    tournamentHeader.profile.hidden = !profile;
    tournamentHeader.menu.hidden = !menu;
    tournamentHeader.mount.classList.toggle("companion-tournament-header", Boolean(profile));
    return true;
  }
  function setUser(value) {
    const previousId = user?.id;
    user = value;
    if (active === "tournament") {
      for (const link of document.querySelectorAll('.companion-service-link')) link.href = serviceUrl('tournament') + (user ? '#/mygames' : '#/leaderboard');
    }
    if (!user) setTournamentHeader();
    for (const account of accounts) {
      account.replaceChildren();
      const slot = account.closest('.companion-account-bar').querySelector('.companion-profile-slot');
      // Preserve the tournament's in-app profile link and its navigation handler.
      if (!user || active !== 'tournament' || previousId !== user.id || !slot.querySelector('[data-header-profile]')) {
        slot.replaceChildren(); slot.hidden = !user;
        if (user) {
          const profile = document.createElement('a'); profile.className = 'companion-profile';
          profile.href = serviceUrl('tournament') + '#/profile'; profile.dataset.uiSkip = '';
          const avatar = document.createElement('span'); avatar.className = 'companion-avatar'; avatar.setAttribute('aria-hidden', 'true');
          const initials = String(user.name || 'KT').trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0] || '').join('').toUpperCase() || 'KT';
          avatar.textContent = initials;
          if (user.avatarUrl) {
            const image = document.createElement('img'); image.alt = ''; image.decoding = 'async';
            image.addEventListener('error',()=>avatar.replaceChildren(document.createTextNode(initials)),{once:true});
            image.src = user.avatarUrl; avatar.replaceChildren(image);
          }
          const name = document.createElement('span'); name.className = 'companion-profile-name'; name.textContent = user.name; name.title = user.name;
          profile.append(avatar, name);
          const rating = user.ratings?.combined ?? user.rating;
          if (rating != null && Number.isFinite(Number(rating))) {
            const badge = document.createElement('span'); badge.className = 'companion-rating'; badge.textContent = 'MMR ' + Number(rating); profile.append(badge);
          }
          slot.append(profile);
        }
      }
      if (!user) {
        const link = document.createElement('a'); link.className = 'companion-login'; link.href = loginUrl(); link.textContent = 'Войти'; account.append(link);
      }
      if (user) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Выйти";
        button.addEventListener("click", async () => {
          const status = account.closest('.companion-account-bar').querySelector('.companion-account-status');
          status.textContent = '';
          button.disabled = true;
          try {
            await window.KTCommunity?.flush?.();
            const response = await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
            if (!response.ok) throw Error("Не удалось выйти. Повторите попытку.");
            changed();
            location.reload();
          } catch (error) { button.disabled = false; status.textContent = error.message; }
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
    const changedFAQAccess = active === "faq" && user !== undefined &&
      ["isAdmin", "isSuperAdmin", "isFAQModerator"].some(flag => Boolean(user?.[flag]) !== Boolean(result.user?.[flag]));
    setUser(result.user);
    if ((window.KTAccount?.id != null && String(result.user?.id) !== String(window.KTAccount.id)) ||
        (["tournament", "faq", "training"].includes(active) && changedAccount) || changedFAQAccess) location.reload();
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
    for (const account of accounts) account.closest('.companion-account-bar').querySelector('.companion-account-status').textContent = "Не удалось проверить вход. Обновите страницу.";
  });
  window.KTCompanion = { ready, session, setUser, changed, loginUrl, returnAfterLogin, serviceUrl, setTournamentHeader, brandLogoUrl };
  if (active !== 'tournament' && mounts[0]) {
    const script = document.createElement('script'); script.src='/companion-notifications.js?v=shared-8b51f3d2bb3c'; document.head.append(script);
  }
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
      if (["tournament", "faq", "training"].includes(active) || (active === "studio" && window.KTAccount?.id != null)) location.reload();
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

(function () {
  "use strict";
  const sites = window.KT_SITES || { subdomains: false, urls: {
    home: "/", initiative: "/killteam-initiative-calculator.html", tracker: "/killteam-activation-tracker.html",
    tournament: "/tournament/", studio: "/studio/"
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
  for (const link of document.querySelectorAll("[data-companion-home]")) link.href = serviceUrl("home");
  let user;
  const accounts = [];
  const mounts = [...document.querySelectorAll("[data-companion-nav]")];
  for (const mount of mounts) {
    mount.className = "companion-utility";
    if (active === "studio" || active === "home") {
      const account = document.createElement("div");
      account.className = "companion-account";
      mount.append(account);
      accounts.push(account);
    }
    if (active !== "home") {
      const home = document.createElement("a");
      home.className = "companion-home-link";
      home.href = serviceUrl("home");
      home.textContent = "На Главную Страницу";
      mount.append(home);
    }
  }
  if (mounts[0]) {
    const updateHeight = () => document.documentElement.style.setProperty("--companion-bar-height", mounts[0].offsetHeight + "px");
    updateHeight();
    new ResizeObserver(updateHeight).observe(mounts[0]);
  }
  function loginUrl(next = location.href) {
    const destination = new URL(serviceUrl("tournament"));
    destination.searchParams.set("next", new URL(next, location.origin).href);
    return destination.href;
  }
  function setUser(value) {
    user = value;
    for (const account of accounts) {
      account.replaceChildren();
      const link = document.createElement("a");
      link.href = user ? serviceUrl("tournament") + "#/profile" : loginUrl();
      link.textContent = user ? user.name : "Войти";
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
    setUser(null);
    for (const account of accounts) account.querySelector("a").textContent = "Войти / проверить вход";
  });
  window.KTCompanion = { ready, session, setUser, changed, loginUrl, returnAfterLogin, serviceUrl };
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

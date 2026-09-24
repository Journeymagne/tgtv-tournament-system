(async function () {
  "use strict";
  const gate = document.getElementById("studio-gate");
  try {
    const { user } = await window.KTCompanion.ready.catch(() => ({ user: null }));
    const pendingKey = "kt-studio-login-transfer";
    const projectKey = "kt-studio-cards-v6:";
    let guestId = sessionStorage.getItem("kt-studio-guest-id");
    if (!guestId) {
      guestId = crypto.randomUUID();
      sessionStorage.setItem("kt-studio-guest-id", guestId);
    }
    function scope(name) {
      const prefix = "kt-studio-" + name + ":";
      return {
        databaseName: "kill-team-studio-albums-" + name,
        storage: {
          getItem: key => localStorage.getItem(prefix + key),
          setItem: (key, value) => localStorage.setItem(prefix + key, value),
          removeItem: key => localStorage.removeItem(prefix + key)
        }
      };
    }
    let leaving = false;
    async function requireLogin(action = "continue") {
      if (user) return true;
      if (leaving) return false;
      leaving = true;
      try {
        const project = window.ktStudio.getData();
        if (!await KTStorage.save(projectKey + project.team.id, JSON.stringify(project))) {
          throw Error("Не удалось подготовить команду к входу. Освободите место в браузере и повторите попытку.");
        }
        await KTStorage.flush();
        const nonce = crypto.randomUUID();
        sessionStorage.setItem(pendingKey, JSON.stringify({ nonce, guestId, projectId: project.team.id, action }));
        const { user: currentUser } = await window.KTCompanion.session();
        if (!currentUser && !await window.KTStudioLogin.open(action)) {
          sessionStorage.removeItem(pendingKey);
          leaving = false;
          return false;
        }
        const studioUrl = window.KTCompanion.serviceUrl?.("studio") || "/studio";
        window.KTCompanion.changed();
        location.replace(studioUrl + "?resume=" + nonce);
      } catch (error) {
        leaving = false;
        throw error;
      }
      return false;
    }
    async function transfer() {
      if (!user) return null;
      const nonce = new URLSearchParams(location.search).get("resume");
      if (!nonce) return null;
      let pending;
      try { pending = JSON.parse(sessionStorage.getItem(pendingKey)); } catch {}
      if (!pending || pending.nonce !== nonce || pending.guestId !== guestId || !["continue", "save", "publish", "download", "drafts"].includes(pending.action)) return null;
      const guest = KTStorage.create(scope("guest-" + guestId));
      const saved = await guest.load(projectKey + pending.projectId);
      if (!saved) throw Error("Не удалось восстановить гостевую команду после входа.");
      const project = KTModel.validate(KTModel.migrate(JSON.parse(saved)));
      // A guest can edit an example or import any project id. Always make a new
      // account draft so a same-id private draft can never be overwritten.
      project.team.id = "custom-" + crypto.randomUUID();
      return { project, action: pending.action };
    }
    function finishTransfer() {
      sessionStorage.removeItem(pendingKey);
      const url = new URL(location.href);
      url.searchParams.delete("resume");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    window.KTAccount = Object.freeze({
      id: user?.id ?? null,
      ...scope(user ? "user-" + user.id : "guest-" + guestId),
      requireLogin, transfer, finishTransfer,
      request: (url, options = {}) => fetch(url.replace(/^\/api\//, "/api/studio/"), {
        ...options, credentials: "same-origin", headers: { ...options.headers, ...(user ? { "X-Studio-Account": String(user.id) } : {}) }
      })
    });
    document.addEventListener("click", event => {
      if (user || !window.ktStudio || !event.target.closest(".companion-account a")) return;
      event.preventDefault();
      void requireLogin().catch(error => window.ktStudio.toast(error.message));
    });
    const response = await fetch("/studio/scripts.json?v=4.7.5");
    if (!response.ok) throw Error("Не удалось загрузить Студию.");
    const scripts = await response.json();
    for (const src of scripts) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/studio/" + src.split("?")[0] + "?v=4.7.5";
        script.onload = resolve;
        script.onerror = () => reject(Error("Не удалось загрузить Студию. Обновите страницу."));
        document.body.append(script);
      });
    }
    await window.ktStudioReady;
    gate.hidden = true;
    document.getElementById("studio-workspace").hidden = false;
  } catch (error) {
    gate.textContent = error.message;
  }
})();

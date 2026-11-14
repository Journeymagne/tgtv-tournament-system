(function (root) {
  "use strict";
  const EXPIRED = "Telegram linking expired. Sign in again.";
  const NETWORK = "Нет связи с сервером. Проверьте подключение и попробуйте снова.";
  const UNCERTAIN = "Не удалось подтвердить привязку. Войдите ещё раз.";
  function create(options) {
    const now = options.now || Date.now;
    const schedule = options.setTimer || setTimeout;
    const unschedule = options.clearTimer || clearTimeout;
    let sequence = 0, timer, challenge = null, proof = null, expectedAccount;
    let view = { stage: "credentials", busy: false, account: null, telegram: null, error: null, expiresAt: null, restartRequired: true };
    const snapshot = () => ({ ...view, account: view.account ? { ...view.account } : null, telegram: view.telegram ? { ...view.telegram } : null });
    const emit = () => options.onChange(snapshot());
    function clear() {
      unschedule(timer); timer = undefined; challenge = null; proof = null;
      options.clearPassword();
      view = { ...view, stage: "credentials", busy: false, account: null, expiresAt: null, restartRequired: true };
    }
    function expire() {
      // A submitted confirmation may already have committed. Its response/recovery
      // remains authoritative even if the local five-minute timer has elapsed.
      if (view.stage === "submitting") return;
      sequence++; clear(); view.error = EXPIRED; emit();
    }
    const expired = () => !challenge || !Number.isFinite(Date.parse(view.expiresAt)) || Date.parse(view.expiresAt) <= now();
    async function request(path, body) {
      let response;
      try {
        response = await options.fetch(path, { method: "POST", credentials: "omit", cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body, signal: AbortSignal.timeout(20000) });
      } catch { throw new Error(NETWORK); }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") || "")) throw new Error(NETWORK);
      let data;
      try { data = await response.json(); } catch { throw new Error(NETWORK); }
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(NETWORK);
      if (!response.ok) {
        const error = new Error(typeof data.error === "string" ? data.error : NETWORK);
        error.status = response.status; throw error;
      }
      return data;
    }
    function authenticated(session, expected) {
      return session?.authenticated === true && Number.isSafeInteger(session.user?.id) &&
        typeof session.accessToken === "string" && session.accessToken.length > 0 &&
        (expected === undefined || session.user.id === expected);
    }
    function finish(session) {
      sequence++; clear(); expectedAccount = undefined; view.error = null; emit(); options.onAuthenticated(session);
    }
    function start(session) {
      sequence++; clear(); expectedAccount = undefined; view.telegram = null; view.error = null; view.locale = session?.locale;
      const link = session?.authenticated === false && session.reason === "not_linked" ? session.link : null;
      if (link && /^[A-Za-z0-9_-]{43}$/.test(link.challenge) && typeof link.telegram?.id === "string" &&
          typeof link.telegram.displayName === "string" && Number.isFinite(Date.parse(link.expiresAt))) {
        challenge = link.challenge; view.telegram = { ...link.telegram }; view.expiresAt = link.expiresAt;
        view.restartRequired = false;
        if (expired()) { expire(); return; }
        timer = schedule(expire, Math.max(0, Date.parse(view.expiresAt) - now()));
      } else view.error = EXPIRED;
      emit();
    }
    async function submit(name, password) {
      if (view.busy) { options.clearPassword(); return; }
      if (expired()) { expire(); return; }
      const current = ++sequence;
      const body = JSON.stringify({ challenge, name, password }); password = "";
      options.clearPassword(); view.busy = true; view.error = null; emit();
      try {
        const result = await request("/api/auth/telegram-link", body);
        if (current !== sequence) return;
        if (expired()) { expire(); return; }
        if (!Number.isSafeInteger(result.account?.id) || typeof result.account.name !== "string" ||
            result.telegram?.id !== view.telegram.id || !/^[A-Za-z0-9_-]{43}$/.test(result.proof) ||
            result.expiresAt !== view.expiresAt) throw new Error(EXPIRED);
        proof = result.proof; view.account = { id: result.account.id, name: result.account.name };
        view.telegram = { ...result.telegram }; view.stage = "confirm"; view.busy = false; emit();
      } catch (error) {
        if (current !== sequence) return;
        if (error.message === EXPIRED) { expire(); return; }
        view.busy = false; view.error = error.message; emit();
      }
    }
    async function confirm(locale) {
      if (view.busy || view.stage !== "confirm") return;
      if (expired()) { expire(); return; }
      const current = ++sequence, expected = view.account.id;
      // Clearing proof/render state after an uncertain result must not forget
      // which account the person actually confirmed. Retries keep this boundary
      // until success, a verified unlinked challenge, or a new launch/disposal.
      expectedAccount = expected;
      const body = JSON.stringify({ challenge, proof, initData: options.initData, locale });
      view.stage = "submitting"; view.busy = true; view.error = null; emit();
      try {
        const session = await request("/api/miniapp/link/confirm", body);
        if (current !== sequence) return;
        if (!authenticated(session, expected)) throw new Error(UNCERTAIN);
        finish(session);
      } catch (error) {
        if (current !== sequence) return;
        // Only an authenticated response for the prepared account may resolve an
        // uncertain outcome. A different account is never adopted as success.
        let recovered;
        try { recovered = await request("/api/miniapp/session", JSON.stringify({ initData: options.initData })); } catch {}
        if (current !== sequence) return;
        if (authenticated(recovered, expected)) { finish(recovered); return; }
        clear(); view.error = recovered?.authenticated ? UNCERTAIN : error.message; emit();
      }
    }
    async function cancel() {
      if (view.stage === "submitting") return;
      const old = challenge, current = ++sequence;
      clear(); view.busy = true; view.error = null; emit();
      if (old) {
        try { await request("/api/miniapp/link/cancel", JSON.stringify({ challenge: old, initData: options.initData })); } catch {}
      }
      if (current !== sequence) return;
      try {
        const session = await request("/api/miniapp/session", JSON.stringify({ initData: options.initData }));
        if (current !== sequence) return;
        if (authenticated(session, expectedAccount)) finish(session);
        else if (session.authenticated) { clear(); view.error = UNCERTAIN; emit(); }
        else start(session);
      } catch (error) {
        if (current !== sequence) return;
        clear(); view.error = error.message; emit();
      }
    }
    function dispose() { sequence++; clear(); expectedAccount = undefined; view.telegram = null; view.error = null; }
    return { start, submit, confirm, cancel, dispose, snapshot };
  }
  const api = { create };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KTMiniLinkFlow = api;
})(typeof window === "object" ? window : globalThis);

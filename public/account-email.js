(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let locale = window.KTAppearance?.locale || "ru", mode = "settings", token = "", busy = false, generation = 0, completed = "", pendingLocale = "";
  const copy = {
    ru: {
      eyebrow: "АККАУНТ / БЕЗОПАСНОСТЬ", heading: "Почта и доступ", intro: "Один аккаунт для турниров, Студии и других инструментов KT Companion. Почта видна только вам.",
      back: "Вернуться в профиль", loading: "Загрузка…", settings: "Почта аккаунта", email: "Адрес почты",
      password: "Текущий пароль", newPassword: "Новый пароль", repeat: "Повторите новый пароль", passwordHint: "От 6 до 256 символов.",
      save: "Отправить подтверждение", bind: "Добавить почту", change: "Сменить почту", confirmed: "Подтверждена",
      empty: "Почта пока не добавлена. Подтвердите адрес, чтобы восстанавливать доступ без администратора.",
      pending: "Ожидает подтверждения", pendingHint: "Откройте письмо и подтвердите адрес. Ссылка действует 24 часа.",
      bindHint: "Мы отправим ссылку для подтверждения. Адрес нужен для восстановления доступа и не появится в публичном профиле.",
      changeHint: "Новый адрес заменит текущий после подтверждения. После смены почты потребуется войти заново.",
      resend: "Отправить ещё раз", cancel: "Отменить", signIn: "Войти в аккаунт", needLogin: "Войдите, чтобы добавить или изменить почту.",
      forgot: "Восстановление пароля", forgotLink: "Забыли пароль?", forgotHint: "Укажите подтверждённую почту аккаунта. Если адрес не был подтверждён, обратитесь к администратору.",
      request: "Получить ссылку", requested: "Если адрес связан с подтверждённым аккаунтом, мы отправим письмо. Проверьте входящие и спам; повторить запрос можно через минуту.",
      verificationRequested: "Запрос принят. Проверьте входящие и спам. Повторить отправку можно через минуту.",
      verify: "Подтверждение почты", verifyHint: "Нажмите кнопку, чтобы подтвердить этот адрес для аккаунта. Если вы не запрашивали письмо, закройте страницу.",
      verifyAction: "Подтвердить адрес", verified: "Почта подтверждена. Для восстановления доступа используйте этот адрес.",
      reset: "Новый пароль", resetAction: "Сохранить новый пароль", resetDone: "Пароль изменён. Все прежние сеансы завершены. Войдите с новым паролем.",
      mismatch: "Пароли не совпадают.", expired: "Ссылка недействительна или истекла. Запросите новое письмо.",
      disabled: "Почтовый сервис ещё не включён. Вход по имени и паролю продолжает работать.",
      cancelled: "Запрос на смену адреса отменён.", error: "Не удалось выполнить запрос. Попробуйте ещё раз.",
      network: "Не удалось связаться с сервером. Проверьте соединение.", wrongPassword: "Текущий пароль неверен.",
      invalidEmail: "Введите корректный адрес почты.", tooMany: "Слишком много запросов. Попробуйте через 15 минут.",
      already: "Этот адрес уже подтверждён.", invalidPassword: "Пароль должен содержать от 6 до 256 символов.",
      busy: "Подождите…", admin: "Состояние отправки", adminHint: "Очередь и последние ошибки отправки. Данные получателей скрыты."
    },
    en: {
      eyebrow: "ACCOUNT / SECURITY", heading: "Email & access", intro: "One account for tournaments, Studio and every KT Companion tool. Your email is private.",
      back: "Back to profile", loading: "Loading…", settings: "Account email", email: "Email address",
      password: "Current password", newPassword: "New password", repeat: "Repeat new password", passwordHint: "6 to 256 characters.",
      save: "Send confirmation", bind: "Add email", change: "Change email", confirmed: "Confirmed",
      empty: "No email added yet. Confirm an address to recover access without an administrator.",
      pending: "Awaiting confirmation", pendingHint: "Open the email and confirm your address. The link expires in 24 hours.",
      bindHint: "We will send a confirmation link. Your address is used for account recovery and stays off your public profile.",
      changeHint: "Your new address replaces the current one after confirmation. You will need to sign in again after changing it.",
      resend: "Send again", cancel: "Cancel", signIn: "Sign in", needLogin: "Sign in to add or change your email.",
      forgot: "Password recovery", forgotLink: "Forgot password?", forgotHint: "Enter your confirmed account email. If you never confirmed it, contact an administrator.",
      request: "Get reset link", requested: "If this address belongs to a confirmed account, we will send an email. Check your inbox and spam; wait one minute before retrying.",
      verificationRequested: "Request received. Check your inbox and spam. Wait one minute before retrying.",
      verify: "Confirm email", verifyHint: "Click below to confirm this address for your account. If you did not request this email, close this page.",
      verifyAction: "Confirm address", verified: "Email confirmed. You can now use this address to recover access.",
      reset: "New password", resetAction: "Save new password", resetDone: "Password changed. All previous sessions have ended. Sign in with your new password.",
      mismatch: "Passwords do not match.", expired: "This link is invalid or expired. Request a new email.",
      disabled: "Email is not enabled yet. You can still sign in with your name and password.",
      cancelled: "The email change request was cancelled.", error: "Request failed. Please try again.",
      network: "Could not reach the server. Check your connection.", wrongPassword: "Current password is incorrect.",
      invalidEmail: "Enter a valid email address.", tooMany: "Too many requests. Please try again in 15 minutes.",
      already: "This email address is already confirmed.", invalidPassword: "Password must contain 6 to 256 characters.",
      busy: "Please wait…", admin: "Delivery status", adminHint: "Queue and recent sending failures. Recipient details are hidden."
    }
  };
  const t = key => copy[locale][key];
  function readFragment() {
    completed = "";
    const fragment = location.hash.slice(1);
    const match = /^(verify|reset)=([a-f0-9]{64})$/.exec(fragment);
    mode = match ? match[1] : ["forgot", "admin"].includes(fragment) ? fragment : fragment.startsWith("verify=") || fragment.startsWith("reset=") ? "invalid" : "settings";
    token = match ? match[2] : "";
    // Keep bearer tokens only in memory; no storage, query string or analytics.
    if (match || mode === "invalid") history.replaceState(null, "", location.pathname);
  }
  function notice(text, error = false) { $("notice").textContent = text; $("notice").classList.toggle("error", error); }
  async function api(path, method = "GET", body) {
    let response;
    try { response = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw Error(t("network")); }
    const data = await response.json();
    if (!response.ok) {
      const messages = {
        "Current password is incorrect": "wrongPassword", "Enter a valid email address": "invalidEmail",
        "This link is invalid or expired. Request a new email": "expired", "Passwords do not match": "mismatch",
        "This email address is already confirmed": "already", "Password must contain 6 to 256 characters": "invalidPassword",
        "Email service is not enabled yet": "disabled", "You need to sign in": "needLogin"
      };
      throw Error(response.status === 429 ? t("tooMany") : t(messages[data.error] || "error"));
    }
    return data;
  }
  function field(label, name, type, autocomplete) {
    return '<label>' + t(label) + '<input name="' + name + '" type="' + type + '" autocomplete="' + autocomplete + '" required maxlength="' +
      (type === "email" ? 254 : 256) + '"' + (autocomplete === "new-password" ? ' minlength="6"' : "") + "></label>";
  }
  const action = (id, key, secondary = false) => '<button type="button" id="' + id + '"' + (secondary ? ' class="secondary"' : "") + ">" + t(key) + "</button>";
  function loginLink() {
    return '<a class="action" href="/tournament?next=%2Faccount-email.html">' + t("signIn") + "</a>";
  }
  async function perform(button, fn) {
    if (busy) return;
    busy = true; button.disabled = true; notice(t("busy"));
    try { await fn(); }
    catch (error) { notice(error.message, true); }
    finally {
      busy = false; if (button.isConnected) button.disabled = false;
      if (pendingLocale) { locale = pendingLocale; pendingLocale = ""; void render(); }
    }
  }
  function wireForm(fn) {
    $("email-form")?.addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
      void perform(form.querySelector("button"), () => fn(values));
    });
  }
  async function render() {
    const ownGeneration = ++generation;
    $("heading").textContent = t("heading"); $("intro").textContent = t("intro");
    $("back").textContent = t("back"); $("eyebrow").textContent = t("eyebrow");
    document.documentElement.lang = locale; document.title = t("heading") + " — KT Companion";
    $("content").textContent = t("loading"); notice("");
    try {
      const config = await api("/api/auth/email-config");
      if (ownGeneration !== generation) return;
      $("card-title").textContent = t(mode === "settings" ? "settings" : mode === "invalid" ? "heading" : mode);
      if (!config.enabled) { $("content").textContent = t("disabled"); return; }
      if (completed) { $("content").innerHTML = "<p>" + t(completed) + "</p>" + loginLink(); return; }
      if (mode === "invalid") { $("content").innerHTML = "<p>" + t("expired") + '</p><a href="#forgot">' + t("forgotLink") + "</a>"; return; }
      if (mode === "forgot") {
        $("content").innerHTML = '<p class="subtle">' + t("forgotHint") + '</p><form id="email-form">' + field("email", "email", "email", "email") + '<button>' + t("request") + "</button></form>";
        wireForm(async data => { await api("/api/auth/password/forgot", "POST", data); notice(t("requested")); });
      } else if (mode === "verify") {
        $("content").innerHTML = '<p class="subtle">' + t("verifyHint") + "</p>" + action("verify", "verifyAction");
        $("verify").onclick = event => perform(event.target, async () => {
          await api("/api/auth/email/verify", "POST", { token }); token = ""; completed = "verified";
          window.KTCompanion?.changed();
          void window.KTCompanion?.session().catch(() => {});
          $("content").innerHTML = "<p>" + t("verified") + "</p>" + loginLink(); notice("");
        });
      } else if (mode === "reset") {
        $("content").innerHTML = '<p class="subtle">' + t("passwordHint") + '</p><form id="email-form">' +
          field("newPassword", "password", "password", "new-password") + field("repeat", "confirmPassword", "password", "new-password") + "<button>" + t("resetAction") + "</button></form>";
        wireForm(async data => {
          if (data.password !== data.confirmPassword) throw Error(t("mismatch"));
          await api("/api/auth/password/reset", "POST", { ...data, token }); token = ""; completed = "resetDone";
          window.KTCompanion?.setUser(null); window.KTCompanion?.changed();
          $("content").innerHTML = "<p>" + t("resetDone") + "</p>" + loginLink(); notice("");
        });
      } else {
        const { user } = await api("/api/session");
        if (ownGeneration !== generation) return;
        if (!user) { $("content").innerHTML = "<p>" + t("needLogin") + "</p>" + loginLink() + '<p><a href="#forgot">' + t("forgotLink") + "</a></p>"; return; }
        if (mode === "admin") {
          const health = await api("/api/admin/email");
          if (ownGeneration !== generation) return;
          $("content").innerHTML = '<p class="subtle">' + t("adminHint") + "</p><pre></pre>";
          $("content").querySelector("pre").textContent = JSON.stringify(health, null, 2);
          return;
        }
        const data = await api("/api/auth/email");
        if (ownGeneration !== generation) return;
        $("content").innerHTML = '<p class="subtle">' + escape(user.name) + "</p>" +
          (data.email ? '<p class="address">' + escape(data.email) + '</p><span class="badge">' + t("confirmed") + "</span>" : "<p>" + t("empty") + "</p>") +
          (data.pendingEmail ? '<div class="pending"><p>' + t("pending") + '</p><p class="address">' + escape(data.pendingEmail) + '</p><p class="subtle">' + t("pendingHint") + '</p><div class="actions">' + action("resend", "resend", true) + action("cancel", "cancel", true) + "</div></div>" : "") +
          "<hr><h2>" + t(data.email ? "change" : "bind") + '</h2><p class="subtle">' + t(data.email ? "changeHint" : "bindHint") + '</p><form id="email-form">' +
          field("email", "email", "email", "email") + field("password", "currentPassword", "password", "current-password") + "<button>" + t("save") + "</button></form>" +
          '<p><a href="#forgot">' + t("forgotLink") + "</a></p>" + (user.isSuperAdmin ? '<p><a href="#admin">' + t("admin") + "</a></p>" : "");
        wireForm(async values => {
          await api("/api/auth/email", "POST", { ...values, locale }); await render(); notice(t("verificationRequested"));
        });
        if ($("resend")) $("resend").onclick = event => perform(event.target, async () => { await api("/api/auth/email/resend", "POST", {}); notice(t("verificationRequested")); });
        if ($("cancel")) $("cancel").onclick = event => perform(event.target, async () => { await api("/api/auth/email/pending", "DELETE", {}); await render(); notice(t("cancelled")); });
      }
    } catch (error) {
      if (ownGeneration !== generation) return;
      $("content").textContent = ""; notice(error.message, true);
    }
  }
  window.addEventListener("kt:locale", () => {
    const next = window.KTAppearance?.locale || "ru";
    if (busy) { pendingLocale = next; return; }
    if (next !== locale) { locale = next; void render(); }
  });
  window.addEventListener("hashchange", () => { readFragment(); void render(); });
  readFragment(); void render();
})();

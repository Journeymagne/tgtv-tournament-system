/* Shared UI primitives. No network requests or application state in this file. */
(function () {
  'use strict';
  const paths = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    dark: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>'
  };
  function node(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function icon(name) {
    const holder = document.createElement('span');
    holder.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (paths[name] || '') + '</svg>';
    return holder.firstElementChild;
  }
  function button(label, { icon: iconName, variant = 'secondary', disabled = false } = {}) {
    const element = node('button', 'kt-control kt-control--' + variant, label);
    element.type = 'button'; element.disabled = disabled;
    if (iconName) {
      element.classList.add('kt-control--icon');
      element.replaceChildren(icon(iconName));
      element.setAttribute('aria-label', label); element.title = label;
    }
    return element;
  }
  function avatar(user) {
    const element = node('span', 'kt-avatar');
    element.setAttribute('aria-hidden', 'true');
    const initials = String(user?.name || 'KT').trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toUpperCase() || 'KT';
    element.textContent = initials;
    const source = user?.avatarUrl || user?.avatarData;
    if (source) {
      const image = document.createElement('img'); image.alt = ''; image.decoding = 'async';
      image.addEventListener('error', () => element.replaceChildren(document.createTextNode(initials)), { once: true });
      image.src = source; element.replaceChildren(image);
    }
    return element;
  }
  function rating(value) { return node('span', 'kt-rating', 'MMR ' + value); }
  function notificationButton({ tag = 'button', count = 0, locale = 'ru' } = {}) {
    const element = node(tag, 'kt-control kt-control--icon kt-notification-toggle');
    if (tag === 'button') element.type = 'button';
    const badge = node('span', 'kt-notification-badge'); badge.setAttribute('aria-hidden', 'true');
    element.append(icon('bell'), badge);
    function setCount(value, language = locale) {
      const total = Math.max(0, Math.floor(Number(value) || 0));
      badge.hidden = total === 0; badge.textContent = total > 99 ? '99+' : String(total);
      const label = (language === 'en' ? 'Notifications' : 'Уведомления') + (total ? ': ' + total : '');
      element.setAttribute('aria-label', label); element.title = label;
    }
    setCount(count);
    return { element, badge, setCount };
  }
  function accountBar(options = {}) {
    let user = options.user || null, locale = options.locale || 'ru', theme = options.theme || 'dark';
    const element = node('div', 'kt-account-bar'); element.dataset.uiSkip = '';
    const profile = node('a', 'kt-account-profile'); profile.href = options.profileHref || '/tournament#/profile';
    const actions = node('div', 'kt-account-actions');
    const language = button('RU'); language.dataset.langToggle = '';
    const themes = node('div', 'kt-theme-switch'); themes.setAttribute('role', 'group');
    const themeButtons = ['light', 'dark'].map(value => {
      const control = button(value, { icon: value }); control.dataset.themeChoice = value;
      control.addEventListener('click', () => options.onTheme?.(value)); themes.append(control); return control;
    });
    const login = node('a', 'kt-control kt-control--primary'); login.href = options.loginHref || '/account';
    const logout = button('');
    const notifications = node('div', 'kt-account-notifications');
    const status = node('span', 'kt-account-status'); status.setAttribute('role', 'status');
    language.addEventListener('click', () => options.onLocale?.(locale === 'ru' ? 'en' : 'ru'));
    logout.addEventListener('click', async () => {
      logout.disabled = true; status.textContent = '';
      try { await options.onLogout?.(); }
      catch (error) { status.textContent = error.message || (locale === 'en' ? 'Please try again' : 'Повторите попытку'); }
      finally { logout.disabled = false; }
    });
    actions.append(language, themes, login, logout, notifications);
    element.append(profile, actions, status);
    function setAppearance(value = {}) {
      locale = value.locale || locale; theme = value.theme || theme;
      language.textContent = locale.toUpperCase();
      language.title = locale === 'ru' ? 'Switch to English' : 'Переключить на русский';
      language.setAttribute('aria-label', language.title);
      themes.setAttribute('aria-label', locale === 'en' ? 'Color theme' : 'Тема оформления');
      for (const control of themeButtons) {
        const light = control.dataset.themeChoice === 'light';
        control.title = locale === 'en' ? (light ? 'Light theme' : 'Dark theme') : (light ? 'Светлая тема' : 'Тёмная тема');
        control.setAttribute('aria-label', control.title);
        control.setAttribute('aria-pressed', String(control.dataset.themeChoice === theme));
      }
      login.textContent = locale === 'en' ? 'Sign in' : 'Войти';
      logout.textContent = locale === 'en' ? 'Sign out' : 'Выйти';
      profile.setAttribute('aria-label', (locale === 'en' ? 'Open profile' : 'Открыть профиль') + (user ? ': ' + user.name : ''));
    }
    function setUser(value) {
      user = value; profile.replaceChildren(); profile.hidden = !user;
      login.hidden = Boolean(user); logout.hidden = !user; notifications.hidden = !user;
      if (user) {
        const name = node('span', 'kt-account-name', user.name); name.title = user.name;
        profile.append(avatar(user), name);
        const mmr = user.ratings?.combined ?? user.rating;
        if (mmr !== null && mmr !== undefined && Number.isFinite(Number(mmr))) profile.append(rating(Number(mmr)));
      }
      setAppearance();
    }
    setUser(user);
    return { element, profile, notifications, setUser, setAppearance };
  }
  window.KTComponents = Object.freeze({ icon, button, avatar, rating, notificationButton, accountBar });
})();

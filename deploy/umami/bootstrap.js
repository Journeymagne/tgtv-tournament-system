/* Loaded once by the public reverse proxy on every HTML page, including Combat Lab. */
(() => {
  "use strict";
  const source = document.currentScript;
  const website = source?.dataset.websiteId;
  if (!website || window.ktAnalyticsLoaded) return;
  if (!['ktcompanion.ru', 'www.ktcompanion.ru', 'rating.ktcompanion.ru'].includes(location.hostname)) return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  window.ktAnalyticsLoaded = true;

  function section(path) {
    if (/^\/(?:home\.html)?$/.test(path)) return 'Главная';
    if (/^\/(?:tournament|tournaments|teams|miniapp)(?:\/|$)/.test(path) || path === '/index.html') return 'Турниры';
    if (/^\/studio(?:\/|$)/.test(path)) return 'Студия';
    if (/^\/dice(?:\/|$)/.test(path)) return 'Кубики';
    if (/^\/combat(?:\/|$)/.test(path)) return 'Боевой калькулятор';
    if (/^\/initiative(?:\/|$)/.test(path) || path === '/killteam-initiative-calculator.html') return 'Инициатива';
    if (/^\/tracker(?:\/|$)/.test(path) || path === '/killteam-activation-tracker.html') return 'Трекер активаций';
    if (/^\/(?:faq|community-faq)(?:\/|$)/.test(path)) return 'FAQ';
    if (/^\/(?:knowthykt|training|know-thy-kill-team)(?:\/|$)/.test(path)) return 'KTKT';
    if (/^\/account(?:\/|$)/.test(path) || path === '/account-email.html') return 'Личный кабинет';
    return 'Прочее';
  }

  // Keep credentials in query strings, URL fragments and referrers out of analytics.
  window.ktAnalyticsBeforeSend = (type, payload) => {
    if (type !== 'event') return false;
    const clean = { ...payload };
    for (const key of ['url', 'referrer']) {
      if (!clean[key]) continue;
      try {
        const url = new URL(clean[key], location.origin);
        url.search = '';
        url.hash = '';
        url.username = '';
        url.password = '';
        clean[key] = url.href;
      } catch { clean[key] = ''; }
    }
    try { clean.tag = section(new URL(clean.url, location.origin).pathname); } catch { clean.tag = 'Прочее'; }
    return clean;
  };
  const tracker = document.createElement('script');
  tracker.src = '/telemetry/script.js';
  tracker.defer = true;
  tracker.dataset.websiteId = website;
  tracker.dataset.hostUrl = location.origin + '/telemetry';
  tracker.dataset.domains = 'ktcompanion.ru,www.ktcompanion.ru,rating.ktcompanion.ru';
  tracker.dataset.excludeSearch = 'true';
  tracker.dataset.excludeHash = 'true';
  tracker.dataset.doNotTrack = 'true';
  tracker.dataset.beforeSend = 'ktAnalyticsBeforeSend';
  document.head.appendChild(tracker);
})();

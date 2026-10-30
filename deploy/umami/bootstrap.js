/* Loaded once by the public reverse proxy on every HTML page, including Combat Lab. */
(() => {
  "use strict";
  const source = document.currentScript;
  const website = source?.dataset.websiteId;
  if (!website || window.ktAnalyticsLoaded) return;
  if (!['ktcompanion.ru', 'www.ktcompanion.ru', 'rating.ktcompanion.ru'].includes(location.hostname)) return;
  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1') return;
  window.ktAnalyticsLoaded = true;

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

const SERVICES = ['accounts','notifications','tournaments','studio','faq','calculators'];
const DEFAULT_PORTS = { accounts:3021, notifications:3022, tournaments:3023, studio:3024, faq:3025, calculators:3027 };

function apiService(path, method = 'GET') {
  if (/^\/api\/faq\/moderators(?:\/|$)/.test(path)) return 'accounts';
  if (/^\/api\/faq(?:\/|$)/.test(path)) return 'faq';
  if (/^\/api\/studio(?:\/|$)/.test(path)) return 'studio';
  if (/^\/api\/notifications(?:\/|$)/.test(path)) return 'notifications';
  if (/^\/api\/(?:session|login|logout|register|setup-admin|account)(?:\/|$)/.test(path) ||
      /^\/api\/(?:auth|email)(?:\/|$)/.test(path) || path === '/api/admin/email' ||
      /^\/api\/(?:admin\/)?feedback(?:\/|$)/.test(path) || path === '/api/admin/audit' ||
      /^\/api\/users\/[^/]+\/avatar$/.test(path) ||
      /^\/api\/admin\/users\/[^/]+(?:\/(?:permissions|suspension|reset-password))?$/.test(path) ||
      (path === '/api/me' && method === 'PATCH')) return 'accounts';
  return 'tournaments';
}

function pageService(path) {
  if (['/companion/css/common.css'].includes(path)) return null;
  if (/^\/(?:app\.js|admin\.js|styles\.css|i18n\/|pairing-warnings\.js|tournament-tables\.js|telegram-account\.js|robots\.txt|sitemap\.xml)/.test(path)) return 'tournaments';
  if (/^\/(?:studio|dice)(?:\/|$)/.test(path)) return 'studio';
  if (/^\/(?:faq|community-faq)(?:\/|$)/.test(path)) return 'faq';
  if (/^\/(?:combat|initiative|tracker|companion)(?:\/|$)/.test(path) ||
      /^\/killteam-(?:initiative-calculator|activation-tracker)\.html$/.test(path)) return 'calculators';
  if (/^\/(?:account|account-email\.html)(?:\/|$)/.test(path)) return 'accounts';
  if (/^\/(?:tournament|tournaments|teams|miniapp)(?:\/|$)/.test(path) || path === '/index.html') return 'tournaments';
  return null; // Shared menu, appearance, icons and other public assets live at the gateway.
}

function serviceName(value = process.env.SERVICE_NAME || 'monolith') {
  if (!['monolith','gateway',...SERVICES].includes(value)) throw Error('Unknown SERVICE_NAME: ' + value);
  return value;
}
module.exports = { SERVICES, DEFAULT_PORTS, apiService, pageService, serviceName };

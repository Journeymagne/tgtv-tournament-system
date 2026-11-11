// Apply after deriving the target role URL; never mutate the migrator's base env.
function sanitizeServiceEnvironment(source, service) {
  const env = { ...source, TGTV_ENV_LOADED: '1' };
  for (const key of Object.keys(env)) {
    const name = key.toUpperCase();
    if (name === 'DB_PASSWORD' || name === 'TEST_DATABASE_URL' || /_(?:DB_PASSWORD|DATABASE_URL)$/.test(name)) delete env[key];
    else if (service !== 'accounts' && /^(EMAIL_|RESEND_)/.test(name)) delete env[key];
    else if (service !== 'tournaments' && /^TELEGRAM_/.test(name)) delete env[key];
  }
  if (['gateway', 'calculators'].includes(service)) env.DATABASE_URL = '';
  if (service !== 'accounts') env.EMAIL_PROVIDER = 'disabled';
  if (service !== 'tournaments') env.TELEGRAM_MODE = 'disabled';
  return env;
}
module.exports = { sanitizeServiceEnvironment };

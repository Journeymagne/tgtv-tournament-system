// One field definition for the account page and the Studio dialog. Keep their
// wrappers, labels, field order and IDs so existing styles and handlers apply.
function authFields(kind) {
  const studio = kind === 'studio';
  const ids = studio ? {
    name: 'studio-login-name', password: 'studio-login-password',
    email: 'studio-register-email', confirmPassword: 'studio-register-confirm',
    telegramContact: 'studio-register-telegram'
  } : {};
  const fields = {
    name: ['Никнейм или почта', 'autocomplete="username" autocapitalize="none" spellcheck="false" minlength="1" maxlength="254" required'],
    password: ['Пароль', 'type="password" autocomplete="current-password" minlength="1" maxlength="256" required'],
    confirmPassword: ['Повторите пароль', 'type="password" autocomplete="new-password" minlength="6" maxlength="256" required disabled'],
    telegramContact: ['Telegram', 'autocomplete="off" placeholder="@username" maxlength="80" required disabled'],
    email: ['Email', 'type="email" autocomplete="email" maxlength="254" disabled']
  };
  function field(name) {
    const [label, attributes] = fields[name];
    const id = ids[name];
    const labelAttributes = (id ? ` for="${id}"` : '') + (name === 'email'
      ? studio ? ' data-studio-email' : ' id="account-email-label" hidden' : '');
    const text = studio && name === 'name' ? `<span id="studio-login-name-label">${label}</span>` : label;
    return `<label${labelAttributes}>${text}<input${id ? ` id="${id}"` : ''} name="${name}" ${attributes}></label>`;
  }
  const registration = studio ? ['email', 'confirmPassword', 'telegramContact'] : ['confirmPassword', 'telegramContact', 'email'];
  const tag = studio ? 'div' : 'fieldset';
  const attributes = studio ? 'id="studio-register-fields" hidden' : 'id="account-registration" hidden disabled';
  return [field('name'), field('password'), `<${tag} ${attributes}>`, ...registration.map(field), `</${tag}>`].join('\n');
}
module.exports = { authFields };

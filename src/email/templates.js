const { configuration } = require("./config");
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function message(kind, { name, link, locale = "ru" }) {
  const en = locale === "en";
  const texts = en ? {
    verify: ["Confirm your email", "Confirm this address for your KT Companion account.", "Confirm email", "This link is valid for 24 hours. If you did not request this, ignore this email."],
    reset: ["Reset your password", "We received a password reset request for your KT Companion account.", "Set a new password", "This link is valid for 30 minutes and can be used once. Your password stays unchanged until you submit a new one. If this was not you, ignore this email."],
    password_changed: ["Your password has changed", "The password for your KT Companion account has been changed. Other sessions have been signed out.", "Account security", "If this was not you, request a password reset immediately."],
    email_change_requested: ["Email change requested", "A new email address was requested for your KT Companion account. Your current address remains active until the new address is confirmed.", "Account security", "If this was not you, change your password and cancel the pending address in your account settings."],
    email_changed: ["Your email address has changed", "The email address for your KT Companion account has been confirmed and updated.", "Account security", "If this was not you, contact the site administrator immediately."]
  } : {
    verify: ["Подтвердите почту", "Подтвердите этот адрес для своего аккаунта KT Companion.", "Подтвердить почту", "Ссылка действует 24 часа. Если вы не отправляли запрос, проигнорируйте письмо."],
    reset: ["Восстановление пароля", "Получен запрос на восстановление пароля вашего аккаунта KT Companion.", "Задать новый пароль", "Ссылка действует 30 минут и используется один раз. Пароль останется прежним, пока вы не зададите новый. Если запрос отправили не вы, проигнорируйте письмо."],
    password_changed: ["Пароль изменён", "Пароль вашего аккаунта KT Companion изменён. Остальные сеансы завершены.", "Безопасность аккаунта", "Если это сделали не вы, немедленно запросите восстановление пароля."],
    email_change_requested: ["Запрошена смена почты", "Для вашего аккаунта KT Companion запрошена смена почты. Текущий адрес действует до подтверждения нового.", "Безопасность аккаунта", "Если это сделали не вы, смените пароль и отмените ожидающий подтверждения адрес в настройках аккаунта."],
    email_changed: ["Адрес почты изменён", "Адрес почты вашего аккаунта KT Companion подтверждён и обновлён.", "Безопасность аккаунта", "Если это сделали не вы, немедленно свяжитесь с администратором сайта."]
  };
  const [title, intro, button, note] = texts[kind] || [];
  if (!title) throw Error("Unknown email template");
  const greeting = (en ? "Hello, " : "Здравствуйте, ") + name + "!";
  const action = link || configuration().site + "/account-email.html";
  const time = new Date().toISOString();
  return {
    subject: "KT Companion — " + title,
    text: [greeting, intro, button + ": " + action, note, time].join("\n\n"),
    html: '<!doctype html><html lang="' + (en ? "en" : "ru") + '"><body style="background:#f2f3f0;color:#18221d;font:16px/1.6 Arial,sans-serif;padding:24px">' +
      '<main style="max-width:560px;margin:auto;background:white;padding:32px;border-radius:16px">' +
      '<p style="color:#556550;letter-spacing:2px">KT COMPANION</p><h1 style="font-size:26px">' + escapeHtml(title) + "</h1><p>" + escapeHtml(greeting) +
      "</p><p>" + escapeHtml(intro) + '</p><p style="margin:28px 0"><a style="display:inline-block;background:#29483c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none" href="' +
      escapeHtml(action) + '">' + escapeHtml(button) + "</a></p><p>" + escapeHtml(note) +
      '</p><p style="font-size:12px;color:#666">' + time + "</p></main></body></html>"
  };
}
module.exports = { message };

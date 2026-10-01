const { configuration } = require("./config");
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Companion dark theme from public/companion-tokens.css; email clients need inline colors.
const palette = {
  background: "#050505",
  surface: "#101010",
  text: "#f4f4f4",
  muted: "#b9b9b9",
  border: "#3b3b3b",
  accent: "#ff7a1a",
  onAccent: "#050505"
};
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
  const logo = new URL("/logo.png", action).href;
  return {
    subject: "KT Companion — " + title,
    text: [greeting, intro, button + ": " + action, note, time].join("\n\n"),
    html: `<!doctype html>
<html lang="${en ? "en" : "ru"}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${palette.background};color:${palette.text};font:16px/1.6 Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.background}" style="background:${palette.background}">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.surface}" style="max-width:624px;margin:auto;background:${palette.surface};border:1px solid ${palette.border};border-radius:16px">
      <tr><td style="padding:28px 24px;color:${palette.text};font:16px/1.6 Arial,sans-serif">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
          <tr><td width="60" style="padding-right:12px"><img src="${escapeHtml(logo)}" width="48" height="48" alt="KT Companion" style="display:block;border:0;border-radius:50%"></td>
          <td style="color:${palette.accent};font:700 14px/1.4 Arial,sans-serif;letter-spacing:2px">KT COMPANION</td></tr>
        </table>
        <h1 style="margin:0 0 24px;color:${palette.text};font-size:26px;line-height:1.3">${escapeHtml(title)}</h1>
        <p style="margin:0 0 16px;color:${palette.text}">${escapeHtml(greeting)}</p>
        <p style="margin:0;color:${palette.text}">${escapeHtml(intro)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0">
          <tr><td align="center" bgcolor="${palette.accent}" style="background:${palette.accent};border-radius:8px">
            <a href="${escapeHtml(action)}" style="display:inline-block;background:${palette.accent};color:${palette.onAccent};font:700 16px/1.5 Arial,sans-serif;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(button)}</a>
          </td></tr>
        </table>
        <p style="margin:0 0 20px;color:${palette.muted}">${escapeHtml(note)}</p>
        <p style="margin:0;color:${palette.muted};font-size:12px">${time}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
  };
}
module.exports = { message };

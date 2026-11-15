const { configuration } = require("./config");
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Inline equivalents of public/companion-tokens.css: email clients cannot load the UI kit.
const palette = {
  background: "#050505",
  surface: "#101010",
  panel: "#202020",
  text: "#f4f4f4",
  muted: "#b9b9b9",
  border: "#3b3b3b",
  accent: "#ff7a1a",
  onAccent: "#050505"
};
const font = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
const background = color => `background-color:${color};background-image:linear-gradient(${color},${color})`;
// Gmail iOS inverts already-dark messages. Keep light copy readable on the
// solid gradients; other clients use the ordinary inline colors. Do not wrap
// images or the orange/dark-ink CTA: the blend workaround is for light text.
const copy = html => `<div class="gmail-screen"><div class="gmail-difference">${html}</div></div>`;
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
  const logo = new URL("/brand/kt-companion/app-icon.png", action).href;
  const site = new URL(action).origin;
  const accountLabel = en ? "YOUR COMPANION ACCOUNT" : "ВАШ АККАУНТ КОМПАНЬОНА";
  const securityLabel = en ? "ACCOUNT SECURITY" : "БЕЗОПАСНОСТЬ АККАУНТА";
  const footer = en ? "Automatic account notification from KT Companion." : "Автоматическое уведомление об аккаунте KT Companion.";
  return {
    subject: "KT Companion — " + title,
    text: [greeting, intro, button + ": " + action, note, time].join("\n\n"),
    html: `<!doctype html>
<html lang="${en ? "en" : "ru"}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(title)} — KT Companion</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  table { border-collapse:separate; mso-table-lspace:0; mso-table-rspace:0; }
  a:focus-visible { outline:2px solid ${palette.accent}; outline-offset:3px; }
  u + .body .gmail-screen { background:#000; mix-blend-mode:screen; }
  u + .body .gmail-difference { background:#000; mix-blend-mode:difference; }
  @media screen and (max-width:600px) {
    .outer { padding:20px 12px !important; }
    .inset { padding-left:20px !important; padding-right:20px !important; }
    .heading { font-size:28px !important; }
    .cta-table { width:100% !important; }
    .cta { display:block !important; padding-top:15px !important; padding-bottom:15px !important; }
  }
</style>
</head>
<body class="body" style="margin:0;padding:0;${background(palette.background)};color:${palette.text};font:16px/1.6 ${font};-webkit-text-size-adjust:100%;text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.background}" style="${background(palette.background)}">
  <tr><td class="outer" align="center" style="padding:40px 16px">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.surface}" style="max-width:600px;margin:auto;table-layout:fixed;${background(palette.surface)};border:1px solid ${palette.border};border-top:3px solid ${palette.accent};border-radius:10px">
      <tr><td class="inset" style="padding:28px 32px;border-bottom:1px solid ${palette.border}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td width="76" style="vertical-align:middle"><img src="${escapeHtml(logo)}" width="64" height="64" alt="KT Companion" style="display:block;border:0;border-radius:10px"></td>
          <td style="vertical-align:middle;color:${palette.text};font:800 18px/1.3 ${font};letter-spacing:1px">${copy('KT COMPANION' + `<p style="margin:6px 0 0;color:${palette.muted};font:500 11px/1.5 ${font};letter-spacing:1px">${accountLabel}</p>`)}</td></tr>
        </table>
      </td></tr>
      <tr><td class="inset" style="padding:32px 32px 0;color:${palette.text};font:16px/1.6 ${font};overflow-wrap:anywhere;word-wrap:break-word">
        ${copy(`<h1 class="heading" style="margin:0 0 24px;color:${palette.text};font:750 32px/1.15 ${font};letter-spacing:-0.8px">${escapeHtml(title)}</h1>
        <p style="margin:0 0 12px;color:${palette.text}">${escapeHtml(greeting)}</p>
        <p style="margin:0;color:${palette.muted}">${escapeHtml(intro)}</p>`)}
      </td></tr>
      <tr><td class="inset" style="padding:28px 32px">
        <table class="cta-table" role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="${palette.accent}" style="background-color:${palette.accent};border-radius:7px;mso-padding-alt:13px 12px">
            <a class="cta" href="${escapeHtml(action)}" style="display:inline-block;background-color:${palette.accent};color:${palette.onAccent};font:650 14px/14px ${font};padding:13px 12px;border-radius:7px;text-align:center;text-decoration:none;mso-padding-alt:0">${escapeHtml(button)}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="inset" style="padding:0 32px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.panel}" style="${background(palette.panel)};border:1px solid ${palette.border};border-left:3px solid ${palette.accent};border-radius:7px">
          <tr><td style="padding:16px 18px;color:${palette.text};font:14px/1.6 ${font}">
            ${copy(`<p style="margin:0 0 8px;color:${palette.text};font:700 10px/1.5 ${font};letter-spacing:1.2px">${securityLabel}</p>
            <p style="margin:0;color:${palette.muted}">${escapeHtml(note)}</p>`)}
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="inset" style="padding:20px 32px;border-top:1px solid ${palette.border};color:${palette.muted};font:12px/1.6 ${font}">
        ${copy(`<p style="margin:0 0 4px"><a href="${escapeHtml(site)}" style="color:${palette.text};font-weight:650;text-decoration:none">${escapeHtml(new URL(site).hostname)}</a></p>
        <p style="margin:0">${footer}</p>`)}
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr>
</table>
</body></html>`
  };
}
module.exports = { message };

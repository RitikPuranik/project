// HTML bodies for every email type. Each returns { subject, html, preview } ready for sendEmail().
const BRAND = process.env.EMAIL_FROM_NAME || "Orbin";
const ACCENT = "#0a7c72";
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");

const layout = (title, inner) => `
<div style="background:#f4f5fa;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#181b33">
  <table role="presentation" align="center" width="100%" style="max-width:480px;background:#ffffff;border-radius:14px;border:1px solid #e3e5f0;padding:32px">
    <tr><td>
      <div style="font-size:20px;font-weight:700;color:${ACCENT};margin-bottom:20px">${esc(BRAND)}</div>
      <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
      ${inner}
      <hr style="border:none;border-top:1px solid #e3e5f0;margin:28px 0 14px">
      <p style="font-size:12px;color:#7a7f9a;margin:0">You received this email because of activity on your ${esc(BRAND)} account.</p>
    </td></tr>
  </table>
</div>`;

const p = (t) => `<p style="font-size:14px;line-height:1.6;margin:0 0 14px">${t}</p>`;
const button = (href, label) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:${ACCENT};color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600;display:inline-block">${esc(label)}</a></p>`;
const codeBox = (code) =>
  `<div style="font-size:32px;letter-spacing:8px;font-weight:700;text-align:center;background:#f4f5fa;border-radius:10px;padding:16px;margin:18px 0;font-family:Menlo,Consolas,monospace">${esc(code)}</div>`;

const OTP_COPY = {
  reset_password: { subject: "Your password reset code", title: "Reset your password", lead: "Use this code to reset your password." },
  verify_email: { subject: "Verify your email address", title: "Verify your email", lead: "Use this code to verify your email address." },
};

export const otpEmail = ({ name, otp, purpose, minutes }) => {
  const c = OTP_COPY[purpose] ?? { subject: "Your verification code", title: "Your verification code", lead: "Use this code to continue." };
  return {
    subject: `${c.subject} - ${BRAND}`,
    preview: `${purpose} OTP: ${otp}`,
    html: layout(
      c.title,
      p(`Hi ${esc(name)},`) +
        p(c.lead) +
        codeBox(otp) +
        p(`This code expires in <b>${minutes} minutes</b>. If you didn't request it, you can safely ignore this email - your account is untouched.`) +
        p(`<b>Never share this code with anyone.</b>`)
    ),
  };
};

export const welcomeEmail = ({ name, addedByAdmin }) => ({
  subject: `Welcome to ${BRAND}`,
  html: layout(
    `Welcome, ${name}!`,
    p(addedByAdmin ? `An administrator created a ${esc(BRAND)} account for you.` : `Your ${esc(BRAND)} account is ready.`) +
      p("Sign in to see your projects, tasks and team.") +
      button(`${clientUrl()}/login`, "Open " + BRAND)
  ),
});

export const passwordChangedEmail = ({ name }) => ({
  subject: `Your ${BRAND} password was changed`,
  html: layout(
    "Password changed",
    p(`Hi ${esc(name)},`) +
      p("The password on your account was just changed, and you were signed out on all devices.") +
      p("If this wasn't you, reset your password right away.") +
      button(`${clientUrl()}/forgot-password`, "Reset password")
  ),
});

export const emailVerifiedEmail = ({ name }) => ({
  subject: `Email verified - ${BRAND}`,
  html: layout("Email verified", p(`Hi ${esc(name)}, your email address is now verified.`)),
});

/** Generic notification (assignments, mentions, ...). `body` is plain text; `link` is optional. */
export const notificationEmail = ({ title, body, link, linkLabel = "View" }) => ({
  subject: title,
  html: layout(title, p(esc(body)) + (link ? button(link, linkLabel) : "")),
});

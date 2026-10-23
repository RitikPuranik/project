// EmailJS transport. Every email in the app goes through sendEmail(), which fills the
// four variables of the single EmailJS template:
//   Subject      -> {{subject}}
//   To Email     -> {{to_email}}
//   From Name    -> {{from_name}}
//   Content      -> {{{html_body}}}   (triple braces = unescaped HTML)
// It calls EmailJS' REST API from the server, so it needs the *private* key and
// "Allow EmailJS API for non-browser applications" switched on in
// EmailJS dashboard -> Account -> Security.
const ENDPOINT = process.env.EMAILJS_API_URL || "https://api.emailjs.com/api/v1.0/email/send";
const REQUIRED = ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"];

export const emailConfigured = () => REQUIRED.every((k) => process.env[k]);

// Replaceable so tests can capture outgoing mail without touching the network.
export const mailer = {
  async send({ to, subject, html, fromName, preview }) {
    if (!emailConfigured()) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(`EmailJS is not configured. Set ${REQUIRED.join(", ")}`);
      }
      // Dev convenience: show what would have been sent (OTP codes included).
      console.log(`[email:not-configured] to=${to} subject="${subject}"${preview ? ` -> ${preview}` : ""}`);
      return { skipped: true };
    }
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: to,
          subject,
          html_body: html,
          from_name: fromName || process.env.EMAIL_FROM_NAME || "Orbin",
        },
      }),
    });
    if (!res.ok) throw new Error(`EmailJS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { sent: true };
  },
};

export const sendEmail = (msg) => mailer.send(msg);

/** Fire-and-forget for non-critical mail (welcome, notices): never blocks or fails a request. */
export const sendEmailQuietly = (msg) =>
  Promise.resolve()
    .then(() => mailer.send(msg))
    .catch((err) => console.error(`[email] failed to send "${msg.subject}" to ${msg.to}: ${err.message}`));

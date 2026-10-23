// (save() is faked, so the model's password-hashing hook does not run: passwords compare as plain text.)
// Forgot-password / reset-password / verify-email over HTTP. Only the mail transport and the
// database layer are faked.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-test-refresh-test-refresh";

const { default: User } = await import("../modules/users/user.model.js");
const { default: authRoutes } = await import("../modules/auth/auth.routes.js");
const { mailer } = await import("../shared/email/emailjs.js");
const { generateAccessToken } = await import("../shared/utils/token.js");

let all = [];
let sent = [];
const origSave = User.prototype.save;
User.prototype.save = async function () { if (!all.includes(this)) all.push(this); return this; };
User.findById = (id) => { const v = all.find((u) => String(u._id) === String(id)) ?? null; return Object.assign(Promise.resolve(v), { select: () => Promise.resolve(v) }); };
User.findOne = async (q) => all.find((u) => u.email === q.email) ?? null;
mailer.send = async (m) => { sent.push(m); return { sent: true }; };

let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); User.prototype.save = origSave; });

let u;
beforeEach(() => {
  u = new User({ name: "Ann", email: "ann@t.io", password: "oldpass1", role: "member" });
  u.refreshToken = "rt";
  all = [u];
  sent = [];
});

const post = async (path, body, user) => {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(user && { Authorization: `Bearer ${generateAccessToken(user._id, user.role)}` }) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const codeFrom = (m) => m.html.match(/>(\d{6})</)[1];

test("forgot-password emails a 6-digit code through the template variables", async () => {
  const r = await post("/auth/forgot-password", { email: "Ann@t.io" });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ann@t.io");
  assert.match(sent[0].subject, /password reset code/i);
  assert.match(codeFrom(sent[0]), /^\d{6}$/);
  assert.ok(u.otp.hash && !JSON.stringify(u.otp).includes(codeFrom(sent[0])), "code is stored hashed");
});

test("unknown emails get the same response and no email", async () => {
  const known = await post("/auth/forgot-password", { email: "ann@t.io" });
  sent = [];
  const unknown = await post("/auth/forgot-password", { email: "nobody@t.io" });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, known.body);
  assert.equal(sent.length, 0);
});

test("invalid email format is rejected; deactivated accounts get nothing", async () => {
  assert.equal((await post("/auth/forgot-password", { email: "nope" })).status, 400);
  u.isActive = false;
  assert.equal((await post("/auth/forgot-password", { email: "ann@t.io" })).status, 200);
  assert.equal(sent.length, 0);
});

test("a second request inside the cooldown does not send another code", async () => {
  await post("/auth/forgot-password", { email: "ann@t.io" });
  await post("/auth/forgot-password", { email: "ann@t.io" });
  assert.equal(sent.length, 1);
});

const verify = (otp) => post("/auth/verify-reset-otp", { email: "ann@t.io", otp });

test("verify-reset-otp then reset-password: changes the password, signs out sessions, token is single-use", async () => {
  await post("/auth/forgot-password", { email: "ann@t.io" });
  const v = await verify(codeFrom(sent[0]));
  assert.equal(v.status, 200);
  assert.ok(v.body.resetToken);
  assert.ok(!u.otp?.hash, "code is consumed once verified");
  const r = await post("/auth/reset-password", { resetToken: v.body.resetToken, newPassword: "newpass99" });
  assert.equal(r.status, 200);
  assert.equal(u.password, "newpass99");
  assert.equal(u.refreshToken, null);
  assert.match(sent.at(-1).subject, /password was changed/i);
  const again = await post("/auth/reset-password", { resetToken: v.body.resetToken, newPassword: "another11" });
  assert.equal(again.status, 400);
  assert.equal(u.password, "newpass99");
});

test("reset-password rejects a missing, forged or wrong-purpose token and short passwords", async () => {
  assert.equal((await post("/auth/reset-password", { newPassword: "newpass99" })).status, 400);
  assert.equal((await post("/auth/reset-password", { resetToken: "garbage", newPassword: "newpass99" })).status, 400);
  // an ordinary access token must not work as a reset token
  const access = generateAccessToken(u._id, u.role);
  assert.equal((await post("/auth/reset-password", { resetToken: access, newPassword: "newpass99" })).status, 400);
  await post("/auth/forgot-password", { email: "ann@t.io" });
  const v = await verify(codeFrom(sent[0]));
  assert.equal((await post("/auth/reset-password", { resetToken: v.body.resetToken, newPassword: "123" })).status, 400);
  assert.equal(u.password, "oldpass1");
});

test("wrong codes are rejected and lock after 5 attempts, even for the right code", async () => {
  await post("/auth/forgot-password", { email: "ann@t.io" });
  const code = codeFrom(sent[0]);
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await verify(wrong)).status, 400);
  const locked = await verify(code);
  assert.equal(locked.status, 400);
  assert.match(locked.body.message, /too many/i);
  assert.equal(locked.body.resetToken, undefined);
});

test("expired codes are rejected", async () => {
  await post("/auth/forgot-password", { email: "ann@t.io" });
  const code = codeFrom(sent[0]);
  u.otp.expiresAt = new Date(Date.now() - 1000);
  assert.equal((await verify(code)).status, 400);
});

test("email verification OTP: send, wrong code, right code", async () => {
  u.isVerified = false;
  assert.equal((await post("/auth/send-verification", {}, u)).status, 200);
  const code = codeFrom(sent[0]);
  assert.equal((await post("/auth/verify-email", { otp: code === "000000" ? "111111" : "000000" }, u)).status, 400);
  assert.equal((await post("/auth/verify-email", { otp: code }, u)).status, 200);
  assert.equal(u.isVerified, true);
});

test("a reset code can't be used to verify an email (purposes are separate)", async () => {
  await post("/auth/forgot-password", { email: "ann@t.io" });
  assert.equal((await post("/auth/verify-email", { otp: codeFrom(sent[0]) }, u)).status, 400);
});

test("emailjs transport posts the four template variables and keys", async () => {
  const { emailConfigured } = await import("../shared/email/emailjs.js");
  assert.equal(emailConfigured(), false);
  const orig = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, init) => { captured = { url, body: JSON.parse(init.body) }; return new Response("OK", { status: 200 }); };
  Object.assign(process.env, { EMAILJS_SERVICE_ID: "svc", EMAILJS_TEMPLATE_ID: "tpl", EMAILJS_PUBLIC_KEY: "pub", EMAILJS_PRIVATE_KEY: "priv" });
  try {
    const { mailer: real } = await import("../shared/email/emailjs.js?real");
    await real.send({ to: "a@b.c", subject: "S", html: "<b>x</b>" });
  } finally {
    globalThis.fetch = orig;
    for (const k of ["EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY", "EMAILJS_PRIVATE_KEY"]) delete process.env[k];
  }
  assert.match(captured.url, /api\.emailjs\.com\/api\/v1\.0\/email\/send$/);
  assert.equal(captured.body.service_id, "svc");
  assert.equal(captured.body.template_id, "tpl");
  assert.equal(captured.body.user_id, "pub");
  assert.equal(captured.body.accessToken, "priv");
  assert.deepEqual(captured.body.template_params, { to_email: "a@b.c", subject: "S", html_body: "<b>x</b>", from_name: "Orbin" });
});

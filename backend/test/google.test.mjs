// Google OAuth redirect flow: only the code->profile exchange with Google is mocked.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-test-refresh-test-refresh";
process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "secret";
process.env.CLIENT_URL = "http://app.test";

const { default: User } = await import("../modules/users/user.model.js");
const { default: authRoutes } = await import("../modules/auth/auth.routes.js");
const { googleOAuth } = await import("../shared/utils/google.js");

let all = [];
const wire = (u) => { u.save = async () => { if (!all.includes(u)) all.push(u); return u; }; return u; };
User.findOne = async (q) =>
  all.find((u) => (q.googleId && u.googleId === q.googleId) || (q.email && u.email === q.email)) ?? null;
// new User() docs need an in-memory save
const proto = User.prototype.save;
User.prototype.save = async function () { if (!all.includes(this)) all.push(this); return this; };

let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => { server.close(); User.prototype.save = proto; });
beforeEach(() => {
  all = [];
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "secret";
});

// Runs the whole flow: /google (get state + cookie) then /google/callback.
const flow = async ({ state, cookie = true, query = "" } = {}) => {
  const start = await fetch(`${base}/auth/google`, { redirect: "manual" });
  const url = new URL(start.headers.get("location"));
  const ck = (start.headers.get("set-cookie") || "").split(";")[0];
  const q = query || `code=abc&state=${state ?? url.searchParams.get("state")}`;
  const res = await fetch(`${base}/auth/google/callback?${q}`, { redirect: "manual", headers: cookie ? { cookie: ck } : {} });
  return { start, url, res, loc: res.headers.get("location") || "" };
};
const profile = (o = {}) => ({ sub: "g-123", email: "New.User@Gmail.com", email_verified: true, name: "New User", picture: "http://p/x.png", ...o });
const exchangeAs = (p) => { googleOAuth.profileFromCode = async () => { if (!p) throw new Error("bad"); return p; }; };
const tokensIn = (loc) => new URLSearchParams(loc.split("#")[1] ?? "");

test("start redirects to Google's consent screen with client id, redirect uri, scopes and state", async () => {
  const { start, url } = await flow();
  assert.equal(start.status, 302);
  assert.equal(url.host, "accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), process.env.GOOGLE_CLIENT_ID);
  assert.match(url.searchParams.get("redirect_uri"), /\/api\/auth\/google\/callback$/);
  assert.match(url.searchParams.get("scope"), /email/);
  assert.ok(url.searchParams.get("state"));
});

test("new Google user is created as a viewer and the SPA receives tokens", async () => {
  exchangeAs(profile());
  const { res, loc } = await flow();
  assert.equal(res.status, 302);
  assert.ok(loc.startsWith("http://app.test/auth/google/callback#"), loc);
  assert.ok(tokensIn(loc).get("accessToken") && tokensIn(loc).get("refreshToken"));
  assert.equal(all.length, 1);
  assert.equal(all[0].email, "new.user@gmail.com");
  assert.equal(all[0].role, "viewer");
  assert.equal(all[0].googleId, "g-123");
});

test("existing account with the same verified email is linked, role kept; no duplicate on repeat", async () => {
  const u = wire(new User({ name: "Pat", email: "new.user@gmail.com", password: "secret123", role: "project_manager" }));
  all.push(u);
  exchangeAs(profile());
  assert.ok((await flow()).loc.includes("/auth/google/callback#"));
  assert.equal(u.googleId, "g-123");
  assert.equal(u.role, "project_manager");
  assert.ok((await flow()).loc.includes("/auth/google/callback#"));
  assert.equal(all.length, 1);
});

test("deactivated accounts are sent back to login with an error", async () => {
  all.push(new User({ name: "Off", email: "new.user@gmail.com", password: "secret123", role: "member", isActive: false }));
  exchangeAs(profile());
  const { loc } = await flow();
  assert.ok(loc.startsWith("http://app.test/login?error="));
  assert.match(decodeURIComponent(loc), /deactivated/);
  assert.equal(all[0].googleId, undefined);
});

test("rejects forged state, missing cookie, cancelled consent, bad code, unverified email", async () => {
  exchangeAs(profile());
  for (const attempt of [{ state: "forged" }, { cookie: false }, { query: "error=access_denied" }, { query: "state=x" }]) {
    assert.ok((await flow(attempt)).loc.startsWith("http://app.test/login?error="), JSON.stringify(attempt));
  }
  exchangeAs(null);
  assert.ok((await flow()).loc.startsWith("http://app.test/login?error="));
  exchangeAs(profile({ email_verified: false }));
  assert.ok((await flow()).loc.startsWith("http://app.test/login?error="));
  assert.equal(all.length, 0);
});

test("without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET it explains what to configure", async () => {
  delete process.env.GOOGLE_CLIENT_SECRET;
  const res = await fetch(`${base}/auth/google`, { redirect: "manual" });
  const loc = decodeURIComponent(res.headers.get("location"));
  assert.ok(loc.startsWith("http://app.test/login?error="));
  assert.match(loc, /GOOGLE_CLIENT_SECRET/);
});

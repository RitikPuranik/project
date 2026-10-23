// User-management tests: admin-only CRUD, deactivation, and JWT revocation for inactive users.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-test-refresh-test-refresh";

const { default: User } = await import("../models/User.js");
const { default: userRoutes } = await import("../routes/userRoutes.js");
const { default: authRoutes } = await import("../routes/authRoutes.js");
const { generateAccessToken, generateRefreshToken } = await import("../utils/generateToken.js");

const mk = (role, name) => {
  const u = new User({ name, email: `${name}@t.io`, password: "secret123", role });
  u.save = async () => u; // in-memory: skip hashing/DB
  u.toSafeObject = User.schema.methods.toSafeObject;
  return u;
};
const admin = mk("admin", "admin");
const admin2 = mk("admin", "admin2");
const member = mk("member", "member");
const target = mk("project_manager", "target");
let all = [admin, admin2, member, target];

const sameId = (a, b) => String(a) === String(b);
User.findById = async (id) => all.find((u) => sameId(u._id, id)) ?? null;
User.findOne = async (q) => {
  if (q.email) return all.find((u) => u.email === q.email && (!q._id?.$ne || !sameId(u._id, q._id.$ne))) ?? null;
  return null;
};
User.countDocuments = async (q) =>
  all.filter((u) => !sameId(u._id, q._id.$ne) && u.role === q.role && u.isActive !== false).length;
User.create = async (d) => {
  const u = mk(d.role, d.name);
  u.email = d.email.toLowerCase();
  all.push(u);
  return u;
};
// protect() looks the user up with .select(); give findById a thenable with select().
const findById = User.findById;
User.findById = (id) => {
  const p = findById(id);
  p.select = () => p;
  return p;
};

let server, base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const call = async (user, method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user && { Authorization: `Bearer ${generateAccessToken(user._id, user.role)}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

test("only admins can create, update, deactivate or reactivate users", async () => {
  for (const u of [member, target]) {
    assert.equal((await call(u, "POST", "/users", { name: "x", email: "x@t.io", password: "secret1" })).status, 403);
    assert.equal((await call(u, "PUT", `/users/${member._id}`, { name: "y" })).status, 403);
    assert.equal((await call(u, "PUT", `/users/${member._id}/deactivate`)).status, 403);
    assert.equal((await call(u, "PUT", `/users/${member._id}/activate`)).status, 403);
  }
  assert.equal((await call(null, "POST", "/users", {})).status, 401);
});

test("admin creates a user with a role; validates input and duplicates", async () => {
  const ok = await call(admin, "POST", "/users", { name: "Neo", email: "Neo@T.io", password: "secret1", role: "viewer" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.role, "viewer");
  assert.equal(ok.body.isActive, true);
  assert.equal(ok.body.password, undefined);
  assert.equal((await call(admin, "POST", "/users", { name: "Neo", email: "neo@t.io", password: "secret1" })).status, 400, "duplicate");
  assert.equal((await call(admin, "POST", "/users", { name: "A", email: "bad", password: "secret1" })).status, 400, "email");
  assert.equal((await call(admin, "POST", "/users", { name: "A", email: "a@t.io", password: "123" })).status, 400, "short password");
  assert.equal((await call(admin, "POST", "/users", { name: "A", email: "a@t.io", password: "secret1", role: "root" })).status, 400, "role");
});

test("admin updates name, email and role; can't change own role", async () => {
  const r = await call(admin, "PUT", `/users/${target._id}`, { name: "Renamed", email: "renamed@t.io", role: "member" });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, "Renamed");
  assert.equal(r.body.email, "renamed@t.io");
  assert.equal(r.body.role, "member");
  assert.equal((await call(admin, "PUT", `/users/${admin._id}`, { role: "viewer" })).status, 400);
  assert.equal((await call(admin, "PUT", `/users/${member._id}`, { email: "admin@t.io" })).status, 400, "email taken");
  assert.equal((await call(admin, "PUT", "/users/not-an-id", { name: "x" })).status, 404);
});

test("deactivation: blocks API access with a valid JWT, login and refresh; reactivation restores it", async () => {
  member.refreshToken = generateRefreshToken(member._id);
  const refreshToken = member.refreshToken;
  assert.equal((await call(member, "GET", "/auth/me")).status, 200);

  const d = await call(admin, "PUT", `/users/${member._id}/deactivate`);
  assert.equal(d.status, 200);
  assert.equal(d.body.isActive, false);
  assert.equal(member.refreshToken, null);

  const me = await call(member, "GET", "/auth/me"); // same, still-valid access token
  assert.equal(me.status, 403);
  assert.equal(me.body.code, "ACCOUNT_DEACTIVATED");
  assert.equal((await call(member, "GET", "/users")).status, 403);

  member.matchPassword = async () => true;
  const login = await fetch(`${base}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: member.email, password: "secret123" }),
  });
  assert.equal(login.status, 403);
  const refresh = await fetch(`${base}/auth/refresh`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  assert.ok([401, 403].includes(refresh.status));

  assert.equal((await call(admin, "PUT", `/users/${member._id}/activate`)).status, 200);
  assert.equal((await call(member, "GET", "/auth/me")).status, 200);
});

test("admins can't deactivate themselves or remove the last active admin", async () => {
  assert.equal((await call(admin, "PUT", `/users/${admin._id}/deactivate`)).status, 400);
  assert.equal((await call(admin, "PUT", `/users/${admin2._id}/deactivate`)).status, 200);
  // admin2 is now inactive, so admin is the only active admin
  assert.equal((await call(admin, "PUT", `/users/${admin2._id}/role`, { role: "member" })).status, 200, "inactive admin can be demoted");
  assert.equal((await call(admin2, "GET", "/users")).status, 403, "deactivated admin is locked out");
});

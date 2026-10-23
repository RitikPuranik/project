// Shared test harness: the REAL routers, middleware and controllers served over HTTP with
// real JWTs. Only the database layer is replaced by a small in-memory fake that behaves
// like MongoDB where it matters for these tests:
//   - every read returns an independent copy (so two requests can hold the same stale state)
//   - findOneAndUpdate matches its filter and applies $set/$inc/$push in one synchronous
//     step (atomic, like a single-document write in MongoDB), then validates via the schema
//   - reads yield to the event loop, so concurrent requests really interleave
import { before, after } from "node:test";
import mongoose from "mongoose";
import express from "express";

process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-test-refresh-test-refresh";

const { default: User } = await import("../models/User.js");
const { default: Project } = await import("../models/Project.js");
const { default: Task } = await import("../models/Task.js");
const { default: authRoutes } = await import("../routes/authRoutes.js");
const { default: projectRoutes } = await import("../routes/projectRoutes.js");
const { default: taskRoutes } = await import("../routes/taskRoutes.js");
const { generateAccessToken } = await import("../utils/generateToken.js");

export { Task, Project, User };

const mkUser = (role, name) => {
  const u = new User({ name, email: `${name}@t.io`, password: "secret123", role });
  u.save = async () => u;
  u.toSafeObject = User.schema.methods.toSafeObject;
  return u;
};

// ---- fixtures -------------------------------------------------------------------------
export const admin = mkUser("admin", "admin");
export const pm = mkUser("project_manager", "pm"); // owns the project
export const pm2 = mkUser("project_manager", "pm2"); // global PM, NOT in the project
export const pmPlain = mkUser("project_manager", "pmplain"); // global PM, plain member entry
export const assigned = mkUser("member", "assigned"); // member, assigned to the task
export const other = mkUser("member", "other"); // member of project, not assigned
export const outsider = mkUser("member", "outsider"); // member, not in project
export const viewer = mkUser("viewer", "viewer"); // viewer in project
export const candidateMember = mkUser("member", "candidate"); // added through addMember
const users = [admin, pm, pm2, pmPlain, assigned, other, outsider, viewer, candidateMember];

export const project = new Project({
  name: "P",
  owner: pm._id,
  members: [
    { user: assigned._id, role: "member" },
    { user: other._id, role: "member" },
    { user: viewer._id, role: "member" },
    { user: pmPlain._id, role: "member" },
  ],
});

// ---- fake task collection ---------------------------------------------------------------
let rows = []; // plain objects, like documents in MongoDB
const sameId = (a, b) => String(a) === String(b);
const clone = (row) => new Task(row).toObject(); // deep copy that keeps ObjectIds
const tick = () => new Promise((r) => setImmediate(r));

export const freshTask = () => {
  const t = new Task({
    project: project._id,
    title: "Task",
    description: "d",
    columnId: "todo",
    order: 0,
    assignees: [assigned._id],
    createdBy: pm._id,
  });
  rows = [t.toObject()];
  return t;
};
/** The task as currently stored (fresh copy). */
export const stored = () => Task.hydrate(clone(rows[0]));
export const storedVersion = () => rows[0].version;

const chain = (value) => {
  const c = { then: (res, rej) => Promise.resolve(value).then(res, rej) };
  ["select", "sort", "populate", "limit"].forEach((m) => (c[m] = () => c));
  return c;
};

const matchesVersion = (row, v) => {
  if (typeof v === "number") return (row.version ?? 0) === v;
  if (v && "$exists" in v) return ("version" in row) === v.$exists;
  return true;
};
const matches = (row, f) => {
  if (f._id !== undefined && !sameId(row._id, f._id)) return false;
  if (f.isDeleted !== undefined && row.isDeleted !== f.isDeleted) return false;
  if (f.version !== undefined && !matchesVersion(row, f.version)) return false;
  if (f.$or && !f.$or.some((c) => matchesVersion(row, c.version))) return false;
  if (f["subtasks._id"] !== undefined && !row.subtasks.some((s) => sameId(s._id, f["subtasks._id"]))) return false;
  return true;
};

User.findById = (id) => chain(users.find((u) => sameId(u._id, id)) ?? null);
User.find = (q) => chain(users.filter((u) => (q._id?.$in ?? []).includes(String(u._id))));
User.findOne = () => chain(null);
User.create = async (d) => {
  const u = mkUser(d.role, d.name);
  u.role = d.role;
  return u;
};

Project.findOne = (q) =>
  chain(sameId(q._id, project._id) && q.isDeleted === false ? project : null);
Project.findById = (id) => chain(sameId(id, project._id) ? project : null);
Project.prototype.save = async function () {
  await this.validate();
  return this;
};

Task.findOne = (q) => {
  if (!q._id) return chain(null); // "last task in column" lookup in createTask
  return chain(
    (async () => {
      await tick();
      const row = rows.find((r) => matches(r, q));
      return row ? Task.hydrate(clone(row)) : null;
    })()
  );
};
Task.find = () =>
  chain(rows.filter((r) => !r.isDeleted).map((r) => Task.hydrate(clone(r))));
Task.create = async (d) => {
  const doc = new Task(d);
  rows.push(doc.toObject());
  return doc;
};
Task.prototype.populate = async function () {
  return this;
};

Task.findOneAndUpdate = (filter, update, opts = {}) =>
  chain(
    (async () => {
      await tick();
      // ---- from here to the return is synchronous: one atomic single-document write ----
      const i = rows.findIndex((r) => matches(r, filter));
      if (i === -1) return null;
      const next = clone(rows[i]);
      for (const [k, v] of Object.entries(update.$set ?? {})) {
        if (k === "subtasks.$.done") {
          next.subtasks.find((s) => sameId(s._id, filter["subtasks._id"])).done = v;
        } else next[k] = v;
      }
      for (const [k, v] of Object.entries(update.$inc ?? {})) next[k] = (next[k] ?? 0) + v;
      for (const [k, v] of Object.entries(update.$push ?? {})) next[k] = [...next[k], v];
      const doc = new Task(next); // casts values like Mongoose does for updates
      if (opts.runValidators) await doc.validate();
      rows[i] = { ...doc.toObject(), updatedAt: new Date() };
      return opts.new ? Task.hydrate(clone(rows[i])) : null;
    })()
  );

// ---- app + http helper ------------------------------------------------------------------
let server, base;
export const setup = () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    app.use("/api/projects", projectRoutes);
    app.use("/api/tasks", taskRoutes);
    await new Promise((r) => (server = app.listen(0, r)));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(() => server.close());
};

export const call = async (user, method, path, body) => {
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

export const P = () => `/projects/${project._id}`;
export const T = () => `${P()}/tasks/${rows[0]._id}`;
export const subtaskId = (i = 0) => rows[0].subtasks[i]._id;

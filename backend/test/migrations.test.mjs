// Migration runner (against a tiny in-memory Db) and seed-data validity. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateUp, migrateDown, status, loadMigrations } from "../migrations/runner.js";

const fakeDb = () => {
  const store = {};
  return {
    collection: (n) => ({
      find: () => ({ toArray: async () => [...(store[n] ??= [])] }),
      insertOne: async (d) => void (store[n] ??= []).push(d),
      deleteOne: async (q) => void (store[n] = (store[n] ?? []).filter((r) => r.name !== q.name)),
    }),
  };
};
const calls = [];
const mk = (name) => ({ name, up: async () => void calls.push(`up:${name}`), down: async () => void calls.push(`down:${name}`) });
const ms = [mk("0001_a"), mk("0002_b"), mk("0003_c")];

test("migrations run in order, once, and can be rolled back newest-first", async () => {
  const db = fakeDb();
  assert.deepEqual(await migrateUp(db, ms), ["0001_a", "0002_b", "0003_c"]);
  assert.deepEqual(await migrateUp(db, ms), [], "second run is a no-op");
  assert.deepEqual((await status(db, ms)).map((s) => s.applied), [true, true, true]);
  assert.deepEqual(await migrateDown(db, ms, 2), ["0003_c", "0002_b"]);
  assert.deepEqual((await status(db, ms)).map((s) => s.applied), [true, false, false]);
  assert.deepEqual(await migrateUp(db, ms), ["0002_b", "0003_c"], "re-applies only what was reverted");
  assert.deepEqual(calls.slice(0, 3), ["up:0001_a", "up:0002_b", "up:0003_c"]);
});

test("a failing migration is not recorded", async () => {
  const db = fakeDb();
  const bad = [mk("0001_a"), { name: "0002_bad", up: async () => { throw new Error("boom"); }, down: async () => {} }];
  await assert.rejects(migrateUp(db, bad), /boom/);
  assert.deepEqual((await status(db, bad)).map((s) => s.applied), [true, false]);
});

test("real migration files load in order with up/down", async () => {
  const real = await loadMigrations();
  assert.ok(real.length >= 2);
  assert.deepEqual(real.map((m) => m.name), [...real.map((m) => m.name)].sort());
  for (const m of real) assert.equal(typeof m.up === "function" && typeof m.down === "function", true);
});

test("seed data satisfies the real models and covers every role and an archived project", async () => {
  const { USERS, PROJECTS, PASSWORD } = await import("../seed/demoData.js");
  const { default: User } = await import("../modules/users/user.model.js");
  const { default: Project } = await import("../modules/projects/project.model.js");
  const { default: Task } = await import("../modules/tasks/task.model.js");
  assert.ok(PASSWORD.length >= 6);
  assert.deepEqual([...new Set(USERS.map((u) => u.role))].sort(), ["admin", "member", "project_manager", "viewer"]);
  const ids = Object.fromEntries(USERS.map((u) => [u.key, new User()._id]));
  for (const u of USERS) await new User({ ...u, password: PASSWORD }).validate();
  assert.ok(PROJECTS.some((p) => p.isArchived));
  for (const p of PROJECTS) {
    const proj = new Project({ name: p.name, owner: ids[p.owner], members: p.members.map((m) => ({ user: ids[m.user], role: m.role })) });
    await proj.validate();
    for (const t of p.tasks) {
      assert.ok(proj.columns.some((c) => c.id === t.columnId), `column ${t.columnId}`);
      await new Task({
        ...t, project: proj._id, createdBy: ids[p.owner], assignees: (t.assignees ?? []).map((k) => ids[k]),
        comments: (t.comments ?? []).map((c) => ({ author: ids[c.author], text: c.text })),
      }).validate();
    }
  }
});

test("bulk generator is deterministic, large, valid against the models, and internally consistent", async () => {
  const { generateBulk } = await import("../seed/bulkData.js");
  const { default: User } = await import("../modules/users/user.model.js");
  const { default: Project } = await import("../modules/projects/project.model.js");
  const { default: Task } = await import("../modules/tasks/task.model.js");
  const a = generateBulk(1), b = generateBulk(1);
  assert.equal(a.tasks.length, b.tasks.length);
  assert.deepEqual(a.tasks.slice(0, 5).map((t) => t.title), b.tasks.slice(0, 5).map((t) => t.title));
  assert.ok(a.users.length >= 40 && a.projects.length >= 20 && a.tasks.length >= 1000, `${a.users.length}/${a.projects.length}/${a.tasks.length}`);
  assert.ok(generateBulk(2).tasks.length > a.tasks.length * 1.5, "scale grows the data");
  assert.equal(new Set(a.users.map((u) => u.email)).size, a.users.length, "unique emails");
  const byId = new Map(a.users.map((u) => [String(u._id), u]));
  for (const u of a.users.slice(0, 50)) await new User({ ...u, password: "secret123" }).validate();
  for (const p of a.projects) {
    await new Project(p).validate();
    assert.equal(byId.get(String(p.owner)).role, "admin");
    for (const m of p.members) {
      const role = byId.get(String(m.user)).role;
      assert.ok(m.role !== "project_manager" || role === "project_manager", "project managers hold the global PM role");
    }
  }
  const pids = new Set(a.projects.map((p) => String(p._id)));
  for (const t of a.tasks.slice(0, 300)) {
    await new Task(t).validate();
    assert.ok(pids.has(String(t.project)));
    const proj = a.projects.find((p) => String(p._id) === String(t.project));
    const doers = new Set(proj.members.filter((m) => m.role !== "viewer").map((m) => String(m.user)));
    for (const asg of t.assignees) assert.ok(doers.has(String(asg)), "assignees are working members");
  }
});

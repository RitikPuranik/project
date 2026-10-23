// New workspace endpoints: project members / available members, "my tasks", task search +
// paging headers, and permanent project deletion. Only the model layer is stubbed (same
// approach as helpers.mjs); routers, access checks and controllers are the real ones.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { setup, call, freshTask, stored, storedVersion, admin, pm, assigned, outsider, candidateMember, project, Project, Task, User } from "./helpers.mjs";

setup();

// A thenable query double that records what the controller asked for.
const query = (value) => {
  const q = { then: (res, rej) => Promise.resolve(value).then(res, rej) };
  for (const m of ["select", "sort", "populate", "limit", "skip"]) q[m] = (...a) => ((q.calls ??= []).push([m, ...a]), q);
  return q;
};

describe("GET /projects/:id/members", () => {
  it("lists the owner and members for any participant, 403 for outsiders", async () => {
    const ok = await call(assigned, "GET", `/projects/${project._id}/members`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.members.length, project.members.length);
    assert.ok(ok.body.owner);
    const denied = await call(outsider, "GET", `/projects/${project._id}/members`);
    assert.equal(denied.status, 403);
  });
});

describe("GET /projects/:id/available-members", () => {
  it("is for managers only and excludes admins and current participants", async () => {
    let seen;
    User.find = (f) => ((seen = f), query([candidateMember]));
    const res = await call(pm, "GET", `/projects/${project._id}/available-members?search=can`);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.deepEqual(seen.role, { $ne: "admin" });
    assert.deepEqual(seen.isActive, { $ne: false });
    assert.equal(seen._id.$nin.length, project.members.length + 1); // owner + members
    assert.ok(seen.$or[0].name instanceof RegExp);
    assert.equal((await call(assigned, "GET", `/projects/${project._id}/available-members`)).status, 403);
  });
});

describe("GET /tasks/mine", () => {
  it("returns the caller's tasks with a slim project object; admins are not scoped to membership", async () => {
    freshTask();
    const scopes = [];
    Project.find = (f) => (scopes.push(f), query([project]));
    const asMember = await call(assigned, "GET", "/tasks/mine");
    assert.equal(asMember.status, 200);
    assert.equal(asMember.body.length, 1);
    assert.equal(asMember.body[0].project.name, "P");
    assert.ok(Array.isArray(asMember.body[0].project.columns));
    assert.ok(scopes[0].$or, "non-admins are scoped to projects they own or belong to");

    await call(admin, "GET", "/tasks/mine");
    assert.equal(scopes[1].$or, undefined, "admins see every project's tasks assigned to them");
  });
});

describe("GET /projects/:id/tasks filters and paging", () => {
  it("supports search, assignee=none, column filter and opt-in paging headers", async () => {
    freshTask();
    let filter;
    let q;
    Task.find = (f) => ((filter = f), (q = query([])));
    Task.countDocuments = async () => 23;
    const res = await call(pm, "GET", `/projects/${project._id}/tasks?search=login&assignee=none&columnId=todo&page=2&limit=10`);
    assert.equal(res.status, 200);
    assert.deepEqual(filter.assignees, { $size: 0 });
    assert.equal(filter.columnId, "todo");
    assert.ok(filter.$or[0].title instanceof RegExp);
    assert.equal(res.headers.get("x-total-count"), "23");
    assert.equal(res.headers.get("x-total-pages"), "3");
    assert.deepEqual(q.calls.find((c) => c[0] === "skip"), ["skip", 10]);
    assert.deepEqual(q.calls.find((c) => c[0] === "limit"), ["limit", 10]);

    const plain = await call(pm, "GET", `/projects/${project._id}/tasks`);
    assert.equal(plain.headers.get("x-total-count"), null, "no paging headers unless the client asks");
  });

  it("treats the search text literally (no regex injection)", async () => {
    let filter;
    Task.find = (f) => ((filter = f), query([]));
    await call(pm, "GET", `/projects/${project._id}/tasks?search=${encodeURIComponent("(a+)+$")}`);
    assert.equal(filter.$or[0].title.test("(a+)+$"), true);
    assert.equal(filter.$or[0].title.test("aaaa"), false);
  });
});

describe("DELETE /projects/:id?permanent=true", () => {
  it("is admin-only and removes the project together with its tasks", async () => {
    const calls = [];
    Task.deleteMany = async (f) => calls.push(["tasks", String(f.project)]);
    Project.deleteOne = async (f) => calls.push(["project", String(f._id)]);
    assert.equal((await call(pm, "DELETE", `/projects/${project._id}?permanent=true`)).status, 403);
    assert.equal(calls.length, 0);
    const res = await call(admin, "DELETE", `/projects/${project._id}?permanent=true`);
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [["tasks", String(project._id)], ["project", String(project._id)]]);
  });
});

describe("PUT /tasks/:id/move without an order", () => {
  it("appends the task to the end of the target column", async () => {
    freshTask();
    const res = await call(pm, "PUT", `/tasks/${stored()._id}/move`, { columnId: "done", version: storedVersion() });
    assert.equal(res.status, 200);
    assert.equal(stored().columnId, "done");
    assert.equal(stored().order, 0); // empty column -> first slot
    const bad = await call(pm, "PUT", `/tasks/${stored()._id}/move`, { columnId: "done", order: "x", version: storedVersion() });
    assert.equal(bad.status, 400);
  });
});

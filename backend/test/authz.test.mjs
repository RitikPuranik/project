// Authorization regression tests (roles & permissions). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup, call, P, T, freshTask, stored, storedVersion as ver, subtaskId,
  admin, pm, pm2, pmPlain, assigned, other, outsider, viewer, candidateMember, inactive, projViewer, commentIds,
} from "./helpers.mjs";

setup();

const expectStatus = async (promise, status, label) =>
  assert.equal((await promise).status, status, label);

test("unauthenticated requests are rejected", async () => {
  freshTask();
  await expectStatus(call(null, "GET", P()), 401);
  await expectStatus(call(null, "PUT", T(), { title: "x", version: 0 }), 401);
});

test("outsiders (not in project) cannot read or write anything", async () => {
  freshTask();
  for (const u of [outsider, pm2]) {
    await expectStatus(call(u, "GET", P()), 403, `${u.name} getProject`);
    await expectStatus(call(u, "GET", T()), 403, `${u.name} getTask`);
    await expectStatus(call(u, "GET", `${P()}/tasks`), 403, `${u.name} list`);
    await expectStatus(call(u, "POST", `${P()}/tasks`, { title: "x" }), 403, `${u.name} create`);
    await expectStatus(call(u, "PUT", T(), { title: "x", version: 0 }), 403, `${u.name} update`);
    await expectStatus(call(u, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: 0 }), 403, `${u.name} move`);
    await expectStatus(call(u, "DELETE", `${T()}?version=0`), 403, `${u.name} delete`);
    await expectStatus(call(u, "POST", `${T()}/comments`, { text: "hi" }), 403, `${u.name} comment`);
  }
  await call(outsider, "PUT", `/tasks/x`, {}); // malformed id must not crash
  await expectStatus(call(outsider, "PUT", `/tasks/${stored()._id}`, { title: "x", version: 0 }), 403);
});

test("viewer is read-only on every task endpoint", async () => {
  freshTask();
  await expectStatus(call(viewer, "GET", P()), 200);
  await expectStatus(call(viewer, "GET", T()), 200);
  await expectStatus(call(viewer, "POST", `${P()}/tasks`, { title: "x" }), 403);
  await expectStatus(call(viewer, "PUT", T(), { description: "x", version: 0 }), 403);
  await expectStatus(call(viewer, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: 0 }), 403);
  await expectStatus(call(viewer, "DELETE", `${T()}?version=0`), 403);
  await expectStatus(call(viewer, "POST", `${T()}/subtasks`, { title: "s" }), 403);
  await expectStatus(call(viewer, "POST", `${T()}/comments`, { text: "hi" }), 403);
});

test("team member who is NOT assigned: read + comment only", async () => {
  freshTask();
  await expectStatus(call(other, "GET", T()), 200);
  await expectStatus(call(other, "POST", `${P()}/tasks`, { title: "x" }), 403, "create");
  await expectStatus(call(other, "PUT", T(), { description: "x", version: ver() }), 403, "update");
  await expectStatus(call(other, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: ver() }), 403, "move");
  await expectStatus(call(other, "POST", `${T()}/subtasks`, { title: "s" }), 403, "addSubtask");
  await expectStatus(call(other, "DELETE", `${T()}?version=${ver()}`), 403, "delete");
  await expectStatus(call(other, "POST", `${T()}/comments`, { text: "hello" }), 200, "comment");
  assert.equal(stored().comments.length, 1);
  assert.equal(stored().description, "d");
});

test("team member assigned to the task: limited edits, status, subtasks, comments", async () => {
  freshTask();
  await expectStatus(call(assigned, "POST", `${P()}/tasks`, { title: "x" }), 403, "create");
  await expectStatus(call(assigned, "DELETE", `${T()}?version=${ver()}`), 403, "delete");

  await expectStatus(call(assigned, "PUT", T(), { description: "new", version: ver() }), 200, "allowed field");
  assert.equal(stored().description, "new");

  for (const body of [
    { title: "hijack" },
    { priority: "critical" },
    { assignees: [assigned._id, other._id] },
    { dueDate: "2030-01-01" },
    { type: "bug" },
  ]) {
    await expectStatus(call(assigned, "PUT", T(), { ...body, version: ver() }), 403, `restricted ${Object.keys(body)}`);
  }
  assert.equal(stored().title, "Task");
  assert.deepEqual(stored().assignees.map(String), [String(assigned._id)]);

  // The UI's edit form re-sends every field: unchanged restricted fields must not trip the guard.
  const t = stored();
  await expectStatus(
    call(assigned, "PUT", T(), {
      title: "Task", description: "again", priority: t.priority, type: t.type, dueDate: null,
      storyPoints: 3, assignees: [String(assigned._id)], labels: [], version: ver(),
    }),
    200,
    "full unchanged form"
  );
  assert.equal(stored().storyPoints, 3);

  await expectStatus(call(assigned, "PUT", `${T()}/move`, { columnId: "in_progress", order: 5, version: ver() }), 200, "move");
  assert.equal(stored().columnId, "in_progress");
  await expectStatus(call(assigned, "PUT", `${T()}/move`, { columnId: "nope", order: 5, version: ver() }), 400, "bad column");

  await expectStatus(call(assigned, "POST", `${T()}/subtasks`, { title: "s1" }), 200, "addSubtask");
  await expectStatus(call(assigned, "PUT", `${T()}/subtasks/${subtaskId()}`, { version: ver() }), 200, "toggle");
  assert.equal(stored().subtasks[0].done, true);
  await expectStatus(call(assigned, "POST", `${T()}/comments`, { text: "done soon" }), 200, "comment");
});

test("project manager (owner): full control inside own project, with validated assignees", async () => {
  freshTask();
  const created = await call(pm, "POST", `${P()}/tasks`, { title: "New", columnId: "todo", assignees: [String(assigned._id)] });
  assert.equal(created.status, 201);
  assert.equal(created.body.version, 0, "new tasks start at version 0");
  await expectStatus(call(pm, "POST", `${P()}/tasks`, { title: "x", assignees: [String(outsider._id)] }), 400, "outsider assignee");
  await expectStatus(call(pm, "POST", `${P()}/tasks`, { title: "x", columnId: "bogus" }), 400, "bad column");

  await expectStatus(call(pm, "PUT", T(), { title: "Renamed", priority: "high", assignees: [String(other._id)], version: ver() }), 200, "update+assign");
  assert.equal(stored().title, "Renamed");
  assert.deepEqual(stored().assignees.map(String), [String(other._id)]);
  await expectStatus(call(pm, "PUT", T(), { assignees: [String(outsider._id)], version: ver() }), 400, "assign outsider");
  await expectStatus(call(pm, "PUT", T(), { priority: "bogus", version: ver() }), 400, "schema validation → 400");
  await expectStatus(call(pm, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: ver() }), 200, "move any task");
  await expectStatus(call(pm, "POST", `${T()}/comments`, { text: "ok" }), 200, "comment");
  await expectStatus(call(pm, "DELETE", `${T()}?version=${ver()}`), 200, "delete");
  await expectStatus(call(pm, "GET", T()), 404, "deleted task is gone");
});

test("a global PM who is only a plain member of this project gets member powers, not manager powers", async () => {
  freshTask();
  await expectStatus(call(pmPlain, "GET", P()), 200);
  await expectStatus(call(pmPlain, "POST", `${P()}/tasks`, { title: "x" }), 403);
  await expectStatus(call(pmPlain, "PUT", T(), { title: "x", version: ver() }), 403);
  await expectStatus(call(pmPlain, "DELETE", `${T()}?version=${ver()}`), 403);
  await expectStatus(call(pmPlain, "PUT", P(), { name: "x" }), 403);
  await expectStatus(call(pmPlain, "POST", `${P()}/members`, { userId: String(candidateMember._id) }), 403);
});

test("admin can do everything in any project", async () => {
  freshTask();
  await expectStatus(call(admin, "GET", P()), 200);
  await expectStatus(call(admin, "POST", `${P()}/tasks`, { title: "x" }), 201);
  await expectStatus(call(admin, "PUT", T(), { title: "y", priority: "low", version: ver() }), 200);
  await expectStatus(call(admin, "PUT", `${T()}/move`, { columnId: "review", order: 2, version: ver() }), 200);
  await expectStatus(call(admin, "POST", `${T()}/comments`, { text: "admin" }), 200);
  await expectStatus(call(admin, "DELETE", `${T()}?version=${ver()}`), 200);
});

test("project management: members of a project can't manage it; PM can't mint managers", async () => {
  freshTask();
  await expectStatus(call(assigned, "PUT", P(), { name: "x" }), 403);
  await expectStatus(call(assigned, "DELETE", P()), 403);
  await expectStatus(call(assigned, "POST", `${P()}/members`, { userId: String(candidateMember._id) }), 403);
  await expectStatus(call(pm, "POST", `${P()}/members`, { userId: String(candidateMember._id), role: "project_manager" }), 403, "PM can't assign project managers");
  await expectStatus(call(admin, "POST", `${P()}/members`, { userId: String(candidateMember._id), role: "project_manager" }), 400, "global member can't become project manager");
  await expectStatus(call(pm, "POST", `${P()}/members`, { userId: "not-an-id" }), 400);
  await expectStatus(call(pm, "POST", `${P()}/members`, { userId: String(candidateMember._id) }), 200, "PM adds member");
});

test("registration ignores a requested role", async () => {
  for (const role of ["project_manager", "admin"]) {
    const r = await call(null, "POST", "/auth/register", { name: "Eve", email: "eve@t.io", password: "secret123", role });
    assert.equal(r.status, 201);
    assert.equal(r.body.user.role, "viewer");
  }
});

test("project-level viewer is read-only; viewers and deactivated users can't be assigned", async () => {
  freshTask();
  await expectStatus(call(projViewer, "GET", T()), 200);
  await expectStatus(call(projViewer, "POST", `${T()}/comments`, { text: "hi" }), 403, "comment");
  await expectStatus(call(projViewer, "PUT", T(), { description: "x", version: ver() }), 403, "update");
  await expectStatus(call(projViewer, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: ver() }), 403, "move");
  await expectStatus(call(pm, "POST", `${P()}/tasks`, { title: "x", assignees: [String(projViewer._id)] }), 400, "project viewer assignee");
  await expectStatus(call(pm, "POST", `${P()}/tasks`, { title: "x", assignees: [String(viewer._id)] }), 400, "global viewer assignee");
  await expectStatus(call(pm, "POST", `${P()}/tasks`, { title: "x", assignees: [String(inactive._id)] }), 400, "deactivated assignee");
  await expectStatus(call(pm, "PUT", T(), { assignees: [String(inactive._id)], version: ver() }), 400, "assign deactivated on update");
});

test("comments: participants read, commenters add, authors delete own, managers moderate, viewers/outsiders blocked", async () => {
  freshTask();
  await expectStatus(call(viewer, "GET", T()), 200, "viewer reads comments");
  await expectStatus(call(outsider, "GET", T()), 403, "outsider can't read");
  await expectStatus(call(assigned, "POST", `${T()}/comments`, { text: "a" }), 200);
  await expectStatus(call(other, "POST", `${T()}/comments`, { text: "b" }), 200);
  await expectStatus(call(pm, "POST", `${T()}/comments`, { text: "c" }), 200);
  await expectStatus(call(assigned, "POST", `${T()}/comments`, { text: "   " }), 400, "blank");
  await expectStatus(call(assigned, "POST", `${T()}/comments`, { text: "x".repeat(2001) }), 400, "too long");
  const [a, b, c] = commentIds();
  const del = (u, id) => call(u, "DELETE", `${T()}/comments/${id}`);

  await expectStatus(del(viewer, a), 403, "viewer");
  await expectStatus(del(outsider, a), 403, "outsider");
  await expectStatus(del(other, a), 403, "member deleting someone else's comment");
  await expectStatus(del(assigned, "not-an-id"), 404);
  await expectStatus(del(assigned, a), 200, "author deletes own");
  await expectStatus(del(assigned, a), 404, "already gone");
  await expectStatus(del(pm, b), 200, "PM moderates");
  await expectStatus(del(admin, c), 200, "admin moderates");
  assert.equal(commentIds().length, 0);
});

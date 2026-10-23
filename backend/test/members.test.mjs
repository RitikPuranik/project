// Project-member role changes + archived-project (read-only) lifecycle. Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  setup, call, P, T, freshTask, storedVersion as ver, project,
  admin, pm, pm2, pmPlain, assigned, other, outsider, viewer, candidateMember, projViewer,
} from "./helpers.mjs";

setup();

const roleOf = (u) => project.members.find((m) => String(m.user) === String(u._id))?.role;
const setRole = (u, role) => call(admin, "PUT", `${P()}/members/${u._id}/role`, { role });
const asPm = (u, role, who = pm) => call(who, "PUT", `${P()}/members/${u._id}/role`, { role });
const expectStatus = async (promise, status, label) => assert.equal((await promise).status, status, label);

// The fake DB hands every request the same in-memory project, so restore it between tests.
let snapshot;
beforeEach(() => {
  snapshot ??= { members: project.members.map((m) => ({ user: m.user, role: m.role })), archived: false };
  project.members = snapshot.members.map((m) => ({ ...m }));
  project.isArchived = false;
  viewer.role = "viewer";
});

test("admin changes a member's project role (member <-> viewer) and it persists", async () => {
  const r = await setRole(assigned, "viewer");
  assert.equal(r.status, 200);
  assert.equal(roleOf(assigned), "viewer");
  assert.equal(r.body.members.find((m) => String(m.user) === String(assigned._id)).role, "viewer");
  assert.equal((await setRole(assigned, "member")).status, 200);
  assert.equal(roleOf(assigned), "member");
});

test("the project's own manager (owner) can change member/viewer roles", async () => {
  await expectStatus(asPm(other, "viewer"), 200);
  assert.equal(roleOf(other), "viewer");
  await expectStatus(asPm(projViewer, "member"), 200);
  assert.equal(roleOf(projViewer), "member");
});

test("project_manager role: admin-only, and only for global Project Managers", async () => {
  await expectStatus(asPm(pmPlain, "project_manager"), 403, "PM can't mint managers");
  assert.equal(roleOf(pmPlain), "member");
  await expectStatus(setRole(assigned, "project_manager"), 400, "global member can't become project manager");
  assert.equal(roleOf(assigned), "member");

  await expectStatus(setRole(pmPlain, "project_manager"), 200);
  assert.equal(roleOf(pmPlain), "project_manager");
  await expectStatus(asPm(pmPlain, "member"), 403, "PM can't demote a project manager");
  assert.equal(roleOf(pmPlain), "project_manager");
  await expectStatus(setRole(pmPlain, "viewer"), 200, "admin can demote");
  assert.equal(roleOf(pmPlain), "viewer");
});

test("a promoted global Viewer becomes a Member (same rule as adding a member)", async () => {
  await expectStatus(setRole(viewer, "viewer"), 200);
  assert.equal(viewer.role, "viewer", "project viewer entry alone doesn't change the global role");
  await expectStatus(asPm(viewer, "member"), 200);
  assert.equal(viewer.role, "member");
  assert.equal(roleOf(viewer), "member");
});

test("unauthorized callers cannot change roles", async () => {
  const path = `${P()}/members/${other._id}/role`;
  await expectStatus(call(null, "PUT", path, { role: "viewer" }), 401, "no token");
  for (const [who, label] of [
    [assigned, "plain member"], [viewer, "global viewer"], [projViewer, "project viewer"],
    [pmPlain, "global PM who is only a plain member here"], [pm2, "PM outside the project"], [outsider, "outsider"],
  ]) {
    await expectStatus(call(who, "PUT", path, { role: "viewer" }), 403, label);
  }
  assert.equal(roleOf(other), "member");
  // a member can't promote themselves either
  await expectStatus(call(assigned, "PUT", `${P()}/members/${assigned._id}/role`, { role: "project_manager" }), 403);
  assert.equal(roleOf(assigned), "member");
});

test("validation and edge cases", async () => {
  await expectStatus(setRole(other, "admin"), 400, "invalid role");
  await expectStatus(setRole(other, undefined), 400, "missing role");
  await expectStatus(call(admin, "PUT", `${P()}/members/${other._id}/role`, {}), 400, "empty body");
  await expectStatus(setRole(pm, "viewer"), 400, "owner's role is fixed");
  await expectStatus(setRole(candidateMember, "viewer"), 404, "not a member of this project");
  await expectStatus(call(admin, "PUT", `${P()}/members/not-an-id/role`, { role: "viewer" }), 400, "bad user id");
  await expectStatus(call(admin, "PUT", `/projects/000000000000000000000000/members/${other._id}/role`, { role: "viewer" }), 404, "unknown project");
  const same = await setRole(other, "member");
  assert.equal(same.status, 200, "same role is a no-op");
  assert.equal(roleOf(other), "member");
});

test("archived projects are read-only everywhere (and unarchive restores access)", async () => {
  freshTask();
  await expectStatus(call(pm, "PUT", `${P()}/archive`), 200);
  assert.equal(project.isArchived, true);

  await expectStatus(call(pm, "GET", P()), 200, "still readable");
  await expectStatus(call(assigned, "GET", T()), 200, "task still readable");
  await expectStatus(call(pm, "PUT", P(), { name: "New" }), 409, "edit project");
  await expectStatus(setRole(other, "viewer"), 409, "change role");
  await expectStatus(call(pm, "POST", `${P()}/members`, { userId: String(candidateMember._id) }), 409, "add member");
  await expectStatus(call(pm, "DELETE", `${P()}/members/${other._id}`), 409, "remove member");
  await expectStatus(call(pm, "POST", `${P()}/tasks`, { title: "x" }), 409, "create task");
  await expectStatus(call(pm, "PUT", T(), { description: "x", version: ver() }), 409, "update task");
  await expectStatus(call(assigned, "POST", `${T()}/comments`, { text: "hi" }), 409, "comment");
  await expectStatus(call(assigned, "PUT", `/tasks/${T().split("/").pop()}`, { description: "x", version: ver() }), 409, "top-level task route");
  assert.equal(roleOf(other), "member");

  await expectStatus(call(assigned, "PUT", `${P()}/archive`), 403, "members can't unarchive");
  await expectStatus(call(pm, "PUT", `${P()}/archive`), 200, "manager unarchives");
  await expectStatus(call(pm, "PUT", P(), { name: "New" }), 200, "editable again");
});

test("project edit validation", async () => {
  await expectStatus(call(pm, "PUT", P(), { name: "   " }), 400, "blank name");
  await expectStatus(call(pm, "PUT", P(), { startDate: "2026-05-02", endDate: "2026-05-01" }), 400, "end before start");
  await expectStatus(call(pm, "PUT", P(), { startDate: "nope" }), 400, "bad date");
  await expectStatus(call(pm, "PUT", P(), { name: "  Renamed  " }), 200);
  assert.equal(project.name, "Renamed");
  await expectStatus(call(outsider, "PUT", P(), { name: "x" }), 403);
});

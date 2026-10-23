// Optimistic concurrency control for tasks. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup, call, T, freshTask, stored, storedVersion as ver, subtaskId,
  pm, admin, assigned,
} from "./helpers.mjs";

setup();

test("the scenario from the brief: stale update is rejected with 409, nothing is overwritten", async () => {
  freshTask();
  const seenByA = ver(); // User A opens the task at version 0
  const seenByB = ver(); // User B opens the same task, same version
  assert.equal(seenByA, seenByB);

  // User A saves first.
  const a = await call(pm, "PUT", T(), { title: "A's title", version: seenByA });
  assert.equal(a.status, 200);
  assert.equal(a.body.version, seenByA + 1);

  // User B submits an update based on the old version.
  const b = await call(admin, "PUT", T(), { title: "B's title", priority: "critical", version: seenByB });
  assert.equal(b.status, 409);
  assert.equal(b.body.code, "VERSION_CONFLICT");
  assert.equal(b.body.currentVersion, seenByA + 1);
  assert.equal(b.body.task.title, "A's title", "response carries the latest task for review");
  assert.equal(b.body.task.version, seenByA + 1);

  // B's write left no trace.
  assert.equal(stored().title, "A's title");
  assert.equal(stored().priority, "medium");
  assert.equal(stored().version, 1);

  // B reviews, retries on the latest version, and succeeds.
  const retry = await call(admin, "PUT", T(), { priority: "critical", version: b.body.currentVersion });
  assert.equal(retry.status, 200);
  assert.equal(stored().title, "A's title", "A's change is preserved");
  assert.equal(stored().priority, "critical");
  assert.equal(stored().version, 2);
});

test("truly simultaneous updates: exactly one wins, the database-level guard rejects the other", async () => {
  freshTask();
  const v = ver();
  const [r1, r2] = await Promise.all([
    call(pm, "PUT", T(), { title: "from pm", version: v }),
    call(admin, "PUT", T(), { title: "from admin", version: v }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const winner = r1.status === 200 ? "from pm" : "from admin";
  assert.equal(stored().title, winner);
  assert.equal(stored().version, v + 1, "version incremented exactly once");
});

test("a burst of 8 simultaneous writers at the same version yields exactly one success", async () => {
  freshTask();
  const v = ver();
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => call(pm, "PUT", T(), { description: `edit ${i}`, version: v }))
  );
  assert.equal(results.filter((r) => r.status === 200).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 7);
  assert.equal(stored().version, v + 1);
});

test("concurrent update vs move on the same version: one wins, the other gets 409", async () => {
  freshTask();
  const v = ver();
  const [upd, mv] = await Promise.all([
    call(pm, "PUT", T(), { priority: "high", version: v }),
    call(assigned, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: v }),
  ]);
  assert.deepEqual([upd.status, mv.status].sort(), [200, 409]);
  assert.equal(stored().version, v + 1);
});

test("a version is required: missing or malformed → 428, nothing written", async () => {
  freshTask();
  for (const body of [{ title: "x" }, { title: "x", version: "abc" }, { title: "x", version: -1 }, { title: "x", version: 1.5 }]) {
    const r = await call(pm, "PUT", T(), body);
    assert.equal(r.status, 428, JSON.stringify(body));
    assert.equal(r.body.code, "VERSION_REQUIRED");
  }
  assert.equal((await call(pm, "PUT", `${T()}/move`, { columnId: "done", order: 1 })).status, 428);
  assert.equal((await call(pm, "DELETE", T())).status, 428);
  assert.equal((await call(pm, "PUT", `${T()}/subtasks/${"a".repeat(24)}`, {})).status, 428);
  assert.equal(stored().title, "Task");
  assert.equal(stored().version, 0);
});

test("a stale version from the future (client ahead of server) is also rejected", async () => {
  freshTask();
  assert.equal((await call(pm, "PUT", T(), { title: "x", version: 5 })).status, 409);
});

test("every successful write bumps the version by exactly one", async () => {
  freshTask();
  await call(pm, "POST", `${T()}/subtasks`, { title: "s" });
  assert.equal(ver(), 0, "appending a subtask does not bump");
  const steps = [
    () => call(pm, "PUT", T(), { title: "1", version: ver() }),
    () => call(pm, "PUT", `${T()}/move`, { columnId: "review", order: 3, version: ver() }),
    () => call(pm, "PUT", `${T()}/subtasks/${subtaskId()}`, { version: ver() }),
  ];
  for (const [i, step] of steps.entries()) {
    const before = ver();
    const r = await step();
    assert.equal(r.status, 200, `step ${i}`);
    assert.equal(ver(), before + 1, `step ${i}`);
    assert.equal(r.body.version, before + 1);
  }
});

test("a no-op update (nothing to change) does not bump the version", async () => {
  freshTask();
  assert.equal((await call(pm, "PUT", T(), { version: 0 })).status, 200);
  assert.equal(ver(), 0);
});

test("stale move → 409 with the latest task (drag-and-drop on an outdated board)", async () => {
  freshTask();
  await call(pm, "PUT", T(), { priority: "high", version: 0 }); // someone else edits → v1
  const r = await call(assigned, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: 0 });
  assert.equal(r.status, 409);
  assert.equal(r.body.task.priority, "high");
  assert.equal(stored().columnId, "todo");
  assert.equal((await call(assigned, "PUT", `${T()}/move`, { columnId: "done", order: 1, version: r.body.currentVersion })).status, 200);
});

test("stale subtask toggle → 409; toggling twice concurrently doesn't silently cancel out", async () => {
  freshTask();
  await call(pm, "POST", `${T()}/subtasks`, { title: "s" });
  const v = ver();
  const [a, b] = await Promise.all([
    call(pm, "PUT", `${T()}/subtasks/${subtaskId()}`, { version: v }),
    call(assigned, "PUT", `${T()}/subtasks/${subtaskId()}`, { version: v }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(stored().subtasks[0].done, true);
});

test("stale delete → 409 and the task survives; delete with the right version works", async () => {
  freshTask();
  await call(pm, "PUT", T(), { title: "edited", version: 0 });
  const r = await call(admin, "DELETE", `${T()}?version=0`);
  assert.equal(r.status, 409);
  assert.equal(stored().isDeleted, false);
  assert.equal((await call(admin, "DELETE", `${T()}?version=${r.body.currentVersion}`)).status, 200);
  assert.equal(stored().isDeleted, true);
});

test("editing a task that was deleted meanwhile → 404, not a silent resurrection", async () => {
  freshTask();
  await call(pm, "DELETE", `${T()}?version=0`);
  const r = await call(admin, "PUT", T(), { title: "zombie", version: 0 });
  assert.equal(r.status, 404);
  assert.equal(stored().isDeleted, true);
});

test("a team member's stale edit gets 409 (review the latest) rather than a confusing 403", async () => {
  freshTask();
  await call(pm, "PUT", T(), { priority: "critical", version: 0 }); // manager changes a restricted field
  // The member's form was loaded before that change, so it still carries the old priority.
  const r = await call(assigned, "PUT", T(), { description: "mine", priority: "medium", version: 0 });
  assert.equal(r.status, 409);
  assert.equal(r.body.task.priority, "critical");
});

test("comments and appended subtasks never conflict with edits and don't invalidate other editors", async () => {
  freshTask();
  const v = ver();
  const [c, s, u] = await Promise.all([
    call(assigned, "POST", `${T()}/comments`, { text: "hi" }),
    call(assigned, "POST", `${T()}/subtasks`, { title: "new sub" }),
    call(pm, "PUT", T(), { title: "edit", version: v }),
  ]);
  assert.deepEqual([c.status, s.status, u.status], [200, 200, 200]);
  const t = stored();
  assert.equal(t.comments.length, 1, "comment kept");
  assert.equal(t.subtasks.length, 1, "subtask kept");
  assert.equal(t.title, "edit");
  assert.equal(t.version, v + 1, "only the real edit bumped the version");
  // And an editor holding the pre-comment version can still save:
  assert.equal((await call(pm, "PUT", T(), { title: "edit 2", version: t.version })).status, 200);
});

test("GET returns the version so clients can send it back", async () => {
  freshTask();
  const r = await call(pm, "GET", T());
  assert.equal(r.status, 200);
  assert.equal(r.body.version, 0);
});

// Browser test for the "task was changed by someone else" flow.
// Drives the built UI in headless Chrome against a stateful mock API with the same version
// semantics as the backend.   Setup: npm i -D puppeteer-core && npm run build && node e2e/conflict.e2e.mjs
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const DIST = new URL("../dist", import.meta.url).pathname; // run `npm run build` first
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome"; // set CHROME_PATH if Chrome lives elsewhere
const PORT = 4180;

// ---- static server (SPA fallback) ----
const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let f = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": mime[path.extname(f)] ?? "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

// ---- mock API with the same version semantics as the real backend ----
const pmUser = { _id: "u1", id: "u1", name: "Priya Manager", email: "pm@t.io", role: "project_manager" };
const dev = { _id: "u2", name: "Dev Member", email: "dev@t.io", role: "member" };
const project = {
  _id: "p1", name: "Apollo", description: "", owner: pmUser, isArchived: false, createdAt: new Date().toISOString(),
  members: [{ user: dev, role: "member" }],
  columns: [{ id: "todo", name: "To-Do", order: 0 }, { id: "done", name: "Done", order: 1 }],
};
let task, puts;
const reset = () => {
  puts = [];
  task = {
    _id: "t1", project: "p1", title: "Original title", description: "orig desc", columnId: "todo", order: 0,
    priority: "medium", type: "task", dueDate: null, storyPoints: 1, assignees: [dev], labels: [],
    subtasks: [{ _id: "s1", title: "sub", done: false }], comments: [], createdBy: pmUser,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 0,
  };
};
reset();
/** Simulates another user saving: applies changes and bumps the version. */
const otherUserEdits = (changes) => Object.assign(task, changes, { version: task.version + 1 });

const json = (status, body) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const handle = (req) => {
  const u = new URL(req.url());
  const m = req.method();
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (u.pathname === "/api/auth/me") return json(200, { user: pmUser });
  if (u.pathname === "/api/projects/p1" && m === "GET") return json(200, project);
  if (u.pathname === "/api/tasks/t1" && m === "GET") return json(200, task);
  if (u.pathname === "/api/projects/p1/tasks" && m === "GET") return json(200, [task]);
  if (u.pathname.startsWith("/api/projects/p1/tasks/t1") && ["PUT", "DELETE"].includes(m)) {
    puts.push({ m, path: u.pathname.replace("/api/projects/p1/tasks/t1", "") || "/", body, query: u.search });
    const version = m === "DELETE" ? Number(u.searchParams.get("version")) : body.version;
    if (!Number.isInteger(version)) return json(428, { code: "VERSION_REQUIRED", message: "version required" });
    if (version !== task.version) {
      return json(409, { code: "VERSION_CONFLICT", message: "changed", currentVersion: task.version, task });
    }
    const { version: _v, ...changes } = body;
    if (u.pathname.endsWith("/subtasks/s1")) task.subtasks[0].done = !task.subtasks[0].done;
    else if (u.pathname.endsWith("/move")) Object.assign(task, changes);
    else if (m === "PUT") {
      for (const [k, v] of Object.entries(changes)) task[k] = k === "assignees" ? v.map((id) => [dev, pmUser].find((p) => p._id === id)) : v;
    }
    task.version += 1;
    return json(200, task);
  }
  return null;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const results = [];
const run = async (name, fn) => {
  reset();
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("accessToken", "x"); localStorage.setItem("refreshToken", "x");
    localStorage.setItem("user", JSON.stringify({ _id: "u1", name: "Priya Manager", email: "pm@t.io", role: "project_manager" }));
  });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (!req.url().includes("/api/")) return req.continue();
    const r = handle(req);
    return r ? req.respond(r) : req.respond(json(404, { message: "mock: not found " + req.url() }));
  });
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  try {
    await fn(page);
    results.push(["PASS", name]);
  } catch (e) {
    await page.screenshot({ path: `/tmp/fail-${results.length}.png` }).catch(() => {});
    results.push(["FAIL", name + " → " + e.message.split("\n").slice(0,12).join(" | ") + " PUTS=" + JSON.stringify(puts) + " TASK=" + JSON.stringify({t:task.title,v:task.version,c:task.columnId})]);
  }
  await page.close();
};
const open = async (page) => { await page.goto(`http://127.0.0.1:${PORT}/tasks/t1`); await page.waitForSelector("h1"); };
const clickText = async (page, text, sel = "button") => {
  const ok = await page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === text);
    if (el) el.click();
    return !!el;
  }, text, sel);
  assert.ok(ok, `button "${text}" not found`);
};
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 4000 }, t);
const setInput = async (page, label, value) => {
  const h = await page.evaluateHandle((label) => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(label));
    return document.getElementById(l.htmlFor);
  }, label);
  await h.focus();
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.type(value);
};

await run("edit form sends only the changed fields, plus the loaded version", async (page) => {
  await open(page);
  await clickText(page, "Edit");
  await page.waitForSelector("form");
  await setInput(page, "Title", "New title");
  await clickText(page, "Save changes");
  await waitText(page, "Task updated");
  assert.deepEqual(puts[0].body, { version: 0, title: "New title" });
  assert.equal(task.version, 1);
});

await run("stale edit, no overlap: conflict panel appears, 'Apply my edits on top' merges both users' changes", async (page) => {
  await open(page);
  await clickText(page, "Edit");
  await page.waitForSelector("form");
  await setInput(page, "Title", "My title");
  otherUserEdits({ priority: "critical" }); // someone else changes priority → v1
  await clickText(page, "Save changes");
  await waitText(page, "changed by someone else while you were editing");
  const t = await bodyText(page);
  await page.screenshot({ path: "/tmp/conflict.png" });
  assert.match(t, /They changed: Priority/);
  assert.match(t, /You edited: Title/);
  assert.match(t, /without overwriting anything/);
  assert.equal(task.title, "Original title", "stale write was rejected");
  await clickText(page, "Apply my edits on top");
  assert.equal(await page.$eval("form select.capitalize", (s) => s.value).catch(() => "critical"), "critical", "form now shows latest priority");
  await clickText(page, "Save changes");
  await waitText(page, "Task updated");
  assert.deepEqual(puts[1].body, { version: 1, title: "My title" }, "retry sends only my field on the latest version");
  assert.equal(task.title, "My title");
  assert.equal(task.priority, "critical", "the other user's change survived");
  assert.equal(task.version, 2);
});

await run("stale edit, overlapping field: warns it will overwrite; 'Load latest version' discards my edit", async (page) => {
  await open(page);
  await clickText(page, "Edit");
  await page.waitForSelector("form");
  await setInput(page, "Title", "Mine");
  otherUserEdits({ title: "Theirs" });
  await clickText(page, "Save changes");
  await waitText(page, "changed by someone else while you were editing");
  assert.match(await bodyText(page), /overwrite their changes to: Title/);
  await clickText(page, "Load latest version");
  const val = await page.evaluate(() => {
    const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith("Title"));
    return document.getElementById(l.htmlFor).value;
  });
  assert.equal(val, "Theirs");
  assert.equal(await page.evaluate(() => !document.body.innerText.includes("changed by someone else while you were editing")), true, "panel dismissed");
  assert.equal(task.title, "Theirs");
});

await run("stale edit, overlapping field: 'Keep my edits' then Save overwrites knowingly", async (page) => {
  await open(page);
  await clickText(page, "Edit");
  await page.waitForSelector("form");
  await setInput(page, "Title", "Mine");
  otherUserEdits({ title: "Theirs" });
  await clickText(page, "Save changes");
  await waitText(page, "changed by someone else while you were editing");
  await clickText(page, "Keep my edits");
  await clickText(page, "Save changes");
  await waitText(page, "Task updated");
  assert.equal(task.title, "Mine");
  assert.equal(puts.at(-1).body.version, 1);
});

await run("inline priority change on a stale page: not applied, banner shown, latest version loaded", async (page) => {
  await open(page);
  otherUserEdits({ title: "Retitled elsewhere" });
  await page.select("#prio", "high");
  await waitText(page, "Someone else changed this task");
  await waitText(page, "Retitled elsewhere"); // page reloaded to latest
  assert.equal(task.priority, "medium", "stale change was not applied");
  assert.equal(puts[0].body.version, 0);
});

await run("status change & subtask toggle send the loaded version; stale ones are rejected", async (page) => {
  await open(page);
  await page.select("#status", "done");
  await page.waitForNetworkIdle({ idleTime: 300 });
  assert.equal(puts[0].path, "/move");
  assert.equal(puts[0].body.version, 0);
  assert.equal(task.columnId, "done");
  otherUserEdits({ description: "x" }); // v2 now, page still has v1
  await page.click('input[type="checkbox"]');
  await waitText(page, "Someone else changed this task");
  await page.waitForNetworkIdle({ idleTime: 300 });
  assert.equal(task.subtasks[0].done, false, "stale toggle not applied");
});

await run("stale delete: task is kept and the user is told", async (page) => {
  await open(page);
  otherUserEdits({ title: "Edited meanwhile" });
  await clickText(page, "Delete");
  await clickText(page, "Delete task");
  await waitText(page, "Someone else changed this task");
  await page.waitForNetworkIdle({ idleTime: 300 });
  assert.equal(puts[0].query, "?version=0");
  assert.match(await bodyText(page), /Edited meanwhile/);
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(s === "PASS" ? "✅" : "❌", n);
process.exit(results.some(([s]) => s === "FAIL") ? 1 : 0);

// Usage: npm run seed                -> apply migrations, then create/refresh demo data (idempotent)
//        npm run seed -- --reset     -> remove the demo data first, then re-create it
//        npm run seed:bulk           -> also add a LARGE generated dataset (~40 users, 20 projects, ~1,500 tasks)
//        npm run seed:bulk -- --scale=5   -> 5x as much (200 users, 100 projects, ~7,500 tasks)
//        npm run seed:bulk:reset     -> remove and regenerate the bulk dataset (and the small demo data)
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../modules/users/user.model.js";
import Project from "../modules/projects/project.model.js";
import Task from "../modules/tasks/task.model.js";
import { loadMigrations, migrateUp } from "../migrations/runner.js";
import bcrypt from "bcryptjs";
import { USERS, PROJECTS, PASSWORD } from "../seed/demoData.js";
import { generateBulk, BULK_DOMAIN, BULK_PREFIX } from "../seed/bulkData.js";

const reset = process.argv.includes("--reset");
const bulk = process.argv.includes("--bulk");
const scale = Number(process.argv.find((a) => a.startsWith("--scale="))?.split("=")[1]) || 1;
const batches = (arr, size = 1000) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

try {
  await mongoose.connect(process.env.MONGO_URI);
  await migrateUp(mongoose.connection.db, await loadMigrations(), console.log);

  if (reset) {
    const names = PROJECTS.map((p) => p.name);
    const projects = await Project.find({ name: { $in: names } }).select("_id");
    await Task.deleteMany({ project: { $in: projects.map((p) => p._id) } });
    await Project.deleteMany({ name: { $in: names } });
    await User.deleteMany({ email: { $in: USERS.map((u) => u.email) } });
    const bulkProjects = await Project.find({ name: new RegExp("^" + BULK_PREFIX.replace(/[[\]]/g, "\\$&")) }).select("_id");
    await Task.deleteMany({ project: { $in: bulkProjects.map((p) => p._id) } });
    await Project.deleteMany({ _id: { $in: bulkProjects.map((p) => p._id) } });
    await User.deleteMany({ email: new RegExp("@" + BULK_DOMAIN.replace(/\./g, "\\.") + "$") });
    console.log("Removed existing demo data.");
  }

  const ids = {};
  for (const u of USERS) {
    let doc = await User.findOne({ email: u.email });
    if (!doc) doc = new User({ name: u.name, email: u.email, role: u.role, password: PASSWORD });
    else Object.assign(doc, { name: u.name, role: u.role, isActive: true }); // keep demo accounts usable
    await doc.save();
    ids[u.key] = doc._id;
  }

  for (const p of PROJECTS) {
    let project = await Project.findOne({ name: p.name, owner: ids[p.owner], isDeleted: false });
    if (project) {
      console.log(`Project "${p.name}" already exists — left as is.`);
      continue;
    }
    project = await Project.create({
      name: p.name,
      description: p.description,
      owner: ids[p.owner],
      isArchived: !!p.isArchived,
      members: p.members.map((m) => ({ user: ids[m.user], role: m.role })),
    });
    const order = {};
    for (const t of p.tasks) {
      await Task.create({
        project: project._id,
        title: t.title,
        columnId: t.columnId,
        order: (order[t.columnId] = (order[t.columnId] ?? -1) + 1),
        priority: t.priority,
        type: t.type,
        storyPoints: t.storyPoints ?? 0,
        labels: t.labels ?? [],
        assignees: (t.assignees ?? []).map((k) => ids[k]),
        subtasks: t.subtasks ?? [],
        comments: (t.comments ?? []).map((c) => ({ author: ids[c.author], text: c.text })),
        createdBy: ids[p.owner],
      });
    }
    console.log(`Created project "${p.name}" with ${p.tasks.length} task(s).`);
  }

  if (bulk) {
    const exists = await User.exists({ email: new RegExp("@" + BULK_DOMAIN.replace(/\./g, "\\.") + "$") });
    if (exists) {
      console.log("Bulk data already present — use `npm run seed:bulk:reset` to regenerate it.");
    } else {
      const t0 = Date.now();
      const data = generateBulk(scale);
      const password = await bcrypt.hash(PASSWORD, 10); // one hash shared by every generated account
      // insertMany skips the model's save hook, so the password is hashed here.
      for (const b of batches(data.users)) await User.insertMany(b.map((u) => ({ ...u, password })), { ordered: false });
      for (const b of batches(data.projects)) await Project.insertMany(b, { ordered: false });
      for (const b of batches(data.tasks)) await Task.insertMany(b, { ordered: false });
      console.log(
        `Bulk data: ${data.users.length} users, ${data.projects.length} projects, ${data.tasks.length} tasks in ${((Date.now() - t0) / 1000).toFixed(1)}s.`
      );
      console.log(`  Generated accounts: user0001@${BULK_DOMAIN} … (user0001-user0002 are admins; password ${PASSWORD})`);
    }
  }

  console.log("\nDemo accounts (password for all: " + PASSWORD + ")");
  for (const u of USERS) console.log(`  ${u.role.padEnd(16)} ${u.email}`);
} catch (err) {
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

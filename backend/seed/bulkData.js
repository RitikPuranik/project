// Deterministic generator for a large demo dataset (same output for the same scale).
// Pure data + ObjectIds; scripts/seed.js inserts it with insertMany.
import mongoose from "mongoose";

export const BULK_DOMAIN = "bulk.orbin.test";
export const BULK_PREFIX = "[Bulk] ";

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const FIRST = ["Aarav","Vivaan","Aditya","Diya","Ananya","Ishaan","Kavya","Rohan","Sneha","Arjun","Meera","Kabir","Riya","Neha","Karan","Pooja","Rahul","Sara","Dev","Tara"];
const LAST = ["Sharma","Patel","Singh","Gupta","Reddy","Nair","Iyer","Khan","Mehta","Joshi","Das","Rao","Bose","Kapoor","Verma"];
const PROJECT_NAMES = ["Website Redesign","Mobile App","Payments Platform","Data Warehouse","Customer Portal","Marketing Site","Analytics Dashboard","Inventory System","HR Onboarding","Support Desk","API Gateway","Search Revamp","Notifications Service","Billing Migration","Security Audit","Design System","Partner Integrations","Reporting Engine","Admin Console","Checkout Flow"];
const VERBS = ["Implement","Fix","Design","Review","Refactor","Document","Test","Optimize","Migrate","Investigate","Prototype","Deploy","Update","Audit","Clean up"];
const THINGS = ["login page","search filters","payment webhook","email templates","user settings","dashboard charts","CSV export","caching layer","error handling","onboarding flow","permissions","notifications","API rate limits","mobile layout","database indexes","release pipeline","dark mode","audit logs","file uploads","pagination"];
const LABELS = ["frontend","backend","api","ui","devops","docs","security","performance","bug","design"];
const COMMENTS = ["Looks good to me.","Blocked on the API change, will pick up tomorrow.","Added more detail to the description.","Can we split this into smaller tasks?","Tested on staging, works as expected.","Needs design sign-off before merge.","Pushed a fix, please re-check.","Moving this to review."];
const PRIORITIES = ["low", "medium", "medium", "high", "critical"];
const TYPES = ["task", "task", "bug", "feature", "improvement"];
const COLUMNS = ["todo", "in_progress", "review", "done"];

export const generateBulk = (scale = 1, seed = 20261023) => {
  const rnd = mulberry32(seed);
  const int = (n) => Math.floor(rnd() * n);
  const pick = (arr) => arr[int(arr.length)];
  const sample = (arr, n) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  };
  const oid = () => new mongoose.Types.ObjectId();
  const daysFromNow = (d) => new Date(Date.now() + d * 86400000);
  const s = Math.max(1, Math.round(scale));

  // ---- users: 2 admins, 6 PMs, 24 members, 8 viewers per unit of scale
  const plan = [["admin", 2], ["project_manager", 6], ["member", 24], ["viewer", 8]];
  const users = [];
  let n = 0;
  for (const [role, count] of plan) {
    for (let i = 0; i < count * s; i++) {
      n++;
      const first = FIRST[n % FIRST.length], last = LAST[(n * 7) % LAST.length];
      users.push({
        _id: oid(),
        name: `${first} ${last}`,
        email: `user${String(n).padStart(4, "0")}@${BULK_DOMAIN}`,
        role,
        isActive: rnd() > 0.04, // a few deactivated accounts
        isVerified: true,
        avatar: "",
      });
    }
  }
  const active = (r) => users.filter((u) => u.role === r && u.isActive);
  const admins = active("admin"), pms = active("project_manager"), members = active("member"), viewers = active("viewer");

  // ---- projects and tasks
  const projects = [];
  const tasks = [];
  const projectCount = 20 * s;
  for (let p = 0; p < projectCount; p++) {
    const owner = pick(admins);
    const manager = pick(pms);
    const team = sample(members, 5 + int(6));
    const projViewers = sample(viewers, int(3));
    const entries = [
      { user: manager._id, role: "project_manager" },
      ...team.map((u) => ({ user: u._id, role: "member" })),
      ...projViewers.map((u) => ({ user: u._id, role: "viewer" })),
    ];
    const columns = [
      { id: "todo", name: "To-Do", order: 0 }, { id: "in_progress", name: "In Progress", order: 1 },
      { id: "review", name: "Review", order: 2 }, { id: "done", name: "Done", order: 3 },
    ];
    const project = {
      _id: oid(),
      name: `${BULK_PREFIX}${PROJECT_NAMES[p % PROJECT_NAMES.length]}${p >= PROJECT_NAMES.length ? ` ${Math.floor(p / PROJECT_NAMES.length) + 1}` : ""}`,
      description: `Auto-generated project #${p + 1} for load and UI testing.`,
      owner: owner._id,
      members: entries,
      columns,
      startDate: daysFromNow(-60 - int(60)),
      endDate: daysFromNow(30 + int(120)),
      isArchived: rnd() < 0.1,
      isDeleted: false,
    };
    projects.push(project);

    const doers = [manager, ...team];
    const participants = [owner, ...doers, ...projViewers];
    const order = {};
    const taskCount = 60 + int(40);
    for (let t = 0; t < taskCount; t++) {
      const columnId = pick(COLUMNS);
      const comments = Array.from({ length: int(4) }, () => ({ author: pick(participants.filter((u) => u.role !== "viewer"))._id, text: pick(COMMENTS) }));
      tasks.push({
        _id: oid(),
        project: project._id,
        title: `${pick(VERBS)} ${pick(THINGS)}`,
        description: `<p>Generated task ${t + 1} of project ${p + 1}.</p>`,
        columnId,
        order: (order[columnId] = (order[columnId] ?? -1) + 1),
        priority: pick(PRIORITIES),
        type: pick(TYPES),
        dueDate: rnd() < 0.7 ? daysFromNow(int(90) - 20) : undefined,
        storyPoints: pick([0, 1, 2, 3, 5, 8]),
        assignees: sample(doers, int(3)).map((u) => u._id),
        labels: sample(LABELS, int(3)),
        subtasks: Array.from({ length: int(5) }, (_, i) => ({ title: `Step ${i + 1}`, done: columnId === "done" || rnd() < 0.4 })),
        comments,
        createdBy: pick([owner, manager])._id,
        isDeleted: rnd() < 0.02,
        version: 0,
      });
    }
  }
  return { users, projects, tasks };
};

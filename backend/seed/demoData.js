// Demo content used by `npm run seed`. Plain data only; scripts/seed.js writes it.
export const PASSWORD = "Password@123";

export const USERS = [
  { key: "admin", name: "Aarav Admin", email: "admin@orbin.test", role: "admin" },
  { key: "pm", name: "Priya Manager", email: "pm@orbin.test", role: "project_manager" },
  { key: "member", name: "Meera Member", email: "member@orbin.test", role: "member" },
  { key: "member2", name: "Kabir Member", email: "member2@orbin.test", role: "member" },
  { key: "viewer", name: "Vikram Viewer", email: "viewer@orbin.test", role: "viewer" },
];

export const PROJECTS = [
  {
    name: "Orbin Demo Project",
    description: "Sample project with tasks in every column, a team and comments.",
    owner: "admin",
    members: [
      { user: "pm", role: "project_manager" },
      { user: "member", role: "member" },
      { user: "member2", role: "member" },
      { user: "viewer", role: "viewer" },
    ],
    tasks: [
      { title: "Set up CI pipeline", columnId: "todo", priority: "high", type: "task", assignees: ["member"], labels: ["devops"] },
      { title: "Design onboarding screens", columnId: "todo", priority: "medium", type: "feature", assignees: ["member2"], labels: ["design"] },
      {
        title: "Build login flow", columnId: "in_progress", priority: "high", type: "feature", assignees: ["member"], labels: ["api"], storyPoints: 5,
        subtasks: [{ title: "Form validation", done: true }, { title: "Google sign-in", done: false }],
        comments: [{ author: "pm", text: "Please include the refresh-token flow." }],
      },
      { title: "Fix board drag glitch", columnId: "review", priority: "critical", type: "bug", assignees: ["member2"], labels: ["ui"] },
      { title: "Write API docs", columnId: "done", priority: "low", type: "improvement", assignees: ["member"], labels: ["docs"] },
    ],
  },
  {
    name: "Legacy Website (Archived)",
    description: "An archived project: read-only until unarchived.",
    owner: "admin",
    isArchived: true,
    members: [{ user: "pm", role: "project_manager" }, { user: "member", role: "member" }],
    tasks: [{ title: "Migrate old pages", columnId: "done", priority: "low", type: "task", assignees: ["member"] }],
  },
];

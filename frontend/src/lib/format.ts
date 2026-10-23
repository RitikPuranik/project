import type { Column, Person, Priority, Project, Role, Task, TaskType } from "./types";

export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
export const TYPES: TaskType[] = ["task", "feature", "improvement", "bug"];

export const PRIORITY_COLOR: Record<Priority, string> = {
  low: "#8A90A8",
  medium: "#3F6FD8",
  high: "#E0661A",
  critical: "#C62F3E",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  project_manager: "Project manager",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Full access: every project, every user's role.",
  project_manager: "Create projects and manage their teams and tasks.",
  member: "Work on tasks in projects you belong to.",
  viewer: "Read-only access to projects you belong to.",
};

/** Viewers can read but never create, edit, assign, move, comment on or delete anything. */
export function canEdit(user: Person | null): boolean {
  return !!user && user.role !== "viewer";
}

const STAGE_PALETTE = ["#64708C", "#D98A06", "#7A4FD6"];
const STAGE_DONE = "#0A7C72";

export function sortedColumns(project: Pick<Project, "columns">): Column[] {
  return [...project.columns].sort((a, b) => a.order - b.order);
}

export function stageColor(index: number, total: number): string {
  if (total > 1 && index === total - 1) return STAGE_DONE;
  return STAGE_PALETTE[index % STAGE_PALETTE.length];
}

export function isDone(task: Task, project: Pick<Project, "columns">): boolean {
  const cols = sortedColumns(project);
  return cols.length > 0 && task.columnId === cols[cols.length - 1].id;
}

export function projectPeople(project: Project): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of [project.owner, ...project.members.map((m) => m.user)]) {
    if (p && !seen.has(p._id)) {
      seen.add(p._id);
      out.push(p);
    }
  }
  return out;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function daysFromToday(iso: string): number {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dueLabel(iso?: string | null): { text: string; tone: "late" | "soon" | "normal" } | null {
  if (!iso) return null;
  const n = daysFromToday(iso);
  if (n < 0) return { text: `${-n}d late`, tone: "late" };
  if (n === 0) return { text: "Due today", tone: "soon" };
  if (n === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: formatDate(iso), tone: n <= 3 ? "soon" : "normal" };
}

export function toDateInput(iso?: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  if (e?.response?.data?.message) return e.response.data.message;
  if (e?.message === "Network Error") return "Can't reach the server. Check that the API is running.";
  return fallback;
}

export function canManageProject(project: Project, user: Person | null): boolean {
  if (!user || user.role === "viewer") return false;
  if (user.role === "admin") return true;
  if (project.owner?._id === user._id) return true;
  return project.members.some((m) => m.user._id === user._id && m.role === "project_manager");
}

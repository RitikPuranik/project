import type { Column, Person, Priority, Project, Role, Task, TaskType } from "@/shared/lib/types";

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

/**
 * The user's effective role in a project. Mirrors getProjectRole() in
 * backend/middleware/access.js — the API is the source of truth; this only decides which
 * controls to show.
 */
export function projectRole(project: Project, user: Person | null): Role | null {
  if (!user?.role) return null;
  if (user.role === "admin") return "admin";
  const isOwner = project.owner?._id === user._id;
  const entry = project.members.find((m) => m.user._id === user._id);
  if (!isOwner && !entry) return null;
  if (user.role === "viewer" || (!isOwner && entry?.role === "viewer")) return "viewer";
  if (user.role === "project_manager" && (isOwner || entry?.role === "project_manager")) return "project_manager";
  return "member";
}

/** Admin / project manager: create, assign, edit, delete tasks and manage the team. */
export function canManageProject(project: Project, user: Person | null): boolean {
  const r = projectRole(project, user);
  return r === "admin" || r === "project_manager";
}
export const canManageTasks = canManageProject;

/** Managers on any task; team members only on tasks assigned to them (status, subtasks, limited edits). */
export function canWorkOnTask(project: Project, user: Person | null, task: Task): boolean {
  if (canManageProject(project, user)) return true;
  return projectRole(project, user) === "member" && !!user && task.assignees.some((a) => a._id === user._id);
}

/** Admin, project manager and team member may comment; viewers may not. */
export function canComment(project: Project, user: Person | null): boolean {
  const r = projectRole(project, user);
  return r === "admin" || r === "project_manager" || r === "member";
}

/** Authors may delete their own comments; admins and project managers may delete any. Viewers never. */
export function canDeleteComment(project: Project, user: Person | null, authorId: string): boolean {
  const r = projectRole(project, user);
  if (r === "admin" || r === "project_manager") return true;
  return r === "member" && !!user && user._id === authorId;
}

// ---- Concurrent edits (optimistic concurrency) ---------------------------------------------

export const CONFLICT_TOAST = "Someone else changed this task. The latest version is now shown.";

/** The latest task from a 409 "version conflict" response, or null for any other error. */
export function conflictFrom(err: unknown): Task | null {
  const r = (err as { response?: { status?: number; data?: { code?: string; task?: Task } } })?.response;
  return r?.status === 409 && r.data?.code === "VERSION_CONFLICT" && r.data.task ? r.data.task : null;
}

/** True when the task was deleted by someone else while the user was working on it. */
export function isTaskGone(err: unknown): boolean {
  return (err as { response?: { data?: { code?: string } } })?.response?.data?.code === "TASK_GONE";
}

/** Editable task fields as comparable values (shared by the edit form and conflict diffing). */
export interface TaskFields {
  title: string;
  description: string;
  priority: Priority;
  type: TaskType;
  dueDate: string;
  storyPoints: number;
  assignees: string[];
  labels: string[];
}
export const FIELD_LABEL: Record<keyof TaskFields | "columnId", string> = {
  title: "Title",
  description: "Description",
  priority: "Priority",
  type: "Type",
  dueDate: "Due date",
  storyPoints: "Story points",
  assignees: "Assignees",
  labels: "Labels",
  columnId: "Status",
};

export function taskFields(t: Task): TaskFields {
  return {
    title: t.title,
    description: t.description ?? "",
    priority: t.priority,
    type: t.type,
    dueDate: toDateInput(t.dueDate),
    storyPoints: t.storyPoints ?? 0,
    assignees: t.assignees.map((a) => a._id).sort(),
    labels: t.labels,
  };
}

/** Keys whose values differ between two field sets. */
export function differingFields(a: TaskFields, b: TaskFields): (keyof TaskFields)[] {
  return (Object.keys(a) as (keyof TaskFields)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

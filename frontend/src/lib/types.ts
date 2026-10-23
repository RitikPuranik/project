export type Role = "admin" | "project_manager" | "member" | "viewer";
export type Priority = "low" | "medium" | "high" | "critical";
export type TaskType = "bug" | "feature" | "improvement" | "task";

export interface Person {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: Role;
}

export interface Column {
  id: string;
  name: string;
  order: number;
}

export interface Member {
  user: Person;
  role: "project_manager" | "member";
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  owner: Person;
  members: Member[];
  startDate?: string;
  endDate?: string;
  columns: Column[];
  isArchived: boolean;
  createdAt: string;
}

export interface Subtask {
  _id: string;
  title: string;
  done: boolean;
}

export interface Comment {
  _id: string;
  author: Person;
  text: string;
  createdAt: string;
}

export interface Task {
  _id: string;
  project: string;
  title: string;
  description: string;
  columnId: string;
  order: number;
  priority: Priority;
  type: TaskType;
  dueDate?: string | null;
  storyPoints: number;
  assignees: Person[];
  labels: string[];
  subtasks: Subtask[];
  comments: Comment[];
  createdBy: Person;
  createdAt: string;
  updatedAt: string;
  /** Concurrency token: send it back with every edit/move; the API answers 409 if it is stale. */
  version: number;
}

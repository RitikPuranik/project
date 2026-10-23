import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";

/**
 * Effective role of `user` inside `project`, or null when they have no access.
 *
 *  admin            -> "admin"            (global role, sees and does everything)
 *  project_manager  -> "project_manager"  (global PM role AND owner / PM of this project)
 *  member           -> "member"           (project participant who is not a manager here)
 *  viewer           -> "viewer"           (global viewer who participates in the project)
 *
 * A project-level "project_manager" entry only counts if the user's global role is also
 * project_manager, so a plain Team Member can never be promoted into manager powers by a
 * project's member list alone.
 */
export const getProjectRole = (user, project) => {
  if (user.role === "admin") return "admin";

  const uid = user._id.toString();
  const isOwner = project.owner.toString() === uid;
  const entry = project.members.find((m) => m.user.toString() === uid);
  if (!isOwner && !entry) return null;

  if (user.role === "viewer") return "viewer";
  if (user.role === "project_manager" && (isOwner || entry?.role === "project_manager")) {
    return "project_manager";
  }
  return "member";
};

export const hasProjectAccess = (user, project) => getProjectRole(user, project) !== null;

// Everyone who may legitimately be assigned work in a project (owner + members).
export const projectParticipantIds = (project) => [
  project.owner.toString(),
  ...project.members.map((m) => m.user.toString()),
];

const notFound = (res, what) => res.status(404).json({ message: `${what} not found` });
const denied = (res) =>
  res.status(403).json({ message: "Forbidden: you don't have access to this project" });

// Shared by the two param handlers: loads nothing, just records the verdict on the request.
const grant = (req, project) => {
  req.project = project;
  req.projectRole = getProjectRole(req.user, project);
  return req.projectRole !== null;
};

// router.param handler for project ids (:id on /projects, :projectId on nested task routes).
// On success: req.project (owner, members, columns) and req.projectRole are set.
export const projectAccessParam = async (req, res, next, id) => {
  try {
    if (!mongoose.isValidObjectId(id)) return notFound(res, "Project");
    const project = await Project.findOne({ _id: id, isDeleted: false }).select("owner members columns");
    if (!project) return notFound(res, "Project");
    if (!grant(req, project)) return denied(res);
    next();
  } catch (err) {
    res.status(500).json({ message: "Failed to check project access", error: err.message });
  }
};

// router.param handler for task ids: the task must exist, not be deleted, belong to the
// :projectId in the URL (when nested), and live in a project the user can access.
// On success: req.task, req.project and req.projectRole are set.
export const taskAccessParam = async (req, res, next, id) => {
  try {
    if (!mongoose.isValidObjectId(id)) return notFound(res, "Task");
    const task = await Task.findOne({ _id: id, isDeleted: false });
    if (!task) return notFound(res, "Task");
    if (req.params.projectId && task.project.toString() !== req.params.projectId) {
      return notFound(res, "Task");
    }
    const project = await Project.findOne({ _id: task.project, isDeleted: false }).select(
      "owner members columns"
    );
    if (!project) return notFound(res, "Task");
    if (!grant(req, project)) return denied(res);
    req.task = task;
    next();
  } catch (err) {
    res.status(500).json({ message: "Failed to check task access", error: err.message });
  }
};

// Route-level guard: only the listed effective project roles may continue.
// e.g. router.post("/:id/members", requireProjectRole("admin", "project_manager"), addMember)
export const requireProjectRole = (...allowed) => (req, res, next) => {
  if (!req.projectRole || !allowed.includes(req.projectRole)) {
    return res.status(403).json({ message: "Forbidden: insufficient permissions for this project" });
  }
  next();
};

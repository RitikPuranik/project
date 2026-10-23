import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";

// Admins see everything; everyone else needs to own the project or be a member of it.
export const hasProjectAccess = (user, project) => {
  if (user.role === "admin") return true;
  const uid = user._id.toString();
  if (project.owner.toString() === uid) return true;
  return project.members.some((m) => m.user.toString() === uid);
};

const notFound = (res, what) => res.status(404).json({ message: `${what} not found` });
const denied = (res) =>
  res.status(403).json({ message: "Forbidden: you don't have access to this project" });

// router.param handler for project ids (:id on /projects, :projectId on nested task routes)
export const projectAccessParam = async (req, res, next, id) => {
  try {
    if (!mongoose.isValidObjectId(id)) return notFound(res, "Project");
    const project = await Project.findOne({ _id: id, isDeleted: false }).select("owner members");
    if (!project) return notFound(res, "Project");
    if (!hasProjectAccess(req.user, project)) return denied(res);
    next();
  } catch (err) {
    res.status(500).json({ message: "Failed to check project access", error: err.message });
  }
};

// router.param handler for task ids: the task must exist, belong to the :projectId in the
// URL (when nested), and live in a project the user can access.
export const taskAccessParam = async (req, res, next, id) => {
  try {
    if (!mongoose.isValidObjectId(id)) return notFound(res, "Task");
    const task = await Task.findById(id).select("project");
    if (!task) return notFound(res, "Task");
    if (req.params.projectId && task.project.toString() !== req.params.projectId) {
      return notFound(res, "Task");
    }
    const project = await Project.findOne({ _id: task.project, isDeleted: false }).select("owner members");
    if (!project) return notFound(res, "Task");
    if (!hasProjectAccess(req.user, project)) return denied(res);
    next();
  } catch (err) {
    res.status(500).json({ message: "Failed to check task access", error: err.message });
  }
};

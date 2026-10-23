import mongoose from "mongoose";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { getProjectRole } from "../middleware/access.js";

// Admin, or a project manager of *this* project (owner / assigned PM who also holds the
// global Project Manager role). Same rule the task controller uses via req.projectRole.
const canManageProject = (user, project) =>
  ["admin", "project_manager"].includes(getProjectRole(user, project));

const forbidden = (res, message) => res.status(403).json({ message });

// @route POST /api/projects
export const createProject = async (req, res) => {
  try {
    const { name, description, startDate, endDate, memberIds } = req.body;
    if (!name) return res.status(400).json({ message: "Project name is required" });

    // Only real, distinct users (never the owner) can be added as members.
    const requested = [...new Set((Array.isArray(memberIds) ? memberIds : []).map(String))].filter(
      (id) => id !== req.user._id.toString()
    );
    if (requested.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ message: "memberIds must be valid user ids" });
    }
    const found = await User.find({ _id: { $in: requested } }).select("_id");
    if (found.length !== requested.length) {
      return res.status(400).json({ message: "One or more members do not exist" });
    }
    const members = requested.map((id) => ({ user: id, role: "member" }));

    const project = await Project.create({
      name,
      description,
      owner: req.user._id,
      startDate,
      endDate,
      members,
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to create project", error: err.message });
  }
};

// @route GET /api/projects  (projects the user owns or is a member of)
export const getProjects = async (req, res) => {
  try {
    const filter = {
      isDeleted: false,
      $or: [{ owner: req.user._id }, { "members.user": req.user._id }],
    };
    // Admins can see everything
    const query = req.user.role === "admin" ? { isDeleted: false } : filter;

    const projects = await Project.find(query)
      .populate("owner", "name email avatar")
      .populate("members.user", "name email avatar")
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch projects", error: err.message });
  }
};

// @route GET /api/projects/:id
export const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, isDeleted: false })
      .populate("owner", "name email avatar")
      .populate("members.user", "name email avatar");

    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch project", error: err.message });
  }
};

// @route PUT /api/projects/:id
export const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || project.isDeleted) return res.status(404).json({ message: "Project not found" });

    if (!canManageProject(req.user, project)) {
      return forbidden(res, "Only the owner or a project manager can edit this project");
    }

    const { name, description, startDate, endDate, columns } = req.body;
    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (startDate !== undefined) project.startDate = startDate;
    if (endDate !== undefined) project.endDate = endDate;
    if (columns !== undefined) project.columns = columns;

    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to update project", error: err.message });
  }
};

// @route DELETE /api/projects/:id  (soft delete)
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || project.isDeleted) return res.status(404).json({ message: "Project not found" });

    const isOwner = project.owner.toString() === req.user._id.toString();
    if (!(req.user.role === "admin" || (isOwner && canManageProject(req.user, project)))) {
      return forbidden(res, "Only the owner or an admin can delete this project");
    }

    project.isDeleted = true;
    await project.save();
    res.json({ message: "Project deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete project", error: err.message });
  }
};

// @route PUT /api/projects/:id/archive
export const archiveProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || project.isDeleted) return res.status(404).json({ message: "Project not found" });

    if (!canManageProject(req.user, project)) {
      return forbidden(res, "Not authorized to archive this project");
    }

    project.isArchived = !project.isArchived;
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to archive project", error: err.message });
  }
};

// @route POST /api/projects/:id/clone
export const cloneProject = async (req, res) => {
  try {
    const original = await Project.findById(req.params.id);
    if (!original || original.isDeleted) return res.status(404).json({ message: "Project not found" });

    if (!canManageProject(req.user, original)) {
      return forbidden(res, "Only an admin or a manager of this project can clone it");
    }

    const clone = await Project.create({
      name: `${original.name} (Copy)`,
      description: original.description,
      owner: req.user._id,
      members: original.members,
      columns: original.columns,
    });

    const tasks = await Task.find({ project: original._id, isDeleted: false });
    if (tasks.length) {
      const clonedTasks = tasks.map((t) => ({
        project: clone._id,
        title: t.title,
        description: t.description,
        columnId: t.columnId,
        order: t.order,
        priority: t.priority,
        type: t.type,
        dueDate: t.dueDate,
        storyPoints: t.storyPoints,
        assignees: t.assignees,
        labels: t.labels,
        subtasks: t.subtasks.map((s) => ({ title: s.title, done: false })),
        createdBy: req.user._id,
      }));
      await Task.insertMany(clonedTasks);
    }

    res.status(201).json(clone);
  } catch (err) {
    res.status(500).json({ message: "Failed to clone project", error: err.message });
  }
};

// @route POST /api/projects/:id/members
export const addMember = async (req, res) => {
  try {
    const { userId, role } = req.body;
    const project = await Project.findById(req.params.id);
    if (!project || project.isDeleted) return res.status(404).json({ message: "Project not found" });

    if (!canManageProject(req.user, project)) {
      return forbidden(res, "Not authorized to manage members");
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid userId is required" });
    }
    if (
      project.owner.toString() === String(userId) ||
      project.members.some((m) => m.user.toString() === String(userId))
    ) {
      return res.status(400).json({ message: "User is already a member" });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // Project-level manager status never grants more than the user's global role allows.
    if (role === "project_manager" && !["admin", "project_manager"].includes(targetUser.role)) {
      return res
        .status(400)
        .json({ message: "Only users with the Project Manager role can be made project managers" });
    }

    // Project Manager can choose a Viewer to become a Member
    if (targetUser.role === "viewer") {
      targetUser.role = "member";
      await targetUser.save();
    }

    project.members.push({ user: userId, role: role === "project_manager" ? "project_manager" : "member" });
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to add member", error: err.message });
  }
};

// @route DELETE /api/projects/:id/members/:userId
export const removeMember = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project || project.isDeleted) return res.status(404).json({ message: "Project not found" });

    if (!canManageProject(req.user, project)) {
      return forbidden(res, "Not authorized to manage members");
    }

    project.members = project.members.filter((m) => m.user.toString() !== req.params.userId);
    await project.save();
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: "Failed to remove member", error: err.message });
  }
};

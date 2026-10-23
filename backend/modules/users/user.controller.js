import mongoose from "mongoose";
import User from "./user.model.js";
import Project from "../projects/project.model.js";
import Task from "../tasks/task.model.js";
import { sendEmailQuietly } from "../../shared/email/emailjs.js";
import { welcomeEmail, passwordChangedEmail } from "../../shared/email/templates.js";

const ROLES = ["admin", "project_manager", "member", "viewer"];
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Never leave the system without an active admin.
const isLastActiveAdmin = async (userId) => {
  const others = await User.countDocuments({
    _id: { $ne: userId },
    role: "admin",
    isActive: { $ne: false },
  });
  return others === 0;
};

export const listUsers = async (req, res) => {
  try {
    const { search } = req.query;
    const currentUserId = req.user._id;
    const currentUserRole = req.user.role;

    let allowedIds = null;

    if (currentUserRole === "admin") {
      // Admin can see everything
      allowedIds = null;
    } else if (currentUserRole === "project_manager") {
      // Project Manager can see:
      // 1. Other project managers
      // 2. Their own team members in projects they manage/own
      // 3. Viewers (so PM can choose viewers to be members)
      // 4. Themselves
      const myProjects = await Project.find({
        isDeleted: false,
        $or: [{ owner: currentUserId }, { "members.user": currentUserId }],
      }).select("members.user owner");

      const myMemberIds = new Set();
      myMemberIds.add(currentUserId.toString());

      myProjects.forEach((p) => {
        if (p.owner) myMemberIds.add(p.owner.toString());
        (p.members || []).forEach((m) => {
          if (m.user) myMemberIds.add(m.user.toString());
        });
      });

      // Find all PMs and all Viewers
      const globalVisibleUsers = await User.find({
        role: { $in: ["project_manager", "viewer"] },
      }).select("_id");

      globalVisibleUsers.forEach((u) => myMemberIds.add(u._id.toString()));

      allowedIds = Array.from(myMemberIds);
    } else if (currentUserRole === "member") {
      // Member can see:
      // 1. Other members in their projects
      // 2. Their respective project managers
      // 3. Themselves
      const myProjects = await Project.find({
        isDeleted: false,
        $or: [{ owner: currentUserId }, { "members.user": currentUserId }],
      }).select("members.user owner");

      const visibleIds = new Set();
      visibleIds.add(currentUserId.toString());

      myProjects.forEach((p) => {
        if (p.owner) visibleIds.add(p.owner.toString());
        (p.members || []).forEach((m) => {
          if (m.user) visibleIds.add(m.user.toString());
        });
      });

      allowedIds = Array.from(visibleIds);
    } else {
      // Viewer can only see themselves
      allowedIds = [currentUserId.toString()];
    }

    const filter = {};
    if (allowedIds !== null) {
      filter._id = { $in: allowedIds };
    }
    // Deactivated accounts only show up for admins (who can reactivate them).
    // Admin filters: ?status=active|inactive (default: both) and ?role=<role>.
    const { status, role } = req.query;
    if (role !== undefined && role !== "") {
      if (!ROLES.includes(role)) return res.status(400).json({ message: "Invalid role filter" });
      filter.role = role;
    }
    if (currentUserRole === "admin" && status === "inactive") {
      filter.isActive = false;
    } else if (currentUserRole !== "admin" || status === "active" || req.query.includeInactive === "false") {
      filter.isActive = { $ne: false };
    }

    if (search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ name: new RegExp(escapeRegex(search), "i") }, { email: new RegExp(escapeRegex(search), "i") }],
      });
    }

    const users = await User.find(filter).select("name email role avatar isActive createdAt").sort({ name: 1 }).limit(100);

    // Admin extra: ?counts=true adds how many projects each user is on and how many
    // not-yet-deleted tasks are assigned to them (shown in the Users table).
    if (currentUserRole === "admin" && req.query.counts === "true" && users.length) {
      const ids = users.map((u) => u._id);
      const [projects, taskCounts] = await Promise.all([
        Project.find({ isDeleted: false, $or: [{ owner: { $in: ids } }, { "members.user": { $in: ids } }] }).select("owner members.user"),
        Task.aggregate([
          { $match: { isDeleted: false, assignees: { $in: ids } } },
          { $unwind: "$assignees" },
          { $match: { assignees: { $in: ids } } },
          { $group: { _id: "$assignees", n: { $sum: 1 } } },
        ]),
      ]);
      const projectCount = new Map();
      for (const p of projects) {
        const onProject = new Set([p.owner?.toString(), ...(p.members || []).map((m) => m.user?.toString())]);
        for (const id of onProject) if (id) projectCount.set(id, (projectCount.get(id) ?? 0) + 1);
      }
      const taskCount = new Map(taskCounts.map((r) => [r._id.toString(), r.n]));
      return res.json(
        users.map((u) => ({
          ...u.toObject(),
          projectCount: projectCount.get(u._id.toString()) ?? 0,
          taskCount: taskCount.get(u._id.toString()) ?? 0,
        }))
      );
    }

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users", error: err.message });
  }
};

// Admin-only detail view of a single user (includes deactivated accounts).
export const getUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "User not found" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user", error: err.message });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role = "member" } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (!EMAIL_RE.test(email.trim())) return res.status(400).json({ message: "Enter a valid email address" });
    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) return res.status(400).json({ message: "An account with this email already exists" });

    const user = await User.create({ name: name.trim(), email: email.trim(), password, role });
    sendEmailQuietly({ to: user.email, ...welcomeEmail({ name: user.name, addedByAdmin: true }) });
    res.status(201).json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: "Failed to create user", error: err.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "User not found" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, email, role, password } = req.body;
    let passwordChanged = false;

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Name can't be empty" });
      user.name = String(name).trim();
    }
    if (email !== undefined) {
      const next = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(next)) return res.status(400).json({ message: "Enter a valid email address" });
      if (next !== user.email) {
        const taken = await User.findOne({ email: next, _id: { $ne: user._id } });
        if (taken) return res.status(400).json({ message: "An account with this email already exists" });
        user.email = next;
      }
    }
    if (role !== undefined && role !== user.role) {
      if (!ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });
      if (user._id.equals(req.user._id)) {
        return res.status(400).json({ message: "You can't change your own role" });
      }
      if (user.role === "admin" && (await isLastActiveAdmin(user._id))) {
        return res.status(400).json({ message: "At least one active admin is required" });
      }
      user.role = role;
    }
    if (password !== undefined && password !== "") {
      if (String(password).length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      user.password = password;
      user.refreshToken = null; // force re-login everywhere after an admin password reset
      passwordChanged = true;
    }

    await user.save();
    if (passwordChanged) sendEmailQuietly({ to: user.email, ...passwordChangedEmail({ name: user.name }) });
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: "Failed to update user", error: err.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "User not found" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== role) {
      if (user._id.equals(req.user._id)) {
        return res.status(400).json({ message: "You can't change your own role" });
      }
      if (user.role === "admin" && (await isLastActiveAdmin(user._id))) {
        return res.status(400).json({ message: "At least one active admin is required" });
      }
      user.role = role;
      await user.save();
    }
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: "Failed to update role", error: err.message });
  }
};

const setActive = (active) => async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "User not found" });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!active) {
      if (user._id.equals(req.user._id)) {
        return res.status(400).json({ message: "You can't deactivate your own account" });
      }
      if (user.role === "admin" && (await isLastActiveAdmin(user._id))) {
        return res.status(400).json({ message: "At least one active admin is required" });
      }
      user.refreshToken = null; // revoke refresh; protect() blocks any access token still in flight
    }
    user.isActive = active;
    await user.save();
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: `Failed to ${active ? "reactivate" : "deactivate"} user`, error: err.message });
  }
};


export const deactivateUser = setActive(false);
export const activateUser = setActive(true);

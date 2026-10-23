import express from "express";
import User from "../models/User.js";
import Project from "../models/Project.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

// GET /api/users?search=name-or-email
router.get("/", async (req, res) => {
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

    if (search) {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }],
      });
    }

    const users = await User.find(filter).select("name email role avatar").limit(50);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users", error: err.message });
  }
});

// PUT /api/users/:id/role  -- admin only
router.put("/:id/role", authorize("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "project_manager", "member", "viewer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to update role", error: err.message });
  }
});

export default router;

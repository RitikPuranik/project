import express from "express";
import User from "../models/User.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

// GET /api/users?search=name-or-email  -- used to find users to invite to a project
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const filter = search
      ? { $or: [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }] }
      : {};
    const users = await User.find(filter).select("name email role avatar").limit(20);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users", error: err.message });
  }
});

// PUT /api/users/:id/role  -- admin only
router.put("/:id/role", authorize("admin"), async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "project_manager", "member"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Failed to update role", error: err.message });
  }
});

export default router;

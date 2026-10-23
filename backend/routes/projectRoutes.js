import express from "express";
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  archiveProject,
  cloneProject,
  addMember,
  removeMember,
} from "../controllers/projectController.js";
import { protect, authorize } from "../middleware/auth.js";
import taskRoutes from "./taskRoutes.js";

const router = express.Router();

router.use(protect);

router.route("/").post(authorize("admin", "project_manager"), createProject).get(getProjects);
router.route("/:id").get(getProject).put(updateProject).delete(deleteProject);
router.put("/:id/archive", archiveProject);
router.post("/:id/clone", authorize("admin", "project_manager"), cloneProject);
router.post("/:id/members", addMember);
router.delete("/:id/members/:userId", removeMember);

// nested task routes: /api/projects/:projectId/tasks
router.use("/:projectId/tasks", taskRoutes);

export default router;

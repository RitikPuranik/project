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
  updateMemberRole,
} from "./project.controller.js";
import { protect, authorize, blockViewerWrites } from "../../shared/middleware/auth.js";
import { projectAccessParam, blockArchivedWrites } from "./project.access.js";
import taskRoutes from "../tasks/task.routes.js";

const router = express.Router();

router.use(protect);
router.use(blockViewerWrites);
router.param("id", projectAccessParam);
router.param("projectId", projectAccessParam);

router.route("/").post(authorize("admin"), createProject).get(getProjects);
router.route("/:id").get(getProject).put(blockArchivedWrites, updateProject).delete(deleteProject);
router.put("/:id/archive", archiveProject);
router.post("/:id/clone", authorize("admin", "project_manager"), cloneProject);
router.post("/:id/members", blockArchivedWrites, addMember);
router.put("/:id/members/:userId/role", blockArchivedWrites, updateMemberRole);
router.delete("/:id/members/:userId", blockArchivedWrites, removeMember);

// nested task routes: /api/projects/:projectId/tasks
router.use("/:projectId/tasks", taskRoutes);

export default router;

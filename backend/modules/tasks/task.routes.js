import express from "express";
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  moveTask,
  deleteTask,
  addSubtask,
  toggleSubtask,
} from "./task.controller.js";
import { protect, blockViewerWrites } from "../../shared/middleware/auth.js";
import { taskAccessParam, blockArchivedWrites } from "../projects/project.access.js";
import commentRoutes from "../comments/comment.routes.js";

const router = express.Router({ mergeParams: true });

router.use(protect);
router.use(blockViewerWrites);
router.param("id", taskAccessParam);

router.route("/").post(blockArchivedWrites, createTask).get(getTasks);
router.use("/:id", blockArchivedWrites); // tasks (and their comments) of archived projects are read-only
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);
router.put("/:id/move", moveTask);
router.post("/:id/subtasks", addSubtask);
router.put("/:id/subtasks/:subtaskId", toggleSubtask);
router.use("/:id/comments", commentRoutes); // comments module

export default router;

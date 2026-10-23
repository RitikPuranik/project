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
  addComment,
  deleteComment,
} from "../controllers/taskController.js";
import { protect, blockViewerWrites } from "../middleware/auth.js";
import { taskAccessParam } from "../middleware/access.js";

const router = express.Router({ mergeParams: true });

router.use(protect);
router.use(blockViewerWrites);
router.param("id", taskAccessParam);

router.route("/").post(createTask).get(getTasks);
router.route("/:id").get(getTask).put(updateTask).delete(deleteTask);
router.put("/:id/move", moveTask);
router.post("/:id/subtasks", addSubtask);
router.put("/:id/subtasks/:subtaskId", toggleSubtask);
router.post("/:id/comments", addComment);
router.delete("/:id/comments/:commentId", deleteComment);

export default router;

import express from "express";
import {
  createTask,
  getTasks,
  updateTask,
  moveTask,
  deleteTask,
  addSubtask,
  toggleSubtask,
  addComment,
} from "../controllers/taskController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router({ mergeParams: true });

router.use(protect);

router.route("/").post(createTask).get(getTasks);
router.route("/:id").put(updateTask).delete(deleteTask);
router.put("/:id/move", moveTask);
router.post("/:id/subtasks", addSubtask);
router.put("/:id/subtasks/:subtaskId", toggleSubtask);
router.post("/:id/comments", addComment);

export default router;

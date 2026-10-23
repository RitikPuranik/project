import express from "express";
import { addComment, deleteComment } from "./comment.controller.js";

// Mounted by the task router at /:id/comments, so the task access check has already run.
const router = express.Router({ mergeParams: true });

router.post("/", addComment);
router.delete("/:commentId", deleteComment);

export default router;

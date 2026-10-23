import mongoose from "mongoose";
import Task from "../tasks/task.model.js";
import { MANAGERS, COMMENTERS } from "../../shared/constants/roles.js";
import { forbidden, serverError } from "../../shared/utils/http.js";

/*
 * Comment permissions (req.task / req.projectRole are set by taskAccessParam, which has
 * already rejected anyone who is not a participant of the task's project):
 *   read    every participant (comments travel with GET task)
 *   add     admin, project manager, member
 *   delete  author (own comments) or admin / project manager (moderation); never viewers
 */
const MAX_COMMENT_LENGTH = 2000;

// @route POST /api/tasks/:id/comments
// Append-only atomic $push; never conflicts with edits, so no version needed or bumped.
export const addComment = async (req, res) => {
  try {
    if (!COMMENTERS.includes(req.projectRole)) {
      return forbidden(res, "your role cannot comment on tasks");
    }
    const { text } = req.body;
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }
    if (text.trim().length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ message: `Comments are limited to ${MAX_COMMENT_LENGTH} characters` });
    }

    const updated = await Task.findOneAndUpdate(
      { _id: req.task._id, isDeleted: false },
      { $push: { comments: { author: req.user._id, text: text.trim() } } },
      { new: true, runValidators: true }
    ).populate("comments.author", "name avatar");
    if (!updated) return res.status(404).json({ message: "Task not found" });
    res.json(updated);
  } catch (err) {
    serverError(res, "Failed to add comment", err);
  }
};

// @route DELETE /api/tasks/:id/comments/:commentId
// Authors may delete their own comments; admins and project managers of the project may
// delete any comment (moderation). Viewers never can. Atomic $pull, no version needed.
export const deleteComment = async (req, res) => {
  try {
    if (!COMMENTERS.includes(req.projectRole)) {
      return forbidden(res, "your role cannot delete comments");
    }
    const { commentId } = req.params;
    if (!mongoose.isValidObjectId(commentId)) return res.status(404).json({ message: "Comment not found" });

    const comment = req.task.comments.find((c) => c._id.toString() === commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isAuthor = comment.author.toString() === req.user._id.toString();
    if (!isAuthor && !MANAGERS.includes(req.projectRole)) {
      return forbidden(res, "you can only delete your own comments");
    }

    const updated = await Task.findOneAndUpdate(
      { _id: req.task._id, isDeleted: false },
      { $pull: { comments: { _id: commentId } } },
      { new: true }
    ).populate("comments.author", "name avatar");
    if (!updated) return res.status(404).json({ message: "Task not found" });
    res.json(updated);
  } catch (err) {
    serverError(res, "Failed to delete comment", err);
  }
};

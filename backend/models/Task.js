import mongoose from "mongoose";

const subtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    done: { type: Boolean, default: false },
  },
  { _id: true }
);

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" }, // stores HTML from rich text editor
    columnId: { type: String, required: true }, // matches Project.columns[].id
    order: { type: Number, required: true, default: 0 },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    type: {
      type: String,
      enum: ["bug", "feature", "improvement", "task"],
      default: "task",
    },
    dueDate: { type: Date },
    storyPoints: { type: Number, default: 0 },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    labels: [{ type: String }],
    subtasks: [subtaskSchema],
    comments: [commentSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isDeleted: { type: Boolean, default: false },
    // Optimistic-concurrency token. Clients send the version they last saw; a write only
    // succeeds if it still matches, and every successful write increments it by one.
    // (Comments and newly added subtasks are append-only and do not bump it.)
    version: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);

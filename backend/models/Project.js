import mongoose from "mongoose";

const columnSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // e.g. "todo", "in_progress"
    name: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["project_manager", "member"], default: "member" },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [memberSchema],
    startDate: { type: Date },
    endDate: { type: Date },
    columns: {
      type: [columnSchema],
      default: [
        { id: "todo", name: "To-Do", order: 0 },
        { id: "in_progress", name: "In Progress", order: 1 },
        { id: "review", name: "Review", order: 2 },
        { id: "done", name: "Done", order: 3 },
      ],
    },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false }, // soft delete
  },
  { timestamps: true }
);

export default mongoose.model("Project", projectSchema);

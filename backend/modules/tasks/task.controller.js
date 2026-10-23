import mongoose from "mongoose";
import Task from "./task.model.js";
import User from "../users/user.model.js";
import { projectParticipantIds } from "../projects/project.access.js";
import { MANAGERS } from "../../shared/constants/roles.js";
import { forbidden, serverError } from "../../shared/utils/http.js";

/*
 * Authorization model (enforced here, on the server — the UI is only a convenience).
 * req.project / req.projectRole / req.task are populated by the param handlers in
 * middleware/access.js, which have already rejected non-participants with 403/404.
 *
 *  Action                      admin  project_manager  member                         viewer
 *  create task / assign        yes    yes              no                             no
 *  edit task details           yes    yes              own assigned, limited fields   no
 *  change status (move)        yes    yes              own assigned                   no
 *  subtasks (add / toggle)     yes    yes              own assigned                   no
 *  comments                    see modules/comments (own module)
 *  delete task                 yes    yes              no                             no
 */

// Fields a Team Member may change on a task assigned to them. Everything else
// (title, priority, type, due date, assignees) is manager-controlled.
const MEMBER_EDITABLE_FIELDS = ["description", "labels", "storyPoints"];
const ALL_EDITABLE_FIELDS = [
  "title",
  "description",
  "priority",
  "type",
  "dueDate",
  "storyPoints",
  "assignees",
  "labels",
];

const isAssignee = (task, user) => task.assignees.some((a) => a.toString() === user._id.toString());

// Managers may act on any task in their project; members only on tasks assigned to them.
const canWorkOnTask = (req) =>
  MANAGERS.includes(req.projectRole) ||
  (req.projectRole === "member" && isAssignee(req.task, req.user));

/*
 * Optimistic concurrency control
 * ------------------------------
 * Every state-changing write to an existing task (update, move, subtask toggle, delete)
 * must carry the `version` the client last saw (body.version, or ?version= for DELETE).
 *   - missing/invalid version  -> 428 Precondition Required
 *   - version already stale    -> 409 Conflict (early check, avoids pointless work)
 *   - lost a race              -> 409 Conflict (the real guarantee: the write is a single
 *                                 findOneAndUpdate filtered on {_id, version}, so MongoDB
 *                                 applies it only if nobody else wrote in between)
 * The 409 body carries the latest task so the UI can show what changed.
 */
const readVersion = (req) => {
  const raw = req.body?.version ?? req.query?.version;
  const v = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return Number.isInteger(v) && v >= 0 ? v : null;
};

const versionRequired = (res) =>
  res.status(428).json({
    code: "VERSION_REQUIRED",
    message: "The task's current version is required. Reload the task and try again.",
  });

// Matches a specific version; tasks created before versioning existed count as version 0.
const atVersion = (id, version) => ({
  _id: id,
  isDeleted: false,
  ...(version === 0 ? { $or: [{ version: 0 }, { version: { $exists: false } }] } : { version }),
});

const POPULATE = [
  { path: "assignees", select: "name email avatar" },
  { path: "createdBy", select: "name email" },
  { path: "comments.author", select: "name avatar" },
];

const conflict = async (res, taskId) => {
  const latest = await Task.findOne({ _id: taskId, isDeleted: false }).populate(POPULATE);
  if (!latest) {
    return res.status(404).json({ code: "TASK_GONE", message: "This task was deleted by someone else." });
  }
  return res.status(409).json({
    code: "VERSION_CONFLICT",
    message: "This task was changed by someone else since you opened it. Review the latest version.",
    currentVersion: latest.version,
    task: latest,
  });
};

// Assignees must be real, active people who can actually do work in this project: project
// participants who are not Viewers (global or project-level) and not deactivated. Ids that
// are already assigned are left alone, so re-saving a task never fails because an existing
// assignee was later deactivated or moved to a read-only role.
const parseAssignees = async (project, raw, existing = []) => {
  if (!Array.isArray(raw)) return { error: "assignees must be an array of user ids" };
  const unique = [...new Set(raw.map(String))];
  const already = new Set(existing.map(String));
  const allowed = new Set(projectParticipantIds(project));
  const readOnly = new Set(project.members.filter((m) => m.role === "viewer").map((m) => m.user.toString()));
  const added = [];
  for (const id of unique) {
    if (!mongoose.isValidObjectId(id) || !allowed.has(id)) {
      return { error: "Every assignee must be a member of this project" };
    }
    if (!already.has(id)) {
      if (readOnly.has(id)) return { error: "Viewers can't be assigned tasks" };
      added.push(id);
    }
  }
  if (added.length) {
    const eligible = await User.find({
      _id: { $in: added },
      role: { $ne: "viewer" },
      isActive: { $ne: false },
    }).select("_id");
    if (eligible.length !== added.length) {
      return { error: "Assignees must be active, non-viewer users" };
    }
  }
  return { ids: unique };
};

// Compare an incoming value with what is stored, so a member re-submitting the full edit
// form (with unchanged restricted fields) is not rejected — only actual changes are.
const unchanged = (field, incoming, current) => {
  switch (field) {
    case "assignees":
      return (
        Array.isArray(incoming) &&
        JSON.stringify([...incoming].map(String).sort()) ===
          JSON.stringify(current.map((a) => a.toString()).sort())
      );
    case "dueDate": {
      const a = incoming ? new Date(incoming).getTime() : null;
      const b = current ? new Date(current).getTime() : null;
      return a === b;
    }
    case "labels":
      return JSON.stringify(incoming) === JSON.stringify(current);
    default:
      return incoming === current;
  }
};

const normalizeSubtasks = (subtasks) =>
  (Array.isArray(subtasks) ? subtasks : [])
    .map((s) => (typeof s === "string" ? { title: s } : { title: s?.title, done: !!s?.done }))
    .filter((s) => typeof s.title === "string" && s.title.trim());

// @route POST /api/projects/:projectId/tasks
export const createTask = async (req, res) => {
  try {
    if (!MANAGERS.includes(req.projectRole)) {
      return forbidden(res, "only admins and project managers can create tasks");
    }
    const project = req.project;

    const { title, description, columnId, priority, type, dueDate, storyPoints, labels, subtasks } =
      req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Task title is required" });
    }

    const targetColumn = columnId || project.columns[0]?.id;
    if (!project.columns.some((c) => c.id === targetColumn)) {
      return res.status(400).json({ message: "Unknown column for this project" });
    }

    let assignees = [];
    if (req.body.assignees !== undefined) {
      const parsed = await parseAssignees(project, req.body.assignees);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      assignees = parsed.ids;
    }

    const lastTask = await Task.findOne({ project: project._id, columnId: targetColumn, isDeleted: false })
      .sort({ order: -1 })
      .select("order");

    const task = await Task.create({
      project: project._id,
      title,
      description,
      columnId: targetColumn,
      order: lastTask ? lastTask.order + 1 : 0,
      priority,
      type,
      dueDate,
      storyPoints,
      assignees,
      labels,
      subtasks: normalizeSubtasks(subtasks),
      createdBy: req.user._id,
    });

    res.status(201).json(task);
  } catch (err) {
    serverError(res, "Failed to create task", err);
  }
};

// @route GET /api/projects/:projectId/tasks  (supports ?assignee=&priority=&dueBefore=&dueAfter=)
export const getTasks = async (req, res) => {
  try {
    // Listing is only meaningful (and only access-checked) inside a project.
    if (!req.params.projectId) {
      return res.status(400).json({ message: "Use /api/projects/:projectId/tasks to list tasks" });
    }
    const { assignee, priority, dueBefore, dueAfter, type, label } = req.query;

    const filter = { project: req.project._id, isDeleted: false };
    // Coerce to strings so query-string objects (?assignee[$ne]=x) can't inject operators.
    if (assignee) filter.assignees = String(assignee);
    if (priority) filter.priority = String(priority);
    if (type) filter.type = String(type);
    if (label) filter.labels = String(label);
    if (dueBefore || dueAfter) {
      filter.dueDate = {};
      if (dueBefore) filter.dueDate.$lte = new Date(String(dueBefore));
      if (dueAfter) filter.dueDate.$gte = new Date(String(dueAfter));
    }

    const tasks = await Task.find(filter)
      .populate("assignees", "name email avatar")
      .populate("createdBy", "name email")
      .sort({ columnId: 1, order: 1 });

    res.json(tasks);
  } catch (err) {
    serverError(res, "Failed to fetch tasks", err);
  }
};

// @route PUT /api/tasks/:id   (also PUT /api/projects/:projectId/tasks/:id)
// Body: any editable fields + `version` (required).
export const updateTask = async (req, res) => {
  try {
    if (!canWorkOnTask(req)) {
      return forbidden(res, "you can only edit tasks assigned to you");
    }
    const task = req.task;

    const version = readVersion(req);
    if (version === null) return versionRequired(res);
    if ((task.version ?? 0) !== version) return conflict(res, task._id);

    const submitted = ALL_EDITABLE_FIELDS.filter((f) => req.body[f] !== undefined);

    if (req.projectRole === "member") {
      const blocked = submitted.filter(
        (f) => !MEMBER_EDITABLE_FIELDS.includes(f) && !unchanged(f, req.body[f], task[f])
      );
      if (blocked.length) {
        return forbidden(
          res,
          `team members cannot change: ${blocked.join(", ")}. Allowed fields: ${MEMBER_EDITABLE_FIELDS.join(", ")}`
        );
      }
    }

    const writable = MANAGERS.includes(req.projectRole) ? ALL_EDITABLE_FIELDS : MEMBER_EDITABLE_FIELDS;
    const set = {};
    writable
      .filter((f) => req.body[f] !== undefined)
      .forEach((f) => {
        set[f] = req.body[f];
      });

    if (set.assignees !== undefined) {
      const parsed = await parseAssignees(req.project, set.assignees, task.assignees);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      set.assignees = parsed.ids;
    }

    if (!Object.keys(set).length) return res.json(task); // nothing to change, nothing to bump

    const updated = await Task.findOneAndUpdate(
      atVersion(task._id, version),
      { $set: set, $inc: { version: 1 } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict(res, task._id); // someone else won the race
    res.json(updated);
  } catch (err) {
    serverError(res, "Failed to update task", err);
  }
};

// @route PUT /api/tasks/:id/move  (drag-and-drop: change column and/or order)
// Body: { columnId, order, version }
export const moveTask = async (req, res) => {
  try {
    if (!canWorkOnTask(req)) {
      return forbidden(res, "you can only change the status of tasks assigned to you");
    }
    const version = readVersion(req);
    if (version === null) return versionRequired(res);
    if ((req.task.version ?? 0) !== version) return conflict(res, req.task._id);

    const { columnId, order } = req.body;
    if (!req.project.columns.some((c) => c.id === columnId)) {
      return res.status(400).json({ message: "Unknown column for this project" });
    }
    if (typeof order !== "number" || !Number.isFinite(order)) {
      return res.status(400).json({ message: "order must be a number" });
    }

    const updated = await Task.findOneAndUpdate(
      atVersion(req.task._id, version),
      { $set: { columnId, order }, $inc: { version: 1 } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict(res, req.task._id);
    res.json(updated);
  } catch (err) {
    serverError(res, "Failed to move task", err);
  }
};

// @route DELETE /api/tasks/:id?version=N
export const deleteTask = async (req, res) => {
  try {
    if (!MANAGERS.includes(req.projectRole)) {
      return forbidden(res, "only admins and project managers can delete tasks");
    }
    const version = readVersion(req);
    if (version === null) return versionRequired(res);
    if ((req.task.version ?? 0) !== version) return conflict(res, req.task._id);

    const deleted = await Task.findOneAndUpdate(
      atVersion(req.task._id, version),
      { $set: { isDeleted: true }, $inc: { version: 1 } },
      { new: true }
    );
    if (!deleted) return conflict(res, req.task._id);
    res.json({ message: "Task deleted" });
  } catch (err) {
    serverError(res, "Failed to delete task", err);
  }
};

// @route POST /api/tasks/:id/subtasks
// Append-only: a single atomic $push, so it can't clobber (or be clobbered by) other edits
// and does not need — or bump — the task version.
export const addSubtask = async (req, res) => {
  try {
    if (!canWorkOnTask(req)) {
      return forbidden(res, "you can only edit tasks assigned to you");
    }
    const { title } = req.body;
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Subtask title is required" });
    }

    const updated = await Task.findOneAndUpdate(
      { _id: req.task._id, isDeleted: false },
      { $push: { subtasks: { title: title.trim(), done: false } } },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "Task not found" });
    res.json(updated);
  } catch (err) {
    serverError(res, "Failed to add subtask", err);
  }
};

// @route PUT /api/tasks/:id/subtasks/:subtaskId   Body: { version }
// Toggling reads the current value, so it is version-guarded. It sets only that one
// subtask's `done` (positional $), so it can't overwrite a concurrently appended subtask.
export const toggleSubtask = async (req, res) => {
  try {
    if (!canWorkOnTask(req)) {
      return forbidden(res, "you can only edit tasks assigned to you");
    }
    const version = readVersion(req);
    if (version === null) return versionRequired(res);
    if ((req.task.version ?? 0) !== version) return conflict(res, req.task._id);

    const subtask = req.task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ message: "Subtask not found" });

    const updated = await Task.findOneAndUpdate(
      { ...atVersion(req.task._id, version), "subtasks._id": subtask._id },
      { $set: { "subtasks.$.done": !subtask.done }, $inc: { version: 1 } },
      { new: true }
    );
    if (!updated) return conflict(res, req.task._id);
    res.json(updated);
  } catch (err) {
    serverError(res, "Failed to update subtask", err);
  }
};

// @route GET /api/tasks/:id  (also GET /api/projects/:projectId/tasks/:id)
export const getTask = async (req, res) => {
  try {
    await req.task.populate(POPULATE);
    res.json(req.task);
  } catch (err) {
    serverError(res, "Failed to fetch task", err);
  }
};

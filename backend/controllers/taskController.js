import Task from "../models/Task.js";
import Project from "../models/Project.js";

// @route POST /api/projects/:projectId/tasks
export const createTask = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await Project.findById(projectId);
    if (!project || project.isDeleted) return res.status(404).json({ message: "Project not found" });

    const {
      title,
      description,
      columnId,
      priority,
      type,
      dueDate,
      storyPoints,
      assignees,
      labels,
      subtasks,
    } = req.body;

    if (!title) return res.status(400).json({ message: "Task title is required" });

    const targetColumn = columnId || project.columns[0].id;
    const lastTask = await Task.findOne({ project: projectId, columnId: targetColumn })
      .sort({ order: -1 })
      .select("order");

    const task = await Task.create({
      project: projectId,
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
      subtasks: (subtasks || []).map((s) => (typeof s === "string" ? { title: s } : s)),
      createdBy: req.user._id,
    });

    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to create task", error: err.message });
  }
};

// @route GET /api/projects/:projectId/tasks  (supports ?assignee=&priority=&dueBefore=&dueAfter=)
export const getTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { assignee, priority, dueBefore, dueAfter, type, label } = req.query;

    const filter = { project: projectId, isDeleted: false };
    if (assignee) filter.assignees = assignee;
    if (priority) filter.priority = priority;
    if (type) filter.type = type;
    if (label) filter.labels = label;
    if (dueBefore || dueAfter) {
      filter.dueDate = {};
      if (dueBefore) filter.dueDate.$lte = new Date(dueBefore);
      if (dueAfter) filter.dueDate.$gte = new Date(dueAfter);
    }

    const tasks = await Task.find(filter)
      .populate("assignees", "name email avatar")
      .populate("createdBy", "name email")
      .sort({ columnId: 1, order: 1 });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch tasks", error: err.message });
  }
};

// @route PUT /api/tasks/:id
export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task || task.isDeleted) return res.status(404).json({ message: "Task not found" });

    const fields = [
      "title",
      "description",
      "priority",
      "type",
      "dueDate",
      "storyPoints",
      "assignees",
      "labels",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) task[f] = req.body[f];
    });

    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to update task", error: err.message });
  }
};

// @route PUT /api/tasks/:id/move  (drag-and-drop: change column and/or order)
export const moveTask = async (req, res) => {
  try {
    const { columnId, order } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task || task.isDeleted) return res.status(404).json({ message: "Task not found" });

    task.columnId = columnId;
    task.order = order;
    await task.save();

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to move task", error: err.message });
  }
};

// @route DELETE /api/tasks/:id
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    task.isDeleted = true;
    await task.save();
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete task", error: err.message });
  }
};

// @route POST /api/tasks/:id/subtasks
export const addSubtask = async (req, res) => {
  try {
    const { title } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    task.subtasks.push({ title, done: false });
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to add subtask", error: err.message });
  }
};

// @route PUT /api/tasks/:id/subtasks/:subtaskId
export const toggleSubtask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ message: "Subtask not found" });

    subtask.done = !subtask.done;
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to update subtask", error: err.message });
  }
};

// @route POST /api/tasks/:id/comments
export const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    task.comments.push({ author: req.user._id, text });
    await task.save();
    await task.populate("comments.author", "name avatar");
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to add comment", error: err.message });
  }
};

// @route GET /api/tasks/:id  (also GET /api/projects/:projectId/tasks/:id)
export const getTask = async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, isDeleted: false })
      .populate("assignees", "name email avatar")
      .populate("createdBy", "name email")
      .populate("comments.author", "name avatar");
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json(task);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch task", error: err.message });
  }
};

// Single place that wires every feature module into the Express app.
// Each module owns its model, controller and routes; add a new module here to expose it.
import authRoutes from "./auth/auth.routes.js";
import userRoutes from "./users/user.routes.js";
import projectRoutes from "./projects/project.routes.js";
import taskRoutes from "./tasks/task.routes.js";

export const registerRoutes = (app) => {
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/projects", projectRoutes); // also serves /api/projects/:projectId/tasks
  app.use("/api/tasks", taskRoutes); // top-level task access: /api/tasks/:id
};

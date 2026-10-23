import express from "express";
import cors from "cors";
import { registerRoutes } from "./modules/index.js";
import { notFound, errorHandler } from "./shared/middleware/errorHandler.js";

// Builds the Express app without starting a server or touching the database,
// so it can be reused by server.js and by tests.
export const createApp = () => {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  registerRoutes(app);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

export default createApp;

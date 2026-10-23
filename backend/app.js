import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { registerRoutes } from "./modules/index.js";
import { notFound, errorHandler } from "./shared/middleware/errorHandler.js";

// Builds the Express app without starting a server or touching the database,
// so it can be reused by server.js and by tests.
export const createApp = () => {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
  app.use(express.json({ limit: "5mb" }));

  // Liveness + database state. 503 when MongoDB is not connected so load balancers can tell.
  app.get("/api/health", (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ status: connected ? "ok" : "degraded", database: connected ? "connected" : "disconnected" });
  });

  registerRoutes(app);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

export default createApp;

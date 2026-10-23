import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Verifies the access token and attaches the user to req.user
export const protect = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, token invalid or expired" });
  }
};

// Restrict route to specific roles, e.g. authorize("admin", "project_manager")
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };
};

// Viewers are read-only: any request that is not GET/HEAD/OPTIONS is rejected with 403.
export const blockViewerWrites = (req, res, next) => {
  if (req.user?.role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return res.status(403).json({ message: "Forbidden: viewers have read-only access" });
  }
  next();
};

import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateToken.js";

// @route POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    // Only allow "admin" role to be self-assigned if no admin exists yet (first user bootstrap);
    // otherwise default everyone to "member" for safety.
    const adminCount = await User.countDocuments({ role: "admin" });
    let assignedRole = "member";
    if (adminCount === 0) assignedRole = "admin";
    else if (role === "project_manager") assignedRole = "project_manager";

    const user = await User.create({ name, email, password, role: assignedRole });

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    res.status(201).json({
      user: user.toSafeObject(),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
};

// @route POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // "Remember me" -> longer-lived refresh token stored; otherwise still issued but
    // the frontend can choose to store it in sessionStorage instead of localStorage.
    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      user: user.toSafeObject(),
      accessToken,
      refreshToken,
      rememberMe: !!rememberMe,
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
};

// @route POST /api/auth/refresh
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const accessToken = generateAccessToken(user._id, user.role);
    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ message: "Refresh token invalid or expired" });
  }
};

// @route POST /api/auth/logout
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await User.findOneAndUpdate({ refreshToken }, { refreshToken: null });
    }
    res.json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ message: "Logout failed", error: err.message });
  }
};

// @route GET /api/auth/me
export const getMe = async (req, res) => {
  res.json({ user: req.user.toSafeObject ? req.user.toSafeObject() : req.user });
};

// NOTE: Email verification, password-reset-via-email, and social login (Google/GitHub)
// are not wired up in this scaffold since they need a real mail provider + OAuth app
// credentials. Structure is ready for it: add a `resetToken`/`resetExpires` field to
// User, a nodemailer transport, and /api/auth/forgot-password + /reset-password routes.

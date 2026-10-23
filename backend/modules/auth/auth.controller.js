import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../users/user.model.js";
import { googleOAuth } from "../../shared/utils/google.js";
import { generateAccessToken, generateRefreshToken } from "../../shared/utils/token.js";
import { sendEmail, sendEmailQuietly } from "../../shared/email/emailjs.js";
import { otpEmail, welcomeEmail, passwordChangedEmail, emailVerifiedEmail } from "../../shared/email/templates.js";
import { OTP_TTL_MINUTES, checkOtp, issueOtp, onCooldown } from "../../shared/utils/otp.js";

// @route POST /api/auth/register
export const register = async (req, res) => {
  try {
    // NOTE: any `role` sent by the client is deliberately ignored. Roles above "viewer"
    // are only granted by an admin via PUT /api/users/:id/role.
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    const existing = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    // All newly registered users default to "viewer"
    // The admin role is configured directly in the database by administrator
    const assignedRole = "viewer";

    const user = await User.create({ name, email, password, role: assignedRole });
    sendEmailQuietly({ to: user.email, ...welcomeEmail({ name: user.name }) });

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

    const user = await User.findOne({ email: String(email ?? "").trim().toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (user.isActive === false) {
      return res
        .status(403)
        .json({ message: "Your account has been deactivated", code: "ACCOUNT_DEACTIVATED" });
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

// ---- Google OAuth (authorization-code flow) -------------------------------------------
const clientUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
const toLogin = (res, message) => res.redirect(`${clientUrl()}/login?error=${encodeURIComponent(message)}`);
const cookieValue = (req, name) =>
  (req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];

// @route GET /api/auth/google  -> redirects the browser to Google's consent screen
export const googleStart = (req, res) => {
  if (!googleOAuth.isConfigured()) {
    return toLogin(res, "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env");
  }
  const state = crypto.randomBytes(16).toString("hex");
  // The state is also kept in a short-lived cookie so only the browser that started the flow can finish it.
  res.cookie("g_state", state, { httpOnly: true, sameSite: "lax", maxAge: 10 * 60 * 1000, path: "/api/auth/google" });
  res.redirect(googleOAuth.authUrl(state));
};

// @route GET /api/auth/google/callback  -> Google redirects here with ?code&state
// Signs in an existing account (matched by Google id, then verified email) or creates a new
// "viewer" account, then sends the browser back to the SPA with the tokens in the URL fragment.
export const googleCallback = async (req, res) => {
  try {
    if (!googleOAuth.isConfigured()) return toLogin(res, "Google sign-in is not configured");
    const { code, state, error } = req.query;
    if (error) return toLogin(res, "Google sign-in was cancelled");
    const expected = cookieValue(req, "g_state");
    res.clearCookie("g_state", { path: "/api/auth/google" });
    if (!code || !state || !expected || state !== expected) return toLogin(res, "Google sign-in failed: invalid state");

    let payload;
    try {
      payload = await googleOAuth.profileFromCode(String(code));
    } catch {
      return toLogin(res, "Google sign-in failed: couldn't verify your Google account");
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return toLogin(res, "Your Google email address is not verified");
    }
    const email = String(payload.email).trim().toLowerCase();

    let user = (await User.findOne({ googleId: payload.sub })) || (await User.findOne({ email }));
    if (user) {
      if (user.isActive === false) return toLogin(res, "Your account has been deactivated");
      if (!user.googleId) user.googleId = payload.sub; // link on first Google sign-in
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
    } else {
      user = new User({
        name: payload.name || email.split("@")[0],
        email,
        password: crypto.randomBytes(32).toString("hex"), // no local password for Google accounts
        role: "viewer", // same default as registration; admins promote
        googleId: payload.sub,
        avatar: payload.picture || "",
      });
    }

    const isNewUser = user.isNew;
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();
    if (isNewUser) sendEmailQuietly({ to: user.email, ...welcomeEmail({ name: user.name }) });

    const frag = new URLSearchParams({ accessToken, refreshToken }).toString();
    res.redirect(`${clientUrl()}/auth/google/callback#${frag}`);
  } catch (err) {
    toLogin(res, "Google sign-in failed");
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
    if (user.isActive === false) {
      return res
        .status(403)
        .json({ message: "Your account has been deactivated", code: "ACCOUNT_DEACTIVATED" });
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

// ---- Email OTP flows (EmailJS) --------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD_CODE = "That code is invalid or has expired. Request a new one.";

// @route POST /api/auth/forgot-password  { email }
// Always answers the same way so it can't be used to discover which emails have accounts.
export const forgotPassword = async (req, res) => {
  const generic = { message: "If an account exists for that email, we've sent a 6-digit code to it." };
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: "Enter a valid email address" });

    const user = await User.findOne({ email });
    if (user && user.isActive !== false && !onCooldown(user)) {
      const otp = await issueOtp(user, "reset_password");
      try {
        await sendEmail({ to: user.email, ...otpEmail({ name: user.name, otp, purpose: "reset_password", minutes: OTP_TTL_MINUTES }) });
      } catch (err) {
        console.error(`[email] reset code for ${user.email} failed: ${err.message}`);
      }
    }
    res.json(generic);
  } catch (err) {
    res.status(500).json({ message: "Couldn't start the password reset", error: err.message });
  }
};

// Step 2 -> 3 hand-off: a short-lived token proving the emailed code was verified.
// It is bound to the current password hash, so it stops working as soon as the password changes.
const fingerprint = (user) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(user.password)).digest("hex").slice(0, 16);
const signResetToken = (user) =>
  jwt.sign({ id: user._id, fp: fingerprint(user), purpose: "reset_password" }, process.env.JWT_SECRET, { expiresIn: "10m" });

// @route POST /api/auth/verify-reset-otp  { email, otp } -> { resetToken }
export const verifyResetOtp = async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const { otp } = req.body ?? {};
    if (!email || !otp) return res.status(400).json({ message: "Email and code are required" });

    const user = await User.findOne({ email });
    if (!user || user.isActive === false) return res.status(400).json({ message: BAD_CODE });

    const result = checkOtp(user, "reset_password", otp);
    await user.save(); // persists the attempt counter, or the consumed code
    if (result !== "ok") {
      return res.status(400).json({
        message: result === "locked" ? "Too many wrong attempts. Request a new code." : BAD_CODE,
      });
    }
    res.json({ message: "Code verified", resetToken: signResetToken(user) });
  } catch (err) {
    res.status(500).json({ message: "Couldn't verify the code", error: err.message });
  }
};

// @route POST /api/auth/reset-password  { resetToken, newPassword }
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body ?? {};
    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: "Reset token and new password are required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const EXPIRED = { message: "Your reset session expired. Start again.", code: "RESET_EXPIRED" };
    let decoded;
    try {
      decoded = jwt.verify(String(resetToken), process.env.JWT_SECRET);
    } catch {
      return res.status(400).json(EXPIRED);
    }
    if (decoded.purpose !== "reset_password") return res.status(400).json(EXPIRED);

    const user = await User.findById(decoded.id);
    if (!user || user.isActive === false || decoded.fp !== fingerprint(user)) return res.status(400).json(EXPIRED);

    user.password = String(newPassword); // hashed by the model's pre-save hook
    user.refreshToken = null; // sign out every existing session
    await user.save();
    sendEmailQuietly({ to: user.email, ...passwordChangedEmail({ name: user.name }) });
    res.json({ message: "Password updated. You can sign in with your new password." });
  } catch (err) {
    res.status(500).json({ message: "Couldn't reset the password", error: err.message });
  }
};

// @route POST /api/auth/send-verification  (signed in) -> emails a code to the account's address
export const sendVerification = async (req, res) => {
  try {
    const user = req.user;
    if (onCooldown(user)) {
      return res.status(429).json({ message: "A code was just sent. Wait a minute before requesting another." });
    }
    const otp = await issueOtp(user, "verify_email");
    await sendEmail({ to: user.email, ...otpEmail({ name: user.name, otp, purpose: "verify_email", minutes: OTP_TTL_MINUTES }) });
    res.json({ message: "Verification code sent" });
  } catch (err) {
    res.status(500).json({ message: "Couldn't send the verification code", error: err.message });
  }
};

// @route POST /api/auth/verify-email  { otp }  (signed in)
export const verifyEmail = async (req, res) => {
  try {
    const user = req.user;
    const result = checkOtp(user, "verify_email", req.body?.otp);
    if (result !== "ok") {
      await user.save();
      return res.status(400).json({ message: result === "locked" ? "Too many wrong attempts. Request a new code." : BAD_CODE });
    }
    user.isVerified = true;
    await user.save();
    sendEmailQuietly({ to: user.email, ...emailVerifiedEmail({ name: user.name }) });
    res.json({ message: "Email verified" });
  } catch (err) {
    res.status(500).json({ message: "Couldn't verify the email", error: err.message });
  }
};
